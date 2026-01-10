let jsonrepairFn = null;
try {
  const jr = require('jsonrepair');
  jsonrepairFn = typeof jr?.jsonrepair === 'function' ? jr.jsonrepair : null;
} catch (_) {
  // optional
}

function buildPrompt({ mode, userPrompt }) {
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
    '- Si usas comillas dobles dentro de strings, escápalas con \\\"\n\n';

  const extra = userPrompt?.trim() ? `Extra: ${userPrompt.trim()}\n` : '';
  const task = 'Tarea: describe claramente la imagen y el entorno. Incluye puntos de interés y posibles incertidumbres.';
  return `${base}${policy}\n${extra}${task}`;
}

function tryParseJson(text) {
  function stripCodeFences(input) {
    let s = String(input ?? '').trim();

    const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) return fenceMatch[1];

    if (s.startsWith('```')) {
      const nl = s.indexOf('\n');
      s = nl >= 0 ? s.slice(nl + 1) : s.replace(/^```(?:json)?/i, '');
      s = s.replace(/```\s*$/i, '');
    }

    return s;
  }

  function sanitizeJsonish(input) {
    let s = String(input ?? '').trim();

    s = s.replace(/^\s*json\s*[\r\n]+/i, '');

    s = s
      .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
      .replace(/[\u2018\u2019\u2032]/g, "'");

    s = s.replace(/""\s*([A-Za-z0-9_]+)\s*""\s*:/g, '"$1":');

    return s;
  }

  const cleaned0 = stripCodeFences(text).trim().replace(/^`+/, '').replace(/`+$/, '').trim();
  const cleaned = sanitizeJsonish(cleaned0);

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = sanitizeJsonish(cleaned.slice(firstBrace, lastBrace + 1));
    try {
      return JSON.parse(slice);
    } catch (_) {
      if (jsonrepairFn) {
        try {
          return JSON.parse(jsonrepairFn(slice));
        } catch (_) {
          // fallthrough
        }
      }
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
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

async function groqChatCompletion({ apiKey, body, timeoutMs }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Groq HTTP ${res.status} ${res.statusText}: ${text}`);
    }

    return JSON.parse(text);
  } catch (e) {
    if (e && typeof e === 'object' && e.name === 'AbortError') {
      throw new Error(`Groq timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function describeWithLlama({ apiKey, model, mode, imageBase64, imageMimeType, userPrompt }) {
  if (!apiKey) throw new Error('Missing GROQ_API_KEY (or LLAMA_API_KEY)');
  if (!imageBase64) throw new Error('Missing imageBase64');

  const selectedModel = String(model || 'llama-3.2-11b-vision-preview').trim();
  const maxTokensEnv = Number(process.env.GROQ_MAX_TOKENS ?? NaN);
  const defaultMaxTokens = mode === 'fast' ? 700 : mode === 'accurate' ? 1400 : 1100;
  const max_tokens = Number.isFinite(maxTokensEnv) && maxTokensEnv > 0 ? maxTokensEnv : defaultMaxTokens;

  const timeoutMs = Number(process.env.GROQ_TIMEOUT_MS ?? 25_000);

  const prompt = buildPrompt({ mode, userPrompt });
  const mime = String(imageMimeType || 'image/jpeg');
  const dataUrl = `data:${mime};base64,${imageBase64}`;

  const baseBody = {
    model: selectedModel,
    temperature: 0.2,
    max_tokens,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  };

  const t0 = process.hrtime.bigint();
  let json;

  // Try strict JSON mode first (OpenAI-compatible). If the model/provider rejects it, retry without.
  try {
    json = await groqChatCompletion({
      apiKey,
      timeoutMs,
      body: {
        ...baseBody,
        response_format: { type: 'json_object' },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/response_format|json_object|unknown field|invalid/i.test(msg)) {
      json = await groqChatCompletion({ apiKey, timeoutMs, body: baseBody });
    } else {
      throw e;
    }
  }

  const t1 = process.hrtime.bigint();
  const durationMs = Number(t1 - t0) / 1_000_000;

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Groq returned empty message content');
  }

  const parsed = tryParseJson(content);

  return {
    model: selectedModel,
    timing: { durationMs: Math.max(0, Math.round(durationMs)) },
    summary: typeof parsed?.summary === 'string' ? parsed.summary : undefined,
    detailed: typeof parsed?.detailed === 'string' ? parsed.detailed : undefined,
    points_of_interest: Array.isArray(parsed?.points_of_interest) ? parsed.points_of_interest.map(String) : [],
    uncertainties: Array.isArray(parsed?.uncertainties) ? parsed.uncertainties.map(String) : [],
    confidence: typeof parsed?.confidence === 'number' ? parsed.confidence : undefined,
  };
}

async function warmUpLlama({ apiKey, model }) {
  if (!apiKey) throw new Error('Missing GROQ_API_KEY (or LLAMA_API_KEY)');

  const selectedModel = String(model || 'llama-3.2-11b-vision-preview').trim();
  const timeoutMs = Number(process.env.GROQ_TIMEOUT_MS ?? 25_000);

  const t0 = process.hrtime.bigint();
  await groqChatCompletion({
    apiKey,
    timeoutMs,
    body: {
      model: selectedModel,
      temperature: 0,
      max_tokens: 32,
      messages: [{ role: 'user', content: 'warm up' }],
    },
  });
  const t1 = process.hrtime.bigint();
  const durationMs = Number(t1 - t0) / 1_000_000;

  return { ok: true, model: selectedModel, durationMs: Math.max(0, Math.round(durationMs)) };
}

module.exports = {
  describeWithLlama,
  warmUpLlama,
};
