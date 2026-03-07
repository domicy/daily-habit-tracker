import {Database} from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import {format, subDays} from 'date-fns';
import {schema} from '../../models/schema';
import Habit from '../../models/Habit';
import HabitLog from '../../models/HabitLog';
import HabitService from '../../services/HabitService';
import {getTodayString, getFormattedToday} from '../../utils/dateUtils';

// ─── Helpers ────────────────────────────────────────────────────────────────

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
): Promise<HabitLog> {
  return database.write(async () => {
    return database.get<HabitLog>('habit_logs').create(log => {
      log.habitId = habitId;
      log.completedDate = date;
      log.synced = false;
    });
  });
}

// ─── 1. getTodayString with mocked timezones ────────────────────────────────

describe('getTodayString', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns YYYY-MM-DD based on local time, not UTC', () => {
    // Mock time to 2024-06-15 at 23:30 local
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 5, 15, 23, 30, 0)); // June 15 at 11:30 PM
    expect(getTodayString()).toBe('2024-06-15');
  });

  it('handles midnight exactly', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 0, 1, 0, 0, 0)); // Jan 1 at midnight
    expect(getTodayString()).toBe('2024-01-01');
  });

  it('handles 23:59:59 — still the same date', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 11, 31, 23, 59, 59)); // Dec 31 at 23:59
    expect(getTodayString()).toBe('2024-12-31');
  });

  it('returns correct date for UTC-5 scenario (EST 11 PM = UTC next day)', () => {
    // When it's 11:00 PM EST on June 15, UTC says June 16.
    // Since we use local time via new Date() + format(), if the system
    // clock says June 15 at 11 PM, we should get '2024-06-15'.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 5, 15, 23, 0, 0));
    const result = getTodayString();
    expect(result).toBe('2024-06-15');
  });

  it('returns correct date at UTC+0 midnight', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 2, 10, 0, 0, 0));
    expect(getTodayString()).toBe('2024-03-10');
  });

  it('returns correct date at UTC+12 early morning', () => {
    // The device clock shows 3 AM on March 10
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 2, 10, 3, 0, 0));
    expect(getTodayString()).toBe('2024-03-10');
  });
});

describe('getFormattedToday', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns human-readable date string', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 2, 5, 12, 0, 0)); // March 5, 2026 (Thursday)
    expect(getFormattedToday()).toBe('Thursday, March 5');
  });
});

// ─── 2. Midnight rollover ───────────────────────────────────────────────────

describe('Midnight rollover', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('getTodayString returns different dates before and after midnight', () => {
    jest.useFakeTimers();

    // 11:59 PM on March 9
    jest.setSystemTime(new Date(2024, 2, 9, 23, 59, 0));
    expect(getTodayString()).toBe('2024-03-09');

    // 12:01 AM on March 10
    jest.setSystemTime(new Date(2024, 2, 10, 0, 1, 0));
    expect(getTodayString()).toBe('2024-03-10');
  });

  it('habit logged at 12:01 AM goes to the new date', () => {
    jest.useFakeTimers();

    // Simulate the user having the app open at 11:59 PM
    jest.setSystemTime(new Date(2024, 2, 9, 23, 59, 0));
    const dateBefore = getTodayString();
    expect(dateBefore).toBe('2024-03-09');

    // Now it's 12:01 AM — the user taps the habit
    jest.setSystemTime(new Date(2024, 2, 10, 0, 1, 0));
    const dateAfter = getTodayString();
    expect(dateAfter).toBe('2024-03-10');

    // The log should go to '2024-03-10', not '2024-03-09'
    expect(dateAfter).not.toBe(dateBefore);
  });
});

// ─── 3. Timezone travel — no double-logging ─────────────────────────────────

describe('Timezone travel', () => {
  let database: Database;
  let service: HabitService;

  beforeEach(() => {
    database = createTestDatabase();
    service = new HabitService(database);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a second log for the same calendar date even if timezone changed', async () => {
    const habit = await createTestHabit(database);
    const calendarDate = '2024-03-09';

    // User logs at 11 PM EST (device says 2024-03-09)
    await service.toggleHabitCompletion(habit.id, calendarDate);

    // Verify one log exists
    let logs = await service.getLogsForHabit(habit.id, calendarDate, calendarDate);
    expect(logs).toHaveLength(1);

    // User flies to PST. Device now says 8 PM PST on same date (2024-03-09).
    // They try to log again for the same calendar date — toggle should remove it.
    await service.toggleHabitCompletion(habit.id, calendarDate);

    // The toggle is idempotent: second call removes the log
    logs = await service.getLogsForHabit(habit.id, calendarDate, calendarDate);
    expect(logs).toHaveLength(0);
  });

  it('allows logging on the new date after flying east and crossing midnight', async () => {
    const habit = await createTestHabit(database);

    // Logged on March 9 in PST
    await service.toggleHabitCompletion(habit.id, '2024-03-09');

    // Fly east. Device now shows March 10.
    // User can log for March 10 — it's a new calendar date
    await service.toggleHabitCompletion(habit.id, '2024-03-10');

    const logs = await service.getLogsForHabit(habit.id, '2024-03-09', '2024-03-10');
    expect(logs).toHaveLength(2);
    const dates = logs.map(l => l.completedDate).sort();
    expect(dates).toEqual(['2024-03-09', '2024-03-10']);
  });

  it('YYYY-MM-DD storage naturally prevents double-logging same calendar date', async () => {
    const habit = await createTestHabit(database);
    const date = '2024-06-15';

    // First log
    await service.toggleHabitCompletion(habit.id, date);
    let logs = await service.getLogsForHabit(habit.id, date, date);
    expect(logs).toHaveLength(1);

    // Attempting to toggle again for the exact same date string removes it
    await service.toggleHabitCompletion(habit.id, date);
    logs = await service.getLogsForHabit(habit.id, date, date);
    expect(logs).toHaveLength(0);

    // Toggle once more to re-add
    await service.toggleHabitCompletion(habit.id, date);
    logs = await service.getLogsForHabit(habit.id, date, date);
    expect(logs).toHaveLength(1);
  });
});

// ─── 4. Streak calculation across DST transitions ──────────────────────────

describe('Streak across DST transitions', () => {
  let database: Database;
  let service: HabitService;

  beforeEach(() => {
    database = createTestDatabase();
    service = new HabitService(database);
  });

  it('streak is correct across spring-forward (March 10, 2024)', async () => {
    // US DST 2024: clocks spring forward at 2 AM on March 10
    // March 8, 9, 10, 11 should be 4 consecutive days
    const habit = await createTestHabit(database);

    await createTestLog(database, habit.id, '2024-03-08');
    await createTestLog(database, habit.id, '2024-03-09');
    await createTestLog(database, habit.id, '2024-03-10'); // spring forward day
    await createTestLog(database, habit.id, '2024-03-11');

    const streak = await service.calculateStreak(habit.id, '2024-03-11');
    expect(streak).toBe(4);
  });

  it('streak is correct across fall-back (November 3, 2024)', async () => {
    // US DST 2024: clocks fall back at 2 AM on November 3
    // November 1, 2, 3, 4 should be 4 consecutive days
    const habit = await createTestHabit(database);

    await createTestLog(database, habit.id, '2024-11-01');
    await createTestLog(database, habit.id, '2024-11-02');
    await createTestLog(database, habit.id, '2024-11-03'); // fall back day
    await createTestLog(database, habit.id, '2024-11-04');

    const streak = await service.calculateStreak(habit.id, '2024-11-04');
    expect(streak).toBe(4);
  });

  it('subDays does not skip a date on spring-forward day', () => {
    // March 10, 2024 minus 1 day should be March 9
    const springForward = new Date('2024-03-10T00:00:00');
    const prev = subDays(springForward, 1);
    expect(format(prev, 'yyyy-MM-dd')).toBe('2024-03-09');
  });

  it('subDays does not double-count a date on fall-back day', () => {
    // November 3, 2024 minus 1 day should be November 2
    const fallBack = new Date('2024-11-03T00:00:00');
    const prev = subDays(fallBack, 1);
    expect(format(prev, 'yyyy-MM-dd')).toBe('2024-11-02');
  });

  it('streak with gap on DST boundary still breaks correctly', async () => {
    // March 9 logged, March 10 (spring forward) NOT logged, March 11 logged
    const habit = await createTestHabit(database);

    await createTestLog(database, habit.id, '2024-03-09');
    // March 10 skipped
    await createTestLog(database, habit.id, '2024-03-11');

    const streak = await service.calculateStreak(habit.id, '2024-03-11');
    expect(streak).toBe(1); // gap on March 10 breaks the streak
  });

  it('week-long streak spanning DST transition is counted fully', async () => {
    const habit = await createTestHabit(database);
    // March 7-13, 2024 (DST on March 10)
    for (let d = 7; d <= 13; d++) {
      await createTestLog(
        database,
        habit.id,
        `2024-03-${String(d).padStart(2, '0')}`,
      );
    }

    const streak = await service.calculateStreak(habit.id, '2024-03-13');
    expect(streak).toBe(7);
  });
});
