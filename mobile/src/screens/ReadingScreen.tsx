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

const BACKEND_URL_BOOK = 'http://18.219.82.255:7861/book';

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

export default function ReadingScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const lastSpokenPriority = useRef(0);

  async function takePhotoAndSend() {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        speak('Permiso de cámara denegado', SPEECH_PRIORITY_ERROR);
        Alert.alert('Permiso denegado', 'No se otorgó permiso para usar la cámara.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const uri = result.assets[0].uri;
      setImageUri(uri);
      vibrateWithPattern([0, 80]);

      setStatusText('Enviando imagen al servidor...');
      setLoading(true);

      const text = await sendImageToBackend(uri);
      setLoading(false);

      const finalText =
        text == null ? 'Sin respuesta del servidor' :
        text === '' ? 'No se detectó texto' :
        text;

      setStatusText(finalText);

      if (text && text.length > 0) speak(text, SPEECH_PRIORITY_TEXT);
      else speak(finalText, SPEECH_PRIORITY_STATUS);

    } catch (e: any) {
      setLoading(false);
      const msg = e?.message ?? String(e);
      setStatusText('Error: ' + msg);
      speak('Error enviando imagen', SPEECH_PRIORITY_ERROR);
      Alert.alert('Error', msg);
    }
  }

  async function sendImageToBackend(uri: string): Promise<string | null> {
    try {
      const form = new FormData();
      form.append('file', {
        uri,
        name: 'capture.jpg',
        type: 'image/jpeg',
      } as any);

      const resp = await fetch(BACKEND_URL_BOOK, {
        method: 'POST',
        body: form,
        headers: {
          Accept: 'application/json',
        },
      });

      const txt = await resp.text();

      if (!resp.ok) {
        console.warn('Backend error', resp.status, txt);
        Alert.alert('Backend error', String(resp.status));
        return null;
      }

      if (!txt) return null;

      try {
        const obj = JSON.parse(txt);
        const text = obj.text ?? obj.caption ?? obj.message ?? txt;
        const low = String(text).trim().toLowerCase();
        if (low.includes('no hay texto') || low.includes('no text')) return '';
        return String(text);
      } catch {
        return txt;
      }

    } catch (e) {
      console.error('sendImageToBackend error', e);
      Alert.alert('Error', 'No se pudo conectar con el servidor');
      return null;
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
          speak(
            'Mantén presionado para ayuda. Presiona para capturar texto.',
            SPEECH_PRIORITY_STATUS
          )
        }
      >
        <Text style={styles.helpText}>Toca para capturar</Text>
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
