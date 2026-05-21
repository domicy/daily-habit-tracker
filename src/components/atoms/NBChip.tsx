import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {ViewStyle, StyleProp, TextStyle} from 'react-native';
import {colors} from '../../theme/colors';
import {fontFamily} from '../../theme/typography';
import {radii, borders} from '../../theme/radii';

interface NBChipProps {
  background?: string;
  color?: string;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  children: React.ReactNode;
}

const NBChip: React.FC<NBChipProps> = ({
  background = colors.card,
  color = colors.text,
  borderColor = colors.line,
  style,
  textStyle,
  testID,
  children,
}) => {
  return (
    <View
      testID={testID}
      style={[
        styles.chip,
        {
          backgroundColor: background,
          borderColor,
          borderWidth: borders.base,
        },
        style,
      ]}>
      <Text style={[styles.text, {color}, textStyle]}>{children}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  text: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
});

export default NBChip;
