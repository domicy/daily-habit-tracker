import {Q} from '@nozbe/watermelondb';
import type {Database} from '@nozbe/watermelondb';
import {combineLatest, type Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {subDays, format} from 'date-fns';
import type Habit from '../models/Habit';
import type HabitLog from '../models/HabitLog';

// After this many server-rejected attempts a log is treated as permanently
// dead and excluded from the sync queue. Prevents per-log failures like
// "Habit not found" from forcing a growing full-table scan on every sync.
export const MAX_LOG_RETRIES = 10;

// Exponential backoff between server-rejected retries: 1m, 2m, 4m, ...
// capped at 6 hours. Multiplied against retry_count so a single per-log
// error doesn't get retried every minute alongside healthy traffic.
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;

export function backoffMsFor(retryCount: number): number {
  if (retryCount <= 0) {
    return 0;
  }
  const exp = Math.min(retryCount - 1, 30);
  return Math.min(BACKOFF_BASE_MS * 2 ** exp, BACKOFF_CAP_MS);
}

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

      const active = existing.find(l => l.deletedAt == null);
      if (active) {
        if (active.synced) {
          // Server has this log — leave a tombstone so the deletion gets
          // pushed on the next sync. Without this, an offline un-toggle
          // would silently desync from the server forever.
          await active.update(log => {
            log.deletedAt = Date.now();
            log.synced = false;
            // Fresh user action — clear prior retry backoff so the deletion
            // is attempted on the very next sync.
            log.retryCount = 0;
            log.lastAttemptAt = null;
          });
        } else {
          // Never reached the server — safe to drop the row entirely.
          await active.destroyPermanently();
        }
        return;
      }

      const tombstone = existing.find(l => l.deletedAt != null);
      if (tombstone) {
        // Re-toggling on a previously-deleted day: revive the row and
        // mark it for re-sync so the server clears its deleted_at.
        await tombstone.update(log => {
          log.deletedAt = null;
          log.synced = false;
          log.retryCount = 0;
          log.lastAttemptAt = null;
        });
        return;
      }

      await this.database.get<HabitLog>('habit_logs').create(log => {
        log.habitId = habitId;
        log.completedDate = date;
        log.synced = false;
        log.deletedAt = null;
        log.retryCount = 0;
        log.lastAttemptAt = null;
      });
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
        Q.where('deleted_at', null),
      )
      .fetch();
  }

  async getUnsyncedLogs(): Promise<HabitLog[]> {
    // SQL-level filter: skip logs that have hit the permanent-failure cap.
    // Without this, dead-end logs (e.g. ones whose habit doesn't exist on
    // the server) get rescanned on every sync, growing the work per cycle
    // without bound.
    const eligible = await this.database
      .get<HabitLog>('habit_logs')
      .query(
        Q.where('synced', false),
        Q.where('retry_count', Q.lt(MAX_LOG_RETRIES)),
      )
      .fetch();

    // Application-level filter: enforce exponential backoff between
    // server-rejected attempts. Logs in backoff stay in the table but are
    // skipped this cycle.
    const now = Date.now();
    return eligible.filter(log => {
      if (log.retryCount === 0 || log.lastAttemptAt == null) {
        return true;
      }
      return now - log.lastAttemptAt >= backoffMsFor(log.retryCount);
    });
  }

  async getUnsyncedHabits(): Promise<Habit[]> {
    return this.database
      .get<Habit>('habits')
      .query(Q.where('synced', false))
      .fetch();
  }

  async markLogsSynced(logs: HabitLog[]): Promise<void> {
    if (logs.length === 0) {
      return;
    }
    await this.database.write(async () => {
      await this.database.batch(
        ...logs.map(log =>
          log.prepareUpdate(l => {
            l.synced = true;
            // Clear retry tracking so a future tombstone/revive on this
            // row starts from a clean slate.
            l.retryCount = 0;
            l.lastAttemptAt = null;
          }),
        ),
      );
    });
  }

  // Called when the server returned per-log errors (e.g. "Habit not found").
  // Records the rejection so getUnsyncedLogs can apply backoff and so logs
  // that hit MAX_LOG_RETRIES are excluded from future scans entirely.
  async markLogsRetryFailed(logs: HabitLog[]): Promise<void> {
    if (logs.length === 0) {
      return;
    }
    const now = Date.now();
    await this.database.write(async () => {
      await this.database.batch(
        ...logs.map(log =>
          log.prepareUpdate(l => {
            l.retryCount = (l.retryCount ?? 0) + 1;
            l.lastAttemptAt = now;
          }),
        ),
      );
    });
  }

  async markHabitsSynced(habits: Habit[]): Promise<void> {
    if (habits.length === 0) {
      return;
    }
    const habitIds = habits.map(h => h.id);
    await this.database.write(async () => {
      await this.database.batch(
        ...habits.map(habit =>
          habit.prepareUpdate(h => {
            h.synced = true;
          }),
        ),
      );
    });

    // The most common cause of per-log "Habit not found" is that the habit
    // hadn't been pushed yet. Now that the habit is on the server, give its
    // backlog of logs a fresh chance — reset retry tracking so they aren't
    // stuck in backoff (or worse, capped out) when they would now succeed.
    if (habitIds.length > 0) {
      const candidates = await this.database
        .get<HabitLog>('habit_logs')
        .query(
          Q.where('habit_id', Q.oneOf(habitIds)),
          Q.where('synced', false),
          Q.where('retry_count', Q.gt(0)),
        )
        .fetch();
      if (candidates.length > 0) {
        await this.database.write(async () => {
          await this.database.batch(
            ...candidates.map(log =>
              log.prepareUpdate(l => {
                l.retryCount = 0;
                l.lastAttemptAt = null;
              }),
            ),
          );
        });
      }
    }
  }

  observeUnsyncedCount(): Observable<number> {
    // Match getUnsyncedLogs: exclude rows past the permanent-failure cap so
    // the UI doesn't show a forever-growing "N pending" for dead-end logs.
    const logs$ = this.database
      .get<HabitLog>('habit_logs')
      .query(
        Q.where('synced', false),
        Q.where('retry_count', Q.lt(MAX_LOG_RETRIES)),
      )
      .observe();
    const habits$ = this.database
      .get<Habit>('habits')
      .query(Q.where('synced', false))
      .observe();
    return combineLatest([logs$, habits$]).pipe(
      map(([logs, habits]) => logs.length + habits.length),
    );
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
        Q.where('deleted_at', null),
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
