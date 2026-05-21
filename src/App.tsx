import React, {useEffect} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppNavigator from './navigation/AppNavigator';
import {ServicesProvider, useServices} from './services/ServicesContext';

const NotificationBootstrap: React.FC = () => {
  const services = useServices();
  // Reschedule notifications on app launch.
  // iOS can clear scheduled notifications on reboot, so we re-register them
  // every time the app starts if the user has notifications enabled.
  useEffect(() => {
    if (!services) {
      return;
    }
    (async () => {
      const enabled = await AsyncStorage.getItem('reminder_enabled');
      if (enabled === 'true') {
        const time = (await AsyncStorage.getItem('reminder_time')) ?? '08:00';
        const [hour, minute] = time.split(':').map(Number);
        await services.notificationService.scheduleDailyReminder(hour, minute);
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

const App: React.FC = () => {
  return (
    <ServicesProvider>
      <SafeAreaProvider>
        <NotificationBootstrap />
        <SyncBootstrap />
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </ServicesProvider>
  );
};

export default App;
