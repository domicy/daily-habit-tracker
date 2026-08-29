import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import {format, getDaysInMonth} from 'date-fns';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {getTodayString} from '../utils/dateUtils';
import {colors} from '../theme/colors';
import {fontFamily} from '../theme/typography';
import {spacing} from '../theme/spacing';
import {radii, borders} from '../theme';
import MonthCalendar from '../components/MonthCalendar';
import RatingEditor, {type HabitRatings} from '../components/RatingEditor';
import NBSurface from '../components/atoms/NBSurface';
import NBCard from '../components/atoms/NBCard';
import NBChip from '../components/atoms/NBChip';
import HabitService from '../services/HabitService';
import {getDefaultHabitService} from '../services/defaultHabitService';
import {calculateHabitScore} from '../utils/habitScoring';

interface StatsScreenProps {
  route?: {params: {habitId: string}};
  navigation?: {goBack: () => void};
  habitService?: HabitService;
}

const StatsScreen: React.FC<StatsScreenProps> = ({
  route,
  navigation,
  habitService,
}) => {
  const service = habitService ?? getDefaultHabitService();
  const habitId = route?.params?.habitId ?? '';
  const insets = useSafeAreaInsets();
  // Clear the system status bar before laying out the back button + title.
  const headerPaddingTop = Math.max(insets.top + spacing.md, spacing.xl);

  const [habitName, setHabitName] = useState('');
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(50);
  // False until a metrics response actually lands, so the card cannot claim a
  // server-authoritative number while showing a local estimate.
  const [scoreIsAuthoritative, setScoreIsAuthoritative] = useState(false);
  const [completionRate, setCompletionRate] = useState(0);
  const [ratings, setRatings] = useState<HabitRatings>({
    impact: 3,
    friction: 3,
    keystone: 3,
    timeCost: 3,
  });
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  // Single Date observation so year and month can't straddle a midnight/month
  // boundary (two separate `new Date()` calls could observe different values).
  const initialNow = useRef(new Date()).current;
  const [calendarYear, setCalendarYear] = useState(() =>
    initialNow.getFullYear(),
  );
  const [calendarMonth, setCalendarMonth] = useState(() =>
    initialNow.getMonth(),
  );

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

  // Owns the habit's own fields only. Score, streak and completion rate are
  // owned by the metrics effect below: both used to write them, with no
  // ordering guarantee, so a slow local read could clobber a server value that
  // had already arrived.
  useEffect(() => {
    if (!habitId) return;
    let ignore = false;
    (async () => {
      const habit = await service.getHabitById(habitId);
      if (ignore) return;
      setHabitName(habit.name);
      setRatings({
        impact: habit.impact ?? 3,
        friction: habit.friction ?? 3,
        keystone: habit.keystone ?? 3,
        timeCost: habit.timeCost ?? 3,
      });
    })();
    return () => {
      ignore = true;
    };
  }, [habitId, service]);

  // The sole owner of score, streak and completion rate. `ratings` is a
  // dependency so saving an edit re-reconciles against the server instead of
  // leaving the provisional value on screen until the month changes.
  useEffect(() => {
    if (!habitId) return;
    let ignore = false;
    (async () => {
      const monthStart = new Date(calendarYear, calendarMonth, 1);
      const daysInMonth = getDaysInMonth(new Date(calendarYear, calendarMonth));
      const startDate = format(monthStart, 'yyyy-MM-dd');
      const endDate = format(
        new Date(calendarYear, calendarMonth, daysInMonth),
        'yyyy-MM-dd',
      );
      const today = getTodayString();

      const logs = await service.getLogsForHabit(habitId, startDate, endDate);
      if (ignore) return;
      const completed = new Set(logs.map(log => log.completedDate));
      setCompletedDates(completed);

      let metrics;
      try {
        metrics = await service.getHabitMetrics?.(
          habitId,
          startDate,
          endDate,
          today,
        );
      } catch {
        // The calendar remains useful offline; local values are provisional
        // until the server metrics request succeeds.
        metrics = undefined;
      }
      if (ignore) return;

      if (metrics) {
        setCompletionRate(metrics.completion_rate);
        setScore(metrics.score);
        setStreak(metrics.current_streak);
        setScoreIsAuthoritative(true);
        return;
      }

      // Offline fallback: the same formula the server would apply, so the
      // number does not jump when the request later succeeds.
      setScoreIsAuthoritative(false);
      setScore(
        calculateHabitScore(
          ratings.impact,
          ratings.friction,
          ratings.keystone,
          ratings.timeCost,
        ),
      );
      setCompletionRate(
        daysInMonth > 0
          ? Math.round((completed.size * 100) / daysInMonth)
          : 0,
      );
      const localStreak = await service.calculateStreak(habitId, today);
      if (ignore) return;
      setStreak(localStreak);
    })();
    return () => {
      ignore = true;
    };
  }, [habitId, calendarYear, calendarMonth, service, ratings]);

  // Deliberately not caught: RatingEditor owns the failure message and keeps
  // the user's draft (issue #127). setRatings only runs on success, and it
  // re-triggers the metrics effect, which reconciles the score.
  const handleSaveRatings = useCallback(
    async (nextRatings: HabitRatings) => {
      await service.setHabitRatings(habitId, nextRatings);
      setRatings(nextRatings);
    },
    [habitId, service],
  );

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

  const {completedCount, totalDays} = useMemo(() => {
    const daysInMonth = getDaysInMonth(
      new Date(calendarYear, calendarMonth),
    );

    return {completedCount: completedDates.size, totalDays: daysInMonth};
  }, [completedDates, calendarYear, calendarMonth]);

  return (
    <NBSurface testID="stats-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.headerRow, {paddingTop: headerPaddingTop}]}>
          <Pressable
            onPress={handleBack}
            testID="back-button"
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={8}>
            <NBChip background={colors.card} borderColor={colors.line}>
              ‹ BACK
            </NBChip>
          </Pressable>
          <NBChip background={colors.tiger} borderColor={colors.tigerDeep}>
            STATS
          </NBChip>
        </View>

        <Text style={styles.title} testID="habit-name">
          {habitName}
        </Text>

        <RatingEditor ratings={ratings} onSave={handleSaveRatings} />

        <NBCard style={styles.streakCard} testID="streak-section">
          <View style={styles.streakStrip}>
            <Text style={styles.streakStripText}>STREAK</Text>
            <Text style={styles.streakStripText}>DAYS</Text>
          </View>
          <View style={styles.streakBody}>
            <Text style={styles.streakNumber} testID="streak-count">
              {displayStreak}
            </Text>
            <Text style={styles.streakLabel}>day streak</Text>
          </View>
        </NBCard>

        <NBCard style={styles.calendarCard}>
          <MonthCalendar
            year={calendarYear}
            month={calendarMonth}
            completedDates={completedDates}
            onMonthChange={handleMonthChange}
          />
        </NBCard>

        <NBCard style={styles.summaryCard} testID="monthly-summary">
          <View style={styles.summaryStrip}>
            <Text style={styles.summaryStripText}>SELECTED WINDOW</Text>
            <Text style={styles.summaryStripText}>
              {completionRate}%
            </Text>
          </View>
          <View style={styles.summaryBody}>
            <Text style={styles.summaryText} testID="summary-text">
              {completedCount} / {totalDays} days completed
            </Text>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {width: `${completionRate}%`},
                ]}
                testID="progress-bar"
              />
            </View>
          </View>
        </NBCard>

        <NBCard style={styles.scoreCard} testID="score-section">
          <View style={styles.scoreStrip}>
            <Text style={styles.summaryStripText}>HABIT SCORE</Text>
            <Text style={styles.summaryStripText}>0—100</Text>
          </View>
          <Text style={styles.scoreNumber} testID="score-value">
            {score}
          </Text>
          <Text style={styles.scoreCaption} testID="score-caption">
            {scoreIsAuthoritative
              ? 'SERVER-AUTHORITATIVE WEIGHTED SCORE'
              : 'PROVISIONAL — NOT YET CONFIRMED BY THE SERVER'}
          </Text>
        </NBCard>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </NBSurface>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 48,
    lineHeight: 44,
    letterSpacing: -2,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    textTransform: 'uppercase',
  },
  streakCard: {
    marginBottom: spacing.md,
  },
  streakStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.darkBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  streakStripText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.darkBgText,
    letterSpacing: 0.7,
  },
  streakBody: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  streakNumber: {
    fontFamily: fontFamily.display,
    fontSize: 80,
    lineHeight: 70,
    letterSpacing: -3,
    color: colors.tiger,
  },
  streakLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: colors.textSoft,
    marginTop: spacing.xs,
    letterSpacing: 0.5,
  },
  calendarCard: {
    marginBottom: spacing.md,
  },
  summaryCard: {
    marginBottom: spacing.md,
  },
  scoreCard: {marginBottom: spacing.md, alignItems: 'center', paddingBottom: spacing.md},
  scoreStrip: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.regalia,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scoreNumber: {
    fontFamily: fontFamily.display,
    fontSize: 64,
    lineHeight: 64,
    color: colors.regalia,
    marginTop: spacing.sm,
  },
  scoreCaption: {fontFamily: fontFamily.mono, fontSize: 10, color: colors.textSoft},
  summaryStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.darkBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  summaryStripText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.darkBgText,
    letterSpacing: 0.7,
  },
  summaryBody: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  summaryText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  progressBarBackground: {
    height: 12,
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    borderWidth: borders.base,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.tiger,
  },
  bottomSpacer: {
    height: 120,
  },
});

export default StatsScreen;
