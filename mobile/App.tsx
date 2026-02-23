import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';
import { useAudioPlayer } from 'expo-audio'; // Nueva librería
import { NavigationContainer } from '@react-navigation/native';

// Pantallas y UI
import ReadingScreen from './src/screens/ReadingScreen';
import DescribeScreen from './src/screens/DescribeScreen';
import DescribeCameraScreen from './src/screens/ShortDescribeScreen';
import GuidedWalkScreen from './src/screens/GuidedWalkScreen';
import { BottomTabBar } from './src/ui/BottomTabBar';
import { SwipePager } from './src/ui/SwipePager';

export default function App() {
  const [index, setIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const lottieRef = useRef<LottieView>(null);
  const hasStarted = useRef(false);

  // 1. Cargamos el reproductor de audio con el archivo MP3
  // Asegúrate de que el archivo exista en: ./assets/bienvenida.mp3
  const player = useAudioPlayer(require('./assets/blinking(2).mp3'));

  // Función que lanza audio y video simultáneamente
  const startSequence = () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    // 2. Reproducimos el audio
    player.play();

    // 3. Iniciamos la animación
    // Un micro-retraso de 50ms ayuda a que el hilo de audio respire
    setTimeout(() => {
      lottieRef.current?.play();
    }, 50);
  };

  useEffect(() => {
    // Timer de seguridad por si la animación no termina
    const backupTimer = setTimeout(() => {
      if (!isReady) setIsReady(true);
    }, 8000);

    return () => clearTimeout(backupTimer);
  }, [isReady]);

  const tabs = [
    { key: 'lectura', label: 'Lectura' },
    { key: 'detallada', label: 'Descripción\nDetallada' },
    { key: 'rapida', label: 'Descripción\nRápida' },
    { key: 'caminata', label: 'Modo\nCaminata' },
  ];

  const screens = [
    <ReadingScreen key="lectura" />,
    <DescribeScreen key="detallada" />,
    <DescribeCameraScreen key="rapida" />,
    <GuidedWalkScreen key="caminata" />,
  ];

  // Pantalla de Carga (Splash)
  if (!isReady) {
    return (
      <View 
        style={styles.splashContainer} 
        onLayout={startSequence} 
      >
        <LottieView
          ref={lottieRef}
          source={require('./assets/animacion.json')}
          autoPlay={false} 
          loop={false}
          style={styles.lottie}
          resizeMode="contain"
          onAnimationFinish={() => setIsReady(true)}
          renderMode="HARDWARE"
          enableMergePathsAndroidForKitKatAndAbove={true}
        />
        <StatusBar style="light" />
      </View>
    );
  }

  // Interfaz Principal
  return (
    <NavigationContainer>
      <SafeAreaProvider>
        <View style={styles.root}>
          <View style={styles.content}>
            <SwipePager index={index} count={screens.length} onIndexChange={setIndex}>
              {screens[index]}
          </SwipePager>
        </View>

        <BottomTabBar tabs={tabs} activeIndex={index} onChange={setIndex} />
        
        <StatusBar style="dark" />
      </View>
    </SafeAreaProvider>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  root: { 
    flex: 1, 
    backgroundColor: '#fff' 
  },
  content: { 
    flex: 1 
  },
  splashContainer: {
    flex: 1,
    backgroundColor: '#0B5FFF', // Color azul del Splash
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottie: { 
    width: '100%', 
    height: '100%' 
  },
});