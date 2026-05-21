import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  AppState,
} from 'react-native';
import {colors} from '../theme/colors';
import {getFormattedToday} from '../utils/dateUtils';
import {fontFamily, typeScale} from '../theme/typography';
import {spacing} from '../theme/spacing';
import {radii, borders} from '../theme/radii';
import HabitCard, {HABIT_ROW_HEIGHT} from '../components/HabitCard';
import NBSurface from '../components/atoms/NBSurface';
import NBCard from '../components/atoms/NBCard';
import NBChip from '../components/atoms/NBChip';
import {useHabits} from '../hooks/useHabits';
import type {HabitDisplayData} from '../hooks/useHabits';
import HabitService from '../services/HabitService';
import database from '../models';

interface DashboardScreenProps {
  navigation?: {navigate: (screen: string, params?: Record<string, unknown>) => void};
  habitService?: HabitService;
}

const defaultHabitService = new HabitService(database);

const DashboardScreen: React.FC<DashboardScreenProps> = ({
  navigation,
  habitService,
}) => {
  const service = habitService ?? defaultHabitService;
  const {habits, toggleHabit} = useHabits(service);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [today, setToday] = useState(() => getFormattedToday());

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        setToday(getFormattedToday());
      }
    });
    return () => subscription.remove();
  }, []);

  const doneCount = useMemo(
    () => habits.filter(h => h.completedToday).length,
    [habits],
  );

  const handleToggle = useCallback(
    async (habitId: string) => {
      try {
        await toggleHabit(habitId);
      } catch {
        setToastMessage('Could not save. Please try again.');
        setTimeout(() => setToastMessage(null), 3000);
      }
    },
    [toggleHabit],
  );

  const handleAddPress = useCallback(() => {
    navigation?.navigate('CreateHabit');
  }, [navigation]);

  const handleHabitPress = useCallback(
    (habitId: string) => {
      navigation?.navigate('Stats', {habitId});
    },
    [navigation],
  );

  const keyExtractor = useCallback((item: HabitDisplayData) => item.id, []);

  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({
      length: HABIT_ROW_HEIGHT,
      offset: HABIT_ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  const renderItem = useCallback(
    ({item}: {item: HabitDisplayData}) => (
      <HabitCard
        habitId={item.id}
        name={item.name}
        completedToday={item.completedToday}
        streak={item.streak}
        onToggle={handleToggle}
        onPress={handleHabitPress}
      />
    ),
    [handleToggle, handleHabitPress],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer} testID="empty-state">
        <Text style={styles.emptyEmoji}>📋</Text>
        <Text style={styles.emptyText}>
          No habits yet. Tap + to start.
        </Text>
      </View>
    ),
    [],
  );

  return (
    <NBSurface testID="dashboard-screen">
      <View style={styles.header}>
        <View style={styles.chipRow}>
          <NBChip background={colors.card} borderColor={colors.line}>
            {today.toUpperCase()}
          </NBChip>
          <Pressable
            onPress={handleAddPress}
            accessibilityLabel="Create new habit"
            accessibilityRole="button"
            testID="add-habit-button">
            <NBChip background={colors.tiger} borderColor={colors.tigerDeep}>
              + NEW HABIT
            </NBChip>
          </Pressable>
        </View>
        <Text style={styles.title}>TODAY</Text>

        <NBCard style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressHeaderText}>PROGRESS</Text>
            <Text style={styles.progressHeaderText}>
              {doneCount}/{habits.length} DONE
            </Text>
          </View>
          <View style={styles.progressDots}>
            {habits.length === 0 ? (
              <Text style={styles.progressEmpty}>// AWAITING HABITS</Text>
            ) : (
              habits.map(h => (
                <View
                  key={h.id}
                  style={[
                    styles.progressDot,
                    {
                      backgroundColor: h.completedToday
                        ? colors.tiger
                        : colors.card,
                      borderColor: h.completedToday
                        ? colors.tigerDeep
                        : colors.mute,
                    },
                  ]}
                />
              ))
            )}
          </View>
        </NBCard>
      </View>

      <FlatList
        data={habits}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews={true}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={
          habits.length === 0 ? styles.emptyListContent : styles.listContent
        }
        testID="habit-list"
      />

      {toastMessage && (
        <View style={styles.toast} testID="error-toast">
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </NBSurface>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 72,
    lineHeight: 60,
    letterSpacing: -3.5,
    color: colors.text,
    marginTop: spacing.sm,
  },
  progressCard: {
    marginTop: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.darkBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  progressHeaderText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.darkBgText,
    letterSpacing: 0.7,
  },
  progressDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  progressDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: borders.thick,
  },
  progressEmpty: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: colors.textSoft,
  },
  listContent: {
    paddingBottom: 120,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl * 2,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textSoft,
    textAlign: 'center',
  },
  emptyListContent: {
    flexGrow: 1,
  },
  toast: {
    position: 'absolute',
    bottom: 96,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.tigerDeep,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  toastText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: colors.card,
    fontWeight: '700',
  },
});

export default DashboardScreen;
