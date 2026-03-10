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

const mockNotifee = jest.mocked(notifee);

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
        mockNotifee.createTriggerNotification.mock.calls[0][1];

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
});
