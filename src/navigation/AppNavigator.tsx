import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import DashboardScreen from '../screens/DashboardScreen';
import StatsScreen from '../screens/StatsScreen';
import StatsListScreen from '../screens/StatsListScreen';
import StreaksScreen from '../screens/StreaksScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CreateHabitModal from '../screens/CreateHabitModal';
import NBTabBar from '../components/atoms/NBTabBar';
import {HabitsProvider} from '../hooks/useHabitsContext';
import HabitService from '../services/HabitService';
import database from '../models';

const sharedHabitService = new HabitService(database);

const HomeStack = createNativeStackNavigator();
const StatsStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const HomeStackScreen: React.FC = () => (
  <HomeStack.Navigator screenOptions={{headerShown: false}}>
    <HomeStack.Screen name="Dashboard" component={DashboardScreen} />
    <HomeStack.Screen name="Stats" component={StatsScreen} />
    <HomeStack.Screen
      name="CreateHabit"
      component={CreateHabitModal}
      options={{presentation: 'modal'}}
    />
  </HomeStack.Navigator>
);

const StatsStackScreen: React.FC = () => (
  <StatsStack.Navigator screenOptions={{headerShown: false}}>
    <StatsStack.Screen name="StatsList" component={StatsListScreen} />
    <StatsStack.Screen name="Stats" component={StatsScreen} />
  </StatsStack.Navigator>
);

const SettingsStackScreen: React.FC = () => (
  <SettingsStack.Navigator screenOptions={{headerShown: false}}>
    <SettingsStack.Screen name="SettingsScreen" component={SettingsScreen} />
  </SettingsStack.Navigator>
);

const AppNavigator: React.FC = () => (
  <HabitsProvider habitService={sharedHabitService}>
    <Tab.Navigator
      screenOptions={{headerShown: false}}
      tabBar={props => <NBTabBar {...props} />}>
      <Tab.Screen name="Today" component={HomeStackScreen} />
      <Tab.Screen name="Streaks" component={StreaksScreen} />
      <Tab.Screen name="Stats" component={StatsStackScreen} />
      <Tab.Screen name="Me" component={SettingsStackScreen} />
    </Tab.Navigator>
  </HabitsProvider>
);

export default AppNavigator;
