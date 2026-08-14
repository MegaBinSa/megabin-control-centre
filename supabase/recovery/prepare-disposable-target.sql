-- Destructive by design: run only after the approved recovery-contract guard.
truncate table auth.users cascade;
drop schema if exists api cascade;
drop schema if exists app_private cascade;
drop schema if exists public cascade;
truncate table supabase_migrations.schema_migrations;
