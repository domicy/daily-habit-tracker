import React, {useCallback, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import {colors} from '../theme/colors';
import {fontFamily, typeScale} from '../theme/typography';
import {spacing} from '../theme/spacing';

export const HABIT_ROW_HEIGHT = 72;

interface HabitCardProps {
  habitId: string;
  name: string;
  completedToday: boolean;
  streak: number;
  onToggle: (habitId: string) => void;
  onPress?: (habitId: string) => void;
}

const CHECK_CIRCLE_SIZE = 56;

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

  return (
    <TouchableOpacity
      style={styles.container}
      testID={`habit-card-${habitId}`}
      onPress={handlePress}
      activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.textContainer}>
        <Text style={styles.habitName} numberOfLines={1} testID={`habit-name-${habitId}`}>
          {name}
        </Text>
        <Text style={styles.streakText} testID={`streak-${habitId}`}>🔥 {streakLabel}</Text>
      </View>
      <TouchableOpacity
        onPress={handleToggle}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        testID={`toggle-${habitId}`}
        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
        <View
          style={[
            styles.circle,
            completedToday ? styles.circleCompleted : styles.circleIncomplete,
          ]}>
          {completedToday && (
            <Animated.Text
              testID={`checkmark-${habitId}`}
              style={[
                styles.checkmark,
                {transform: [{scale: scaleAnim}]},
              ]}>
              ✓
            </Animated.Text>
          )}
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: HABIT_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  textContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  habitName: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textPrimary,
  },
  streakText: {
    fontFamily: fontFamily.body,
    ...typeScale.caption,
    color: colors.streakGold,
    marginTop: spacing.xs,
  },
  circle: {
    width: CHECK_CIRCLE_SIZE,
    height: CHECK_CIRCLE_SIZE,
    borderRadius: CHECK_CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleIncomplete: {
    borderWidth: 3,
    borderColor: colors.clemsonOrange,
    backgroundColor: 'transparent',
  },
  circleCompleted: {
    backgroundColor: colors.success,
  },
  checkmark: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
});

export default React.memo(HabitCard, areEqual);
