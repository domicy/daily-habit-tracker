import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {ViewStyle, StyleProp} from 'react-native';
import {colors} from '../../theme/colors';
import {fontFamily} from '../../theme/typography';
import {borders} from '../../theme/radii';

interface NBSettingsRowProps {
  label: string;
  hint?: string;
  right?: React.ReactNode;
  accent?: string;
  isLast?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const NBSettingsRow: React.FC<NBSettingsRowProps> = ({
  label,
  hint,
  right,
  accent,
  isLast,
  testID,
  style,
}) => {
  return (
    <View
      testID={testID}
      style={[
        styles.row,
        !isLast && styles.divider,
        style,
      ]}>
      {accent && (
        <View
          style={[
            styles.accentDot,
            {backgroundColor: accent, borderColor: colors.line},
          ]}
        />
      )}
      <View style={styles.textCol}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      {right && <View style={styles.rightSlot}>{right}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: colors.card,
  },
  divider: {
    borderBottomWidth: borders.thin,
    borderBottomColor: colors.regaliaSoft,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: borders.base,
  },
  textCol: {
    flex: 1,
  },
  label: {
    fontFamily: fontFamily.display,
    fontSize: 15,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: -0.15,
  },
  hint: {
    marginTop: 4,
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: colors.textSoft,
  },
  rightSlot: {
    marginLeft: 8,
  },
});

export default NBSettingsRow;
