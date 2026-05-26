import {Alert} from 'react-native';
import notifee from '@notifee/react-native';
import NotificationService from '../../services/NotificationService';

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    requestPermission: jest.fn(),
    createChannel: jest.fn().mockResolvedValue(''),
    createTriggerNotification: jest.fn().mockResolvedValue(''),
    cancelTriggerNotification: jest.fn().mockResolvedValue(undefined),
    getTriggerNotifications: jest.fn().mockResolvedValue([]),
  },
  AuthorizationStatus: {
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    NOT_DETERMINED: -1,
  },
  TriggerType: {TIMESTAMP: 0},
  RepeatFrequency: {DAILY: 3},
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockNotifee = notifee as any as {
  requestPermission: jest.Mock;
  createChannel: jest.Mock;
  createTriggerNotification: jest.Mock;
  cancelTriggerNotification: jest.Mock;
  getTriggerNotifications: jest.Mock;
};

// Mock Alert
jest.spyOn(Alert, 'alert').mockImplementation(() => {});

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService();
  });

  describe('requestPermission', () => {
    it('returns true when permission is authorized', async () => {
      mockNotifee.requestPermission.mockResolvedValue({
        authorizationStatus: 1, // AUTHORIZED
      });

      const result = await service.requestPermission();
      expect(result).toBe(true);
    });

    it('returns true when permission is provisional', async () => {
      mockNotifee.requestPermission.mockResolvedValue({
        authorizationStatus: 2, // PROVISIONAL
      });

      const result = await service.requestPermission();
      expect(result).toBe(true);
    });

    it('returns false when permission is denied', async () => {
      mockNotifee.requestPermission.mockResolvedValue({
        authorizationStatus: 0, // DENIED
      });

      const result = await service.requestPermission();
      expect(result).toBe(false);
    });
  });

  describe('scheduleDailyReminder', () => {
    it('cancels existing notification before scheduling a new one', async () => {
      mockNotifee.requestPermission.mockResolvedValue({
        authorizationStatus: 1,
      });

      await service.scheduleDailyReminder(9, 0);

      // cancelTriggerNotification should be called before createTriggerNotification
      const cancelOrder =
        mockNotifee.cancelTriggerNotification.mock.invocationCallOrder[0];
      const createOrder =
        mockNotifee.createTriggerNotification.mock.invocationCallOrder[0];
      expect(cancelOrder).toBeLessThan(createOrder);

      expect(mockNotifee.cancelTriggerNotification).toHaveBeenCalledWith(
        'daily-habit-reminder',
      );
    });

    it('schedules a daily notification with correct title and body', async () => {
      await service.scheduleDailyReminder(8, 30);

      expect(mockNotifee.createTriggerNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'daily-habit-reminder',
          title: 'Daily Habits',
          body: 'Time to check in on your habits!',
        }),
        expect.objectContaining({
          type: 0, // TriggerType.TIMESTAMP
          repeatFrequency: 3, // RepeatFrequency.DAILY
        }),
      );
    });

    it('sets trigger timestamp to tomorrow if time has passed today', async () => {
      // Mock Date to a fixed time: 2026-03-07 at 15:00
      const fixedNow = new Date(2026, 2, 7, 15, 0, 0, 0);
      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      // Schedule for 8:00 AM (already passed)
      await service.scheduleDailyReminder(8, 0);

      jest.useRealTimers();

      const triggerArg =
        mockNotifee.createTriggerNotification.mock.calls[0][1] as {timestamp: number};

      // Should be tomorrow at 8:00 AM
      const expected = new Date(2026, 2, 8, 8, 0, 0, 0).getTime();
      expect(triggerArg.timestamp).toBe(expected);
    });
  });

  describe('cancelDailyReminder', () => {
    it('calls the native cancel method with the correct notification ID', async () => {
      await service.cancelDailyReminder();

      expect(mockNotifee.cancelTriggerNotification).toHaveBeenCalledWith(
        'daily-habit-reminder',
      );
    });
  });

  describe('onNotificationToggle', () => {
    it('cancels notification and does not schedule when disabled', async () => {
      const result = await service.onNotificationToggle(false, 8, 0);

      expect(result).toBe(false);
      expect(mockNotifee.cancelTriggerNotification).toHaveBeenCalledWith(
        'daily-habit-reminder',
      );
      expect(mockNotifee.createTriggerNotification).not.toHaveBeenCalled();
      expect(mockNotifee.requestPermission).not.toHaveBeenCalled();
    });

    it('requests permission and schedules when enabled and granted', async () => {
      mockNotifee.requestPermission.mockResolvedValue({
        authorizationStatus: 1, // AUTHORIZED
      });

      const result = await service.onNotificationToggle(true, 9, 30);

      expect(result).toBe(true);
      expect(mockNotifee.requestPermission).toHaveBeenCalled();
      expect(mockNotifee.createTriggerNotification).toHaveBeenCalled();
    });

    it('does not schedule when permission is denied', async () => {
      mockNotifee.requestPermission.mockResolvedValue({
        authorizationStatus: 0, // DENIED
      });

      const result = await service.onNotificationToggle(true, 9, 0);

      expect(result).toBe(false);
      expect(mockNotifee.requestPermission).toHaveBeenCalled();
      expect(mockNotifee.createTriggerNotification).not.toHaveBeenCalled();
    });

    it('shows an alert directing to Settings when permission is denied', async () => {
      mockNotifee.requestPermission.mockResolvedValue({
        authorizationStatus: 0, // DENIED
      });

      await service.onNotificationToggle(true, 9, 0);

      expect(Alert.alert).toHaveBeenCalledWith(
        'Notifications Disabled',
        'Please enable notifications for Daily Habit Tracker in your device Settings.',
      );
    });
  });

  describe('scheduleHabitReminder', () => {
    it('uses a unique notification ID derived from the habit id', async () => {
      await service.scheduleHabitReminder('habit-abc', 'Drink water', 9, 0);

      expect(mockNotifee.createTriggerNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'habit-reminder-habit-abc',
          title: 'Drink water',
          body: "Don't forget your habit today.",
        }),
        expect.objectContaining({
          type: 0, // TriggerType.TIMESTAMP
          repeatFrequency: 3, // RepeatFrequency.DAILY
        }),
      );
    });

    it('cancels the habit-specific id before re-scheduling', async () => {
      await service.scheduleHabitReminder('habit-xyz', 'Read', 7, 30);

      const cancelOrder =
        mockNotifee.cancelTriggerNotification.mock.invocationCallOrder[0];
      const createOrder =
        mockNotifee.createTriggerNotification.mock.invocationCallOrder[0];
      expect(cancelOrder).toBeLessThan(createOrder);
      expect(mockNotifee.cancelTriggerNotification).toHaveBeenCalledWith(
        'habit-reminder-habit-xyz',
      );
    });

    it('produces distinct notification IDs for distinct habits', async () => {
      await service.scheduleHabitReminder('h-1', 'A', 8, 0);
      await service.scheduleHabitReminder('h-2', 'B', 9, 0);

      const ids = mockNotifee.createTriggerNotification.mock.calls.map(
        ([notif]) => notif.id,
      );
      expect(ids).toEqual(['habit-reminder-h-1', 'habit-reminder-h-2']);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('cancelHabitReminder', () => {
    it('cancels the trigger for that habit only', async () => {
      await service.cancelHabitReminder('habit-123');

      expect(mockNotifee.cancelTriggerNotification).toHaveBeenCalledWith(
        'habit-reminder-habit-123',
      );
      expect(mockNotifee.cancelTriggerNotification).not.toHaveBeenCalledWith(
        'daily-habit-reminder',
      );
    });
  });

  describe('cancelAllHabitReminders', () => {
    it('cancels every per-habit trigger but leaves the global reminder alone', async () => {
      mockNotifee.getTriggerNotifications.mockResolvedValue([
        {notification: {id: 'habit-reminder-a'}},
        {notification: {id: 'habit-reminder-b'}},
        {notification: {id: 'daily-habit-reminder'}},
        {notification: {id: 'unrelated-trigger'}},
        {notification: {id: undefined}},
      ]);

      await service.cancelAllHabitReminders();

      const cancelled = mockNotifee.cancelTriggerNotification.mock.calls.map(
        ([id]) => id,
      );
      expect(cancelled).toEqual(
        expect.arrayContaining(['habit-reminder-a', 'habit-reminder-b']),
      );
      expect(cancelled).not.toContain('daily-habit-reminder');
      expect(cancelled).not.toContain('unrelated-trigger');
      expect(cancelled).toHaveLength(2);
    });

    it('is a no-op when there are no scheduled triggers', async () => {
      mockNotifee.getTriggerNotifications.mockResolvedValue([]);

      await service.cancelAllHabitReminders();

      expect(mockNotifee.cancelTriggerNotification).not.toHaveBeenCalled();
    });
  });
});
