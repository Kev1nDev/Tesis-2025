import { Pressable, StyleSheet, Text, View } from 'react-native';

export type BottomTab = {
  key: string;
  label: string;
};

type Props = {
  tabs: BottomTab[];
  activeIndex: number;
  onChange: (index: number) => void;
};

export function BottomTabBar(props: Props) {
  return (
    <View style={styles.container}>
      {props.tabs.map((t, i) => {
        const active = i === props.activeIndex;
        return (
          <Pressable
            key={t.key}
            onPress={() => props.onChange(i)}
            style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
          >
            <Text style={[styles.label, active ? styles.labelActive : null]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  item: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '700',
  },
});
