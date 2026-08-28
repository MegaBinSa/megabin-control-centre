-- Website intake receipt is durable before processing begins. The job row is
-- created in the same transaction as the immutable intake and can be retried
-- without relying on Edge Function worker lifetime.
create table app_private.website_intake_processing_jobs (
  website_intake_processing_job_id uuid primary key default gen_random_uuid(),
  website_intake_submission_id uuid not null unique
    references app_private.website_intake_submissions on delete cascade,
  job_type text not null default 'website_intake.process'
    check (job_type = 'website_intake.process'),
  idempotency_key text not null unique,
  concurrency_key text not null unique,
  correlation_id uuid not null,
  lifecycle_status text not null default 'pending'
    check (lifecycle_status in ('pending','processing','retryable_failure','succeeded','permanent_failure')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index website_intake_processing_jobs_due_idx
  on app_private.website_intake_processing_jobs(next_attempt_at, created_at)
  where lifecycle_status in ('pending','retryable_failure');

alter table app_private.website_intake_processing_jobs enable row level security;
revoke all on app_private.website_intake_processing_jobs from public, anon, authenticated;
grant select, insert, update on app_private.website_intake_processing_jobs to service_role;

create or replace function app_private.enqueue_website_intake_processing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lifecycle_status = 'received' then
    insert into app_private.website_intake_processing_jobs(
      website_intake_submission_id, idempotency_key, concurrency_key, correlation_id
    ) values (
      new.website_intake_submission_id,
      'website-intake:' || new.website_intake_submission_id::text,
      'website-intake:' || new.website_intake_submission_id::text,
      new.correlation_id
    ) on conflict (website_intake_submission_id) do nothing;
  end if;
  return new;
end $$;

revoke all on function app_private.enqueue_website_intake_processing() from public, anon, authenticated;

create trigger website_intake_enqueue_processing
after insert on app_private.website_intake_submissions
for each row execute function app_private.enqueue_website_intake_processing();

-- Recover receipts committed before the durable boundary existed, including
-- the preserved UAT-WEB-001 receipt. This queues them; migration application
-- does not process or duplicate an intake.
insert into app_private.website_intake_processing_jobs(
  website_intake_submission_id, idempotency_key, concurrency_key, correlation_id
)
select website_intake_submission_id,
  'website-intake:' || website_intake_submission_id::text,
  'website-intake:' || website_intake_submission_id::text,
  correlation_id
from app_private.website_intake_submissions
where lifecycle_status in ('received','failed')
on conflict (website_intake_submission_id) do nothing;

create or replace function api.website_intake_process_pending(
  p_submission_id uuid,
  p_correlation_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  job app_private.website_intake_processing_jobs%rowtype;
  process_result jsonb;
  failure_code text;
  attempt_number integer;
begin
  select * into job
  from app_private.website_intake_processing_jobs
  where website_intake_submission_id = p_submission_id
  for update;

  if job.website_intake_processing_job_id is null then
    return jsonb_build_object('submissionId',p_submission_id,'status','not_queued');
  end if;
  if job.lifecycle_status = 'succeeded' then
    return jsonb_build_object('submissionId',p_submission_id,'status','succeeded','duplicate',true);
  end if;
  if job.lifecycle_status = 'permanent_failure' or job.attempts >= 5 then
    return jsonb_build_object('submissionId',p_submission_id,'status','permanent_failure');
  end if;
  if job.lifecycle_status = 'retryable_failure' and job.next_attempt_at > now() then
    return jsonb_build_object(
      'submissionId',p_submission_id,'status','retry_scheduled',
      'nextAttemptAt',job.next_attempt_at
    );
  end if;

  attempt_number := job.attempts + 1;
  update app_private.website_intake_processing_jobs
  set lifecycle_status='processing', attempts=attempt_number,
      correlation_id=p_correlation_id, started_at=now(), updated_at=now()
  where website_intake_processing_job_id=job.website_intake_processing_job_id;

  begin
    process_result := api.website_intake_process(p_submission_id,p_correlation_id);
  exception when others then
    failure_code := sqlstate;
    update app_private.website_intake_submissions
    set lifecycle_status='failed', processing_attempts=processing_attempts+1,
        last_failure_code=failure_code, updated_at=now()
    where website_intake_submission_id=p_submission_id;
    update app_private.website_intake_processing_jobs
    set lifecycle_status=case when attempt_number >= 5 then 'permanent_failure' else 'retryable_failure' end,
        next_attempt_at=now() + make_interval(secs => least(300, 5 * power(2,attempt_number-1))::integer),
        last_failure_code=failure_code, updated_at=now()
    where website_intake_processing_job_id=job.website_intake_processing_job_id;
    insert into app_private.website_intake_processing_history(
      website_intake_submission_id,processing_version,lifecycle_status,safe_errors
    ) values (
      p_submission_id,'phase-4a-v1','failed',
      jsonb_build_array(jsonb_build_object('code',failure_code,'attempt',attempt_number))
    );
    insert into app_private.background_job_failures(
      job_id,job_type,idempotency_key,concurrency_key,correlation_id,attempt,
      failure_category,safe_message,safe_metadata
    ) values (
      job.website_intake_processing_job_id,job.job_type,job.idempotency_key,
      job.concurrency_key,p_correlation_id,attempt_number,'unexpected',
      'Website intake processing failed.',
      jsonb_build_object('submissionId',p_submission_id,'failureCode',failure_code)
    );
    return jsonb_build_object(
      'submissionId',p_submission_id,
      'status',case when attempt_number >= 5 then 'permanent_failure' else 'retryable_failure' end,
      'failureCode',failure_code,
      'attempt',attempt_number
    );
  end;

  update app_private.website_intake_processing_jobs
  set lifecycle_status='succeeded', completed_at=now(), last_failure_code=null, updated_at=now()
  where website_intake_processing_job_id=job.website_intake_processing_job_id;
  return jsonb_build_object(
    'submissionId',p_submission_id,'status','succeeded','attempt',attempt_number,
    'result',process_result
  );
end $$;

revoke all on function api.website_intake_process_pending(uuid,uuid) from public, anon, authenticated;
grant execute on function api.website_intake_process_pending(uuid,uuid) to service_role;
