-- Phase 0 migration proof: establish a non-exposed schema for future
-- privileged implementation details. This migration creates no business data.
create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon;
revoke all on schema app_private from authenticated;

comment on schema app_private is
  'Non-exposed implementation details; access must be granted explicitly.';
