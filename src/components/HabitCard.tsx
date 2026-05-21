import React, {useCallback, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {colors} from '../theme/colors';
import {fontFamily} from '../theme/typography';
import {spacing} from '../theme/spacing';
import {radii, borders, shadowOffsets} from '../theme/radii';
import NBShadow from './atoms/NBShadow';

export const HABIT_ROW_HEIGHT = 72;

interface HabitCardProps {
  habitId: string;
  name: string;
  completedToday: boolean;
  streak: number;
  onToggle: (habitId: string) => void;
  onPress?: (habitId: string) => void;
}

const CHECK_CIRCLE_SIZE = 32;

function areEqual(prev: HabitCardProps, next: HabitCardProps): boolean {
  return (
    prev.habitId === next.habitId &&
    prev.name === next.name &&
    prev.completedToday === next.completedToday &&
    prev.streak === next.streak &&
    prev.onToggle === next.onToggle &&
    prev.onPress === next.onPress
  );
}

const HabitCard: React.FC<HabitCardProps> = ({
  habitId,
  name,
  completedToday,
  streak,
  onToggle,
  onPress,
}) => {
  const scaleAnim = useRef(new Animated.Value(completedToday ? 1 : 0)).current;

  useEffect(() => {
    if (completedToday) {
      scaleAnim.setValue(0.5);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [completedToday, scaleAnim]);

  const handleToggle = useCallback(() => {
    onToggle(habitId);
  }, [habitId, onToggle]);

  const handlePress = useCallback(() => {
    onPress?.(habitId);
  }, [habitId, onPress]);

  const accessibilityLabel = `Mark ${name} as ${
    completedToday ? 'incomplete' : 'complete'
  }. Current streak: ${streak} days.`;

  const streakLabel = streak === 1 ? '1 day' : `${streak} days`;
  const badgeBg = completedToday ? colors.tiger : colors.card;
  const badgeBorder = completedToday ? colors.tigerDeep : colors.line;

  return (
    <TouchableOpacity
      style={styles.container}
      testID={`habit-card-${habitId}`}
      onPress={handlePress}
      activeOpacity={onPress ? 0.7 : 1}>
      <TouchableOpacity
        onPress={handleToggle}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        testID={`toggle-${habitId}`}
        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
        style={styles.circleSlot}>
        {completedToday ? (
          <NBShadow
            offsetX={shadowOffsets.xs}
            offsetY={shadowOffsets.xs}
            color={colors.shadow}
            borderRadius={CHECK_CIRCLE_SIZE / 2}>
            <View
              style={[
                styles.circle,
                {
                  backgroundColor: colors.tiger,
                  borderColor: colors.tigerDeep,
                },
              ]}>
              <Animated.View
                testID={`checkmark-${habitId}`}
                style={{transform: [{scale: scaleAnim}]}}>
                <Svg width={16} height={16} viewBox="0 0 20 20">
                  <Path
                    d="M4 10 L8.5 14.5 L16 6"
                    fill="none"
                    stroke={colors.text}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Animated.View>
            </View>
          </NBShadow>
        ) : (
          <View
            style={[
              styles.circle,
              {
                backgroundColor: colors.card,
                borderColor: colors.line,
              },
            ]}
          />
        )}
      </TouchableOpacity>

      <View style={styles.textContainer}>
        <Text
          style={[
            styles.habitName,
            completedToday && styles.habitNameDone,
          ]}
          numberOfLines={1}
          testID={`habit-name-${habitId}`}>
          {name}
        </Text>
      </View>

      <View
        style={[
          styles.streakBadge,
          {backgroundColor: badgeBg, borderColor: badgeBorder},
        ]}>
        <Text style={styles.streakText} testID={`streak-${habitId}`}>
          🔥 {streakLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: HABIT_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paper,
    borderBottomWidth: borders.thin,
    borderBottomColor: colors.regaliaSoft,
    gap: 12,
  },
  circleSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: CHECK_CIRCLE_SIZE,
    height: CHECK_CIRCLE_SIZE,
    borderRadius: CHECK_CIRCLE_SIZE / 2,
    borderWidth: borders.thick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  habitName: {
    fontFamily: fontFamily.display,
    fontSize: 17,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: -0.2,
  },
  habitNameDone: {
    color: colors.textSoft,
    textDecorationLine: 'line-through',
  },
  streakBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: borders.base,
  },
  streakText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
});

export default React.memo(HabitCard, areEqual);
