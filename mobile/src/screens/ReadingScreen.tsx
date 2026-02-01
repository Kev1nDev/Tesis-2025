import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Vibration } from 'react-native';
import { CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

// Reemplaza con la IP de tu instancia de EC2
const EC2_ENDPOINT = 'http://18.224.161.7:8000/book';

export default function ReadingScreen() {
  const cameraRef = useRef<CameraView>(null);
  const lastSpokenPriority = useRef(0);
  const [busy, setBusy] = useState(false);

  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    console.log('SPEAK:', text, 'PRIORITY:', priority);
    if (!text || priority < lastSpokenPriority.current) return;
    Speech.stop();
    lastSpokenPriority.current = priority;
    Speech.speak(text, { language: 'es', rate: 0.95, pitch: 1.0 });
  }

  function vibrate() {
    console.log('Vibrating device');
    Vibration.vibrate(80);
  }

  async function describe() {
    if (!cameraRef.current || busy) {
      console.log('Ignored tap — busy or no camera');
      return;
    }

    setBusy(true);
    console.log('START OCR Process');

    try {
      vibrate();
      speak('Capturando imagen');

      const photo = await cameraRef.current.takePictureAsync({ 
        base64: true, 
        quality: 0.8 
      });

      speak('Procesando texto');

      // --- Lógica del endpoint /book integrada ---
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

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      
      // result.text es lo que devuelve tu script de Python
      const textToSpeak = result.text || 'No se detectó texto';
      speak(textToSpeak, SPEECH_PRIORITY_TEXT);

    } catch (e) {
      console.error('ERROR EN /BOOK:', e);
      speak('Error al conectar con el servidor de lectura', SPEECH_PRIORITY_ERROR);
    } finally {
      console.log('END OCR Process');
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
      {busy && (
        <ActivityIndicator 
          size="large" 
          color="#ffffff" 
          style={styles.spinner} 
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: 'black',
  },
  spinner: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    zIndex: 10,
  },
});