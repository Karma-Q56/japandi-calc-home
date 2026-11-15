-- Phase D12e: specials (live mode).
-- Not applied by the build. Test on the preview database first.
--
-- SECURITY: the owner's writes go through the app role's existing select/insert/update
-- rights on `special`, checked in server code. Redemption is a SECURITY DEFINER function:
-- the caller passes only a restaurant id, a membership id, a code and a retry key. It
-- never accepts a role, a plan or a discount from the browser. Refusals are raised with a
-- short code: not_allowed, not_found, not_active, not_member, already_used.

-- 1. What the special gives. Free text up to 120 characters, plus an optional percent or
--    rand amount (stored in cents). Only one of percent or amount may be set.
alter table special add column if not exists reward_text text;
alter table special add column if not exists percent_off integer;
alter table special add column if not exists amount_off_cents integer;

alter table special drop constraint if exists special_reward_text_len;
alter table special add constraint special_reward_text_len
  check (reward_text is null or char_length(reward_text) <= 120);

alter table special drop constraint if exists special_percent_range;
alter table special add constraint special_percent_range
  check (percent_off is null or percent_off between 1 and 100);

alter table special drop constraint if exists special_amount_range;
alter table special add constraint special_amount_range
  check (amount_off_cents is null or amount_off_cents between 1 and 1000000);

alter table special drop constraint if exists special_one_discount;
alter table special add constraint special_one_discount
  check (percent_off is null or amount_off_cents is null);

-- Any row with an unknown kind would block the check, so it becomes a public special first.
update special set kind = 'public' where kind not in ('public', 'members', 'targeted');

alter table special drop constraint if exists special_kind_check;
alter table special add constraint special_kind_check
  check (kind in ('public', 'members', 'targeted'));

-- 2. Uses. A public or members-only code is shared, so it can be used many times. Each
--    use is recorded here once. The idempotency key stops a retry counting twice.
create table if not exists special_use (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurant(id) on delete cascade,
  special_id      uuid not null references special(id) on delete cascade,
  membership_id   uuid not null references membership(id) on delete cascade,
  special_code_id uuid references special_code(id) on delete set null,
  staff_id        uuid references staff_member(id),
  idempotency_key text not null,
  used_at         timestamptz not null default now(),
  unique (restaurant_id, idempotency_key)
);

create index if not exists special_use_lookup on special_use (special_id, membership_id);

alter table special_use enable row level security;
alter table special_use force row level security;

drop policy if exists tenant_all on special_use;
create policy tenant_all on special_use for all
  using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());

-- Guests may read their own uses through their membership.
drop policy if exists special_use_read_own on special_use;
create policy special_use_read_own on special_use for select using (
  exists (
    select 1 from membership m
    where m.id = special_use.membership_id
      and m.customer_id = app_customer()
  )
);

grant select, insert on special_use to app_user;

-- 3. Redeem a code at the till. Called by the till path (not wired in this phase).
--    Returns one row with a result: ok, replay, not_found, not_active, not_member,
--    already_used. A replay is the same key used again: it returns the first answer and
--    counts nothing new.
create or replace function redeem_special_code(
  p_restaurant uuid, p_code text, p_membership uuid, p_staff uuid, p_key text
) returns table (out_result text, out_special_id uuid, out_title text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  sp          special%rowtype;
  sc_id       uuid := null;
  prior_use   special_use%rowtype;
  now_ts      timestamptz := now();
begin
  -- The till works inside one restaurant. Refuse a call that names a different restaurant,
  -- so a session for restaurant A can never use up codes that belong to restaurant B.
  if not app_is_operator() and app_restaurant() is distinct from p_restaurant then
    raise exception 'not_allowed';
  end if;
  perform set_config('app.is_operator', 'true', true);

  -- A retry with the same key returns the first answer and changes nothing.
  select * into prior_use from special_use
    where restaurant_id = p_restaurant and idempotency_key = p_key;
  if found then
    select * into sp from special where id = prior_use.special_id;
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return query select 'replay'::text, sp.id, sp.title;
    return;
  end if;

  if not exists (select 1 from membership where id = p_membership and restaurant_id = p_restaurant) then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return query select 'not_member'::text, null::uuid, null::text; return;
  end if;

  -- The code is looked up inside this restaurant only. Case is ignored.
  select * into sp from special
    where restaurant_id = p_restaurant and upper(code) = upper(p_code);
  if not found then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return query select 'not_found'::text, null::uuid, null::text; return;
  end if;

  if not sp.active
     or (sp.starts_at is not null and sp.starts_at > now_ts)
     or (sp.ends_at is not null and sp.ends_at < now_ts) then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return query select 'not_active'::text, sp.id, sp.title; return;
  end if;

  if sp.kind = 'members' then
    -- Members-only: any membership at this restaurant may use the shared code, once each.
    if exists (select 1 from special_use where special_id = sp.id and membership_id = p_membership) then
      perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
      return query select 'already_used'::text, sp.id, sp.title; return;
    end if;
    sc_id := null;
  else
    -- Public or targeted: the guest must hold the code issued for this special.
    select id into sc_id from special_code
      where special_id = sp.id and membership_id = p_membership and restaurant_id = p_restaurant;
    if not found then
      perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
      return query select 'not_member'::text, sp.id, sp.title; return;
    end if;
    if exists (select 1 from special_code where id = sc_id and redeemed_at is not null) then
      perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
      return query select 'already_used'::text, sp.id, sp.title; return;
    end if;
    update special_code set redeemed_at = now_ts, redeemed_by = p_staff::text
      where id = sc_id;
  end if;

  insert into special_use (restaurant_id, special_id, membership_id, special_code_id, staff_id, idempotency_key, used_at)
    values (p_restaurant, sp.id, p_membership, sc_id, p_staff, p_key, now_ts);

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('staff', p_staff::text, p_restaurant, 'special.redeemed', 'special', sp.id::text,
            jsonb_build_object('membership_id', p_membership, 'kind', sp.kind));

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return query select 'ok'::text, sp.id, sp.title;
end;
$$;

revoke all on function redeem_special_code(uuid, text, uuid, uuid, text) from public;
grant execute on function redeem_special_code(uuid, text, uuid, uuid, text) to app_user;
