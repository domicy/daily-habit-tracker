import React, {useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {colors} from '../theme/colors';
import {fontFamily} from '../theme/typography';
import {spacing} from '../theme/spacing';
import {borders} from '../theme/radii';
import NBSurface from '../components/atoms/NBSurface';
import NBCard from '../components/atoms/NBCard';
import NBChip from '../components/atoms/NBChip';
import NBFlame from '../components/atoms/NBFlame';
import {useHabits} from '../hooks/useHabits';
import type {HabitDisplayData} from '../hooks/useHabits';
import HabitService from '../services/HabitService';
import database from '../models';

interface StreaksScreenProps {
  habitService?: HabitService;
}

const defaultHabitService = new HabitService(database);

interface RankStyle {
  fill: string;
  border: string;
  shadow: string;
  countColor: string;
}

const RANK_STYLES: RankStyle[] = [
  {
    fill: colors.tiger,
    border: colors.tigerDeep,
    shadow: colors.tigerDeep,
    countColor: colors.tiger,
  },
  {
    fill: colors.regalia,
    border: colors.regaliaDeep,
    shadow: colors.regaliaDeep,
    countColor: colors.regaliaSoft,
  },
  {
    fill: colors.tigerSoft,
    border: colors.line,
    shadow: colors.shadow,
    countColor: colors.tigerSoft,
  },
];

const RANK_OFFSETS = [0, 8, -6];

const StreaksScreen: React.FC<StreaksScreenProps> = ({habitService}) => {
  const service = habitService ?? defaultHabitService;
  const {habits} = useHabits(service);

  const top3 = useMemo(
    () =>
      [...habits]
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 3),
    [habits],
  );

  const totalDays = useMemo(
    () => top3.reduce((sum, h) => sum + h.streak, 0),
    [top3],
  );

  return (
    <NBSurface testID="streaks-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <NBChip background={colors.darkBg} color={colors.darkBgText} borderColor={colors.regaliaDeep}>
            {weekLabel()}
          </NBChip>
          <NBChip>{monthDayLabel()}</NBChip>
        </View>
        <Text style={styles.title}>TOP{'\n'}STREAKS</Text>

        <View style={styles.subtitleRow}>
          <Text style={styles.subtitleText}>YOUR 3 LONGEST RUNS</Text>
          <Text style={[styles.subtitleText, styles.subtitleAccent]}>
            ↗ {totalDays} TOTAL DAYS
          </Text>
        </View>

        {top3.length === 0 ? (
          <View style={styles.empty} testID="streaks-empty">
            <Text style={styles.emptyEmoji}>🔥</Text>
            <Text style={styles.emptyText}>
              No streaks yet. Build a habit on TODAY.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {top3.map((habit, index) => (
              <RankCard
                key={habit.id}
                rank={index + 1}
                habit={habit}
                style={RANK_STYLES[index]}
                offset={RANK_OFFSETS[index]}
              />
            ))}
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </NBSurface>
  );
};

interface RankCardProps {
  rank: number;
  habit: HabitDisplayData;
  style: RankStyle;
  offset: number;
}

const RankCard: React.FC<RankCardProps> = ({rank, habit, style, offset}) => {
  const rankLabel = String(rank).padStart(2, '0');
  return (
    <View style={[styles.rankShift, {transform: [{translateX: offset}]}]}>
      <NBCard
        borderColor={style.border}
        shadowColor={style.shadow}
        testID={`rank-card-${rank}`}>
        <View style={styles.rankRow}>
          <View
            style={[
              styles.rankBadge,
              {
                backgroundColor: style.fill,
                borderRightColor: style.border,
              },
            ]}>
            <Text style={styles.rankNumber}>{rankLabel}</Text>
          </View>
          <View style={styles.rankBody}>
            <Text style={styles.habitName} numberOfLines={2}>
              {habit.name.toUpperCase()}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                {habit.completedToday ? 'LOGGED TODAY' : 'PENDING'}
              </Text>
              <View style={styles.fireRow}>
                <NBFlame size={12} color={style.fill} />
                <Text style={styles.metaText}> ON FIRE</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={[styles.daysStrip, {borderTopColor: style.border}]}>
          <Text style={styles.daysLabel}>DAYS_LOGGED</Text>
          <Text style={[styles.daysCount, {color: style.countColor}]}>
            {String(habit.streak).padStart(3, '0')}
          </Text>
        </View>
      </NBCard>
    </View>
  );
};

function weekLabel(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor(
    (now.getTime() - start.getTime()) / 86_400_000,
  );
  const week = Math.ceil((dayOfYear + start.getDay() + 1) / 7);
  return `WK ${week} / ${now.getFullYear()}`;
}

function monthDayLabel(): string {
  const now = new Date();
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return `${months[now.getMonth()]} · ${days[now.getDay()]}`;
}

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
    fontSize: 72,
    lineHeight: 62,
    letterSpacing: -3.5,
    color: colors.text,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
  subtitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: borders.thin,
    borderBottomColor: colors.line,
  },
  subtitleText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: colors.textSoft,
    letterSpacing: 0.5,
  },
  subtitleAccent: {
    color: colors.text,
    fontWeight: '700',
  },
  list: {
    marginTop: spacing.md,
    gap: 14,
  },
  rankShift: {
    // Slight horizontal offsets between ranks per the design's asymmetry.
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rankBadge: {
    width: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: borders.thick,
  },
  rankNumber: {
    fontFamily: fontFamily.display,
    fontSize: 52,
    lineHeight: 52,
    letterSpacing: -2.4,
    color: colors.text,
  },
  rankBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'space-between',
  },
  habitName: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 22,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: -0.4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.xs,
  },
  metaText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: colors.textSoft,
    letterSpacing: 0.4,
  },
  fireRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  daysStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.darkBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: borders.base,
  },
  daysLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: colors.darkBgText,
    letterSpacing: 0.5,
  },
  daysCount: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 22,
  },
  empty: {
    marginTop: spacing.xxl,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: colors.textSoft,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  bottomSpacer: {
    height: 120,
  },
});

export default StreaksScreen;
