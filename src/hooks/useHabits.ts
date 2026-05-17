import {useState, useEffect, useRef, useCallback} from 'react';
import {AppState} from 'react-native';
import type {AppStateStatus} from 'react-native';
import type Habit from '../models/Habit';
import type HabitService from '../services/HabitService';
import {getTodayString} from '../utils/dateUtils';
import {useSubscriptionLeakDetector} from './useSubscriptionLeakDetector';

export interface HabitDisplayData {
  id: string;
  name: string;
  completedToday: boolean;
  streak: number;
}

export function useHabits(habitService: HabitService) {
  const [habits, setHabits] = useState<HabitDisplayData[]>([]);
  const [loading, setLoading] = useState(true);
  const streakCacheRef = useRef<Map<string, number>>(new Map());
  const todayRef = useRef(getTodayString());
  const [, setDateVersion] = useState(0);
  const rawHabitsRef = useRef<Habit[]>([]);
  const toggleChainRef = useRef<Map<string, Promise<void>>>(new Map());
  const isMounted = useSubscriptionLeakDetector('useHabits');

  const computeDisplayData = useCallback(
    async (rawHabits: Habit[]) => {
      const today = todayRef.current;
      const cache = streakCacheRef.current;

      const displayData = await Promise.all(
        rawHabits.map(async habit => {
          const logs = await habitService.getLogsForHabit(
            habit.id,
            today,
            today,
          );
          const completedToday = logs.length > 0;

          // Use cached streak if available; compute otherwise
          let streak = cache.get(habit.id);
          if (streak === undefined) {
            streak = await habitService.calculateStreak(habit.id, today);
            cache.set(habit.id, streak);
          }

          return {
            id: habit.id,
            name: habit.name,
            completedToday,
            streak,
          };
        }),
      );

      setHabits(displayData);
      setLoading(false);
    },
    [habitService],
  );

  useEffect(() => {
    const subscription = habitService.getActiveHabits().subscribe({
      next: rawHabits => {
        if (!isMounted()) {
          return;
        }
        rawHabitsRef.current = rawHabits;
        computeDisplayData(rawHabits);
      },
    });

    return () => subscription.unsubscribe();
  }, [habitService, computeDisplayData, isMounted]);

  // Midnight rollover: when the app comes to the foreground, check if the
  // date has changed. If so, invalidate the streak cache and recompute
  // everything so the dashboard shows the correct day.
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const newToday = getTodayString();
        if (newToday !== todayRef.current) {
          todayRef.current = newToday;
          streakCacheRef.current.clear();
          setDateVersion(v => v + 1);
          if (rawHabitsRef.current.length > 0) {
            computeDisplayData(rawHabitsRef.current);
          }
        }
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [computeDisplayData]);

  const toggleHabit = useCallback(
    (habitId: string) => {
      const today = todayRef.current;
      const cache = streakCacheRef.current;
      const chain = toggleChainRef.current;

      const run = async () => {
        // Optimistically toggle completedToday only. The streak depends on
        // whether yesterday (and earlier days) were completed, which we
        // don't know here, so any local arithmetic on h.streak can show a
        // wrong value for a frame. Leave streak unchanged until
        // calculateStreak returns the authoritative value below.
        setHabits(prev =>
          prev.map(h =>
            h.id === habitId ? {...h, completedToday: !h.completedToday} : h,
          ),
        );

        try {
          await habitService.toggleHabitCompletion(habitId, today);
          const actualStreak = await habitService.calculateStreak(
            habitId,
            today,
          );
          cache.set(habitId, actualStreak);
          setHabits(prev =>
            prev.map(h =>
              h.id === habitId ? {...h, streak: actualStreak} : h,
            ),
          );
        } catch {
          setHabits(prev =>
            prev.map(h =>
              h.id === habitId
                ? {...h, completedToday: !h.completedToday}
                : h,
            ),
          );
          throw new Error('Could not save. Please try again.');
        }
      };

      const previous = chain.get(habitId) ?? Promise.resolve();
      const next = previous.catch(() => {}).then(run);
      chain.set(habitId, next);
      const cleanup = () => {
        if (chain.get(habitId) === next) {
          chain.delete(habitId);
        }
      };
      next.then(cleanup, cleanup);
      return next;
    },
    [habitService],
  );

  return {habits, loading, toggleHabit};
}
