import { useMemo, useRef } from 'react';
import { PanResponder, type GestureResponderEvent, type PanResponderGestureState, StyleSheet, View } from 'react-native';

type Props = {
  index: number;
  count: number;
  onIndexChange: (next: number) => void;
  children: React.ReactNode;
};

const SWIPE_THRESHOLD_PX = 60;
const SWIPE_VELOCITY_THRESHOLD = 0.35;

function shouldSwipeLeft(gs: PanResponderGestureState): boolean {
  return gs.dx < -SWIPE_THRESHOLD_PX || (gs.dx < -20 && gs.vx < -SWIPE_VELOCITY_THRESHOLD);
}

function shouldSwipeRight(gs: PanResponderGestureState): boolean {
  return gs.dx > SWIPE_THRESHOLD_PX || (gs.dx > 20 && gs.vx > SWIPE_VELOCITY_THRESHOLD);
}

export function SwipePager(props: Props) {
  const { index, count, onIndexChange, children } = props;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        // Horizontal swipe intent
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dy) < 18;
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (count <= 1) return;

        if (shouldSwipeLeft(gestureState) && index < count - 1) {
          onIndexChange(index + 1);
          return;
        }

        if (shouldSwipeRight(gestureState) && index > 0) {
          onIndexChange(index - 1);
        }
      },
    })
  ).current;

  const dots = useMemo(() => {
    if (count <= 1) return null;
    return (
      <View style={styles.dots} pointerEvents="none">
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
        ))}
      </View>
    );
  }, [count, index]);

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <View style={styles.content}>{children}</View>
      {dots}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  dotActive: {
    backgroundColor: '#111',
    opacity: 0.9,
  },
  dotInactive: {
    backgroundColor: '#111',
    opacity: 0.25,
  },
});
