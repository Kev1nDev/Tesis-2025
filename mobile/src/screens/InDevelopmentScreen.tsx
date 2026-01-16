import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function InDevelopmentScreen() {
  // Estado para almacenar la latencia medida en milisegundos
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Cronómetro: simula una llamada a API y calcula el tiempo entre envío y respuesta
  async function measureMockApiLatency() {
    const startedAt = Date.now();
    // Simulación de petición/respuesta (reemplaza por la API real cuando esté disponible)
    await new Promise((resolve) => setTimeout(resolve, 150));
    setLatencyMs(Date.now() - startedAt);
  }

  // Al montar la pantalla: registra en terminal y dispara la medición inicial
  useEffect(() => {
    console.log('InDevelopmentScreen iniciado');
    measureMockApiLatency();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>en desarrollo</Text>
      <Text style={styles.text}>
        Tiempo de respuesta: {latencyMs !== null ? `${latencyMs} ms` : '---'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 16,
  },
  text: {
    fontSize: 18,
    fontWeight: '600',
  },
});