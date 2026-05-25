import React, {useCallback} from 'react';
import {View, Pressable, StyleSheet} from 'react-native';
import {colors} from '../../theme/colors';
import {radii, borders, shadowOffsets} from '../../theme';
import NBShadow from './NBShadow';

interface NBToggleProps {
  value: boolean;
  onValueChange?: (next: boolean) => void;
  color?: string;
  testID?: string;
  accessibilityLabel?: string;
  // Switch-compatible color overrides; defaults preserve existing visuals.
  trackColor?: {false?: string; true?: string};
  thumbColor?: string;
  disabled?: boolean;
}

const TOGGLE_WIDTH = 52;
const TOGGLE_HEIGHT = 28;
const THUMB_SIZE = 22;

const NBToggle: React.FC<NBToggleProps> = ({
  value,
  onValueChange,
  color = colors.tiger,
  testID,
  accessibilityLabel,
  trackColor,
  thumbColor,
  disabled,
}) => {
  const handlePress = useCallback(() => {
    if (disabled) {
      return;
    }
    onValueChange?.(!value);
  }, [disabled, onValueChange, value]);

  const trackBackground = value
    ? trackColor?.true ?? color
    : trackColor?.false ?? colors.card;
  const thumbBackground = thumbColor ?? colors.card;

  return (
    <NBShadow
      offsetX={shadowOffsets.xs}
      offsetY={shadowOffsets.xs}
      color={colors.shadow}
      borderRadius={radii.pill}
      style={styles.wrapper}>
      <Pressable
        testID={testID}
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{checked: value, disabled: !!disabled}}
        onPress={handlePress}
        style={[
          styles.track,
          // eslint-disable-next-line react-native/no-inline-styles
          {
            backgroundColor: trackBackground,
            opacity: disabled ? 0.5 : 1,
          },
        ]}>
        <View
          style={[
            value ? styles.thumbOn : styles.thumbOff,
            {backgroundColor: thumbBackground},
          ]}
        />
      </Pressable>
    </NBShadow>
  );
};

const thumbBase = {
  position: 'absolute' as const,
  top: -borders.thick,
  width: THUMB_SIZE,
  height: THUMB_SIZE + borders.thick * 2,
  borderRadius: THUMB_SIZE / 2,
  borderWidth: borders.thick,
  borderColor: colors.line,
};

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'flex-start',
  },
  track: {
    width: TOGGLE_WIDTH,
    height: TOGGLE_HEIGHT,
    borderRadius: radii.pill,
    borderWidth: borders.thick,
    borderColor: colors.line,
    position: 'relative',
  },
  thumbOn: {
    ...thumbBase,
    left: TOGGLE_WIDTH - THUMB_SIZE - borders.thick,
  },
  thumbOff: {
    ...thumbBase,
    left: -borders.thick,
  },
});

export default NBToggle;
