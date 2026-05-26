// NotificationService: scheduled daily habit reminders via @notifee/react-native.

import notifee, {
  AuthorizationStatus,
  RepeatFrequency,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';
import {Alert} from 'react-native';

const NOTIFICATION_ID = 'daily-habit-reminder';
const CHANNEL_ID = 'daily-reminders';
const HABIT_NOTIFICATION_PREFIX = 'habit-reminder-';

class NotificationService {
  /**
   * Request notification permission.
   * On Android 13+ this maps to the runtime POST_NOTIFICATIONS prompt.
   * On older Android this is a no-op (granted at install).
   */
  async requestPermission(): Promise<boolean> {
    const settings = await notifee.requestPermission();
    return (
      settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
      settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
    );
  }

  /**
   * Cancel any existing scheduled notification, then schedule a repeating
   * daily local notification at the given hour and minute.
   */
  async scheduleDailyReminder(hour: number, minute: number): Promise<void> {
    await this.cancelDailyReminder();

    // Ensure notification channel exists.
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Daily Reminders',
    });

    // Build a timestamp trigger for the next occurrence of the given time
    const now = new Date();
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: this.getNextTriggerTimestamp(now, hour, minute),
      repeatFrequency: RepeatFrequency.DAILY,
    };

    await notifee.createTriggerNotification(
      {
        id: NOTIFICATION_ID,
        title: 'Daily Habits',
        body: 'Time to check in on your habits!',
        android: {
          channelId: CHANNEL_ID,
          pressAction: {id: 'default'},
        },
      },
      trigger,
    );
  }

  /**
   * Cancel the scheduled daily reminder notification.
   */
  async cancelDailyReminder(): Promise<void> {
    await notifee.cancelTriggerNotification(NOTIFICATION_ID);
  }

  /**
   * Convenience method called from Settings.
   * If enabled, requests permission then schedules. If disabled, cancels.
   */
  async onNotificationToggle(
    enabled: boolean,
    hour: number,
    minute: number,
  ): Promise<boolean> {
    if (!enabled) {
      await this.cancelDailyReminder();
      return false;
    }

    const granted = await this.requestPermission();
    if (!granted) {
      // User previously denied — direct them to device Settings
      Alert.alert(
        'Notifications Disabled',
        'Please enable notifications for Daily Habit Tracker in your device Settings.',
      );
      return false;
    }

    await this.scheduleDailyReminder(hour, minute);
    return true;
  }

  /**
   * Compute the next Date timestamp for a given hour:minute.
   * If the time has already passed today, use tomorrow.
   */
  private getNextTriggerTimestamp(
    now: Date,
    hour: number,
    minute: number,
  ): number {
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);

    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime();
  }

  private habitNotificationId(habitId: string): string {
    return `${HABIT_NOTIFICATION_PREFIX}${habitId}`;
  }

  /**
   * Schedule (or replace) a daily repeating reminder for a single habit.
   * Uses a per-habit notification ID derived from the habit's row id so
   * each habit's reminder is independent of the others and of the global
   * "daily-habit-reminder" reminder.
   */
  async scheduleHabitReminder(
    habitId: string,
    habitName: string,
    hour: number,
    minute: number,
  ): Promise<void> {
    const id = this.habitNotificationId(habitId);
    await notifee.cancelTriggerNotification(id);

    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Daily Reminders',
    });

    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: this.getNextTriggerTimestamp(new Date(), hour, minute),
      repeatFrequency: RepeatFrequency.DAILY,
    };

    await notifee.createTriggerNotification(
      {
        id,
        title: habitName,
        body: "Don't forget your habit today.",
        android: {
          channelId: CHANNEL_ID,
          pressAction: {id: 'default'},
        },
      },
      trigger,
    );
  }

  async cancelHabitReminder(habitId: string): Promise<void> {
    await notifee.cancelTriggerNotification(this.habitNotificationId(habitId));
  }

  /**
   * Cancel every scheduled per-habit reminder. Filters by the
   * "habit-reminder-" prefix so it never touches the global
   * "daily-habit-reminder" or any unrelated trigger.
   */
  async cancelAllHabitReminders(): Promise<void> {
    const triggers = await notifee.getTriggerNotifications();
    const habitIds = triggers
      .map(t => t.notification.id)
      .filter(
        (id): id is string =>
          typeof id === 'string' && id.startsWith(HABIT_NOTIFICATION_PREFIX),
      );
    await Promise.all(
      habitIds.map(id => notifee.cancelTriggerNotification(id)),
    );
  }
}

export default NotificationService;
