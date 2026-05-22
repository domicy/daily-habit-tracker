import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {format} from 'date-fns';
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

const APP_VERSION = '0.0.1';
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
    <Text style={styles.sectionHeaderText}>// {label}</Text>
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
    async (habitId: string) => {
      await hService.toggleHabitActive(habitId);
    },
    [hService],
  );

  const handleLongPressDeactivate = useCallback(
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

  const renderHabitRow = useCallback(
    ({item, index}: {item: Habit; index: number}) => (
      <Pressable
        testID={`habit-row-${item.id}`}
        onLongPress={() => handleLongPressDeactivate(item.id, item.name)}
        accessibilityLabel={`${item.name} habit`}>
        <NBSettingsRow
          label={item.name}
          hint={`CREATED ${format(new Date(item.createdAt), 'MMM d, yyyy').toUpperCase()}`}
          right={
            <NBToggle
              testID={`toggle-active-${item.id}`}
              value={item.isActive}
              onValueChange={() => handleToggleActive(item.id)}
              color={colors.tiger}
            />
          }
          isLast={index === habits.length - 1}
        />
      </Pressable>
    ),
    [habits.length, handleToggleActive, handleLongPressDeactivate],
  );

  const hours = Array.from({length: 24}, (_, i) => i);

  return (
    <NBSurface testID="settings-screen">
      <ScrollView contentContainerStyle={styles.content}>
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
              <Text style={styles.connectLabel}>SYNC SECRET</Text>
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
                  secureTextEntry
                  editable={!connecting}
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
  connectLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
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
