do $$
begin
  if not exists (
    select 1
    from recovery_control.target_state
    where singleton
      and disposable
      and source_project_ref = 'xniweqdmswzljcgkfglx'
      and target_project_ref = 'ivtaoqorcryzsempsogs'
  ) then
    raise exception 'forward_repair_target_not_approved_disposable';
  end if;
  if to_regnamespace('assurance_forward_repair') is not null then
    raise exception 'forward_repair_target_contains_prior_rehearsal_state';
  end if;
end
$$;
