// src/__tests__/navigation/AppNavigator.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { RootNavigator } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';
import { useServices } from '../../services/ServicesContext';

// Mock AuthContext hook
jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock ServicesContext: importing it for real pulls in SyncService and, with
// it, the AsyncStorage native module this suite has no need for.
jest.mock('../../services/ServicesContext', () => ({
  useServices: jest.fn(() => null),
}));

// Mock HabitsProvider using inline require for View
jest.mock('../../hooks/useHabitsContext', () => {
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    HabitsProvider: ({ children }: { children: React.ReactNode }) => (
      <View testID="habits-provider-mock">{children}</View>
    ),
  };
});

// Mock Navigation Screens using inline require for Text
jest.mock('../../screens/LoginScreen', () => {
  const { Text } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    LoginScreen: () => <Text>LoginScreenMock</Text>,
  };
});
jest.mock('../../screens/RegisterScreen', () => {
  const { Text } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    RegisterScreen: () => <Text>RegisterScreenMock</Text>,
  };
});
jest.mock('../../screens/DashboardScreen', () => {
  const { Text } = jest.requireActual('react-native') as typeof import('react-native');
  return () => <Text>DashboardScreenMock</Text>;
});
jest.mock('../../screens/StreaksScreen', () => {
  const { Text } = jest.requireActual('react-native') as typeof import('react-native');
  return () => <Text>StreaksScreenMock</Text>;
});
jest.mock('../../screens/StatsListScreen', () => {
  const { Text } = jest.requireActual('react-native') as typeof import('react-native');
  return () => <Text>StatsListScreenMock</Text>;
});
jest.mock('../../screens/SettingsScreen', () => {
  const { Text } = jest.requireActual('react-native') as typeof import('react-native');
  return () => <Text>SettingsScreenMock</Text>;
});

describe('AppNavigator Conditional Routing', () => {
  it('renders loading indicator while authentication status is restoring', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
    });

    const { getByTestId } = render(<RootNavigator />);
    expect(getByTestId('auth-loading-indicator')).toBeTruthy();
  });

  it('renders AuthNavigator (Login screen) when user is not authenticated', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
    });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => {
      expect(getByText('LoginScreenMock')).toBeTruthy();
    });
  });

  it('renders MainTabNavigator when user is authenticated', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => {
      expect(getByText('DashboardScreenMock')).toBeTruthy();
    });
  });

  it('gives SyncService a way to end the session when the server rejects our token', async () => {
    // SyncService sits above AuthProvider and can no longer mint a token of
    // its own (issue #125), so the navigator hands it the session's own exit.
    const sessionExpired = jest.fn();
    const setOnSessionExpired = jest.fn();
    (useAuth as jest.Mock).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      sessionExpired,
    });
    (useServices as jest.Mock).mockReturnValue({
      syncService: { setOnSessionExpired },
    });

    const { unmount } = render(<RootNavigator />);

    await waitFor(() => {
      expect(setOnSessionExpired).toHaveBeenCalledWith(expect.any(Function));
    });

    setOnSessionExpired.mock.calls[0][0]();
    expect(sessionExpired).toHaveBeenCalledTimes(1);

    unmount();
    expect(setOnSessionExpired).toHaveBeenLastCalledWith(null);
  });

  it('clears the auth-failure latch and pushes the backlog once a session is valid', async () => {
    // A 401 latches sync_auth_failed and nothing else releases it, so one
    // expired token used to kill syncing on that device permanently (issue
    // #134). This effect is the only place that knows a real account just
    // became active.
    let resolveClaim: (value: number) => void = () => {};
    const claimLegacyRows = jest.fn(
      () => new Promise<number>(resolve => { resolveClaim = resolve; }),
    );
    const setUserId = jest.fn();
    const clearAuthFailedFlag = jest.fn().mockResolvedValue(undefined);
    const pushUnsyncedLogs = jest.fn().mockResolvedValue({pushed: 0, failed: 0});

    (useAuth as jest.Mock).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      userId: 'user-1',
      sessionExpired: jest.fn(),
    });
    (useServices as jest.Mock).mockReturnValue({
      syncService: {
        setOnSessionExpired: jest.fn(),
        clearAuthFailedFlag,
        pushUnsyncedLogs,
      },
    });

    const habitService = { setUserId, claimLegacyRows } as never;
    render(<RootNavigator habitService={habitService} />);

    await waitFor(() => {
      expect(claimLegacyRows).toHaveBeenCalledWith('user-1');
    });

    // The unsynced queries scope on the owner, so a push that overtook
    // claimLegacyRows would look at rows the account does not own yet and
    // find an empty backlog.
    expect(clearAuthFailedFlag).not.toHaveBeenCalled();
    expect(pushUnsyncedLogs).not.toHaveBeenCalled();

    resolveClaim(0);

    await waitFor(() => {
      expect(pushUnsyncedLogs).toHaveBeenCalledTimes(1);
    });
    expect(clearAuthFailedFlag).toHaveBeenCalledTimes(1);
    expect(clearAuthFailedFlag.mock.invocationCallOrder[0]).toBeLessThan(
      pushUnsyncedLogs.mock.invocationCallOrder[0],
    );
  });

  it('still restores sync when claiming legacy rows fails', async () => {
    // The claim is best-effort; letting it abort the chain would leave the
    // latch set and reinstate the very bug this effect fixes.
    const clearAuthFailedFlag = jest.fn().mockResolvedValue(undefined);
    const pushUnsyncedLogs = jest.fn().mockResolvedValue({pushed: 0, failed: 0});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    (useAuth as jest.Mock).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      userId: 'user-1',
      sessionExpired: jest.fn(),
    });
    (useServices as jest.Mock).mockReturnValue({
      syncService: {
        setOnSessionExpired: jest.fn(),
        clearAuthFailedFlag,
        pushUnsyncedLogs,
      },
    });

    const habitService = {
      setUserId: jest.fn(),
      claimLegacyRows: jest.fn().mockRejectedValue(new Error('db locked')),
    } as never;
    render(<RootNavigator habitService={habitService} />);

    await waitFor(() => {
      expect(pushUnsyncedLogs).toHaveBeenCalledTimes(1);
    });
    expect(clearAuthFailedFlag).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('does not clear the latch or sync while signed out', async () => {
    const clearAuthFailedFlag = jest.fn().mockResolvedValue(undefined);
    const pushUnsyncedLogs = jest.fn().mockResolvedValue({pushed: 0, failed: 0});

    (useAuth as jest.Mock).mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      userId: null,
      sessionExpired: jest.fn(),
    });
    (useServices as jest.Mock).mockReturnValue({
      syncService: {
        setOnSessionExpired: jest.fn(),
        clearAuthFailedFlag,
        pushUnsyncedLogs,
      },
    });

    const habitService = {
      setUserId: jest.fn(),
      claimLegacyRows: jest.fn().mockResolvedValue(0),
    } as never;
    const { getByText } = render(<RootNavigator habitService={habitService} />);

    await waitFor(() => {
      expect(getByText('LoginScreenMock')).toBeTruthy();
    });
    expect(clearAuthFailedFlag).not.toHaveBeenCalled();
    expect(pushUnsyncedLogs).not.toHaveBeenCalled();
  });
});
