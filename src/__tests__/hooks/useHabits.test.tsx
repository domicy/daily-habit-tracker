import {renderHook, waitFor} from '@testing-library/react-native';
import {Database} from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import {schema} from '../../models/schema';
import Habit from '../../models/Habit';
import HabitLog from '../../models/HabitLog';
import HabitService from '../../services/HabitService';
import {useHabits} from '../../hooks/useHabits';

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

describe('useHabits', () => {
  it('updates from the WatermelonDB observable after creating a habit', async () => {
    const service = new HabitService(createTestDatabase());
    const {result} = renderHook(() => useHabits(service));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.habits).toEqual([]);

    await service.createHabit('Drink water');

    await waitFor(() => {
      expect(result.current.habits).toEqual([
        expect.objectContaining({
          name: 'Drink water',
          completedToday: false,
          streak: 0,
        }),
      ]);
    });
  });
});
