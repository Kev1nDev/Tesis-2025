import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, Vibration } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import * as ImageManipulator from 'expo-image-manipulator';

const WALK_ENDPOINT = "http://16.58.82.203:8000/walk";

export default function WalkModeScreen() {
  const cameraRef = useRef<CameraView | null>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  
  const activeRef = useRef(false);
  const lastMsgRef = useRef<string>("");

  const speak = (text: string, onDone?: () => void) => {
    if (!text || (text === lastMsgRef.current && text === "Camino despejado")) {
      onDone?.();
      return;
    }
    lastMsgRef.current = text;
    Speech.stop();
    Speech.speak(text, { language: "es", rate: 1.1, onDone });
  };

  const captureAndDescribe = async () => {
    if (!cameraRef.current || !activeRef.current || busy) return;

    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ 
        quality: 0.1,
        skipProcessing: true 
      });

      const manipResult = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 400 } }],
        { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG }
      );

      const formData = new FormData();
      // @ts-ignore
      formData.append("file", { uri: manipResult.uri, name: "w.jpg", type: "image/jpeg" });

      const response = await fetch(WALK_ENDPOINT, { 
        method: "POST", 
        body: formData 
      });
      
      const data = await response.json();
      
      // Acceso seguro a la descripción
      const message = data.description || "Analizando";
      
      if (data.priority === "high") {
        Vibration.vibrate([0, 200, 100, 200]);
      } else {
        Vibration.vibrate(20);
      }

      speak(message, () => {
        if (activeRef.current) setTimeout(captureAndDescribe, 800);
      });

    } catch (error) {
      console.log("Walk Network Error");
      if (activeRef.current) setTimeout(captureAndDescribe, 2000);
    } finally {
      setBusy(false);
    }
  };

  const startMode = async () => {
    const { granted } = await requestCamPermission();
    if (!granted) return;
    activeRef.current = true;
    setActive(true);
    speak("Iniciando modo caminata", () => captureAndDescribe());
  };

  const stopMode = () => {
    activeRef.current = false;
    setActive(false);
    Speech.stop();
    speak("Modo caminata detenido");
  };

  return (
    <Pressable style={styles.container} onPress={() => !busy && startMode()} onLongPress={stopMode}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      {busy && (
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
    borderRadius: 20,
    zIndex: 10,
  }
});