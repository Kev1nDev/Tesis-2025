import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';

import { assertEnv } from '../config/env';
import { describeEnvironment } from '../services/descriptionApi';

const CAPTURE_INTERVAL_MS = 1000;
const MIN_SPEAK_GAP_MS = 4500;

function safeNowMs(): number {
  return Date.now();
}

export default function GuidedWalkScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const [active, setActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<string>('');
  const [lastAnswer, setLastAnswer] = useState<string>('');

  const lastSpokenAtMs = useRef(0);

  const latestLocation = useRef<{
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  } | null>(null);

  const locationSub = useRef<Location.LocationSubscription | null>(null);

  const canUseCamera = Boolean(camPermission?.granted);

  const promptBase = useMemo(() => {
    return (
      'Estás en modo caminata guiada. Tu tarea es ayudar a una persona a caminar con seguridad.\n' +
      '- Describe SOLO lo que está justo enfrente.\n' +
      '- Prioriza obstáculos y riesgos (escalones, bordes, huecos, vehículos, personas, postes, puertas).\n' +
      '- Sé breve (1-2 frases) si no hay una pregunta.\n' +
      '- Si el usuario hace una pregunta, respóndela primero.\n'
    );
  }, []);

  function speak(text: string) {
    if (!text) return;
    Speech.stop();
    Speech.speak(text, {
      language: 'es-ES',
      rate: 0.95,
      pitch: 1.0,
    });
  }

  function maybeSpeak(text: string) {
    const now = safeNowMs();
    if (!text) return;
    if (now - lastSpokenAtMs.current < MIN_SPEAK_GAP_MS) return;
    lastSpokenAtMs.current = now;
    speak(text);
  }

  async function ensurePermissions() {
    assertEnv();

    const cam = await requestCamPermission();
    if (!cam.granted) throw new Error('Camera permission not granted');

    const loc = await Location.requestForegroundPermissionsAsync();
    if (loc.status !== 'granted') throw new Error('Location permission not granted');
  }

  async function startLocationWatch() {
    if (locationSub.current) return;
    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (pos) => {
        latestLocation.current = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy ?? undefined,
        };
      }
    );
  }

  function stopLocationWatch() {
    if (locationSub.current) {
      locationSub.current.remove();
      locationSub.current = null;
    }
  }

  function buildPrompt(userQuestion?: string) {
    const q = (userQuestion ?? '').trim();
    if (!q) return promptBase + 'No hay pregunta del usuario.';
    return promptBase + `Pregunta del usuario: ${q}`;
  }

  async function captureAndDescribe(opts?: { userQuestion?: string; forceSpeak?: boolean }) {
    if (!cameraRef.current) return;
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);

    const userQuestion = opts?.userQuestion?.trim();
    const forceSpeak = Boolean(opts?.forceSpeak);

    try {
      setStatus(userQuestion ? 'Analizando tu pregunta…' : 'Analizando entorno…');

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.35,
      });

      const loc = latestLocation.current;

      const payload = {
        imageBase64: photo.base64,
        imageMimeType: 'image/jpeg',
        sensors: {
          capturedAtIso: new Date().toISOString(),
          location: loc ?? undefined,
        },
        mode: 'fast' as const,
        prompt: buildPrompt(userQuestion),
      };

      const result = await describeEnvironment(payload);
      setLastAnswer(result.description);

      if (forceSpeak) speak(result.description);
      else maybeSpeak(result.description);

      setStatus('');
    } catch (e) {
      setStatus('Error consultando la IA');
      if (forceSpeak) speak('Error consultando la IA');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function clearIntervalIfAny() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function startGuidedMode() {
    try {
      await ensurePermissions();
      await startLocationWatch();

      setActive(true);
      setStatus('Modo caminata guiada activado');
      speak('Modo caminata guiada activado');

      await captureAndDescribe({ forceSpeak: true });

      clearIntervalIfAny();
      intervalRef.current = setInterval(() => {
        if (!busyRef.current) captureAndDescribe();
      }, CAPTURE_INTERVAL_MS);
    } catch {
      setActive(false);
      clearIntervalIfAny();
      stopLocationWatch();
      speak('No se pudieron obtener permisos.');
    }
  }

  function stopGuidedMode() {
    setActive(false);
    clearIntervalIfAny();
    stopLocationWatch();
    setStatus('Modo caminata guiada desactivado');
    Speech.stop();
    speak('Modo caminata guiada desactivado');
  }

  useEffect(() => {
    // On mount: request permissions lazily on start.
    return () => {
      clearIntervalIfAny();
      stopLocationWatch();
      Speech.stop();
    };
  }, []);

  const overlayHint = useMemo(() => {
    if (!canUseCamera) return 'Permite la cámara para iniciar.';
    if (!active) return 'Presiona INICIAR para activar caminata guiada.';
    return 'Modo activo. Puedes escribir una pregunta y enviar.';
  }, [active, canUseCamera]);

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Caminata guiada</Text>
          <Text style={styles.hint}>{overlayHint}</Text>

          {!!status && <Text style={styles.status}>{status}</Text>}

          <View style={styles.row}>
            <Pressable
              style={[styles.button, active ? styles.buttonStop : styles.buttonStart]}
              onPress={active ? stopGuidedMode : startGuidedMode}
              disabled={busy}
            >
              <Text style={styles.buttonText}>{active ? 'DETENER' : 'INICIAR'}</Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.buttonAsk]}
              onPress={() => captureAndDescribe({ userQuestion: question, forceSpeak: true })}
              disabled={!active || busy || !question.trim()}
            >
              <Text style={styles.buttonText}>PREGUNTAR</Text>
            </Pressable>
          </View>

          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Pregunta: ¿qué hay enfrente?"
            style={styles.input}
            editable={!busy}
          />

          {!!lastAnswer && (
            <Text style={styles.answer} numberOfLines={5}>
              {lastAnswer}
            </Text>
          )}

          {busy && <ActivityIndicator style={styles.spinner} />}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'black',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    opacity: 0.8,
  },
  status: {
    fontSize: 12,
    opacity: 0.9,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonStart: {
    backgroundColor: '#111',
  },
  buttonStop: {
    backgroundColor: '#111',
    opacity: 0.85,
  },
  buttonAsk: {
    backgroundColor: '#111',
  },
  buttonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 12,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 14,
  },
  answer: {
    fontSize: 13,
    lineHeight: 18,
  },
  spinner: {
    alignSelf: 'center',
    marginTop: 4,
  },
});
