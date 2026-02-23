import React, { useRef, useState, useEffect } from 'react';
import { Pressable, StyleSheet, ActivityIndicator, Vibration, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import * as Speech from 'expo-speech';

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

const EC2_ENDPOINT = 'http://16.58.82.203:8000/caption';

export default function DescribeCameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const lastSpokenPriority = useRef(0);
  const speakingRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const isFocused = useIsFocused();

  // 🔥 Speak robusto
  async function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    if (!text) return;
    if (priority < lastSpokenPriority.current) return;

    try {
      // Esperar realmente a que pare
      await Speech.stop();

      lastSpokenPriority.current = priority;
      speakingRef.current = true;

      Speech.speak(text, {
        language: 'es',
        rate: 0.95,
        pitch: 1,
        onDone: () => {
          speakingRef.current = false;
          lastSpokenPriority.current = 0; // 🔥 Reset prioridad
        },
        onStopped: () => {
          speakingRef.current = false;
          lastSpokenPriority.current = 0;
        },
        onError: () => {
          speakingRef.current = false;
          lastSpokenPriority.current = 0;
        }
      });

    } catch (err) {
      console.log('Speech error:', err);
      speakingRef.current = false;
      lastSpokenPriority.current = 0;
    }
  }

  function vibrate() {
    Vibration.vibrate(80);
  }

  async function describeScene() {
    if (!cameraRef.current) return;
    if (busy) return; // 🔥 Evita doble request

    setBusy(true);

    try {
      vibrate();
      await speak('Capturando imagen');

      const photo = await cameraRef.current.takePictureAsync({
        base64: false,
        quality: 0.7,
      });

      await speak('Analizando escena');

      const formData = new FormData();
      // @ts-ignore
      formData.append('file', {
        uri: photo.uri,
        name: 'scene.jpg',
        type: 'image/jpeg',
      });

      // 🔥 Timeout de seguridad (60s)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(EC2_ENDPOINT, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      const desc = result.caption?.trim() || '';

      if (!desc || desc === 'no hay texto') {
        await speak('No se pudo describir la escena', SPEECH_PRIORITY_STATUS);
      } else {
        await speak(desc, SPEECH_PRIORITY_TEXT);
      }

    } catch (e: any) {
      console.error('DESCRIBE ERROR:', e);

      if (e.name === 'AbortError') {
        await speak('El servidor tardó demasiado en responder', SPEECH_PRIORITY_ERROR);
      } else {
        await speak('Error analizando la escena', SPEECH_PRIORITY_ERROR);
      }

    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      style={styles.fullscreen}
      onPress={describeScene}
      onLongPress={() =>
        speak(
          'Presiona la pantalla para describir lo que hay frente a ti',
          SPEECH_PRIORITY_STATUS
        )
      }
    >
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        active={isFocused}
      />

      {busy && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#0b5fff" />
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
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 30,
    borderRadius: 20,
    zIndex: 10,
  },
});