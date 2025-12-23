const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

const { describeWithGemini } = require('./gemini');

const app = express();

dotenv.config({ path: path.join(__dirname, '.env') });

app.use(cors());
app.use(express.json({ limit: '15mb' }));

const PORT = Number(process.env.PORT ?? 3000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateLatencyMs(mode) {
  // Simulación simple para que puedas medir el pipeline end-to-end en la app.
  // En producción, esto sería el tiempo real de inferencia + red.
  if (mode === 'fast') return 250;
  if (mode === 'accurate') return 900;
  return 450; // balanced
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tesis-backend', ts: new Date().toISOString() });
});

app.post('/describe', async (req, res) => {
  const { sensors, mode, imageBase64, audioBase64, imageMimeType, prompt: userPrompt } = req.body ?? {};

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;

  // If Gemini key exists and we have an image, use Gemini.
  if (apiKey && typeof imageBase64 === 'string' && imageBase64.length > 0) {
    try {
      const r = await describeWithGemini({
        apiKey,
        model,
        mode,
        imageBase64,
        imageMimeType,
        userPrompt,
      });

      const location = sensors?.location;
      const locationText =
        location && typeof location.latitude === 'number' && typeof location.longitude === 'number'
          ? ` (lat ${location.latitude.toFixed(5)}, lon ${location.longitude.toFixed(5)})`
          : '';

      // Keep the mobile UI simple: expose a single description string.
      const description =
        (r.summary ? `${r.summary}\n\n` : '') +
        (r.detailed ? `${r.detailed}\n\n` : '') +
        (r.points_of_interest?.length ? `Puntos de interés:\n- ${r.points_of_interest.join('\n- ')}\n\n` : '') +
        (r.uncertainties?.length ? `Incertidumbres:\n- ${r.uncertainties.join('\n- ')}\n` : '') +
        (locationText ? `\nContexto GPS:${locationText}` : '');

      return res.json({
        description: description.trim(),
        confidence: typeof r.confidence === 'number' ? r.confidence : undefined,
        model: { name: r.model, version: 'gemini' },
      });
    } catch (e) {
      console.warn('[describe] Gemini failed, falling back to stub:', e?.message ?? e);
      // Fall through to stub.
    }
  }

  const latency = estimateLatencyMs(mode);
  await sleep(latency);

  // Heurística placeholder: si llega imagen/audio, sube un poco confianza.
  const hasImage = typeof imageBase64 === 'string' && imageBase64.length > 0;
  const hasAudio = typeof audioBase64 === 'string' && audioBase64.length > 0;

  const location = sensors?.location;
  const locationText =
    location && typeof location.latitude === 'number' && typeof location.longitude === 'number'
      ? ` (lat ${location.latitude.toFixed(5)}, lon ${location.longitude.toFixed(5)})`
      : '';

  const description =
    `Entorno estimado${locationText}: escena general (demo). ` +
    `Modo=${mode ?? 'balanced'}. ` +
    `Señales: imagen=${hasImage ? 'sí' : 'no'}, audio=${hasAudio ? 'sí' : 'no'}.`;

  const confidence = Math.max(
    0.1,
    Math.min(0.98, 0.55 + (hasImage ? 0.2 : 0) + (hasAudio ? 0.1 : 0) + (mode === 'accurate' ? 0.08 : mode === 'fast' ? -0.08 : 0))
  );

  res.json({
    description,
    confidence: Number(confidence.toFixed(2)),
    model: { name: 'stub-cloud', version: '0.1' }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[tesis-backend] listening on http://0.0.0.0:${PORT}`);
  console.log(`[tesis-backend] health:  http://localhost:${PORT}/health`);
  console.log(`[tesis-backend] describe: POST http://localhost:${PORT}/describe`);
});
