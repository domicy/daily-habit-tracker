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
  /**
   * Opacity of the offset shadow element only (not the children).
   * Lets callers keep a stable component tree across state changes while
   * visually toggling the shadow on/off. Defaults to 1 (fully visible).
   */
  shadowOpacity?: number;
  children: React.ReactNode;
}

// Hard-edge offset shadow done with a translated colored View behind the child.
// RN's boxShadow is unreliable across versions and Android elevation blurs the
// edges; this primitive renders a crisp offset block instead.
const NBShadow: React.FC<NBShadowProps> = ({
  offsetX = 5,
  offsetY = 5,
  color = colors.shadow,
  borderRadius = 0,
  style,
  shadowOpacity,
  children,
}) => {
  // Only include opacity in the style when explicitly overridden so existing
  // consumers' snapshots (and styles) remain unchanged.
  const shadowFill: ViewStyle =
    shadowOpacity === undefined
      ? {
          backgroundColor: color,
          borderRadius,
          transform: [{translateX: offsetX}, {translateY: offsetY}],
        }
      : {
          backgroundColor: color,
          borderRadius,
          opacity: shadowOpacity,
          transform: [{translateX: offsetX}, {translateY: offsetY}],
        };

  return (
    <View style={[styles.wrapper, style]}>
      <View pointerEvents="none" style={[styles.shadow, shadowFill]} />
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
