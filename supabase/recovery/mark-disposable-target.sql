insert into recovery_control.target_state (
  singleton, target_project_ref, source_project_ref, disposable, last_rehearsal_at
) values (
  true, 'ivtaoqorcryzsempsogs', 'xniweqdmswzljcgkfglx', true, now()
)
on conflict (singleton) do update
set target_project_ref = excluded.target_project_ref,
    source_project_ref = excluded.source_project_ref,
    disposable = excluded.disposable,
    last_rehearsal_at = excluded.last_rehearsal_at;
