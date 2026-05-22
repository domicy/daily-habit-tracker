import HabitService from './HabitService';
import database from '../models';

let _instance: HabitService | undefined;

/**
 * Returns the process-wide default HabitService instance, constructing it
 * lazily on first use. Centralizing the singleton here keeps both the
 * HabitsProvider (in AppNavigator) and screen-level fallbacks pointing at
 * the same subscription owner, so production work still flows through a
 * single WatermelonDB subscription. Tests that inject a mock service via
 * props never trigger this path.
 */
export function getDefaultHabitService(): HabitService {
  if (!_instance) {
    _instance = new HabitService(database);
  }
  return _instance;
}
