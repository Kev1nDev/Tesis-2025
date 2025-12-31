import React, { useRef, useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  PanResponder,
  Animated,
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type BottomTab = {
  key: string;
  label: string;
};

type Props = {
  tabs: BottomTab[];
  activeIndex: number;
  onChange: (index: number) => void;
};

const SWIPE_THRESHOLD = 50; // px mínimo para considerar swipe

export function BottomTabBar({ tabs, activeIndex, onChange }: Props) {
  const insets = useSafeAreaInsets();

  // refs para tener siempre el valor actualizado dentro del PanResponder
  const activeIndexRef = useRef(activeIndex);
  const tabsLenRef = useRef(tabs.length);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    tabsLenRef.current = tabs.length;
  }, [tabs.length]);

  // animated value (opcional, lo dejamos por si quieres animar)
  const panX = useRef(new Animated.Value(0)).current;

  // crear el panResponder solo 1 vez
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // responder solo si hay más movimiento horizontal que vertical
        return (
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          Math.abs(gestureState.dx) > 5
        );
      },
      onPanResponderMove: Animated.event(
        [null, { dx: panX }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gestureState) => {
        const dx = gestureState.dx;
        const prevIndex = activeIndexRef.current;
        const last = tabsLenRef.current - 1;

        if (dx > SWIPE_THRESHOLD && prevIndex > 0) {
          // swipe a la derecha -> pestaña anterior
          onChange(prevIndex - 1);
        } else if (dx < -SWIPE_THRESHOLD && prevIndex < last) {
          // swipe a la izquierda -> siguiente pestaña
          onChange(prevIndex + 1);
        }

        // reset del valor animado
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
      style={[styles.container, { paddingBottom: insets.bottom }]}
    >
      {tabs.map((t, i) => {
        const active = i === activeIndex;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(i)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
  },
  item: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "500",
  },
  labelActive: {
    fontWeight: "700",
  },
});
