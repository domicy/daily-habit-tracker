import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import {format, getDaysInMonth} from 'date-fns';
import {getTodayString} from '../utils/dateUtils';
import {colors} from '../theme/colors';
import {fontFamily, typeScale} from '../theme/typography';
import {spacing} from '../theme/spacing';
import MonthCalendar from '../components/MonthCalendar';
import HabitService from '../services/HabitService';
import database from '../models';

interface StatsScreenProps {
  route?: {params: {habitId: string}};
  navigation?: {goBack: () => void};
  habitService?: HabitService;
}

const defaultHabitService = new HabitService(database);

const StatsScreen: React.FC<StatsScreenProps> = ({
  route,
  navigation,
  habitService,
}) => {
  const service = habitService ?? defaultHabitService;
  const habitId = route?.params?.habitId ?? '';

  const [habitName, setHabitName] = useState('');
  const [streak, setStreak] = useState(0);
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [calendarYear, setCalendarYear] = useState(
    new Date().getFullYear(),
  );
  const [calendarMonth, setCalendarMonth] = useState(
    new Date().getMonth(),
  );

  // Streak count-up animation
  const animatedStreak = useRef(new Animated.Value(0)).current;
  const [displayStreak, setDisplayStreak] = useState(0);

  useEffect(() => {
    const listener = animatedStreak.addListener(({value}) => {
      setDisplayStreak(Math.round(value));
    });

    animatedStreak.setValue(0);
    Animated.timing(animatedStreak, {
      toValue: streak,
      duration: 300,
      useNativeDriver: false,
    }).start();

    return () => {
      animatedStreak.removeListener(listener);
    };
  }, [streak, animatedStreak]);

  // Load habit info
  useEffect(() => {
    if (!habitId) return;
    (async () => {
      const habit = await service.getHabitById(habitId);
      setHabitName(habit.name);
      const today = getTodayString();
      const currentStreak = await service.calculateStreak(habitId, today);
      setStreak(currentStreak);
    })();
  }, [habitId, service]);

  // Load logs for visible month
  useEffect(() => {
    if (!habitId) return;
    (async () => {
      const startDate = format(
        new Date(calendarYear, calendarMonth, 1),
        'yyyy-MM-dd',
      );
      const daysInMonth = getDaysInMonth(
        new Date(calendarYear, calendarMonth),
      );
      const endDate = format(
        new Date(calendarYear, calendarMonth, daysInMonth),
        'yyyy-MM-dd',
      );
      const logs = await service.getLogsForHabit(habitId, startDate, endDate);
      setCompletedDates(new Set(logs.map(log => log.completedDate)));
    })();
  }, [habitId, calendarYear, calendarMonth, service]);

  const handleMonthChange = useCallback(
    (year: number, month: number) => {
      setCalendarYear(year);
      setCalendarMonth(month);
    },
    [],
  );

  const handleBack = useCallback(() => {
    navigation?.goBack();
  }, [navigation]);

  // Monthly summary calculations
  const {completedCount, totalDays} = useMemo(() => {
    const now = new Date();
    const isCurrentMonth =
      now.getFullYear() === calendarYear && now.getMonth() === calendarMonth;
    const daysInMonth = getDaysInMonth(
      new Date(calendarYear, calendarMonth),
    );
    const total = isCurrentMonth ? now.getDate() : daysInMonth;

    let completed = 0;
    completedDates.forEach(dateStr => {
      const date = new Date(dateStr + 'T00:00:00');
      if (
        date.getFullYear() === calendarYear &&
        date.getMonth() === calendarMonth
      ) {
        completed++;
      }
    });

    return {completedCount: completed, totalDays: total};
  }, [completedDates, calendarYear, calendarMonth]);

  const progressPercent =
    totalDays > 0 ? completedCount / totalDays : 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="stats-screen">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          testID="back-button"
          accessibilityLabel="Go back"
          accessibilityRole="button">
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.title} testID="habit-name">
          {habitName}
        </Text>
      </View>

      {/* Streak hero */}
      <View style={styles.streakSection} testID="streak-section">
        <Text style={styles.streakNumber} testID="streak-count">
          {displayStreak}
        </Text>
        <Text style={styles.streakLabel}>day streak</Text>
      </View>

      {/* Calendar */}
      <MonthCalendar
        year={calendarYear}
        month={calendarMonth}
        completedDates={completedDates}
        onMonthChange={handleMonthChange}
      />

      {/* Monthly summary */}
      <View style={styles.summarySection} testID="monthly-summary">
        <Text style={styles.summaryText} testID="summary-text">
          {completedCount} / {totalDays} days completed
        </Text>
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              {width: `${Math.round(progressPercent * 100)}%`},
            ]}
            testID="progress-bar"
          />
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  backArrow: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '700',
  },
  title: {
    fontFamily: fontFamily.heading,
    ...typeScale.h1,
    color: colors.clemsonOrange,
    flex: 1,
  },
  streakSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  streakNumber: {
    fontFamily: fontFamily.heading,
    ...typeScale.streak,
    color: colors.streakGold,
  },
  streakLabel: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  summarySection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  summaryText: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.clemsonOrange,
    borderRadius: 4,
  },
});

export default StatsScreen;
