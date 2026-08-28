/**
 * Coverage for the rating methods #118 added to HabitService.
 *
 * These live in their own file because they need `./api` mocked, while the main
 * HabitService suite deliberately runs against a real WatermelonDB and must not
 * pull the network client (or AsyncStorage) into the module graph.
 *
 * getHabitMetrics and getHeadToHeadLeaderboard are not covered here: they reach
 * the network through `await import('./api')`, and a dynamic import throws
 * under Jest's CommonJS VM ("A dynamic import callback was invoked without
 * --experimental-vm-modules"). Metro handles it natively, so this is a test
 * harness limitation, not a defect in those methods.
 */
import {Database} from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import {schema} from '../../models/schema';
import Habit from '../../models/Habit';
import HabitLog from '../../models/HabitLog';
import HabitService from '../../services/HabitService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {get: jest.fn()},
}));

function createTestDatabase(): Database {
  const adapter = new LokiJSAdapter({
    schema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  });
  return new Database({adapter, modelClasses: [Habit, HabitLog]});
}

describe('HabitService rating methods', () => {
  let database: Database;
  let service: HabitService;

  beforeEach(() => {
    database = createTestDatabase();
    service = new HabitService(database);
  });

  async function createHabit(): Promise<Habit> {
    return database.write(async () =>
      database.get<Habit>('habits').create(h => {
        h.userId = 'user';
        h.name = 'Read';
        h.createdAt = Date.now();
        h.isActive = true;
        h.synced = true;
        h.impact = 3;
        h.friction = 3;
        h.keystone = 3;
        h.timeCost = 3;
      }),
    );
  }

  describe('setHabitRatings', () => {
    it('persists the four ratings and marks the habit unsynced', async () => {
      const habit = await createHabit();

      await service.setHabitRatings(habit.id, {
        impact: 5,
        friction: 2,
        keystone: 4,
        timeCost: 1,
      });

      const updated = await database.get<Habit>('habits').find(habit.id);
      expect([updated.impact, updated.friction, updated.keystone, updated.timeCost])
        .toEqual([5, 2, 4, 1]);
      expect(updated.synced).toBe(false);
    });

    it.each([
      ['below the range', {impact: 0, friction: 3, keystone: 3, timeCost: 3}],
      ['above the range', {impact: 3, friction: 6, keystone: 3, timeCost: 3}],
      ['not an integer', {impact: 3, friction: 3, keystone: 2.5, timeCost: 3}],
    ])('rejects a rating %s', async (_label, ratings) => {
      const habit = await createHabit();

      await expect(service.setHabitRatings(habit.id, ratings)).rejects.toThrow(
        'Habit ratings must be integers from 1 to 5.',
      );

      // The habit is left untouched by a rejected update.
      const unchanged = await database.get<Habit>('habits').find(habit.id);
      expect(unchanged.impact).toBe(3);
      expect(unchanged.synced).toBe(true);
    });

    it('refuses to rate a habit belonging to another account', async () => {
      const habit = await createHabit();
      service.setUserId('11111111-1111-1111-1111-111111111111');

      await expect(
        service.setHabitRatings(habit.id, {
          impact: 5,
          friction: 5,
          keystone: 5,
          timeCost: 5,
        }),
      ).rejects.toThrow('Habit not found');
    });
  });

  describe('getHabitScore', () => {
    it('scores a habit from its ratings', async () => {
      const habit = await createHabit();

      expect(service.getHabitScore(habit)).toBeGreaterThan(0);
    });

    it('falls back to the neutral rating when a field is unset', async () => {
      const habit = await createHabit();
      const neutral = service.getHabitScore(habit);

      await database.write(async () => {
        await habit.update(h => {
          h.impact = 0;
          h.friction = 0;
          h.keystone = 0;
          h.timeCost = 0;
        });
      });

      // 0 is falsy, so each field defaults back to 3 -- same score as neutral.
      expect(service.getHabitScore(habit)).toBe(neutral);
    });
  });
});
