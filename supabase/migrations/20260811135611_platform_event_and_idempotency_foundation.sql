-- Phase 0B-4 platform reliability foundation. These are private technical
-- records, not operational business entities or an event-sourced domain model.

create table app_private.outbox_events (
  event_id uuid primary key default gen_random_uuid(),
  producer_module text not null check (
    producer_module in (
      'identity-access', 'clients', 'service-addresses', 'service-configuration',
      'geography', 'workforce', 'vehicles', 'daily-roster', 'routes',
      'route-operations', 'vehicle-tracking', 'operational-issues',
      'needs-attention', 'communications', 'integrations', 'configuration',
      'reporting', 'audit', 'system-health'
    )
  ),
  event_name text not null check (
    event_name ~ '^[A-Z][A-Za-z0-9]+(\.[A-Z][A-Za-z0-9]+)*$'
  ),
  event_version integer not null check (event_version > 0),
  aggregate_type text not null check (char_length(aggregate_type) between 1 and 100),
  aggregate_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  correlation_id uuid not null,
  causation_id uuid,
  actor_kind text check (actor_kind in ('user', 'system', 'integration')),
  actor_id text,
  occurred_at timestamptz not null,
  available_at timestamptz not null default now(),
  delivery_status text not null default 'pending' check (
    delivery_status in ('pending', 'processing', 'published', 'dead_letter')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_at timestamptz,
  locked_by text,
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outbox_events_actor_shape check (
    (actor_kind is null and actor_id is null)
    or (actor_kind is not null and actor_id is not null)
  ),
  constraint outbox_events_delivery_shape check (
    (delivery_status = 'pending' and locked_at is null and locked_by is null and published_at is null)
    or (delivery_status = 'processing' and locked_at is not null and locked_by is not null and published_at is null)
    or (delivery_status = 'published' and published_at is not null)
    or (delivery_status = 'dead_letter' and last_error is not null)
  )
);

create index outbox_events_dispatch_idx
  on app_private.outbox_events (available_at, created_at)
  where delivery_status = 'pending';

create index outbox_events_aggregate_idx
  on app_private.outbox_events (aggregate_type, aggregate_id, occurred_at);

create index outbox_events_correlation_idx
  on app_private.outbox_events (correlation_id);

create table app_private.idempotency_records (
  idempotency_record_id uuid primary key default gen_random_uuid(),
  operation_key text not null check (
    operation_key ~ '^[a-z][a-z0-9_.-]*$'
    and char_length(operation_key) <= 150
  ),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  processing_status text not null default 'in_progress' check (
    processing_status in ('in_progress', 'completed')
  ),
  response_status integer check (response_status between 100 and 599),
  response_body jsonb check (response_body is null or jsonb_typeof(response_body) = 'object'),
  first_seen_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  constraint idempotency_records_operation_key_unique unique (operation_key, idempotency_key),
  constraint idempotency_records_completion_shape check (
    (processing_status = 'in_progress' and completed_at is null and response_status is null and response_body is null)
    or (processing_status = 'completed' and completed_at is not null and response_status is not null)
  ),
  constraint idempotency_records_expiry_order check (expires_at > first_seen_at)
);

create index idempotency_records_expiry_idx
  on app_private.idempotency_records (expires_at);

comment on table app_private.outbox_events is
  'Durable versioned domain events recorded in the same transaction as authoritative changes.';

comment on table app_private.idempotency_records is
  'Retry-safety records binding an operation and idempotency key to one request fingerprint and result.';

alter table app_private.outbox_events enable row level security;
alter table app_private.idempotency_records enable row level security;

revoke all on table app_private.outbox_events from public, anon, authenticated, service_role;
revoke all on table app_private.idempotency_records from public, anon, authenticated, service_role;

grant usage on schema app_private to service_role;
grant select, insert, update on table app_private.outbox_events to service_role;
grant select, insert, update on table app_private.idempotency_records to service_role;
