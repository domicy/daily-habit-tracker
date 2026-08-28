import React from 'react';
import {render, waitFor, act} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Enough of the native surface to get App as far as the navigation tree. Without
// these the suite dies on NativeEventEmitter or the AsyncStorage native module
// long before it reaches the thing under test.
jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {getVersion: () => '1.0.0', getBuildNumber: () => '1'},
}));
jest.mock('@notifee/react-native', () => ({__esModule: true, default: {}}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// The tab screens are mocked for the same reason AppNavigator.test.tsx mocks
// them: this suite is about launch and the bootstrap effects, not about what
// each tab renders. The navigation tree itself stays real, which is what the
// nested-container regression depends on.
jest.mock('../screens/DashboardScreen', () => {
  const {Text} = jest.requireActual('react-native') as typeof import('react-native');
  return () => <Text>DashboardScreenMock</Text>;
});
jest.mock('../screens/StreaksScreen', () => {
  const {Text} = jest.requireActual('react-native') as typeof import('react-native');
  return () => <Text>StreaksScreenMock</Text>;
});
jest.mock('../screens/StatsListScreen', () => {
  const {Text} = jest.requireActual('react-native') as typeof import('react-native');
  return () => <Text>StatsListScreenMock</Text>;
});
jest.mock('../screens/SettingsScreen', () => {
  const {Text} = jest.requireActual('react-native') as typeof import('react-native');
  return () => <Text>SettingsScreenMock</Text>;
});

jest.mock('../models', () => ({
  __esModule: true,
  default: {},
  database: {write: jest.fn(), unsafeResetDatabase: jest.fn()},
}));

const mockHabitService = {
  setUserId: jest.fn(),
  claimLegacyRows: jest.fn().mockResolvedValue(0),
  getHabitsWithNotifications: jest.fn().mockResolvedValue([]),
};
const mockSyncService = {
  pushUnsyncedLogs: jest.fn().mockResolvedValue({pushed: 0, failed: 0}),
  startBackgroundSync: jest.fn(),
  stopBackgroundSync: jest.fn(),
  setOnSessionExpired: jest.fn(),
};
const mockNotificationService = {
  scheduleDailyReminder: jest.fn().mockResolvedValue(undefined),
  cancelDailyReminder: jest.fn().mockResolvedValue(undefined),
  cancelAllHabitReminders: jest.fn().mockResolvedValue(undefined),
  scheduleHabitReminder: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../services/HabitService', () =>
  jest.fn().mockImplementation(() => mockHabitService),
);
jest.mock('../services/SyncService', () =>
  jest.fn().mockImplementation(() => mockSyncService),
);
jest.mock('../services/NotificationService', () =>
  jest.fn().mockImplementation(() => mockNotificationService),
);

import App from '../App';

/** Render and wait past AuthProvider's token hydration. */
async function launch() {
  const utils = render(<App />);
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(utils.queryByTestId('auth-loading-indicator')).toBeNull();
  });
  return utils;
}

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHabitService.getHabitsWithNotifications.mockResolvedValue([]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('launches and reaches a navigator once auth hydration completes', async () => {
    // The assertion has to wait. RootNavigator returns only the loading spinner
    // while isLoading is true, so the navigation tree is not mounted on the
    // first render — a synchronous render(<App />) passes even against a second
    // nested NavigationContainer, which is how #129 survived unnoticed.
    const {queryByTestId, getByText} = render(<App />);

    expect(queryByTestId('auth-loading-indicator')).toBeTruthy();

    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(queryByTestId('auth-loading-indicator')).toBeNull();
    });

    // Signed out, so the auth stack is what should be on screen.
    await waitFor(() => {
      expect(getByText('Login')).toBeTruthy();
    });
  });

  it('starts background sync on launch and tears it down on unmount', async () => {
    const {unmount} = await launch();

    expect(mockSyncService.pushUnsyncedLogs).toHaveBeenCalled();
    expect(mockSyncService.startBackgroundSync).toHaveBeenCalled();

    unmount();
    expect(mockSyncService.stopBackgroundSync).toHaveBeenCalled();
  });

  it('reschedules the global reminder at the stored time when it is enabled', async () => {
    // iOS can drop scheduled notifications on reboot, so launch re-registers.
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'reminder_enabled' ? 'true' : key === 'reminder_time' ? '21:30' : null,
      ),
    );

    await launch();

    await waitFor(() => {
      expect(mockNotificationService.scheduleDailyReminder).toHaveBeenCalledWith(21, 30);
    });
    // Per-habit reminders must not linger from a session where global was OFF.
    expect(mockNotificationService.cancelAllHabitReminders).toHaveBeenCalled();
  });

  it('falls back to 08:00 when the global reminder has no stored time', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'reminder_enabled' ? 'true' : null),
    );

    await launch();

    await waitFor(() => {
      expect(mockNotificationService.scheduleDailyReminder).toHaveBeenCalledWith(8, 0);
    });
  });

  it('re-registers per-habit reminders when the global reminder is off', async () => {
    mockHabitService.getHabitsWithNotifications.mockResolvedValue([
      {id: 'h1', name: 'Read', notificationTime: '07:15'},
      {id: 'h2', name: 'Run', notificationTime: null},
    ]);

    await launch();

    await waitFor(() => {
      expect(mockNotificationService.scheduleHabitReminder).toHaveBeenCalledWith(
        'h1', 'Read', 7, 15,
      );
    });
    // A habit with no stored time falls back to 08:00 rather than NaN.
    expect(mockNotificationService.scheduleHabitReminder).toHaveBeenCalledWith(
      'h2', 'Run', 8, 0,
    );
    expect(mockNotificationService.cancelDailyReminder).toHaveBeenCalled();
    expect(mockNotificationService.scheduleDailyReminder).not.toHaveBeenCalled();
  });
});
