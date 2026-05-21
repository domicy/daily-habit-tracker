import React from 'react';
import {View, StyleSheet} from 'react-native';
import type {ViewStyle, StyleProp} from 'react-native';
import {colors} from '../../theme/colors';

interface NBShadowProps {
  offsetX?: number;
  offsetY?: number;
  color?: string;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

// Hard-edge offset shadow done with a translated colored View behind the child.
// RN's boxShadow is unreliable across versions and Android elevation blurs;
// this matches the Soft Clemson v3 design exactly.
const NBShadow: React.FC<NBShadowProps> = ({
  offsetX = 5,
  offsetY = 5,
  color = colors.shadow,
  borderRadius = 0,
  style,
  children,
}) => {
  return (
    <View style={[styles.wrapper, style]}>
      <View
        pointerEvents="none"
        style={[
          styles.shadow,
          {
            backgroundColor: color,
            borderRadius,
            transform: [{translateX: offsetX}, {translateY: offsetY}],
          },
        ]}
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  shadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export default NBShadow;
