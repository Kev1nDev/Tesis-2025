import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, Platform, ActivityIndicator } from 'react-native'; 
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { useIsFocused } from '@react-navigation/native';

import { assertEnv } from '../config/env';

// 🔥 URL de tu EC2
const EC2_URL = 'http://16.58.82.203:8000';

export default function DescribeScreen() {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const isFocused = useIsFocused();
  const SPEECH_PRIORITY_STATUS = 30;
  const SPEECH_PRIORITY_TEXT = 100;
  const SPEECH_PRIORITY_ERROR = 200;
  const lastSpokenPriority = useRef(0);

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

  // 🔥 CORREGIDO: Ahora recibe SOLO el base64 como string
  async function describeEnvironment(imageBase64: string) {
    try {
      const formData = new FormData();
      
      // CORREGIDO: La forma correcta de enviar archivos en React Native
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
          // No pongas 'Content-Type' aquí, fetch lo pone automáticamente con el boundary
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data; // data.response contiene la descripción

    } catch (error) {
      console.error('Error describiendo con EC2:', error);
      throw error;
    }
  }

  async function describe() {
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

      // Opcional: Obtener ubicación (no se usa en el endpoint pero lo mantenemos)
      const location = await Location.getCurrentPositionAsync({});
      console.log('📍 Ubicación:', location.coords);

      speak('Analizando el entorno');

      // 🔥 CORREGIDO: Pasamos SOLO el base64, no el objeto payload completo
      const result = await describeEnvironment(photo.base64);
      
      // 🔥 CORREGIDO: Accedemos a result.response que es lo que devuelve el endpoint
      speak(result.response);

    } catch (e) {
      console.error('Error en describe:', e);
      speak('Ocurrió un error al describir el entorno');
    } finally {
      setBusy(false);
    }
  }

  // Función para probar la conexión (opcional)
  async function testConnection() {
    try {
      const response = await fetch(`${EC2_URL}/health`);
      const data = await response.json();
      console.log('✅ Conexión exitosa a EC2:', data);
      return true;
    } catch (error) {
      console.error('❌ No se puede conectar a EC2:', error);
      return false;
    }
  }

  return (
    <Pressable 
      style={styles.fullscreen} 
      onPress={describe}      
      onLongPress={() =>
          speak('Presiona la pantalla para describir la escena a detalle', SPEECH_PRIORITY_STATUS)
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
    position: "absolute",
    top: '40%',
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 30,
    borderRadius: 20,
    zIndex: 10,
  }
});