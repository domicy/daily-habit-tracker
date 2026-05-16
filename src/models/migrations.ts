import {
  schemaMigrations,
  addColumns,
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
  ],
});
