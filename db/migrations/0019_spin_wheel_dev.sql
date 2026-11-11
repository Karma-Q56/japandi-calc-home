-- 0019 spin wheel (live, D12d). NOT APPLIED.
-- Written to be applied after 0001, 0003, 0008, 0016 and 0018.

-- ---------------------------------------------------------------- wheel settings on restaurant
alter table restaurant
  add column if not exists spin_enabled boolean not null default false,
  add column if not exists spin_mode text not null default 'earned',
  add column if not exists spin_earn_every_visits smallint not null default 5;

alter table restaurant drop constraint if exists restaurant_spin_check;
alter table restaurant add constraint restaurant_spin_check check (
  spin_mode in ('join', 'earned', 'reward_decider')
  and spin_earn_every_visits between 1 and 100
);

-- ---------------------------------------------------------------- prizes (at most 8 per restaurant)
create table if not exists spin_prize (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  position smallint not null,
  label text not null,
  weight integer not null,
  reward_type text not null,
  bonus_stamps smallint,
  reward_item text,
  reward_percent_off smallint,
  reward_amount_off_cents integer,
  reward_valid_days smallint,
  created_at timestamptz not null default now(),
  unique (restaurant_id, position),
  constraint spin_prize_label_check check (length(trim(label)) between 1 and 80),
  constraint spin_prize_weight_check check (weight between 1 and 1000),
  constraint spin_prize_position_check check (position between 1 and 8),
  constraint spin_prize_reward_check check (
    (reward_type = 'stamps' and bonus_stamps between 1 and 5
       and reward_item is null and reward_percent_off is null and reward_amount_off_cents is null)
    or (reward_type = 'free_item' and reward_item is not null and length(trim(reward_item)) between 1 and 80
       and bonus_stamps is null and reward_percent_off is null and reward_amount_off_cents is null)
    or (reward_type = 'percent_off' and reward_percent_off between 1 and 100
       and bonus_stamps is null and reward_item is null and reward_amount_off_cents is null)
    or (reward_type = 'amount_off' and reward_amount_off_cents > 0
       and bonus_stamps is null and reward_item is null and reward_percent_off is null)
  ),
  constraint spin_prize_valid_days_check check (reward_valid_days is null or reward_valid_days between 1 and 365)
);

-- Count check: a restaurant can never hold more than 8 prizes, even under concurrent inserts.
create or replace function spin_prize_limit() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform 1 from restaurant where id = new.restaurant_id for update;
  if (select count(*) from spin_prize where restaurant_id = new.restaurant_id) >= 8 then
    raise exception 'too_many_prizes';
  end if;
  return new;
end;
$$;

drop trigger if exists spin_prize_limit on spin_prize;
create trigger spin_prize_limit before insert on spin_prize
  for each row execute function spin_prize_limit();

alter table spin_prize enable row level security;
alter table spin_prize force row level security;
drop policy if exists tenant_all on spin_prize;
create policy tenant_all on spin_prize
  using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());

grant select, insert, update, delete on spin_prize to app_user;

-- ---------------------------------------------------------------- spin credits per member
create table if not exists spin_credit (
  membership_id uuid primary key references membership(id) on delete cascade,
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  earned integer not null default 0,
  used integer not null default 0,
  constraint spin_credit_check check (used >= 0 and used <= earned)
);

alter table spin_credit enable row level security;
alter table spin_credit force row level security;
drop policy if exists tenant_all on spin_credit;
create policy tenant_all on spin_credit
  using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());

grant select, insert, update, delete on spin_credit to app_user;

-- ---------------------------------------------------------------- spin_result: link each result to its spin id and prize
alter table spin_result
  add column if not exists spin_key text,
  add column if not exists prize_id uuid references spin_prize(id) on delete set null,
  add column if not exists reward_id uuid references reward(id) on delete set null;

create unique index if not exists spin_result_key_idx
  on spin_result (restaurant_id, spin_key) where spin_key is not null;

-- ---------------------------------------------------------------- give a spin credit (one per join, or per N visits)
create or replace function give_spin_credit(p_restaurant uuid, p_membership uuid, p_count integer)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  new_earned integer;
begin
  if not app_is_operator() and app_restaurant() is distinct from p_restaurant then
    raise exception 'not_allowed';
  end if;
  perform set_config('app.is_operator', 'true', true);
  if not exists (select 1 from membership where id = p_membership and restaurant_id = p_restaurant) then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    raise exception 'not_a_member';
  end if;
  insert into spin_credit (membership_id, restaurant_id, earned, used)
    values (p_membership, p_restaurant, greatest(p_count, 0), 0)
    on conflict (membership_id) do update set earned = spin_credit.earned + greatest(p_count, 0)
    returning earned into new_earned;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return new_earned;
end;
$$;

revoke all on function give_spin_credit(uuid, uuid, integer) from public;
grant execute on function give_spin_credit(uuid, uuid, integer) to app_user;

-- ---------------------------------------------------------------- spin_wheel: the only way a guest spins
-- The database picks the prize (weighted, in SQL), uses one credit, and pays the prize in the same
-- transaction. A repeated call with the same p_spin_key returns the stored result and pays nothing again.
create or replace function spin_wheel(p_membership uuid, p_spin_key text)
returns table (out_result text, out_label text, out_prize_id uuid, out_reward_id uuid, out_bonus_stamps integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  m membership%rowtype;
  cr spin_credit%rowtype;
  prior spin_result%rowtype;
  pick spin_prize%rowtype;
  total integer;
  ticket numeric;
  new_reward uuid := null;
  stamp_id uuid;
begin
  select * into m from membership where id = p_membership for update;
  if not found then
    raise exception 'not_a_member';
  end if;
  if not app_is_operator() and app_restaurant() is distinct from m.restaurant_id then
    raise exception 'not_allowed';
  end if;
  perform set_config('app.is_operator', 'true', true);

  -- Same spin id: return the stored result, never pay twice.
  select * into prior from spin_result
    where restaurant_id = m.restaurant_id and spin_key = p_spin_key;
  if found then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return query select 'duplicate_retry'::text, prior.label, prior.prize_id, prior.reward_id, null::integer;
    return;
  end if;

  select * into cr from spin_credit where membership_id = m.id for update;
  if not found or cr.earned - cr.used <= 0 then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return query select 'no_spin'::text, null::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  select coalesce(sum(weight), 0) into total from spin_prize where restaurant_id = m.restaurant_id;
  if total <= 0 then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return query select 'no_prizes'::text, null::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  -- Weighted pick: a random ticket in [0, total), then walk the prizes by position.
  ticket := random() * total;
  for pick in
    select * from spin_prize where restaurant_id = m.restaurant_id order by position
  loop
    ticket := ticket - pick.weight;
    exit when ticket < 0;
  end loop;

  update spin_credit set used = used + 1 where membership_id = m.id;

  if pick.reward_type = 'stamps' then
    insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key, reason)
      values (m.restaurant_id, m.id, null, 'spin:' || p_spin_key, 'bonus')
      on conflict (restaurant_id, idempotency_key) do nothing
      returning id into stamp_id;
    if stamp_id is not null then
      update membership set stamps_current = stamps_current + pick.bonus_stamps,
                            stamps_total = stamps_total + pick.bonus_stamps
        where id = m.id;
    end if;
  else
    new_reward := grant_reward(
      m.restaurant_id, m.id, pick.reward_type, pick.label,
      pick.reward_percent_off, pick.reward_amount_off_cents,
      'spin', null, pick.reward_valid_days
    );
  end if;

  insert into spin_result (restaurant_id, membership_id, segment_id, label, value_cents, won_at,
                           spin_key, prize_id, reward_id)
    values (m.restaurant_id, m.id, pick.id::text, pick.label, 0, now(),
            p_spin_key, pick.id, new_reward);

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return query select 'won'::text, pick.label, pick.id, new_reward, pick.bonus_stamps::integer;
end;
$$;

revoke all on function spin_wheel(uuid, text) from public;
grant execute on function spin_wheel(uuid, text) to app_user;
