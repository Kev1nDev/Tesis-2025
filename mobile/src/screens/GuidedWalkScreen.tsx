import React, { useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  Vibration,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useIsFocused } from '@react-navigation/native';
import * as Speech from "expo-speech";
import * as ImageManipulator from "expo-image-manipulator";
import { useCamera } from "../ui/CameraContext"; // Ajusta la ruta

const WALK_ENDPOINT = "http://16.58.82.203:8000/walk";

export default function WalkModeScreen() {
  const cameraRef = useRef<CameraView | null>(null);

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraInitialized, setCameraInitialized] = useState(false);

  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const lastMsgRef = useRef<string>("");
  const isFocused = useIsFocused();
  
  // Usar el contexto de cámara
  const { activeScreen, setCameraReady } = useCamera();
  const screenKey = 'caminata';

  // Marcar cuando la cámara está lista
  useEffect(() => {
    if (cameraInitialized) {
      setCameraReady(screenKey, true);
    }
    return () => {
      setCameraReady(screenKey, false);
    };
  }, [cameraInitialized]);

  // Solo renderizar completamente cuando esta pantalla está activa
  const isActive = activeScreen === screenKey && isFocused;

  const explainWalkMode = () => {
  // 🔥 Explicación breve de la utilidad de la pantalla
  const explanation = "Usa la cámara para detectar obstáculos a tu izquierda, centro o derecha como personas, escaleras o sillas en tu camino. Presiona para iniciar. Presiona prolongadamente para detener. La cámara se activará cada pocos segundos para analizar tu entorno. Nunca te guies solo por esta herramienta de apoyo, camina junto con asistencia o bastón guiador.";
  
  Speech.stop();
  speak(explanation);
};

  /* -------------------------------------------------- */
  /*  SPEECH CONTROL                                    */
  /* -------------------------------------------------- */

  const speak = (text: string, onDone?: () => void) => {
    if (!text) {
      onDone?.();
      return;
    }

    if (text === lastMsgRef.current && text === "Camino despejado") {
      onDone?.();
      return;
    }

    lastMsgRef.current = text;

    Speech.stop();

    Speech.speak(text, {
      language: "es",
      rate: 1.1,
      onDone,
      onError: onDone,
    });
  };

  /* -------------------------------------------------- */
  /*  FETCH CON TIMEOUT                                  */
  /* -------------------------------------------------- */

  const fetchWithTimeout = async (
    url: string,
    options: any,
    timeout = 8000
  ) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  };

  /* -------------------------------------------------- */
  /*  MAIN LOOP                                          */
  /* -------------------------------------------------- */

  const captureAndDescribe = async () => {
    if (!cameraRef.current) return;
    if (!activeRef.current) return;
    if (busyRef.current) return;
    if (!isActive) return; // No capturar si no estamos activos

    busyRef.current = true;
    setBusy(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.1,
        skipProcessing: true,
      });

      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 400 } }],
        {
          compress: 0.4,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      const formData = new FormData();
      // @ts-ignore
      formData.append("file", {
        uri: resized.uri,
        name: "walk.jpg",
        type: "image/jpeg",
      });

      const response = await fetchWithTimeout(
        WALK_ENDPOINT,
        { method: "POST", body: formData },
        8000
      );

      if (!response.ok) {
        throw new Error("Servidor no disponible");
      }

      const data = await response.json();

      const message =
        typeof data?.description === "string"
          ? data.description
          : "No se pudo analizar la escena";

      if (data?.priority === "high") {
        Vibration.vibrate([0, 250, 120, 250]);
      } else {
        Vibration.vibrate(30);
      }

      speak(message, () => {
        if (activeRef.current && isActive) {
          setTimeout(captureAndDescribe, 2600);
        }
      });

    } catch (error: any) {
      console.log("Walk error:", error?.message);

      speak("Problema de conexión", () => {
        if (activeRef.current && isActive) {
          setTimeout(captureAndDescribe, 3300);
        }
      });

    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /* -------------------------------------------------- */
  /*  START / STOP                                       */
  /* -------------------------------------------------- */

  const startMode = async () => {
    if (busyRef.current) return;
    if (!isActive) return; // No iniciar si no estamos activos

    const { granted } = await requestCamPermission();
    if (!granted) return;

    activeRef.current = true;
    setActive(true);

    speak("Iniciando modo caminata", () => {
      captureAndDescribe();
    });
  };

  const stopMode = () => {
    activeRef.current = false;
    setActive(false);

    Speech.stop();
    speak("Modo caminata detenido");
  };

  /* -------------------------------------------------- */
  /*  CLEANUP                                            */
  /* -------------------------------------------------- */

  useEffect(() => {
    return () => {
      activeRef.current = false;
      Speech.stop();
    };
  }, []);

  // Pausar cuando la pantalla no está activa
  useEffect(() => {
    if (!isActive) {
      activeRef.current = false;
      setActive(false);
      Speech.stop();
    }
  }, [isActive]);

/* -------------------------------------------------- */
/*  UI                                                 */
/* -------------------------------------------------- */

return (
  <Pressable
    style={styles.container}
    onPress={() => !active && isActive && startMode()}
    onLongPress={() => {
      if (active) {
        stopMode();  // Detener si está activo
      } else {
        explainWalkMode();  // Explicar si está inactivo
      }
    }}
    disabled={!isActive}  // Opcional: deshabilitar si no estamos enfocados
  >
    {isActive && (
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        active={isActive}
        onCameraReady={() => setCameraInitialized(true)}
      />
    )}

    {busy && (
      <View style={styles.overlay}>
        <ActivityIndicator size="large" color="#0b5fff" />
      </View>
    )}
  </Pressable>
);
}

/* -------------------------------------------------- */
/*  STYLES                                             */
/* -------------------------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
  overlay: {
    position: "absolute",
    top: "40%",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 30,
    borderRadius: 20,
    zIndex: 10,
  },
});