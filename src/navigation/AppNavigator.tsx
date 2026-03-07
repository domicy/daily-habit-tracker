import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import DashboardScreen from '../screens/DashboardScreen';
import SettingsScreen from '../screens/SettingsScreen';

const HomeStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const HomeStackScreen: React.FC = () => (
  <HomeStack.Navigator screenOptions={{headerShown: false}}>
    <HomeStack.Screen name="Dashboard" component={DashboardScreen} />
  </HomeStack.Navigator>
);

const SettingsStackScreen: React.FC = () => (
  <SettingsStack.Navigator>
    <SettingsStack.Screen name="SettingsScreen" component={SettingsScreen} options={{title: 'Settings'}} />
  </SettingsStack.Navigator>
);

const AppNavigator: React.FC = () => (
  <Tab.Navigator screenOptions={{headerShown: false}}>
    <Tab.Screen name="Home" component={HomeStackScreen} />
    <Tab.Screen name="Settings" component={SettingsStackScreen} />
  </Tab.Navigator>
);

export default AppNavigator;
