import React from 'react';
import {View, StyleSheet} from 'react-native';
import type {ViewStyle, StyleProp} from 'react-native';
import {colors} from '../../theme/colors';
import {radii, borders, shadowOffsets} from '../../theme/radii';
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

const NBCard: React.FC<NBCardProps> = ({
  borderColor = colors.line,
  shadowColor = colors.shadow,
  shadowOffset = shadowOffsets.md,
  background = colors.card,
  borderRadius = radii.card,
  borderWidth = borders.thick,
  style,
  testID,
  children,
}) => {
  return (
    <NBShadow
      offsetX={shadowOffset}
      offsetY={shadowOffset}
      color={shadowColor}
      borderRadius={borderRadius}>
      <View
        testID={testID}
        style={[
          styles.card,
          {
            backgroundColor: background,
            borderColor,
            borderRadius,
            borderWidth,
          },
          style,
        ]}>
        {children}
      </View>
    </NBShadow>
  );
};

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});

export default NBCard;
