import { useEffect, useMemo, useState } from 'react';
import { Button, Platform, StyleSheet, Text, View } from 'react-native';
import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { assertEnv } from '../config/env';
import { describeEnvironment } from '../services/descriptionApi';
import type { DescribeRequest } from '../types/description';
import React from 'react';

type DescribeMode = 'balanced' | 'accurate' | 'fast';

export function DescribeScreen() {
  const [cameraGranted, setCameraGranted] = useState<boolean | null>(null);
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);

  const [mode, setMode] = useState<DescribeMode>('balanced');
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastDescription, setLastDescription] = useState<string | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);

  const permissionSummary = useMemo(() => {
    const parts = [
      `Cámara: ${cameraGranted === null ? '—' : cameraGranted ? 'OK' : 'DENEGADO'}`,
      `Micrófono: ${micGranted === null ? '—' : micGranted ? 'OK' : 'DENEGADO'}`,
      `GPPS: ${locationGranted === null ? '—' : locationGranted ? 'OK' : 'DENEGADO'}`,
    ];
    return parts.join(' · ');
  }, [cameraGranted, micGranted, locationGranted]);

  useEffect(() => {
    try {
      assertEnv();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  async function requestPermissions(): Promise<void> {
    setLastError(null);

    const cam = await Camera.requestCameraPermissionsAsync();
    setCameraGranted(cam.granted);

    const mic = await Audio.requestPermissionsAsync();
    setMicGranted(mic.granted);

    const loc = await Location.requestForegroundPermissionsAsync();
    setLocationGranted(loc.granted);
  }

  function nextMode(): void {
    setMode((prev) => {
      if (prev === 'balanced') return 'accurate';
      if (prev === 'accurate') return 'fast';
      return 'balanced';
    });
  }

  async function describeNow(): Promise<void> {
    setBusy(true);
    setLastError(null);
    setLastDescription(null);
    setLastLatencyMs(null);
    setLastConfidence(null);

    try {
      assertEnv();

      const capturedAtIso = new Date().toISOString();

      let location: DescribeRequest['sensors']['location'] | undefined;
      if (locationGranted) {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        location = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy ?? undefined,
        };
      }

      const payload: DescribeRequest = {
        sensors: { capturedAtIso, location },
        mode,
      };

      const t0 = globalThis.performance?.now?.() ?? Date.now();
      const result = await describeEnvironment(payload);
      const t1 = globalThis.performance?.now?.() ?? Date.now();

      setLastLatencyMs(Math.max(0, Math.round(t1 - t0)));
      setLastDescription(result.description);
      setLastConfidence(typeof result.confidence === 'number' ? result.confidence : null);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Descripción del entorno (Cloud)</Text>
      <Text style={styles.subtitle}>
        {Platform.select({
          web: 'En web prototipas UI; para cámara/mic usa dispositivo o emulador.',
          default: 'Objetivo: precisión alta con latencia razonable y medible.',
        })}
      </Text>

      <View style={styles.block}>
        <Text style={styles.label}>Permisos</Text>
        <Text style={styles.text}>{permissionSummary}</Text>
        <Button title="Solicitar permisos" onPress={requestPermissions} />
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Modo</Text>
        <Text style={styles.text}>Actual: {mode}</Text>
        <Button title="Cambiar modo (balanced/accurate/fast)" onPress={nextMode} />
        <Text style={styles.hint}>
          En tesis normalmente defines un modo “balanced” como política: si baja confianza, reintenta con “accurate”.
        </Text>
      </View>

      <View style={styles.block}>
        <Button title={busy ? 'Procesando…' : 'Describir ahora'} onPress={describeNow} disabled={busy} />
        <Text style={styles.hint}>Por ahora envía timestamp + GPS (si permitido). Luego cableamos foto/audio.</Text>
      </View>

      {lastError ? (
        <View style={styles.block}>
          <Text style={styles.label}>Error</Text>
          <Text style={styles.error}>{lastError}</Text>
        </View>
      ) : null}

      {lastDescription ? (
        <View style={styles.block}>
          <Text style={styles.label}>Resultado</Text>
          <Text style={styles.text}>{lastDescription}</Text>
          <Text style={styles.hint}>
            Latencia: {lastLatencyMs ?? '—'} ms · Confianza: {lastConfidence ?? '—'}
          </Text>
        </View>
      ) : null}

      <Text style={styles.footer}>Desliza a izquierda/derecha para cambiar de módulo.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 32,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 6,
  },
  subtitle: {
    marginBottom: 16,
    opacity: 0.8,
  },
  block: {
    marginBottom: 16,
  },
  label: {
    fontWeight: '600',
    marginBottom: 6,
  },
  text: {
    marginBottom: 10,
  },
  hint: {
    marginTop: 10,
    opacity: 0.75,
  },
  error: {
    opacity: 0.9,
  },
  footer: {
    marginTop: 8,
    opacity: 0.7,
  },
});
