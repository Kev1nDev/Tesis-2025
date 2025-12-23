import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DescribeScreen } from './src/screens/DescribeScreen';
import { PlaceholderScreen } from './src/screens/PlaceholderScreen';
import { SwipePager } from './src/ui/SwipePager';

export default function App() {
  const [index, setIndex] = useState(0);

  const screens = [
    <DescribeScreen key="describe" />,
    <PlaceholderScreen
      key="history"
      title="Historial (placeholder)"
      description="Aquí irán las descripciones anteriores, con métricas (latencia, confianza, modo)."
    />,
    <PlaceholderScreen
      key="settings"
      title="Ajustes (placeholder)"
      description="Aquí podrás configurar el endpoint, modo por defecto y política precisión/latencia."
    />,
  ];

  return (
    <View style={styles.root}>
      <SwipePager index={index} count={screens.length} onIndexChange={setIndex}>
        {screens[index]}
      </SwipePager>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
