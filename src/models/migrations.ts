import {schemaMigrations, addColumns} from '@nozbe/watermelondb/Schema/migrations';

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
      ],
    },
  ],
});
