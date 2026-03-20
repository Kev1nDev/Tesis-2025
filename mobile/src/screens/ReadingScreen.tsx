// src/screens/ReadingScreen.tsx
import React, { useRef, useState, useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCamera } from '../ui/CameraContext'; // Ajusta la ruta

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

// Asegúrate de que esta IP sea la correcta de tu instancia EC2
const EC2_ENDPOINT = 'http://16.58.82.203:8000/book';

export default function ReadingScreen() {
  const cameraRef = useRef<CameraView>(null);
  const lastSpokenPriority = useRef(0);
  const [busy, setBusy] = useState(false);
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const welcomeFinished = useRef(false);
  const isFocused = useIsFocused();
  
  // Usar el contexto de cámara
  const { activeScreen, setCameraReady } = useCamera();
  const screenKey = 'lectura';

  // Marcar cuando la cámara está lista
  useEffect(() => {
    if (cameraInitialized) {
      setCameraReady(screenKey, true);
      console.log(`📷 Cámara ${screenKey} (lectura) lista`);
    }
    return () => {
      setCameraReady(screenKey, false);
      console.log(`📷 Cámara ${screenKey} (lectura) liberada`);
    };
  }, [cameraInitialized]);

  // Solo renderizar completamente cuando esta pantalla está activa
  const isActive = activeScreen === screenKey && isFocused;

  // Función de voz optimizada
  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    if (!text) return;
    
    // Verificar que la pantalla sigue activa antes de hablar
    if (!isActive && priority < SPEECH_PRIORITY_TEXT) return;
    
    // Si es un error o texto final, permitimos interrumpir estados anteriores
    if (priority >= lastSpokenPriority.current) {
      Speech.stop();
      lastSpokenPriority.current = priority;
      Speech.speak(text, { 
        language: 'es', 
        rate: 0.9,
        pitch: 1.0,
        onDone: () => { 
          if (isActive) {
            lastSpokenPriority.current = 0; 
          }
        } 
      });
    }
  }

  function vibrateConfirm() {
    Vibration.vibrate([0, 50, 50, 50]);
  }

      // Ref para controlar que el mensaje solo se diga una vez por sesión
    const hasSpokenWelcome = useRef(false);
  
    // Efecto que se ejecuta SOLO en el primer montaje
    useEffect(() => {
      if (!hasSpokenWelcome.current) {
        const welcome = "Bienvenido a Tiflex App. Desliza horizontalmente la barra inferior para cambiar entre modos: lectura, descripción detallada, descripción rápida y modo caminata. Todos ellos son cámaras con diferentes objetivos, presiona prolongadamente cada una para escuchar su utilidad. Para una mejor experiencia, camina con asistencia o bastón guiador, especialmente en modo caminata.";
        
        // 🔥 Detener cualquier audio previo
        Speech.stop();
        
        Speech.speak(welcome, {
          language: 'es',
          rate: 1.0,
          onDone: () => {
            welcomeFinished.current = true;
            hasSpokenWelcome.current = true;
          },
          onStopped: () => { // 👈 AGREGAR ESTO
            welcomeFinished.current = true;
            hasSpokenWelcome.current = true;
          },
          onError: () => {
            welcomeFinished.current = true;
            hasSpokenWelcome.current = true;
          }
        });
      }
    }, []);

  async function describe() {
    if (!isActive) {
      console.log('⏸️ ReadingScreen no está activa, ignorando captura');
      return;
    }
    
    if (!cameraRef.current || busy) return;

    setBusy(true);
    lastSpokenPriority.current = 0;

    try {
      vibrateConfirm();
      speak('Capturando página');

      const photo = await cameraRef.current.takePictureAsync({ 
        quality: 0.8, 
        skipProcessing: false
      });

      if (!isActive) {
        console.log('⏸️ Pantalla desactivada durante captura, cancelando');
        setBusy(false);
        return;
      }

      const processed = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      if (!isActive) {
        console.log('⏸️ Pantalla desactivada durante procesamiento, cancelando');
        setBusy(false);
        return;
      }

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
        },
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      if (!isActive) {
        console.log('⏸️ Pantalla desactivada antes de procesar respuesta');
        setBusy(false);
        return;
      }

      const result = await response.json();
      const textToSpeak = result.text?.trim();
      
      if (isActive) {
        if (textToSpeak && textToSpeak !== "No se detectó texto") {
          speak(textToSpeak, SPEECH_PRIORITY_TEXT);
        } else {
          speak('No pude identificar texto claro. Intenta acercar un poco más la cámara.', SPEECH_PRIORITY_TEXT);
        }
      }

    } catch (e) {
      console.error('ERROR EN /BOOK:', e);
      if (isActive) {
        speak('Error de comunicación con el servidor', SPEECH_PRIORITY_ERROR);
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
      setBusy(false);
    }
  }, [isActive]);

  return (
    <Pressable
      style={styles.fullscreen}
      onPress={describe}
      onLongPress={() => {
        if (!isActive) return;
        
        // 🔥 Solo decir explicación si YA terminó la bienvenida
        if (welcomeFinished.current) {
          speak('Presiona una vez para leer el texto frente a ti.', SPEECH_PRIORITY_STATUS);
        }
      }}
    >
      {isActive && (
        <CameraView 
          ref={cameraRef} 
          style={StyleSheet.absoluteFill} 
          facing="back" 
          active={isActive}
          // ✅ CAMBIO CLAVE: Flash siempre encendido cuando la cámara está activa
          flash="on"
          onCameraReady={() => setCameraInitialized(true)}
          onMountError={(error) => console.error('Error montando cámara en lectura:', error)}
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