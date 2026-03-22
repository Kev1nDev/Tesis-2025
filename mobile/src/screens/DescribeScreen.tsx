// DescribeScreen.tsx (Descripción Detallada)
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, Platform, ActivityIndicator } from 'react-native'; 
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { useIsFocused } from '@react-navigation/native';

import { assertEnv } from '../config/env';
import { useCamera } from '../ui/CameraContext'; // Ajusta la ruta

// 🔥 URL de tu EC2
const EC2_URL = 'http://16.58.82.203:8000';

export default function DescribeScreen() {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [cameraInitialized, setCameraInitialized] = useState(false);
  
  const cameraRef = useRef<CameraView>(null);
  const isFocused = useIsFocused();
  
  // Usar el contexto de cámara
  const { activeScreen, setCameraReady } = useCamera();
  const screenKey = 'detallada';
  
  // Prioridades de speech
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

  // Solo renderizar completamente cuando esta pantalla está activa
  const isActive = activeScreen === screenKey && isFocused;

  useEffect(() => {
    (async () => {
      try {
        assertEnv();
        await requestCamPermission();
        await Audio.requestPermissionsAsync();
        await Location.requestForegroundPermissionsAsync();
      } catch (e) {
        speak('Error al iniciar la aplicación.');
      }
    })();
  }, []);

  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    console.log('SPEAK:', text, 'PRIORITY:', priority);
    if (!text || priority < lastSpokenPriority.current) return;

    Speech.stop();
    lastSpokenPriority.current = priority;
    Speech.speak(text, { language: 'es', rate: 0.95, pitch: 1 });
  }

  async function describeEnvironment(imageBase64: string) {
    try {
      const formData = new FormData();
      
      formData.append('file', {
        uri: `data:image/jpeg;base64,${imageBase64}`,
        type: 'image/jpeg',
        name: 'photo.jpg'
      } as any);
      
      formData.append('prompt', 'Describe esta escena en detalle para una persona con discapacidad visual');
      formData.append('system_prompt', 'Eres un asistente especializado en describir imágenes para personas ciegas. Tus descripciones deben ser detalladas, útiles y en español natural.');
      formData.append('temperature', '0.7');
      formData.append('max_tokens', '1024');
      formData.append('translate', 'true');
      formData.append('use_blip_first', 'true');

      const response = await fetch(`${EC2_URL}/describe`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Error describiendo con EC2:', error);
      throw error;
    }
  }

  async function describe() {
    // Verificar que la pantalla está activa antes de proceder
    if (!isActive) {
      console.log('⏸️ DescribeScreen no está activa, ignorando captura');
      return;
    }
    
    if (busy || !cameraRef.current) return;
    
    setBusy(true);

    try {
      speak('Capturando imagen');

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
      });

      if (!photo?.base64) {
        throw new Error('No se pudo capturar la imagen');
      }

      // Verificar nuevamente si seguimos activos después de la captura
      if (!isActive) {
        console.log('⏸️ Pantalla desactivada durante captura, cancelando');
        setBusy(false);
        return;
      }

      // Opcional: Obtener ubicación
      const location = await Location.getCurrentPositionAsync({});
      console.log('📍 Ubicación:', location.coords);

      speak('Analizando el entorno');

      const result = await describeEnvironment(photo.base64);
      
      // Verificar una vez más si seguimos activos antes de hablar
      if (isActive) {
        speak(result.response, SPEECH_PRIORITY_TEXT);
      }

    } catch (e) {
      console.error('Error en describe:', e);
      if (isActive) {
        speak('Ocurrió un error al describir el entorno', SPEECH_PRIORITY_ERROR);
      }
    } finally {
      setBusy(false);
    }
  }

  // Limpiar speech cuando la pantalla se desactiva
  useEffect(() => {
    if (!isActive) {
      Speech.stop();
      lastSpokenPriority.current = 0;
    }
  }, [isActive]);

  return (
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
          active={isActive}  // ← ¡ESTA LÍNEA ES CRUCIAL!
          onCameraReady={() => setCameraInitialized(true)}
          onMountError={(error) => console.error('Error montando cámara:', error)}
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
    position: "absolute",
    top: '40%',
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 30,
    borderRadius: 20,
    zIndex: 10,
  }
});