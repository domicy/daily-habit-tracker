import {Database} from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import {schema} from '../../models/schema';
import Habit from '../../models/Habit';
import HabitLog from '../../models/HabitLog';
import HabitService, {
  MAX_LOG_RETRIES,
  backoffMsFor,
} from '../../services/HabitService';
import {format, subDays} from 'date-fns';

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

function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

async function createTestHabit(
  database: Database,
  name: string = 'Exercise',
  synced: boolean = true,
): Promise<Habit> {
  return database.write(async () => {
    return database.get<Habit>('habits').create(h => {
      h.name = name;
      h.createdAt = Date.now();
      h.isActive = true;
      h.synced = synced;
    });
  });
}

async function createTestLog(
  database: Database,
  habitId: string,
  date: string,
  synced: boolean = false,
): Promise<HabitLog> {
  return database.write(async () => {
    return database.get<HabitLog>('habit_logs').create(log => {
      log.habitId = habitId;
      log.completedDate = date;
      log.synced = synced;
    });
  });
}

describe('HabitService', () => {
  let database: Database;
  let service: HabitService;

  beforeEach(() => {
    database = createTestDatabase();
    service = new HabitService(database);
  });

  // ─── Validation tests ──────────────────────────────────────────────

  describe('createHabit validation', () => {
    it('throws on empty habit name', async () => {
      await expect(service.createHabit('')).rejects.toThrow(
        'Habit name cannot be empty.',
      );
    });

    it('throws on whitespace-only name', async () => {
      await expect(service.createHabit('   ')).rejects.toThrow(
        'Habit name cannot be empty.',
      );
    });

    it('throws on 51-character name', async () => {
      const longName = 'a'.repeat(51);
      await expect(service.createHabit(longName)).rejects.toThrow(
        'Habit name must be 50 characters or fewer.',
      );
    });

    it('succeeds with 50-character name', async () => {
      const name = 'a'.repeat(50);
      const habit = await service.createHabit(name);
      expect(habit.name).toBe(name);
      expect(habit.isActive).toBe(true);
    });

    it('marks newly created habit as unsynced', async () => {
      const habit = await service.createHabit('New habit');
      expect(habit.synced).toBe(false);
    });

    it('trims whitespace from name', async () => {
      const habit = await service.createHabit('  Read  ');
      expect(habit.name).toBe('Read');
    });
  });

  // ─── Toggle tests ──────────────────────────────────────────────────

  describe('toggleHabitCompletion', () => {
    it('toggle on creates a log', async () => {
      const habit = await createTestHabit(database);
      const date = '2026-03-07';

      await service.toggleHabitCompletion(habit.id, date);

      const logs = await database
        .get<HabitLog>('habit_logs')
        .query()
        .fetch();
      expect(logs).toHaveLength(1);
      expect(logs[0].habitId).toBe(habit.id);
      expect(logs[0].completedDate).toBe(date);
      expect(logs[0].synced).toBe(false);
    });

    it('toggle off (second tap same day) deletes the log', async () => {
      const habit = await createTestHabit(database);
      const date = '2026-03-07';

      await service.toggleHabitCompletion(habit.id, date);
      await service.toggleHabitCompletion(habit.id, date);

      const logs = await database
        .get<HabitLog>('habit_logs')
        .query()
        .fetch();
      expect(logs).toHaveLength(0);
    });

    it('toggle for a past date works correctly', async () => {
      const habit = await createTestHabit(database);
      const pastDate = '2026-01-15';

      await service.toggleHabitCompletion(habit.id, pastDate);

      const logs = await database
        .get<HabitLog>('habit_logs')
        .query()
        .fetch();
      expect(logs).toHaveLength(1);
      expect(logs[0].completedDate).toBe(pastDate);
    });

    it('double-rapid toggle results in no log', async () => {
      const habit = await createTestHabit(database);
      const date = '2026-03-07';

      // Simulate rapid double-tap: toggle on then immediately off
      await service.toggleHabitCompletion(habit.id, date);
      await service.toggleHabitCompletion(habit.id, date);

      const logs = await database
        .get<HabitLog>('habit_logs')
        .query()
        .fetch();
      expect(logs).toHaveLength(0);
    });

    it('toggle off of a synced log leaves a tombstone for sync', async () => {
      const habit = await createTestHabit(database);
      const date = '2026-03-07';
      await createTestLog(database, habit.id, date, true);

      await service.toggleHabitCompletion(habit.id, date);

      const logs = await database
        .get<HabitLog>('habit_logs')
        .query()
        .fetch();
      expect(logs).toHaveLength(1);
      expect(logs[0].deletedAt).not.toBeNull();
      expect(logs[0].synced).toBe(false);
    });

    it('re-toggling a tombstoned day revives the log and marks it unsynced', async () => {
      const habit = await createTestHabit(database);
      const date = '2026-03-07';
      await createTestLog(database, habit.id, date, true);

      await service.toggleHabitCompletion(habit.id, date); // tombstone
      await service.toggleHabitCompletion(habit.id, date); // revive

      const logs = await database
        .get<HabitLog>('habit_logs')
        .query()
        .fetch();
      expect(logs).toHaveLength(1);
      expect(logs[0].deletedAt).toBeNull();
      expect(logs[0].synced).toBe(false);
    });
  });

  // ─── Streak calculation tests ──────────────────────────────────────

  describe('calculateStreak', () => {
    it('returns 0 when no logs at all', async () => {
      const habit = await createTestHabit(database);
      const streak = await service.calculateStreak(habit.id, '2026-03-07');
      expect(streak).toBe(0);
    });

    it('returns 1 when only today is logged', async () => {
      const habit = await createTestHabit(database);
      const today = '2026-03-07';

      await createTestLog(database, habit.id, today);

      const streak = await service.calculateStreak(habit.id, today);
      expect(streak).toBe(1);
    });

    it('returns 5 for five consecutive days ending today', async () => {
      const habit = await createTestHabit(database);
      const today = new Date('2026-03-07T00:00:00');

      for (let i = 0; i < 5; i++) {
        await createTestLog(
          database,
          habit.id,
          formatDate(subDays(today, i)),
        );
      }

      const streak = await service.calculateStreak(
        habit.id,
        formatDate(today),
      );
      expect(streak).toBe(5);
    });

    it('streak breaks: Mon, Tue, Thu → streak as of Thu = 1', async () => {
      const habit = await createTestHabit(database);
      // Thu = 2026-03-05, Wed = skip, Tue = 2026-03-03, Mon = 2026-03-02
      await createTestLog(database, habit.id, '2026-03-02'); // Mon
      await createTestLog(database, habit.id, '2026-03-03'); // Tue
      // Wed skipped
      await createTestLog(database, habit.id, '2026-03-05'); // Thu

      const streak = await service.calculateStreak(habit.id, '2026-03-05');
      expect(streak).toBe(1);
    });

    it('returns 0 if today is not logged but yesterday was', async () => {
      const habit = await createTestHabit(database);
      const today = '2026-03-07';
      const yesterday = '2026-03-06';

      await createTestLog(database, habit.id, yesterday);

      const streak = await service.calculateStreak(habit.id, today);
      expect(streak).toBe(0);
    });

    it('handles 100 consecutive days under 50ms', async () => {
      const habit = await createTestHabit(database);
      const today = new Date('2026-03-07T00:00:00');

      // Batch-create 100 logs
      await database.write(async () => {
        for (let i = 0; i < 100; i++) {
          await database.get<HabitLog>('habit_logs').create(log => {
            log.habitId = habit.id;
            log.completedDate = formatDate(subDays(today, i));
            log.synced = false;
          });
        }
      });

      const start = performance.now();
      const streak = await service.calculateStreak(
        habit.id,
        formatDate(today),
      );
      const elapsed = performance.now() - start;

      expect(streak).toBe(100);
      expect(elapsed).toBeLessThan(50);
    });

    it('streak spans Feb 28 → Mar 1 on a non-leap year (2025)', async () => {
      const habit = await createTestHabit(database);
      // 2025 is not a leap year: Feb has 28 days
      await createTestLog(database, habit.id, '2025-02-27');
      await createTestLog(database, habit.id, '2025-02-28');
      await createTestLog(database, habit.id, '2025-03-01');

      const streak = await service.calculateStreak(habit.id, '2025-03-01');
      expect(streak).toBe(3);
    });

    it('streak spans month boundary (Jan 30, 31, Feb 1)', async () => {
      const habit = await createTestHabit(database);
      await createTestLog(database, habit.id, '2026-01-30');
      await createTestLog(database, habit.id, '2026-01-31');
      await createTestLog(database, habit.id, '2026-02-01');

      const streak = await service.calculateStreak(habit.id, '2026-02-01');
      expect(streak).toBe(3);
    });

    it('streak spans year boundary (Dec 31 → Jan 1)', async () => {
      const habit = await createTestHabit(database);
      await createTestLog(database, habit.id, '2025-12-30');
      await createTestLog(database, habit.id, '2025-12-31');
      await createTestLog(database, habit.id, '2026-01-01');

      const streak = await service.calculateStreak(habit.id, '2026-01-01');
      expect(streak).toBe(3);
    });

    it('does not count tombstoned days', async () => {
      const habit = await createTestHabit(database);
      await createTestLog(database, habit.id, '2026-03-05', true);
      await createTestLog(database, habit.id, '2026-03-06', true);
      await createTestLog(database, habit.id, '2026-03-07', true);

      // Tombstone the middle day via the service
      await service.toggleHabitCompletion(habit.id, '2026-03-06');

      const streak = await service.calculateStreak(habit.id, '2026-03-07');
      expect(streak).toBe(1);
    });
  });

  // ─── getLogsForHabit ───────────────────────────────────────────────

  describe('getLogsForHabit', () => {
    it('returns logs within the date range inclusive', async () => {
      const habit = await createTestHabit(database);
      await createTestLog(database, habit.id, '2026-03-01');
      await createTestLog(database, habit.id, '2026-03-03');
      await createTestLog(database, habit.id, '2026-03-05');
      await createTestLog(database, habit.id, '2026-03-07');

      const logs = await service.getLogsForHabit(
        habit.id,
        '2026-03-02',
        '2026-03-06',
      );
      expect(logs).toHaveLength(2);
      const dates = logs.map(l => l.completedDate).sort();
      expect(dates).toEqual(['2026-03-03', '2026-03-05']);
    });

    it('includes boundary dates', async () => {
      const habit = await createTestHabit(database);
      await createTestLog(database, habit.id, '2026-03-01');
      await createTestLog(database, habit.id, '2026-03-05');

      const logs = await service.getLogsForHabit(
        habit.id,
        '2026-03-01',
        '2026-03-05',
      );
      expect(logs).toHaveLength(2);
    });
  });

  // ─── getUnsyncedLogs ───────────────────────────────────────────────

  describe('getUnsyncedLogs', () => {
    it('returns only unsynced logs', async () => {
      const habit = await createTestHabit(database);
      await createTestLog(database, habit.id, '2026-03-01', false);
      await createTestLog(database, habit.id, '2026-03-02', true);
      await createTestLog(database, habit.id, '2026-03-03', false);

      const unsynced = await service.getUnsyncedLogs();
      expect(unsynced).toHaveLength(2);
      unsynced.forEach(log => expect(log.synced).toBe(false));
    });

    it('excludes logs that have hit the permanent-failure cap', async () => {
      const habit = await createTestHabit(database);
      const log1 = await createTestLog(database, habit.id, '2026-03-01', false);
      const log2 = await createTestLog(database, habit.id, '2026-03-02', false);

      // Simulate log1 hitting the retry cap (e.g. habit-not-found loop).
      await database.write(async () => {
        await log1.update(l => {
          l.retryCount = MAX_LOG_RETRIES;
          l.lastAttemptAt = Date.now() - 24 * 60 * 60 * 1000;
        });
      });

      const unsynced = await service.getUnsyncedLogs();
      expect(unsynced.map(l => l.id)).toEqual([log2.id]);
    });

    it('skips logs that are inside their exponential-backoff window', async () => {
      const habit = await createTestHabit(database);
      const fresh = await createTestLog(database, habit.id, '2026-03-01', false);
      const backoff = await createTestLog(database, habit.id, '2026-03-02', false);

      // backoff has retry_count=1 (1 minute backoff) and was just attempted.
      await database.write(async () => {
        await backoff.update(l => {
          l.retryCount = 1;
          l.lastAttemptAt = Date.now();
        });
      });

      const unsynced = await service.getUnsyncedLogs();
      expect(unsynced.map(l => l.id)).toEqual([fresh.id]);
    });

    it('includes logs whose backoff window has elapsed', async () => {
      const habit = await createTestHabit(database);
      const log = await createTestLog(database, habit.id, '2026-03-02', false);

      await database.write(async () => {
        await log.update(l => {
          l.retryCount = 1;
          // 10 minutes ago — well past the 1-minute backoff for retry_count=1.
          l.lastAttemptAt = Date.now() - 10 * 60 * 1000;
        });
      });

      const unsynced = await service.getUnsyncedLogs();
      expect(unsynced.map(l => l.id)).toEqual([log.id]);
    });
  });

  describe('markLogsRetryFailed', () => {
    it('increments retry_count and stamps last_attempt_at', async () => {
      const habit = await createTestHabit(database);
      const log = await createTestLog(database, habit.id, '2026-03-01', false);

      const before = Date.now();
      await service.markLogsRetryFailed([log]);
      const after = Date.now();

      const reloaded = await database.get<HabitLog>('habit_logs').find(log.id);
      expect(reloaded.retryCount).toBe(1);
      expect(reloaded.lastAttemptAt).not.toBeNull();
      expect(reloaded.lastAttemptAt!).toBeGreaterThanOrEqual(before);
      expect(reloaded.lastAttemptAt!).toBeLessThanOrEqual(after);
    });

    it('is a no-op for an empty batch', async () => {
      await expect(service.markLogsRetryFailed([])).resolves.toBeUndefined();
    });

    it('a log capped at MAX_LOG_RETRIES is no longer returned by getUnsyncedLogs', async () => {
      const habit = await createTestHabit(database);
      const log = await createTestLog(database, habit.id, '2026-03-01', false);

      for (let i = 0; i < MAX_LOG_RETRIES; i++) {
        await service.markLogsRetryFailed([log]);
      }

      const unsynced = await service.getUnsyncedLogs();
      expect(unsynced.map(l => l.id)).not.toContain(log.id);
    });

    it('observeUnsyncedCount also excludes capped logs', async () => {
      const habit = await createTestHabit(database, 'h', true);
      const log = await createTestLog(database, habit.id, '2026-03-01', false);
      await database.write(async () => {
        await log.update(l => {
          l.retryCount = MAX_LOG_RETRIES;
          l.lastAttemptAt = Date.now();
        });
      });

      const observable = service.observeUnsyncedCount();
      const count = await new Promise<number>(resolve => {
        const sub = observable.subscribe(v => {
          resolve(v);
          Promise.resolve().then(() => sub.unsubscribe());
        });
      });
      expect(count).toBe(0);
    });
  });

  describe('backoffMsFor', () => {
    it('returns 0 for retry_count=0', () => {
      expect(backoffMsFor(0)).toBe(0);
    });

    it('grows exponentially up to a cap', () => {
      expect(backoffMsFor(1)).toBe(60_000);
      expect(backoffMsFor(2)).toBe(120_000);
      expect(backoffMsFor(3)).toBe(240_000);
      // Cap at 6 hours.
      expect(backoffMsFor(100)).toBe(6 * 60 * 60 * 1000);
    });
  });

  describe('markHabitsSynced resets per-log retry state', () => {
    it('clears retry_count for unsynced logs of newly-synced habits', async () => {
      const habit = await createTestHabit(database, 'h', false);
      const log = await createTestLog(database, habit.id, '2026-03-01', false);
      await service.markLogsRetryFailed([log]);

      let reloaded = await database.get<HabitLog>('habit_logs').find(log.id);
      expect(reloaded.retryCount).toBe(1);

      await service.markHabitsSynced([habit]);

      reloaded = await database.get<HabitLog>('habit_logs').find(log.id);
      expect(reloaded.retryCount).toBe(0);
      expect(reloaded.lastAttemptAt).toBeNull();
    });

    it('does not touch logs of other habits', async () => {
      const habitA = await createTestHabit(database, 'A', false);
      const habitB = await createTestHabit(database, 'B', false);
      const logA = await createTestLog(database, habitA.id, '2026-03-01', false);
      const logB = await createTestLog(database, habitB.id, '2026-03-01', false);
      await service.markLogsRetryFailed([logA, logB]);

      await service.markHabitsSynced([habitA]);

      const reloadedA = await database.get<HabitLog>('habit_logs').find(logA.id);
      const reloadedB = await database.get<HabitLog>('habit_logs').find(logB.id);
      expect(reloadedA.retryCount).toBe(0);
      expect(reloadedB.retryCount).toBe(1);
    });
  });

  // ─── getUnsyncedHabits ─────────────────────────────────────────────

  describe('getUnsyncedHabits', () => {
    it('returns only unsynced habits', async () => {
      await createTestHabit(database, 'synced', true);
      await createTestHabit(database, 'unsynced', false);

      const unsynced = await service.getUnsyncedHabits();
      expect(unsynced).toHaveLength(1);
      expect(unsynced[0].name).toBe('unsynced');
    });

    it('returns newly-created habits before they are pushed', async () => {
      await service.createHabit('Brand new');
      const unsynced = await service.getUnsyncedHabits();
      expect(unsynced).toHaveLength(1);
      expect(unsynced[0].name).toBe('Brand new');
    });

    it('toggleHabitActive marks the habit unsynced', async () => {
      const habit = await createTestHabit(database, 'h', true);
      await service.toggleHabitActive(habit.id);
      const unsynced = await service.getUnsyncedHabits();
      expect(unsynced.map(h => h.id)).toContain(habit.id);
    });
  });

  // ─── markLogsSynced / markHabitsSynced ─────────────────────────────

  describe('markLogsSynced', () => {
    it('flips synced=true on every log in the batch', async () => {
      const habit = await createTestHabit(database, 'h', true);
      const log1 = await createTestLog(database, habit.id, '2025-01-01', false);
      const log2 = await createTestLog(database, habit.id, '2025-01-02', false);

      await service.markLogsSynced([log1, log2]);

      const remaining = await service.getUnsyncedLogs();
      expect(remaining).toHaveLength(0);
    });

    it('is a no-op for an empty batch', async () => {
      await expect(service.markLogsSynced([])).resolves.toBeUndefined();
    });

    it('only marks the logs that were passed in', async () => {
      const habit = await createTestHabit(database, 'h', true);
      const log1 = await createTestLog(database, habit.id, '2025-01-01', false);
      await createTestLog(database, habit.id, '2025-01-02', false);

      await service.markLogsSynced([log1]);

      const remaining = await service.getUnsyncedLogs();
      expect(remaining.map(l => l.completedDate)).toEqual(['2025-01-02']);
    });
  });

  describe('markHabitsSynced', () => {
    it('flips synced=true on every habit in the batch', async () => {
      const h1 = await createTestHabit(database, 'a', false);
      const h2 = await createTestHabit(database, 'b', false);

      await service.markHabitsSynced([h1, h2]);

      const remaining = await service.getUnsyncedHabits();
      expect(remaining).toHaveLength(0);
    });

    it('is a no-op for an empty batch', async () => {
      await expect(service.markHabitsSynced([])).resolves.toBeUndefined();
    });
  });

  // ─── observeUnsyncedCount ──────────────────────────────────────────

  describe('observeUnsyncedCount', () => {
    it('emits the combined count of unsynced logs and habits and reacts to changes', async () => {
      const habit = await createTestHabit(database, 'h', true);

      const observable = service.observeUnsyncedCount();
      const emissions: number[] = [];
      const sub = observable.subscribe(v => emissions.push(v));

      const waitForCount = (target: number) =>
        new Promise<void>((resolve, reject) => {
          const start = Date.now();
          const check = () => {
            if (emissions[emissions.length - 1] === target) {
              resolve();
            } else if (Date.now() - start > 2000) {
              reject(
                new Error(
                  `timeout waiting for count ${target}; emissions=${JSON.stringify(emissions)}`,
                ),
              );
            } else {
              setTimeout(check, 10);
            }
          };
          check();
        });

      await waitForCount(0);

      await createTestLog(database, habit.id, '2026-03-01', false);
      await waitForCount(1);

      await service.toggleHabitActive(habit.id);
      await waitForCount(2);

      sub.unsubscribe();
    });
  });

  // ─── getActiveHabits ───────────────────────────────────────────────

  describe('getActiveHabits', () => {
    it('returns an observable of active habits', async () => {
      await createTestHabit(database, 'Active Habit');
      const inactive = await createTestHabit(database, 'Inactive Habit');
      await inactive.markInactive();

      const observable = service.getActiveHabits();
      const habits = await new Promise<Habit[]>(resolve => {
        const sub = observable.subscribe(value => {
          resolve(value);
          // Defer unsubscribe to next microtask since WatermelonDB
          // emits synchronously before subscribe() returns
          Promise.resolve().then(() => sub.unsubscribe());
        });
      });

      expect(habits).toHaveLength(1);
      expect(habits[0].name).toBe('Active Habit');
    });
  });
});
