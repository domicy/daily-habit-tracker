import React from 'react';
import {View, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {colors} from '../../theme/colors';
import {borders, shadowOffsets} from '../../theme/radii';
import NBShadow from './NBShadow';

interface NBCircleProps {
  filled: boolean;
  color?: string;
  border?: string;
  size?: number;
  testID?: string;
  /**
   * When true (default), NBCircle wraps itself in an NBShadow when `filled`.
   * Pass `false` if the caller is rendering its own NBShadow wrapper (so the
   * subtree stays structurally stable across toggles) — see HabitCard.
   */
  withShadow?: boolean;
}

const NBCircle: React.FC<NBCircleProps> = ({
  filled,
  color = colors.tiger,
  border = colors.line,
  size = 28,
  testID,
  withShadow = true,
}) => {
  const inner = (
    <View
      testID={testID}
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: borders.thick,
          borderColor: border,
          backgroundColor: filled ? color : colors.card,
        },
      ]}>
      {filled && (
        <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 20 20">
          <Path
            d="M4 10 L8.5 14.5 L16 6"
            fill="none"
            stroke={colors.text}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
    </View>
  );

  if (!filled || !withShadow) {
    return inner;
  }

  return (
    <NBShadow
      offsetX={shadowOffsets.xs}
      offsetY={shadowOffsets.xs}
      color={colors.shadow}
      borderRadius={size / 2}
      style={styles.shadowWrap}>
      {inner}
    </NBShadow>
  );
};

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadowWrap: {
    alignSelf: 'flex-start',
  },
});

export default NBCircle;
