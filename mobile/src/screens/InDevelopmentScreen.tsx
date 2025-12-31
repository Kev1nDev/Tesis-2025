import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function InDevelopmentScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>en desarrollo</Text>
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