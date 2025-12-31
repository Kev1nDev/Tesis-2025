import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
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
