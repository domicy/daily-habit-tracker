// src/navigation/AppNavigator.tsx
import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { useServices } from '../services/ServicesContext';
import { HabitsProvider } from '../hooks/useHabitsContext';
import type HabitService from '../services/HabitService';
import type { AuthStackParamList, RootStackParamList } from './types';

import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import DashboardScreen from '../screens/DashboardScreen';
import StreaksScreen from '../screens/StreaksScreen';
import StatsListScreen from '../screens/StatsListScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StatsScreen from '../screens/StatsScreen';
import CreateHabitModal from '../screens/CreateHabitModal';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
    <AuthStack.Screen name="Register" component={RegisterScreen} />
  </AuthStack.Navigator>
);

const MainTabNavigator = () => {
  const {logout} = useAuth();
  return <Tab.Navigator>
    <Tab.Screen name="Dashboard" component={DashboardScreen} />
    <Tab.Screen name="Streaks" component={StreaksScreen} />
    <Tab.Screen name="Stats" component={StatsListScreen} />
    <Tab.Screen name="Settings">
      {props => <SettingsScreen {...props} onLogout={logout} />}
    </Tab.Screen>
  </Tab.Navigator>;
};

/**
 * The tab navigator sits inside a stack so the habit detail and create screens
 * have routes at all. Before this they were rendered nowhere, which is why
 * `navigate('CreateHabit')` threw and `navigate('Stats', {habitId})` silently
 * landed on the Stats *tab* (the habit list) rather than the detail screen.
 *
 * Every screen draws its own header, so the stack's is hidden.
 */
const MainNavigator = () => (
  <RootStack.Navigator screenOptions={{ headerShown: false }}>
    <RootStack.Screen name="Tabs" component={MainTabNavigator} />
    <RootStack.Screen name="HabitDetail" component={StatsScreen} />
    <RootStack.Screen
      name="CreateHabit"
      component={CreateHabitModal}
      options={{ presentation: 'modal' }}
    />
  </RootStack.Navigator>
);

export const RootNavigator: React.FC<{habitService?: HabitService}> = ({
  habitService,
}) => {
  const { isAuthenticated, isLoading, userId, sessionExpired } = useAuth();
  const services = useServices();

  // SyncService lives above AuthProvider, so it cannot reach the session
  // itself. Hand it the one thing it needs when the server rejects our token.
  React.useEffect(() => {
    services?.syncService.setOnSessionExpired(() => {
      sessionExpired();
    });
    return () => services?.syncService.setOnSessionExpired(null);
  }, [services, sessionExpired]);

  // Set ownership before the provider mounts so its first query cannot expose
  // the previous account's local rows during an account switch.
  if (habitService && userId) {
    habitService.setUserId(userId);
  }

  // Fires exactly when a session becomes valid — a sign-in, a registration, or
  // a launch that hydrated a stored token — which is the only moment the app
  // knows a real account is active again.
  React.useEffect(() => {
    if (!habitService || !userId) return;
    let cancelled = false;
    habitService.setUserId(userId);
    (async () => {
      try {
        // Rows predating per-account ownership belong to nobody until the
        // first account signs in and adopts them. Without this they would be
        // invisible to every account, since queries now scope on the owner
        // alone.
        await habitService.claimLegacyRows(userId);
      } catch (error) {
        // Isolated deliberately: a failed claim must not stop the sync
        // recovery below, which is the whole reason this effect exists.
        console.warn('Failed to claim legacy rows:', error);
      }
      if (cancelled) return;
      // A 401 latches sync_auth_failed and nothing else ever releases it, so
      // one expired token used to end syncing on that device for good (issue
      // #134). Lift it now the session is valid, then push the backlog it was
      // stranding — the sync has to follow claimLegacyRows, because the unsynced
      // queries scope on the owner and would not see the adopted rows yet.
      await services?.syncService.clearAuthFailedFlag();
      if (cancelled) return;
      await services?.syncService.pushUnsyncedLogs();
    })().catch(error => {
      console.warn('Post-sign-in sync failed:', error);
    });
    return () => {
      cancelled = true;
    };
  }, [habitService, userId, services]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" testID="auth-loading-indicator" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated && habitService ? (
        <HabitsProvider key={userId ?? 'user'} habitService={habitService}>
          <MainNavigator />
        </HabitsProvider>
      ) : isAuthenticated ? (
        <MainNavigator />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
};

const AppNavigator: React.FC<{habitService: HabitService}> = ({habitService}) => {
  return (
    <AuthProvider>
      <RootNavigator habitService={habitService} />
    </AuthProvider>
  );
};

export default AppNavigator;

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
