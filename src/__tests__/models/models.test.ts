import {Database} from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import {schema} from '../../models/schema';
import Habit from '../../models/Habit';
import HabitLog from '../../models/HabitLog';

function createTestDatabase(): Database {
  const adapter = new LokiJSAdapter({schema, useWebWorker: false, useIncrementalIndexedDB: false});
  return new Database({
    adapter,
    modelClasses: [Habit, HabitLog],
  });
}

describe('Habit model', () => {
  let database: Database;

  beforeEach(() => {
    database = createTestDatabase();
  });

  it('can be created with default is_active = true', async () => {
    const habit = await database.write(async () => {
      return database.get<Habit>('habits').create(h => {
        h.name = 'Exercise';
        h.createdAt = Date.now();
        h.isActive = true;
      });
    });

    expect(habit.name).toBe('Exercise');
    expect(habit.isActive).toBe(true);
  });

  it('markInactive sets is_active to false', async () => {
    const habit = await database.write(async () => {
      return database.get<Habit>('habits').create(h => {
        h.name = 'Read';
        h.createdAt = Date.now();
        h.isActive = true;
      });
    });

    expect(habit.isActive).toBe(true);

    await habit.markInactive();

    expect(habit.isActive).toBe(false);
  });
});

describe('HabitLog model', () => {
  let database: Database;

  beforeEach(() => {
    database = createTestDatabase();
  });

  it('can be created linked to a Habit', async () => {
    const {habit, log} = await database.write(async () => {
      const h = await database.get<Habit>('habits').create(rec => {
        rec.name = 'Meditate';
        rec.createdAt = Date.now();
        rec.isActive = true;
      });

      const l = await database.get<HabitLog>('habit_logs').create(rec => {
        rec.habitId = h.id;
        rec.completedDate = '2026-03-07';
        rec.synced = false;
      });

      return {habit: h, log: l};
    });

    expect(log.habitId).toBe(habit.id);
    expect(log.completedDate).toBe('2026-03-07');
    expect(log.synced).toBe(false);
  });

  it('markSynced sets synced to true', async () => {
    const log = await database.write(async () => {
      const h = await database.get<Habit>('habits').create(rec => {
        rec.name = 'Journal';
        rec.createdAt = Date.now();
        rec.isActive = true;
      });

      return database.get<HabitLog>('habit_logs').create(rec => {
        rec.habitId = h.id;
        rec.completedDate = '2026-03-07';
        rec.synced = false;
      });
    });

    expect(log.synced).toBe(false);

    await log.markSynced();

    expect(log.synced).toBe(true);
  });
});
