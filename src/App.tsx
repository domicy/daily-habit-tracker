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

const App: React.FC = () => {
  return (
    <ServicesProvider>
      <SafeAreaProvider>
        <NotificationBootstrap />
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </ServicesProvider>
  );
};

export default App;
