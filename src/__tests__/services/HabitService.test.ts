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

// Ownership is explicit in these helpers. The default matches HabitService's
// own starting userId, so tests that don't care about accounts read as before;
// the multi-account tests pass a real id.
const DEFAULT_OWNER = 'user';

async function createTestHabit(
  database: Database,
  name: string = 'Exercise',
  synced: boolean = true,
  owner: string = DEFAULT_OWNER,
): Promise<Habit> {
  return database.write(async () => {
    return database.get<Habit>('habits').create(h => {
      h.userId = owner;
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
  owner: string = DEFAULT_OWNER,
): Promise<HabitLog> {
  return database.write(async () => {
    return database.get<HabitLog>('habit_logs').create(log => {
      log.userId = owner;
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

    it('returns 1 if today is not logged but yesterday was', async () => {
      const habit = await createTestHabit(database);
      const today = '2026-03-07';
      const yesterday = '2026-03-06';

      await createTestLog(database, habit.id, yesterday);

      const streak = await service.calculateStreak(habit.id, today);
      expect(streak).toBe(1);
    });

    it('returns N for an N-day streak ending yesterday when today is not yet logged', async () => {
      const habit = await createTestHabit(database);
      await createTestLog(database, habit.id, '2026-03-03');
      await createTestLog(database, habit.id, '2026-03-04');
      await createTestLog(database, habit.id, '2026-03-05');
      await createTestLog(database, habit.id, '2026-03-06'); // yesterday
      // today (2026-03-07) deliberately not logged

      const streak = await service.calculateStreak(habit.id, '2026-03-07');
      expect(streak).toBe(4);
    });

    it('returns 0 when neither today nor yesterday is logged', async () => {
      const habit = await createTestHabit(database);
      // Older log exists, but the streak is broken by the missing yesterday
      await createTestLog(database, habit.id, '2026-03-04');

      const streak = await service.calculateStreak(habit.id, '2026-03-07');
      expect(streak).toBe(0);
    });

    it('handles 100 consecutive days under 50ms', async () => {
      const habit = await createTestHabit(database);
      const today = new Date('2026-03-07T00:00:00');

      // Batch-create 100 logs
      await database.write(async () => {
        for (let i = 0; i < 100; i++) {
          await database.get<HabitLog>('habit_logs').create(log => {
            log.userId = DEFAULT_OWNER;
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

    it('does not fetch logs older than the 400-day cutoff', async () => {
      const habit = await createTestHabit(database);
      const today = new Date('2026-03-07T00:00:00');

      // An unbroken run reaching further back than the cutoff. The query is
      // bounded at asOf - 400, so the walk can only reach that day: 401 days
      // inclusive. Without the bound it would run the full 411.
      await database.write(async () => {
        for (let i = 0; i < 411; i++) {
          await database.get<HabitLog>('habit_logs').create(log => {
            log.userId = DEFAULT_OWNER;
            log.habitId = habit.id;
            log.completedDate = formatDate(subDays(today, i));
            log.synced = false;
          });
        }
      });

      const streak = await service.calculateStreak(
        habit.id,
        formatDate(today),
      );

      expect(streak).toBe(401);
    });
  });

  // ─── Multi-account isolation (#123) ────────────────────────────────

  describe('account isolation', () => {
    const ALICE = '11111111-1111-1111-1111-111111111111';
    const BOB = '22222222-2222-2222-2222-222222222222';

    it('does not show one account the other account habits', async () => {
      await createTestHabit(database, 'Alice habit', true, ALICE);
      await createTestHabit(database, 'Bob habit', true, BOB);

      service.setUserId(BOB);
      const habits = await new Promise<Habit[]>(resolve => {
        const sub = service.getAllHabits().subscribe(list => {
          resolve(list);
          setTimeout(() => sub.unsubscribe(), 0);
        });
      });

      expect(habits.map(h => h.name)).toEqual(['Bob habit']);
    });

    it('does not show one account the other account logs', async () => {
      const aliceHabit = await createTestHabit(database, 'Alice habit', true, ALICE);
      await createTestLog(database, aliceHabit.id, '2026-03-07', true, ALICE);

      service.setUserId(BOB);

      expect(
        await service.getLogsForHabit(aliceHabit.id, '2026-01-01', '2026-12-31'),
      ).toEqual([]);
      // The habit itself is not reachable either, so Bob cannot edit it.
      await expect(service.getHabitById(aliceHabit.id)).rejects.toThrow('Habit not found');
    });

    it('counts only the signed-in account unsynced rows', async () => {
      await createTestHabit(database, 'Alice unsynced', false, ALICE);
      const bobHabit = await createTestHabit(database, 'Bob unsynced', false, BOB);
      await createTestLog(database, bobHabit.id, '2026-03-07', false, BOB);

      service.setUserId(BOB);
      const count = await new Promise<number>(resolve => {
        const sub = service.observeUnsyncedCount().subscribe(value => {
          resolve(value);
          setTimeout(() => sub.unsubscribe(), 0);
        });
      });

      // Bob's habit + Bob's log, and none of Alice's.
      expect(count).toBe(2);
    });

    it('does not let a pulled log collide with another account row', async () => {
      const aliceHabit = await createTestHabit(database, 'Alice habit', true, ALICE);
      const aliceLog = await createTestLog(database, aliceHabit.id, '2026-03-07', true, ALICE);

      service.setUserId(BOB);
      await service.applyPulledLogs([
        {id: aliceLog.id, habit_id: aliceHabit.id, completed_date: '2026-03-07'},
      ]);

      const row = await database.get<HabitLog>('habit_logs').find(aliceLog.id);
      expect(row.userId).toBe(ALICE);
    });

    it('does not let a pulled habit overwrite another account row', async () => {
      const aliceHabit = await createTestHabit(database, 'Alice habit', true, ALICE);

      service.setUserId(BOB);
      await service.applyPulledHabits([
        {
          id: aliceHabit.id,
          name: 'Bob version',
          created_at: new Date().toISOString(),
          is_active: true,
          impact: 5,
          friction: 1,
          keystone: 5,
          time_cost: 1,
        },
      ]);

      const alicesRow = await database.get<Habit>('habits').find(aliceHabit.id);
      expect(alicesRow.name).toBe('Alice habit');
      expect(alicesRow.userId).toBe(ALICE);
    });

    // ─── Score reconciliation (#115) ─────────────────────────────────

    it('stores the score the server computed rather than discarding it', async () => {
      await service.applyPulledHabits([
        {
          id: 'remote-1',
          name: 'Remote habit',
          created_at: new Date().toISOString(),
          is_active: true,
          impact: 4,
          friction: 2,
          keystone: 3,
          time_cost: 4,
          score: 56,
        },
      ]);

      const row = await database.get<Habit>('habits').find('remote-1');
      expect(row.score).toBe(56);
      expect(row.synced).toBe(true);
      expect(service.getHabitScore(row)).toBe(56);
      expect(service.isScoreProvisional(row)).toBe(false);
    });

    it('reconciles an existing synced habit to the server score', async () => {
      const habit = await createTestHabit(database, 'Exercise', true);
      await database.write(async () => {
        await habit.update(h => {
          h.impact = 3;
          h.friction = 3;
          h.keystone = 3;
          h.timeCost = 3;
          h.score = 50;
        });
      });

      await service.applyPulledHabits([
        {
          id: habit.id,
          name: 'Exercise',
          created_at: new Date().toISOString(),
          is_active: true,
          impact: 5,
          friction: 1,
          keystone: 5,
          time_cost: 1,
          score: 100,
        },
      ]);

      const row = await database.get<Habit>('habits').find(habit.id);
      expect(row.score).toBe(100);
    });

    it('derives the score when the server omits it', async () => {
      await service.applyPulledHabits([
        {
          id: 'remote-2',
          name: 'Legacy server',
          created_at: new Date().toISOString(),
          is_active: true,
          impact: 4,
          friction: 2,
          keystone: 3,
          time_cost: 4,
        },
      ]);

      const row = await database.get<Habit>('habits').find('remote-2');
      // Identical formula to the server's, so the fallback is the same number.
      expect(row.score).toBe(56);
    });

    it('leaves a locally edited habit alone, server score included', async () => {
      const habit = await createTestHabit(database, 'Exercise', true);
      await service.setHabitRatings(habit.id, {
        impact: 5,
        friction: 1,
        keystone: 5,
        timeCost: 1,
      });

      await service.applyPulledHabits([
        {
          id: habit.id,
          name: 'Server name',
          created_at: new Date().toISOString(),
          is_active: true,
          impact: 1,
          friction: 5,
          keystone: 1,
          time_cost: 5,
          score: 0,
        },
      ]);

      const row = await database.get<Habit>('habits').find(habit.id);
      expect(row.name).toBe('Exercise');
      expect(row.impact).toBe(5);
      expect(row.score).toBe(100);
      expect(row.synced).toBe(false);
      expect(service.isScoreProvisional(row)).toBe(true);
    });
  });

  // ─── Legacy row claiming (#123) ────────────────────────────────────

  describe('claimLegacyRows', () => {
    const ALICE = '11111111-1111-1111-1111-111111111111';
    const BOB = '22222222-2222-2222-2222-222222222222';

    it('adopts rows left unowned by the schema v5 migration', async () => {
      const habit = await createTestHabit(database, 'Legacy habit', true, '');
      await createTestLog(database, habit.id, '2026-03-07', true, '');

      const claimed = await service.claimLegacyRows(ALICE);

      expect(claimed).toBe(2);
      service.setUserId(ALICE);
      expect(await service.getHabitById(habit.id)).toBeTruthy();
      expect(
        await service.getLogsForHabit(habit.id, '2026-01-01', '2026-12-31'),
      ).toHaveLength(1);
    });

    it('adopts rows written under the pre-login placeholder owner', async () => {
      const habit = await createTestHabit(database, 'Placeholder habit', true, 'user');

      expect(await service.claimLegacyRows(ALICE)).toBe(1);

      const claimedRow = await database.get<Habit>('habits').find(habit.id);
      expect(claimedRow.userId).toBe(ALICE);
    });

    it('leaves a second account nothing to claim', async () => {
      const habit = await createTestHabit(database, 'Legacy habit', true, '');
      await service.claimLegacyRows(ALICE);

      expect(await service.claimLegacyRows(BOB)).toBe(0);

      // The rows stayed with the account that claimed them.
      const row = await database.get<Habit>('habits').find(habit.id);
      expect(row.userId).toBe(ALICE);
      service.setUserId(BOB);
      await expect(service.getHabitById(habit.id)).rejects.toThrow('Habit not found');
    });

    it('does not touch rows already owned by a real account', async () => {
      const habit = await createTestHabit(database, 'Alice habit', true, ALICE);

      expect(await service.claimLegacyRows(BOB)).toBe(0);

      const row = await database.get<Habit>('habits').find(habit.id);
      expect(row.userId).toBe(ALICE);
    });

    it('is a no-op when there is nothing to claim', async () => {
      expect(await service.claimLegacyRows(ALICE)).toBe(0);
    });

    it('ignores an empty user id rather than claiming rows for nobody', async () => {
      await createTestHabit(database, 'Legacy habit', true, '');

      expect(await service.claimLegacyRows('')).toBe(0);
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

    // ─── In-flight edits must not be lost (#115) ───────────────────

    it('leaves a habit dirty when its ratings changed after the push started', async () => {
      const habit = await createTestHabit(database, 'Exercise', false);
      await service.setHabitRatings(habit.id, {
        impact: 3,
        friction: 3,
        keystone: 3,
        timeCost: 3,
      });

      // What SyncService put on the wire.
      const pushed = new Map([
        [
          habit.id,
          {
            name: 'Exercise',
            is_active: true,
            impact: 3,
            friction: 3,
            keystone: 3,
            time_cost: 3,
          },
        ],
      ]);

      // The user edits while the request is still in flight.
      await service.setHabitRatings(habit.id, {
        impact: 5,
        friction: 1,
        keystone: 5,
        timeCost: 1,
      });

      await service.markHabitsSynced([habit], pushed);

      const row = await database.get<Habit>('habits').find(habit.id);
      // Clearing it here would strand the newer ratings: they were never sent.
      expect(row.synced).toBe(false);
      expect(row.impact).toBe(5);
      expect(await service.getUnsyncedHabits()).toHaveLength(1);
    });

    it('marks a habit synced when it still matches what was pushed', async () => {
      const habit = await createTestHabit(database, 'Exercise', false);
      await service.setHabitRatings(habit.id, {
        impact: 4,
        friction: 2,
        keystone: 3,
        timeCost: 4,
      });

      const pushed = new Map([
        [
          habit.id,
          {
            name: 'Exercise',
            is_active: true,
            impact: 4,
            friction: 2,
            keystone: 3,
            time_cost: 4,
          },
        ],
      ]);

      await service.markHabitsSynced([habit], pushed);

      const row = await database.get<Habit>('habits').find(habit.id);
      expect(row.synced).toBe(true);
      expect(await service.getUnsyncedHabits()).toHaveLength(0);
    });

    it('holds back only the habits that moved', async () => {
      const stable = await createTestHabit(database, 'Stable', false);
      const edited = await createTestHabit(database, 'Edited', false);
      const fields = (name: string) => ({
        name,
        is_active: true,
        impact: 3,
        friction: 3,
        keystone: 3,
        time_cost: 3,
      });
      for (const h of [stable, edited]) {
        await service.setHabitRatings(h.id, {
          impact: 3,
          friction: 3,
          keystone: 3,
          timeCost: 3,
        });
      }
      const pushed = new Map([
        [stable.id, fields('Stable')],
        [edited.id, fields('Edited')],
      ]);

      await service.setHabitRatings(edited.id, {
        impact: 1,
        friction: 1,
        keystone: 1,
        timeCost: 1,
      });

      await service.markHabitsSynced([stable, edited], pushed);

      expect((await database.get<Habit>('habits').find(stable.id)).synced).toBe(true);
      expect((await database.get<Habit>('habits').find(edited.id)).synced).toBe(false);
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

  describe('getAllHabits', () => {
    it('re-emits when a habit\'s is_active, notifications_enabled, or notification_time changes', async () => {
      const habit = await createTestHabit(database, 'Hydrate', true);

      const emissions: number[] = [];
      const sub = service.getAllHabits().subscribe(habits => {
        emissions.push(habits.length);
      });

      // Initial emission lands synchronously.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const initialEmissionCount = emissions.length;
      expect(initialEmissionCount).toBeGreaterThan(0);

      // is_active mutation must reach the observable. Plain .observe() would
      // not fire here, leaving the Settings list visually stuck.
      await service.toggleHabitActive(habit.id);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(emissions.length).toBeGreaterThan(initialEmissionCount);

      const afterActive = emissions.length;

      // notifications_enabled + notification_time mutation must also fire.
      await service.setHabitNotification(habit.id, true, '07:30');
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(emissions.length).toBeGreaterThan(afterActive);

      sub.unsubscribe();
    });
  });

  describe('per-habit notifications', () => {
    it('createHabit sets sane defaults for the new notification fields', async () => {
      const habit = await service.createHabit('Stretch');
      expect(habit.notificationsEnabled).toBe(false);
      expect(habit.notificationTime).toBe('08:00');
    });

    it('setHabitNotification updates the row but does NOT flip synced=false', async () => {
      // Start from a synced habit so we can verify the synced bit is preserved.
      const habit = await createTestHabit(database, 'Water', true);
      await service.setHabitNotification(habit.id, true, '07:30');

      const updated = await service.getHabitById(habit.id);
      expect(updated.notificationsEnabled).toBe(true);
      expect(updated.notificationTime).toBe('07:30');
      // Critical: notification prefs are device-local and must NOT enter the
      // sync queue. Flipping synced=false would push them to the server.
      expect(updated.synced).toBe(true);
    });

    it('getHabitsWithNotifications returns only active habits that opted in', async () => {
      const enabledActive = await createTestHabit(database, 'A');
      await service.setHabitNotification(enabledActive.id, true, '08:00');

      // 'B' is left at the default (notifications_enabled=false) — created
      // for its side effect of populating the table, no handle needed.
      await createTestHabit(database, 'B');

      const enabledInactive = await createTestHabit(database, 'C');
      await service.setHabitNotification(enabledInactive.id, true, '09:00');
      await enabledInactive.markInactive();

      const result = await service.getHabitsWithNotifications();
      expect(result.map(h => h.name).sort()).toEqual(['A']);
      // disabledActive excluded by notifications_enabled=false
      // enabledInactive excluded by is_active=false
      expect(result.find(h => h.name === 'B')).toBeUndefined();
      expect(result.find(h => h.name === 'C')).toBeUndefined();
    });

    it('observeUnsyncedCount is unaffected by toggling per-habit notifications', async () => {
      const habit = await createTestHabit(database, 'Walk', true);

      const initial = await new Promise<number>(resolve => {
        const sub = service.observeUnsyncedCount().subscribe(v => {
          resolve(v);
          Promise.resolve().then(() => sub.unsubscribe());
        });
      });

      await service.setHabitNotification(habit.id, true, '06:30');

      const after = await new Promise<number>(resolve => {
        const sub = service.observeUnsyncedCount().subscribe(v => {
          resolve(v);
          Promise.resolve().then(() => sub.unsubscribe());
        });
      });

      expect(after).toBe(initial);
    });
  });
});
