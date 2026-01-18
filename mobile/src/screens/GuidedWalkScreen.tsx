import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  Vibration,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as Speech from "expo-speech";

import { assertEnv } from "../config/env";
import { describeEnvironment } from "../services/descriptionApi";

type AiResult = {
  type: "danger" | "warning" | "info" | "nothing";
  message: string;
};

export default function CognitiveMapScreen() {
  const cameraRef = useRef<CameraView | null>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();

  const [active, setActive] = useState(false);

  const busyRef = useRef(false);
  const speakingRef = useRef(false);

  const lastMessageRef = useRef<string | null>(null);

  const latestLocation = useRef<Location.LocationObject | null>(null);
  const headingRef = useRef<number | null>(null);

  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const headingSub = useRef<any>(null);

  const promptBase = useMemo(() => {
    return `
Eres un asistente de orientación para una persona con discapacidad visual.

Asume que el centro de la imagen representa la dirección de avance del usuario.
Describe SOLO lo que afecta su movimiento inmediato (1–3 metros).

Prioriza:
- obstáculos
- personas cercanas
- bordillos
- puertas
- postes

Usa frases MUY cortas.
No describas objetos lejanos.
No menciones latitud ni longitud.

Responde SOLO en JSON:
{
  "type": "danger | warning | info | nothing",
  "message": "frase breve de orientación"
}`;
  }, []);

  function vibrate() {
    try {
      Vibration.vibrate(50);
    } catch {}
  }

  function speak(text: string, onDone?: () => void) {
    if (!text) return;

    speakingRef.current = true;

    Speech.stop();
    Speech.speak(text, {
      language: "es-ES",
      rate: 0.95,
      pitch: 1.0,
      onDone: () => {
        speakingRef.current = false;
        onDone?.();
      },
      onStopped: () => {
        speakingRef.current = false;
      },
      onError: () => {
        speakingRef.current = false;
      },
    });
  }

  async function ensurePermissions() {
    assertEnv();

    const cam = await requestCamPermission();
    if (!cam.granted) throw new Error("Camera permission not granted");

    const loc = await Location.requestForegroundPermissionsAsync();
    if (loc.status !== "granted") throw new Error("Location permission not granted");
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
        latestLocation.current = pos;
      }
    );

    try {
      headingSub.current = await Location.watchHeadingAsync((heading) => {
        const h = heading.trueHeading ?? heading.magHeading ?? null;
        headingRef.current = typeof h === "number" ? h : null;
      });
    } catch {
      headingRef.current = null;
    }
  }

  function stopLocationWatch() {
    locationSub.current?.remove();
    headingSub.current?.remove();
    locationSub.current = null;
    headingSub.current = null;
    headingRef.current = null;
  }

  function buildPrompt() {
    const loc = latestLocation.current;
    const heading = headingRef.current;

    let spatial = "";

    if (loc && heading != null) {
      spatial = `Usuario mirando hacia ${heading.toFixed(0)} grados.`;
    }

    return `${promptBase}\n${spatial}`;
  }

  async function captureAndDescribe() {
    if (!cameraRef.current) return;
    if (busyRef.current) return;
    if (speakingRef.current) return;

    busyRef.current = true;

    try {
      vibrate();

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
      });

      const sensors: any = {};
      if (headingRef.current != null) {
        sensors.heading = headingRef.current;
      }

      const result = await describeEnvironment({
        imageBase64: photo.base64,
        imageMimeType: "image/jpeg",
        sensors: Object.keys(sensors).length ? sensors : undefined,
        mode: "fast",
        prompt: buildPrompt(),
      });

      let data: AiResult;

      try {
        data = JSON.parse(result.description);
      } catch {
        data = { type: "info", message: result.description ?? "" };
      }

      const message = data?.message?.trim();

      if (!message) return;
      if (message === lastMessageRef.current) return;

      lastMessageRef.current = message;

      speak(message, () => {
        if (active) {
          setTimeout(() => {
            captureAndDescribe();
          }, 250);
        }
      });
    } catch {
      speak("Error al analizar el entorno");
    } finally {
      busyRef.current = false;
    }
  }

  async function startMode() {
    try {
      await ensurePermissions();
      await startLocationWatch();
      setActive(true);

      speak("Mapa cognitivo activado", () => {
        captureAndDescribe();
      });
    } catch {
      speak("No se pudieron obtener los permisos");
    }
  }

  function stopMode() {
    setActive(false);
    stopLocationWatch();
    Speech.stop();
    speak("Mapa cognitivo desactivado");
  }

  const handlePress = async () => {
    if (!active) {
      await startMode();
    } else {
      captureAndDescribe();
    }
  };

  const handleLongPress = () => {
    if (active) stopMode();
  };

  useEffect(() => {
    return () => {
      stopLocationWatch();
      Speech.stop();
    };
  }, []);

  return (
    <Pressable
      style={styles.container}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {busyRef.current && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
  busyOverlay: {
    position: "absolute",
    alignSelf: "center",
    bottom: 120,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 12,
    borderRadius: 10,
  },
});
