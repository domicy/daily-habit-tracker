import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  AppState,
} from 'react-native';
import {colors} from '../theme/colors';
import {getFormattedToday} from '../utils/dateUtils';
import {fontFamily, typeScale} from '../theme/typography';
import {spacing} from '../theme/spacing';
import HabitCard, {HABIT_ROW_HEIGHT} from '../components/HabitCard';
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

  // Update the displayed date when the app comes to the foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        setToday(getFormattedToday());
      }
    });
    return () => subscription.remove();
  }, []);

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
    <View style={styles.screen} testID="dashboard-screen">
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Daily Habits</Text>
          <Text style={styles.date}>{today}</Text>
        </View>
        <TouchableOpacity
          onPress={handleAddPress}
          style={styles.addButton}
          accessibilityLabel="Create new habit"
          accessibilityRole="button"
          testID="add-habit-button">
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
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
        contentContainerStyle={habits.length === 0 ? styles.emptyListContent : undefined}
        testID="habit-list"
      />

      {toastMessage && (
        <View style={styles.toast} testID="error-toast">
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.heading,
    ...typeScale.h1,
    color: colors.clemsonOrange,
  },
  date: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.clemsonOrange,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  addButtonText: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 30,
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
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyListContent: {
    flexGrow: 1,
  },
  toast: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.error,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  toastText: {
    fontFamily: fontFamily.body,
    ...typeScale.caption,
    color: colors.textPrimary,
  },
});

export default DashboardScreen;
