import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, ActivityIndicator, Vibration } from 'react-native';
import { CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';
import { assertEnv, ENV } from '../config/env';

function getEndpoint(pathname: string): string {
  assertEnv();
  const base = ENV.apiBaseUrl.replace(/\/+$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${path}`;
}

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
      vibrate();
      speak('Capturando imagen');
      const url = getEndpoint('/caption');

      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.8 });
      console.log('📷 Photo captured', { uri: photo.uri, base64Length: photo.base64?.length });

      speak('Analizando escena');

      const form = new FormData();
      form.append('file', {
        uri: photo.uri,
        name: 'capture.jpg',
        type: 'image/jpeg',
      } as any);

      console.log('🚀 Sending image to backend...');
      const resp = await fetch(url, {
        method: 'POST',
        body: form,
      });

      let caption = await resp.text();
      console.log('📤 Backend response status:', resp.status);
      console.log('📤 Backend raw text:', caption.slice(0, 120));

      if (!resp.ok) {
        console.warn('❌ Backend error', resp.status, caption);
        speak('Error del servidor', SPEECH_PRIORITY_ERROR);
        return;
      }

      try {
        const obj = JSON.parse(caption);
        caption = obj.caption ?? obj.text ?? obj.message ?? caption;
        console.log('📑 Parsed caption:', caption);
      } catch {
        console.log('⚠️ Backend response is not JSON, using raw text');
      }

      const clean = caption.trim().toLowerCase();
      if (clean.includes('no hay') || clean.includes('no text') || clean === '') {
        speak('No se detectó descripción', SPEECH_PRIORITY_STATUS);
      } else {
        speak(caption, SPEECH_PRIORITY_TEXT);
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
      onLongPress={() =>
        speak('Presiona la pantalla para describir la escena', SPEECH_PRIORITY_STATUS)
      }
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
