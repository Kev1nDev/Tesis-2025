import React, { useRef, useState } from 'react';
// Añadimos View a la importación
import { Pressable, StyleSheet, ActivityIndicator, Vibration, View } from 'react-native';
import { CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

// Usamos el endpoint de caption
const EC2_ENDPOINT = 'http://18.224.161.7:8000/caption';

export default function DescribeCameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const lastSpokenPriority = useRef(0);
  const [busy, setBusy] = useState(false);

  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    console.log('SPEAK:', text, 'PRIORITY:', priority);
    if (!text || priority < lastSpokenPriority.current) return;
    Speech.stop();
    lastSpokenPriority.current = priority;
    Speech.speak(text, { language: 'es', rate: 0.95, pitch: 1 });
  }

  function vibrate() {
    Vibration.vibrate(80);
  }

  async function describeScene() {
    if (!cameraRef.current || busy) return;

    setBusy(true);

    try {
      vibrate();
      speak('Capturando imagen');

      const photo = await cameraRef.current.takePictureAsync({ 
        base64: false, 
        quality: 0.7 
      });

      speak('Analizando escena');

      const formData = new FormData();
      // @ts-ignore
      formData.append('file', {
        uri: photo.uri,
        name: 'scene.jpg',
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
      const desc = result.caption?.trim() || '';
      
      if (!desc || desc === "no hay texto") {
        speak('No se pudo describir la escena', SPEECH_PRIORITY_STATUS);
      } else {
        speak(desc, SPEECH_PRIORITY_TEXT);
      }

    } catch (e) {
      console.error('DESCRIBE ERROR:', e);
      speak('Error analizando la escena', SPEECH_PRIORITY_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      style={styles.fullscreen}
      onPress={describeScene}
      onLongPress={() => speak('Presiona la pantalla para describir lo que hay frente a ti', SPEECH_PRIORITY_STATUS)}
    >
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      
      {/* Overlay unificado con el resto de la app */}
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