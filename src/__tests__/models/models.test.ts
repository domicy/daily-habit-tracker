import {Database} from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import {schema} from '../../models/schema';
import {migrations} from '../../models/migrations';
import Habit from '../../models/Habit';
import HabitLog from '../../models/HabitLog';
import {calculateHabitScore} from '../../utils/habitScoring';

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

// ─── Schema v7: the score column (#115) ──────────────────────────────

describe('habits schema v7', () => {
  const habitColumns = schema.tables.habits.columns;

  it('is at version 7 and the migrations reach it', () => {
    expect(schema.version).toBe(7);
    const versions = migrations.sortedMigrations.map(m => m.toVersion);
    expect(versions).toContain(7);
    // A schema version with no migration bricks every existing install.
    expect(Math.max(...versions)).toBe(schema.version);
  });

  it('stores score as an optional number', () => {
    // Optional so an unwritten column reads as null. A non-optional number
    // column reads as 0, and 0 is a legitimate score (ratings 1/5/1/5), so
    // "never synced" and "genuinely zero" would be indistinguishable.
    expect(habitColumns.score).toEqual({
      name: 'score',
      type: 'number',
      isOptional: true,
    });
  });

  it('backfills score with the same arithmetic as calculateHabitScore', () => {
    const step = migrations.sortedMigrations
      .find(m => m.toVersion === 7)!
      .steps.find(
        (st): st is {type: 'sql'; sql: string} =>
          (st as {type: string}).type === 'sql',
      );
    expect(step).toBeDefined();

    // The exact expression the migration runs. Pinned as a string so an edit
    // to the SQL has to come with an edit to the equivalence check below.
    const expression =
      '(100 * (impact + (6 - friction) + keystone + (6 - time_cost) - 4) + 8) / 16';
    expect(step!.sql).toContain(expression);

    // SQLite integer division truncates toward zero, and the numerator is
    // always non-negative for ratings in 1-5, so it matches Math.floor.
    const sqlite = (
      impact: number,
      friction: number,
      keystone: number,
      timeCost: number,
    ) =>
      Math.trunc(
        (100 * (impact + (6 - friction) + keystone + (6 - timeCost) - 4) + 8) / 16,
      );

    for (let impact = 1; impact <= 5; impact++) {
      for (let friction = 1; friction <= 5; friction++) {
        for (let keystone = 1; keystone <= 5; keystone++) {
          for (let timeCost = 1; timeCost <= 5; timeCost++) {
            expect(sqlite(impact, friction, keystone, timeCost)).toBe(
              calculateHabitScore(impact, friction, keystone, timeCost),
            );
          }
        }
      }
    }
  });
});
