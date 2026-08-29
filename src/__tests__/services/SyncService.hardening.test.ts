import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, {AUTH_TOKEN_KEY} from '../../services/api';
import SyncService, {SYNC_AUTH_FAILED_KEY} from '../../services/SyncService';
import type HabitService from '../../services/HabitService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../../services/api', () => {
  const mockPost = jest.fn();
  // The pull is best-effort and irrelevant to these scenarios; default it to a
  // network failure so it stays a no-op unless a test says otherwise.
  const mockGet = jest.fn(() => Promise.reject({message: 'Network Error'}));
  const mockInterceptors = {
    request: {use: jest.fn(), eject: jest.fn()},
    response: {use: jest.fn(), eject: jest.fn()},
  };
  class CircuitOpenError extends Error {
    constructor() {
      super('Circuit breaker open: skipping request');
      this.name = 'CircuitOpenError';
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-shadow
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  return {
    __esModule: true,
    default: {
      post: mockPost,
      get: mockGet,
      interceptors: mockInterceptors,
    },
    AUTH_TOKEN_KEY: 'auth_token',
    CircuitOpenError,
    isCircuitOpen: jest.fn(() => false),
    setAuthToken: jest.fn(async (token: string | null) => {
      if (token === null) {
        await AsyncStorage.removeItem('auth_token');
      } else {
        await AsyncStorage.setItem('auth_token', token);
      }
    }),
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
    markLogsRetryFailed: jest.fn().mockResolvedValue(undefined),
    markHabitsSynced: jest
      .fn()
      .mockImplementation(async (batch: {markSynced: () => Promise<void>}[]) => {
        for (const habit of batch) {
          await habit.markSynced();
        }
      }),
  } as unknown as HabitService;
}

/**
 * Stub AsyncStorage as a signed-in device with no prior auth failure.
 *
 * `pushUnsyncedLogs` refuses to touch the network without a stored token, so a
 * scenario that expects a request has to look signed in — otherwise the guard
 * short-circuits and the assertions pass without exercising anything. Pass
 * overrides to model the exceptions: `{[AUTH_TOKEN_KEY]: null}` for a
 * signed-out device, `{[SYNC_AUTH_FAILED_KEY]: 'true'}` for a latched one.
 */
function mockStoredItems(overrides: Record<string, string | null> = {}) {
  const store: Record<string, string | null> = {
    [AUTH_TOKEN_KEY]: 'stored-token',
    [SYNC_AUTH_FAILED_KEY]: null,
    ...overrides,
  };
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(store[key] ?? null),
  );
}

describe('SyncService Hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockRejectedValue({message: 'Network Error'});
    mockStoredItems();
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

      mockStoredItems({[AUTH_TOKEN_KEY]: null});

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

    it('records retry failures so the persistent backlog gets bounded', async () => {
      const log = createMockLog('habit-1', '2025-01-01');
      const habitService = createMockHabitService([log]);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {
          synced: 0,
          errors: [
            {habit_id: 'habit-1', completed_date: '2025-01-01', reason: 'Habit not found'},
          ],
        },
      });

      await syncService.pushUnsyncedLogs();

      expect(habitService.markLogsRetryFailed).toHaveBeenCalledTimes(1);
      const failedBatch = (habitService.markLogsRetryFailed as jest.Mock).mock.calls[0][0];
      expect(failedBatch).toHaveLength(1);
      expect(failedBatch[0].habitId).toBe('habit-1');
      // Successful logs are never passed to markLogsRetryFailed.
      expect(log.markSynced).not.toHaveBeenCalled();
    });

    it('only records the rejected logs as retry-failed, not the successful ones', async () => {
      const ok = createMockLog('habit-1', '2025-01-01');
      const bad = createMockLog('habit-2', '2025-01-02');
      const habitService = createMockHabitService([ok, bad]);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {
          synced: 1,
          errors: [
            {habit_id: 'habit-2', completed_date: '2025-01-02', reason: 'Habit not found'},
          ],
        },
      });

      await syncService.pushUnsyncedLogs();

      expect(ok.markSynced).toHaveBeenCalled();
      const failedBatch = (habitService.markLogsRetryFailed as jest.Mock).mock.calls[0][0];
      expect(failedBatch.map((l: {habitId: string}) => l.habitId)).toEqual(['habit-2']);
    });

    it('does NOT call markLogsRetryFailed on network/5xx failures (whole-batch retry)', async () => {
      const log = createMockLog('habit-1', '2025-01-01');
      const habitService = createMockHabitService([log]);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('Network Error'), {code: 'ERR_NETWORK'}),
      );

      await syncService.pushUnsyncedLogs();

      // On a transport-level failure the whole batch is retried next cycle —
      // no per-log retry counter should advance.
      expect(habitService.markLogsRetryFailed).not.toHaveBeenCalled();
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
    it('flags auth failure and ends the session on a 401, without re-minting', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);
      const onSessionExpired = jest.fn();
      syncService.setOnSessionExpired(onSessionExpired);

      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {status: 401, data: {detail: 'Token expired'}},
        message: 'Unauthorized',
      });
      mockStoredItems();

      const result = await syncService.pushUnsyncedLogs();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(SYNC_AUTH_FAILED_KEY, 'true');
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
      expect(result).toEqual({pushed: 0, failed: 0});
      expect(logs[0].markSynced).not.toHaveBeenCalled();
    });

    it('never mints a token of its own on a 401', async () => {
      // The whole defect in #125: sync used to POST /auth/token with a shared
      // secret and overwrite the signed-in user's real token with the result.
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockRejectedValue({
        response: {status: 401, data: {detail: 'Token expired'}},
        message: 'Unauthorized',
      });
      mockStoredItems();

      await syncService.pushUnsyncedLogs();

      const posted = (apiClient.post as jest.Mock).mock.calls.map(call => call[0]);
      expect(posted).not.toContain('/auth/token');
      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
        AUTH_TOKEN_KEY,
        expect.anything(),
      );
    });

    it('notifies the app only once while the session stays expired', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);
      const onSessionExpired = jest.fn();
      syncService.setOnSessionExpired(onSessionExpired);

      (apiClient.post as jest.Mock).mockRejectedValue({
        response: {status: 401, data: {detail: 'Token expired'}},
        message: 'Unauthorized',
      });
      // The flag is already set from an earlier failure.
      mockStoredItems({[SYNC_AUTH_FAILED_KEY]: 'true'});

      await syncService.pushUnsyncedLogs();

      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('ends the session on a 401 from the pull, with nothing pending to push', async () => {
      // A user whose backlog is empty never reaches the push, so the pull is
      // the only place their expired session can surface.
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);
      const onSessionExpired = jest.fn();
      syncService.setOnSessionExpired(onSessionExpired);

      (apiClient.get as jest.Mock).mockRejectedValue({
        response: {status: 401, data: {detail: 'Token expired'}},
      });
      mockStoredItems();

      await syncService.pushUnsyncedLogs();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(SYNC_AUTH_FAILED_KEY, 'true');
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });

    it('does NOT set auth_failed flag on a network error', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);
      const onSessionExpired = jest.fn();
      syncService.setOnSessionExpired(onSessionExpired);

      (apiClient.post as jest.Mock).mockRejectedValueOnce({message: 'Network Error'});
      mockStoredItems();

      const result = await syncService.pushUnsyncedLogs();

      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(SYNC_AUTH_FAILED_KEY, 'true');
      expect(onSessionExpired).not.toHaveBeenCalled();
      expect(result).toEqual({pushed: 0, failed: 0});
    });

    it('does NOT set auth_failed flag on a 5xx error', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {status: 502, data: {detail: 'Bad Gateway'}},
        message: 'Server Error',
      });
      mockStoredItems();

      const result = await syncService.pushUnsyncedLogs();

      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(SYNC_AUTH_FAILED_KEY, 'true');
      expect(result).toEqual({pushed: 0, failed: 0});
    });

    it('skips sync entirely when auth_failed flag is set', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      mockStoredItems({[SYNC_AUTH_FAILED_KEY]: 'true'});

      const result = await syncService.pushUnsyncedLogs();

      expect(result).toEqual({pushed: 0, failed: 0});
      // Should not even check for unsynced logs
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('getSyncStatus returns auth_failed when flag is set', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      mockStoredItems({[SYNC_AUTH_FAILED_KEY]: 'true'});

      const status = await syncService.getSyncStatus();
      expect(status.status).toBe('auth_failed');
      expect(status.pendingCount).toBe(1);
    });

    // The pairing the suite was missing (issue #134): every assertion that the
    // latch is *set* needs its counterpart that it can be *released*, or a
    // regression that strands sync forever keeps the suite green.
    it('releases the latch on clearAuthFailedFlag, and the next push reaches the network', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      // A real backing store, not a per-step stub: the point of this test is
      // that clearAuthFailedFlag's own write is what unblocks the next push,
      // which a re-stubbed getItem would fake for it.
      const store: Record<string, string | null> = {
        [AUTH_TOKEN_KEY]: 'stored-token',
      };
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(store[key] ?? null),
      );
      (AsyncStorage.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          store[key] = value;
        },
      );
      (AsyncStorage.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          delete store[key];
        },
      );

      // 1. A 401 latches the flag.
      (apiClient.post as jest.Mock).mockRejectedValueOnce({
        response: {status: 401, data: {detail: 'Token expired'}},
        message: 'Unauthorized',
      });
      await syncService.pushUnsyncedLogs();
      expect(store[SYNC_AUTH_FAILED_KEY]).toBe('true');

      // 2. While it is latched, sync makes no request at all — this is the
      //    state a device used to be stuck in permanently.
      (apiClient.post as jest.Mock).mockClear();
      (apiClient.post as jest.Mock).mockResolvedValue({
        data: {synced: 1, errors: []},
      });
      await syncService.pushUnsyncedLogs();
      expect(apiClient.post).not.toHaveBeenCalled();
      expect(logs[0].markSynced).not.toHaveBeenCalled();

      // 3. Signing in again releases it, with no other stubbing...
      await syncService.clearAuthFailedFlag();
      expect(store[SYNC_AUTH_FAILED_KEY]).toBeUndefined();

      // 4. ...and the backlog the flag was stranding goes out.
      const result = await syncService.pushUnsyncedLogs();

      expect(apiClient.post).toHaveBeenCalledWith('/logs/sync', {
        logs: [{habit_id: 'habit-1', completed_date: '2025-01-01', deleted: false}],
      });
      expect(result.pushed).toBe(1);
      expect(logs[0].markSynced).toHaveBeenCalled();
    });

    it('still ends the session when the latch survived a previous run', async () => {
      // handleAuthFailure suppresses the callback when the flag is already
      // 'true', so a latch that outlived a restart used to leave the user on
      // the main tabs — signed in, syncing nothing, never prompted. The
      // navigator clears the flag as soon as userId resolves, which is what
      // makes this 401 notify; the assertion pins that ordering.
      const habitService = createMockHabitService();
      const syncService = new SyncService(habitService);
      const onSessionExpired = jest.fn();
      syncService.setOnSessionExpired(onSessionExpired);

      // The state right after the navigator's clearAuthFailedFlag(): a stale
      // token still stored, latch released.
      mockStoredItems();
      (apiClient.get as jest.Mock).mockRejectedValue({
        response: {status: 401, data: {detail: 'Invalid or expired token'}},
      });

      await syncService.pushUnsyncedLogs();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(SYNC_AUTH_FAILED_KEY, 'true');
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });

    it('makes no request and sets no flag when no token is stored', async () => {
      // The launch sync runs before anyone has signed in. Production answers a
      // tokenless request with 401 "Not authenticated", so without the guard
      // a fresh install latches the flag and strands the account about to be
      // created on it.
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);
      const onSessionExpired = jest.fn();
      syncService.setOnSessionExpired(onSessionExpired);

      mockStoredItems({[AUTH_TOKEN_KEY]: null});

      const result = await syncService.pushUnsyncedLogs();

      expect(apiClient.get).not.toHaveBeenCalled();
      expect(apiClient.post).not.toHaveBeenCalled();
      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
        SYNC_AUTH_FAILED_KEY,
        'true',
      );
      expect(onSessionExpired).not.toHaveBeenCalled();
      expect(result).toEqual({pushed: 0, failed: 0});
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

      (apiClient.post as jest.Mock).mockImplementation((_url: string, payload: {logs: {habit_id: string; completed_date: string}[]}) =>
        Promise.resolve({
          data: {synced: payload.logs.length, errors: []},
        }),
      );

      const result = await syncService.pushUnsyncedLogs();

      // 6 API calls (550 / 100 = 5 full + 1 partial)
      expect(apiClient.post).toHaveBeenCalledTimes(6);
      expect(result.pushed).toBe(550);
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
  // Cross-cutting: no credential minting anywhere in this service
  // ---------------------------------------------------------------
  describe('sync never authenticates on the user\'s behalf', () => {
    it('exposes no way to trade a shared secret for a token', () => {
      const syncService = new SyncService(createMockHabitService());

      expect(
        (syncService as unknown as {authenticate?: unknown}).authenticate,
      ).toBeUndefined();
    });

    it('does not write the auth token during a successful push', async () => {
      const logs = [createMockLog('habit-1', '2025-01-01')];
      const habitService = createMockHabitService(logs);
      const syncService = new SyncService(habitService);

      (apiClient.post as jest.Mock).mockResolvedValue({
        data: {synced: 1, errors: []},
      });
      mockStoredItems();

      await syncService.pushUnsyncedLogs();

      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
        AUTH_TOKEN_KEY,
        expect.anything(),
      );
    });
  });
});
