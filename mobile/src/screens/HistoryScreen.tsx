import { useRef, useState } from 'react';
import { Button, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { assertEnv } from '../config/env';
import { describeEnvironment } from '../services/descriptionApi';
import type { DescribeRequest } from '../types/description';

export function HistoryScreen() {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [resultLatencyMs, setResultLatencyMs] = useState<number | null>(null);
  const [resultConfidence, setResultConfidence] = useState<number | null>(null);
  const [resultModel, setResultModel] = useState<string | null>(null);
  const [resultDebug, setResultDebug] = useState<string | null>(null);
  const [resultBackendMs, setResultBackendMs] = useState<number | null>(null);

  async function openCamera(): Promise<void> {
    setError(null);

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError('Permiso de cámara denegado');
        return;
      }
    }

    setCameraOpen(true);
  }

  async function takePhoto(): Promise<void> {
    setBusy(true);
    setError(null);
    setResultText(null);
    setResultLatencyMs(null);
    setResultConfidence(null);

    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 0.5, base64: true, exif: false });
      if (!pic?.uri) throw new Error('No se pudo capturar la foto');
      setPhotoUri(pic.uri);
      setPhotoBase64(typeof pic.base64 === 'string' ? pic.base64 : null);
      setCameraOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendToAi(): Promise<void> {
    setBusy(true);
    setError(null);
    setResultText(null);
    setResultLatencyMs(null);
    setResultConfidence(null);
    setResultModel(null);
    setResultDebug(null);
    setResultBackendMs(null);

    try {
      assertEnv();
      if (!photoBase64) throw new Error('No hay imagen en base64. Toma otra foto.');

      const capturedAtIso = new Date().toISOString();

      const payload: DescribeRequest = {
        mode: 'balanced',
        sensors: { capturedAtIso },
        imageBase64: photoBase64,
        imageMimeType: 'image/jpeg',
        prompt:
          'Describe el entorno de la foto en español. Sé claro y no inventes. Incluye puntos de interés e incertidumbres si las hay. Agrega detalles útiles: objetos, disposición del espacio, iluminación/ambiente, texto visible y posibles riesgos/obstáculos.',
      };

      const t0 = globalThis.performance?.now?.() ?? Date.now();
      const r = await describeEnvironment(payload);
      const t1 = globalThis.performance?.now?.() ?? Date.now();

      setResultLatencyMs(Math.max(0, Math.round(t1 - t0)));
      setResultText(r.description);
      setResultConfidence(typeof r.confidence === 'number' ? r.confidence : null);
      setResultModel(r.model?.name ? `${r.model.name}${r.model.version ? ` (${r.model.version})` : ''}` : null);
      const debugAny = (r as any)?.debug;
      const backendMs = debugAny?.timing?.durationMs;
      if (typeof backendMs === 'number' && Number.isFinite(backendMs)) setResultBackendMs(backendMs);
      if (debugAny?.geminiError) setResultDebug(String(debugAny.geminiError));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (cameraOpen) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" pictureSize="640x480" />
        <View style={styles.cameraControls}>
          <Button title={busy ? 'Tomando…' : 'Tomar foto'} onPress={takePhoto} disabled={busy} />
          <Button title="Cerrar" onPress={() => setCameraOpen(false)} disabled={busy} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Descripción detallada</Text>
      <Text style={styles.text}>
        Aquí irán las descripciones anteriores, con métricas (latencia, confianza, modo).
      </Text>

      <View style={styles.block}>
        <Button title="Abrir cámara" onPress={openCamera} />
        <Text style={styles.hint}>Usa esto para capturar una foto y luego enviarla a la IA.</Text>
      </View>

      {error ? (
        <View style={styles.block}>
          <Text style={styles.label}>Error</Text>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      {photoUri ? (
        <View style={styles.block}>
          <Text style={styles.label}>Última foto</Text>
          <Image source={{ uri: photoUri }} style={styles.preview} />
          <View style={styles.row}>
            <Button title={busy ? 'Enviando…' : 'Enviar a IA'} onPress={sendToAi} disabled={busy} />
            <Button
              title="Borrar"
              onPress={() => {
                setPhotoUri(null);
                setPhotoBase64(null);
                setResultText(null);
                setResultLatencyMs(null);
                setResultConfidence(null);
                setError(null);
              }}
              disabled={busy}
            />
          </View>
        </View>
      ) : null}

      {resultText ? (
        <View style={styles.block}>
          <Text style={styles.label}>Resultado (IA)</Text>
          <Text style={styles.text}>{resultText}</Text>
          <Text style={styles.hint}>
            Latencia total (móvil): {resultLatencyMs ?? '—'} ms · Backend: {resultBackendMs ?? '—'} ms · Confianza: {resultConfidence ?? '—'}
          </Text>
          {resultModel ? <Text style={styles.hint}>Modelo: {resultModel}</Text> : null}
          {resultDebug ? (
            <Text style={styles.hint}>Gemini error: {resultDebug}</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.footer}>Desliza a izquierda/derecha para cambiar de módulo.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingTop: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  text: {
    marginBottom: 12,
  },
  block: {
    marginBottom: 16,
  },
  label: {
    fontWeight: '600',
    marginBottom: 6,
  },
  hint: {
    marginTop: 10,
    opacity: 0.75,
  },
  error: {
    opacity: 0.9,
  },
  preview: {
    width: '100%',
    height: 260,
    borderRadius: 10,
    backgroundColor: '#eee',
  },
  footer: {
    marginTop: 8,
    opacity: 0.7,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    padding: 12,
    gap: 10,
    backgroundColor: '#000',
  },
  row: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
});
