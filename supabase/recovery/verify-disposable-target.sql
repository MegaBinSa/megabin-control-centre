create schema if not exists recovery_control;

create table if not exists recovery_control.target_state (
  singleton boolean primary key default true check (singleton),
  target_project_ref text not null,
  source_project_ref text not null,
  disposable boolean not null default false,
  last_rehearsal_at timestamptz,
  check (target_project_ref = 'ivtaoqorcryzsempsogs'),
  check (source_project_ref = 'xniweqdmswzljcgkfglx')
);

do $$
declare
  prior_authorization boolean := false;
  application_rows bigint := 0;
  item record;
  row_count bigint;
begin
  select coalesce(bool_and(disposable), false)
  into prior_authorization
  from recovery_control.target_state
  where singleton;

  if not prior_authorization then
    select count(*) into application_rows from auth.users;
    for item in
      select schemaname, tablename
      from pg_tables
      where schemaname in ('app_private', 'public')
        and not (schemaname = 'public' and tablename = 'spatial_ref_sys')
    loop
      execute format('select count(*) from %I.%I', item.schemaname, item.tablename)
      into row_count;
      application_rows := application_rows + row_count;
    end loop;
    if application_rows > 0 then
      raise exception 'recovery_target_contains_unapproved_independent_data';
    end if;
  end if;
end
$$;

