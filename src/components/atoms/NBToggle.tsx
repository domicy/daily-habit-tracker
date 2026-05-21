import React, {useCallback} from 'react';
import {View, Pressable, StyleSheet} from 'react-native';
import {colors} from '../../theme/colors';
import {radii, borders, shadowOffsets} from '../../theme/radii';
import NBShadow from './NBShadow';

interface NBToggleProps {
  value: boolean;
  onValueChange?: (next: boolean) => void;
  color?: string;
  testID?: string;
  accessibilityLabel?: string;
  // Accept-and-ignore Switch-API niceties so existing callsites compile.
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
  disabled,
}) => {
  const handlePress = useCallback(() => {
    if (disabled) {
      return;
    }
    onValueChange?.(!value);
  }, [disabled, onValueChange, value]);

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
        // eslint-disable-next-line react-native/no-inline-styles
        style={[
          styles.track,
          {
            backgroundColor: value ? color : colors.card,
            borderColor: colors.line,
            opacity: disabled ? 0.5 : 1,
          },
        ]}>
        <View
          style={[
            styles.thumb,
            {
              left: value ? TOGGLE_WIDTH - THUMB_SIZE - borders.thick : -borders.thick,
              borderColor: colors.line,
            },
          ]}
        />
      </Pressable>
    </NBShadow>
  );
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
    position: 'relative',
  },
  thumb: {
    position: 'absolute',
    top: -borders.thick,
    width: THUMB_SIZE,
    height: THUMB_SIZE + borders.thick * 2,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.card,
    borderWidth: borders.thick,
  },
});

export default NBToggle;
