import React, { useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  Vibration,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import * as ImageManipulator from "expo-image-manipulator";

const WALK_ENDPOINT = "http://16.58.82.203:8000/walk";

export default function WalkModeScreen() {
  const cameraRef = useRef<CameraView | null>(null);

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const lastMsgRef = useRef<string>("");

  /* -------------------------------------------------- */
  /*  SPEECH CONTROL                                    */
  /* -------------------------------------------------- */

  const speak = (text: string, onDone?: () => void) => {
    if (!text) {
      onDone?.();
      return;
    }

    // Evita repetir constantemente "Camino despejado"
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
        if (activeRef.current) {
          setTimeout(captureAndDescribe, 2600);
        }
      });

    } catch (error: any) {
      console.log("Walk error:", error?.message);

      speak("Problema de conexión", () => {
        if (activeRef.current) {
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

  /* -------------------------------------------------- */
  /*  UI                                                 */
  /* -------------------------------------------------- */

  return (
    <Pressable
      style={styles.container}
      onPress={() => !active && startMode()}
      onLongPress={stopMode}
    >
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
      />

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