import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
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
  onLogout?: () => Promise<void>;
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
  onLogout,
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

  // notifee bridge calls are now timeout-capped (5s) at the service layer.
  // If a call hangs and the user has navigated away before it surfaces,
  // late Alert/state updates would warn. Gate diagnostic side effects on
  // mount state.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reportError = useCallback(
    (where: string, err: unknown, title: string, context: string) => {
      // Always log so adb logcat captures the cause even when the user
      // has dismissed or never sees the alert.
      console.error(`[SettingsScreen] ${where}:`, err);
      if (mountedRef.current) {
        // Always show the contextual message; append the underlying error
        // detail when available so the user sees both "what we tried to
        // do" and "what actually failed". This is critical for diagnosing
        // the timeout-wrapped notifee labels (e.g. "Timed out waiting for
        // notifee.createTriggerNotification(daily) (5000ms)").
        const detail =
          err instanceof Error && err.message ? err.message : '';
        const body = detail ? `${context}\n\n${detail}` : context;
        Alert.alert(title, body);
      }
    },
    [],
  );

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

      if (value) {
        let granted: boolean;
        try {
          granted = await nService.requestPermission();
        } catch (err) {
          reportError(
            'handleReminderToggle.requestPermission',
            err,
            'Notifications',
            'Failed to request notification permission.',
          );
          return;
        }
        if (!granted) {
          if (mountedRef.current) {
            Alert.alert(
              'Notifications Disabled',
              'Please enable notifications for Daily Habit Tracker in your device Settings.',
            );
          }
          return;
        }
        try {
          await nService.scheduleDailyReminder(hour, minute);
        } catch (err) {
          reportError(
            'handleReminderToggle.scheduleDailyReminder',
            err,
            'Notification Error',
            'Failed to schedule daily reminder.',
          );
          return;
        }
        // Commit ON state as soon as the daily reminder is actually scheduled,
        // so the toggle and AsyncStorage always reflect notifee's actual state.
        // The per-habit cleanup below is a best-effort secondary step with its
        // own Alert — if it fails the daily reminder is still active and the
        // user is not stuck on the global toggle.
        if (!mountedRef.current) {
          return;
        }
        setReminderEnabled(true);
        await AsyncStorage.setItem(REMINDER_ENABLED_KEY, 'true');

        try {
          await nService.cancelAllHabitReminders();
        } catch (err) {
          reportError(
            'handleReminderToggle.cancelAllHabitReminders',
            err,
            'Per-Habit Reminders',
            'Daily reminder is on, but cleaning up per-habit reminders failed. They may still fire alongside the daily reminder.',
          );
        }
      } else {
        // Commit OFF state as soon as the daily reminder is actually cancelled,
        // so the toggle and AsyncStorage always reflect notifee's actual state.
        // The per-habit fan-out below is a best-effort secondary step with its
        // own Alert.
        try {
          await nService.cancelDailyReminder();
        } catch (err) {
          reportError(
            'handleReminderToggle.cancelDailyReminder',
            err,
            'Notification Error',
            'Failed to disable daily reminder.',
          );
          return;
        }
        if (!mountedRef.current) {
          return;
        }
        setReminderEnabled(false);
        await AsyncStorage.setItem(REMINDER_ENABLED_KEY, 'false');

        try {
          const enabledHabits = await hService.getHabitsWithNotifications();
          await Promise.all(
            enabledHabits.map(habit => {
              const [h, m] = (habit.notificationTime || '08:00')
                .split(':')
                .map(Number);
              return nService.scheduleHabitReminder(habit.id, habit.name, h, m);
            }),
          );
        } catch (err) {
          reportError(
            'handleReminderToggle.scheduleHabitReminder(fanout)',
            err,
            'Per-Habit Reminders',
            'Daily reminder is off, but resuming per-habit reminders failed. Toggle individual habits to retry.',
          );
        }
      }
    },
    [nService, hService, reminderTime, reportError],
  );

  const handleTimeChange = useCallback(
    async (hour: number) => {
      const timeStr = `${String(hour).padStart(2, '0')}:00`;
      setReminderTime(timeStr);
      await AsyncStorage.setItem(REMINDER_TIME_KEY, timeStr);

      if (reminderEnabled) {
        try {
          await nService.scheduleDailyReminder(hour, 0);
        } catch (err) {
          reportError(
            'handleTimeChange.scheduleDailyReminder',
            err,
            'Notification Error',
            'Failed to update reminder time.',
          );
        }
      }
    },
    [nService, reminderEnabled, reportError],
  );

  const handleHabitNotificationToggle = useCallback(
    async (habit: Habit, value: boolean) => {
      // Only prompt for permission when we're about to actually schedule
      // something. When the global Daily Reminder is on, the per-habit
      // preference is persisted but no per-habit notifee trigger is created
      // (the global trigger already covers the user — a per-habit one would
      // be redundant noise). The preference is picked up by
      // getHabitsWithNotifications when the user later turns the global
      // reminder off.
      const willSchedule = value && !reminderEnabled;
      if (willSchedule) {
        let granted: boolean;
        try {
          granted = await nService.requestPermission();
        } catch (err) {
          reportError(
            'handleHabitNotificationToggle.requestPermission',
            err,
            'Notifications',
            'Failed to request notification permission.',
          );
          return;
        }
        if (!granted) {
          if (mountedRef.current) {
            Alert.alert(
              'Notifications Disabled',
              'Please enable notifications for Daily Habit Tracker in your device Settings.',
            );
          }
          return;
        }
      }

      const time = habit.notificationTime || '08:00';
      const prevEnabled = habit.notificationsEnabled;

      try {
        await hService.setHabitNotification(habit.id, value, time);
      } catch (err) {
        reportError(
          'handleHabitNotificationToggle.setHabitNotification',
          err,
          'Habit Update Failed',
          'Could not save the notification preference.',
        );
        return;
      }

      // When the global reminder is on, we deliberately skip per-habit
      // notifee scheduling — the preference is saved and will activate
      // the next time the global reminder is turned off.
      if (reminderEnabled) {
        return;
      }

      try {
        if (value) {
          const [h, m] = time.split(':').map(Number);
          await nService.scheduleHabitReminder(habit.id, habit.name, h, m);
        } else {
          await nService.cancelHabitReminder(habit.id);
        }
      } catch (err) {
        // Roll back the DB write so the toggle reflects what's actually
        // scheduled. If the rollback itself fails, the toggle will desync
        // from notifee until the user retries — surface the original error
        // either way.
        try {
          await hService.setHabitNotification(habit.id, prevEnabled, time);
        } catch {
          // best-effort rollback
        }
        reportError(
          'handleHabitNotificationToggle.scheduleHabitReminder',
          err,
          'Notification Error',
          'Failed to schedule reminder.',
        );
      }
    },
    [hService, nService, reminderEnabled, reportError],
  );

  const handleHabitTimeChange = useCallback(
    async (habit: Habit, hour: number) => {
      const time = `${String(hour).padStart(2, '0')}:00`;
      try {
        await hService.setHabitNotification(habit.id, true, time);
        if (!reminderEnabled) {
          await nService.scheduleHabitReminder(habit.id, habit.name, hour, 0);
        }
      } catch (err) {
        reportError(
          'handleHabitTimeChange',
          err,
          'Notification Error',
          'Failed to update reminder time.',
        );
      }
    },
    [hService, nService, reminderEnabled, reportError],
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

  const renderHabitRow = (item: Habit, index: number) => {
    const isLast = index === habits.length - 1;
    const showPicker =
      item.notificationsEnabled && !reminderEnabled && item.isActive;
    const habitTime = item.notificationTime || '08:00';
    return (
      <View key={item.id}>
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
                    // Intentionally NOT gated on reminderEnabled. Toggling
                    // disabled true->false on a Pressable on Android can
                    // leave the native View's touch responder stuck — taps
                    // stop firing even after disabled flips back to false.
                    // Decouple: the per-habit toggle just reflects the
                    // user's preference. When the global Daily Reminder is
                    // on, the per-habit handler persists the preference but
                    // skips per-habit notifee scheduling (global covers it).
                    disabled={!item.isActive}
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
  };

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
            // Render with .map (not FlatList) — scrollEnabled would be false
            // inside this parent ScrollView so virtualization is off either
            // way, and plain .map sidesteps FlatList CellRenderer caching
            // when WatermelonDB row instances mutate in place across
            // observable emissions. Do not "optimize" this back to FlatList.
            <View testID="habits-list">{habits.map(renderHabitRow)}</View>
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

        {onLogout && (
          <NBButton
            variant="secondary"
            testID="logout-button"
            onPress={onLogout}
            style={styles.connectButton}>
            LOG OUT
          </NBButton>
        )}

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
