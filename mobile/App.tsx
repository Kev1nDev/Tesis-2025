import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';
import { useAudioPlayer } from 'expo-audio';
import { NavigationContainer } from '@react-navigation/native';

// Pantallas y UI
import ReadingScreen from './src/screens/ReadingScreen';
import DescribeScreen from './src/screens/DescribeScreen';
import DescribeCameraScreen from './src/screens/ShortDescribeScreen';
import GuidedWalkScreen from './src/screens/GuidedWalkScreen';
import { BottomTabBar } from './src/ui/BottomTabBar';
import { SwipePager } from './src/ui/SwipePager';
import { CameraProvider, useCamera } from './src/ui/CameraContext';

// Componente que maneja las pantallas con cámara
const CameraScreens = ({ index }: { index: number }) => {
  const { setActiveScreen } = useCamera();

  useEffect(() => {
    // Actualizar qué pantalla está activa
    const screenKeys = ['lectura', 'detallada', 'rapida', 'caminata'];
    setActiveScreen(screenKeys[index]);
  }, [index]);

  // Solo renderizar la pantalla activa
  switch(index) {
    case 0:
      return <ReadingScreen key="lectura" />;
    case 1:
      return <DescribeScreen key="detallada" />;
    case 2:
      return <DescribeCameraScreen key="rapida" />;
    case 3:
      return <GuidedWalkScreen key="caminata" />;
    default:
      return null;
  }
};

export default function App() {
  const [index, setIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const lottieRef = useRef<LottieView>(null);
  const hasStarted = useRef(false);

  const player = useAudioPlayer(require('./assets/blinking(2).mp3'));

  const startSequence = () => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    player.play();
    setTimeout(() => {
      lottieRef.current?.play();
    }, 50);
  };

  useEffect(() => {
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

  if (!isReady) {
    return (
      <View style={styles.splashContainer} onLayout={startSequence}>
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

  return (
    <CameraProvider>
      <NavigationContainer>
        <SafeAreaProvider>
          <View style={styles.root}>
            <View style={styles.content}>
              <SwipePager 
                index={index} 
                count={tabs.length} 
                onIndexChange={setIndex}
              >
                <CameraScreens index={index} />
              </SwipePager>
            </View>
            <BottomTabBar tabs={tabs} activeIndex={index} onChange={setIndex} />
            <StatusBar style="dark" />
          </View>
        </SafeAreaProvider>
      </NavigationContainer>
    </CameraProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1 },
  splashContainer: {
    flex: 1,
    backgroundColor: '#0B5FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottie: { width: '100%', height: '100%' },
});