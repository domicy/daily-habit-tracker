import React, {useMemo} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {
  getDaysInMonth,
  startOfMonth,
  getDay,
  format,
  isAfter,
} from 'date-fns';
import {getTodayString} from '../utils/dateUtils';
import {colors} from '../theme/colors';
import {fontFamily, typeScale} from '../theme/typography';
import {spacing} from '../theme/spacing';

interface MonthCalendarProps {
  year: number;
  month: number; // 0-indexed (0 = January)
  completedDates: Set<string>;
  onMonthChange: (year: number, month: number) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MonthCalendar: React.FC<MonthCalendarProps> = ({
  year,
  month,
  completedDates,
  onMonthChange,
}) => {
  const todayStr = getTodayString();

  const canGoForward = useMemo(() => {
    const now = new Date();
    const nextMonth = new Date(year, month + 1, 1);
    const currentMonthStart = startOfMonth(now);
    return !isAfter(nextMonth, currentMonthStart);
  }, [year, month]);

  const daysInMonth = getDaysInMonth(new Date(year, month));
  const firstDayOfWeek = getDay(startOfMonth(new Date(year, month)));

  // Previous month's trailing days
  const prevMonthDays = useMemo(() => {
    if (firstDayOfWeek === 0) return [];
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevDaysInMonth = getDaysInMonth(new Date(prevYear, prevMonth));
    const days: {day: number; dateStr: string; isOutside: true}[] = [];
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = prevDaysInMonth - i;
      days.push({
        day: d,
        dateStr: format(new Date(prevYear, prevMonth, d), 'yyyy-MM-dd'),
        isOutside: true,
      });
    }
    return days;
  }, [year, month, firstDayOfWeek]);

  // Current month days
  const currentMonthDays = useMemo(() => {
    const days: {day: number; dateStr: string; isOutside: false}[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        day: d,
        dateStr: format(new Date(year, month, d), 'yyyy-MM-dd'),
        isOutside: false,
      });
    }
    return days;
  }, [year, month, daysInMonth]);

  // Next month's leading days
  const nextMonthDays = useMemo(() => {
    const totalCells = prevMonthDays.length + currentMonthDays.length;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    const nextMo = month === 11 ? 0 : month + 1;
    const nextYr = month === 11 ? year + 1 : year;
    const days: {day: number; dateStr: string; isOutside: true}[] = [];
    for (let d = 1; d <= remainingCells; d++) {
      days.push({
        day: d,
        dateStr: format(new Date(nextYr, nextMo, d), 'yyyy-MM-dd'),
        isOutside: true,
      });
    }
    return days;
  }, [year, month, prevMonthDays.length, currentMonthDays.length]);

  const allDays = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];

  const weeks: typeof allDays[] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  const handlePrevMonth = () => {
    if (month === 0) {
      onMonthChange(year - 1, 11);
    } else {
      onMonthChange(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    if (!canGoForward) return;
    if (month === 11) {
      onMonthChange(year + 1, 0);
    } else {
      onMonthChange(year, month + 1);
    }
  };

  const monthLabel = format(new Date(year, month, 1), 'MMMM yyyy');

  return (
    <View style={styles.container} testID="month-calendar">
      {/* Month navigation header */}
      <View style={styles.navRow}>
        <TouchableOpacity
          onPress={handlePrevMonth}
          style={styles.navButton}
          testID="calendar-prev"
          accessibilityLabel="Previous month"
          accessibilityRole="button">
          <Text style={styles.navArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel} testID="calendar-month-label">
          {monthLabel}
        </Text>
        <TouchableOpacity
          onPress={handleNextMonth}
          style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
          disabled={!canGoForward}
          testID="calendar-next"
          accessibilityLabel="Next month"
          accessibilityRole="button">
          <Text
            style={[
              styles.navArrow,
              !canGoForward && styles.navArrowDisabled,
            ]}>
            {'›'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.weekRow}>
        {DAY_LABELS.map(label => (
          <View key={label} style={styles.dayCell}>
            <Text style={styles.dayLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map(dayInfo => {
            const isCompleted = completedDates.has(dayInfo.dateStr);
            const isToday = dayInfo.dateStr === todayStr;
            const isOutside = dayInfo.isOutside;

            return (
              <View key={dayInfo.dateStr} style={styles.dayCell}>
                <View
                  style={[
                    styles.dayCellInner,
                    isCompleted && !isOutside && styles.completedCell,
                    isToday && !isCompleted && !isOutside && styles.todayCell,
                  ]}
                  testID={
                    isCompleted && !isOutside
                      ? `calendar-day-completed-${dayInfo.day}`
                      : isOutside
                        ? `calendar-day-outside-${dayInfo.dateStr}`
                        : `calendar-day-${dayInfo.day}`
                  }>
                  <Text
                    style={[
                      styles.dayText,
                      isCompleted && !isOutside && styles.completedText,
                      isOutside && styles.outsideText,
                    ]}>
                    {dayInfo.day}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const CELL_SIZE = 36;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  navButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navArrow: {
    color: colors.clemsonOrange,
    fontSize: 28,
    fontWeight: '700',
  },
  navArrowDisabled: {
    color: colors.textSecondary,
  },
  monthLabel: {
    fontFamily: fontFamily.heading,
    ...typeScale.h2,
    color: colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayLabel: {
    fontFamily: fontFamily.body,
    ...typeScale.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayCellInner: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: CELL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedCell: {
    backgroundColor: colors.clemsonOrange,
  },
  todayCell: {
    borderWidth: 2,
    borderColor: colors.clemsonOrange,
  },
  dayText: {
    fontFamily: fontFamily.body,
    ...typeScale.caption,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  completedText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  outsideText: {
    color: colors.textSecondary,
    opacity: 0.4,
  },
});

export default MonthCalendar;
