// src/screens/ReadingScreen.tsx
import React, { useRef, useState, useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCamera } from '../ui/CameraContext';

const SPEECH_PRIORITY_STATUS = 30;
const SPEECH_PRIORITY_TEXT = 100;
const SPEECH_PRIORITY_ERROR = 200;

// Endpoint de tu servidor (ajusta según tu entorno)
const EC2_ENDPOINT = 'https://az8yec3162js8a-8000.proxy.runpod.net/book';

// ─────────────────────────────────────────────────────────────
// 📦 UTILIDADES TTS
// ─────────────────────────────────────────────────────────────

/**
 * Divide un texto largo en chunks seguros para expo-speech.
 * Respeta oraciones y evita cortar palabras a la mitad.
 * @param text Texto completo a dividir
 * @param maxWords Máximo de palabras por chunk (recomendado: 150-180)
 */
function chunkTextForTTS(text: string, maxWords = 180): string[] {
  if (!text) return [];
  
  // Dividir por oraciones primero (más natural para TTS)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';
  let wordCount = 0;
  
  for (const sentence of sentences) {
    const wordsInSentence = sentence.trim().split(/\s+/).length;
    
    // Si una sola oración es muy larga, dividirla por comas/puntos y coma
    if (wordsInSentence > maxWords) {
      const subParts = sentence.split(/[,;:]/).filter(p => p.trim());
      for (const part of subParts) {
        const partWords = part.trim().split(/\s+/).length;
        if (partWords > maxWords) {
          // División de emergencia por espacio (~1000 chars)
          const emergencyParts = part.trim().match(/.{1,1000}(?:\s|$)/g) || [part];
          chunks.push(...emergencyParts.map(p => p.trim()));
        } else if ((currentChunk + part).split(/\s+/).length <= maxWords) {
          currentChunk += part + ' ';
        } else {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = part + ' ';
        }
      }
    } 
    // Oración normal: agregar si cabe en el chunk actual
    else if (wordCount + wordsInSentence <= maxWords) {
      currentChunk += sentence + ' ';
      wordCount += wordsInSentence;
    } 
    // No cabe: guardar chunk actual y empezar nuevo
    else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence + ' ';
      wordCount = wordsInSentence;
    }
  }
  
  // Agregar último chunk si existe
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(c => c.length > 0);
}

// ─────────────────────────────────────────────────────────────
// 📱 COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────

export default function ReadingScreen() {
  const cameraRef = useRef<CameraView>(null);
  const lastSpokenPriority = useRef(0);
  const [busy, setBusy] = useState(false);
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const welcomeFinished = useRef(false);
  const isFocused = useIsFocused();
  
  // Contexto de cámara
  const { activeScreen, setCameraReady } = useCamera();
  const screenKey = 'lectura';

  // ── Estado para control de TTS chunked ──
  const ttsQueue = useRef<string[]>([]);
  const currentChunkIndex = useRef(0);
  const isSpeaking = useRef(false);
  const stopSpeaking = useRef(false);
  const pausedState = useRef<{ index: number; queue: string[] } | null>(null);

  // ── Marcar cámara como lista ──
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

  const isActive = activeScreen === screenKey && isFocused;

  // ── Función de voz simple (para mensajes cortos) ──
  function speak(text: string, priority = SPEECH_PRIORITY_STATUS) {
    if (!text) return;
    if (!isActive && priority < SPEECH_PRIORITY_TEXT) return;
    
    if (priority >= lastSpokenPriority.current) {
      Speech.stop();
      lastSpokenPriority.current = priority;
      Speech.speak(text, { 
        language: 'es', 
        rate: 0.9,
        pitch: 1.0,
        onDone: () => { if (isActive) lastSpokenPriority.current = 0; } 
      });
    }
  }

  // ── Detener lectura completamente ──
  function stopTTS() {
    stopSpeaking.current = true;
    Speech.stop();
    isSpeaking.current = false;
    ttsQueue.current = [];
    currentChunkIndex.current = 0;
    pausedState.current = null;
  }

  // ── Pausar lectura actual ──
  function pauseTTS() {
    if (isSpeaking.current) {
      Speech.stop();
      pausedState.current = {
        index: currentChunkIndex.current,
        queue: [...ttsQueue.current]
      };
      stopSpeaking.current = true;
      isSpeaking.current = false;
      speak('Lectura pausada. Presiona largo para reanudar.', SPEECH_PRIORITY_STATUS);
    }
  }

  // ── Reanudar lectura desde donde se pausó ──
  function resumeTTS() {
    if (pausedState.current && !isSpeaking.current) {
      stopSpeaking.current = false;
      ttsQueue.current = pausedState.current.queue;
      currentChunkIndex.current = pausedState.current.index;
      pausedState.current = null;
      
      // Reiniciar la cadena desde el chunk actual
      const speakNext = () => {
        if (stopSpeaking.current || !isActive || currentChunkIndex.current >= ttsQueue.current.length) {
          isSpeaking.current = false;
          if (!stopSpeaking.current && currentChunkIndex.current >= ttsQueue.current.length) {
            lastSpokenPriority.current = 0;
          }
          return;
        }
        
        const chunk = ttsQueue.current[currentChunkIndex.current];
        isSpeaking.current = true;
        
        Speech.speak(chunk, {
          language: 'es',
          rate: 0.9,
          pitch: 1.0,
          onDone: () => {
            if (!stopSpeaking.current) {
              currentChunkIndex.current += 1;
              setTimeout(speakNext, 300);
            } else {
              isSpeaking.current = false;
            }
          },
          onError: (error) => {
            console.warn('Error TTS en chunk:', error);
            if (!stopSpeaking.current) {
              currentChunkIndex.current += 1;
              speakNext();
            } else {
              isSpeaking.current = false;
            }
          },
        });
      };
      
      lastSpokenPriority.current = SPEECH_PRIORITY_TEXT;
      speak('Reanudando lectura');
      setTimeout(speakNext, 800);
    }
  }

  // ── Función principal: hablar texto largo con chunking ──
  async function speakChunked(fullText: string, priority = SPEECH_PRIORITY_TEXT) {
    if (!fullText?.trim()) return;
    
    stopTTS();
    stopSpeaking.current = false;
    
    ttsQueue.current = chunkTextForTTS(fullText, 180);
    currentChunkIndex.current = 0;
    
    if (ttsQueue.current.length === 0) return;
    
    const speakNext = () => {
      if (stopSpeaking.current || !isActive || currentChunkIndex.current >= ttsQueue.current.length) {
        isSpeaking.current = false;
        if (!stopSpeaking.current && currentChunkIndex.current >= ttsQueue.current.length) {
          lastSpokenPriority.current = 0;
        }
        return;
      }
      
      const chunk = ttsQueue.current[currentChunkIndex.current];
      isSpeaking.current = true;
      
      Speech.speak(chunk, {
        language: 'es',
        rate: 0.9,
        pitch: 1.0,
        onDone: () => {
          if (!stopSpeaking.current) {
            currentChunkIndex.current += 1;
            setTimeout(speakNext, 300);
          } else {
            isSpeaking.current = false;
          }
        },
        onError: (error) => {
          console.warn('Error TTS en chunk:', error);
          if (!stopSpeaking.current) {
            currentChunkIndex.current += 1;
            speakNext();
          } else {
            isSpeaking.current = false;
          }
        },
      });
    };
    
    lastSpokenPriority.current = priority;
    speakNext();
  }

  function vibrateConfirm() {
    Vibration.vibrate([0, 50, 50, 50]);
  }

  // ── Mensaje de bienvenida (solo primera vez) ──
  const hasSpokenWelcome = useRef(false);
  
  useEffect(() => {
    if (!hasSpokenWelcome.current) {
      const welcome = "Bienvenido a Tiflex App. Desliza horizontalmente la barra inferior para cambiar entre modos: lectura, descripción detallada, descripción rápida y modo caminata. Todos ellos son cámaras con diferentes objetivos, presiona prolongadamente cada una para escuchar su utilidad. Para una mejor experiencia, camina con asistencia o bastón guiador, especialmente en modo caminata.";
      
      Speech.stop();
      
      Speech.speak(welcome, {
        language: 'es',
        rate: 1.0,
        onDone: () => {
          welcomeFinished.current = true;
          hasSpokenWelcome.current = true;
        },
        onStopped: () => {
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

  // ── Función principal: capturar y leer texto ──
  async function describe() {
    if (!isActive) {
      console.log('⏸️ ReadingScreen no está activa, ignorando captura');
      return;
    }
    
    if (!cameraRef.current || busy) return;

    setBusy(true);
    lastSpokenPriority.current = 0;
    stopTTS(); // Limpiar cualquier lectura previa

    try {
      vibrateConfirm();
      speak('Capturando página');

      const photo = await cameraRef.current.takePictureAsync({ 
        quality: 0.8, 
        skipProcessing: false
      });

      if (!isActive) { setBusy(false); return; }

      const processed = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      if (!isActive) { setBusy(false); return; }

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
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      if (!isActive) { setBusy(false); return; }

      const result = await response.json();
      const textToSpeak = result.text?.trim();
      
      if (isActive) {
        if (textToSpeak && textToSpeak !== "No se detectó texto") {
          // ✅ Usar chunking para textos largos
          speakChunked(textToSpeak, SPEECH_PRIORITY_TEXT);
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

  // ── Manejo de long press: pausa/reanudar O explicación ──
  function handleLongPress() {
    if (!isActive) return;
    
    // Si hay lectura en curso o pausada → alternar pausa/reanudar
    if (isSpeaking.current || pausedState.current) {
      if (isSpeaking.current) {
        pauseTTS();
      } else if (pausedState.current) {
        resumeTTS();
      }
      return;
    }
    
    // Si no hay lectura activa → mostrar explicación de la función
    if (welcomeFinished.current) {
      speak(
        'Modo lectura de texto. Presiona una vez para capturar y leer el texto frente a ti. ' +
        'Si el texto es largo, se leerá automáticamente en partes. ' +
        'Presiona prolongadamente durante la lectura para pausar o reanudar.', 
        SPEECH_PRIORITY_STATUS
      );
    }
  }

  // ── Limpieza al desactivar pantalla ──
  useEffect(() => {
    if (!isActive) {
      stopTTS();
      setBusy(false);
    }
  }, [isActive]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => stopTTS();
  }, []);

  // ── Renderizado ──
  return (
    <Pressable
      style={styles.fullscreen}
      onPress={describe}
      onLongPress={handleLongPress}
    >
      {isActive && (
        <CameraView 
          ref={cameraRef} 
          style={StyleSheet.absoluteFill} 
          facing="back" 
          active={isActive}
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