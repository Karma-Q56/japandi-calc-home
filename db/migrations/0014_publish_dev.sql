-- Phase D10: publish, unpublish and "show in Find" (live mode).
-- Not applied by the build. Test on the preview database first.
--
-- SECURITY: the caller passes only a user id (and, for listing, a yes or no).
-- Each function looks up the caller's own link row, requires role owner or manager,
-- and acts only on that user's restaurant. Refusals are raised with a short code:
-- not_allowed, not_ready, bad_state.

-- 1. Privacy. A draft restaurant's menu and specials are private. Other restaurants
--    and signed-out visitors may read them only once the restaurant is active.
drop policy if exists public_read on menu_section;
drop policy if exists public_read on menu_item;
drop policy if exists public_read on special;

create policy public_read on menu_section for select using (
  restaurant_id = app_restaurant() or app_is_operator()
  or exists (select 1 from restaurant r where r.id = menu_section.restaurant_id and r.status = 'active')
);
create policy public_read on menu_item for select using (
  restaurant_id = app_restaurant() or app_is_operator()
  or exists (select 1 from restaurant r where r.id = menu_item.restaurant_id and r.status = 'active')
);
create policy public_read on special for select using (
  restaurant_id = app_restaurant() or app_is_operator()
  or exists (select 1 from restaurant r where r.id = special.restaurant_id and r.status = 'active')
);

-- 2. Readiness. Returns which publish conditions are met, so the screen and the SQL agree.
create or replace function restaurant_readiness(p_restaurant_id uuid)
returns table (has_menu boolean, has_staff boolean, has_suburb boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from menu_item i
      where i.restaurant_id = p_restaurant_id and i.available
    ),
    exists (
      select 1 from staff_member s
      where s.restaurant_id = p_restaurant_id and s.active
    ),
    exists (
      select 1 from restaurant r
      where r.id = p_restaurant_id and nullif(btrim(coalesce(r.suburb, '')), '') is not null
    )
$$;

-- 3. Shared helper: load the caller's owner or manager restaurant, under operator
--    context so row level security does not hide the rows. Returns the restaurant id
--    or raises not_allowed. The caller's operator setting is restored by the caller.
create or replace function publish_restaurant_for_user(p_user_id text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  u app_user%rowtype;
begin
  perform set_config('app.is_operator', 'true', true);
  select * into u from app_user where user_id = p_user_id;
  if not found or u.restaurant_id is null or u.role not in ('owner', 'manager') then
    raise exception 'not_allowed';
  end if;
  return u.restaurant_id;
end;
$$;

-- 4. Publish. Draft or paused goes to active, but only when the three conditions hold.
create or replace function publish_restaurant(p_user_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  current_status text;
  r record;
begin
  rid := publish_restaurant_for_user(p_user_id);
  select status into current_status from restaurant where id = rid for update;
  if current_status not in ('draft', 'paused') then
    raise exception 'bad_state';
  end if;
  select * into r from restaurant_readiness(rid);
  if not (r.has_menu and r.has_staff and r.has_suburb) then
    raise exception 'not_ready';
  end if;
  update restaurant set status = 'active' where id = rid;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, meta)
    values ('owner', p_user_id, rid, 'restaurant_published', '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
  return 'active';
end;
$$;

-- 5. Unpublish. Active goes to paused. Guests can no longer see the page or join.
create or replace function unpublish_restaurant(p_user_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  current_status text;
begin
  rid := publish_restaurant_for_user(p_user_id);
  select status into current_status from restaurant where id = rid for update;
  if current_status <> 'active' then
    raise exception 'bad_state';
  end if;
  update restaurant set status = 'paused', public_listed = false where id = rid;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, meta)
    values ('owner', p_user_id, rid, 'restaurant_unpublished', '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
  return 'paused';
end;
$$;

-- 6. Show in Find. Switching it on is refused unless the restaurant is active.
create or replace function set_restaurant_listed(p_user_id text, p_listed boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  current_status text;
begin
  rid := publish_restaurant_for_user(p_user_id);
  select status into current_status from restaurant where id = rid for update;
  if coalesce(p_listed, false) and current_status <> 'active' then
    raise exception 'bad_state';
  end if;
  update restaurant set public_listed = coalesce(p_listed, false) where id = rid;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, meta)
    values ('owner', p_user_id, rid, 'restaurant_listing_changed',
            jsonb_build_object('listed', coalesce(p_listed, false)));
  perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
  return coalesce(p_listed, false);
end;
$$;

revoke all on function restaurant_readiness(uuid) from public;
revoke all on function publish_restaurant_for_user(text) from public;
revoke all on function publish_restaurant(text) from public;
revoke all on function unpublish_restaurant(text) from public;
revoke all on function set_restaurant_listed(text, boolean) from public;
grant execute on function restaurant_readiness(uuid) to app_user;
grant execute on function publish_restaurant(text) to app_user;
grant execute on function unpublish_restaurant(text) to app_user;
grant execute on function set_restaurant_listed(text, boolean) to app_user;
