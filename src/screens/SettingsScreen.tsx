import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  Switch,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {format} from 'date-fns';
import {colors} from '../theme/colors';
import {fontFamily, typeScale} from '../theme/typography';
import {spacing} from '../theme/spacing';
import HabitService from '../services/HabitService';
import SyncService from '../services/SyncService';
import NotificationService from '../services/NotificationService';
import {API_BASE_URL} from '../services/api';
import database from '../models';
import type Habit from '../models/Habit';
import {useHabitObservable} from '../hooks/useHabitObservable';

const APP_VERSION = '0.0.1';
const REMINDER_ENABLED_KEY = 'reminder_enabled';
const REMINDER_TIME_KEY = 'reminder_time';
const LAST_SYNC_KEY = 'last_sync_timestamp';

interface SettingsScreenProps {
  habitService?: HabitService;
  syncService?: SyncService;
  notificationService?: NotificationService;
}

const defaultHabitService = new HabitService(database);
const defaultSyncService = new SyncService(defaultHabitService);
const defaultNotificationService = new NotificationService();

const SettingsScreen: React.FC<SettingsScreenProps> = ({
  habitService,
  syncService,
  notificationService,
}) => {
  const hService = habitService ?? defaultHabitService;
  const sService = syncService ?? defaultSyncService;
  const nService = notificationService ?? defaultNotificationService;

  const allHabits$ = useMemo(() => hService.getAllHabits(), [hService]);
  const habits = useHabitObservable<Habit[]>(allHabits$, []);
  const unsyncedCount$ = useMemo(() => hService.observeUnsyncedCount(), [hService]);
  const unsyncedCount = useHabitObservable<number>(unsyncedCount$, 0);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('08:00');
  const [syncStatus, setSyncStatus] = useState<'online' | 'offline' | 'auth_failed'>('online');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Load notification preferences
  useEffect(() => {
    (async () => {
      const enabled = await AsyncStorage.getItem(REMINDER_ENABLED_KEY);
      if (enabled !== null) {
        setReminderEnabled(enabled === 'true');
      }
      const time = await AsyncStorage.getItem(REMINDER_TIME_KEY);
      if (time !== null) {
        setReminderTime(time);
      }
    })();
  }, []);

  // Load sync info (status + last-sync timestamp). The pending count is
  // sourced from observeUnsyncedCount above so it updates live as the user
  // edits habits on other tabs without remounting this screen.
  useEffect(() => {
    (async () => {
      const status = await sService.getSyncStatus();
      setSyncStatus(status.status);
      const ts = await AsyncStorage.getItem(LAST_SYNC_KEY);
      setLastSyncTime(ts);
    })();
  }, [sService]);

  const handleToggleActive = useCallback(
    async (habitId: string) => {
      await hService.toggleHabitActive(habitId);
    },
    [hService],
  );

  const handleDeactivate = useCallback(
    (habitId: string, habitName: string) => {
      Alert.alert(
        'Deactivate Habit',
        `Are you sure you want to deactivate "${habitName}"? Historical logs will be preserved.`,
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Deactivate',
            style: 'destructive',
            onPress: async () => {
              await hService.toggleHabitActive(habitId);
            },
          },
        ],
      );
    },
    [hService],
  );

  const handleReminderToggle = useCallback(
    async (value: boolean) => {
      const hour = parseInt(reminderTime.split(':')[0], 10);
      const minute = parseInt(reminderTime.split(':')[1], 10);
      const granted = await nService.onNotificationToggle(value, hour, minute);

      // If user tried to enable but permission was denied, keep toggle off
      const finalValue = value ? granted : false;
      setReminderEnabled(finalValue);
      await AsyncStorage.setItem(REMINDER_ENABLED_KEY, String(finalValue));
    },
    [nService, reminderTime],
  );

  const handleTimeChange = useCallback(
    async (hour: number) => {
      const timeStr = `${String(hour).padStart(2, '0')}:00`;
      setReminderTime(timeStr);
      await AsyncStorage.setItem(REMINDER_TIME_KEY, timeStr);

      // If reminders are enabled, reschedule with the new time
      if (reminderEnabled) {
        await nService.scheduleDailyReminder(hour, 0);
      }
    },
    [nService, reminderEnabled],
  );

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await sService.pushUnsyncedLogs();
      const status = await sService.getSyncStatus();
      setSyncStatus(status.status);
      if (status.status !== 'offline' && status.status !== 'auth_failed') {
        const now = new Date().toISOString();
        await AsyncStorage.setItem(LAST_SYNC_KEY, now);
        setLastSyncTime(now);
      }
    } finally {
      setSyncing(false);
    }
  }, [sService]);

  const renderHabitRow = useCallback(
    ({item}: {item: Habit}) => (
      <TouchableOpacity
        style={styles.habitRow}
        testID={`habit-row-${item.id}`}
        onLongPress={() => handleDeactivate(item.id, item.name)}
        accessibilityLabel={`${item.name} habit`}>
        <View style={styles.habitInfo}>
          <Text style={styles.habitName}>{item.name}</Text>
          <Text style={styles.habitDate}>
            Created {format(new Date(item.createdAt), 'MMM d, yyyy')}
          </Text>
        </View>
        <Switch
          testID={`toggle-active-${item.id}`}
          value={item.isActive}
          onValueChange={() => handleToggleActive(item.id)}
          trackColor={{false: colors.border, true: colors.clemsonOrange}}
          thumbColor={colors.textPrimary}
        />
      </TouchableOpacity>
    ),
    [handleToggleActive, handleDeactivate],
  );

  const hours = Array.from({length: 24}, (_, i) => i);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="settings-screen">
      {/* Your Habits */}
      <Text style={styles.sectionTitle}>Your Habits</Text>
      <View style={styles.section}>
        {habits.length === 0 ? (
          <Text style={styles.emptyText}>No habits yet.</Text>
        ) : (
          <FlatList
            data={habits}
            renderItem={renderHabitRow}
            keyExtractor={item => item.id}
            scrollEnabled={false}
            testID="habits-list"
          />
        )}
      </View>

      {/* Notifications */}
      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Daily Reminder</Text>
          <Switch
            testID="reminder-toggle"
            value={reminderEnabled}
            onValueChange={handleReminderToggle}
            trackColor={{false: colors.border, true: colors.clemsonOrange}}
            thumbColor={colors.textPrimary}
          />
        </View>
        {reminderEnabled && (
          <View style={styles.timePickerContainer}>
            <Text style={styles.rowLabel}>Reminder Time</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.timePicker}
              testID="time-picker">
              {hours.map(hour => (
                <TouchableOpacity
                  key={hour}
                  testID={`time-option-${hour}`}
                  style={[
                    styles.timeOption,
                    reminderTime === `${String(hour).padStart(2, '0')}:00` &&
                      styles.timeOptionSelected,
                  ]}
                  onPress={() => handleTimeChange(hour)}>
                  <Text
                    style={[
                      styles.timeOptionText,
                      reminderTime === `${String(hour).padStart(2, '0')}:00` &&
                        styles.timeOptionTextSelected,
                    ]}>
                    {hour === 0
                      ? '12 AM'
                      : hour < 12
                        ? `${hour} AM`
                        : hour === 12
                          ? '12 PM'
                          : `${hour - 12} PM`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Sync */}
      <Text style={styles.sectionTitle}>Sync</Text>
      <View style={styles.section}>
        {syncStatus === 'offline' ? (
          <Text style={styles.syncStatus} testID="sync-status">
            Offline — <Text testID="pending-sync-count">{unsyncedCount}</Text> {unsyncedCount === 1 ? 'log' : 'logs'} pending
          </Text>
        ) : syncStatus === 'auth_failed' ? (
          <Text style={styles.syncStatus} testID="sync-status">
            Authentication required — <Text testID="pending-sync-count">{unsyncedCount}</Text>{' '}
            {unsyncedCount === 1 ? 'log' : 'logs'} pending
          </Text>
        ) : (
          <Text style={styles.syncStatus} testID="sync-status">
            <Text testID="pending-sync-count">{unsyncedCount}</Text> {unsyncedCount === 1 ? 'log' : 'logs'} pending sync
          </Text>
        )}
        <TouchableOpacity
          style={styles.syncButton}
          onPress={handleSyncNow}
          disabled={syncing}
          testID="sync-now-button">
          {syncing ? (
            <ActivityIndicator color={colors.textPrimary} testID="sync-spinner" />
          ) : (
            <Text style={styles.syncButtonText}>Sync Now</Text>
          )}
        </TouchableOpacity>
        {lastSyncTime && (
          <Text style={styles.lastSync} testID="last-sync-time">
            Last sync: {format(new Date(lastSyncTime), 'MMM d, yyyy h:mm a')}
          </Text>
        )}
      </View>

      {/* About */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue} testID="app-version">
            {APP_VERSION}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Server URL</Text>
          <Text
            style={[styles.rowValue, styles.serverUrl]}
            testID="server-url"
            numberOfLines={1}>
            {API_BASE_URL}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    fontFamily: fontFamily.heading,
    ...typeScale.h2,
    color: colors.clemsonOrange,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  habitInfo: {
    flex: 1,
  },
  habitName: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textPrimary,
  },
  habitDate: {
    fontFamily: fontFamily.body,
    ...typeScale.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textPrimary,
  },
  rowValue: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textSecondary,
  },
  serverUrl: {
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  timePickerContainer: {
    paddingVertical: spacing.sm,
  },
  timePicker: {
    marginTop: spacing.sm,
  },
  timeOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.border,
    marginRight: spacing.sm,
  },
  timeOptionSelected: {
    backgroundColor: colors.clemsonOrange,
  },
  timeOptionText: {
    fontFamily: fontFamily.body,
    ...typeScale.caption,
    color: colors.textSecondary,
  },
  timeOptionTextSelected: {
    color: colors.textPrimary,
  },
  syncStatus: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  syncButton: {
    backgroundColor: colors.clemsonOrange,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  syncButtonText: {
    fontFamily: fontFamily.heading,
    ...typeScale.body,
    color: colors.textPrimary,
  },
  lastSync: {
    fontFamily: fontFamily.body,
    ...typeScale.caption,
    color: colors.textSecondary,
  },
});

export default SettingsScreen;
