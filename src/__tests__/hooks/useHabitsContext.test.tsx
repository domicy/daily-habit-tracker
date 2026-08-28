import React from 'react';
import {Text} from 'react-native';
import {render, waitFor} from '@testing-library/react-native';
import {of} from 'rxjs';
import {HabitsProvider, useHabitsContext} from '../../hooks/useHabitsContext';
import type HabitService from '../../services/HabitService';

// Mock the database import to avoid SQLite initialization in tests
jest.mock('../../models', () => ({}));

function createMockHabitService(habits: Array<{id: string; name: string}> = []) {
  return {
    getActiveHabits: jest.fn().mockReturnValue(of(habits)),
    getAllHabits: jest.fn().mockReturnValue(of(habits)),
    calculateStreak: jest.fn().mockResolvedValue(0),
    getLogsForHabit: jest.fn().mockResolvedValue([]),
    toggleHabitCompletion: jest.fn().mockResolvedValue(undefined),
    getHabitScore: jest.fn().mockReturnValue(0),
  } as unknown as HabitService;
}

const Consumer: React.FC = () => {
  const {habits} = useHabitsContext();
  return <Text testID="habit-count">{habits.length}</Text>;
};

describe('useHabitsContext', () => {
  it('exposes the shared habits state to descendants', async () => {
    const service = createMockHabitService([
      {id: 'h1', name: 'Read'},
      {id: 'h2', name: 'Run'},
    ]);

    const {getByTestId} = render(
      <HabitsProvider habitService={service}>
        <Consumer />
      </HabitsProvider>,
    );

    // useHabits resolves logs and streaks before it publishes, so the count
    // arrives a microtask after render.
    await waitFor(() =>
      expect(getByTestId('habit-count').props.children).toBe(2),
    );
  });

  it('opens a single subscription no matter how many consumers read it', () => {
    const service = createMockHabitService([{id: 'h1', name: 'Read'}]);

    render(
      <HabitsProvider habitService={service}>
        <Consumer />
        <Consumer />
        <Consumer />
      </HabitsProvider>,
    );

    // The whole point of the provider: three consumers, one query.
    expect(service.getActiveHabits).toHaveBeenCalledTimes(1);
  });

  it('throws a directed error when used outside a provider', () => {
    // React logs the error boundary trace; silence it for this expected throw.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Consumer />)).toThrow(
      /useHabitsContext must be used within a HabitsProvider/,
    );

    consoleError.mockRestore();
  });
});
