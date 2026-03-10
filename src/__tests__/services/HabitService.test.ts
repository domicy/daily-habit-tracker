import {Database} from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import {schema} from '../../models/schema';
import Habit from '../../models/Habit';
import HabitLog from '../../models/HabitLog';
import HabitService from '../../services/HabitService';
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
): Promise<Habit> {
  return database.write(async () => {
    return database.get<Habit>('habits').create(h => {
      h.name = name;
      h.createdAt = Date.now();
      h.isActive = true;
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
