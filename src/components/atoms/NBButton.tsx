import React from 'react';
import {Pressable, Text, ActivityIndicator, View, StyleSheet} from 'react-native';
import type {ViewStyle, StyleProp, TextStyle} from 'react-native';
import {colors} from '../../theme/colors';
import {fontFamily} from '../../theme/typography';
import {radii, borders, shadowOffsets} from '../../theme/radii';
import NBShadow from './NBShadow';

type NBButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface NBButtonProps {
  onPress?: () => void;
  variant?: NBButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

const NBButton: React.FC<NBButtonProps> = ({
  onPress,
  variant = 'primary',
  disabled,
  loading,
  testID,
  accessibilityLabel,
  style,
  textStyle,
  children,
}) => {
  const styling = getVariantStyles(variant);

  return (
    <NBShadow
      offsetX={shadowOffsets.xs + 2}
      offsetY={shadowOffsets.xs + 2}
      color={styling.shadowColor}
      borderRadius={radii.pill}
      style={[styles.wrapper, disabled && styles.disabled, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        disabled={disabled || loading}
        style={({pressed}) => [
          styles.button,
          {
            backgroundColor: styling.background,
            borderColor: styling.borderColor,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        {loading ? (
          <ActivityIndicator color={styling.textColor} />
        ) : (
          <View style={styles.row}>
            {typeof children === 'string' ? (
              <Text style={[styles.text, {color: styling.textColor}, textStyle]}>
                {children}
              </Text>
            ) : (
              children
            )}
          </View>
        )}
      </Pressable>
    </NBShadow>
  );
};

function getVariantStyles(variant: NBButtonVariant) {
  switch (variant) {
    case 'primary':
      return {
        background: colors.tiger,
        borderColor: colors.tigerDeep,
        shadowColor: colors.tigerDeep,
        textColor: colors.text,
      };
    case 'secondary':
      return {
        background: colors.card,
        borderColor: colors.line,
        shadowColor: colors.shadow,
        textColor: colors.text,
      };
    case 'ghost':
      return {
        background: colors.darkBg,
        borderColor: colors.regaliaDeep,
        shadowColor: colors.shadow,
        textColor: colors.darkBgText,
      };
    case 'danger':
      return {
        background: colors.tigerDeep,
        borderColor: colors.tigerDeep,
        shadowColor: colors.shadow,
        textColor: colors.card,
      };
  }
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'flex-start',
  },
  disabled: {
    opacity: 0.5,
  },
  button: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radii.pill,
    borderWidth: borders.thick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontFamily: fontFamily.display,
    fontSize: 16,
    letterSpacing: -0.2,
    textTransform: 'uppercase',
  },
});

export default NBButton;
