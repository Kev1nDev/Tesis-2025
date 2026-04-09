// DescribeScreen.tsx (Descripción Detallada)
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, Platform, ActivityIndicator, SafeAreaView } from 'react-native'; 
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { useIsFocused } from '@react-navigation/native';
import { Snackbar, Text, IconButton } from 'react-native-paper';

import { assertEnv } from '../config/env';
import { useCamera } from '../ui/CameraContext';

//const EC2_URL = 'http://16.58.82.203:8000';
const EC2_URL = 'https://az8yec3162js8a-8000.proxy.runpod.net';

export default function DescribeScreen() {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [cameraInitialized, setCameraInitialized] = useState(false);
  
  // 👇 Estado para Snackbar de Paper
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    type: 'error' | 'success' | 'info';
  }>({ visible: false, message: '', type: 'info' });

  const cameraRef = useRef<CameraView>(null);
  const isFocused = useIsFocused();
  
  const { activeScreen, setCameraReady } = useCamera();
  const screenKey = 'detallada';
  
  const SPEECH_PRIORITY_STATUS = 30;
  const SPEECH_PRIORITY_TEXT = 100;
  const SPEECH_PRIORITY_ERROR = 200;
  const lastSpokenPriority = useRef(0);

  // Marcar cuando la cámara está lista
  useEffect(() => {
    if (cameraInitialized) {
      setCameraReady(screenKey, true);
      console.log(`📷 Cámara ${screenKey} (detallada) lista`);
    }
    return () => {
      setCameraReady(screenKey, false);
      console.log(`📷 Cámara ${screenKey} (detallada) liberada`);
    };
  }, [cameraInitialized]);

  const isActive = activeScreen === screenKey && isFocused;

  useEffect(() => {
    (async () => {
      try {
        assertEnv();
        await requestCamPermission();
        await Audio.requestPermissionsAsync();
        await Location.requestForegroundPermissionsAsync();
      } catch (e) {
        speak('Error al iniciar la aplicación.', SPEECH_PRIORITY_ERROR);
        showErrorSnackbar('Error de permisos', e);
      }
    })();
  }, []);

  // 👇 Helpers para Snackbar
  const showErrorSnackbar = (message: string, error?: any) => {
    let fullMessage = message;
    if (error?.message) {
      if (error.message.includes('Network request failed')) {
        fullMessage += '\n🔌 Verifica: IP, puerto 8000, cleartext';
      } else if (error.message.includes('cleartext') || error.message.includes('HTTP')) {
        fullMessage += '\n🔐 HTTP no permitido';
      } else if (error.message.includes('timeout')) {
        fullMessage += '\n⏱️ Timeout del servidor';
      } else {
        fullMessage += `\n${error.message}`;
      }
    }
    console.error('🚨 SNACKBAR ERROR:', fullMessage);
    setSnackbar({ visible: true, message: fullMessage, type: 'error' });
  };

  const showSuccessSnackbar = (message: string) => {
    setSnackbar({ visible: true, message, type: 'success' });
  };

  const showInfoSnackbar = (message: string) => {
    setSnackbar({ visible: true, message, type: 'info' });
  };

  const getSnackbarColor = () => {
    switch (snackbar.type) {
      case 'error': return '#d32f2f';
      case 'success': return '#388e3c';
      case 'info': return '#1976d2';
      default: return '#333';
    }
  };

  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    console.log('SPEAK:', text, 'PRIORITY:', priority);
    if (!text || priority < lastSpokenPriority.current) return;

    Speech.stop();
    lastSpokenPriority.current = priority;
    Speech.speak(text, { language: 'es', rate: 0.95, pitch: 1 });
  }

  // 👇 Función corregida: recibe URI, NO base64
  async function describeEnvironment(imageUri: string) {
    try {
      const formData = new FormData();
      
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'photo.jpg',
      } as any);
      
      formData.append('prompt', 'Describe esta escena en detalle para una persona con discapacidad visual');
      formData.append('system_prompt', 'Eres un asistente especializado en describir imágenes para personas ciegas. Tus descripciones deben ser detalladas, útiles y en español natural. DESCRIBE SOLO LO QUE VEAS, NO INVENTES.');
      formData.append('temperature', '0.1');        // 🔥 REDUCIDO para menos especulación
      formData.append('max_tokens', '512');         // 🔥 REDUCIDO para respuestas concisas
      formData.append('translate', 'true');
      formData.append('use_blip_first', 'false');   // 🔥 Usar Moondream por defecto
      formData.append('use_moondream', 'true');     // 🔥 Activar Moondream

      console.log('📤 Enviando a:', `${EC2_URL}/describe`);

      const response = await fetch(`${EC2_URL}/describe`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });

      // 🔥 LOG COMPLETO DEL RESPONSE PARA DEBUG
      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Sin detalles');
        console.error('❌ Error response body:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Response data:', JSON.stringify(data, null, 2).slice(0, 500) + '...');
      return data;

    } catch (error) {
      console.error('❌ Error describiendo con EC2:', error);
      throw error;
    }
  }

  async function describe() {
    if (!isActive) {
      console.log('⏸️ DescribeScreen no está activa, ignorando captura');
      return;
    }
    
    if (busy || !cameraRef.current) return;
    
    setBusy(true);

    try {
      speak('Capturando imagen');

      const photo = await cameraRef.current.takePictureAsync({
        base64: false,
        quality: 0.7,
      });

      if (!photo?.uri) {
        throw new Error('No se pudo capturar la imagen');
      }

      if (!isActive) {
        setBusy(false);
        return;
      }

      // Ubicación opcional
      try {
        const location = await Location.getCurrentPositionAsync({ 
          accuracy: Location.Accuracy.Balanced 
        });
        console.log('📍 Ubicación:', location.coords);
      } catch (locErr) {
        console.log('⚠️ Ubicación no disponible:', locErr);
      }

      speak('Analizando el entorno');

      const result = await describeEnvironment(photo.uri);
      
      if (isActive && result?.response) {
        speak(result.response, SPEECH_PRIORITY_TEXT);
        showSuccessSnackbar('✅ Escena descrita');
      }

    } catch (e: any) {
      console.error('❌ Error en describe:', e);
      
      if (isActive) {
        if (e.message?.includes('Network request failed')) {
          showErrorSnackbar('🔌 Sin conexión al servidor', e);
          speak('Error de conexión', SPEECH_PRIORITY_ERROR);
        } else if (e.message?.includes('HTTP 4') || e.message?.includes('HTTP 5')) {
          showErrorSnackbar('⚠️ Error del servidor', e);
          speak('Error en el procesamiento', SPEECH_PRIORITY_ERROR);
        } else if (e.message?.includes('cleartext') || e.message?.includes('HTTP')) {
          showErrorSnackbar('🔐 HTTP no permitido', e);
          speak('Error de seguridad de red', SPEECH_PRIORITY_ERROR);
        } else {
          showErrorSnackbar('❌ Error: ' + (e.message || 'Desconocido'), e);
          speak('Ocurrió un error al describir el entorno', SPEECH_PRIORITY_ERROR);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  // Limpieza de speech cuando la pantalla se desactiva
  useEffect(() => {
    if (!isActive) {
      Speech.stop();
      lastSpokenPriority.current = 0;
      setBusy(false);
    }
  }, [isActive]);

  // Limpieza total al desmontar
  useEffect(() => {
    return () => {
      Speech.stop();
      lastSpokenPriority.current = 0;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Pressable 
        style={styles.fullscreen} 
        onPress={describe}      
        onLongPress={() => {
          if (isActive) {
            speak('Presiona la pantalla para describir la escena a detalle', SPEECH_PRIORITY_STATUS);
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
              showErrorSnackbar('📷 Error de cámara', error);
            }}
          />
        )}

        {busy && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#0b5fff" />
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  fullscreen: {
    flex: 1,
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
  // 🔥 Snackbar SIEMPRE visible encima de la cámara
  snackbar: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 20 : 40,  // Más margen en Android
    left: 12,
    right: 12,
    zIndex: 100,  // 🔥 CRÍTICO: encima de la cámara
    elevation: 10,  // 🔥 Android shadow
    borderRadius: 8,
  },
  snackbarText: {
    color: '#fff',
    fontWeight: '500',
    lineHeight: 20,  // Mejor legibilidad
  },
});