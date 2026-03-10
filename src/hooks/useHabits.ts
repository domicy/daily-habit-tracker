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
    async (habitId: string) => {
      const today = todayRef.current;
      const cache = streakCacheRef.current;

      // Optimistic update
      setHabits(prev =>
        prev.map(h => {
          if (h.id !== habitId) {
            return h;
          }
          const nowCompleted = !h.completedToday;
          const newStreak = nowCompleted ? h.streak + 1 : Math.max(h.streak - 1, 0);
          cache.set(habitId, newStreak);
          return {
            ...h,
            completedToday: nowCompleted,
            streak: newStreak,
          };
        }),
      );

      try {
        await habitService.toggleHabitCompletion(habitId, today);
        // Recalculate actual streak after successful write
        const actualStreak = await habitService.calculateStreak(habitId, today);
        cache.set(habitId, actualStreak);
        setHabits(prev =>
          prev.map(h =>
            h.id === habitId ? {...h, streak: actualStreak} : h,
          ),
        );
      } catch {
        // Revert optimistic update
        setHabits(prev =>
          prev.map(h => {
            if (h.id !== habitId) {
              return h;
            }
            const reverted = !h.completedToday;
            const revertedStreak = reverted
              ? h.streak + 1
              : Math.max(h.streak - 1, 0);
            cache.set(habitId, revertedStreak);
            return {
              ...h,
              completedToday: reverted,
              streak: revertedStreak,
            };
          }),
        );
        throw new Error('Could not save. Please try again.');
      }
    },
    [habitService],
  );

  return {habits, loading, toggleHabit};
}
