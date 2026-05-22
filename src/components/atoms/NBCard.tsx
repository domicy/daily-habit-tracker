import React from 'react';
import {View, StyleSheet} from 'react-native';
import type {ViewStyle, StyleProp} from 'react-native';
import {colors} from '../../theme/colors';
import {radii, borders, shadowOffsets} from '../../theme';
import NBShadow from './NBShadow';

interface NBCardProps {
  borderColor?: string;
  shadowColor?: string;
  shadowOffset?: number;
  background?: string;
  borderRadius?: number;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
}

const DEFAULT_BORDER_COLOR = colors.line;
const DEFAULT_BACKGROUND = colors.card;
const DEFAULT_BORDER_RADIUS = radii.card;
const DEFAULT_BORDER_WIDTH = borders.thick;
const DEFAULT_SHADOW_COLOR = colors.shadow;
const DEFAULT_SHADOW_OFFSET = shadowOffsets.md;

const NBCard: React.FC<NBCardProps> = ({
  borderColor,
  shadowColor = DEFAULT_SHADOW_COLOR,
  shadowOffset = DEFAULT_SHADOW_OFFSET,
  background,
  borderRadius,
  borderWidth,
  style,
  testID,
  children,
}) => {
  // Only allocate an override object when a caller supplied at least one
  // visual prop; the common no-override path uses the stable `defaultStyle`.
  const hasOverride =
    background !== undefined ||
    borderColor !== undefined ||
    borderRadius !== undefined ||
    borderWidth !== undefined;

  const overrideStyle: ViewStyle | null = hasOverride
    ? {
        backgroundColor: background ?? DEFAULT_BACKGROUND,
        borderColor: borderColor ?? DEFAULT_BORDER_COLOR,
        borderRadius: borderRadius ?? DEFAULT_BORDER_RADIUS,
        borderWidth: borderWidth ?? DEFAULT_BORDER_WIDTH,
      }
    : null;

  return (
    <NBShadow
      offsetX={shadowOffset}
      offsetY={shadowOffset}
      color={shadowColor}
      borderRadius={borderRadius ?? DEFAULT_BORDER_RADIUS}>
      <View
        testID={testID}
        style={[styles.card, styles.defaultStyle, overrideStyle, style]}>
        {children}
      </View>
    </NBShadow>
  );
};

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  defaultStyle: {
    backgroundColor: DEFAULT_BACKGROUND,
    borderColor: DEFAULT_BORDER_COLOR,
    borderRadius: DEFAULT_BORDER_RADIUS,
    borderWidth: DEFAULT_BORDER_WIDTH,
  },
});

export default NBCard;
