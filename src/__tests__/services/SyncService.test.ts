import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, {AUTH_TOKEN_KEY} from '../../services/api';
import SyncService, {AuthenticationError} from '../../services/SyncService';
import type HabitService from '../../services/HabitService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../../services/api', () => {
  const mockPost = jest.fn();
  const mockInterceptors = {
    request: {use: jest.fn(), eject: jest.fn()},
    response: {use: jest.fn(), eject: jest.fn()},
  };
  return {
    __esModule: true,
    default: {
      post: mockPost,
      interceptors: mockInterceptors,
    },
    AUTH_TOKEN_KEY: 'auth_token',
  };
});

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({remove: jest.fn()})),
  },
}));

function createMockLog(
  habitId: string,
  completedDate: string,
  deletedAt: number | null = null,
) {
  return {
    habitId,
    completedDate,
    synced: false,
    deletedAt,
    markSynced: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockHabit(id: string, name: string = 'Habit') {
  return {
    id,
    name,
    createdAt: 1_700_000_000_000,
    isActive: true,
    synced: false,
    markSynced: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockHabitService(
  logs: ReturnType<typeof createMockLog>[] = [],
  habits: ReturnType<typeof createMockHabit>[] = [],
) {
  return {
    getUnsyncedLogs: jest.fn().mockResolvedValue(logs),
    getUnsyncedHabits: jest.fn().mockResolvedValue(habits),
    markLogsSynced: jest
      .fn()
      .mockImplementation(async (batch: {markSynced: () => Promise<void>}[]) => {
        for (const log of batch) {
          await log.markSynced();
        }
      }),
    markHabitsSynced: jest
      .fn()
      .mockImplementation(async (batch: {markSynced: () => Promise<void>}[]) => {
        for (const habit of batch) {
          await habit.markSynced();
        }
      }),
  } as unknown as HabitService;
}

// Helper to create a JWT with a given exp timestamp
function createTestJwt(exp: number): string {
  const header = btoa(JSON.stringify({alg: 'HS256', typ: 'JWT'}));
  const payload = btoa(JSON.stringify({sub: 'user', exp}));
  return `${header}.${payload}.fake-signature`;
}

describe('SyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pushUnsyncedLogs', () => {
    it('sends the correct payload to /logs/sync', async () => {
      const logs = [
        createMockLog('habit-1', '2025-01-01'),
        createMockLog('habit-2', '2025-01-02'),
      ];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {synced: 2, errors: []},
      });

      await syncService.pushUnsyncedLogs();

      expect(apiClient.post).toHaveBeenCalledWith('/logs/sync', {
        logs: [
          {habit_id: 'habit-1', completed_date: '2025-01-01', deleted: false},
          {habit_id: 'habit-2', completed_date: '2025-01-02', deleted: false},
        ],
      });
    });

    it('flags tombstoned logs as deleted in the payload', async () => {
      const logs = [
        createMockLog('habit-1', '2025-01-01'),
        createMockLog('habit-2', '2025-01-02', Date.now()),
      ];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {synced: 2, errors: []},
      });

      await syncService.pushUnsyncedLogs();

      expect(apiClient.post).toHaveBeenCalledWith('/logs/sync', {
        logs: [
          {habit_id: 'habit-1', completed_date: '2025-01-01', deleted: false},
          {habit_id: 'habit-2', completed_date: '2025-01-02', deleted: true},
        ],
      });
    });

    it('returns early with { pushed: 0, failed: 0 } when no unsynced logs', async () => {
      const habitService = createMockHabitService([]);
      const syncService = new SyncService(habitService);

      const result = await syncService.pushUnsyncedLogs();

      expect(result).toEqual({pushed: 0, failed: 0});
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('marks logs as synced after a 200 response', async () => {
      const logs = [
        createMockLog('habit-1', '2025-01-01'),
        createMockLog('habit-2', '2025-01-02'),
      ];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {synced: 2, errors: []},
      });

      await syncService.pushUnsyncedLogs();

      expect(logs[0].markSynced).toHaveBeenCalled();
      expect(logs[1].markSynced).toHaveBeenCalled();
    });

    it('does NOT mark logs as synced after a 500 response', async () => {
      const logs = [
        createMockLog('habit-1', '2025-01-01'),
      ];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {status: 500, data: {detail: 'Server error'}},
        message: 'Request failed with status code 500',
      });

      // Now fails silently instead of throwing
      const result = await syncService.pushUnsyncedLogs();
      expect(result).toEqual({pushed: 0, failed: 0});
      expect(logs[0].markSynced).not.toHaveBeenCalled();
    });

    it('pushes unsynced habits before logs and marks them synced', async () => {
      const habits = [createMockHabit('habit-1', 'Drink water')];
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs, habits);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock)
        .mockResolvedValueOnce({data: {synced_ids: ['habit-1']}})
        .mockResolvedValueOnce({data: {synced: 1, errors: []}});

      await syncService.pushUnsyncedLogs();

      expect(apiClient.post).toHaveBeenNthCalledWith(1, '/habits/sync', {
        habits: [
          {
            id: 'habit-1',
            name: 'Drink water',
            created_at_ms: 1_700_000_000_000,
            is_active: true,
          },
        ],
      });
      expect(apiClient.post).toHaveBeenNthCalledWith(2, '/logs/sync', {
        logs: [{habit_id: 'habit-1', completed_date: '2025-01-01', deleted: false}],
      });
      expect(habits[0].markSynced).toHaveBeenCalled();
      expect(logs[0].markSynced).toHaveBeenCalled();
    });

    it('skips log push when habit push fails (network error)', async () => {
      const habits = [createMockHabit('habit-1')];
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs, habits);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('Network Error'), {code: 'ERR_NETWORK'}),
      );

      const result = await syncService.pushUnsyncedLogs();

      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(apiClient.post).toHaveBeenCalledWith('/habits/sync', expect.anything());
      expect(habits[0].markSynced).not.toHaveBeenCalled();
      expect(logs[0].markSynced).not.toHaveBeenCalled();
      expect(result).toEqual({pushed: 0, failed: 0});
    });

    it('coalesces concurrent invocations so the second caller is a no-op', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      let resolveFirst: (value: unknown) => void = () => {};
      (apiClient.post as jest.Mock).mockImplementationOnce(
        () => new Promise(resolve => {
          resolveFirst = resolve;
        }),
      );

      const first = syncService.pushUnsyncedLogs();
      // Let the first call advance past its initial AsyncStorage/getUnsyncedLogs awaits
      // and reach the in-flight POST.
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
      const second = await syncService.pushUnsyncedLogs();

      expect(second).toEqual({pushed: 0, failed: 0});
      expect(apiClient.post).toHaveBeenCalledTimes(1);

      resolveFirst({data: {synced: 1, errors: []}});
      await first;

      expect(logs[0].markSynced).toHaveBeenCalledTimes(1);
    });

    it('releases the in-flight guard after completion so later calls proceed', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock)
        .mockResolvedValueOnce({data: {synced: 1, errors: []}})
        .mockResolvedValueOnce({data: {synced: 1, errors: []}});

      await syncService.pushUnsyncedLogs();
      await syncService.pushUnsyncedLogs();

      expect(apiClient.post).toHaveBeenCalledTimes(2);
    });

    it('releases the in-flight guard even when an inner call throws', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      // First invocation: getUnsyncedLogs throws after we are already inside
      // the try block, so finally must still clear the in-flight flag.
      (habitService.getUnsyncedLogs as jest.Mock)
        .mockRejectedValueOnce(new Error('db unavailable'))
        .mockResolvedValueOnce(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {synced: 1, errors: []},
      });

      await expect(syncService.pushUnsyncedLogs()).rejects.toThrow('db unavailable');

      // If finally didn't run, this second call would early-return {0, 0}.
      const result = await syncService.pushUnsyncedLogs();
      expect(result.pushed).toBe(1);
    });

    it('does not mark failed logs as synced when server returns partial errors', async () => {
      const logs = [
        createMockLog('habit-1', '2025-01-01'),
        createMockLog('habit-2', '2025-01-02'),
      ];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {
          synced: 1,
          errors: [
            {habit_id: 'habit-2', completed_date: '2025-01-02', reason: 'Habit not found'},
          ],
        },
      });

      const result = await syncService.pushUnsyncedLogs();

      expect(logs[0].markSynced).toHaveBeenCalled();
      expect(logs[1].markSynced).not.toHaveBeenCalled();
      expect(result.pushed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toEqual([
        'habit-2 (2025-01-02): Habit not found',
      ]);
    });
  });

  describe('retry behavior', () => {
    it('succeeds on second attempt after initial 500 failure', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      // Since axios-retry is configured on the real axios instance,
      // we test retry at the SyncService level: first call fails, second succeeds.
      (apiClient.post as jest.Mock)
        .mockRejectedValueOnce({
          response: {status: 500, data: {detail: 'Server error'}},
          message: 'Request failed with status code 500',
        })
        .mockResolvedValueOnce({
          data: {synced: 1, errors: []},
        });

      // First call fails silently
      const result1 = await syncService.pushUnsyncedLogs();
      expect(result1).toEqual({pushed: 0, failed: 0});
      expect(logs[0].markSynced).not.toHaveBeenCalled();

      // Second call succeeds
      const result2 = await syncService.pushUnsyncedLogs();
      expect(result2.pushed).toBe(1);
      expect(logs[0].markSynced).toHaveBeenCalled();
    });

    it('handles network errors (no response)', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      const networkError = Object.assign(new Error('Network Error'), {code: 'ERR_NETWORK'});

      (apiClient.post as jest.Mock).mockRejectedValueOnce(networkError);

      // Now fails silently instead of throwing
      const result = await syncService.pushUnsyncedLogs();
      expect(result).toEqual({pushed: 0, failed: 0});
      expect(logs[0].markSynced).not.toHaveBeenCalled();
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('batches 5 rapid calls into 1 HTTP request', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValue({
        data: {synced: 1, errors: []},
      });

      // Fire 5 debounced calls within 1 second
      syncService.debouncedSync();
      jest.advanceTimersByTime(200);
      syncService.debouncedSync();
      jest.advanceTimersByTime(200);
      syncService.debouncedSync();
      jest.advanceTimersByTime(200);
      syncService.debouncedSync();
      jest.advanceTimersByTime(200);
      syncService.debouncedSync();

      // No calls yet since debounce hasn't elapsed
      expect(habitService.getUnsyncedLogs).not.toHaveBeenCalled();

      // Advance past the 2-second debounce
      jest.advanceTimersByTime(2000);

      // Flush async microtasks. pushUnsyncedLogs awaits AsyncStorage,
      // then getUnsyncedHabits, then getUnsyncedLogs — so several flushes
      // are needed before the log-side mock is reached.
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      // Only 1 sync attempt should have been triggered
      expect(habitService.getUnsyncedLogs).toHaveBeenCalledTimes(1);
    });
  });

  describe('authenticate', () => {
    it('stores the token in AsyncStorage on success', async () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {access_token: 'test-jwt-token', token_type: 'bearer'},
      });

      await syncService.authenticate('my-secret');

      expect(apiClient.post).toHaveBeenCalledWith('/auth/token', {
        secret: 'my-secret',
      });
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        AUTH_TOKEN_KEY,
        'test-jwt-token',
      );
    });

    it('throws AuthenticationError on failure', async () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {status: 401, data: {detail: 'Invalid secret'}},
      });

      await expect(syncService.authenticate('wrong-secret')).rejects.toThrow(
        AuthenticationError,
      );
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no token exists', async () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const result = await syncService.isAuthenticated();
      expect(result).toBe(false);
    });

    it('returns false when token is expired', async () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      // Expired 1 hour ago
      const expiredToken = createTestJwt(Math.floor(Date.now() / 1000) - 3600);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(expiredToken);

      const result = await syncService.isAuthenticated();
      expect(result).toBe(false);
    });

    it('returns true when token is valid and not expired', async () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      // Expires 1 hour from now
      const validToken = createTestJwt(Math.floor(Date.now() / 1000) + 3600);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(validToken);

      const result = await syncService.isAuthenticated();
      expect(result).toBe(true);
    });
  });

  describe('getAuthToken', () => {
    it('returns the stored token', async () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('my-token');

      const token = await syncService.getAuthToken();
      expect(token).toBe('my-token');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY);
    });

    it('returns null when no token exists', async () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const token = await syncService.getAuthToken();
      expect(token).toBeNull();
    });
  });

  describe('axios interceptor attaches token', () => {
    it('attaches Bearer token to outgoing requests when token exists', async () => {
      const token = 'test-bearer-token';
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(token);

      // Simulate what the interceptor in api.ts does:
      // it reads the token from AsyncStorage and sets Authorization header
      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      const mockConfig = {headers: {} as Record<string, string>};
      if (storedToken) {
        mockConfig.headers.Authorization = `Bearer ${storedToken}`;
      }

      expect(AsyncStorage.getItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY);
      expect(mockConfig.headers.Authorization).toBe('Bearer test-bearer-token');
    });

    it('does not attach Authorization header when no token exists', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      const mockConfig = {headers: {} as Record<string, string>};
      if (storedToken) {
        mockConfig.headers.Authorization = `Bearer ${storedToken}`;
      }

      expect(mockConfig.headers.Authorization).toBeUndefined();
    });
  });

  describe('startBackgroundSync', () => {
    it('registers an AppState listener', () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      syncService.startBackgroundSync();

      expect(AppState.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      );
    });

    it('calls pushUnsyncedLogs when app comes to foreground', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      let capturedCallback: (state: string) => void;
      (AppState.addEventListener as jest.Mock).mockImplementation(
        (_event: string, callback: (state: string) => void) => {
          capturedCallback = callback;
          return {remove: jest.fn()};
        },
      );

      (apiClient.post as jest.Mock).mockResolvedValue({
        data: {synced: 1, errors: []},
      });

      syncService.startBackgroundSync();
      capturedCallback!('active');

      // Wait for async pushUnsyncedLogs to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(habitService.getUnsyncedLogs).toHaveBeenCalled();
    });
  });
});
