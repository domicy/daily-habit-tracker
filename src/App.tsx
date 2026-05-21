import React, {useEffect} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppNavigator from './navigation/AppNavigator';
import NotificationService from './services/NotificationService';
import HabitService from './services/HabitService';
import SyncService from './services/SyncService';
import database from './models';

const notificationService = new NotificationService();
const habitService = new HabitService(database);
const syncService = new SyncService(habitService);

const App: React.FC = () => {
  // Reschedule notifications on app launch.
  // iOS can clear scheduled notifications on reboot, so we re-register them
  // every time the app starts if the user has notifications enabled.
  useEffect(() => {
    (async () => {
      const enabled = await AsyncStorage.getItem('reminder_enabled');
      if (enabled === 'true') {
        const time = (await AsyncStorage.getItem('reminder_time')) ?? '08:00';
        const [hour, minute] = time.split(':').map(Number);
        await notificationService.scheduleDailyReminder(hour, minute);
      }
    })();
  }, []);

  // Push unsynced logs once at launch, then again whenever the app
  // returns to the foreground.
  useEffect(() => {
    syncService.pushUnsyncedLogs();
    syncService.startBackgroundSync();
    return () => syncService.stopBackgroundSync();
  }, []);

  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
};

export default App;
