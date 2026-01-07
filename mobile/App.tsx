import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import * as Speech from "expo-speech";
import { AppState } from "react-native";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from 'react-native';
import ReadingScreen from './src/screens/ReadingScreen';
import DescribeCameraScreen from './src/screens/ShortDescribeScreen';
//import { HistoryScreen } from './src/screens/HistoryScreen';
import { InDevelopmentScreen } from './src/screens/InDevelopmentScreen';
import { BottomTabBar } from './src/ui/BottomTabBar';
import { SwipePager } from './src/ui/SwipePager';
import React from 'react';
import DescribeScreen from './src/screens/DescribeScreen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  const [index, setIndex] = useState(0);

  const appState = useRef(AppState.currentState);
  const hasWelcomed = useRef(false);

  useEffect(() => {
    const speakWelcome = () => {
      if (hasWelcomed.current) return;

      hasWelcomed.current = true;

      Speech.stop();
      Speech.speak("Bienvenido a la App de Descripción del Entorno", {
        language: "es-ES",
        rate: 0.95,
      });
    };

    // Se ejecuta solo al arranque real de la app
    speakWelcome();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      // Si vuelve desde background → NO hablar
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, []);

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
    <InDevelopmentScreen key="caminata" />,
  ];

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <View style={styles.content}>
        <SwipePager index={index} count={screens.length} onIndexChange={setIndex}>
          {screens[index]}
        </SwipePager>
        </View>

        <BottomTabBar tabs={tabs} activeIndex={index} onChange={setIndex} />

        <StatusBar style="auto" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
  },
});
