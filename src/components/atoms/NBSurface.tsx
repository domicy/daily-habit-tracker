import React from 'react';
import {View, StyleSheet, SafeAreaView} from 'react-native';
import type {ViewStyle, StyleProp} from 'react-native';
import {colors} from '../../theme/colors';

interface NBSurfaceProps {
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
}

const NBSurface: React.FC<NBSurfaceProps> = ({style, testID, children}) => {
  return (
    <SafeAreaView style={styles.safe} testID={testID}>
      <View style={[styles.surface, style]}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  surface: {
    flex: 1,
    backgroundColor: colors.paper,
  },
});

export default NBSurface;
