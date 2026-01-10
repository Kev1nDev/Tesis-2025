import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Vibration } from 'react-native';
import { CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { assertEnv } from '../config/env';
import { describeEnvironment } from '../services/descriptionApi';

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

export default function ReadingScreen() {
  const cameraRef = useRef<CameraView>(null);
  const lastSpokenPriority = useRef(0);
  const [busy, setBusy] = useState(false);

  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    console.log('🗣️ SPEAK:', text, 'PRIORITY:', priority);
    if (!text || priority < lastSpokenPriority.current) return;
    Speech.stop();
    lastSpokenPriority.current = priority;
    Speech.speak(text, { language: 'es', rate: 0.95, pitch: 1.0 });
  }

  function vibrate() {
    console.log('📳 Vibrating device');
    Vibration.vibrate(80);
  }

  async function describe() {
    if (!cameraRef.current || busy) {
      console.log('⛔ Ignored tap — busy or no camera');
      return;
    }

    setBusy(true);
    console.log('📷 START describe()');

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
        mode: 'balanced' as const,
      };

      speak('Analizando el entorno');
      const result = await describeEnvironment(payload);

      speak(result.description, SPEECH_PRIORITY_TEXT);
    } catch (e) {
      console.error('❌ DESCRIBE ERROR:', e);
      speak('Error describiendo el entorno', SPEECH_PRIORITY_ERROR);
    } finally {
      console.log('📷 END describe()');
      setBusy(false);
    }
  }

  return (
    <Pressable
      style={styles.fullscreen}
      onPress={describe}
      onLongPress={() => speak('Presiona la pantalla para describir el entorno', SPEECH_PRIORITY_STATUS)}
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
