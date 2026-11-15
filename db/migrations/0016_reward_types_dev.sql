-- 0016 reward types (D12a). NOT APPLIED: written to be applied after 0001 and 0015.
-- Every reward has a kind: free_item, percent_off or amount_off.

-- ---------------------------------------------------------------- restaurant: the main stamp card reward
alter table restaurant
  add column if not exists reward_kind text not null default 'free_item',
  add column if not exists reward_percent_off smallint,
  add column if not exists reward_amount_off_cents integer,
  add column if not exists reward_valid_days smallint;

alter table restaurant drop constraint if exists restaurant_reward_kind_check;
alter table restaurant add constraint restaurant_reward_kind_check check (
  (reward_kind = 'free_item' and reward_percent_off is null and reward_amount_off_cents is null)
  or (reward_kind = 'percent_off' and reward_percent_off is not null and reward_percent_off between 1 and 100 and reward_amount_off_cents is null)
  or (reward_kind = 'amount_off' and reward_amount_off_cents is not null and reward_amount_off_cents > 0 and reward_percent_off is null)
);

alter table restaurant drop constraint if exists restaurant_reward_valid_days_check;
alter table restaurant add constraint restaurant_reward_valid_days_check
  check (reward_valid_days is null or reward_valid_days between 1 and 365);

-- A check passes when it evaluates to NULL, so the percent and amount are tested with
-- `is not null` as well. Without it a percent_off reward with no percentage got through.
-- ---------------------------------------------------------------- reward: the kind and value a guest was given
alter table reward
  add column if not exists kind text not null default 'free_item',
  add column if not exists percent_off smallint,
  add column if not exists amount_off_cents integer,
  add column if not exists source text not null default 'stamp_card',
  add column if not exists source_id uuid,
  add column if not exists expires_at timestamptz;

alter table reward drop constraint if exists reward_kind_check;
alter table reward add constraint reward_kind_check check (
  (kind = 'free_item' and percent_off is null and amount_off_cents is null)
  or (kind = 'percent_off' and percent_off is not null and percent_off between 1 and 100 and amount_off_cents is null)
  or (kind = 'amount_off' and amount_off_cents is not null and amount_off_cents > 0 and percent_off is null)
);

alter table reward drop constraint if exists reward_source_check;
alter table reward add constraint reward_source_check check (
  source in ('stamp_card', 'challenge', 'referral', 'spin', 'birthday', 'tier', 'mystery', 'special')
);

-- ---------------------------------------------------------------- grant_reward: the only way to create a reward
-- Other SECURITY DEFINER functions call this. app_user is NOT granted execute.
-- Save and restore app.is_operator, as in 0013.
create or replace function grant_reward(
  p_restaurant uuid,
  p_membership uuid,
  p_kind text,
  p_description text,
  p_percent_off smallint,
  p_amount_off_cents integer,
  p_source text,
  p_source_id uuid,
  p_valid_days smallint
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  new_id uuid;
begin
  perform set_config('app.is_operator', 'true', true);
  if not exists (select 1 from membership where id = p_membership and restaurant_id = p_restaurant) then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    raise exception 'not_a_member';
  end if;
  insert into reward (restaurant_id, membership_id, description, kind, percent_off, amount_off_cents,
                      source, source_id, expires_at)
    values (p_restaurant, p_membership, p_description, p_kind, p_percent_off, p_amount_off_cents,
            p_source, p_source_id,
            case when p_valid_days is null then null else now() + make_interval(days => p_valid_days) end)
    returning id into new_id;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return new_id;
end;
$$;

revoke all on function grant_reward(uuid, uuid, text, text, smallint, integer, text, uuid, smallint) from public;

-- ---------------------------------------------------------------- record_stamp: same rules, reward uses the restaurant's kind
-- Signature, checks and idempotency are identical to 0001. Only the reward creation changes.
-- SECURITY DEFINER so app_user can run it while app_user has no execute on grant_reward.
-- It does not switch app.is_operator itself; grant_reward saves and restores it.
create or replace function record_stamp(
  p_restaurant uuid, p_membership uuid, p_staff uuid, p_key text
) returns table (out_result text, out_stamp_id uuid, out_stamps integer, out_reward_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m          membership%rowtype;
  r          restaurant%rowtype;
  prior      stamp_event%rowtype;
  last_valid timestamptz;
  new_id     uuid;
  new_reward uuid := null;
begin
  select * into m from membership where id = p_membership and restaurant_id = p_restaurant for update;
  if not found then
    return query select 'not_a_member'::text, null::uuid, null::integer, null::uuid;
    return;
  end if;

  select * into prior from stamp_event where restaurant_id = p_restaurant and idempotency_key = p_key;
  if found then
    return query select 'duplicate_retry'::text, prior.id, m.stamps_current, null::uuid;
    return;
  end if;

  select * into r from restaurant where id = p_restaurant;

  select max(created_at) into last_valid
    from stamp_event where membership_id = m.id and status = 'valid';
  if last_valid is not null and last_valid > now() - make_interval(mins => r.visit_window_minutes) then
    return query select 'too_soon'::text, null::uuid, m.stamps_current, null::uuid;
    return;
  end if;

  insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key)
    values (p_restaurant, m.id, p_staff, p_key)
    returning id into new_id;

  update membership
     set stamps_current = stamps_current + 1,
         stamps_total   = stamps_total + 1,
         last_visit_at  = now()
   where id = m.id
   returning * into m;

  if m.stamps_current >= r.stamps_required then
    new_reward := grant_reward(
      p_restaurant, m.id, r.reward_kind, r.reward_description,
      r.reward_percent_off, r.reward_amount_off_cents,
      'stamp_card', null, r.reward_valid_days);
    update membership
       set stamps_current = stamps_current - r.stamps_required,
           rewards_earned = rewards_earned + 1
     where id = m.id
     returning * into m;
  end if;

  return query select 'stamped'::text, new_id, m.stamps_current, new_reward;
end;
$$;

-- ---------------------------------------------------------------- redeem
-- Expired rewards keep status 'available'. The till redeem query refuses them with reward_expired
-- (see src/server/live-till.ts). No other change to the redeem path.

revoke all on function record_stamp(uuid, uuid, uuid, text) from public;
grant execute on function record_stamp(uuid, uuid, uuid, text) to app_user;
