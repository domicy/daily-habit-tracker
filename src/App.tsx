import React, {useEffect} from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppNavigator from './navigation/AppNavigator';
import {ServicesProvider, useServices} from './services/ServicesContext';

const NotificationBootstrap: React.FC = () => {
  const services = useServices();
  // Reschedule notifications on app launch.
  // iOS can clear scheduled notifications on reboot, so we re-register them
  // every time the app starts. The global reminder is gated by the
  // `reminder_enabled` AsyncStorage flag; when global is OFF, each habit
  // with `notifications_enabled=true` gets its own scheduled reminder.
  useEffect(() => {
    if (!services) {
      return;
    }
    (async () => {
      const {notificationService, habitService} = services;
      const enabled = await AsyncStorage.getItem('reminder_enabled');
      if (enabled === 'true') {
        const time = (await AsyncStorage.getItem('reminder_time')) ?? '08:00';
        const [hour, minute] = time.split(':').map(Number);
        await notificationService.scheduleDailyReminder(hour, minute);
        // Defensive: ensure no per-habit reminders linger from a prior
        // session in which global was OFF.
        await notificationService.cancelAllHabitReminders();
      } else {
        await notificationService.cancelDailyReminder();
        // Clear any stale per-habit reminders (e.g. for habits that have
        // since been deactivated or had notifications turned off) before
        // re-registering from the current DB state.
        await notificationService.cancelAllHabitReminders();
        const habits = await habitService.getHabitsWithNotifications();
        // Promise.all so several reminders don't serialize across the
        // Notifee bridge and stutter cold-launch.
        await Promise.all(
          habits.map(habit => {
            const [hour, minute] = (habit.notificationTime || '08:00')
              .split(':')
              .map(Number);
            return notificationService.scheduleHabitReminder(
              habit.id,
              habit.name,
              hour,
              minute,
            );
          }),
        );
      }
    })();
  }, [services]);
  return null;
};

const SyncBootstrap: React.FC = () => {
  const services = useServices();
  // Push unsynced logs once at launch, then again whenever the app returns
  // to the foreground. Without this the user only ever syncs by tapping
  // "Sync Now" in Settings.
  useEffect(() => {
    if (!services) {
      return;
    }
    services.syncService.pushUnsyncedLogs();
    services.syncService.startBackgroundSync();
    return () => services.syncService.stopBackgroundSync();
  }, [services]);
  return null;
};

const NavigationBootstrap: React.FC = () => {
  const services = useServices();
  if (!services) {
    return null;
  }
  return <AppNavigator habitService={services.habitService} />;
};

const App: React.FC = () => {
  return (
    <ServicesProvider>
      <SafeAreaProvider>
        <NotificationBootstrap />
        <SyncBootstrap />
        {/* No NavigationContainer here: RootNavigator mounts its own, because
            it swaps the whole navigator between AuthNavigator and the tabs on
            the auth state. Nesting a second one throws in React Navigation 7
            (see issue #129), and only once auth hydration completes — which is
            why App.test.tsx has to await that before asserting. */}
        <NavigationBootstrap />
      </SafeAreaProvider>
    </ServicesProvider>
  );
};

export default App;
