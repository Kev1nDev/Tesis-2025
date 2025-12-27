import React, { useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';

const BACKEND_URL_CAPTION = 'http://18.219.82.255:7861/caption';

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

export default function DescribeCameraScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const lastSpokenPriority = useRef(0);

  const log = (label: string, data?: any) => {
    console.log(`📷 [DescribeCamera] ${label}`, data ?? '');
  };

  async function takePhotoAndSend() {
    log('START capture flow');

    try {
      log('Requesting camera permission…');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      log('Camera permission result', perm);

      if (!perm.granted) {
        speak('Permiso de cámara denegado', SPEECH_PRIORITY_ERROR);
        Alert.alert('Permiso denegado', 'No se otorgó permiso para usar la cámara.');
        return;
      }

      log('Launching camera…');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });

      log('Camera result', result);

      if (result.canceled || !result.assets?.length) {
        log('User cancelled capture');
        return;
      }

      const uri = result.assets[0].uri;
      log('Captured image URI', uri);

      setImageUri(uri);
      vibrateWithPattern([0, 80]);

      setStatusText('Enviando imagen al servidor…');
      setLoading(true);

      log('Calling backend…');
      const caption = await sendImageToBackend(uri);

      log('Backend returned', caption);

      setLoading(false);

      if (caption == null) {
        setStatusText('Sin respuesta del servidor');
        speak('Sin respuesta del servidor', SPEECH_PRIORITY_STATUS);
        return;
      }

      if (caption === '') {
        setStatusText('No se detectó descripción');
        speak('No se detectó descripción', SPEECH_PRIORITY_STATUS);
        return;
      }

      log('Translating caption…');
      const translated = await translateToSpanish(caption);
      log('Translated text', translated);

      const finalText = translated?.trim() ? translated : caption;
      setStatusText(finalText);
      speak(finalText, SPEECH_PRIORITY_TEXT);
    } catch (e: any) {
      setLoading(false);
      log('❌ CRASH in takePhotoAndSend', e);
      const msg = e?.message ?? String(e);
      setStatusText('Error: ' + msg);
      speak('Error enviando imagen', SPEECH_PRIORITY_ERROR);
      Alert.alert('Error', msg);
    }
  }

  async function sendImageToBackend(uri: string): Promise<string | null> {
    log('sendImageToBackend() begin');
    log('Image URI', uri);

    try {
      log('Fetching local image as blob…');
      const fileResp = await fetch(uri);
      log('Local file fetch status', fileResp.status);

      const blob = await fileResp.blob();
      log('Blob size (bytes)', blob.size);

      const form = new FormData();
      form.append('file', blob as any, 'capture.jpg');

      log('POST →', BACKEND_URL_CAPTION);

      const resp = await fetch(BACKEND_URL_CAPTION, {
        method: 'POST',
        body: form,
        headers: { Accept: 'application/json' },
      });

      log('HTTP status', resp.status);

      const txt = await resp.text();
      log('Raw backend response', txt);

      if (!resp.ok) {
        log('❌ Backend returned error', { code: resp.status, body: txt });
        Alert.alert('Backend error', String(resp.status));
        return null;
      }

      if (!txt) {
        log('⚠️ Empty backend body');
        return null;
      }

      try {
        const obj = JSON.parse(txt);
        const caption = obj.caption ?? obj.text ?? obj.message ?? txt;
        log('Parsed JSON caption', caption);

        const low = String(caption).trim().toLowerCase();
        if (low.includes('no hay') || low.includes('no caption') || low.includes('no text')) {
          log('Detected NO TEXT signal');
          return '';
        }

        return String(caption);
      } catch (e) {
        log('Response is not JSON, using raw text');
        return txt;
      }
    } catch (e) {
      log('❌ Network / fetch error', e);
      Alert.alert('Error', 'No se pudo conectar con el servidor');
      return null;
    }
  }

  async function translateToSpanish(text: string): Promise<string> {
    log('translateToSpanish()', text);

    try {
      const url =
        'https://translate.googleapis.com/translate_a/single' +
        '?client=gtx&sl=en&tl=es&dt=t&q=' +
        encodeURIComponent(text);

      log('Calling Google Translate…');
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      log('Translate status', resp.status);

      const body = await resp.text();
      log('Translate raw body', body.slice(0, 120));

      const pattern = /\[\[\[\"(.*?)\",/;
      const match = pattern.exec(body);

      if (match && match[1]) return match[1];
      return text;
    } catch (e) {
      log('⚠️ translateToSpanish failed', e);
      return text;
    }
  }

  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    if (!text || text.trim() === '') return;

    if (priority >= lastSpokenPriority.current) {
      Speech.stop();
      lastSpokenPriority.current = priority;

      setTimeout(() => {
        Speech.speak(text, {
          language: 'es',
          rate: 0.95,
          pitch: 1.0,
        });
      }, 50);
    }
  }

  function vibrateWithPattern(pattern: number[] = [0, 80]) {
    Vibration.vibrate(pattern);
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.touchOverlay}
        onPress={takePhotoAndSend}
        onLongPress={() =>
          speak('Mantén presionado para ayuda. Presiona para describir la escena.', SPEECH_PRIORITY_STATUS)
        }
      >
        <Text style={styles.helpText}>Toca para describir</Text>
      </Pressable>

      <View style={styles.resultArea}>
        {loading && <ActivityIndicator size="large" />}
        {imageUri && <Image source={{ uri: imageUri }} style={styles.preview} />}
        <Text style={styles.status}>{statusText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  touchOverlay: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: { fontSize: 18, fontWeight: '600' },
  resultArea: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  preview: {
    width: '100%',
    height: 220,
    resizeMode: 'cover',
    marginBottom: 8,
    borderRadius: 6,
  },
  status: { fontSize: 14, color: '#222' },
});
