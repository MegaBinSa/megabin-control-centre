-- Make inbound provider replay immutable and surface whether the receipt was
-- newly retained. The unique provider/message identity remains authoritative;
-- an exact retry returns the existing receipt without duplicating broad events.
create or replace function api.communication_ingest_inbound(
  p_provider text,
  p_channel text,
  p_message text,
  p_sender text,
  p_received timestamptz,
  p_content text,
  p_correlation uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ids uuid[];
  contact uuid;
  client uuid;
  service uuid;
  region uuid;
  classification text;
  command text;
  m app_private.inbound_messages%rowtype;
begin
  select array_agg(client_contact_id)
  into ids
  from app_private.client_contacts
  where is_active
    and (
      (p_channel in ('whatsapp', 'sms') and mobile_e164 = p_sender)
      or (p_channel = 'email' and lower(email) = lower(p_sender))
    );

  classification := case
    when coalesce(array_length(ids, 1), 0) = 1 then 'matched'
    when coalesce(array_length(ids, 1), 0) > 1 then 'ambiguous'
    else 'unmatched'
  end;
  if classification = 'matched' then
    contact := ids[1];
    select client_id into client
    from app_private.client_contacts
    where client_contact_id = contact;
    select cs.client_service_id, sc.service_region_id
    into service, region
    from app_private.client_services cs
    join app_private.service_configurations sc using (client_service_id)
    where cs.client_id = client
      and cs.lifecycle_status = 'active'
      and sc.effective_to is null
    order by cs.created_at
    limit 1;
  end if;

  command := case when lower(btrim(p_content)) = 'skip' then 'skip' else 'unknown' end;
  insert into app_private.inbound_messages(
    provider, channel, provider_message_id, sender_snapshot, received_at, content_text,
    matched_client_id, matched_contact_id, matched_client_service_id, service_region_id,
    match_classification, recognized_command, processing_status, correlation_id
  ) values (
    p_provider, p_channel, p_message, jsonb_build_object('sender', p_sender), p_received, p_content,
    client, contact, service, region, classification, command,
    case when classification = 'matched' and command = 'skip' then 'recognized' else 'needs_review' end,
    p_correlation
  )
  on conflict (provider, provider_message_id) do nothing
  returning * into m;

  if m.inbound_message_id is null then
    select * into m
    from app_private.inbound_messages
    where provider = p_provider and provider_message_id = p_message;
    if m.channel <> p_channel
      or m.sender_snapshot ->> 'sender' <> p_sender
      or m.received_at <> p_received
      or m.content_text is distinct from p_content then
      raise exception 'provider_message_identity_conflict' using errcode = '22023';
    end if;
    return to_jsonb(m) || jsonb_build_object('duplicate', true);
  end if;

  insert into app_private.outbox_events(
    producer_module, event_name, event_version, aggregate_type, aggregate_id, payload,
    correlation_id, actor_kind, actor_id, occurred_at
  ) values (
    'communications', 'Communications.InboundMessageReceived', 1, 'inbound-message',
    m.inbound_message_id,
    jsonb_build_object(
      'inboundMessageId', m.inbound_message_id,
      'matchClassification', m.match_classification
    ),
    p_correlation, 'system', 'communications-webhook', now()
  );
  if m.recognized_command = 'skip' and m.match_classification = 'matched' then
    insert into app_private.outbox_events(
      producer_module, event_name, event_version, aggregate_type, aggregate_id, payload,
      correlation_id, actor_kind, actor_id, occurred_at
    ) values (
      'communications', 'Communications.InboundCommandRecognized', 1, 'inbound-message',
      m.inbound_message_id,
      jsonb_build_object(
        'inboundMessageId', m.inbound_message_id,
        'command', 'skip',
        'clientServiceId', m.matched_client_service_id
      ),
      p_correlation, 'system', 'communications-command-parser', now()
    );
  end if;
  return to_jsonb(m) || jsonb_build_object('duplicate', false);
end
$$;

revoke all on function api.communication_ingest_inbound(
  text, text, text, text, timestamptz, text, uuid
) from public, anon, authenticated;
grant execute on function api.communication_ingest_inbound(
  text, text, text, text, timestamptz, text, uuid
) to service_role;
