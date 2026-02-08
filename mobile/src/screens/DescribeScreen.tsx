import React, { useEffect, useRef, useState } from 'react';
// Añadimos ActivityIndicator a las importaciones
import { StyleSheet, View, Pressable, Platform, ActivityIndicator } from 'react-native'; 
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';

import { describeEnvironment } from '../services/descriptionApi';
import { assertEnv } from '../config/env';

export default function DescribeScreen() {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<CameraView>(null);
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

  async function describe() {
    if (busy || !cameraRef.current) return;
    setBusy(true); // <--- El spinner aparece aquí

    try {
      speak('Capturando imagen');

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
      });

      const location = await Location.getCurrentPositionAsync({});

      const payload = {
        imageBase64: photo.base64,
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
      speak(result.description);

    } catch (e) {
      speak('Ocurrió un error al describir el entorno');
    } finally {
      setBusy(false); // <--- El spinner desaparece aquí
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
      />

      {/* --- CÓDIGO DEL ACTIVITY INDICATOR --- */}
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
  // Estilo idéntico al de WalkMode para mantener coherencia
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