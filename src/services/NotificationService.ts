// NotificationService: scheduled daily habit reminders via @notifee/react-native.

import notifee, {
  AuthorizationStatus,
  RepeatFrequency,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';

const NOTIFICATION_ID = 'daily-habit-reminder';
const CHANNEL_ID = 'daily-reminders';
const HABIT_NOTIFICATION_PREFIX = 'habit-reminder-';

// notifee bridge calls on Android can silently never resolve in some failure
// modes (SCHEDULE_EXACT_ALARM denial, bridge race, OEM-specific issues),
// leaving handler awaits hanging forever with no alert. Cap each call so a
// hang surfaces as a labelled rejection that the caller's try/catch can
// report instead of disappearing.
const NOTIFEE_CALL_TIMEOUT_MS = 5000;

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms: number = NOTIFEE_CALL_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${label} (${ms}ms)`));
    }, ms);
  });
  // Clear the timer once the race settles so a successful resolve doesn't
  // leak a pending timer into the event loop.
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

class NotificationService {
  /**
   * Request notification permission.
   * On Android 13+ this maps to the runtime POST_NOTIFICATIONS prompt.
   * On older Android this is a no-op (granted at install).
   */
  async requestPermission(): Promise<boolean> {
    // notifee.requestPermission() can hang forever on Android when no
    // system dialog is shown (most commonly when permission is already
    // granted): the onRequestPermissionsResult callback that resolves the
    // promise never fires. getNotificationSettings() is a non-interactive
    // read that resolves reliably, so check the current status first and
    // short-circuit the already-granted case rather than calling the
    // hanging request. NOTE: on Android this cannot distinguish "never
    // asked" from "permanently blocked" (both report DENIED), so the
    // blocked case still falls through to requestPermission() and relies
    // on the withTimeout net.
    const current = await withTimeout(
      notifee.getNotificationSettings(),
      'notifee.getNotificationSettings',
    );
    if (
      current.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
      current.authorizationStatus === AuthorizationStatus.PROVISIONAL
    ) {
      return true;
    }
    const settings = await withTimeout(
      notifee.requestPermission(),
      'notifee.requestPermission',
    );
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
    await withTimeout(
      notifee.cancelTriggerNotification(NOTIFICATION_ID),
      'notifee.cancelTriggerNotification(daily)',
    );

    // Ensure notification channel exists.
    await withTimeout(
      notifee.createChannel({
        id: CHANNEL_ID,
        name: 'Daily Reminders',
      }),
      'notifee.createChannel(daily)',
    );

    // Build a timestamp trigger for the next occurrence of the given time
    const now = new Date();
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: this.getNextTriggerTimestamp(now, hour, minute),
      repeatFrequency: RepeatFrequency.DAILY,
    };

    await withTimeout(
      notifee.createTriggerNotification(
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
      ),
      'notifee.createTriggerNotification(daily)',
    );
  }

  /**
   * Cancel the scheduled daily reminder notification.
   */
  async cancelDailyReminder(): Promise<void> {
    await withTimeout(
      notifee.cancelTriggerNotification(NOTIFICATION_ID),
      'notifee.cancelTriggerNotification(daily)',
    );
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
    await withTimeout(
      notifee.cancelTriggerNotification(id),
      `notifee.cancelTriggerNotification(${id})`,
    );

    await withTimeout(
      notifee.createChannel({
        id: CHANNEL_ID,
        name: 'Daily Reminders',
      }),
      'notifee.createChannel(habit)',
    );

    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: this.getNextTriggerTimestamp(new Date(), hour, minute),
      repeatFrequency: RepeatFrequency.DAILY,
    };

    await withTimeout(
      notifee.createTriggerNotification(
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
      ),
      `notifee.createTriggerNotification(${id})`,
    );
  }

  async cancelHabitReminder(habitId: string): Promise<void> {
    const id = this.habitNotificationId(habitId);
    await withTimeout(
      notifee.cancelTriggerNotification(id),
      `notifee.cancelTriggerNotification(${id})`,
    );
  }

  /**
   * Cancel every scheduled per-habit reminder. Filters by the
   * "habit-reminder-" prefix so it never touches the global
   * "daily-habit-reminder" or any unrelated trigger.
   */
  async cancelAllHabitReminders(): Promise<void> {
    const triggers = await withTimeout(
      notifee.getTriggerNotifications(),
      'notifee.getTriggerNotifications',
    );
    const habitIds = triggers
      .map(t => t.notification.id)
      .filter(
        (id): id is string =>
          typeof id === 'string' && id.startsWith(HABIT_NOTIFICATION_PREFIX),
      );
    await Promise.all(
      habitIds.map(id =>
        withTimeout(
          notifee.cancelTriggerNotification(id),
          `notifee.cancelTriggerNotification(${id})`,
        ),
      ),
    );
  }
}

export default NotificationService;
