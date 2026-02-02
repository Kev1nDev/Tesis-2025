import React, { useRef, useState } from 'react';
// Añadimos View a la importación
import { ActivityIndicator, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

const EC2_ENDPOINT = 'http://18.224.161.7:8000/book';

export default function ReadingScreen() {
  const cameraRef = useRef<CameraView>(null);
  const lastSpokenPriority = useRef(0);
  const [busy, setBusy] = useState(false);

  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    if (!text || priority < lastSpokenPriority.current) return;
    Speech.stop();
    lastSpokenPriority.current = priority;
    Speech.speak(text, { language: 'es', rate: 0.95, pitch: 1.0 });
  }

  function vibrate() {
    Vibration.vibrate(80);
  }

  async function describe() {
    if (!cameraRef.current || busy) return;

    setBusy(true);

    try {
      vibrate();
      speak('Capturando imagen');

      const photo = await cameraRef.current.takePictureAsync({ 
        base64: true, 
        quality: 0.8 
      });

      speak('Procesando texto');

      const formData = new FormData();
      // @ts-ignore
      formData.append('file', {
        uri: photo.uri,
        name: 'photo.jpg',
        type: 'image/jpeg',
      });

      const response = await fetch(EC2_ENDPOINT, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const result = await response.json();
      const textToSpeak = result.text || 'No se detectó texto';
      speak(textToSpeak, SPEECH_PRIORITY_TEXT);

    } catch (e) {
      console.error('ERROR EN /BOOK:', e);
      speak('Error al conectar con el servidor de lectura', SPEECH_PRIORITY_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      style={styles.fullscreen}
      onPress={describe}
      onLongPress={() => speak('Presiona una vez para leer el texto frente a ti', SPEECH_PRIORITY_STATUS)}
    >
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      
      {/* Ajustado para usar el mismo estilo visual que las otras pantallas */}
      {busy && (
        <View style={styles.overlay}>
          <ActivityIndicator 
            size="large" 
            color="#0b5fff" 
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: 'black',
  },
  // Unificamos el estilo del overlay
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