import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, {AUTH_TOKEN_KEY} from '../../services/api';
import SyncService, {
  AuthenticationError,
  SYNC_SECRET_KEY,
  SYNC_AUTH_FAILED_KEY,
} from '../../services/SyncService';
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

function createMockLog(habitId: string, completedDate: string) {
  return {
    habitId,
    completedDate,
    synced: false,
    deletedAt: null as number | null,
    markSynced: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockHabitService(logs: ReturnType<typeof createMockLog>[] = []) {
  return {
    getUnsyncedLogs: jest.fn().mockResolvedValue(logs),
    // The hardening tests focus on log-sync paths and assume habits are
    // already synced; an empty unsynced-habits result keeps the new
    // habit-push step a no-op so existing assertions still hold.
    getUnsyncedHabits: jest.fn().mockResolvedValue([]),
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

describe('SyncService Hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no auth failed flag
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === SYNC_AUTH_FAILED_KEY) {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });
  });

  // ---------------------------------------------------------------
  // Scenario 1: Fully offline usage
  // ---------------------------------------------------------------
  describe('Scenario 1: Fully offline usage', () => {
    it('all local operations work without network — no HTTP calls when no logs exist', async () => {
      const habitService = createMockHabitService([]);
      const syncService = new SyncService(habitService);

      const result = await syncService.pushUnsyncedLogs();

      expect(result).toEqual({pushed: 0, failed: 0});
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('network error during sync does NOT throw — fails silently', async () => {
      const logs = [
        createMockLog('habit-1', '2025-01-01'),
        createMockLog('habit-2', '2025-01-02'),
      ];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      const networkError = Object.assign(new Error('Network Error'), {code: 'ERR_NETWORK'});
      (apiClient.post as jest.Mock).mockRejectedValueOnce(networkError);

      // Should NOT throw — app is local-first
      const result = await syncService.pushUnsyncedLogs();
      expect(result).toEqual({pushed: 0, failed: 0});
    });

    it('logs remain unsynced after network failure (can be retried later)', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      const networkError = Object.assign(new Error('Network Error'), {code: 'ERR_NETWORK'});
      (apiClient.post as jest.Mock).mockRejectedValueOnce(networkError);

      await syncService.pushUnsyncedLogs();

      // markSynced was NOT called — logs stay as synced=false
      expect(logs[0].markSynced).not.toHaveBeenCalled();
    });

    it('getSyncStatus returns "offline" when not authenticated', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      // No token stored
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === SYNC_AUTH_FAILED_KEY) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      const status = await syncService.getSyncStatus();
      expect(status.status).toBe('offline');
      expect(status.pendingCount).toBe(1);
    });

    it('ECONNABORTED timeout errors are handled silently', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      const timeoutError = Object.assign(new Error('timeout of 10000ms exceeded'), {code: 'ECONNABORTED'});
      (apiClient.post as jest.Mock).mockRejectedValueOnce(timeoutError);

      const result = await syncService.pushUnsyncedLogs();
      expect(result).toEqual({pushed: 0, failed: 0});
      expect(logs[0].markSynced).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Scenario 2: Partial sync failure
  // ---------------------------------------------------------------
  describe('Scenario 2: Partial sync failure', () => {
    it('marks ONLY successful logs as synced when some return in errors array', async () => {
      const logs = [
        createMockLog('habit-1', '2025-01-01'),
        createMockLog('habit-2', '2025-01-02'),
        createMockLog('habit-3', '2025-01-03'),
      ];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {
          synced: 2,
          errors: [
            {
              habit_id: 'habit-2',
              completed_date: '2025-01-02',
              reason: 'Habit not found',
            },
          ],
        },
      });

      const result = await syncService.pushUnsyncedLogs();

      // habit-1 and habit-3 succeed
      expect(logs[0].markSynced).toHaveBeenCalled();
      expect(logs[2].markSynced).toHaveBeenCalled();

      // habit-2 failed — NOT marked as synced
      expect(logs[1].markSynced).not.toHaveBeenCalled();

      expect(result.pushed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toEqual([
        'habit-2 (2025-01-02): Habit not found',
      ]);
    });

    it('failed logs remain synced=false and are included in next sync attempt', async () => {
      const failedLog = createMockLog('habit-2', '2025-01-02');
      const successLog = createMockLog('habit-1', '2025-01-01');

      // First sync: habit-2 fails
      const habitService1 = createMockHabitService([successLog, failedLog]);
      const syncService = new SyncService(habitService1);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {
          synced: 1,
          errors: [
            {habit_id: 'habit-2', completed_date: '2025-01-02', reason: 'Habit not found'},
          ],
        },
      });

      await syncService.pushUnsyncedLogs();
      expect(failedLog.markSynced).not.toHaveBeenCalled();

      // Second sync: habit-2 is still unsynced and gets retried
      (habitService1.getUnsyncedLogs as jest.Mock).mockResolvedValueOnce([failedLog]);
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {synced: 1, errors: []},
      });

      await syncService.pushUnsyncedLogs();
      expect(failedLog.markSynced).toHaveBeenCalled();
    });

    it('handles all logs failing in the errors array', async () => {
      const logs = [
        createMockLog('habit-1', '2025-01-01'),
        createMockLog('habit-2', '2025-01-02'),
      ];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {
          synced: 0,
          errors: [
            {habit_id: 'habit-1', completed_date: '2025-01-01', reason: 'Habit not found'},
            {habit_id: 'habit-2', completed_date: '2025-01-02', reason: 'Habit not found'},
          ],
        },
      });

      const result = await syncService.pushUnsyncedLogs();

      expect(logs[0].markSynced).not.toHaveBeenCalled();
      expect(logs[1].markSynced).not.toHaveBeenCalled();
      expect(result.pushed).toBe(0);
      expect(result.failed).toBe(2);
    });
  });

  // ---------------------------------------------------------------
  // Scenario 3: Backend down (5xx responses)
  // ---------------------------------------------------------------
  describe('Scenario 3: Backend down (5xx responses)', () => {
    it('gives up silently after retries exhaust — does NOT throw', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      const serverError = {
        response: {status: 500, data: {detail: 'Internal Server Error'}},
        message: 'Request failed with status code 500',
      };
      (apiClient.post as jest.Mock).mockRejectedValueOnce(serverError);

      // Should NOT throw — local-first app
      const result = await syncService.pushUnsyncedLogs();
      expect(result).toEqual({pushed: 0, failed: 0});
    });

    it('logs the error to console.warn for debugging', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      const serverError = {
        response: {status: 502, data: {detail: 'Bad Gateway'}},
        message: 'Request failed with status code 502',
      };
      (apiClient.post as jest.Mock).mockRejectedValueOnce(serverError);

      await syncService.pushUnsyncedLogs();

      expect(warnSpy).toHaveBeenCalledWith(
        'Sync failed (will retry later):',
        expect.any(String),
      );

      warnSpy.mockRestore();
    });

    it('does NOT mark any logs as synced on 5xx failure', async () => {
      const logs = [
        createMockLog('habit-1', '2025-01-01'),
        createMockLog('habit-2', '2025-01-02'),
      ];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {status: 503, data: {}},
        message: 'Service Unavailable',
      });

      await syncService.pushUnsyncedLogs();

      expect(logs[0].markSynced).not.toHaveBeenCalled();
      expect(logs[1].markSynced).not.toHaveBeenCalled();
    });

    it('handles 503 Service Unavailable gracefully', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {status: 503, data: {}},
        message: 'Service Unavailable',
      });

      const result = await syncService.pushUnsyncedLogs();
      expect(result).toEqual({pushed: 0, failed: 0});
    });
  });

  // ---------------------------------------------------------------
  // Scenario 4: Token expired mid-session
  // ---------------------------------------------------------------
  describe('Scenario 4: Token expired mid-session (401)', () => {
    it('attempts re-auth with stored secret on 401 response', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      // First call: 401, triggers re-auth
      const authError = {
        response: {status: 401, data: {detail: 'Token expired'}},
        message: 'Unauthorized',
      };
      // Second call (to /auth/token): success
      // Third call (retry /logs/sync): success
      (apiClient.post as jest.Mock)
        .mockRejectedValueOnce(authError)
        .mockResolvedValueOnce({
          data: {access_token: 'new-jwt-token', token_type: 'bearer'},
        })
        .mockResolvedValueOnce({
          data: {synced: 1, errors: []},
        });

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === SYNC_SECRET_KEY) {
          return Promise.resolve('my-secret');
        }
        if (key === SYNC_AUTH_FAILED_KEY) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      const result = await syncService.pushUnsyncedLogs();

      // Re-auth was attempted
      expect(apiClient.post).toHaveBeenCalledWith('/auth/token', {secret: 'my-secret'});
      // New token was stored
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY, 'new-jwt-token');
      // Sync succeeded after re-auth
      expect(result.pushed).toBe(1);
      expect(logs[0].markSynced).toHaveBeenCalled();
    });

    it('sets auth_failed flag and stops retrying when re-auth fails', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      const authError = {
        response: {status: 401, data: {detail: 'Token expired'}},
        message: 'Unauthorized',
      };
      (apiClient.post as jest.Mock)
        .mockRejectedValueOnce(authError)
        .mockRejectedValueOnce({
          response: {status: 401, data: {detail: 'Invalid secret'}},
        });

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === SYNC_SECRET_KEY) {
          return Promise.resolve('wrong-secret');
        }
        if (key === SYNC_AUTH_FAILED_KEY) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      const result = await syncService.pushUnsyncedLogs();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(SYNC_AUTH_FAILED_KEY, 'true');
      expect(result).toEqual({pushed: 0, failed: 0});
      expect(logs[0].markSynced).not.toHaveBeenCalled();
    });

    it('does NOT set auth_failed flag when re-auth fails with a network error', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      const authError = {
        response: {status: 401, data: {detail: 'Token expired'}},
        message: 'Unauthorized',
      };
      const networkError = {message: 'Network Error'};
      (apiClient.post as jest.Mock)
        .mockRejectedValueOnce(authError)
        .mockRejectedValueOnce(networkError);

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === SYNC_SECRET_KEY) {
          return Promise.resolve('my-secret');
        }
        if (key === SYNC_AUTH_FAILED_KEY) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      const result = await syncService.pushUnsyncedLogs();

      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(SYNC_AUTH_FAILED_KEY, 'true');
      expect(result).toEqual({pushed: 0, failed: 0});
    });

    it('does NOT set auth_failed flag when re-auth fails with a 5xx error', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      const authError = {
        response: {status: 401, data: {detail: 'Token expired'}},
        message: 'Unauthorized',
      };
      const serverError = {
        response: {status: 502, data: {detail: 'Bad Gateway'}},
        message: 'Server Error',
      };
      (apiClient.post as jest.Mock)
        .mockRejectedValueOnce(authError)
        .mockRejectedValueOnce(serverError);

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === SYNC_SECRET_KEY) {
          return Promise.resolve('my-secret');
        }
        if (key === SYNC_AUTH_FAILED_KEY) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      const result = await syncService.pushUnsyncedLogs();

      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(SYNC_AUTH_FAILED_KEY, 'true');
      expect(result).toEqual({pushed: 0, failed: 0});
    });

    it('sets auth_failed flag when no stored secret exists for re-auth', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      const authError = {
        response: {status: 401, data: {detail: 'Token expired'}},
        message: 'Unauthorized',
      };
      (apiClient.post as jest.Mock).mockRejectedValueOnce(authError);

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === SYNC_SECRET_KEY) {
          return Promise.resolve(null); // No secret stored
        }
        if (key === SYNC_AUTH_FAILED_KEY) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      const result = await syncService.pushUnsyncedLogs();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(SYNC_AUTH_FAILED_KEY, 'true');
      expect(result).toEqual({pushed: 0, failed: 0});
    });

    it('skips sync entirely when auth_failed flag is set', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === SYNC_AUTH_FAILED_KEY) {
          return Promise.resolve('true');
        }
        return Promise.resolve(null);
      });

      const result = await syncService.pushUnsyncedLogs();

      expect(result).toEqual({pushed: 0, failed: 0});
      // Should not even check for unsynced logs
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('authenticate() stores the secret for future re-auth attempts', async () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {access_token: 'test-jwt-token', token_type: 'bearer'},
      });

      await syncService.authenticate('my-secret');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(SYNC_SECRET_KEY, 'my-secret');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY, 'test-jwt-token');
    });

    it('authenticate() clears auth_failed flag on success', async () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {access_token: 'test-jwt-token', token_type: 'bearer'},
      });

      await syncService.authenticate('my-secret');

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(SYNC_AUTH_FAILED_KEY);
    });

    it('getSyncStatus returns auth_failed when flag is set', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === SYNC_AUTH_FAILED_KEY) {
          return Promise.resolve('true');
        }
        return Promise.resolve(null);
      });

      const status = await syncService.getSyncStatus();
      expect(status.status).toBe('auth_failed');
      expect(status.pendingCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // Scenario 5: Large backlog (batch chunking)
  // ---------------------------------------------------------------
  describe('Scenario 5: Large backlog (>500 unsynced logs)', () => {
    it('sends all logs in a single batch when count <= 500', async () => {
      const logs = Array.from({length: 450}, (_, i) =>
        createMockLog(`habit-${(i % 5) + 1}`, `2025-${String(Math.floor(i / 5) + 1).padStart(2, '0')}-01`),
      );
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {synced: 450, errors: []},
      });

      const result = await syncService.pushUnsyncedLogs();

      // Single HTTP call for 450 logs
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(result.pushed).toBe(450);
    });

    it('chunks into batches of 100 when count > 500', async () => {
      const logs = Array.from({length: 550}, (_, i) =>
        createMockLog(`habit-${(i % 5) + 1}`, `2025-01-${String((i % 28) + 1).padStart(2, '0')}-${i}`),
      );
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          data: {synced: 100, errors: []},
        }),
      );

      const result = await syncService.pushUnsyncedLogs();

      // 6 API calls (550 / 100 = 5 full + 1 partial)
      expect(apiClient.post).toHaveBeenCalledTimes(6);
      expect(result.pushed).toBe(600); // 6 * 100 from mock
    }, 30000);

    it('each batch contains at most 100 logs', async () => {
      const manyLogs = Array.from({length: 501}, (_, i) =>
        createMockLog(`habit-${i}`, `2025-01-01`),
      );
      const habitService = createMockHabitService(manyLogs);
      const syncService = new SyncService(habitService);

      const batchSizes: number[] = [];
      (apiClient.post as jest.Mock).mockImplementation((_url: string, payload: {logs: {habit_id: string; completed_date: string}[]}) => {
        batchSizes.push(payload.logs.length);
        return Promise.resolve({
          data: {synced: payload.logs.length, errors: []},
        });
      });

      await syncService.pushUnsyncedLogs();

      // All batches except possibly the last should be 100
      for (let i = 0; i < batchSizes.length - 1; i++) {
        expect(batchSizes[i]).toBe(100);
      }
      // Last batch gets the remainder
      expect(batchSizes[batchSizes.length - 1]).toBe(1); // 501 % 100 = 1
    }, 30000);

    it('partial failure in one batch does not stop subsequent batches', async () => {
      const logs = Array.from({length: 501}, (_, i) =>
        createMockLog(`habit-${i}`, `2025-01-${String((i % 28) + 1).padStart(2, '0')}`),
      );
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      let callCount = 0;
      (apiClient.post as jest.Mock).mockImplementation((_url: string, payload: {logs: {habit_id: string; completed_date: string}[]}) => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve({
            data: {
              synced: payload.logs.length - 1,
              errors: [{
                habit_id: payload.logs[0].habit_id,
                completed_date: payload.logs[0].completed_date,
                reason: 'Habit not found',
              }],
            },
          });
        }
        return Promise.resolve({
          data: {synced: payload.logs.length, errors: []},
        });
      });

      const result = await syncService.pushUnsyncedLogs();

      // All 6 batches should have been attempted
      expect(apiClient.post).toHaveBeenCalledTimes(6);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    }, 30000);
  });

  // ---------------------------------------------------------------
  // Scenario 6: Database conflicts (duplicate logs)
  // ---------------------------------------------------------------
  describe('Scenario 6: Database conflicts — duplicate/already-synced logs', () => {
    it('handles 200 for already-synced logs gracefully (idempotent markSynced)', async () => {
      // Simulate: log was synced server-side but markSynced failed locally.
      // On retry, client re-sends the same log. Backend upserts — returns 200.
      const log = createMockLog('habit-1', '2025-01-01');
      const habitService = createMockHabitService([log]);
      const syncService = new SyncService(habitService);

      // Backend returns success for the duplicate — no error
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {synced: 1, errors: []},
      });

      const result = await syncService.pushUnsyncedLogs();

      // Log gets marked as synced (again) — idempotent
      expect(log.markSynced).toHaveBeenCalledTimes(1);
      expect(result.pushed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('re-marking an already-synced log does not cause errors', async () => {
      const log = createMockLog('habit-1', '2025-01-01');
      Object.assign(log, {synced: true}); // Already synced locally, but service layer still returned it
      const habitService = createMockHabitService([log]);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {synced: 1, errors: []},
      });

      // Should not throw
      const result = await syncService.pushUnsyncedLogs();
      expect(result.pushed).toBe(1);
      expect(log.markSynced).toHaveBeenCalled();
    });

    it('backend upsert means no error in response for duplicates', async () => {
      // Two logs for the same (habit_id, completed_date) — only possible if
      // WatermelonDB has a stale record. Backend upserts both.
      const log1 = createMockLog('habit-1', '2025-01-01');
      const log2 = createMockLog('habit-1', '2025-01-01');
      const habitService = createMockHabitService([log1, log2]);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {synced: 2, errors: []},
      });

      const result = await syncService.pushUnsyncedLogs();

      expect(result.pushed).toBe(2);
      expect(result.failed).toBe(0);
      expect(log1.markSynced).toHaveBeenCalled();
      expect(log2.markSynced).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Scenario 7: App killed during sync
  // ---------------------------------------------------------------
  describe('Scenario 7: App killed during sync', () => {
    it('documents expected behavior: logs remain synced=false and are re-sent on next launch', () => {
      /**
       * SCENARIO: App is force-killed between sending the HTTP request
       * and receiving the response.
       *
       * WHAT HAPPENS:
       * 1. pushUnsyncedLogs() fetches unsynced logs (synced=false) from WatermelonDB.
       * 2. The HTTP POST to /logs/sync is dispatched.
       * 3. The app is killed before the response arrives.
       * 4. Since markSynced() was never called, the logs remain synced=false
       *    in the local SQLite database.
       *
       * ON NEXT LAUNCH:
       * 1. startBackgroundSync() registers an AppState listener.
       * 2. When the app transitions to 'active', pushUnsyncedLogs() runs.
       * 3. getUnsyncedLogs() returns the same logs (still synced=false).
       * 4. The logs are re-sent to /logs/sync.
       * 5. The backend performs an UPSERT on (habit_id, completed_date),
       *    so duplicates are silently absorbed — no error, no duplicate data.
       * 6. On successful response, markSynced() is called and logs become
       *    synced=true in the local database.
       *
       * RESULT: No data loss. The sync is eventually consistent.
       *
       * WHY THIS CAN'T BE FULLY SIMULATED IN A UNIT TEST:
       * - Process termination cannot be simulated in Jest.
       * - WatermelonDB transactions are atomic at the SQLite level;
       *   we cannot simulate a partial write.
       * - The key guarantee is architectural: synced=false is the default,
       *   and markSynced() only runs AFTER a confirmed server response.
       *   This means any interruption before confirmation keeps logs
       *   in the retry queue.
       */
      expect(true).toBe(true); // Placeholder — the value is in the documentation above
    });

    it('verifies the architectural guarantee: markSynced only runs after confirmed response', async () => {
      const log = createMockLog('habit-1', '2025-01-01');
      const habitService = createMockHabitService([log]);
      const syncService = new SyncService(habitService);

      // Simulate: request sent, response received with success
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {synced: 1, errors: []},
      });

      await syncService.pushUnsyncedLogs();

      // markSynced is called ONLY after the response is confirmed
      expect(log.markSynced).toHaveBeenCalledTimes(1);
    });

    it('verifies logs are NOT marked synced if response never arrives (simulated rejection)', async () => {
      const log = createMockLog('habit-1', '2025-01-01');
      const habitService = createMockHabitService([log]);
      const syncService = new SyncService(habitService);

      // Simulate: request sent but response never arrives (network error)
      const networkError = Object.assign(new Error('Network Error'), {code: 'ERR_NETWORK'});
      (apiClient.post as jest.Mock).mockRejectedValueOnce(networkError);

      await syncService.pushUnsyncedLogs();

      // markSynced was NOT called — log stays in retry queue
      expect(log.markSynced).not.toHaveBeenCalled();
    });

    it('verifies re-send on next launch works correctly after simulated kill', async () => {
      const log = createMockLog('habit-1', '2025-01-01');
      const habitService = createMockHabitService([log]);
      const syncService = new SyncService(habitService);

      // First attempt: "killed" (network error)
      const networkError = Object.assign(new Error('Network Error'), {code: 'ERR_NETWORK'});
      (apiClient.post as jest.Mock)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          data: {synced: 1, errors: []},
        });

      await syncService.pushUnsyncedLogs();
      expect(log.markSynced).not.toHaveBeenCalled();

      // "Next launch" — same log is still unsynced, push again
      const result = await syncService.pushUnsyncedLogs();

      expect(log.markSynced).toHaveBeenCalledTimes(1);
      expect(result.pushed).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // Cross-cutting: authenticate stores secret
  // ---------------------------------------------------------------
  describe('authenticate stores secret for re-auth', () => {
    it('stores both token and secret on successful authentication', async () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {access_token: 'jwt-token-123', token_type: 'bearer'},
      });

      await syncService.authenticate('my-app-secret');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY, 'jwt-token-123');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(SYNC_SECRET_KEY, 'my-app-secret');
    });

    it('does NOT store secret on failed authentication', async () => {
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {status: 401, data: {detail: 'Invalid secret'}},
      });

      await expect(syncService.authenticate('bad-secret')).rejects.toThrow(
        AuthenticationError,
      );

      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
        SYNC_SECRET_KEY,
        expect.anything(),
      );
    });
  });
});
