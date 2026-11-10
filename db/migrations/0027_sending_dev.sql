-- Phase D16: sending, delivery reports, STOP replies and cost settling (live mode).
-- Not applied by the build. Test on the preview database first.
--
-- SECURITY: every function here is SECURITY DEFINER with a fixed search_path, is revoked
-- from public and granted to app_user only. Each one checks that the caller is the
-- restaurant (or an operator) it works on. Money stays in integer cents.

-- 1. Claim the campaigns that are due. A row lock with skip locked means two cron runs
--    never pick the same campaign.
create or replace function claim_due_campaigns(p_now timestamptz, p_limit integer)
returns table (campaign_id uuid, restaurant_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Only the dispatcher (operator context) claims campaigns for every restaurant.
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  with due as (
    select c.id from campaign c
    where c.status = 'scheduled'
      and c.scheduled_at <= p_now
    order by c.scheduled_at
    limit p_limit
    for update skip locked
  )
  update campaign c set status = 'sending'
  from due
  where c.id = due.id
  returning c.id, c.restaurant_id;
end;
$$;

revoke all on function claim_due_campaigns(timestamptz, integer) from public;
grant execute on function claim_due_campaigns(timestamptz, integer) to app_user;

-- 2. Queue one message per eligible guest. Unique per campaign, membership and channel,
--    so a rerun inserts nothing twice. Consent, erasure and the weekly cap are checked here.
create or replace function queue_campaign_messages(p_campaign uuid, p_now timestamptz)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  camp campaign%rowtype;
  inserted integer;
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into camp from campaign where id = p_campaign;
  if not found or camp.status <> 'sending' then
    return 0;
  end if;

  insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments, queued_at)
  select p_campaign, camp.restaurant_id, m.id,
    case when camp.channel = 'push' then 'push'::message_channel else 'sms'::message_channel end,
    'queued', coalesce(camp.est_segments, 1), p_now
  from membership m
  join restaurant r on r.id = m.restaurant_id
  join customer c on c.id = m.customer_id
  where m.restaurant_id = camp.restaurant_id
    and c.erased_at is null
    and m.marketing_sms = 'opted_in'
    and (
      select count(*) from message x
      where x.membership_id = m.id
        and x.status in ('queued', 'sending', 'sent', 'delivered')
        and coalesce(x.last_attempt_at, x.queued_at) >= p_now - interval '7 days'
    ) < r.member_weekly_cap
  on conflict (campaign_id, membership_id, channel) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function queue_campaign_messages(uuid, timestamptz) from public;
grant execute on function queue_campaign_messages(uuid, timestamptz) to app_user;

-- 3. Record a delivery report. Only moves a message forward, so a late or repeated
--    report never undoes a delivery. The real cost comes from the provider.
create or replace function record_delivery(
  p_provider text,
  p_provider_message_id text,
  p_status text,
  p_error_code text,
  p_cost_cents integer,
  p_segments integer
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  updated integer;
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'delivered', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update message set
    status = case when p_status = 'failed' then 'failed'::message_status else p_status::message_status end,
    error_code = case when p_status = 'failed' then p_error_code else error_code end,
    cost_cents = case when p_cost_cents is not null then p_cost_cents else cost_cents end,
    segments = case when p_segments is not null then p_segments else segments end,
    sent_at = case when p_status in ('sent', 'delivered') then coalesce(sent_at, now()) else sent_at end,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end
  where provider = p_provider
    and provider_message_id = p_provider_message_id
    and status in ('queued', 'sending', 'sent')
    and not (status = 'sent' and p_status = 'sent');
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function record_delivery(text, text, text, text, integer, integer) from public;
grant execute on function record_delivery(text, text, text, text, integer, integer) to app_user;

-- 4. A guest replies STOP. Withdraws marketing consent by writing a consent_event, never
--    by deleting. Repeated STOP messages write nothing new once consent is already withdrawn.
create or replace function record_sms_stop(p_phone text, p_sender text, p_wording text)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  count_done integer := 0;
  row_rec record;
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- Only the restaurant that last texted this guest is affected, never every restaurant.
  for row_rec in
    select m.id as membership_id, m.restaurant_id
    from membership m
    join customer c on c.id = m.customer_id
    where c.phone_e164 = p_phone
      and c.erased_at is null
      and m.marketing_sms = 'opted_in'
      and m.restaurant_id = (
        select msg.restaurant_id from message msg
        join membership mm on mm.id = msg.membership_id
        join customer cc on cc.id = mm.customer_id
        where cc.phone_e164 = p_phone and msg.channel = 'sms' and msg.status in ('sent', 'delivered')
        order by msg.sent_at desc nulls last
        limit 1
      )
  loop
    update membership set marketing_sms = 'opted_out' where id = row_rec.membership_id;
    insert into consent_event (membership_id, purpose, action, wording_version, wording_text, source)
    values (row_rec.membership_id, 'marketing_sms', 'withdrawn', 'sms-stop-1', p_wording, 'sms_stop');
    count_done := count_done + 1;
  end loop;
  return count_done;
end;
$$;

revoke all on function record_sms_stop(text, text, text) from public;
grant execute on function record_sms_stop(text, text, text) to app_user;

-- 5. Settle a campaign once every message is final. Posts a charge for the real cost
--    (capped at the reserve) and a release for the unused reserve. The references are
--    unique, so a rerun posts nothing. The campaign becomes sent, or failed when nothing
--    was delivered.
create or replace function settle_campaign(p_campaign uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  camp campaign%rowtype;
  reserved integer;
  actual integer;
  delivered integer;
  charge integer;
  unused integer;
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into camp from campaign where id = p_campaign for update;
  if not found then
    return 'missing';
  end if;
  if camp.status <> 'sending' then
    return camp.status::text;
  end if;
  if exists (select 1 from message where campaign_id = p_campaign and status in ('queued', 'sending')) then
    return 'pending';
  end if;

  select coalesce(-sum(amount_cents), 0)::integer into reserved
  from credit_ledger where campaign_id = p_campaign and entry_type = 'reserve';
  select coalesce(sum(cost_cents), 0)::integer,
         count(*) filter (where status in ('sent', 'delivered'))::integer
    into actual, delivered
  from message where campaign_id = p_campaign;

  charge := least(actual, reserved);
  unused := reserved - charge;

  -- The reserve row already holds the full amount, so the charge row records the actual
  -- cost with amount zero. Reserve plus release then nets to exactly the charge.
  insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, campaign_id, created_by, note)
  values (camp.restaurant_id, 'charge', 0, 'charge:' || p_campaign, p_campaign, 'system',
    'SMS cost for a campaign: ' || charge || ' cents')
  on conflict (reference) do nothing;
  if unused > 0 then
    insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, campaign_id, created_by, note)
    values (camp.restaurant_id, 'release', unused, 'release:' || p_campaign, p_campaign, 'system',
      'Unused credit returned from a campaign')
    on conflict (reference) do nothing;
  end if;

  update campaign set
    actual_cost_cents = charge,
    status = case when delivered > 0 then 'sent'::campaign_status else 'failed'::campaign_status end,
    sent_at = coalesce(sent_at, now())
  where id = p_campaign;

  return case when delivered > 0 then 'sent' else 'failed' end;
end;
$$;

revoke all on function settle_campaign(uuid) from public;
grant execute on function settle_campaign(uuid) to app_user;

-- 6. Campaigns that are ready to settle: no message still waiting or sending.
create or replace function campaigns_ready_to_settle(p_limit integer)
returns table (campaign_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select c.id from campaign c
  where c.status = 'sending'
    and not exists (
      select 1 from message m where m.campaign_id = c.id and m.status in ('queued', 'sending')
    )
  order by c.scheduled_at
  limit p_limit;
end;
$$;

revoke all on function campaigns_ready_to_settle(integer) from public;
grant execute on function campaigns_ready_to_settle(integer) to app_user;
