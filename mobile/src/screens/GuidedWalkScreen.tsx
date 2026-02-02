import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, Vibration, Platform } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";

// Usamos la misma IP que ya te funciona en /book
const WALK_ENDPOINT = "http://18.224.161.7:8000/walk";

export default function WalkModeScreen() {
  const cameraRef = useRef<CameraView | null>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false); // Usamos estado como en ReadingScreen
  
  const lastMessageRef = useRef<string | null>(null);
  const activeRef = useRef(false); // Ref para controlar el bucle sin retrasos de estado

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

    setBusy(true);
    try {
      // Capturamos con base64: false para que sea más rápido (usamos el URI)
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
      });

      if (!response.ok) throw new Error("Server error");

      const data = await response.json();
      // IMPORTANTE: el endpoint /walk devuelve "description", no "text"
      const message = data.description || data.caption; 

      if (message && message !== lastMessageRef.current) {
        lastMessageRef.current = message;
        Vibration.vibrate(50);
        speak(message, () => {
          // Solo cuando termina de hablar, esperamos 1 seg y repetimos
          if (activeRef.current) {
            setTimeout(captureAndDescribe, 1000);
          }
        });
      } else if (activeRef.current) {
        // Si no hay cambio, reintenta más rápido
        setTimeout(captureAndDescribe, 1500);
      }

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

  return (
    <Pressable
      style={styles.container}
      onPress={() => !active ? startMode() : null}
      onLongPress={stopMode}
    >
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      
      {active && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#0b5fff" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  overlay: {
    position: "absolute",
    top: '40%',
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 30,
    borderRadius: 20
  }
});