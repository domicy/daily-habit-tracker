// src/__tests__/navigation/AppNavigator.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { RootNavigator } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';

// Mock AuthContext hook
jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
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
});
