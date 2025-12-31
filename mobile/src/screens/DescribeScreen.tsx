import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, Platform } from 'react-native';
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

  useEffect(() => {
    (async () => {
      try {
        assertEnv();

        await requestCamPermission();
        await Audio.requestPermissionsAsync();
        await Location.requestForegroundPermissionsAsync();

        speak('Cámara lista. Toque la pantalla para describir su entorno.');
      } catch (e) {
        speak('Error al iniciar la aplicación.');
      }
    })();
  }, []);

  function speak(text: string) {
    Speech.stop();
    Speech.speak(text, {
      language: 'es-ES',
      rate: 0.95,
      pitch: 1.0,
    });
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
      setBusy(false);
    }
  }

  return (
    <Pressable style={styles.fullscreen} onPress={describe}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: 'black',
  },
});
