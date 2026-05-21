import React from 'react';
import {Alert} from 'react-native';
import {render, fireEvent, waitFor, act} from '@testing-library/react-native';
import SettingsScreen from '../../screens/SettingsScreen';
import HabitService from '../../services/HabitService';
import SyncService, {AuthenticationError} from '../../services/SyncService';
import NotificationService from '../../services/NotificationService';
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
    observeUnsyncedCount: jest.fn().mockReturnValue(of(unsyncedCount)),
    createHabit: jest.fn().mockResolvedValue(undefined),
    toggleHabitCompletion: jest.fn().mockResolvedValue(undefined),
    calculateStreak: jest.fn().mockResolvedValue(0),
    getLogsForHabit: jest.fn().mockResolvedValue([]),
    getHabitById: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<HabitService>;
}

function createMockNotificationService() {
  return {
    requestPermission: jest.fn().mockResolvedValue(true),
    scheduleDailyReminder: jest.fn().mockResolvedValue(undefined),
    cancelDailyReminder: jest.fn().mockResolvedValue(undefined),
    onNotificationToggle: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<NotificationService>;
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
    const notificationService = createMockNotificationService();

    const {getByText, getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
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
    const notificationService = createMockNotificationService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
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
    const notificationService = createMockNotificationService();

    const {getByTestId, getByText} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
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
    const notificationService = createMockNotificationService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
    );

    await waitFor(() => {
      expect(getByTestId('app-version')).toBeTruthy();
    });

    expect(getByTestId('app-version').props.children).toBe('0.0.1');
    expect(getByTestId('server-url').props.children).toBe(
      'https://habit-api.darling.solutions',
    );
  });

  it('calls pushUnsyncedLogs when Sync Now is pressed', async () => {
    const service = createMockHabitService([]);
    const syncService = createMockSyncService();
    const notificationService = createMockNotificationService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
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
    const notificationService = createMockNotificationService();

    const {getByTestId, getByText} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
    );

    await waitFor(() => {
      expect(getByTestId('pending-sync-count')).toBeTruthy();
    });

    expect(getByTestId('pending-sync-count').props.children).toBe(1);
    expect(getByText(/1.*log.*pending sync/)).toBeTruthy();
  });

  it('authenticates and shows success alert when Connect is tapped with a secret', async () => {
    const service = createMockHabitService([]);
    const syncService = createMockSyncService();
    const notificationService = createMockNotificationService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
    );

    await waitFor(() => {
      expect(getByTestId('sync-secret-input')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('sync-secret-input'), 'my-secret');
    await act(async () => {
      fireEvent.press(getByTestId('connect-button'));
    });

    expect(syncService.authenticate).toHaveBeenCalledWith('my-secret');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Connected',
      expect.stringContaining('Sync is now enabled'),
    );
  });

  it('trims whitespace from the secret before calling authenticate', async () => {
    const service = createMockHabitService([]);
    const syncService = createMockSyncService();
    const notificationService = createMockNotificationService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
    );

    await waitFor(() => {
      expect(getByTestId('sync-secret-input')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('sync-secret-input'), '  padded-secret  ');
    await act(async () => {
      fireEvent.press(getByTestId('connect-button'));
    });

    expect(syncService.authenticate).toHaveBeenCalledWith('padded-secret');
  });

  it('shows an error alert when authenticate rejects with AuthenticationError', async () => {
    const service = createMockHabitService([]);
    const syncService = createMockSyncService();
    (syncService.authenticate as jest.Mock).mockRejectedValueOnce(
      new AuthenticationError('Invalid secret'),
    );
    const notificationService = createMockNotificationService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
    );

    await waitFor(() => {
      expect(getByTestId('sync-secret-input')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('sync-secret-input'), 'wrong');
    await act(async () => {
      fireEvent.press(getByTestId('connect-button'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Connection failed', 'Invalid secret');
  });

  it('shows a generic error message when authenticate rejects with a non-Authentication error', async () => {
    const service = createMockHabitService([]);
    const syncService = createMockSyncService();
    (syncService.authenticate as jest.Mock).mockRejectedValueOnce(
      new Error('boom'),
    );
    const notificationService = createMockNotificationService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
    );

    await waitFor(() => {
      expect(getByTestId('sync-secret-input')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('sync-secret-input'), 'anything');
    await act(async () => {
      fireEvent.press(getByTestId('connect-button'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Connection failed',
      expect.stringContaining('Could not reach the server'),
    );
  });

  it('does not call authenticate when the input is empty', async () => {
    const service = createMockHabitService([]);
    const syncService = createMockSyncService();
    const notificationService = createMockNotificationService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
    );

    await waitFor(() => {
      expect(getByTestId('connect-button')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId('connect-button'));
    });

    expect(syncService.authenticate).not.toHaveBeenCalled();
  });

  it('toggles secureTextEntry when the Show/Hide control is tapped', async () => {
    const service = createMockHabitService([]);
    const syncService = createMockSyncService();
    const notificationService = createMockNotificationService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
    );

    await waitFor(() => {
      expect(getByTestId('sync-secret-input')).toBeTruthy();
    });

    expect(getByTestId('sync-secret-input').props.secureTextEntry).toBe(true);

    await act(async () => {
      fireEvent.press(getByTestId('toggle-secret-visibility'));
    });

    expect(getByTestId('sync-secret-input').props.secureTextEntry).toBe(false);

    await act(async () => {
      fireEvent.press(getByTestId('toggle-secret-visibility'));
    });

    expect(getByTestId('sync-secret-input').props.secureTextEntry).toBe(true);
  });

  it('does not crash when the secret input gains focus (scroll-to-end handler)', async () => {
    jest.useFakeTimers();
    const service = createMockHabitService([]);
    const syncService = createMockSyncService();
    const notificationService = createMockNotificationService();

    const {getByTestId} = render(
      <SettingsScreen habitService={service} syncService={syncService} notificationService={notificationService} />,
    );

    await waitFor(() => {
      expect(getByTestId('sync-secret-input')).toBeTruthy();
    });

    // The handler schedules scrollRef.current?.scrollToEnd inside a 50ms
    // setTimeout. We can't hook the ScrollView ref from outside the
    // component, but firing focus + advancing timers exercises the path
    // and asserts it doesn't throw on a null/undefined ref.
    expect(() => {
      fireEvent(getByTestId('sync-secret-input'), 'focus');
      jest.advanceTimersByTime(60);
    }).not.toThrow();

    jest.useRealTimers();
  });
});
