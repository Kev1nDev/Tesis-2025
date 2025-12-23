import { StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  description: string;
};

export function PlaceholderScreen(props: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{props.title}</Text>
      <Text style={styles.text}>{props.description}</Text>
      <Text style={styles.hint}>Desliza a izquierda/derecha para cambiar de módulo.</Text>
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
    marginBottom: 8,
  },
  text: {
    marginBottom: 12,
  },
  hint: {
    opacity: 0.7,
  },
});
