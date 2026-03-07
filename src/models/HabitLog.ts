import {Model} from '@nozbe/watermelondb';
import {field, relation, writer} from '@nozbe/watermelondb/decorators';
import type {Relation} from '@nozbe/watermelondb';
import type Habit from './Habit';

// NOTE: The pair (habit_id, completed_date) should be treated as logically
// unique. Enforce this in the service layer since WatermelonDB does not
// support compound unique constraints natively.

export default class HabitLog extends Model {
  static table = 'habit_logs';

  static associations = {
    habits: {type: 'belongs_to' as const, key: 'habit_id'},
  };

  @field('habit_id') habitId!: string;
  // Plain string in "YYYY-MM-DD" format to avoid timezone issues.
  @field('completed_date') completedDate!: string;
  @field('synced') synced!: boolean;

  @relation('habits', 'habit_id') habit!: Relation<Habit>;

  @writer async markSynced(): Promise<void> {
    await this.update(log => {
      log.synced = true;
    });
  }
}
