import {useState, useEffect, useRef, useCallback} from 'react';
import {AppState} from 'react-native';
import type {AppStateStatus} from 'react-native';
import type Habit from '../models/Habit';
import type HabitService from '../services/HabitService';
import {getTodayString} from '../utils/dateUtils';
import {useSubscriptionLeakDetector} from './useSubscriptionLeakDetector';
import {calculateHabitScore} from '../utils/habitScoring';

export interface HabitDisplayData {
  id: string;
  name: string;
  completedToday: boolean;
  streak: number;
  score: number;
}

export function useHabits(habitService: HabitService) {
  const [habits, setHabits] = useState<HabitDisplayData[]>([]);
  const [loading, setLoading] = useState(true);
  const streakCacheRef = useRef<Map<string, number>>(new Map());
  const todayRef = useRef(getTodayString());
  const [, setDateVersion] = useState(0);
  const rawHabitsRef = useRef<Habit[]>([]);
  const toggleChainRef = useRef<Map<string, Promise<void>>>(new Map());
  const displayComputationRef = useRef(0);
  const isMounted = useSubscriptionLeakDetector('useHabits');

  const computeDisplayData = useCallback(
    async (rawHabits: Habit[]) => {
      const computationId = ++displayComputationRef.current;
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
            // A newer WatermelonDB emission may have started while this
            // calculation was pending. Do not let an obsolete pass populate
            // the shared cache used by the current pass.
            if (computationId === displayComputationRef.current) {
              cache.set(habit.id, streak);
            }
          }

          return {
            id: habit.id,
            name: habit.name,
            completedToday,
            streak,
            score: habitService.getHabitScore?.(habit) ?? calculateHabitScore(
              habit.impact || 3,
              habit.friction || 3,
              habit.keystone || 3,
              habit.timeCost || 3,
            ),
          };
        }),
      );

      // WatermelonDB can emit again while the per-habit reads above are
      // pending (notably immediately after create()). Only render the result
      // for the most recent snapshot, and never update state after unmount.
      if (computationId !== displayComputationRef.current || !isMounted()) {
        return;
      }
      setHabits(displayData);
      setLoading(false);
    },
    [habitService, isMounted],
  );

  const refreshDisplayData = useCallback(
    (rawHabits: Habit[]) => {
      // Observable callbacks cannot await this work. Consume failures here
      // so a transient read failure does not become an unhandled rejection
      // that crashes the app.
      computeDisplayData(rawHabits).catch(() => undefined);
    },
    [computeDisplayData],
  );

  useEffect(() => {
    const subscription = habitService.getActiveHabits().subscribe({
      next: rawHabits => {
        if (!isMounted()) {
          return;
        }
        rawHabitsRef.current = rawHabits;
        refreshDisplayData(rawHabits);
      },
    });

    return () => subscription.unsubscribe();
  }, [habitService, refreshDisplayData, isMounted]);

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
            refreshDisplayData(rawHabitsRef.current);
          }
        }
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [refreshDisplayData]);

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
