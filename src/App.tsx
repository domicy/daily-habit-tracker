import React, {useEffect} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppNavigator from './navigation/AppNavigator';
import NotificationService from './services/NotificationService';

const notificationService = new NotificationService();

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

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;
