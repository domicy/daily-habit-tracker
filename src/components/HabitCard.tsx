import React, {useCallback} from 'react';
import {View, Text, TouchableOpacity, Pressable, StyleSheet} from 'react-native';
import {colors} from '../theme/colors';
import {fontFamily} from '../theme/typography';
import {spacing} from '../theme/spacing';
import {radii, borders, shadowOffsets} from '../theme';
import NBCircle from './atoms/NBCircle';
import NBShadow from './atoms/NBShadow';

export const HABIT_ROW_HEIGHT = 72;

interface HabitCardProps {
  habitId: string;
  name: string;
  completedToday: boolean;
  streak: number;
  score?: number;
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
    prev.score === next.score &&
    prev.onToggle === next.onToggle &&
    prev.onPress === next.onPress
  );
}

const HabitCard: React.FC<HabitCardProps> = ({
  habitId,
  name,
  completedToday,
  streak,
  score,
  onToggle,
  onPress,
}) => {
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
    <Pressable
      style={({pressed}) => [
        styles.container,
        pressed && onPress ? styles.containerPressed : null,
      ]}
      testID={`habit-card-${habitId}`}
      onPress={handlePress}>
      <TouchableOpacity
        onPress={handleToggle}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        testID={`toggle-${habitId}`}
        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
        style={styles.circleSlot}>
        <NBShadow
          offsetX={shadowOffsets.xs}
          offsetY={shadowOffsets.xs}
          color={colors.shadow}
          borderRadius={CHECK_CIRCLE_SIZE / 2}
          shadowOpacity={completedToday ? 1 : 0}>
          <NBCircle
            filled={completedToday}
            size={CHECK_CIRCLE_SIZE}
            border={completedToday ? colors.tigerDeep : colors.line}
            withShadow={false}
            testID={completedToday ? `checkmark-${habitId}` : undefined}
          />
        </NBShadow>
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
          completedToday ? styles.badgeFilled : styles.badgeEmpty,
        ]}>
        <Text style={styles.streakText} testID={`streak-${habitId}`}>
          🔥 {streakLabel}
        </Text>
        {score !== undefined && (
          <Text testID={`score-${habitId}`}>SCORE {score}</Text>
        )}
      </View>
    </Pressable>
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
  containerPressed: {
    opacity: 0.7,
  },
  circleSlot: {
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
  badgeFilled: {
    backgroundColor: colors.tiger,
    borderColor: colors.tigerDeep,
  },
  badgeEmpty: {
    backgroundColor: colors.card,
    borderColor: colors.line,
  },
  streakText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
});

export default React.memo(HabitCard, areEqual);
