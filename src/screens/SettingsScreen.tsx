import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {format} from 'date-fns';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from '../theme/colors';
import {fontFamily} from '../theme/typography';
import {spacing} from '../theme/spacing';
import {radii, borders, shadowOffsets} from '../theme';
import HabitService from '../services/HabitService';
import SyncService, {AuthenticationError} from '../services/SyncService';
import NotificationService from '../services/NotificationService';
import {API_BASE_URL} from '../services/api';
import {useServices} from '../services/ServicesContext';
import type Habit from '../models/Habit';
import {useHabitObservable} from '../hooks/useHabitObservable';
import NBSurface from '../components/atoms/NBSurface';
import NBCard from '../components/atoms/NBCard';
import NBChip from '../components/atoms/NBChip';
import NBToggle from '../components/atoms/NBToggle';
import NBButton from '../components/atoms/NBButton';
import NBShadow from '../components/atoms/NBShadow';
import NBSettingsRow from '../components/atoms/NBSettingsRow';
import {getAppReleaseString} from '../utils/appVersion';

const APP_VERSION = getAppReleaseString();
const REMINDER_ENABLED_KEY = 'reminder_enabled';
const REMINDER_TIME_KEY = 'reminder_time';
const LAST_SYNC_KEY = 'last_sync_timestamp';

interface SettingsScreenProps {
  habitService?: HabitService;
  syncService?: SyncService;
  notificationService?: NotificationService;
}

const SectionHeader: React.FC<{label: string; count?: string | number}> = ({
  label,
  count,
}) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText}>{`// ${label}`}</Text>
    {count !== undefined && (
      <Text style={styles.sectionHeaderText}>{count}</Text>
    )}
  </View>
);

const SettingsScreen: React.FC<SettingsScreenProps> = ({
  habitService,
  syncService,
  notificationService,
}) => {
  const ctxServices = useServices();
  const hService = habitService ?? ctxServices?.habitService;
  const sService = syncService ?? ctxServices?.syncService;
  const nService = notificationService ?? ctxServices?.notificationService;
  if (!hService || !sService || !nService) {
    throw new Error(
      'SettingsScreen requires services via props or <ServicesProvider>',
    );
  }

  const allHabits$ = useMemo(() => hService.getAllHabits(), [hService]);
  const habits = useHabitObservable<Habit[]>(allHabits$, [], 'SettingsScreen');
  const unsyncedCount$ = useMemo(
    () => hService.observeUnsyncedCount(),
    [hService],
  );
  const unsyncedCount = useHabitObservable<number>(
    unsyncedCount$,
    0,
    'SettingsScreen',
  );
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('08:00');
  const [syncStatus, setSyncStatus] = useState<
    'online' | 'offline' | 'auth_failed'
  >('online');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  // Clear the system status bar so the first row ("Your Habits") and any
  // content the user scrolls to (e.g. the Version row) don't slide under it.
  const contentPaddingTop = Math.max(insets.top + spacing.md, spacing.xl);

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

  useEffect(() => {
    (async () => {
      const status = await sService.getSyncStatus();
      setSyncStatus(status.status);
      const ts = await AsyncStorage.getItem(LAST_SYNC_KEY);
      setLastSyncTime(ts);
    })();
  }, [sService]);

  const handleToggleActive = useCallback(
    async (habit: Habit) => {
      const wasActive = habit.isActive;
      await hService.toggleHabitActive(habit.id);
      // Reminders only make sense for active habits. When deactivating,
      // cancel any scheduled per-habit reminder. When reactivating, restore
      // it if the user previously had per-habit notifications enabled and
      // the global reminder is OFF.
      if (wasActive) {
        await nService.cancelHabitReminder(habit.id);
      } else if (habit.notificationsEnabled && !reminderEnabled) {
        const [hour, minute] = (habit.notificationTime || '08:00')
          .split(':')
          .map(Number);
        await nService.scheduleHabitReminder(
          habit.id,
          habit.name,
          hour,
          minute,
        );
      }
    },
    [hService, nService, reminderEnabled],
  );

  const handleLongPressDeactivate = useCallback(
    (habit: Habit) => {
      Alert.alert(
        'Deactivate Habit',
        `Are you sure you want to deactivate "${habit.name}"? Historical logs will be preserved.`,
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Deactivate',
            style: 'destructive',
            onPress: async () => {
              await hService.toggleHabitActive(habit.id);
              await nService.cancelHabitReminder(habit.id);
            },
          },
        ],
      );
    },
    [hService, nService],
  );

  const handleReminderToggle = useCallback(
    async (value: boolean) => {
      const hour = parseInt(reminderTime.split(':')[0], 10);
      const minute = parseInt(reminderTime.split(':')[1], 10);
      const granted = await nService.onNotificationToggle(value, hour, minute);

      const finalValue = value ? granted : false;
      setReminderEnabled(finalValue);
      await AsyncStorage.setItem(REMINDER_ENABLED_KEY, String(finalValue));

      if (finalValue) {
        // Global mode took over — drop any per-habit reminders. DB rows
        // keep their values so toggling global OFF later restores them.
        await nService.cancelAllHabitReminders();
      } else {
        // Global mode off → reinstate each enabled habit's reminder.
        // Concurrent dispatch avoids stutter on the Notifee bridge.
        const enabledHabits = await hService.getHabitsWithNotifications();
        await Promise.all(
          enabledHabits.map(habit => {
            const [h, m] = (habit.notificationTime || '08:00')
              .split(':')
              .map(Number);
            return nService.scheduleHabitReminder(habit.id, habit.name, h, m);
          }),
        );
      }
    },
    [nService, hService, reminderTime],
  );

  const handleTimeChange = useCallback(
    async (hour: number) => {
      const timeStr = `${String(hour).padStart(2, '0')}:00`;
      setReminderTime(timeStr);
      await AsyncStorage.setItem(REMINDER_TIME_KEY, timeStr);

      if (reminderEnabled) {
        await nService.scheduleDailyReminder(hour, 0);
      }
    },
    [nService, reminderEnabled],
  );

  const handleHabitNotificationToggle = useCallback(
    async (habit: Habit, value: boolean) => {
      if (reminderEnabled) {
        return; // Defensive — UI also marks the toggle disabled.
      }
      if (value) {
        const granted = await nService.requestPermission();
        if (!granted) {
          Alert.alert(
            'Notifications Disabled',
            'Please enable notifications for Daily Habit Tracker in your device Settings.',
          );
          return;
        }
      }
      const time = habit.notificationTime || '08:00';
      await hService.setHabitNotification(habit.id, value, time);
      if (value) {
        const [h, m] = time.split(':').map(Number);
        await nService.scheduleHabitReminder(habit.id, habit.name, h, m);
      } else {
        await nService.cancelHabitReminder(habit.id);
      }
    },
    [hService, nService, reminderEnabled],
  );

  const handleHabitTimeChange = useCallback(
    async (habit: Habit, hour: number) => {
      const time = `${String(hour).padStart(2, '0')}:00`;
      await hService.setHabitNotification(habit.id, true, time);
      if (!reminderEnabled) {
        await nService.scheduleHabitReminder(habit.id, habit.name, hour, 0);
      }
    },
    [hService, nService, reminderEnabled],
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Sync Failed', message);
    } finally {
      setSyncing(false);
    }
  }, [sService]);

  const handleConnect = useCallback(async () => {
    const secret = secretInput.trim();
    if (!secret) {
      return;
    }
    setConnecting(true);
    try {
      await sService.authenticate(secret);
      setSecretInput('');
      const status = await sService.getSyncStatus();
      setSyncStatus(status.status);
      Alert.alert('Connected', 'Sync is now enabled on this device.');
    } catch (err: unknown) {
      const message =
        err instanceof AuthenticationError
          ? err.message
          : 'Could not reach the server. Check your connection and try again.';
      Alert.alert('Connection failed', message);
    } finally {
      setConnecting(false);
    }
  }, [sService, secretInput]);

  const hours = useMemo(() => Array.from({length: 24}, (_, i) => i), []);

  const renderHabitRow = useCallback(
    ({item, index}: {item: Habit; index: number}) => {
      const isLast = index === habits.length - 1;
      const showPicker =
        item.notificationsEnabled && !reminderEnabled && item.isActive;
      const habitTime = item.notificationTime || '08:00';
      return (
        <View>
          <Pressable
            testID={`habit-row-${item.id}`}
            onLongPress={() => handleLongPressDeactivate(item)}
            accessibilityLabel={`${item.name} habit`}>
            <NBSettingsRow
              label={item.name}
              hint={`CREATED ${format(new Date(item.createdAt), 'MMM d, yyyy').toUpperCase()}`}
              right={
                <View style={styles.habitToggleGroup}>
                  <View style={styles.habitToggleCol}>
                    <Text style={styles.habitToggleLabel}>ACTIVE</Text>
                    <NBToggle
                      testID={`toggle-active-${item.id}`}
                      value={item.isActive}
                      onValueChange={() => handleToggleActive(item)}
                      color={colors.tiger}
                    />
                  </View>
                  <View style={styles.habitToggleCol}>
                    <Text style={styles.habitToggleLabel}>NOTIFY</Text>
                    <NBToggle
                      testID={`toggle-notify-${item.id}`}
                      value={item.notificationsEnabled}
                      onValueChange={v =>
                        handleHabitNotificationToggle(item, v)
                      }
                      disabled={reminderEnabled || !item.isActive}
                      color={colors.tiger}
                    />
                  </View>
                </View>
              }
              isLast={isLast && !showPicker}
            />
          </Pressable>
          {showPicker && (
            <View
              style={[
                styles.timePickerContainer,
                !isLast && styles.habitPickerDivider,
              ]}
              testID={`habit-time-picker-${item.id}`}>
              <Text style={styles.rowLabel}>REMINDER TIME</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.timePicker}>
                {hours.map(hour => {
                  const selected =
                    habitTime === `${String(hour).padStart(2, '0')}:00`;
                  return (
                    <Pressable
                      key={hour}
                      testID={`habit-time-option-${item.id}-${hour}`}
                      style={[
                        styles.timeOption,
                        {
                          backgroundColor: selected
                            ? colors.tiger
                            : colors.card,
                          borderColor: selected
                            ? colors.tigerDeep
                            : colors.line,
                        },
                      ]}
                      onPress={() => handleHabitTimeChange(item, hour)}>
                      <Text style={styles.timeOptionText}>
                        {formatHour(hour)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      );
    },
    [
      habits.length,
      reminderEnabled,
      handleToggleActive,
      handleLongPressDeactivate,
      handleHabitNotificationToggle,
      handleHabitTimeChange,
      hours,
    ],
  );

  return (
    <NBSurface testID="settings-screen">
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, {paddingTop: contentPaddingTop}]}
        keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.headerRow}>
          <NBChip>v{APP_VERSION}</NBChip>
        </View>
        <Text style={styles.title}>SETTINGS</Text>

        {/* Habits */}
        <SectionHeader label="HABITS" count={habits.length} />
        <NBCard>
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
        </NBCard>

        {/* Notifications */}
        <SectionHeader label="NOTIFICATIONS" count={reminderEnabled ? 1 : 0} />
        <NBCard>
          <NBSettingsRow
            label="DAILY REMINDER"
            hint={`${reminderTime} LOCAL`}
            isLast={!reminderEnabled}
            right={
              <NBToggle
                testID="reminder-toggle"
                value={reminderEnabled}
                onValueChange={handleReminderToggle}
                color={colors.tiger}
              />
            }
          />
          {reminderEnabled && (
            <View style={styles.timePickerContainer}>
              <Text style={styles.rowLabel}>REMINDER TIME</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.timePicker}
                testID="time-picker">
                {hours.map(hour => {
                  const selected =
                    reminderTime === `${String(hour).padStart(2, '0')}:00`;
                  return (
                    <Pressable
                      key={hour}
                      testID={`time-option-${hour}`}
                      style={[
                        styles.timeOption,
                        {
                          backgroundColor: selected
                            ? colors.tiger
                            : colors.card,
                          borderColor: selected ? colors.tigerDeep : colors.line,
                        },
                      ]}
                      onPress={() => handleTimeChange(hour)}>
                      <Text style={styles.timeOptionText}>
                        {formatHour(hour)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </NBCard>

        {/* Sync */}
        <SectionHeader label="SYNC" count={unsyncedCount} />
        <NBCard>
          <View style={styles.syncBlock}>
            {syncStatus === 'offline' ? (
              <Text style={styles.syncStatus} testID="sync-status">
                Offline — <Text testID="pending-sync-count">{unsyncedCount}</Text>{' '}
                {unsyncedCount === 1 ? 'log' : 'logs'} pending
              </Text>
            ) : syncStatus === 'auth_failed' ? (
              <Text style={styles.syncStatus} testID="sync-status">
                Authentication required —{' '}
                <Text testID="pending-sync-count">{unsyncedCount}</Text>{' '}
                {unsyncedCount === 1 ? 'log' : 'logs'} pending
              </Text>
            ) : (
              <Text style={styles.syncStatus} testID="sync-status">
                <Text testID="pending-sync-count">{unsyncedCount}</Text>{' '}
                {unsyncedCount === 1 ? 'log' : 'logs'} pending sync
              </Text>
            )}
            <NBButton
              variant="primary"
              testID="sync-now-button"
              onPress={handleSyncNow}
              disabled={syncing}
              loading={syncing}
              style={styles.syncButton}>
              SYNC NOW
            </NBButton>
            {lastSyncTime && (
              <Text style={styles.lastSync} testID="last-sync-time">
                Last sync:{' '}
                {format(new Date(lastSyncTime), 'MMM d, yyyy h:mm a')}
              </Text>
            )}

            <View style={styles.connectBlock}>
              <View style={styles.connectLabelRow}>
                <Text style={styles.connectLabel}>SYNC SECRET</Text>
                <TouchableOpacity
                  onPress={() => setShowSecret(s => !s)}
                  testID="toggle-secret-visibility">
                  <Text style={styles.connectToggle}>
                    {showSecret ? 'HIDE' : 'SHOW'}
                  </Text>
                </TouchableOpacity>
              </View>
              <NBShadow
                offsetX={shadowOffsets.xs}
                offsetY={shadowOffsets.xs}
                color={colors.shadow}
                borderRadius={radii.pill}>
                <TextInput
                  testID="sync-secret-input"
                  style={styles.connectInput}
                  value={secretInput}
                  onChangeText={setSecretInput}
                  placeholder="Paste your server secret"
                  placeholderTextColor={colors.textSoft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showSecret}
                  editable={!connecting}
                  // Android's adjustResize shrinks the window but doesn't
                  // scroll the ScrollView. Without this, the focused input
                  // sits behind the keyboard on tall keyboards (e.g.
                  // Pixel 10a).
                  onFocus={() => {
                    // Delay one tick so layout settles after the keyboard appears.
                    setTimeout(
                      () => scrollRef.current?.scrollToEnd({animated: true}),
                      50,
                    );
                  }}
                />
              </NBShadow>
              <NBButton
                variant="secondary"
                testID="connect-button"
                onPress={handleConnect}
                disabled={connecting || secretInput.trim().length === 0}
                loading={connecting}
                style={styles.connectButton}>
                CONNECT
              </NBButton>
            </View>
          </View>
        </NBCard>

        {/* About */}
        <SectionHeader label="ABOUT" />
        <NBCard>
          <NBSettingsRow
            label="VERSION"
            right={
              <Text style={styles.rowValue} testID="app-version">
                {APP_VERSION}
              </Text>
            }
          />
          <NBSettingsRow
            label="SERVER URL"
            isLast
            right={
              <Text
                style={[styles.rowValue, styles.serverUrl]}
                testID="server-url"
                numberOfLines={1}>
                {API_BASE_URL}
              </Text>
            }
          />
        </NBCard>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </NBSurface>
  );
};

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 54,
    lineHeight: 46,
    letterSpacing: -2.5,
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 6,
    marginTop: spacing.md,
  },
  sectionHeaderText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSoft,
    letterSpacing: 0.5,
  },
  emptyText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: colors.textSoft,
    textAlign: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
  },
  rowLabel: {
    fontFamily: fontFamily.display,
    fontSize: 14,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: -0.1,
  },
  rowValue: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: colors.textSoft,
  },
  serverUrl: {
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  timePickerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
  },
  habitToggleGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  habitToggleCol: {
    alignItems: 'center',
    gap: 4,
  },
  habitToggleLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSoft,
    letterSpacing: 0.5,
  },
  habitPickerDivider: {
    borderBottomWidth: borders.thin,
    borderBottomColor: colors.regaliaSoft,
  },
  timePicker: {
    marginTop: spacing.sm,
  },
  timeOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: borders.base,
    marginRight: spacing.sm,
  },
  timeOptionText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  syncBlock: {
    padding: 16,
    backgroundColor: colors.card,
  },
  syncStatus: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  syncButton: {
    marginBottom: spacing.sm,
    alignSelf: 'stretch',
  },
  lastSync: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: colors.textSoft,
  },
  connectBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: borders.thin,
    borderTopColor: colors.regaliaSoft,
  },
  connectLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  connectLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
  },
  connectToggle: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.tiger,
    letterSpacing: 0.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  connectInput: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    borderWidth: borders.thick,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  connectButton: {
    alignSelf: 'stretch',
  },
  bottomSpacer: {
    height: 100,
  },
});

export default SettingsScreen;
