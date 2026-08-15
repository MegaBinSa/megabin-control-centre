-- Destructive by design: run only after the approved recovery-contract guard.
truncate table auth.users cascade;
drop schema if exists api cascade;
drop schema if exists app_private cascade;
drop schema if exists public cascade;
drop schema if exists supabase_migrations cascade;
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
