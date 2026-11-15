-- Phase D16b: finish sending. Push messages and the "Both" channel, a safe recipient count for the
-- composer, a held delivery receipt (so a receipt that arrives early is not lost), the STOP reply
-- lookup and the nightly low-credit check.
-- Not applied by the build. Test on the preview database first.
--
-- SECURITY: every function here is SECURITY DEFINER with a fixed search_path and is revoked from
-- public. Functions the dispatcher uses check app_is_operator(). The recipient count is the only
-- one an owner can call, and it refuses any restaurant other than the caller's own. Helper functions
-- that only other functions call are not granted to app_user at all. Money stays in integer cents.

-- 1. Who a campaign reaches on one channel. Push needs push consent and a live subscription,
--    SMS needs SMS consent. Same audience rules and the same weekly cap, counted per channel.
create or replace function campaign_audience_ids(
  p_restaurant uuid, p_audience jsonb, p_now timestamptz, p_channel text
) returns table (membership_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.id
  from membership m
  join restaurant r on r.id = m.restaurant_id
  join customer c on c.id = m.customer_id
  where m.restaurant_id = p_restaurant
    and c.erased_at is null
    and (
      case p_channel
        when 'push' then m.marketing_push = 'opted_in'
          and exists (
            select 1 from push_subscription s
            where s.customer_id = m.customer_id and s.disabled_at is null
          )
        else m.marketing_sms = 'opted_in'
      end
    )
    and (
      case p_audience->>'type'
        when 'everyone' then true
        when 'new' then m.joined_at >= p_now - make_interval(days => coalesce((p_audience->>'days')::int, 7))
        when 'lapsed30' then coalesce(m.last_visit_at, m.joined_at) <= p_now - make_interval(days => coalesce((p_audience->>'days')::int, 30))
        when 'close_to_reward' then r.stamps_required - m.stamps_current <= coalesce((p_audience->>'remaining')::int, 1)
          and m.stamps_current < r.stamps_required
        when 'weekday' then exists (
          select 1 from stamp_event se
          where se.membership_id = m.id
            and se.status = 'valid'
            and extract(dow from se.created_at at time zone 'Africa/Johannesburg') = (p_audience->>'weekday')::int
        )
        when 'birthday_month' then c.birthday is not null
          and extract(month from c.birthday) = coalesce((p_audience->>'month')::int, extract(month from (p_now at time zone 'Africa/Johannesburg'))::int)
        when 'saved_list' then exists (
          select 1 from saved_list sl
          where sl.id = (p_audience->>'listId')::uuid
            and sl.restaurant_id = p_restaurant
            and sl.membership_ids ? m.id::text
        )
        else false
      end
    )
    and (
      select count(*) from message x
      where x.membership_id = m.id
        and x.channel = (case p_channel when 'push' then 'push' else 'sms' end)::message_channel
        and x.status in ('sent', 'delivered')
        and coalesce(x.last_attempt_at, x.queued_at) >= p_now - interval '7 days'
    ) < r.member_weekly_cap
$$;

revoke all on function campaign_audience_ids(uuid, jsonb, timestamptz, text) from public;

-- The older three-argument form keeps meaning "SMS guests" for anything that still calls it.
create or replace function campaign_audience_ids(
  p_restaurant uuid, p_audience jsonb, p_now timestamptz
) returns table (membership_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.membership_id from campaign_audience_ids(p_restaurant, p_audience, p_now, 'sms') a
$$;

revoke all on function campaign_audience_ids(uuid, jsonb, timestamptz) from public;

-- 2. The recipient count the composer shows. The old composer called campaign_audience_ids directly,
--    which the app login is not allowed to run. This wrapper is allowed and only counts the caller's
--    own restaurant.
create or replace function count_campaign_recipients(p_restaurant uuid, p_audience jsonb)
returns table (sms_count integer, push_count integer, either_count integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app_is_operator() and app_restaurant() is distinct from p_restaurant then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select
    (select count(*)::integer from campaign_audience_ids(p_restaurant, p_audience, now(), 'sms')),
    (select count(*)::integer from campaign_audience_ids(p_restaurant, p_audience, now(), 'push')),
    (select count(*)::integer from (
      select a.membership_id from campaign_audience_ids(p_restaurant, p_audience, now(), 'sms') a
      union
      select b.membership_id from campaign_audience_ids(p_restaurant, p_audience, now(), 'push') b
    ) u);
end;
$$;

revoke all on function count_campaign_recipients(uuid, jsonb) from public;
grant execute on function count_campaign_recipients(uuid, jsonb) to app_user;

-- 3. Create a campaign on SMS, push or both, and hold the credit it could need. Push costs nothing.
--    "Both" holds the SMS worst case, because every guest could end up on SMS.
drop function if exists create_campaign(uuid, text, text, text, jsonb, text, timestamptz, integer);

create or replace function create_campaign(
  p_restaurant uuid,
  p_user text,
  p_name text,
  p_body text,
  p_audience jsonb,
  p_code text,
  p_scheduled_at timestamptz,
  p_est_segments integer,
  p_channel text default 'sms'
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  caller_role text;
  caller_restaurant uuid;
  balance integer;
  recipients integer;
  sms_recipients integer;
  cost integer;
  local_time timestamp;
  new_id uuid := gen_random_uuid();
begin
  select role, restaurant_id into caller_role, caller_restaurant
  from app_user where user_id = p_user;
  if caller_role not in ('owner', 'manager') or caller_restaurant is distinct from p_restaurant then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_channel not in ('sms', 'push', 'both') then
    raise exception 'invalid_channel' using errcode = '22023';
  end if;
  if length(coalesce(p_name, '')) = 0 or length(p_body) not between 1 and 600 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if p_code !~ '^[A-Z0-9]{3,12}$' then
    raise exception 'invalid_code' using errcode = '22023';
  end if;
  if p_scheduled_at is not null and p_scheduled_at < now() - interval '1 minute' then
    raise exception 'time_in_past' using errcode = '22023';
  end if;
  if p_est_segments not between 1 and 10 then
    raise exception 'invalid_segments' using errcode = '22023';
  end if;

  -- Quiet hours (20:00 to 08:00 SAST): move the send to the next 08:00 SAST.
  if p_scheduled_at is not null then
    local_time := p_scheduled_at at time zone 'Africa/Johannesburg';
    if extract(hour from local_time) >= 20 or extract(hour from local_time) < 8 then
      if extract(hour from local_time) >= 20 then
        local_time := date_trunc('day', local_time) + interval '1 day' + interval '8 hours';
      else
        local_time := date_trunc('day', local_time) + interval '8 hours';
      end if;
      p_scheduled_at := local_time at time zone 'Africa/Johannesburg';
    end if;
  end if;

  -- Lock the restaurant row so two creates cannot both spend the same credit.
  perform 1 from restaurant where id = p_restaurant for update;
  -- The server counts recipients and prices the campaign. The browser never sets the cost.
  select count(*)::integer into sms_recipients
  from campaign_audience_ids(p_restaurant, p_audience, now(), 'sms');
  if p_channel = 'sms' then
    recipients := sms_recipients;
    cost := sms_recipients * p_est_segments * 35;
  elsif p_channel = 'push' then
    select count(*)::integer into recipients
    from campaign_audience_ids(p_restaurant, p_audience, now(), 'push');
    cost := 0;
  else
    select count(*)::integer into recipients from (
      select a.membership_id from campaign_audience_ids(p_restaurant, p_audience, now(), 'sms') a
      union
      select b.membership_id from campaign_audience_ids(p_restaurant, p_audience, now(), 'push') b
    ) u;
    cost := sms_recipients * p_est_segments * 35;
  end if;
  select coalesce(sum(amount_cents), 0)::integer into balance
  from credit_ledger where restaurant_id = p_restaurant;
  if balance < cost then
    raise exception 'not_enough_credit' using errcode = 'P0001';
  end if;

  insert into campaign (id, restaurant_id, name, message_body, channel, audience, code,
    status, scheduled_at, est_recipients, est_segments, est_cost_cents, created_by)
  values (new_id, p_restaurant, p_name, p_body, p_channel::campaign_channel, p_audience, p_code,
    'scheduled', p_scheduled_at, recipients, p_est_segments, cost, p_user);

  if cost > 0 then
    insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, campaign_id, created_by, note)
    values (p_restaurant, 'reserve', -cost, 'reserve:' || new_id, new_id, p_user,
      'Credit held for a campaign');
  end if;
  return new_id;
end;
$$;

revoke all on function create_campaign(uuid, text, text, text, jsonb, text, timestamptz, integer, text) from public;
grant execute on function create_campaign(uuid, text, text, text, jsonb, text, timestamptz, integer, text) to app_user;

-- 4. Queue one message per eligible guest and channel. Unique per campaign, membership and channel,
--    so a rerun inserts nothing twice. "Both" queues a push for guests who can get one and an SMS for
--    the rest. A guest whose push fails for good gets an SMS later (see queue_sms_fallback).
create or replace function queue_campaign_messages(p_campaign uuid, p_now timestamptz)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  camp campaign%rowtype;
  n_push integer := 0;
  n_sms integer := 0;
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into camp from campaign where id = p_campaign;
  if not found or camp.status <> 'sending' then
    return 0;
  end if;

  if camp.channel in ('push', 'both') then
    insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments, cost_cents, queued_at)
    select p_campaign, camp.restaurant_id, m.id, 'push', 'queued', 0, 0, p_now
    from membership m
    join restaurant r on r.id = m.restaurant_id
    where m.restaurant_id = camp.restaurant_id
      and m.id in (select a.membership_id from campaign_audience_ids(camp.restaurant_id, camp.audience, p_now, 'push') a)
      and (
        select count(*) from message x
        where x.membership_id = m.id
          and x.channel = 'push'
          and x.status in ('queued', 'sending', 'sent', 'delivered')
          and coalesce(x.last_attempt_at, x.queued_at) >= p_now - interval '7 days'
      ) < r.member_weekly_cap
    on conflict (campaign_id, membership_id, channel) do nothing;
    get diagnostics n_push = row_count;
  end if;

  if camp.channel in ('sms', 'both') then
    insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments, queued_at)
    select p_campaign, camp.restaurant_id, m.id, 'sms', 'queued', coalesce(camp.est_segments, 1), p_now
    from membership m
    join restaurant r on r.id = m.restaurant_id
    where m.restaurant_id = camp.restaurant_id
      and m.id in (select a.membership_id from campaign_audience_ids(camp.restaurant_id, camp.audience, p_now, 'sms') a)
      -- On "Both", a guest who already has a push waits for it; SMS only follows if it fails.
      and (
        camp.channel = 'sms'
        or not exists (
          select 1 from message pm
          where pm.campaign_id = p_campaign and pm.membership_id = m.id and pm.channel = 'push'
        )
      )
      and (
        select count(*) from message x
        where x.membership_id = m.id
          and x.channel = 'sms'
          and x.status in ('queued', 'sending', 'sent', 'delivered')
          and coalesce(x.last_attempt_at, x.queued_at) >= p_now - interval '7 days'
      ) < r.member_weekly_cap
    on conflict (campaign_id, membership_id, channel) do nothing;
    get diagnostics n_sms = row_count;
  end if;

  return n_push + n_sms;
end;
$$;

revoke all on function queue_campaign_messages(uuid, timestamptz) from public;
grant execute on function queue_campaign_messages(uuid, timestamptz) to app_user;

-- 5. Text a guest instead when a "Both" push failed for good. Once per guest and campaign (the unique
--    key), only with SMS consent, outside the weekly cap, and never for an erased guest.
--    Helper only: other functions call it, the app login cannot.
create or replace function queue_sms_fallback(p_message uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  msg message%rowtype;
  camp campaign%rowtype;
begin
  select * into msg from message where id = p_message;
  if not found or msg.channel <> 'push' then
    return;
  end if;
  select * into camp from campaign where id = msg.campaign_id;
  if camp.channel <> 'both' or camp.status <> 'sending' then
    return;
  end if;
  insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments, queued_at)
  select camp.id, camp.restaurant_id, m.id, 'sms', 'queued', coalesce(camp.est_segments, 1), now()
  from membership m
  join restaurant r on r.id = m.restaurant_id
  join customer c on c.id = m.customer_id
  where m.id = msg.membership_id
    and m.marketing_sms = 'opted_in'
    and c.erased_at is null
    and (
      select count(*) from message x
      where x.membership_id = m.id
        and x.channel = 'sms'
        and x.status in ('queued', 'sending', 'sent', 'delivered')
        and coalesce(x.last_attempt_at, x.queued_at) >= now() - interval '7 days'
    ) < r.member_weekly_cap
  on conflict (campaign_id, membership_id, channel) do nothing;
end;
$$;

revoke all on function queue_sms_fallback(uuid) from public;

-- Helper: a push that is over. A retry goes back in the queue, anything else is failed, and on
-- "Both" a failed push hands the guest to SMS in the same transaction.
create or replace function end_push_message(p_id uuid, p_retry boolean, p_error text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update message set
    status = case when p_retry then 'queued'::message_status else 'failed'::message_status end,
    error_code = p_error
  where id = p_id and status = 'sending' and channel = 'push';
  if found and not p_retry then
    perform queue_sms_fallback(p_id);
  end if;
end;
$$;

revoke all on function end_push_message(uuid, boolean, text) from public;

-- 6. Claim a batch of push messages, one row per live subscription of the guest. A guest with no live
--    subscription is failed on the spot (and handed to SMS on "Both").
create or replace function claim_queued_push(p_now timestamptz, p_limit integer, p_max_attempts integer)
returns table (
  message_id uuid, body text, first_name text, restaurant_name text, restaurant_slug text,
  attempt integer, endpoint text, p256dh text, auth text
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ids uuid[];
  one_id uuid;
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  with picked as (
    select m.id from message m
    join campaign c on c.id = m.campaign_id and c.status = 'sending'
    where m.status = 'queued' and m.channel = 'push' and m.attempts < p_max_attempts
    order by m.queued_at, m.id
    limit greatest(p_limit, 0)
    for update of m skip locked
  ), claimed as (
    update message m set status = 'sending', attempts = m.attempts + 1, last_attempt_at = p_now
    from picked where m.id = picked.id
    returning m.id as claimed_id
  )
  select array_agg(claimed.claimed_id) into ids from claimed;

  foreach one_id in array coalesce(ids, array[]::uuid[]) loop
    if not exists (
      select 1 from message m2
      join membership mem on mem.id = m2.membership_id
      join push_subscription s on s.customer_id = mem.customer_id and s.disabled_at is null
      where m2.id = one_id
    ) then
      perform end_push_message(one_id, false, 'no_subscription');
      continue;
    end if;
    return query
    select m3.id, c3.message_body, cu.name, r3.name, r3.slug, m3.attempts::integer,
           s3.endpoint, s3.p256dh, s3.auth
    from message m3
    join campaign c3 on c3.id = m3.campaign_id
    join membership mem3 on mem3.id = m3.membership_id
    join customer cu on cu.id = mem3.customer_id
    join restaurant r3 on r3.id = m3.restaurant_id
    join push_subscription s3 on s3.customer_id = mem3.customer_id and s3.disabled_at is null
    where m3.id = one_id;
  end loop;
end;
$$;

revoke all on function claim_queued_push(timestamptz, integer, integer) from public;
grant execute on function claim_queued_push(timestamptz, integer, integer) to app_user;

create or replace function finish_push_send(p_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update message set
    status = 'sent', sent_at = coalesce(sent_at, now()), cost_cents = 0, segments = 0
  where id = p_id and status = 'sending' and channel = 'push';
end;
$$;

revoke all on function finish_push_send(uuid) from public;
grant execute on function finish_push_send(uuid) to app_user;

create or replace function fail_push_send(p_id uuid, p_retry boolean, p_error text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform end_push_message(p_id, p_retry, p_error);
end;
$$;

revoke all on function fail_push_send(uuid, boolean, text) from public;
grant execute on function fail_push_send(uuid, boolean, text) to app_user;

-- A browser that says the subscription is gone is switched off so it is never tried again.
create or replace function disable_push_subscription(p_endpoint text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update push_subscription set disabled_at = coalesce(disabled_at, now()) where endpoint = p_endpoint;
end;
$$;

revoke all on function disable_push_subscription(text) from public;
grant execute on function disable_push_subscription(text) to app_user;

-- 7. Settle: same rules as before, but a push message never costs anything.
create or replace function settle_campaign(p_campaign uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  camp campaign%rowtype;
  reserved integer;
  actual integer;
  delivered integer;
  charge integer;
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
  select coalesce(sum(case when channel = 'push' then 0 else coalesce(cost_cents, coalesce(segments, 1) * 35) end)
                    filter (where status in ('sent', 'delivered')), 0)::integer,
         (count(*) filter (where status in ('sent', 'delivered')))::integer
    into actual, delivered
  from message where campaign_id = p_campaign;
  charge := least(actual, reserved);
  if charge > 0 then
    insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, campaign_id, created_by, note)
    values (camp.restaurant_id, 'charge', -charge, 'charge:' || p_campaign, p_campaign, 'system',
      'SMS cost for a campaign')
    on conflict (reference) do nothing;
  end if;
  if reserved > 0 then
    insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, campaign_id, created_by, note)
    values (camp.restaurant_id, 'release', reserved, 'release:' || p_campaign, p_campaign, 'system',
      'Credit held for a campaign given back')
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

-- 8. A delivery report that arrives before we have saved the provider's id is kept for 24 hours
--    and applied the moment the id is saved. Without this the receipt was lost.
create table if not exists pending_receipt (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,
  provider_message_id text not null,
  status              text not null check (status in ('sent', 'delivered', 'failed')),
  error_code          text,
  received_at         timestamptz not null default now()
);
create index if not exists pending_receipt_lookup on pending_receipt (provider, provider_message_id);
alter table pending_receipt enable row level security;
alter table pending_receipt force row level security;
-- No policy and no grant: only the functions below can touch it.

create or replace function hold_receipt(
  p_provider text, p_provider_message_id text, p_status text, p_error_code text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'delivered', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  -- One at a time per provider id, so a receipt cannot slip in while finish_message_send runs.
  perform pg_advisory_xact_lock(hashtext(p_provider || ':' || p_provider_message_id));
  -- If the message already carries this id, the receipt was simply a repeat. Nothing to hold.
  if exists (
    select 1 from message where provider = p_provider and provider_message_id = p_provider_message_id
  ) then
    return false;
  end if;
  insert into pending_receipt (provider, provider_message_id, status, error_code)
  values (p_provider, p_provider_message_id, p_status, p_error_code);
  return true;
end;
$$;

revoke all on function hold_receipt(text, text, text, text) from public;
grant execute on function hold_receipt(text, text, text, text) to app_user;

create or replace function finish_message_send(
  p_id uuid, p_provider_message_id text, p_cost_cents integer, p_segments integer
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  held record;
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('bulksms:' || p_provider_message_id));
  update message set
    provider = 'bulksms',
    provider_message_id = p_provider_message_id,
    segments = coalesce(p_segments, segments, 1),
    cost_cents = coalesce(p_cost_cents, coalesce(p_segments, segments, 1) * 35),
    sent_at = coalesce(sent_at, now()),
    status = case when status in ('queued', 'sending') then 'sent'::message_status else status end
  where id = p_id;
  -- Apply any report that got here first, oldest first.
  for held in
    select * from pending_receipt
    where provider = 'bulksms' and provider_message_id = p_provider_message_id
    order by received_at, id
  loop
    perform record_delivery(held.provider, held.provider_message_id, held.status, held.error_code, null, null);
  end loop;
  delete from pending_receipt where provider = 'bulksms' and provider_message_id = p_provider_message_id;
end;
$$;

revoke all on function finish_message_send(uuid, text, integer, integer) from public;
grant execute on function finish_message_send(uuid, text, integer, integer) to app_user;

-- 9. After a STOP: who to name in the confirmation text. The restaurant that texted this number last.
create or replace function stop_reply_for(p_phone text)
returns table (restaurant_name text, sender text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select r.name, r.sms_sender_name
  from message msg
  join membership mem on mem.id = msg.membership_id
  join customer cu on cu.id = mem.customer_id
  join restaurant r on r.id = msg.restaurant_id
  where cu.phone_e164 = p_phone
    and msg.channel = 'sms'
    and msg.status in ('sent', 'delivered')
  order by msg.sent_at desc nulls last
  limit 1;
end;
$$;

revoke all on function stop_reply_for(text) from public;
grant execute on function stop_reply_for(text) to app_user;

-- 10. Nightly: tell active restaurants with less than R50 of spendable credit, once a day (SAST),
--     and clear held receipts older than 24 hours. The note shows in the Activity log.
create or replace function run_nightly_maintenance(p_now timestamptz, p_threshold_cents integer)
returns table (alerted integer, purged integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today text := to_char(p_now at time zone 'Africa/Johannesburg', 'YYYY-MM-DD');
  n_alerted integer;
  n_purged integer;
begin
  if not app_is_operator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('nightly_maintenance'));

  insert into audit_event (actor_type, restaurant_id, action, object_type, object_id, meta)
  select 'system', r.id, 'low_credit_alert', 'restaurant', r.id::text,
         jsonb_build_object('balance_cents', coalesce(b.balance, 0), 'day', today)
  from restaurant r
  left join (
    select l.restaurant_id, sum(l.amount_cents)::integer as balance
    from credit_ledger l group by l.restaurant_id
  ) b on b.restaurant_id = r.id
  where r.status = 'active'
    and coalesce(b.balance, 0) < p_threshold_cents
    and not exists (
      select 1 from audit_event e
      where e.restaurant_id = r.id and e.action = 'low_credit_alert' and e.meta->>'day' = today
    );
  get diagnostics n_alerted = row_count;

  delete from pending_receipt where received_at < p_now - interval '24 hours';
  get diagnostics n_purged = row_count;

  return query select n_alerted, n_purged;
end;
$$;

revoke all on function run_nightly_maintenance(timestamptz, integer) from public;
grant execute on function run_nightly_maintenance(timestamptz, integer) to app_user;
