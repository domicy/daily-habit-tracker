import {Database} from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {schema} from '../../models/schema';
import Habit from '../../models/Habit';
import HabitLog from '../../models/HabitLog';
import HabitService from '../../services/HabitService';
import SyncService, {SYNC_AUTH_FAILED_KEY} from '../../services/SyncService';
import apiClient from '../../services/api';

// End-to-end coverage for the N-C1 divergence (PR#27): un-toggling a log
// that was already synced to the server must leave a tombstone locally and
// push it as `deleted: true` on the next sync. Without this, an offline
// un-toggle would silently desync from the server forever (the canonical
// regression these tests guard against).

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

// We deliberately do NOT mock `react-native` here:
//   * SyncService imports `AppState` but only touches it inside
//     startBackgroundSync(), which these tests never call.
//   * WatermelonDB pulls `NativeModules.WMDatabaseBridge` off the real
//     `react-native`, and a wholesale mock breaks that lookup.

function createTestDatabase(): Database {
  const adapter = new LokiJSAdapter({
    schema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  });
  return new Database({
    adapter,
    modelClasses: [Habit, HabitLog],
  });
}

async function createSyncedHabit(
  database: Database,
  name: string = 'Exercise',
): Promise<Habit> {
  return database.write(async () => {
    return database.get<Habit>('habits').create(h => {
      h.name = name;
      h.createdAt = Date.now();
      h.isActive = true;
      h.synced = true;
    });
  });
}

async function createSyncedLog(
  database: Database,
  habitId: string,
  date: string,
): Promise<HabitLog> {
  return database.write(async () => {
    return database.get<HabitLog>('habit_logs').create(log => {
      log.habitId = habitId;
      log.completedDate = date;
      log.synced = true;
      log.deletedAt = null;
    });
  });
}

describe('SyncService — un-toggle of a synced log (N-C1 / PR#27)', () => {
  let database: Database;
  let habitService: HabitService;
  let syncService: SyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(() =>
      Promise.resolve(null),
    );
    database = createTestDatabase();
    habitService = new HabitService(database);
    syncService = new SyncService(habitService);
  });

  it('un-toggling a synced log leaves a tombstone visible to the sync queue', async () => {
    const habit = await createSyncedHabit(database);
    const log = await createSyncedLog(database, habit.id, '2026-03-07');

    // Sanity: nothing pending before the un-toggle.
    expect(await habitService.getUnsyncedLogs()).toHaveLength(0);

    await habitService.toggleHabitCompletion(habit.id, '2026-03-07');

    // The log is NOT destroyed — it stays as a tombstone so the deletion
    // can be pushed. This is the bug the soft-delete fix prevents.
    const all = await database
      .get<HabitLog>('habit_logs')
      .query()
      .fetch();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(log.id);
    expect(all[0].deletedAt).not.toBeNull();
    expect(all[0].synced).toBe(false);

    const pending = await habitService.getUnsyncedLogs();
    expect(pending.map(l => l.id)).toEqual([log.id]);
  });

  it('pushUnsyncedLogs sends the tombstone with deleted: true', async () => {
    const habit = await createSyncedHabit(database);
    await createSyncedLog(database, habit.id, '2026-03-07');

    await habitService.toggleHabitCompletion(habit.id, '2026-03-07');

    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {synced: 1, errors: []},
    });

    const result = await syncService.pushUnsyncedLogs();

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/logs/sync', {
      logs: [
        {habit_id: habit.id, completed_date: '2026-03-07', deleted: true},
      ],
    });
    expect(result).toEqual({pushed: 1, failed: 0});
  });

  it('marks the tombstone as synced after a successful push so it stops re-sending', async () => {
    const habit = await createSyncedHabit(database);
    await createSyncedLog(database, habit.id, '2026-03-07');

    await habitService.toggleHabitCompletion(habit.id, '2026-03-07');

    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {synced: 1, errors: []},
    });
    await syncService.pushUnsyncedLogs();

    const pending = await habitService.getUnsyncedLogs();
    expect(pending).toHaveLength(0);

    const all = await database
      .get<HabitLog>('habit_logs')
      .query()
      .fetch();
    // Tombstone is preserved (synced=true, deletedAt still set) so a
    // subsequent re-toggle can revive it instead of inserting a duplicate.
    expect(all).toHaveLength(1);
    expect(all[0].synced).toBe(true);
    expect(all[0].deletedAt).not.toBeNull();
  });

  it('a network failure during the push leaves the tombstone pending for retry', async () => {
    const habit = await createSyncedHabit(database);
    await createSyncedLog(database, habit.id, '2026-03-07');

    await habitService.toggleHabitCompletion(habit.id, '2026-03-07');

    (apiClient.post as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), {code: 'ERR_NETWORK'}),
    );

    const result = await syncService.pushUnsyncedLogs();
    expect(result).toEqual({pushed: 0, failed: 0});

    const pending = await habitService.getUnsyncedLogs();
    expect(pending).toHaveLength(1);
    expect(pending[0].deletedAt).not.toBeNull();
    expect(pending[0].synced).toBe(false);
  });

  it('re-toggling the tombstone before sync revives the log and pushes deleted: false', async () => {
    const habit = await createSyncedHabit(database);
    await createSyncedLog(database, habit.id, '2026-03-07');

    // Un-toggle (tombstone) then re-toggle (revive) before any sync runs.
    await habitService.toggleHabitCompletion(habit.id, '2026-03-07');
    await habitService.toggleHabitCompletion(habit.id, '2026-03-07');

    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {synced: 1, errors: []},
    });

    await syncService.pushUnsyncedLogs();

    expect(apiClient.post).toHaveBeenCalledWith('/logs/sync', {
      logs: [
        {habit_id: habit.id, completed_date: '2026-03-07', deleted: false},
      ],
    });
  });

  it('skips the push when auth has permanently failed but keeps the tombstone pending', async () => {
    const habit = await createSyncedHabit(database);
    await createSyncedLog(database, habit.id, '2026-03-07');

    await habitService.toggleHabitCompletion(habit.id, '2026-03-07');

    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === SYNC_AUTH_FAILED_KEY) {
        return Promise.resolve('true');
      }
      return Promise.resolve(null);
    });

    const result = await syncService.pushUnsyncedLogs();
    expect(result).toEqual({pushed: 0, failed: 0});
    expect(apiClient.post).not.toHaveBeenCalled();

    // The tombstone is still pending — once auth recovers it must still be
    // pushable, otherwise we're back to the silent-desync bug.
    const pending = await habitService.getUnsyncedLogs();
    expect(pending).toHaveLength(1);
    expect(pending[0].deletedAt).not.toBeNull();
  });
});
