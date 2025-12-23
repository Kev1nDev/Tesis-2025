const { GoogleGenerativeAI } = require('@google/generative-ai');

function buildPrompt({ mode, userPrompt }) {
  const base =
    'Eres un asistente de visión que describe escenas reales de forma precisa. ' +
    'No inventes detalles. Si no estás seguro, dilo explícitamente en "uncertainties".\n\n' +
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
    '- summary debe ser 1-3 frases\n' +
    '- detailed debe ser más completo, sin exagerar\n' +
    '- points_of_interest: 3-8 items\n' +
    '- uncertainties: lista vacía si estás seguro\n\n';

  const policy =
    mode === 'accurate'
      ? 'Prioriza precisión aunque tardes un poco más.'
      : mode === 'fast'
        ? 'Prioriza velocidad, pero no inventes.'
        : 'Balancea precisión y velocidad.';

  const task =
    (userPrompt?.trim()
      ? `Instrucción adicional del usuario: ${userPrompt.trim()}\n\n`
      : '') +
    'Tarea: describe claramente la imagen y señala puntos de interés. ' +
    'Incluye un resumen y una descripción detallada.';

  return `${base}${policy}\n\n${task}`;
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
  const geminiModel = genAI.getGenerativeModel({ model: model || 'gemini-1.5-flash' });

  const prompt = buildPrompt({ mode, userPrompt });

  const result = await geminiModel.generateContent([
    {
      inlineData: {
        data: imageBase64,
        mimeType: imageMimeType || 'image/jpeg',
      },
    },
    { text: prompt },
  ]);

  const text = result?.response?.text?.() ?? '';
  const parsed = tryParseJson(text);

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
    model: model || 'gemini-1.5-flash',
  };
}

module.exports = {
  describeWithGemini,
};
