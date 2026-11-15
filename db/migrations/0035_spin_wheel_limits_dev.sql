-- 0035 spin wheel weekly prize limits (D12d follow-up). NOT APPLIED.
-- Each prize can have a weekly limit: the most times it can be won in any 7 days (a count, never money).
-- A prize at its limit leaves the wheel. When every real prize has hit its limit the wheel stops: guests keep
-- the spins they earned (the guest state still counts them, with paused = true) and spin again once a win is
-- more than 7 days old. A try again slot has no limit and
-- never keeps the wheel going on its own.
--
-- SECURITY
-- - Helpers are not granted to the app role. The functions below keep the grants they had in 0019.
-- - Spins on one wheel run one at a time (the settings row is locked), so two guests cannot both take the last win.

alter table spin_prize
  add column if not exists weekly_cap smallint
  check (weekly_cap is null or weekly_cap between 1 and 10000);

create index if not exists spin_result_prize_week on spin_result (restaurant_id, segment_id, won_at desc);

-- Has this prize been won as often as its weekly limit in the last 7 days?
create or replace function spin_prize_capped(p_prize uuid)
returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    (select p.weekly_cap is not null
            and (select count(*) from spin_result r
                 where r.restaurant_id = p.restaurant_id and r.segment_id = p.id::text
                   and r.won_at >= now() - interval '7 days') >= p.weekly_cap
     from spin_prize p where p.id = p_prize),
    false)
$$;

-- Real prizes (not a try again) this wheel could give: pool_real ignores limits, open_real is what is left.
create or replace function spin_real_counts(p_restaurant uuid, p_mode text, p_floor integer)
returns table (pool_real integer, open_real integer)
language sql stable set search_path = public, pg_temp as $$
  select count(*)::integer,
         (count(*) filter (where not spin_prize_capped(id)))::integer
  from spin_prize
  where restaurant_id = p_restaurant and weight > 0 and prize_type <> 'nothing'
    and spin_prize_eligible(prize_type, value_cents, p_mode, p_floor)
$$;

revoke all on function spin_prize_capped(uuid) from public;
revoke all on function spin_real_counts(uuid, text, integer) from public;

create or replace function spin_pick_prize(p_restaurant uuid, p_mode text, p_floor integer)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  total bigint;
  ticket double precision;
  p record;
  last_id uuid := null;
  real_pool integer;
  real_open integer;
begin
  -- Real prizes exist but every one has hit its weekly limit: the wheel stops.
  select pool_real, open_real into real_pool, real_open from spin_real_counts(p_restaurant, p_mode, p_floor);
  if real_pool > 0 and real_open = 0 then
    return null;
  end if;
  select coalesce(sum(weight), 0) into total
    from spin_prize
    where restaurant_id = p_restaurant and weight > 0
      and spin_prize_eligible(prize_type, value_cents, p_mode, p_floor)
      and not spin_prize_capped(id);
  if total <= 0 then
    return null;
  end if;
  ticket := spin_random() * total;
  for p in
    select id, weight from spin_prize
      where restaurant_id = p_restaurant and weight > 0
        and spin_prize_eligible(prize_type, value_cents, p_mode, p_floor)
      and not spin_prize_capped(id)
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

revoke all on function spin_pick_prize(uuid, text, integer) from public;

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
  cap smallint;
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
    stp := null; pct := null; amt := null; days := null; val := 0; cap := null;
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
    -- A weekly limit is a count of wins in any 7 days (not money). A try again slot never has one.
    if v ? 'weeklyCap' and v->>'weeklyCap' is not null and typ <> 'nothing' then
      if v->>'weeklyCap' !~ '^[0-9]{1,5}$' or (v->>'weeklyCap')::integer not between 1 and 10000 then
        raise exception 'invalid_value';
      end if;
      cap := (v->>'weeklyCap')::smallint;
    end if;
    -- Saved by position, so the wins counted against a prize's weekly limit survive an edit.
    insert into spin_prize (restaurant_id, position, label, weight, prize_type, stamps, percent_off,
                            amount_off_cents, value_cents, valid_days, weekly_cap)
      values (rid, el.n::smallint, lbl, wt, typ, stp, pct, amt, val, days, cap)
      on conflict (restaurant_id, position) do update
        set label = excluded.label, weight = excluded.weight, prize_type = excluded.prize_type,
            stamps = excluded.stamps, percent_off = excluded.percent_off,
            amount_off_cents = excluded.amount_off_cents, value_cents = excluded.value_cents,
            valid_days = excluded.valid_days, weekly_cap = excluded.weekly_cap;
    if wt > 0 and typ <> 'nothing' and spin_prize_eligible(typ, val, p_mode, p_floor_cents) then
      winners := winners + 1;
    end if;
  end loop;
  delete from spin_prize where restaurant_id = rid and position > jsonb_array_length(p_prizes);
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
    if (select pool_real from spin_real_counts(rid, cfg.mode, cfg.reward_floor_cents)) > 0 then
      raise exception 'prizes_gone';
    end if;
    raise exception 'no_prizes';
  end if;
  return query select p.id, p.label, p.prize_type from spin_prize p where p.id = picked;
end;
$$;

revoke all on function test_spin_wheel(text) from public;
grant execute on function test_spin_wheel(text) to app_user;

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
  real_pool integer;
  real_open integer;
  paused boolean := false;
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
  select pool_real, open_real into real_pool, real_open from spin_real_counts(m.restaurant_id, cfg.mode, cfg.reward_floor_cents);
  paused := real_pool > 0 and real_open = 0;
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
    'enabled', true, 'mode', cfg.mode, 'available', avail, 'paused', paused, 'visitsToNext', to_next,
    'earnEvery', cfg.earn_every_visits, 'prizes', prizes,
    'advertisedReward', (select reward_description from restaurant where id = m.restaurant_id)
  );
end;
$$;

revoke all on function spin_state_for_guest(uuid) from public;
grant execute on function spin_state_for_guest(uuid) to app_user;

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

  -- Locking the settings row makes spins on one wheel run one at a time, so a weekly limit is never passed.
  select * into cfg from spin_config where restaurant_id = m.restaurant_id for update;
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
  if picked is null then
    if (select pool_real from spin_real_counts(m.restaurant_id, cfg.mode, cfg.reward_floor_cents)) > 0 then
      -- Every real prize has hit its weekly limit. Nothing is used up: the guest keeps their spin.
      raise exception 'prizes_gone';
    elsif cfg.mode <> 'reward_decider' then
      raise exception 'no_prizes';
    end if;
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
