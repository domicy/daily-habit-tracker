import {appSchema, tableSchema} from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'habits',
      columns: [
        {name: 'name', type: 'string'},
        {name: 'created_at', type: 'number'},
        {name: 'is_active', type: 'boolean'},
        {name: 'synced', type: 'boolean', isIndexed: true},
      ],
    }),
    tableSchema({
      name: 'habit_logs',
      columns: [
        {name: 'habit_id', type: 'string', isIndexed: true},
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
      ],
    }),
  ],
});
