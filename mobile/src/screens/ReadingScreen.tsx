import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Vibration,
} from 'react-native';
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

export default function ReadingScreen() {
  const cameraRef = useRef<CameraView>(null);
  const lastSpokenPriority = useRef(0);
  const [busy, setBusy] = useState(false);

  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    console.log('🗣️ SPEAK:', text, 'PRIORITY:', priority);
    if (!text || priority < lastSpokenPriority.current) return;

    Speech.stop();
    lastSpokenPriority.current = priority;

    Speech.speak(text, {
      language: 'es',
      rate: 0.95,
      pitch: 1.0,
    });
  }

  function vibrate() {
    console.log('📳 Vibrating device');
    Vibration.vibrate(80);
  }

  async function readText() {
    if (!cameraRef.current || busy) {
      console.log('⛔ Ignored tap — busy or no camera');
      return;
    }

    setBusy(true);
    console.log('📷 START readText()');

    try {
      vibrate();
      speak('Capturando imagen');

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.8,
      });
      console.log('📷 Photo captured', { uri: photo.uri, base64Length: photo.base64?.length });

      speak('Leyendo texto');
      const url = getEndpoint('/book');
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

      let txt = await resp.text();
      console.log('📤 Backend response status:', resp.status);
      console.log('📤 Backend raw text:', txt.slice(0, 120));

      if (!resp.ok) {
        console.warn('❌ Backend error', resp.status, txt);
        speak('Error del servidor', SPEECH_PRIORITY_ERROR);
        return;
      }

      try {
        const obj = JSON.parse(txt);
        txt = obj.text ?? obj.caption ?? obj.message ?? txt;
        console.log('📑 Parsed text:', txt);
      } catch {
        console.log('⚠️ Backend response is not JSON, using raw text');
      }

      const clean = txt.trim().toLowerCase();
      if (clean.includes('no hay texto') || clean.includes('no text') || !txt) {
        speak('No se detectó texto', SPEECH_PRIORITY_STATUS);
      } else {
        speak(txt, SPEECH_PRIORITY_TEXT);
      }
    } catch (e) {
      console.error('❌ READ ERROR:', e);
      speak('Error leyendo texto', SPEECH_PRIORITY_ERROR);
    } finally {
      console.log('📷 END readText()');
      setBusy(false);
    }
  }

  return (
    <Pressable
      style={styles.fullscreen}
      onPress={readText}
      onLongPress={() =>
        speak('Presiona la pantalla para leer texto impreso', SPEECH_PRIORITY_STATUS)
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
