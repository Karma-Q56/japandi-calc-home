-- Phase D25: monthly subscriptions, renewals, failed payments, 7 day grace, pausing campaigns.
-- Not applied by the build. Test on the preview database first.
--
-- SECURITY: every function here is SECURITY DEFINER with a fixed search_path, is revoked
-- from public and granted to app_user only (helpers excepted). Money stays in integer cents.

-- 1. The subscription: one row per restaurant that pays monthly by card.
create table subscription (
  restaurant_id   uuid primary key references restaurant(id) on delete cascade,
  plan            plan_tier not null,
  state           text not null check (state in ('active', 'past_due', 'cancelled')),
  provider_token  text,
  last_paid_at    timestamptz,
  next_due_at     timestamptz,
  past_due_since  timestamptz,
  grace_ends_at   timestamptz,
  updated_at      timestamptz not null default now()
);
alter table subscription enable row level security;
alter table subscription force row level security;
create policy tenant_read on subscription for select
  using (restaurant_id = app_restaurant() or app_is_operator());
create policy operator_all on subscription for all
  using (app_is_operator()) with check (app_is_operator());
revoke all on subscription from public;
grant select on subscription to app_user;

-- 2. One row per PayFast notice, so a repeated notice never counts twice.
--    No grants to app_user: only the definer functions below touch this table.
create table subscription_charge (
  provider_ref    text primary key,
  restaurant_id   uuid not null references restaurant(id) on delete cascade,
  payment_id      uuid not null references payment(id),
  outcome         text not null check (outcome in ('paid', 'failed')),
  amount_cents    integer not null,
  created_at      timestamptz not null default now()
);
alter table subscription_charge enable row level security;
alter table subscription_charge force row level security;
create policy operator_all on subscription_charge for all
  using (app_is_operator()) with check (app_is_operator());
revoke all on subscription_charge from public;

-- 3. Is this restaurant's campaign sending paused? True when:
--    a monthly payment failed and the 7 day grace has ended; or the monthly plan was cancelled
--    and its last due date has passed; or an invoice is open more than 7 days after its due date.
--    Helper: not granted to app_user.
create or replace function billing_paused(p_restaurant uuid) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  result boolean;
begin
  perform set_config('app.is_operator', 'true', true);
  result := exists (
    select 1 from subscription s
    where s.restaurant_id = p_restaurant and (
      (s.state = 'past_due' and s.grace_ends_at < now())
      or (s.state = 'cancelled' and s.next_due_at < now())
    )
  ) or exists (
    select 1 from invoice i
    where i.restaurant_id = p_restaurant and i.status = 'open'
      and i.due_date + 7 < current_date
  );
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return result;
end;
$$;
revoke all on function billing_paused(uuid) from public;

-- 4. Settle a card payment. Same rules as 0032 for one-off payments. Monthly payments
--    (kind 'subscription') also keep the subscription row and handle renewals and failures.
--    Result: 'paid', 'renewed', 'past_due', 'cancelled', 'already_paid' or 'ignored'.
--    Refusals: not_allowed, bad_outcome, payment_not_found, amount_mismatch.
drop function settle_card_payment(uuid, integer, text, text);
create function settle_card_payment(
  p_payment_id uuid, p_amount_cents integer, p_provider_ref text, p_outcome text,
  p_token text default null
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p       payment%rowtype;
  s       subscription%rowtype;
  prior_operator text := current_setting('app.is_operator', true);
  ref_text text := nullif(btrim(coalesce(p_provider_ref, '')), '');
begin
  if app_restaurant() is not null or app_customer() is not null then
    raise exception 'not_allowed';
  end if;
  if p_outcome is null or p_outcome not in ('paid', 'failed', 'cancelled') then
    raise exception 'bad_outcome';
  end if;
  perform set_config('app.is_operator', 'true', true);
  select * into p from payment where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found';
  end if;

  -- A monthly payment that is already paid: this notice is a renewal (or a repeat).
  if p.status = 'paid' and p.kind = 'subscription' then
    if ref_text is null or exists (select 1 from subscription_charge where provider_ref = ref_text) then
      perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
      return 'already_paid';
    end if;
    if p_outcome = 'paid' and p_amount_cents <> p.amount_cents then
      raise exception 'amount_mismatch';
    end if;
    select * into s from subscription where restaurant_id = p.restaurant_id for update;
    if p_outcome = 'paid' then
      insert into subscription_charge (provider_ref, restaurant_id, payment_id, outcome, amount_cents)
        values (ref_text, p.restaurant_id, p.id, 'paid', p_amount_cents);
      update subscription set state = 'active', last_paid_at = now(),
        next_due_at = now() + interval '1 month', past_due_since = null, grace_ends_at = null,
        provider_token = coalesce(p_token, provider_token), updated_at = now()
        where restaurant_id = p.restaurant_id;
      insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
        values ('system', 'payfast', p.restaurant_id, 'subscription_renewed', 'payment', p.id::text,
                jsonb_build_object('amount_cents', p_amount_cents, 'provider_ref', ref_text));
      perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
      return 'renewed';
    elsif p_outcome = 'failed' then
      insert into subscription_charge (provider_ref, restaurant_id, payment_id, outcome, amount_cents)
        values (ref_text, p.restaurant_id, p.id, 'failed', p_amount_cents);
      if s.state = 'past_due' then
        update subscription set updated_at = now() where restaurant_id = p.restaurant_id;
      else
        update subscription set state = 'past_due', past_due_since = now(),
          grace_ends_at = now() + interval '7 days', updated_at = now()
          where restaurant_id = p.restaurant_id;
      end if;
      insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
        values ('system', 'payfast', p.restaurant_id, 'subscription_payment_failed', 'payment', p.id::text,
                jsonb_build_object('amount_cents', p_amount_cents, 'provider_ref', ref_text));
      perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
      return 'past_due';
    else
      update subscription set state = 'cancelled', updated_at = now()
        where restaurant_id = p.restaurant_id;
      insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
        values ('system', 'payfast', p.restaurant_id, 'subscription_cancelled', 'payment', p.id::text,
                jsonb_build_object('provider_ref', ref_text));
      perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
      return 'cancelled';
    end if;
  end if;

  if p.status = 'paid' then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 'already_paid';
  end if;
  if p_outcome <> 'paid' then
    update payment set status = (case when p_outcome = 'cancelled' then 'cancelled' else 'failed' end)::payment_status,
      provider_ref = p_provider_ref where id = p_payment_id;
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 'ignored';
  end if;
  if p_amount_cents <> p.amount_cents then
    raise exception 'amount_mismatch';
  end if;
  update payment set status = 'paid', confirmed_at = now(), provider_ref = p_provider_ref
    where id = p_payment_id;
  if p.kind = 'topup' then
    insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, payment_id, note, created_by)
      values (p.restaurant_id, 'topup', p.amount_cents, 'payment:' || p.id::text, p.id,
              'Card top up', 'payfast')
      on conflict (reference) do nothing;
  end if;
  if p.kind = 'subscription' and p.plan is not null then
    update restaurant set plan = p.plan where id = p.restaurant_id;
    insert into subscription (restaurant_id, plan, state, provider_token, last_paid_at, next_due_at)
      values (p.restaurant_id, p.plan, 'active', p_token, now(), now() + interval '1 month')
      on conflict (restaurant_id) do update set plan = excluded.plan, state = 'active',
        provider_token = coalesce(excluded.provider_token, subscription.provider_token),
        last_paid_at = excluded.last_paid_at, next_due_at = excluded.next_due_at,
        past_due_since = null, grace_ends_at = null, updated_at = now();
    if ref_text is not null then
      insert into subscription_charge (provider_ref, restaurant_id, payment_id, outcome, amount_cents)
        values (ref_text, p.restaurant_id, p.id, 'paid', p.amount_cents)
        on conflict (provider_ref) do nothing;
    end if;
  end if;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('system', 'payfast', p.restaurant_id, 'payment_paid', 'payment', p.id::text,
            jsonb_build_object('kind', p.kind::text, 'amount_cents', p.amount_cents,
                               'plan', p.plan::text));
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return 'paid';
end;
$$;
revoke all on function settle_card_payment(uuid, integer, text, text, text) from public;
grant execute on function settle_card_payment(uuid, integer, text, text, text) to app_user;

-- 5. Find the monthly payment for a PayFast subscription token. Used when a notice has no
--    usable m_payment_id. Result: the payment id, or null.
--    Refusals: not_allowed (any restaurant or guest context).
create or replace function find_subscription_payment(p_token text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  found_id uuid;
  prior_operator text := current_setting('app.is_operator', true);
begin
  if app_restaurant() is not null or app_customer() is not null then
    raise exception 'not_allowed';
  end if;
  if nullif(btrim(coalesce(p_token, '')), '') is null then
    return null;
  end if;
  perform set_config('app.is_operator', 'true', true);
  select p.id into found_id
  from subscription s
  join payment p on p.restaurant_id = s.restaurant_id and p.kind = 'subscription'
  where s.provider_token = p_token
  order by p.created_at desc
  limit 1;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return found_id;
end;
$$;
revoke all on function find_subscription_payment(text) from public;
grant execute on function find_subscription_payment(text) to app_user;

-- 6. Claim the campaigns that are due. A paused restaurant's campaigns stay scheduled
--    and go out after it pays. Body copied from 0027; only the billing_paused rule is new.
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
      and coalesce(c.scheduled_at, c.created_at) <= p_now
      and not billing_paused(c.restaurant_id)
    order by coalesce(c.scheduled_at, c.created_at)
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

-- 7. Operator sets a restaurant's monthly payment state by hand (for example after an EFT).
--    'active' clears past due and sets the next due date one month on. 'cancelled' keeps the
--    next due date, so campaigns pause on that date. Creates the row if missing.
--    Refusals: not_operator, restaurant_not_found, bad_state, bad_note.
create or replace function operator_set_subscription_state(
  p_operator_id text, p_restaurant_id uuid, p_state text, p_note text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r restaurant%rowtype;
  clean_note text := btrim(coalesce(p_note, ''));
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  if p_state is null or p_state not in ('active', 'cancelled') then
    raise exception 'bad_state';
  end if;
  if char_length(clean_note) < 3 or char_length(clean_note) > 300 then
    raise exception 'bad_note';
  end if;
  select * into r from restaurant where id = p_restaurant_id;
  if not found then
    raise exception 'restaurant_not_found';
  end if;

  insert into subscription (restaurant_id, plan, state, last_paid_at, next_due_at)
    values (p_restaurant_id, r.plan, p_state,
            case when p_state = 'active' then now() end,
            case when p_state = 'active' then now() + interval '1 month' end)
    on conflict (restaurant_id) do update set state = excluded.state,
      last_paid_at = case when p_state = 'active' then now() else subscription.last_paid_at end,
      next_due_at = case when p_state = 'active' then now() + interval '1 month' else subscription.next_due_at end,
      past_due_since = case when p_state = 'active' then null else subscription.past_due_since end,
      grace_ends_at = case when p_state = 'active' then null else subscription.grace_ends_at end,
      updated_at = now();

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, p_restaurant_id, 'subscription_set_by_operator', 'subscription',
            p_restaurant_id::text, jsonb_build_object('state', p_state, 'note', clean_note));
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;
revoke all on function operator_set_subscription_state(text, uuid, text, text) from public;
grant execute on function operator_set_subscription_state(text, uuid, text, text) to app_user;

-- 8. Create a campaign. Body copied from 0033; only the billing_paused rule is new.
--    Refusal: billing_paused (a monthly payment has been missing past the grace, or an invoice is overdue).
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
  if billing_paused(p_restaurant) then
    raise exception 'billing_paused' using errcode = 'P0001';
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

-- 9. One restaurant for the operator. Body copied from 0036; only the 'subscription' key is new.
--    Refusals: not_operator, restaurant_not_found.
create or replace function operator_restaurant_detail(p_operator_id text, p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r         restaurant%rowtype;
  result    jsonb;
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  select * into r from restaurant where id = p_restaurant_id;
  if not found then
    raise exception 'restaurant_not_found';
  end if;

  result := jsonb_build_object(
    'restaurant', jsonb_build_object('id', r.id, 'name', r.name, 'slug', r.slug, 'status', r.status::text,
                                     'plan', r.plan::text, 'suburb', r.suburb, 'created_at', r.created_at),
    'people', coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'role', u.role) order by u.role, u.email)
                        from app_user u where u.restaurant_id = r.id and u.role in ('owner', 'manager')), '[]'::jsonb),
    'counts', jsonb_build_object(
      'members', (select count(*) from membership m where m.restaurant_id = r.id),
      'stamps_30_days', (select count(*) from stamp_event s where s.restaurant_id = r.id and s.status = 'valid'
                         and s.created_at > now() - interval '30 days'),
      'active_locations', (select count(*) from location l where l.restaurant_id = r.id and l.active)),
    'credit_cents', coalesce((select sum(c.amount_cents) from credit_ledger c where c.restaurant_id = r.id), 0),
    'ledger', coalesce((select jsonb_agg(x order by x.created_at desc) from (
                          select c.entry_type::text as entry_type, c.amount_cents, c.note, c.reference, c.created_at
                          from credit_ledger c where c.restaurant_id = r.id
                          order by c.created_at desc limit 20) x), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(x order by x.created_at desc) from (
                         select a.action, a.actor_type, a.meta, a.created_at
                         from audit_event a where a.restaurant_id = r.id
                         order by a.created_at desc limit 20) x), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(x order by x.created_at desc) from (
                            select i.id, i.amount_cents, i.description, i.due_date, i.status, i.paid_at, i.created_at
                            from invoice i where i.restaurant_id = r.id
                            order by i.created_at desc limit 10) x), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(x order by x.created_at desc) from (
                            select p.id, p.kind::text as kind, p.amount_cents, p.status::text as status,
                                   p.reference, p.provider, p.created_at,
                                   coalesce((select sum(f.amount_cents) from refund f where f.payment_id = p.id), 0) as refunded_cents
                            from payment p where p.restaurant_id = r.id
                            order by p.created_at desc limit 10) x), '[]'::jsonb),
    'pending_topups', coalesce((select jsonb_agg(x order by x.created_at) from (
                            select p.id, p.amount_cents, p.reference, p.created_at
                            from payment p where p.restaurant_id = r.id and p.kind = 'topup'
                              and p.status = 'pending' and p.provider = 'manual_eft'
                            order by p.created_at) x), '[]'::jsonb),
    'subscription', (select jsonb_build_object(
                        'state', s.state, 'plan', s.plan::text,
                        'last_paid_at', s.last_paid_at, 'next_due_at', s.next_due_at,
                        'grace_ends_at', s.grace_ends_at, 'paused', billing_paused(r.id))
                     from subscription s where s.restaurant_id = r.id)
  );

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return result;
end;
$$;
revoke all on function operator_restaurant_detail(text, uuid) from public;
grant execute on function operator_restaurant_detail(text, uuid) to app_user;
