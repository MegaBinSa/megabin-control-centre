begin;
select plan(13);

select is(
  (api.website_intake_receive(
    'megabin-website-onboarding-local','durable-web-100','durable-web-100',repeat('a',64),
    '76000000-0000-4000-8000-000000000001',
    '{"sourceSubmissionId":"durable-web-100","payloadVersion":"1.0","submittedAt":"2026-08-28T08:00:00+02:00","client":{"type":"individual","displayName":"Synthetic Durable Intake"},"contact":{"name":"Synthetic Durable Contact","mobile":"0820000100"},"address":{"addressLine1":"101 Synthetic Durable Road","suburb":"Synthetic North","city":"Pretoria","latitude":-25.7,"longitude":28.22},"requestedDrumCount":2}'::jsonb
  )->>'duplicate')::boolean,
  false,
  'receipt is accepted once'
);

select is(
  (select count(*) from app_private.website_intake_processing_jobs j
   join app_private.website_intake_submissions s using (website_intake_submission_id)
   where s.source_submission_id='durable-web-100'),
  1::bigint,
  'receipt transaction creates one durable processing job'
);

select is(
  (api.website_intake_process_pending(
    (select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='durable-web-100'),
    '76000000-0000-4000-8000-000000000002'
  )->>'status'),
  'succeeded',
  'durable processor completes accepted intake'
);

select is((select lifecycle_status from app_private.website_intake_submissions where source_submission_id='durable-web-100'),'needs_review','accepted intake progresses beyond received');
select is((select processing_attempts from app_private.website_intake_submissions where source_submission_id='durable-web-100'),1,'successful processing records its attempt');
select is((select j.lifecycle_status from app_private.website_intake_processing_jobs j join app_private.website_intake_submissions s using (website_intake_submission_id) where s.source_submission_id='durable-web-100'),'succeeded','durable job records success');

select is(
  (api.website_intake_receive(
    'megabin-website-onboarding-local','durable-web-100','durable-web-100',repeat('a',64),
    '76000000-0000-4000-8000-000000000003',
    (select source_payload from app_private.website_intake_submissions where source_submission_id='durable-web-100')
  )->>'duplicate')::boolean,
  true,
  'exact receipt retry remains idempotent'
);
select is((select count(*) from app_private.website_intake_processing_jobs j join app_private.website_intake_submissions s using (website_intake_submission_id) where s.source_submission_id='durable-web-100'),1::bigint,'retry does not duplicate durable work');

select lives_ok($$
  select api.website_intake_receive(
    'megabin-website-onboarding-local','durable-web-failure','durable-web-failure',repeat('b',64),
    '76000000-0000-4000-8000-000000000004',
    '{"sourceSubmissionId":"durable-web-failure","payloadVersion":"1.0","submittedAt":"2026-08-28T08:00:00+02:00","client":{"type":"individual","displayName":"Synthetic Failed Intake"},"contact":{"name":"Synthetic Failed Contact","mobile":"0820000101"},"address":{"addressLine1":"102 Synthetic Durable Road","suburb":"Synthetic North","city":"Pretoria","latitude":-25.7,"longitude":28.22},"requestedDrumCount":2}'::jsonb
  )
$$,'failure fixture receipt is durable');
update app_private.website_intake_submissions
set source_payload=jsonb_set(source_payload,'{requestedDrumCount}','"invalid"'::jsonb)
where source_submission_id='durable-web-failure';

select is(
  (api.website_intake_process_pending(
    (select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='durable-web-failure'),
    '76000000-0000-4000-8000-000000000005'
  )->>'status'),
  'retryable_failure',
  'processing failure is returned without losing durable state'
);
select is((select lifecycle_status from app_private.website_intake_submissions where source_submission_id='durable-web-failure'),'failed','processing failure is visible on intake');
select is((select j.lifecycle_status from app_private.website_intake_processing_jobs j join app_private.website_intake_submissions s using (website_intake_submission_id) where s.source_submission_id='durable-web-failure'),'retryable_failure','processing failure remains retryable');
select is((select count(*) from app_private.background_job_failures f join app_private.website_intake_processing_jobs j on j.website_intake_processing_job_id=f.job_id join app_private.website_intake_submissions s using (website_intake_submission_id) where s.source_submission_id='durable-web-failure'),1::bigint,'processing failure creates safe operational evidence');

select * from finish();
rollback;
