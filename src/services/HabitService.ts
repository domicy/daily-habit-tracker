import {Q} from '@nozbe/watermelondb';
import type {Database} from '@nozbe/watermelondb';
import type {Observable} from 'rxjs';
import {subDays, format} from 'date-fns';
import type Habit from '../models/Habit';
import type HabitLog from '../models/HabitLog';

export default class HabitService {
  private database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  getActiveHabits(): Observable<Habit[]> {
    return this.database
      .get<Habit>('habits')
      .query(Q.where('is_active', true), Q.sortBy('created_at', Q.asc))
      .observe();
  }

  getAllHabits(): Observable<Habit[]> {
    return this.database
      .get<Habit>('habits')
      .query(Q.sortBy('created_at', Q.asc))
      .observe();
  }

  async toggleHabitActive(habitId: string): Promise<void> {
    const habit = await this.database.get<Habit>('habits').find(habitId);
    await this.database.write(async () => {
      await habit.update(h => {
        h.isActive = !h.isActive;
        h.synced = false;
      });
    });
  }

  async createHabit(name: string): Promise<Habit> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error('Habit name cannot be empty.');
    }
    if (trimmed.length > 50) {
      throw new Error(
        'Habit name must be 50 characters or fewer.',
      );
    }

    return this.database.write(async () => {
      return this.database.get<Habit>('habits').create(habit => {
        habit.name = trimmed;
        habit.createdAt = Date.now();
        habit.isActive = true;
        habit.synced = false;
      });
    });
  }

  async toggleHabitCompletion(
    habitId: string,
    date: string,
  ): Promise<void> {
    await this.database.write(async () => {
      const existing = await this.database
        .get<HabitLog>('habit_logs')
        .query(
          Q.where('habit_id', habitId),
          Q.where('completed_date', date),
        )
        .fetch();

      if (existing.length > 0) {
        await existing[0].destroyPermanently();
      } else {
        await this.database.get<HabitLog>('habit_logs').create(log => {
          log.habitId = habitId;
          log.completedDate = date;
          log.synced = false;
        });
      }
    });
  }

  async getHabitById(habitId: string): Promise<Habit> {
    return this.database.get<Habit>('habits').find(habitId);
  }

  async getLogsForHabit(
    habitId: string,
    startDate: string,
    endDate: string,
  ): Promise<HabitLog[]> {
    return this.database
      .get<HabitLog>('habit_logs')
      .query(
        Q.where('habit_id', habitId),
        Q.where('completed_date', Q.gte(startDate)),
        Q.where('completed_date', Q.lte(endDate)),
      )
      .fetch();
  }

  async getUnsyncedLogs(): Promise<HabitLog[]> {
    return this.database
      .get<HabitLog>('habit_logs')
      .query(Q.where('synced', false))
      .fetch();
  }

  async getUnsyncedHabits(): Promise<Habit[]> {
    return this.database
      .get<Habit>('habits')
      .query(Q.where('synced', false))
      .fetch();
  }

  async calculateStreak(
    habitId: string,
    asOfDate: string,
  ): Promise<number> {
    let streak = 0;
    let currentDate = asOfDate;

    // Only fetch logs within the last 400 days to bound the query size.
    // A streak longer than 400 days would be extremely rare, and this avoids
    // scanning thousands of historical rows for long-running habits.
    const cutoffDate = format(
      subDays(new Date(asOfDate + 'T00:00:00'), 400),
      'yyyy-MM-dd',
    );

    const logs = await this.database
      .get<HabitLog>('habit_logs')
      .query(
        Q.where('habit_id', habitId),
        Q.where('completed_date', Q.gte(cutoffDate)),
        Q.where('completed_date', Q.lte(asOfDate)),
      )
      .fetch();

    const dateSet = new Set(logs.map(log => log.completedDate));

    while (dateSet.has(currentDate)) {
      streak++;
      currentDate = format(
        subDays(new Date(currentDate + 'T00:00:00'), 1),
        'yyyy-MM-dd',
      );
    }

    return streak;
  }
}
