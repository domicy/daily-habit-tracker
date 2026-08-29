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
  @field('user_id') userId!: string;
  @field('created_at') createdAt!: number;
  @field('is_active') isActive!: boolean;
  @field('synced') synced!: boolean;
  @field('notifications_enabled') notificationsEnabled!: boolean;
  @field('notification_time') notificationTime!: string;
  @field('impact') impact!: number;
  @field('friction') friction!: number;
  @field('keystone') keystone!: number;
  @field('time_cost') timeCost!: number;
  // Server-authoritative score once `synced` is true; a locally derived
  // provisional value while there are unsynced rating edits. Null on a row
  // that predates the column and has not been pulled since.
  @field('score') score!: number | null;

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
