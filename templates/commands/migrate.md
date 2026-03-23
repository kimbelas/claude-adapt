# /migrate

Create, run, or roll back database migrations.

## Arguments
- `action` (required): `create` | `up` | `down` | `status` | `reset`
- `name` (optional, required for `create`): descriptive migration name in snake_case (e.g., `add_user_roles_table`)

## Steps

### `create`
1. Generate a new timestamped migration file: `{{migrationDir}}/YYYYMMDDHHMMSS_{{name}}.{{migrationExtension}}`
2. Scaffold the migration with `up` and `down` functions:
{{#if sqlMigrations}}
```sql
-- Up migration: {{name}}

-- Down migration: {{name}}
```
{{else}}
```typescript
export async function up(db: {{dbClientType}}): Promise<void> {
  // TODO: implement forward migration
}

export async function down(db: {{dbClientType}}): Promise<void> {
  // TODO: implement rollback migration
}
```
{{/if}}
3. Register the migration in the migration index if required by the framework

### `up`
1. Check current migration status: `{{migrateStatusCommand}}`
2. Run all pending migrations: `{{migrateUpCommand}}`
3. Verify the migration succeeded by checking the schema or migration log
4. Report which migrations were applied

### `down`
1. Show the most recently applied migration
2. Confirm the rollback target before proceeding
3. Roll back the last migration: `{{migrateDownCommand}}`
4. Verify the rollback succeeded
5. Report which migration was reverted

### `status`
1. Run: `{{migrateStatusCommand}}`
2. Display a table of all migrations and their applied/pending state

### `reset`
1. **WARNING**: This will drop all tables and re-run all migrations from scratch
2. Confirm the target environment is **not** production
3. Run: `{{migrateResetCommand}}`
4. Report final migration state

## Constraints
- Never run `reset` against a production database
- Always write a corresponding `down` migration — every `up` must be reversible
- Use transactions for multi-statement migrations where the database supports them
- Validate SQL syntax before executing (check for common errors like missing semicolons, typos in column types)
- Never modify an already-applied migration; create a new migration instead
{{#if supabase}}
- Ensure Row Level Security (RLS) policies are created for every new table
- Add appropriate RLS policies for `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations
{{/if}}
