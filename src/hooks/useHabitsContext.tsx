import React, {createContext, useContext} from 'react';
import {useHabits} from './useHabits';
import type HabitService from '../services/HabitService';

type UseHabitsReturn = ReturnType<typeof useHabits>;

const HabitsContext = createContext<UseHabitsReturn | null>(null);

interface HabitsProviderProps {
  habitService: HabitService;
  children: React.ReactNode;
}

/**
 * Provides a single shared `useHabits` subscription to all descendants.
 *
 * The Dashboard, Streaks, and Stats tabs are kept alive simultaneously by
 * React Navigation, and they all read the same habit list. Without this
 * provider each tab opens its own WatermelonDB subscription and runs its own
 * `computeDisplayData` pass on every sync emission, multiplying the cost by
 * the number of mounted tabs. Lifting the hook here collapses that fan-out to
 * a single subscription.
 */
export const HabitsProvider: React.FC<HabitsProviderProps> = ({
  habitService,
  children,
}) => {
  const value = useHabits(habitService);
  return (
    <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>
  );
};

/**
 * Reads the shared habits state from `HabitsProvider`.
 *
 * Throws if used outside a provider — callers that need an escape hatch
 * (e.g. screen tests that inject a mock service via props) should call
 * `useHabits` directly instead.
 */
export function useHabitsContext(): UseHabitsReturn {
  const ctx = useContext(HabitsContext);
  if (ctx === null) {
    throw new Error(
      'useHabitsContext must be used within a HabitsProvider. ' +
        'Pass a habitService prop to the screen for tests, or wrap the tree ' +
        'in <HabitsProvider>.',
    );
  }
  return ctx;
}
