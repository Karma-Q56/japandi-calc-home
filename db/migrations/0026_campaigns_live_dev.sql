-- Phase D15: new campaign, credit and saved lists (live mode).
-- Not applied by the build. Test on the preview database first.
--
-- SECURITY: the owner creates a campaign through create_campaign, a SECURITY DEFINER
-- function. It checks the restaurant, the caller's role and the credit balance itself.
-- It reserves the estimated cost in the same transaction, so a retry or a race can never
-- reserve twice or push the balance below zero. The browser never sends a cost, a role,
-- a status or a balance.

-- 1. Who may create a campaign. The caller is passed in as the signed in user id and
--    looked up here, never trusted from the browser for a role.
create or replace function campaign_audience_ids(
  p_restaurant uuid, p_audience jsonb, p_now timestamptz
) returns table (membership_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.id
  from membership m
  join restaurant r on r.id = m.restaurant_id
  join customer c on c.id = m.customer_id
  where m.restaurant_id = p_restaurant
    and c.erased_at is null
    and m.marketing_sms = 'opted_in'
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
    -- Guests who already received the per-guest weekly limit this week are left out.
    and (
      select count(*) from message x
      where x.membership_id = m.id
        and x.channel = 'sms'
        and x.status in ('sent', 'delivered')
        and coalesce(x.last_attempt_at, x.queued_at) >= p_now - interval '7 days'
    ) < r.member_weekly_cap
$$;

revoke all on function campaign_audience_ids(uuid, jsonb, timestamptz) from public;

-- 2. Create a campaign and reserve its estimated cost in one step.
create or replace function create_campaign(
  p_restaurant uuid,
  p_user text,
  p_name text,
  p_body text,
  p_audience jsonb,
  p_code text,
  p_scheduled_at timestamptz,
  p_est_segments integer
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  caller_role text;
  caller_restaurant uuid;
  balance integer;
  recipients integer;
  cost integer;
  local_time timestamp;
  new_id uuid := gen_random_uuid();
begin
  select role, restaurant_id into caller_role, caller_restaurant
  from app_user where user_id = p_user;
  if caller_role not in ('owner', 'manager') or caller_restaurant is distinct from p_restaurant then
    raise exception 'not_allowed' using errcode = '42501';
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
  select count(*)::integer into recipients from campaign_audience_ids(p_restaurant, p_audience, now());
  cost := recipients * p_est_segments * 35;
  select coalesce(sum(amount_cents), 0)::integer into balance
  from credit_ledger where restaurant_id = p_restaurant;
  if balance < cost then
    raise exception 'not_enough_credit' using errcode = 'P0001';
  end if;

  insert into campaign (id, restaurant_id, name, message_body, channel, audience, code,
    status, scheduled_at, est_recipients, est_segments, est_cost_cents, created_by)
  values (new_id, p_restaurant, p_name, p_body, 'sms', p_audience, p_code,
    'scheduled', p_scheduled_at, recipients, p_est_segments, cost, p_user);

  if cost > 0 then
    insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, campaign_id, created_by, note)
    values (p_restaurant, 'reserve', -cost, 'reserve:' || new_id, new_id, p_user,
      'Credit held for a campaign');
  end if;
  return new_id;
end;
$$;

revoke all on function create_campaign(uuid, text, text, text, jsonb, text, timestamptz, integer) from public;
grant execute on function create_campaign(uuid, text, text, text, jsonb, text, timestamptz, integer) to app_user;

-- 3. Ask for a top up. Records a pending payment only. No money moves here.
create or replace function request_topup(
  p_restaurant uuid,
  p_user text,
  p_amount_cents integer,
  p_reference text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  caller_role text;
  caller_restaurant uuid;
  new_id uuid := gen_random_uuid();
begin
  select role, restaurant_id into caller_role, caller_restaurant
  from app_user where user_id = p_user;
  if caller_role not in ('owner', 'manager') or caller_restaurant is distinct from p_restaurant then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_amount_cents <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  insert into payment (id, restaurant_id, kind, amount_cents, status, reference, requested_by)
  values (new_id, p_restaurant, 'topup', p_amount_cents, 'pending', p_reference, p_user);
  return new_id;
end;
$$;

revoke all on function request_topup(uuid, text, integer, text) from public;
grant execute on function request_topup(uuid, text, integer, text) to app_user;
