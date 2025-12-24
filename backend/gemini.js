const { GoogleGenerativeAI } = require('@google/generative-ai');

let jsonrepairFn = null;
try {
  // Optional dependency; improves robustness for "almost JSON" outputs.
  // Installed via backend/package.json.
  const jr = require('jsonrepair');
  jsonrepairFn = typeof jr?.jsonrepair === 'function' ? jr.jsonrepair : null;
} catch (_) {
  // ignore
}

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
  // Volvemos a un prompt más "clásico" (menos reglas) pero optimizado para estabilidad y detalle.
  const policy =
    mode === 'accurate'
      ? 'Prioriza precisión aunque tardes un poco más. Si no estás seguro, dilo en "uncertainties".'
      : mode === 'fast'
        ? 'Prioriza velocidad, pero no inventes.'
        : 'Balancea precisión y velocidad. No inventes.';

  const base =
    'Devuelve SOLO un JSON válido (sin markdown, sin texto extra) con este esquema:\n' +
    '{\n' +
    '  "summary": string,\n' +
    '  "detailed": string,\n' +
    '  "points_of_interest": string[],\n' +
    '  "uncertainties": string[],\n' +
    '  "confidence": number\n' +
    '}\n\n' +
    'Reglas:\n' +
    '- confidence debe estar entre 0 y 1\n' +
    '- summary debe ser 2-3 frases\n' +
    '- detailed debe ser detallado (6-10 frases) y describir el entorno, no solo el objeto principal\n' +
    '- points_of_interest: 5-8 items\n' +
    '- uncertainties: lista vacía si estás seguro\n' +
    '- Incluye contexto del entorno: disposición del espacio, objetos secundarios, iluminación/ambiente, texto visible y posibles riesgos/obstáculos\n' +
    '- Si usas comillas dobles dentro de strings, escápalas con \\"\n\n';

  const extra = userPrompt?.trim() ? `Extra: ${userPrompt.trim()}\n` : '';
  const task = 'Tarea: describe claramente la imagen y el entorno. Incluye puntos de interés y posibles incertidumbres.';
  return `${base}${policy}\n${extra}${task}`;
}

function tryParseJson(text) {
  function stripCodeFences(input) {
    let s = String(input ?? '').trim();

    // If the model returns fenced blocks (```json ... ```), prefer the first fenced block body.
    const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) return fenceMatch[1];

    // Handle incomplete fences (opening ```json but missing closing ```).
    if (s.startsWith('```')) {
      // Drop the first line (``` or ```json)
      const nl = s.indexOf('\n');
      s = nl >= 0 ? s.slice(nl + 1) : s.replace(/^```(?:json)?/i, '');
      s = s.replace(/```\s*$/i, '');
    }

    return s;
  }

  function sanitizeJsonish(input) {
    let s = String(input ?? '').trim();

    // Some models output a leading language tag without fences: "json\n{...}"
    s = s.replace(/^\s*json\s*[\r\n]+/i, '');

    // Replace smart quotes.
    s = s
      .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
      .replace(/[\u2018\u2019\u2032]/g, "'");

    // Fix common invalid key quoting: ""summary"": -> "summary":
    s = s.replace(/""\s*([A-Za-z0-9_]+)\s*""\s*:/g, '"$1":');

    return s;
  }

  // Gemini a veces envía texto extra o envuelve el JSON en markdown. Lo limpiamos.
  const cleaned0 = stripCodeFences(text).trim().replace(/^`+/, '').replace(/`+$/, '').trim();
  const cleaned = sanitizeJsonish(cleaned0);

  // Intento 1: extraer el primer objeto JSON por llaves.
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = sanitizeJsonish(cleaned.slice(firstBrace, lastBrace + 1));
    try {
      return JSON.parse(slice);
    } catch (_) {
      // Try repair for common issues like unterminated strings / raw newlines.
      if (jsonrepairFn) {
        try {
          return JSON.parse(jsonrepairFn(slice));
        } catch (_) {
          // fallthrough
        }
      }
    }
  }

  // Intento 2: parse directo (por si ya es JSON puro).
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Último intento: sanitizar de nuevo / reparar y reintentar.
    const retry = sanitizeJsonish(cleaned);
    try {
      return JSON.parse(retry);
    } catch (_) {
      if (jsonrepairFn) {
        return JSON.parse(jsonrepairFn(retry));
      }
      throw e;
    }
  }
}

async function describeWithGemini({ apiKey, model, mode, imageBase64, imageMimeType, userPrompt }) {
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
  if (!imageBase64) throw new Error('Missing imageBase64');

  const genAI = new GoogleGenerativeAI(apiKey);
  const requestedModelName = normalizeModelName(model || 'gemini-2.0-flash');
  const maxOutputTokensEnv = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? NaN);
  // Defaults: suficiente para "detailed" sin exagerar.
  const defaultMaxOutputTokens = mode === 'fast' ? 700 : mode === 'accurate' ? 1400 : 1100;
  const maxOutputTokens = Number.isFinite(maxOutputTokensEnv) && maxOutputTokensEnv > 0 ? maxOutputTokensEnv : defaultMaxOutputTokens;

  function createModel(modelName, { useJsonMimeType }) {
    const generationConfig = {
      temperature: 0.2,
      maxOutputTokens,
    };
    if (useJsonMimeType) {
      // Cuando el modelo lo soporta, esto reduce drásticamente JSON inválido/truncado.
      generationConfig.responseMimeType = 'application/json';
    }
    return genAI.getGenerativeModel({
      model: modelName,
      generationConfig,
    });
  }

  let geminiModel = createModel(requestedModelName, { useJsonMimeType: true });

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

    // Si responseMimeType no es soportado por ese modelo, reintenta sin JSON mime type una vez.
    if (/responsemimetype|response_mime_type|response mime type|unknown field|invalid/i.test(msg)) {
      try {
        geminiModel = createModel(normalizeModelName(model || requestedModelName) || requestedModelName, { useJsonMimeType: false });
        result = await runGenerate();
      } catch (_) {
        // keep handling below
      }
    }

    // If model name is invalid for this API version, auto-discover a valid one and retry once.
    if (/404 Not Found/i.test(msg) && /ListModels|list models|models\//i.test(msg)) {
      const fallbackModelName = await resolveModelName({ apiKey, desiredModel: requestedModelName });
      if (fallbackModelName && fallbackModelName !== requestedModelName) {
        geminiModel = createModel(fallbackModelName, { useJsonMimeType: true });
        result = await runGenerate();
      } else {
        throw e;
      }
    } else {
      if (!result) throw e;
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
