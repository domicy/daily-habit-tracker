import {useState, useEffect, useRef, useCallback} from 'react';
import {format} from 'date-fns';
import type Habit from '../models/Habit';
import type HabitService from '../services/HabitService';

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
  const todayRef = useRef(format(new Date(), 'yyyy-MM-dd'));

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
        computeDisplayData(rawHabits);
      },
    });

    return () => subscription.unsubscribe();
  }, [habitService, computeDisplayData]);

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
