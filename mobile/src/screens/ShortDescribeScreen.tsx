import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, ActivityIndicator, Vibration } from 'react-native';
import { CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { assertEnv } from '../config/env';
import { describeEnvironment } from '../services/descriptionApi';

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

export default function DescribeCameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const lastSpokenPriority = useRef(0);
  const [busy, setBusy] = useState(false);

  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    console.log('🗣️ SPEAK:', text, 'PRIORITY:', priority);
    if (!text || priority < lastSpokenPriority.current) return;
    Speech.stop();
    lastSpokenPriority.current = priority;
    Speech.speak(text, { language: 'es', rate: 0.95, pitch: 1 });
  }

  function vibrate() {
    console.log('📳 Vibrating device');
    Vibration.vibrate(80);
  }

  async function describeScene() {
    if (!cameraRef.current || busy) {
      console.log('⛔ Ignored tap — busy or no camera');
      return;
    }

    setBusy(true);
    console.log('📷 START describeScene()');

    try {
      assertEnv();
      vibrate();
      speak('Capturando imagen');

      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.8 });
      console.log('📷 Photo captured', { uri: photo.uri, base64Length: photo.base64?.length });

      const location = await Location.getCurrentPositionAsync({});

      const payload = {
        imageBase64: photo.base64,
        imageMimeType: 'image/jpeg',
        sensors: {
          capturedAtIso: new Date().toISOString(),
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
        },
        mode: 'fast' as const,
      };

      speak('Analizando escena');
      const result = await describeEnvironment(payload);

      const desc = result.description?.trim() || '';
      if (!desc) {
        speak('No se detectó descripción', SPEECH_PRIORITY_STATUS);
      } else {
        speak(desc, SPEECH_PRIORITY_TEXT);
      }
    } catch (e) {
      console.error('❌ DESCRIBE ERROR:', e);
      speak('Error analizando la escena', SPEECH_PRIORITY_ERROR);
    } finally {
      console.log('📷 END describeScene()');
      setBusy(false);
    }
  }

  return (
    <Pressable
      style={styles.fullscreen}
      onPress={describeScene}
      onLongPress={() => speak('Presiona la pantalla para describir la escena', SPEECH_PRIORITY_STATUS)}
    >
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      {busy && <ActivityIndicator size="large" style={styles.spinner} />}
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
  },
});
