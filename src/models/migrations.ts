import {
  schemaMigrations,
  addColumns,
  unsafeExecuteSql,
} from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        // Existing habits predate the sync feature and have never been pushed
        // to the backend, so they must be marked unsynced so the next sync
        // pushes them before any of their logs.
        addColumns({
          table: 'habits',
          columns: [{name: 'synced', type: 'boolean', isIndexed: true}],
        }),
        addColumns({
          table: 'habit_logs',
          columns: [{name: 'deleted_at', type: 'number', isOptional: true}],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        // Per-log retry tracking. Existing rows default to retry_count=0 and
        // last_attempt_at=null, so they retry immediately on the next sync —
        // identical to the pre-migration behavior.
        addColumns({
          table: 'habit_logs',
          columns: [
            {name: 'retry_count', type: 'number', isIndexed: true},
            {name: 'last_attempt_at', type: 'number', isOptional: true},
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        // Per-habit notification opt-in and time. Existing rows get the
        // column-type defaults (false, ''), which the service/UI treats as
        // "no notification scheduled" — identical to pre-migration behavior.
        addColumns({
          table: 'habits',
          columns: [
            {name: 'notifications_enabled', type: 'boolean'},
            {name: 'notification_time', type: 'string'},
          ],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({table: 'habits', columns: [{name: 'user_id', type: 'string', isIndexed: true}]}),
        addColumns({table: 'habit_logs', columns: [{name: 'user_id', type: 'string', isIndexed: true}]}),
      ],
    },
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'habits',
          columns: [
            {name: 'impact', type: 'number'},
            {name: 'friction', type: 'number'},
            {name: 'keystone', type: 'number'},
            {name: 'time_cost', type: 'number'},
          ],
        }),
        unsafeExecuteSql(
          'UPDATE habits SET impact = 3, friction = 3, keystone = 3, time_cost = 3;',
        ),
      ],
    },
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: 'habits',
          columns: [{name: 'score', type: 'number', isOptional: true}],
        }),
        // Seed the column with the contract score derived from the ratings
        // already stored, so no habit shows a 0 between this migration and the
        // first pull that reconciles it against the server. SQLite `/` on
        // integers truncates, which is exactly the half-up rounding the
        // contract specifies once the +8 is applied
        // (docs/superpowers/specs/2026-08-26-habit-weights-scoring-contract.md).
        unsafeExecuteSql(
          'UPDATE habits SET score = (100 * (impact + (6 - friction) + keystone + (6 - time_cost) - 4) + 8) / 16;',
        ),
      ],
    },
  ],
});
