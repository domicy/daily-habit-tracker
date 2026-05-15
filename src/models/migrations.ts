import {
  schemaMigrations,
  addColumns,
} from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'habit_logs',
          columns: [{name: 'deleted_at', type: 'number', isOptional: true}],
        }),
      ],
    },
  ],
});
