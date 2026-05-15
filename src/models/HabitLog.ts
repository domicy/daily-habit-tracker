import {Model} from '@nozbe/watermelondb';
import {field, relation, writer} from '@nozbe/watermelondb/decorators';
import type {Relation} from '@nozbe/watermelondb';
import type Habit from './Habit';

// NOTE: The pair (habit_id, completed_date) is logically unique among
// non-tombstoned rows. Tombstones (deletedAt != null) are kept after a
// log is "uncompleted" so the deletion can be pushed to the server;
// without them, an offline un-toggle of a previously-synced day would
// leave the server permanently out of sync with the client.

export default class HabitLog extends Model {
  static table = 'habit_logs';

  static associations = {
    habits: {type: 'belongs_to' as const, key: 'habit_id'},
  };

  @field('habit_id') habitId!: string;
  // Plain string in "YYYY-MM-DD" format to avoid timezone issues.
  @field('completed_date') completedDate!: string;
  @field('synced') synced!: boolean;
  @field('deleted_at') deletedAt!: number | null;

  @relation('habits', 'habit_id') habit!: Relation<Habit>;

  @writer async markSynced(): Promise<void> {
    await this.update(log => {
      log.synced = true;
    });
  }
}
