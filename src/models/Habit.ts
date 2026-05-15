import {Model} from '@nozbe/watermelondb';
import {field, children, lazy, writer} from '@nozbe/watermelondb/decorators';
import type {Query} from '@nozbe/watermelondb';
import type HabitLog from './HabitLog';

export default class Habit extends Model {
  static table = 'habits';

  static associations = {
    habit_logs: {type: 'has_many' as const, foreignKey: 'habit_id'},
  };

  @field('name') name!: string;
  @field('created_at') createdAt!: number;
  @field('is_active') isActive!: boolean;
  @field('synced') synced!: boolean;

  @children('habit_logs') habitLogs!: Query<HabitLog>;

  @lazy logs = this.collections.get<HabitLog>('habit_logs').query();

  @writer async markInactive(): Promise<void> {
    await this.update(habit => {
      habit.isActive = false;
      habit.synced = false;
    });
  }

  @writer async markSynced(): Promise<void> {
    await this.update(habit => {
      habit.synced = true;
    });
  }
}
