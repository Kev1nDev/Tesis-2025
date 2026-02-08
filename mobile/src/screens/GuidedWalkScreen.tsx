import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Usamos la misma IP que ya te funciona en /book
const WALK_ENDPOINT = "http://18.224.161.7:8000/walk";

export default function WalkModeScreen() {
  const cameraRef = useRef<CameraView | null>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<string>('');

  const lastSpokenAtMs = useRef(0);

  const latestLocation = useRef<{
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  } | null>(null);

  function speak(text: string, onDone?: () => void) {
    if (!text) return;
    Speech.stop();
    Speech.speak(text, {
      language: "es",
      rate: 1.0,
      onDone: () => onDone?.(),
    });
  }

  async function captureAndDescribe() {
    // Si no está activo o ya está ocupado, salimos
    if (!cameraRef.current || busy || !activeRef.current) return;

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
        quality: 0.3,
        skipProcessing: true,
      });

      const formData = new FormData();
      // @ts-ignore - Estructura que ya te funciona en ReadingScreen
      formData.append("file", {
        uri: photo.uri,
        name: "walk.jpg",
        type: "image/jpeg",
      });

      const response = await fetch(WALK_ENDPOINT, {
        method: "POST",
        body: formData,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
        mode: 'fast' as const,
        prompt: buildPrompt(),
      };

      const result = await describeEnvironment(payload);
      if (forceSpeak) speak(result.description);
      else maybeSpeak(result.description);

    } catch (error) {
      console.error("Error en /walk:", error);
      // Si hay error, esperamos 3 segundos y reintentamos el bucle
      if (activeRef.current) setTimeout(captureAndDescribe, 3000);
    } finally {
      setBusy(false);
    }
  }

  const startMode = async () => {
    const { granted } = await requestCamPermission();
    if (!granted) return;
    
    activeRef.current = true;
    setActive(true);
    speak("Modo caminata iniciado", () => captureAndDescribe());
  };

  const stopMode = () => {
    activeRef.current = false;
    setActive(false);
    Speech.stop();
    speak("Modo caminata desactivado");
  };

  useEffect(() => {
    return () => {
      activeRef.current = false;
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
    <Pressable
      style={styles.container}
      onPress={() => !active ? startMode() : null}
      onLongPress={stopMode}
    >
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
  container: { flex: 1, backgroundColor: "black" },
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
