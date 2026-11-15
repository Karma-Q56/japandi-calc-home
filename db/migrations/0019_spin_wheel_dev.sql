-- Phase D12d: the spin wheel for real restaurants and guests.
-- Not applied by the build. Test on the preview database first. Written to be applied after 0003, 0016 and 0018
-- (it needs spin_result, grant_reward and stamp_event.reason).
--
-- SECURITY:
-- - The server decides every result, in SQL, with random numbers made by the database (gen_random_uuid is
--   cryptographically random). The browser only animates the result it is given.
-- - A guest can only spin through spin_wheel(), which takes the membership the SERVER found for the signed-in guest and
--   refuses unless that membership belongs to app_customer(). It uses up one spin in the same transaction as the prize,
--   and the table itself refuses used > earned, so nobody can spin more than they have earned.
-- - One spin id pays once: (membership, spin id) is unique, and a repeated call returns the stored result.
-- - Owners change the wheel only through save_spin_wheel(), which takes the signed-in user id from the SERVER and uses
--   owner_restaurant_for_user. Wheel tables are read-only for the app role. Prizes are at most 8 (position 1 to 8, unique).
-- - Prizes are given only by grant_reward (free item, percent off, rand off) or as bonus stamps, never by the app.
-- - Helpers (random, pick, eligibility) are not granted to the app role.
-- - Every function that switches on operator context puts the caller's value back before it returns.

-- 1. Wheel settings per restaurant.
create table if not exists spin_config (
  restaurant_id uuid primary key references restaurant(id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'earned' check (mode in ('join', 'earned', 'reward_decider')),
  earn_every_visits smallint not null default 5 check (earn_every_visits between 1 and 50),
  reward_floor_cents integer not null default 0 check (reward_floor_cents between 0 and 1000000),
  updated_at timestamptz not null default now()
);

-- 2. Up to 8 prizes per restaurant. Position 1 to 8 and unique per restaurant is the "8 or fewer" rule.
create table if not exists spin_prize (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  position smallint not null check (position between 1 and 8),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  weight integer not null check (weight between 0 and 1000),
  prize_type text not null check (prize_type in ('nothing', 'stamps', 'free_item', 'percent_off', 'amount_off')),
  stamps smallint,
  percent_off smallint,
  amount_off_cents integer,
  value_cents integer not null default 0 check (value_cents between 0 and 1000000),
  valid_days smallint check (valid_days is null or valid_days between 1 and 365),
  unique (restaurant_id, position),
  -- A check passes when it evaluates to NULL, so each value is tested with "is not null" as well.
  check (
    (prize_type = 'nothing' and stamps is null and percent_off is null and amount_off_cents is null)
    or (prize_type = 'stamps' and stamps is not null and stamps between 1 and 5
        and percent_off is null and amount_off_cents is null)
    or (prize_type = 'free_item' and stamps is null and percent_off is null and amount_off_cents is null)
    or (prize_type = 'percent_off' and percent_off is not null and percent_off between 1 and 100
        and stamps is null and amount_off_cents is null)
    or (prize_type = 'amount_off' and amount_off_cents is not null and amount_off_cents > 0
        and stamps is null and percent_off is null)
  )
);

-- 3. Spins a guest has earned from visits. used can never pass earned.
create table if not exists spin_credit (
  membership_id uuid primary key references membership(id) on delete cascade,
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  visits_toward integer not null default 0 check (visits_toward >= 0),
  earned integer not null default 0 check (earned >= 0),
  used integer not null default 0 check (used >= 0),
  last_stamp_id uuid,
  check (used <= earned)
);

-- 4. What each spin gave. One row per spin id; one welcome spin per member; one decided reward per spin.
alter table spin_result
  add column if not exists spin_id uuid,
  add column if not exists mode text,
  add column if not exists prize_type text,
  add column if not exists reward_id uuid references reward(id) on delete set null,
  add column if not exists bonus_stamps smallint,
  add column if not exists kept_advertised boolean not null default false;
create unique index if not exists spin_result_spin_once on spin_result (membership_id, spin_id) where spin_id is not null;
create unique index if not exists spin_result_join_once on spin_result (membership_id) where mode = 'join';
create unique index if not exists spin_result_decide_once on spin_result (reward_id) where mode = 'reward_decider';

-- 5. Row level security. Owners read their own restaurant's wheel. Writes happen only in the functions below.
alter table spin_config enable row level security;
alter table spin_config force row level security;
drop policy if exists tenant_read on spin_config;
create policy tenant_read on spin_config for select
  using (restaurant_id = app_restaurant() or app_is_operator());

alter table spin_prize enable row level security;
alter table spin_prize force row level security;
drop policy if exists tenant_read on spin_prize;
create policy tenant_read on spin_prize for select
  using (restaurant_id = app_restaurant() or app_is_operator());

alter table spin_credit enable row level security;
alter table spin_credit force row level security;
drop policy if exists tenant_read on spin_credit;
create policy tenant_read on spin_credit for select
  using (restaurant_id = app_restaurant() or app_is_operator());

grant select on spin_config, spin_prize, spin_credit to app_user;

-- 6. Spin results are written only by spin_wheel(). The app role keeps read access (the existing policies).
revoke insert, update, delete on spin_result from app_user;

-- 7. Helpers, not callable by the app role.
create or replace function spin_random()
returns double precision
language sql volatile set search_path = public, pg_temp as $$
  select (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 13))::bit(52)::bigint)::double precision
         / 4503599627370496.0
$$;

-- Which prizes a wheel may land on. Welcome spins always hand something over. The reward decider only draws real
-- rewards worth at least the floor, so a guest never gets less than the card promised.
create or replace function spin_prize_eligible(p_type text, p_value integer, p_mode text, p_floor integer)
returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case p_mode
    when 'join' then p_type <> 'nothing'
    when 'reward_decider' then p_type in ('free_item', 'percent_off', 'amount_off') and p_value >= p_floor
    else true
  end
$$;

-- The weighted draw. Returns null when nothing can be won.
create or replace function spin_pick_prize(p_restaurant uuid, p_mode text, p_floor integer)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  total bigint;
  ticket double precision;
  p record;
  last_id uuid := null;
begin
  select coalesce(sum(weight), 0) into total
    from spin_prize
    where restaurant_id = p_restaurant and weight > 0
      and spin_prize_eligible(prize_type, value_cents, p_mode, p_floor);
  if total <= 0 then
    return null;
  end if;
  ticket := spin_random() * total;
  for p in
    select id, weight from spin_prize
      where restaurant_id = p_restaurant and weight > 0
        and spin_prize_eligible(prize_type, value_cents, p_mode, p_floor)
      order by position
  loop
    last_id := p.id;
    ticket := ticket - p.weight;
    if ticket < 0 then
      return p.id;
    end if;
  end loop;
  return last_id;
end;
$$;

revoke all on function spin_random() from public;
revoke all on function spin_prize_eligible(text, integer, text, integer) from public;
revoke all on function spin_pick_prize(uuid, text, integer) from public;

-- 8. The owner saves the wheel: settings and all prizes in one go.
--    p_prizes is a JSON list of up to 8 objects: label, weight, type, stamps, percentOff, amountOffCents, valueCents, validDays.
create or replace function save_spin_wheel(
  p_user_id text,
  p_enabled boolean,
  p_mode text,
  p_earn_every integer,
  p_floor_cents integer,
  p_prizes jsonb
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  el record;
  v jsonb;
  lbl text;
  wt integer;
  typ text;
  stp smallint;
  pct smallint;
  amt integer;
  val integer;
  days smallint;
  winners integer := 0;
begin
  rid := owner_restaurant_for_user(p_user_id);
  if p_enabled is null or p_mode is null or p_mode not in ('join', 'earned', 'reward_decider')
     or p_earn_every is null or p_earn_every not between 1 and 50
     or p_floor_cents is null or p_floor_cents not between 0 and 1000000
     or p_prizes is null or jsonb_typeof(p_prizes) <> 'array' then
    raise exception 'invalid_value';
  end if;
  if jsonb_array_length(p_prizes) > 8 then
    raise exception 'too_many_prizes';
  end if;
  perform set_config('app.is_operator', 'true', true);
  delete from spin_prize where restaurant_id = rid;
  for el in select value, ordinality as n from jsonb_array_elements(p_prizes) with ordinality loop
    v := el.value;
    if jsonb_typeof(v) <> 'object' then
      raise exception 'invalid_value';
    end if;
    lbl := btrim(coalesce(v->>'label', ''));
    typ := v->>'type';
    if char_length(lbl) not between 1 and 40
       or coalesce(v->>'weight', '') !~ '^[0-9]{1,4}$'
       or typ is null or typ not in ('nothing', 'stamps', 'free_item', 'percent_off', 'amount_off') then
      raise exception 'invalid_value';
    end if;
    wt := (v->>'weight')::integer;
    if wt > 1000 then
      raise exception 'invalid_value';
    end if;
    stp := null; pct := null; amt := null; days := null; val := 0;
    if typ = 'stamps' then
      if coalesce(v->>'stamps', '') !~ '^[1-5]$' then raise exception 'invalid_value'; end if;
      stp := (v->>'stamps')::smallint;
    elsif typ = 'percent_off' then
      if coalesce(v->>'percentOff', '') !~ '^[0-9]{1,3}$' or (v->>'percentOff')::integer not between 1 and 100 then
        raise exception 'invalid_value';
      end if;
      pct := (v->>'percentOff')::smallint;
    elsif typ = 'amount_off' then
      if coalesce(v->>'amountOffCents', '') !~ '^[0-9]{1,7}$' or (v->>'amountOffCents')::integer not between 1 and 1000000 then
        raise exception 'invalid_value';
      end if;
      amt := (v->>'amountOffCents')::integer;
      val := amt;
    end if;
    if v ? 'valueCents' and v->>'valueCents' is not null then
      if v->>'valueCents' !~ '^[0-9]{1,7}$' or (v->>'valueCents')::integer > 1000000 then
        raise exception 'invalid_value';
      end if;
      val := greatest(val, (v->>'valueCents')::integer);
    end if;
    if v ? 'validDays' and v->>'validDays' is not null then
      if v->>'validDays' !~ '^[0-9]{1,3}$' or (v->>'validDays')::integer not between 1 and 365 then
        raise exception 'invalid_value';
      end if;
      days := (v->>'validDays')::smallint;
    end if;
    insert into spin_prize (restaurant_id, position, label, weight, prize_type, stamps, percent_off,
                            amount_off_cents, value_cents, valid_days)
      values (rid, el.n::smallint, lbl, wt, typ, stp, pct, amt, val, days);
    if wt > 0 and typ <> 'nothing' and spin_prize_eligible(typ, val, p_mode, p_floor_cents) then
      winners := winners + 1;
    end if;
  end loop;
  if p_enabled and winners = 0 then
    raise exception 'no_prizes';
  end if;
  insert into spin_config (restaurant_id, enabled, mode, earn_every_visits, reward_floor_cents, updated_at)
    values (rid, p_enabled, p_mode, p_earn_every::smallint, p_floor_cents, now())
    on conflict (restaurant_id) do update
      set enabled = excluded.enabled, mode = excluded.mode, earn_every_visits = excluded.earn_every_visits,
          reward_floor_cents = excluded.reward_floor_cents, updated_at = now();
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'spin_changed', 'restaurant', rid::text, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

revoke all on function save_spin_wheel(text, boolean, text, integer, integer, jsonb) from public;
grant execute on function save_spin_wheel(text, boolean, text, integer, integer, jsonb) to app_user;

-- 9. "Test the wheel": one draw from the saved wheel. Writes nothing, uses nobody's spin, creates no reward.
create or replace function test_spin_wheel(p_user_id text)
returns table (out_prize_id uuid, out_label text, out_prize_type text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  rid uuid;
  cfg spin_config%rowtype;
  picked uuid;
begin
  rid := owner_restaurant_for_user(p_user_id);
  select * into cfg from spin_config where restaurant_id = rid;
  if not found then
    raise exception 'no_prizes';
  end if;
  picked := spin_pick_prize(rid, cfg.mode, cfg.reward_floor_cents);
  if picked is null then
    raise exception 'no_prizes';
  end if;
  return query select p.id, p.label, p.prize_type from spin_prize p where p.id = picked;
end;
$$;

revoke all on function test_spin_wheel(text) from public;
grant execute on function test_spin_wheel(text) to app_user;

-- 10. After a recorded visit: count it towards the next earned spin. Called by the till after a stamp, inside the
--     restaurant's own context. The same stamp is never counted twice. Only visit stamps count (not bonus stamps).
create or replace function grant_visit_spin(p_restaurant uuid, p_membership uuid, p_stamp uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  cfg spin_config%rowtype;
  c spin_credit%rowtype;
  left_now integer;
begin
  if not app_is_operator() and app_restaurant() is distinct from p_restaurant then
    raise exception 'not_allowed';
  end if;
  perform set_config('app.is_operator', 'true', true);
  if not exists (select 1 from membership where id = p_membership and restaurant_id = p_restaurant) then
    raise exception 'not_a_member';
  end if;
  select * into cfg from spin_config where restaurant_id = p_restaurant;
  if not found or not cfg.enabled or cfg.mode <> 'earned' then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 0;
  end if;
  if not exists (
    select 1 from stamp_event
    where id = p_stamp and membership_id = p_membership and restaurant_id = p_restaurant
      and status = 'valid' and reason = 'visit'
  ) then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 0;
  end if;
  insert into spin_credit (membership_id, restaurant_id) values (p_membership, p_restaurant)
    on conflict (membership_id) do nothing;
  select * into c from spin_credit where membership_id = p_membership for update;
  if c.last_stamp_id is not distinct from p_stamp then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return c.earned - c.used;
  end if;
  if c.visits_toward + 1 >= cfg.earn_every_visits then
    update spin_credit set visits_toward = 0, earned = earned + 1, last_stamp_id = p_stamp
      where membership_id = p_membership returning earned - used into left_now;
  else
    update spin_credit set visits_toward = visits_toward + 1, last_stamp_id = p_stamp
      where membership_id = p_membership returning earned - used into left_now;
  end if;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return left_now;
end;
$$;

revoke all on function grant_visit_spin(uuid, uuid, uuid) from public;
grant execute on function grant_visit_spin(uuid, uuid, uuid) to app_user;

-- 11. What the signed-in guest sees: whether the wheel is on, how many spins they can use and the prize names
--     (never the weights).
create or replace function spin_state_for_guest(p_membership uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m membership%rowtype;
  cfg spin_config%rowtype;
  c spin_credit%rowtype;
  avail integer := 0;
  to_next integer := null;
  prizes jsonb;
  eligible_count integer;
begin
  select * into m from membership where id = p_membership and customer_id = app_customer();
  if not found then
    raise exception 'not_allowed';
  end if;
  select * into cfg from spin_config where restaurant_id = m.restaurant_id;
  if not found or not cfg.enabled then
    return jsonb_build_object('enabled', false, 'available', 0);
  end if;
  select count(*) into eligible_count from spin_prize
    where restaurant_id = m.restaurant_id and weight > 0
      and spin_prize_eligible(prize_type, value_cents, cfg.mode, cfg.reward_floor_cents);
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', label, 'type', prize_type) order by position), '[]'::jsonb)
    into prizes from spin_prize where restaurant_id = m.restaurant_id and weight > 0;
  if eligible_count > 0 then
    if cfg.mode = 'join' then
      avail := case when exists (select 1 from spin_result where membership_id = m.id and mode = 'join') then 0 else 1 end;
    elsif cfg.mode = 'earned' then
      select * into c from spin_credit where membership_id = m.id;
      if found then
        avail := c.earned - c.used;
        to_next := cfg.earn_every_visits - c.visits_toward;
      else
        to_next := cfg.earn_every_visits;
      end if;
    else
      select count(*) into avail from reward r
        where r.membership_id = m.id and r.status = 'available' and r.source = 'stamp_card'
          and (r.expires_at is null or r.expires_at > now())
          and not exists (select 1 from spin_result s where s.reward_id = r.id and s.mode = 'reward_decider');
      avail := least(avail, 1);
    end if;
  end if;
  return jsonb_build_object(
    'enabled', true, 'mode', cfg.mode, 'available', avail, 'visitsToNext', to_next,
    'earnEvery', cfg.earn_every_visits, 'prizes', prizes,
    'advertisedReward', (select reward_description from restaurant where id = m.restaurant_id)
  );
end;
$$;

revoke all on function spin_state_for_guest(uuid) from public;
grant execute on function spin_state_for_guest(uuid) to app_user;

-- 12. The spin. The server draws the prize, uses up one spin and gives the prize in one transaction.
create or replace function spin_wheel(p_membership uuid, p_spin_id uuid)
returns table (
  out_result_id uuid,
  out_status text,
  out_prize_id text,
  out_label text,
  out_prize_type text,
  out_bonus_stamps integer,
  out_reward_id uuid,
  out_kept_advertised boolean
)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  m membership%rowtype;
  cfg spin_config%rowtype;
  prior spin_result%rowtype;
  rw reward%rowtype;
  credit spin_credit%rowtype;
  prize spin_prize%rowtype;
  picked uuid;
  decided uuid := null;
  new_reward uuid := null;
  new_result uuid;
  new_stamp uuid;
  stamps_given integer := null;
  used_credit boolean := false;
begin
  if p_spin_id is null then
    raise exception 'invalid_value';
  end if;
  -- Only the signed-in guest who owns this membership may spin it.
  select * into m from membership where id = p_membership and customer_id = app_customer() for update;
  if not found then
    raise exception 'not_allowed';
  end if;
  perform set_config('app.is_operator', 'true', true);

  -- The same spin id twice returns the same result and pays nothing more.
  select * into prior from spin_result where membership_id = m.id and spin_id = p_spin_id;
  if found then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return query select prior.id, 'repeat'::text, prior.segment_id, prior.label, prior.prize_type,
                        prior.bonus_stamps::integer, prior.reward_id, prior.kept_advertised;
    return;
  end if;

  select * into cfg from spin_config where restaurant_id = m.restaurant_id;
  if not found or not cfg.enabled then
    raise exception 'wheel_off';
  end if;

  if cfg.mode = 'join' then
    if exists (select 1 from spin_result where membership_id = m.id and mode = 'join') then
      raise exception 'no_spin';
    end if;
  elsif cfg.mode = 'earned' then
    select * into credit from spin_credit where membership_id = m.id for update;
    if not found or credit.earned - credit.used <= 0 then
      raise exception 'no_spin';
    end if;
    used_credit := true;
  else
    select r.* into rw from reward r
      where r.membership_id = m.id and r.status = 'available' and r.source = 'stamp_card'
        and (r.expires_at is null or r.expires_at > now())
        and not exists (select 1 from spin_result s where s.reward_id = r.id and s.mode = 'reward_decider')
      order by r.earned_at
      limit 1
      for update;
    if not found then
      raise exception 'no_spin';
    end if;
    decided := rw.id;
  end if;

  picked := spin_pick_prize(m.restaurant_id, cfg.mode, cfg.reward_floor_cents);
  if picked is null and cfg.mode <> 'reward_decider' then
    raise exception 'no_prizes';
  end if;

  if used_credit then
    update spin_credit set used = used + 1 where membership_id = m.id;
  end if;

  if picked is null then
    -- Reward decider with nothing that beats the advertised reward: the guest keeps the reward they earned.
    insert into spin_result (restaurant_id, membership_id, segment_id, label, value_cents, mode, prize_type,
                             spin_id, reward_id, kept_advertised)
      values (m.restaurant_id, m.id, 'advertised', rw.description, 0, cfg.mode, 'free_item', p_spin_id, decided, true)
      returning id into new_result;
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return query select new_result, 'spun'::text, 'advertised'::text, rw.description, rw.kind, null::integer, decided, true;
    return;
  end if;

  select * into prize from spin_prize where id = picked;
  insert into spin_result (restaurant_id, membership_id, segment_id, label, value_cents, mode, prize_type, spin_id)
    values (m.restaurant_id, m.id, prize.id::text, prize.label, prize.value_cents, cfg.mode, prize.prize_type, p_spin_id)
    returning id into new_result;

  if prize.prize_type = 'stamps' then
    insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key, reason)
      values (m.restaurant_id, m.id, null, 'spin:' || new_result::text, 'bonus')
      on conflict (restaurant_id, idempotency_key) do nothing
      returning id into new_stamp;
    -- Add the stamps only when the stamp row is new, so a retry never doubles the bonus.
    if new_stamp is not null then
      update membership set stamps_current = stamps_current + prize.stamps,
                            stamps_total = stamps_total + prize.stamps
        where id = m.id;
      stamps_given := prize.stamps;
      update spin_result set bonus_stamps = prize.stamps where id = new_result;
    end if;
  elsif prize.prize_type in ('free_item', 'percent_off', 'amount_off') then
    if decided is not null then
      -- The house changes the guest's earned reward to the drawn prize. It is never worth less than the floor.
      update reward set description = prize.label, kind = prize.prize_type,
                        percent_off = prize.percent_off, amount_off_cents = prize.amount_off_cents,
                        source = 'spin', source_id = new_result,
                        expires_at = case when prize.valid_days is null then expires_at
                                          else now() + make_interval(days => prize.valid_days) end
        where id = decided;
      new_reward := decided;
    else
      new_reward := grant_reward(m.restaurant_id, m.id, prize.prize_type, prize.label,
                                 prize.percent_off, prize.amount_off_cents, 'spin', new_result, prize.valid_days);
    end if;
    update spin_result set reward_id = new_reward where id = new_result;
  end if;

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return query select new_result, 'spun'::text, prize.id::text, prize.label, prize.prize_type,
                      stamps_given, new_reward, false;
end;
$$;

revoke all on function spin_wheel(uuid, uuid) from public;
grant execute on function spin_wheel(uuid, uuid) to app_user;
