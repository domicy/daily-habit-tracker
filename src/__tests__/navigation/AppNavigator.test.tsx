// src/__tests__/navigation/AppNavigator.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { RootNavigator } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';

// Mock AuthContext hook
jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock HabitsProvider to verify lifecycle mounting
jest.mock('../../hooks/useHabitsContext', () => ({
  HabitsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Mock Navigation Screens
jest.mock('../../screens/LoginScreen', () => ({
  LoginScreen: () => 'LoginScreenMock',
}));
jest.mock('../../screens/RegisterScreen', () => ({
  RegisterScreen: () => 'RegisterScreenMock',
}));
jest.mock('../../screens/DashboardScreen', () => () => 'DashboardScreenMock');
jest.mock('../../screens/StreaksScreen', () => () => 'StreaksScreenMock');
jest.mock('../../screens/StatsListScreen', () => () => 'StatsListScreenMock');
jest.mock('../../screens/SettingsScreen', () => () => 'SettingsScreenMock');

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
});