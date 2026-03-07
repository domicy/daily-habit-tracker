import React from 'react';
import {render, fireEvent, waitFor, act} from '@testing-library/react-native';
import DashboardScreen from '../../screens/DashboardScreen';
import HabitService from '../../services/HabitService';
import {of} from 'rxjs';

// Mock date-fns format to return a deterministic date string
jest.mock('date-fns', () => ({
  ...jest.requireActual('date-fns'),
  format: (date: Date, fmt: string) => {
    if (fmt === 'EEEE, MMMM d') {
      return 'Wednesday, March 5';
    }
    if (fmt === 'yyyy-MM-dd') {
      return '2026-03-05';
    }
    return jest.requireActual('date-fns').format(date, fmt);
  },
}));

// Mock the database import to avoid SQLite initialization in tests
jest.mock('../../models', () => ({}));

// Suppress Animated warnings in test environment
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Animated.spring = (_value: unknown, config: Record<string, unknown>) => ({
    start: (cb?: () => void) => cb?.(),
    ...config,
  });
  return RN;
});

function createMockHabitService(habits: Array<{id: string; name: string}> = []) {
  const mockHabits = habits.map(h => ({
    id: h.id,
    name: h.name,
    isActive: true,
    createdAt: Date.now(),
  }));

  const service = {
    getActiveHabits: jest.fn().mockReturnValue(of(mockHabits)),
    toggleHabitCompletion: jest.fn().mockResolvedValue(undefined),
    calculateStreak: jest.fn().mockResolvedValue(0),
    getLogsForHabit: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<HabitService>;

  return service;
}

function createMockServiceWithStreaks(
  habits: Array<{id: string; name: string; completedToday: boolean; streak: number}>,
) {
  const mockHabits = habits.map(h => ({
    id: h.id,
    name: h.name,
    isActive: true,
    createdAt: Date.now(),
  }));

  const service = {
    getActiveHabits: jest.fn().mockReturnValue(of(mockHabits)),
    toggleHabitCompletion: jest.fn().mockResolvedValue(undefined),
    calculateStreak: jest.fn().mockImplementation((habitId: string) => {
      const habit = habits.find(h => h.id === habitId);
      return Promise.resolve(habit?.streak ?? 0);
    }),
    getLogsForHabit: jest.fn().mockImplementation((habitId: string) => {
      const habit = habits.find(h => h.id === habitId);
      if (habit?.completedToday) {
        return Promise.resolve([{habitId, completedDate: '2026-03-05'}]);
      }
      return Promise.resolve([]);
    }),
  } as unknown as jest.Mocked<HabitService>;

  return service;
}

describe('DashboardScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Empty state ────────────────────────────────────────────────────

  it('renders empty state when no habits exist', async () => {
    const service = createMockHabitService([]);

    const {getByTestId, getByText} = render(
      <DashboardScreen habitService={service} />,
    );

    await waitFor(() => {
      expect(getByTestId('empty-state')).toBeTruthy();
    });

    expect(getByText('No habits yet. Tap + to start.')).toBeTruthy();
  });

  // ─── Renders habit list ─────────────────────────────────────────────

  it('renders 3 HabitCards when 3 habits exist', async () => {
    const habits = [
      {id: '1', name: 'Exercise', completedToday: false, streak: 5},
      {id: '2', name: 'Read', completedToday: true, streak: 3},
      {id: '3', name: 'Meditate', completedToday: false, streak: 0},
    ];
    const service = createMockServiceWithStreaks(habits);

    const {getByTestId, queryByTestId} = render(
      <DashboardScreen habitService={service} />,
    );

    await waitFor(() => {
      expect(getByTestId('habit-card-1')).toBeTruthy();
      expect(getByTestId('habit-card-2')).toBeTruthy();
      expect(getByTestId('habit-card-3')).toBeTruthy();
    });

    expect(queryByTestId('empty-state')).toBeNull();
  });

  // ─── Toggle calls service ───────────────────────────────────────────

  it('calls toggleHabitCompletion with correct habit ID and today date on tap', async () => {
    const habits = [
      {id: 'habit-abc', name: 'Exercise', completedToday: false, streak: 2},
    ];
    const service = createMockServiceWithStreaks(habits);

    const {getByTestId} = render(
      <DashboardScreen habitService={service} />,
    );

    await waitFor(() => {
      expect(getByTestId('toggle-habit-abc')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId('toggle-habit-abc'));
    });

    expect(service.toggleHabitCompletion).toHaveBeenCalledWith(
      'habit-abc',
      '2026-03-05',
    );
  });

  // ─── Optimistic update ──────────────────────────────────────────────

  it('applies optimistic UI update immediately on toggle', async () => {
    const habits = [
      {id: '1', name: 'Exercise', completedToday: false, streak: 0},
    ];
    const service = createMockServiceWithStreaks(habits);

    const {getByTestId, getByText} = render(
      <DashboardScreen habitService={service} />,
    );

    await waitFor(() => {
      expect(getByTestId('habit-card-1')).toBeTruthy();
    });

    // Initially streak is 0
    expect(getByText('🔥 0 days')).toBeTruthy();

    // Now make toggle hang so we can observe the optimistic state
    service.toggleHabitCompletion = jest.fn(
      () => new Promise(() => {}), // Never resolves
    ) as unknown as typeof service.toggleHabitCompletion;

    await act(async () => {
      fireEvent.press(getByTestId('toggle-1'));
    });

    // The toggle was called but hasn't resolved - yet UI should already show streak of 1
    await waitFor(() => {
      expect(getByText('🔥 1 days')).toBeTruthy();
    });
  });

  // ─── Streak display ────────────────────────────────────────────────

  it('displays correct streak for each habit', async () => {
    const habits = [
      {id: '1', name: 'Exercise', completedToday: true, streak: 7},
      {id: '2', name: 'Read', completedToday: false, streak: 0},
      {id: '3', name: 'Meditate', completedToday: true, streak: 42},
    ];
    const service = createMockServiceWithStreaks(habits);

    const {getByText} = render(
      <DashboardScreen habitService={service} />,
    );

    await waitFor(() => {
      expect(getByText('🔥 7 days')).toBeTruthy();
      expect(getByText('🔥 0 days')).toBeTruthy();
      expect(getByText('🔥 42 days')).toBeTruthy();
    });
  });

  // ─── Header content ────────────────────────────────────────────────

  it('renders header with title, date, and add button', async () => {
    const service = createMockHabitService([]);

    const {getByText, getByTestId} = render(
      <DashboardScreen habitService={service} />,
    );

    expect(getByText('Daily Habits')).toBeTruthy();
    expect(getByText('Wednesday, March 5')).toBeTruthy();
    expect(getByTestId('add-habit-button')).toBeTruthy();
  });

  // ─── Add button navigates ──────────────────────────────────────────

  it('navigates to CreateHabit when + button is pressed', async () => {
    const service = createMockHabitService([]);
    const mockNavigation = {navigate: jest.fn()};

    const {getByTestId} = render(
      <DashboardScreen habitService={service} navigation={mockNavigation} />,
    );

    fireEvent.press(getByTestId('add-habit-button'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateHabit');
  });

  // ─── Accessibility labels ──────────────────────────────────────────

  it('has correct accessibility labels', async () => {
    const habits = [
      {id: '1', name: 'Exercise', completedToday: false, streak: 5},
    ];
    const service = createMockServiceWithStreaks(habits);

    const {getByTestId, getByLabelText} = render(
      <DashboardScreen habitService={service} />,
    );

    await waitFor(() => {
      expect(getByTestId('habit-card-1')).toBeTruthy();
    });

    expect(
      getByLabelText('Mark Exercise as complete. Current streak: 5 days.'),
    ).toBeTruthy();
    expect(getByLabelText('Create new habit')).toBeTruthy();
  });

  // ─── Snapshot test ──────────────────────────────────────────────────

  it('matches snapshot', async () => {
    const habits = [
      {id: '1', name: 'Exercise', completedToday: true, streak: 7},
      {id: '2', name: 'Read', completedToday: false, streak: 0},
    ];
    const service = createMockServiceWithStreaks(habits);

    const {toJSON, getByTestId} = render(
      <DashboardScreen habitService={service} />,
    );

    await waitFor(() => {
      expect(getByTestId('habit-card-1')).toBeTruthy();
    });

    expect(toJSON()).toMatchSnapshot();
  });
});
