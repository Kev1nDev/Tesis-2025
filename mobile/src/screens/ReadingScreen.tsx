import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import * as ImageManipulator from 'expo-image-manipulator';

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

// Asegúrate de que esta IP sea la correcta de tu instancia EC2
const EC2_ENDPOINT = 'http://16.58.82.203:8000/book';

export default function ReadingScreen() {
  const cameraRef = useRef<CameraView>(null);
  const lastSpokenPriority = useRef(0);
  const [busy, setBusy] = useState(false);
  const isFocused = useIsFocused();

  // Función de voz optimizada
  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    if (!text) return;
    
    // Si es un error o texto final, permitimos interrumpir estados anteriores
    if (priority >= lastSpokenPriority.current) {
      Speech.stop();
      lastSpokenPriority.current = priority;
      Speech.speak(text, { 
        language: 'es', 
        rate: 0.9, // Un poco más lento para mejor comprensión de lectura
        pitch: 1.0,
        onDone: () => { lastSpokenPriority.current = 0; } 
      });
    }
  }

  function vibrateConfirm() {
    Vibration.vibrate([0, 50, 50, 50]); // Doble pulso corto
  }

  async function describe() {
    if (!cameraRef.current || busy) return;

    setBusy(true);
    lastSpokenPriority.current = 0; // Reset de prioridad para nueva captura

    try {
      vibrateConfirm();
      speak('Capturando página');

      // 1. Captura con calidad balanceada
      const photo = await cameraRef.current.takePictureAsync({ 
        quality: 0.8, 
        skipProcessing: false
      });

      // 2. PRE-PROCESAMIENTO PRO: 
      // Ajustamos a 1200px para que el doble chequeo del servidor tenga detalle
      const processed = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      speak('Analizando texto');

      const formData = new FormData();
      // @ts-ignore
      formData.append('file', {
        uri: processed.uri,
        name: 'reading.jpg',
        type: 'image/jpeg',
      });

      const response = await fetch(EC2_ENDPOINT, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          // IMPORTANTE: Dejar que el sistema gestione el Content-Type solo
        },
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const result = await response.json();
      
      // El servidor ahora devuelve el texto tras el doble chequeo
      const textToSpeak = result.text?.trim();
      
      if (textToSpeak && textToSpeak !== "No se detectó texto") {
        speak(textToSpeak, SPEECH_PRIORITY_TEXT);
      } else {
        speak('No pude identificar texto claro. Intenta acercar un poco más la cámara.', SPEECH_PRIORITY_TEXT);
      }

    } catch (e) {
      console.error('ERROR EN /BOOK:', e);
      speak('Error de comunicación con el servidor', SPEECH_PRIORITY_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      style={styles.fullscreen}
      onPress={describe}
      onLongPress={() => speak('Modo lectura. Presiona una vez para leer el texto frente a ti.', SPEECH_PRIORITY_STATUS)}
    >
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" active={isFocused} />
      
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