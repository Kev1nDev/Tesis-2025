import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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

  const [status, setStatus] = useState<string>('');

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

  function buildPrompt() {
    return promptBase + 'No hay pregunta del usuario.';
  }

  async function captureAndDescribe(opts?: { forceSpeak?: boolean }) {
    if (!cameraRef.current) return;
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);

    const forceSpeak = Boolean(opts?.forceSpeak);

    try {
      setStatus('Analizando entorno…');

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
        prompt: buildPrompt(),
      };

      const result = await describeEnvironment(payload);
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

  function handleTripleTapStart() {
    if (active || busy) return;
    const now = safeNowMs();
    const delta = now - lastTapAtMs.current;
    if (delta > 900) {
      tapCount.current = 0;
    }
    tapCount.current += 1;
    lastTapAtMs.current = now;

    if (tapCount.current >= 3) {
      tapCount.current = 0;
      startGuidedMode();
    }
  }

  const overlayHint = useMemo(() => {
    if (!canUseCamera) return 'Permite la cámara para iniciar.';
    if (!active) return 'Toca 3 veces el botón para iniciar caminata.';
    return 'Modo caminata activo.';
  }, [active, canUseCamera]);

  const insets = useSafeAreaInsets();

  const lastTapAtMs = useRef(0);
  const tapCount = useRef(0);

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <SafeAreaView style={[styles.card, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
          <View style={styles.panel}>
            <Pressable
              style={[styles.button, styles.buttonFull, active ? styles.buttonActive : null]}
              onPress={handleTripleTapStart}
              disabled={busy || active}
            >
              <Text style={styles.buttonText}>{active ? 'Modo activo' : 'Modo Caminata'}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
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
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: 0,
    borderTopColor: 'transparent',
  },
  panel: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  hint: {
    fontSize: 12,
    opacity: 0.9,
    color: '#e2e8f0',
  },
  status: {
    fontSize: 12,
    opacity: 0.9,
    color: '#e2e8f0',
  },
  button: {
    flex: 1,
    minHeight: 56,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  buttonActive: {
    backgroundColor: '#0d9488',
  },
  buttonFull: {
    width: '100%',
    borderRadius: 32,
    backgroundColor: '#1d4ed8',
  },
  buttonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
  },
  buttonSubText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
    opacity: 0.9,
    marginTop: 4,
  },
});
