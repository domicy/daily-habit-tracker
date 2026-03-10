import React from 'react';
import {render, fireEvent, waitFor, act} from '@testing-library/react-native';
import SettingsScreen from '../../screens/SettingsScreen';
import HabitService from '../../services/HabitService';
import SyncService from '../../services/SyncService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {of} from 'rxjs';

// Mock the database import to avoid SQLite initialization in tests
jest.mock('../../models', () => ({}));

// Mock @notifee/react-native (imported transitively via NotificationService)
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    requestPermission: jest.fn().mockResolvedValue({authorizationStatus: 1}),
    createChannel: jest.fn().mockResolvedValue(''),
    createTriggerNotification: jest.fn().mockResolvedValue(''),
    cancelTriggerNotification: jest.fn().mockResolvedValue(undefined),
  },
  AuthorizationStatus: {DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2, NOT_DETERMINED: -1},
  TriggerType: {TIMESTAMP: 0},
  RepeatFrequency: {DAILY: 3},
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock date-fns format for deterministic output
jest.mock('date-fns', () => ({
  ...jest.requireActual('date-fns'),
  format: (date: Date, fmt: string) => {
    if (fmt === 'MMM d, yyyy') {
      return 'Jan 1, 2026';
    }
    if (fmt === 'MMM d, yyyy h:mm a') {
      return 'Mar 5, 2026 8:00 AM';
    }
    return jest.requireActual('date-fns').format(date, fmt);
  },
}));

// Mock Alert
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Alert.alert = jest.fn();
  return RN;
});

function createMockHabits(
  items: Array<{id: string; name: string; isActive: boolean; createdAt?: number}>,
) {
  return items.map(h => ({
    id: h.id,
    name: h.name,
    isActive: h.isActive,
    createdAt: h.createdAt ?? 1704067200000, // Jan 1, 2024
  }));
}

function createMockHabitService(
  habits: Array<{id: string; name: string; isActive: boolean}>,
  unsyncedCount = 0,
) {
  const mockHabits = createMockHabits(habits);
  const unsyncedLogs = Array.from({length: unsyncedCount}, (_, i) => ({
    id: `log-${i}`,
    habitId: 'h1',
    completedDate: '2026-03-05',
    synced: false,
  }));

  return {
    getAllHabits: jest.fn().mockReturnValue(of(mockHabits)),
    getActiveHabits: jest.fn().mockReturnValue(of([])),
    toggleHabitActive: jest.fn().mockResolvedValue(undefined),
    getUnsyncedLogs: jest.fn().mockResolvedValue(unsyncedLogs),
    createHabit: jest.fn().mockResolvedValue(undefined),
    toggleHabitCompletion: jest.fn().mockResolvedValue(undefined),
    calculateStreak: jest.fn().mockResolvedValue(0),
    getLogsForHabit: jest.fn().mockResolvedValue([]),
    getHabitById: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<HabitService>;
}

function createMockSyncService(pendingCount = 0) {
  return {
    pushUnsyncedLogs: jest.fn().mockResolvedValue({pushed: 0, failed: 0}),
    authenticate: jest.fn().mockResolvedValue(undefined),
    startBackgroundSync: jest.fn(),
    stopBackgroundSync: jest.fn(),
    debouncedSync: jest.fn(),
    getAuthToken: jest.fn().mockResolvedValue(null),
    isAuthenticated: jest.fn().mockResolvedValue(false),
    getSyncStatus: jest.fn().mockResolvedValue({status: 'online', pendingCount}),
    clearAuthFailedFlag: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SyncService>;
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('lists all habits including active and inactive', async () => {
    const habits = [
      {id: '1', name: 'Exercise', isActive: true},
      {id: '2', name: 'Read', isActive: false},
      {id: '3', name: 'Meditate', isActive: true},
    ];
    const service = createMockHabitService(habits);
    const syncService = createMockSyncService();

    const {getByText, getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} />,
    );

    await waitFor(() => {
      expect(getByTestId('habit-row-1')).toBeTruthy();
      expect(getByTestId('habit-row-2')).toBeTruthy();
      expect(getByTestId('habit-row-3')).toBeTruthy();
    });

    expect(getByText('Exercise')).toBeTruthy();
    expect(getByText('Read')).toBeTruthy();
    expect(getByText('Meditate')).toBeTruthy();
  });

  it('calls toggleHabitActive when toggling a habit switch', async () => {
    const habits = [
      {id: 'h1', name: 'Exercise', isActive: true},
    ];
    const service = createMockHabitService(habits);
    const syncService = createMockSyncService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} />,
    );

    await waitFor(() => {
      expect(getByTestId('toggle-active-h1')).toBeTruthy();
    });

    await act(async () => {
      fireEvent(getByTestId('toggle-active-h1'), 'valueChange', false);
    });

    expect(service.toggleHabitActive).toHaveBeenCalledWith('h1');
  });

  it('displays correct unsynced logs count', async () => {
    const service = createMockHabitService([], 5);
    const syncService = createMockSyncService(5);

    const {getByTestId, getByText} = render(
      <SettingsScreen habitService={service} syncService={syncService} />,
    );

    await waitFor(() => {
      expect(getByTestId('pending-sync-count')).toBeTruthy();
    });

    expect(getByTestId('pending-sync-count').props.children).toBe(5);
    expect(getByText(/5.*logs.*pending sync/)).toBeTruthy();
  });

  it('displays app version and server URL', async () => {
    const service = createMockHabitService([]);
    const syncService = createMockSyncService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} />,
    );

    await waitFor(() => {
      expect(getByTestId('app-version')).toBeTruthy();
    });

    expect(getByTestId('app-version').props.children).toBe('0.0.1');
    expect(getByTestId('server-url').props.children).toBe(
      'https://habit-tracker.tunnel.example.com',
    );
  });

  it('calls pushUnsyncedLogs when Sync Now is pressed', async () => {
    const service = createMockHabitService([]);
    const syncService = createMockSyncService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} />,
    );

    await waitFor(() => {
      expect(getByTestId('sync-now-button')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId('sync-now-button'));
    });

    expect(syncService.pushUnsyncedLogs).toHaveBeenCalled();
  });

  it('displays "1 log pending sync" for singular count', async () => {
    const service = createMockHabitService([], 1);
    const syncService = createMockSyncService(1);

    const {getByTestId, getByText} = render(
      <SettingsScreen habitService={service} syncService={syncService} />,
    );

    await waitFor(() => {
      expect(getByTestId('pending-sync-count')).toBeTruthy();
    });

    expect(getByTestId('pending-sync-count').props.children).toBe(1);
    expect(getByText(/1.*log.*pending sync/)).toBeTruthy();
  });
});
