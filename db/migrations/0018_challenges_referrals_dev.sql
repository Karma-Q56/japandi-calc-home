-- 0018 challenges (two kinds) and referrals with all reward types (D12c). NOT APPLIED.
-- Written to be applied after 0001, 0003, 0008, 0016 and 0017.

-- ---------------------------------------------------------------- challenge: kind, rule and reward
alter table challenge
  add column if not exists kind text not null default 'visits',
  add column if not exists weekdays smallint[] not null default '{}',
  add column if not exists start_hour smallint,
  add column if not exists end_hour smallint,
  add column if not exists reward_type text not null default 'stamps',
  add column if not exists reward_percent_off smallint,
  add column if not exists reward_amount_off_cents integer,
  add column if not exists reward_item text,
  add column if not exists reward_valid_days smallint,
  add column if not exists updated_at timestamptz not null default now();

alter table challenge drop constraint if exists challenge_kind_check;
alter table challenge add constraint challenge_kind_check check (
  (kind = 'visits' and cardinality(weekdays) = 0 and start_hour is null and end_hour is null)
  or (kind = 'quiet_days' and cardinality(weekdays) between 1 and 7
      and (start_hour is null) = (end_hour is null)
      and (start_hour is null or (start_hour between 0 and 23 and end_hour between 1 and 24 and end_hour > start_hour)))
);

alter table challenge drop constraint if exists challenge_weekdays_check;
alter table challenge add constraint challenge_weekdays_check
  check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]);

alter table challenge drop constraint if exists challenge_reward_check;
alter table challenge add constraint challenge_reward_check check (
  (reward_type = 'stamps' and bonus_stamps between 1 and 5
     and reward_percent_off is null and reward_amount_off_cents is null and reward_item is null)
  or (reward_type = 'free_item' and reward_item is not null and length(trim(reward_item)) between 1 and 80
     and reward_percent_off is null and reward_amount_off_cents is null)
  or (reward_type = 'percent_off' and reward_percent_off between 1 and 100
     and reward_amount_off_cents is null and reward_item is null)
  or (reward_type = 'amount_off' and reward_amount_off_cents > 0
     and reward_percent_off is null and reward_item is null)
);

alter table challenge drop constraint if exists challenge_valid_days_check;
alter table challenge add constraint challenge_valid_days_check
  check (reward_valid_days is null or reward_valid_days between 1 and 365);

-- ---------------------------------------------------------------- claims (one per member per challenge)
create table if not exists challenge_claim (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  challenge_id uuid not null references challenge(id) on delete cascade,
  membership_id uuid not null references membership(id) on delete cascade,
  reward_id uuid references reward(id) on delete set null,
  stamp_key text,
  claimed_at timestamptz not null default now(),
  unique (challenge_id, membership_id)
);

-- ---------------------------------------------------------------- referral settings on restaurant
alter table restaurant
  add column if not exists referral_enabled boolean not null default false,
  add column if not exists referral_limit_per_month smallint not null default 2,
  add column if not exists referrer_reward_type text not null default 'stamps',
  add column if not exists referrer_reward_item text,
  add column if not exists referrer_reward_percent_off smallint,
  add column if not exists referrer_reward_amount_off_cents integer,
  add column if not exists friend_reward_type text not null default 'stamps',
  add column if not exists friend_reward_item text,
  add column if not exists friend_reward_percent_off smallint,
  add column if not exists friend_reward_amount_off_cents integer,
  add column if not exists referral_reward_valid_days smallint;

alter table restaurant drop constraint if exists restaurant_referral_check;
alter table restaurant add constraint restaurant_referral_check check (
  referral_limit_per_month between 0 and 20
  and referrer_reward_type in ('stamps', 'free_item', 'percent_off', 'amount_off')
  and friend_reward_type in ('stamps', 'free_item', 'percent_off', 'amount_off')
  and (referrer_reward_type <> 'free_item' or length(trim(coalesce(referrer_reward_item, ''))) between 1 and 80)
  and (friend_reward_type <> 'free_item' or length(trim(coalesce(friend_reward_item, ''))) between 1 and 80)
  and (referrer_reward_type <> 'percent_off' or referrer_reward_percent_off between 1 and 100)
  and (friend_reward_type <> 'percent_off' or friend_reward_percent_off between 1 and 100)
  and (referrer_reward_type <> 'amount_off' or referrer_reward_amount_off_cents > 0)
  and (friend_reward_type <> 'amount_off' or friend_reward_amount_off_cents > 0)
  and (referral_reward_valid_days is null or referral_reward_valid_days between 1 and 365)
);

-- ---------------------------------------------------------------- referral codes and referrals
create table if not exists referral_code (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  membership_id uuid not null references membership(id) on delete cascade,
  code text not null check (code ~ '^PAL[A-HJ-NP-Z2-9]{6}$'),
  created_at timestamptz not null default now(),
  unique (membership_id),
  unique (restaurant_id, code)
);

create table if not exists referral (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  referrer_membership_id uuid not null references membership(id) on delete cascade,
  friend_membership_id uuid not null references membership(id) on delete cascade,
  referrer_code text not null,
  status text not null default 'pending' check (status in ('pending', 'rewarded', 'rejected')),
  reject_reason text,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  check (referrer_membership_id <> friend_membership_id),
  check (status <> 'rejected' or reject_reason is not null),
  unique (friend_membership_id)
);

create index if not exists referral_referrer_month
  on referral (referrer_membership_id, rewarded_at) where status = 'rewarded';

-- ---------------------------------------------------------------- row level security (tenant scoped)
alter table challenge_claim enable row level security;
drop policy if exists tenant_all on challenge_claim;
create policy tenant_all on challenge_claim
  using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());

alter table referral_code enable row level security;
drop policy if exists tenant_all on referral_code;
create policy tenant_all on referral_code
  using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());

alter table referral enable row level security;
drop policy if exists tenant_all on referral;
create policy tenant_all on referral
  using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());

-- ---------------------------------------------------------------- grants
-- Reads and simple inserts for the app user. Money and reward writes go only through functions below.
grant select, insert, update, delete on challenge_claim, referral_code, referral to app_user;

-- ---------------------------------------------------------------- progress: counts only the visits that fit the rule
-- Quiet-day rules use Africa/Johannesburg time. Visits outside the weekdays or hours do not count.
create or replace function challenge_progress(p_challenge uuid, p_membership uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int
  from stamp_event se
  join challenge c on c.id = p_challenge
  where se.membership_id = p_membership
    and se.restaurant_id = c.restaurant_id
    and se.status = 'valid'
    and se.reason = 'visit'
    and se.created_at >= now() - make_interval(days => c.window_days)
    and (
      c.kind = 'visits'
      or (
        extract(dow from se.created_at at time zone 'Africa/Johannesburg')::smallint = any (c.weekdays)
        and (c.start_hour is null or extract(hour from se.created_at at time zone 'Africa/Johannesburg')
               between c.start_hour and c.end_hour - 1)
      )
    );
$$;

-- ---------------------------------------------------------------- claim a challenge once (returns reward id if one was made)
-- Stamp bonuses are written as stamp_event rows with reason 'bonus', as in apply_visit_bonuses (0017).
-- Other reward types go through grant_reward (0016).
create or replace function claim_challenge(
  p_restaurant uuid, p_membership uuid, p_challenge uuid, p_stamp_key text, p_monthly_limit integer
) returns table (out_result text, out_reward_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ch challenge%rowtype;
  prior_operator text := current_setting('app.is_operator', true);
  month_claims integer;
  new_reward uuid;
  new_stamp uuid;
begin
  perform set_config('app.is_operator', 'true', true);
  select * into ch from challenge where id = p_challenge and restaurant_id = p_restaurant and active;
  if not found then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return query select 'no_challenge'::text, null::uuid; return;
  end if;
  if not exists (select 1 from membership where id = p_membership and restaurant_id = p_restaurant) then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    raise exception 'not_a_member';
  end if;
  if exists (select 1 from challenge_claim where challenge_id = p_challenge and membership_id = p_membership) then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return query select 'already_claimed'::text, null::uuid; return;
  end if;
  if p_monthly_limit is not null then
    select count(*) into month_claims from challenge_claim c
      where c.membership_id = p_membership and c.restaurant_id = p_restaurant
        and c.claimed_at >= date_trunc('month', now());
    if month_claims >= p_monthly_limit then
      perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
      return query select 'monthly_limit'::text, null::uuid; return;
    end if;
  end if;

  if ch.reward_type = 'stamps' then
    insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key, reason)
      values (p_restaurant, p_membership, null, 'challenge:' || ch.id::text || ':' || p_membership::text, 'bonus')
      on conflict (restaurant_id, idempotency_key) do nothing
      returning id into new_stamp;
    -- Only add stamps when the stamp row is new, so a retry never doubles the bonus.
    if new_stamp is not null then
      update membership set stamps_current = stamps_current + ch.bonus_stamps,
                            stamps_total = stamps_total + ch.bonus_stamps
        where id = p_membership;
    end if;
  else
    new_reward := grant_reward(
      p_restaurant, p_membership, ch.reward_type,
      ch.title, ch.reward_percent_off, ch.reward_amount_off_cents,
      'challenge', ch.id, ch.reward_valid_days
    );
  end if;

  insert into challenge_claim (restaurant_id, challenge_id, membership_id, reward_id, stamp_key)
    values (p_restaurant, p_challenge, p_membership, new_reward, p_stamp_key);
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return query select 'claimed'::text, new_reward;
end;
$$;

-- ---------------------------------------------------------------- reward a referral once, on the friend's first valid stamp
-- Called from the stamp path after a valid visit. Returns 'rewarded' only on the call that changes the row.
create or replace function reward_referral(p_restaurant uuid, p_friend uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  ref referral%rowtype;
  rs restaurant%rowtype;
  ref_month integer;
  friend_stamp integer;
begin
  perform set_config('app.is_operator', 'true', true);
  select * into ref from referral
    where restaurant_id = p_restaurant and friend_membership_id = p_friend and status = 'pending'
    for update;
  if not found then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 'none';
  end if;
  select * into rs from restaurant where id = p_restaurant;
  if not rs.referral_enabled then
    update referral set status = 'rejected', reject_reason = 'referrals_off' where id = ref.id;
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 'rejected';
  end if;
  select count(*) into ref_month from referral
    where referrer_membership_id = ref.referrer_membership_id and status = 'rewarded'
      and rewarded_at >= date_trunc('month', now());
  if ref_month >= rs.referral_limit_per_month then
    update referral set status = 'rejected', reject_reason = 'monthly_limit' where id = ref.id;
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 'rejected';
  end if;

  update referral set status = 'rewarded', rewarded_at = now() where id = ref.id;

  if rs.referrer_reward_type = 'stamps' then
    insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key, reason)
      values (p_restaurant, ref.referrer_membership_id, null, 'referral:' || ref.id::text || ':referrer', 'bonus')
      on conflict (restaurant_id, idempotency_key) do nothing;
    update membership set stamps_current = stamps_current + 1, stamps_total = stamps_total + 1
      where id = ref.referrer_membership_id;
  else
    perform grant_reward(p_restaurant, ref.referrer_membership_id, rs.referrer_reward_type,
      'Referral reward', rs.referrer_reward_percent_off, rs.referrer_reward_amount_off_cents,
      'referral', ref.id, rs.referral_reward_valid_days);
  end if;

  if rs.friend_reward_type = 'stamps' then
    insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key, reason)
      values (p_restaurant, p_friend, null, 'referral:' || ref.id::text || ':friend', 'bonus')
      on conflict (restaurant_id, idempotency_key) do nothing;
    update membership set stamps_current = stamps_current + 1, stamps_total = stamps_total + 1
      where id = p_friend;
  else
    perform grant_reward(p_restaurant, p_friend, rs.friend_reward_type,
      'Welcome reward', rs.friend_reward_percent_off, rs.friend_reward_amount_off_cents,
      'referral', ref.id, rs.referral_reward_valid_days);
  end if;

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return 'rewarded';
end;
$$;

revoke all on function claim_challenge(uuid, uuid, uuid, text, integer) from public;
grant execute on function claim_challenge(uuid, uuid, uuid, text, integer) to app_user;
revoke all on function reward_referral(uuid, uuid) from public;
grant execute on function reward_referral(uuid, uuid) to app_user;
