import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {ViewStyle, StyleProp, TextStyle} from 'react-native';
import {colors} from '../../theme/colors';
import {fontFamily} from '../../theme/typography';
import {radii, borders} from '../../theme';

interface NBChipProps {
  background?: string;
  color?: string;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  children: React.ReactNode;
}

const DEFAULT_BACKGROUND = colors.card;
const DEFAULT_BORDER_COLOR = colors.line;
const DEFAULT_TEXT_COLOR = colors.text;

const NBChip: React.FC<NBChipProps> = ({
  background,
  color,
  borderColor,
  style,
  textStyle,
  testID,
  children,
}) => {
  // Allocate the override object only when a caller supplied at least one
  // color override; the default path uses the stable `defaultStyle`.
  const hasContainerOverride =
    background !== undefined || borderColor !== undefined;
  const containerOverride: ViewStyle | null = hasContainerOverride
    ? {
        backgroundColor: background ?? DEFAULT_BACKGROUND,
        borderColor: borderColor ?? DEFAULT_BORDER_COLOR,
      }
    : null;
  const textOverride: TextStyle | null =
    color !== undefined ? {color} : null;

  return (
    <View
      testID={testID}
      style={[styles.chip, styles.defaultContainer, containerOverride, style]}>
      <Text style={[styles.text, styles.defaultText, textOverride, textStyle]}>
        {children}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: borders.base,
  },
  defaultContainer: {
    backgroundColor: DEFAULT_BACKGROUND,
    borderColor: DEFAULT_BORDER_COLOR,
  },
  text: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  defaultText: {
    color: DEFAULT_TEXT_COLOR,
  },
});

export default NBChip;
