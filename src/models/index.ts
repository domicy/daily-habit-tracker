import {Database} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import {schema} from './schema';
import {migrations} from './migrations';
import Habit from './Habit';
import HabitLog from './HabitLog';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
});

const database = new Database({
  adapter,
  modelClasses: [Habit, HabitLog],
});

export default database;
export {Habit, HabitLog};
