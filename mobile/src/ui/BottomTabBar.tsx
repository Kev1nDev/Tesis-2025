import React, { useRef, useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated,
  PanResponder,
  Vibration,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Speech from "expo-speech";
import { useAudioPlayer } from "expo-audio"; // Importación necesaria

export type BottomTab = {
  key: string;
  label: string;
};

type Props = {
  tabs: BottomTab[];
  activeIndex: number;
  onChange: (index: number) => void;
};

const SWIPE_THRESHOLD = 50;

export function BottomTabBar({ tabs, activeIndex, onChange }: Props) {
  const insets = useSafeAreaInsets();

  const activeIndexRef = useRef(activeIndex);
  const tabsLenRef = useRef(tabs.length);

  // 1. Cargamos el sonido de la rueda (Asegúrate de tenerlo en assets)
  const player = useAudioPlayer(require('../../assets/swipe.mp3'));

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    tabsLenRef.current = tabs.length;
  }, [tabs.length]);
// Manejo de voz al cambiar de tab con DELAY de 300ms
  useEffect(() => {
    const label = tabs[activeIndex]?.label;
    if (!label) return;

    // 1. Detenemos cualquier voz en curso inmediatamente
    Speech.stop(); 

    // 2. Creamos el timer para esperar 300ms
    const timer = setTimeout(() => {
      Speech.speak(label, {
        language: "es-ES",
        rate: 0.95,
        pitch: 1.0,
      });
    }, 500); // <--- El delay que pediste

    // 3. Limpieza: Si el usuario cambia de pestaña antes de los 300ms, 
    // cancelamos el timer anterior para que no se acumulen las voces.
    return () => clearTimeout(timer);
  }, [activeIndex]);

  // 3. Función para el feedback sensorial (Sonido + Vibración)
  const playFeedback = () => {
    // Sonido
    if (player) {
      player.seekTo(0);
      player.play();
    }
    // Micro-vibración (10ms es casi un "toque" físico)
    Vibration.vibrate(10);
  };

  const panX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_: any, gestureState: { dx: number; dy: number }) => {
        return (
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          Math.abs(gestureState.dx) > 5
        );
      },
      onPanResponderMove: Animated.event(
        [null, { dx: panX }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_: any, gestureState: { dx: number }) => {
        const dx = gestureState.dx;
        const prevIndex = activeIndexRef.current;
        const last = tabsLenRef.current - 1;

        if (dx > SWIPE_THRESHOLD && prevIndex > 0) {
          playFeedback(); // Disparar aquí
          onChange(prevIndex - 1);
        } else if (dx < -SWIPE_THRESHOLD && prevIndex < last) {
          playFeedback(); // Disparar aquí
          onChange(prevIndex + 1);
        }

        Animated.spring(panX, { toValue: 0, useNativeDriver: false }).start();
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderTerminate: () => {
        Animated.spring(panX, { toValue: 0, useNativeDriver: false }).start();
      },
    })
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        {
          paddingBottom: insets.bottom + 10,
        },
      ]}
    >
      <View style={styles.floatingBar}>
        <Pressable
          onPress={() => {
            playFeedback(); // También suena al tocar el botón central
            onChange(activeIndex);
          }}
          style={({ pressed }) => [styles.activePill, pressed && styles.pressed]}
        >
          <Text style={styles.activeLabel}>
            {tabs[activeIndex]?.label}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    alignItems: "center",
  },
  floatingBar: {
    backgroundColor: "rgba(20, 20, 25, 0.7)",
    borderRadius: 80,
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 25,
    flexDirection: "row",
    width: "94%",
    alignSelf: "center",
  },
  activePill: {
    flex: 1,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#0B5FFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  activeLabel: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.4,
    lineHeight: 22,
    textAlign: "center",
  },
});