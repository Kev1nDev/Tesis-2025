const { GoogleGenerativeAI } = require('@google/generative-ai');

let cachedResolvedModel = null;

function normalizeModelName(name) {
  if (!name) return '';
  const s = String(name).trim();
  return s.startsWith('models/') ? s.slice('models/'.length) : s;
}

async function listModels({ apiKey, apiVersion }) {
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ListModels failed (${apiVersion}): HTTP ${res.status} ${res.statusText} ${text}`);
  }
  const json = JSON.parse(text);
  const models = Array.isArray(json.models) ? json.models : [];
  return models;
}

function pickBestModel(models) {
  const candidates = models
    .map((m) => {
      const name = normalizeModelName(m?.name);
      const methods = Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods.map(String) : [];
      return { name, methods };
    })
    .filter((m) => m.name && m.methods.includes('generateContent'))
    .filter((m) => !m.name.toLowerCase().includes('embedding'));

  // Prefer multimodal/vision-ish models first.
  const preferred = candidates
    .filter((m) => /vision|multimodal/i.test(m.name))
    .concat(candidates.filter((m) => /flash/i.test(m.name)))
    .concat(candidates.filter((m) => /pro/i.test(m.name)))
    .concat(candidates);

  return preferred.length ? preferred[0].name : null;
}

async function resolveModelName({ apiKey, desiredModel }) {
  if (cachedResolvedModel) return cachedResolvedModel;

  const desired = normalizeModelName(desiredModel) || 'gemini-2.0-flash';
  // We don't validate desired here; we validate by actually calling generateContent.
  // This function is used only as a fallback after a 404.

  // Try v1beta first (matches the SDK error), then v1.
  try {
    const models = await listModels({ apiKey, apiVersion: 'v1beta' });
    const picked = pickBestModel(models);
    cachedResolvedModel = normalizeModelName(picked || desired);
    return cachedResolvedModel;
  } catch (_) {
    const models = await listModels({ apiKey, apiVersion: 'v1' });
    const picked = pickBestModel(models);
    cachedResolvedModel = normalizeModelName(picked || desired);
    return cachedResolvedModel;
  }
}

function buildPrompt({ mode, userPrompt }) {
  // Prompt compacto para reducir tokens/latencia SIN perder detalle.
  // (La latencia suele subir con prompts largos y outputs demasiado extensos.)
  const policy =
    mode === 'accurate'
      ? 'Modo: preciso. Si dudas, dilo en uncertainties.'
      : mode === 'fast'
        ? 'Modo: rápido. Sé breve pero correcto; no inventes.'
        : 'Modo: balanceado. Claro y útil; no inventes.';

  const base =
    'Describe la imagen en español. Devuelve SOLO JSON válido (sin markdown) con claves: ' +
    'summary, detailed, points_of_interest, uncertainties, confidence.\n' +
    'Formato: summary 2-3 frases; detailed 6-10 frases (detallado, sin exagerar); ' +
    'points_of_interest 5-8 ítems; uncertainties vacío si no hay dudas; confidence en [0,1].\n';

  const extra = userPrompt?.trim() ? `Extra: ${userPrompt.trim()}\n` : '';
  return `${base}${policy}\n${extra}`;
}

function tryParseJson(text) {
  // Gemini a veces envía texto extra. Intentamos recuperar el primer JSON.
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = text.slice(firstBrace, lastBrace + 1);
    return JSON.parse(slice);
  }
  return JSON.parse(text);
}

async function describeWithGemini({ apiKey, model, mode, imageBase64, imageMimeType, userPrompt }) {
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
  if (!imageBase64) throw new Error('Missing imageBase64');

  const genAI = new GoogleGenerativeAI(apiKey);
  const requestedModelName = normalizeModelName(model || 'gemini-2.0-flash');
  const maxOutputTokensEnv = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? NaN);
  // Defaults conservadores: permiten "detailed" sin generar biblias.
  const defaultMaxOutputTokens = mode === 'fast' ? 512 : mode === 'accurate' ? 1100 : 900;
  const maxOutputTokens = Number.isFinite(maxOutputTokensEnv) && maxOutputTokensEnv > 0 ? maxOutputTokensEnv : defaultMaxOutputTokens;

  let geminiModel = genAI.getGenerativeModel({
    model: requestedModelName,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens,
    },
  });

  const prompt = buildPrompt({ mode, userPrompt });

  async function runGenerate() {
    const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS ?? 25_000);
    const timeoutPromise = new Promise((_, reject) => {
      const t = setTimeout(() => {
        clearTimeout(t);
        reject(new Error(`Gemini timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const generatePromise = geminiModel.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: imageMimeType || 'image/jpeg',
        },
      },
      { text: prompt },
    ]);

    return Promise.race([generatePromise, timeoutPromise]);
  }

  let result;
  const genT0 = process.hrtime.bigint();
  try {
    result = await runGenerate();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // If model name is invalid for this API version, auto-discover a valid one and retry once.
    if (/404 Not Found/i.test(msg) && /ListModels|list models|models\//i.test(msg)) {
      const fallbackModelName = await resolveModelName({ apiKey, desiredModel: requestedModelName });
      if (fallbackModelName && fallbackModelName !== requestedModelName) {
        geminiModel = genAI.getGenerativeModel({
          model: fallbackModelName,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens,
          },
        });
        result = await runGenerate();
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }
  const genT1 = process.hrtime.bigint();

  const parseT0 = process.hrtime.bigint();

  const text = result?.response?.text?.() ?? '';
  const parsed = tryParseJson(text);
  const parseT1 = process.hrtime.bigint();

  // Normalize output.
  const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
  const detailed = typeof parsed.detailed === 'string' ? parsed.detailed : '';
  const points = Array.isArray(parsed.points_of_interest) ? parsed.points_of_interest.map(String) : [];
  const uncertainties = Array.isArray(parsed.uncertainties) ? parsed.uncertainties.map(String) : [];
  const confidenceRaw = typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : undefined;

  return {
    rawText: text,
    summary,
    detailed,
    points_of_interest: points,
    uncertainties,
    confidence,
    model: normalizeModelName(model || requestedModelName) || 'unknown',
    timing: {
      geminiMs: Math.max(0, Math.round(Number(genT1 - genT0) / 1_000_000)),
      parseMs: Math.max(0, Math.round(Number(parseT1 - parseT0) / 1_000_000)),
      maxOutputTokens,
    },
  };
}

async function warmUpGemini({ apiKey, model }) {
  if (!apiKey) return { ok: false, reason: 'missing apiKey' };
  const genAI = new GoogleGenerativeAI(apiKey);
  const requestedModelName = normalizeModelName(model || 'gemini-2.0-flash');
  let geminiModel = genAI.getGenerativeModel({
    model: requestedModelName,
    generationConfig: { temperature: 0, maxOutputTokens: 8 },
  });

  try {
    await geminiModel.generateContent([{ text: 'ping' }]);
    return { ok: true, model: requestedModelName };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const fallbackModelName = await resolveModelName({ apiKey, desiredModel: requestedModelName });
      if (fallbackModelName && fallbackModelName !== requestedModelName) {
        geminiModel = genAI.getGenerativeModel({
          model: fallbackModelName,
          generationConfig: { temperature: 0, maxOutputTokens: 8 },
        });
        await geminiModel.generateContent([{ text: 'ping' }]);
        return { ok: true, model: fallbackModelName, note: 'resolved model' };
      }
    } catch (_) {
      // ignore
    }
    return { ok: false, reason: msg };
  }
}

module.exports = {
  describeWithGemini,
  warmUpGemini,
};
