// src/navigation/AppNavigator.tsx
import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { HabitsProvider } from '../hooks/useHabitsContext';
import type HabitService from '../services/HabitService';
import type { AuthStackParamList } from './types';

import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import DashboardScreen from '../screens/DashboardScreen';
import StreaksScreen from '../screens/StreaksScreen';
import StatsListScreen from '../screens/StatsListScreen';
import SettingsScreen from '../screens/SettingsScreen';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
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

export const RootNavigator: React.FC<{habitService?: HabitService}> = ({
  habitService,
}) => {
  const { isAuthenticated, isLoading, userId } = useAuth();

  // Set ownership before the provider mounts so its first query cannot expose
  // the previous account's local rows during an account switch.
  if (habitService && userId) {
    habitService.setUserId(userId);
  }

  React.useEffect(() => {
    if (!habitService || !userId) return;
    habitService.setUserId(userId);
    // Rows predating per-account ownership belong to nobody until the first
    // account signs in and adopts them. Without this they would be invisible
    // to every account, since queries now scope on the owner alone.
    habitService.claimLegacyRows(userId).catch(error => {
      console.warn('Failed to claim legacy rows:', error);
    });
  }, [habitService, userId]);

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
          <MainTabNavigator />
        </HabitsProvider>
      ) : isAuthenticated ? (
        <MainTabNavigator />
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
