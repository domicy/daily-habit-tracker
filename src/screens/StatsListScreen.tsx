import React, {useCallback} from 'react';
import {View, Text, Pressable, FlatList, StyleSheet} from 'react-native';
import {colors} from '../theme/colors';
import {fontFamily} from '../theme/typography';
import {spacing} from '../theme/spacing';
import {borders} from '../theme';
import NBSurface from '../components/atoms/NBSurface';
import NBCard from '../components/atoms/NBCard';
import NBChip from '../components/atoms/NBChip';
import NBChevron from '../components/atoms/NBChevron';
import NBFlame from '../components/atoms/NBFlame';
import {useHabits} from '../hooks/useHabits';
import type {HabitDisplayData} from '../hooks/useHabits';
import {useHabitsContext} from '../hooks/useHabitsContext';
import HabitService from '../services/HabitService';

interface StatsListScreenProps {
  navigation?: {navigate: (screen: string, params?: Record<string, unknown>) => void};
  habitService?: HabitService;
}

const StatsListScreen: React.FC<StatsListScreenProps> = ({
  navigation,
  habitService,
}) =>
  habitService ? (
    <StatsListScreenWithService
      navigation={navigation}
      habitService={habitService}
    />
  ) : (
    <StatsListScreenFromContext navigation={navigation} />
  );

interface StatsListScreenWithServiceProps {
  navigation?: {navigate: (screen: string, params?: Record<string, unknown>) => void};
  habitService: HabitService;
}

const StatsListScreenWithService: React.FC<StatsListScreenWithServiceProps> = ({
  navigation,
  habitService,
}) => {
  const {habits} = useHabits(habitService);
  return <StatsListScreenBody navigation={navigation} habits={habits} />;
};

const StatsListScreenFromContext: React.FC<{
  navigation?: {navigate: (screen: string, params?: Record<string, unknown>) => void};
}> = ({navigation}) => {
  const {habits} = useHabitsContext();
  return <StatsListScreenBody navigation={navigation} habits={habits} />;
};

interface StatsListScreenBodyProps {
  navigation?: {navigate: (screen: string, params?: Record<string, unknown>) => void};
  habits: HabitDisplayData[];
}

const StatsListScreenBody: React.FC<StatsListScreenBodyProps> = ({
  navigation,
  habits,
}) => {
  const handlePress = useCallback(
    (habitId: string) => {
      navigation?.navigate('Stats', {habitId});
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({item, index}: {item: HabitDisplayData; index: number}) => (
      <Pressable
        testID={`stats-row-${item.id}`}
        onPress={() => handlePress(item.id)}
        style={[
          styles.row,
          index === habits.length - 1 && styles.rowLast,
        ]}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{item.name.toUpperCase()}</Text>
          <View style={styles.streakRow}>
            <NBFlame size={11} color={colors.tiger} />
            <Text style={styles.streakText}>
              {' '}
              {String(item.streak).padStart(3, '0')} DAYS
            </Text>
          </View>
        </View>
        <NBChevron color={colors.regalia} />
      </Pressable>
    ),
    [habits.length, handlePress],
  );

  return (
    <NBSurface testID="stats-list-screen">
      <View style={styles.header}>
        <NBChip>STATS</NBChip>
        <Text style={styles.title}>STATS</Text>
        <Text style={styles.subtitle}>
          PICK A HABIT TO SEE THE CALENDAR
        </Text>
      </View>

      {habits.length === 0 ? (
        <View style={styles.empty} testID="stats-empty">
          <Text style={styles.emptyText}>No habits to chart yet.</Text>
        </View>
      ) : (
        <NBCard style={styles.card}>
          <FlatList
            data={habits}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            scrollEnabled={false}
            testID="stats-habit-list"
          />
        </NBCard>
      )}
    </NBSurface>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    alignItems: 'flex-start',
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 60,
    lineHeight: 52,
    letterSpacing: -2.5,
    color: colors.text,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: colors.textSoft,
    marginTop: spacing.sm,
    letterSpacing: 0.5,
  },
  card: {
    marginHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: borders.thin,
    borderBottomColor: colors.regaliaSoft,
    backgroundColor: colors.card,
    gap: 12,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: fontFamily.display,
    fontSize: 16,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: -0.2,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  streakText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: colors.textSoft,
  },
  empty: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: colors.textSoft,
  },
});

export default StatsListScreen;
