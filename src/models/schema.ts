import {appSchema, tableSchema} from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 7,
  tables: [
    tableSchema({
      name: 'habits',
      columns: [
        {name: 'name', type: 'string'},
        {name: 'user_id', type: 'string', isIndexed: true},
        {name: 'created_at', type: 'number'},
        {name: 'is_active', type: 'boolean'},
        {name: 'synced', type: 'boolean', isIndexed: true},
        // Per-habit notification preferences. Device-local only — never
        // included in the sync payload. notification_time is "HH:MM" to
        // match the AsyncStorage `reminder_time` format used by the global
        // reminder. Empty string = unset; service/UI falls back to "08:00".
        {name: 'notifications_enabled', type: 'boolean'},
        {name: 'notification_time', type: 'string'},
        {name: 'impact', type: 'number'},
        {name: 'friction', type: 'number'},
        {name: 'keystone', type: 'number'},
        {name: 'time_cost', type: 'number'},
        // Last score the server told us about, reconciled on every pull.
        // Provisional (locally derived) while `synced` is false — see
        // HabitService.getHabitScore / isScoreProvisional.
        //
        // Optional so "never written" reads as null: an unset number column
        // reads as 0, and 0 is a legitimate score (ratings 1/5/1/5), so
        // without this the two are indistinguishable.
        {name: 'score', type: 'number', isOptional: true},
      ],
    }),
    tableSchema({
      name: 'habit_logs',
      columns: [
        {name: 'habit_id', type: 'string', isIndexed: true},
        {name: 'user_id', type: 'string', isIndexed: true},
        // Stored as "YYYY-MM-DD" string to avoid timezone issues.
        // NOTE: The pair (habit_id, completed_date) should be treated as
        // logically unique among non-tombstoned rows. Enforce this in the
        // service layer since WatermelonDB does not support compound unique
        // constraints natively.
        {name: 'completed_date', type: 'string'},
        {name: 'synced', type: 'boolean', isIndexed: true},
        // Tombstone timestamp (ms). Null = active log; non-null = deleted.
        // Tombstones are kept locally until the deletion has been pushed
        // to the server, after which they remain as "synced deletions"
        // so that any concurrent revival can be detected and pushed.
        {name: 'deleted_at', type: 'number', isOptional: true},
        // Number of server-rejected sync attempts (per-log errors like
        // "Habit not found"). Indexed so the unsynced-logs query can filter
        // out dead-end rows at the SQL layer rather than scanning them
        // every cycle. Once it reaches MAX_LOG_RETRIES the row is treated
        // as permanently rejected and excluded from sync entirely.
        {name: 'retry_count', type: 'number', isIndexed: true},
        // Timestamp (ms) of the last server-rejected attempt. Used by the
        // service layer to apply exponential backoff between retries so
        // a transient per-log error doesn't get retried every minute.
        {name: 'last_attempt_at', type: 'number', isOptional: true},
      ],
    }),
  ],
});
