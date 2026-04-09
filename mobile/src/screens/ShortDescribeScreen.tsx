import React, { useRef, useState, useEffect } from 'react';
import { Pressable, StyleSheet, ActivityIndicator, Vibration, View, Platform } from 'react-native';
import { CameraView } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import { Snackbar, Text } from 'react-native-paper'; // ✅ Import de Paper
import { useCamera } from '../ui/CameraContext';

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

const EC2_ENDPOINT = 'https://az8yec3162js8a-8000.proxy.runpod.net/caption';

export default function DescribeCameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const lastSpokenPriority = useRef(0);
  const speakingRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [cameraInitialized, setCameraInitialized] = useState(false);

  // 👇 Estado para controlar el Snackbar de Paper
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    type: 'error' | 'success' | 'info';
  }>({ visible: false, message: '', type: 'info' });

  const isFocused = useIsFocused();
  const { activeScreen, setCameraReady } = useCamera();
  const screenKey = 'rapida';
  const isActive = activeScreen === screenKey && isFocused;

  // 👇 Test de conexión manual (activar con long-press en modo debug)
  const testBackendConnection = async () => {

    try {
      console.log('🔍 Testing connection to:', EC2_ENDPOINT);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(EC2_ENDPOINT, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      console.log('✅ Response status:', response.status);
    } catch (err: any) {
      console.error('❌ Test failed:', err);
    }
  };

  // 🔥 Función speak robusta
  async function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    if (!text) return;
    if (!isActive && priority < SPEECH_PRIORITY_ERROR) return;
    if (priority < lastSpokenPriority.current) return;

    try {
      await Speech.stop();
      lastSpokenPriority.current = priority;
      speakingRef.current = true;

      Speech.speak(text, {
        language: 'es',
        rate: 0.95,
        pitch: 1,
        onDone: () => {
          speakingRef.current = false;
          lastSpokenPriority.current = 0;
        },
        onStopped: () => {
          speakingRef.current = false;
          lastSpokenPriority.current = 0;
        },
        onError: () => {
          speakingRef.current = false;
          lastSpokenPriority.current = 0;
        },
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

  // 👇 Función principal de captura y análisis
  async function describeScene() {
    if (!isActive) {
      console.log('⏸️ DescribeCameraScreen no está activa, ignorando captura');
      return;
    }

    if (!cameraRef.current || busy) return;
    setBusy(true);

    try {
      vibrate();
      await speak('Capturando imagen');

      if (!isActive) {
        setBusy(false);
        return;
      }

      const photo = await cameraRef.current.takePictureAsync({
        base64: false,
        quality: 0.7,
      });

      if (!isActive) {
        setBusy(false);
        return;
      }

      await speak('Analizando escena');

      const formData = new FormData();
      // @ts-ignore - FormData en React Native acepta este formato
      formData.append('file', {
        uri: photo.uri,
        name: 'scene.jpg',
        type: 'image/jpeg',
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      console.log('📤 Enviando request a:', EC2_ENDPOINT);

      const response = await fetch(EC2_ENDPOINT, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!isActive) {
        setBusy(false);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Sin detalles');
        throw new Error(`Server ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const desc = result.caption?.trim() || '';

      if (!isActive) {
        setBusy(false);
        return;
      }

      if (!desc || desc === 'no hay texto') {
        await speak('No se pudo describir la escena', SPEECH_PRIORITY_STATUS);
      } else {
        await speak(desc, SPEECH_PRIORITY_TEXT);
      }
    } catch (e: any) {
      console.error('DESCRIBE ERROR:', e);

      if (isActive) {
        if (e.name === 'AbortError') {
          await speak('El servidor tardó demasiado', SPEECH_PRIORITY_ERROR);
        } else if (e.message?.includes('Network request failed')) {
          await speak('Error de conexión', SPEECH_PRIORITY_ERROR);
        } else if (e.message?.includes('cleartext') || e.message?.includes('HTTP')) {
          await speak('Error de seguridad de red', SPEECH_PRIORITY_ERROR);
        } else {
          await speak('Error analizando la escena', SPEECH_PRIORITY_ERROR);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  // 👇 Test automático en modo debug (descomentar si lo necesitas)
  useEffect(() => {
    if (__DEV__) {
      // testBackendConnection();
    }
  }, []);

  // Limpieza de speech cuando la pantalla se desactiva
  useEffect(() => {
    if (!isActive) {
      Speech.stop();
      lastSpokenPriority.current = 0;
      speakingRef.current = false;
      setBusy(false);
    }
  }, [isActive]);

  // Limpieza total al desmontar
  useEffect(() => {
    return () => {
      Speech.stop();
      lastSpokenPriority.current = 0;
      speakingRef.current = false;
    };
  }, []);

  // 👇 Color del Snackbar según el tipo
  const getSnackbarColor = () => {
    switch (snackbar.type) {
      case 'error':
        return '#d32f2f'; // Rojo
      case 'success':
        return '#388e3c'; // Verde
      case 'info':
        return '#1976d2'; // Azul
      default:
        return '#333';
    }
  };

  return (
    <Pressable
      style={styles.fullscreen}
      onPress={describeScene}
      onLongPress={() => {
        if (!isActive) return;

        // 🔊 SIEMPRE dar feedback de voz
        speak('Presiona la pantalla para describir lo que hay frente a ti', SPEECH_PRIORITY_TEXT);

        // 🔍 Solo adicional en debug
        if (__DEV__) {
         // testBackendConnection();
        }
      }}
    >
      {isActive && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          active={isActive}
          onCameraReady={() => setCameraInitialized(true)}
          onMountError={(error) => {
            console.error('Error montando cámara:', error);
          }}
        />
      )}

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
  debugBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ff9800',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
});