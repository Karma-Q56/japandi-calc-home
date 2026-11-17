-- Phase D20: branches (database part).
-- NOT APPLIED. The build does not run this file. Test on the preview database first.
--
-- SECURITY: every new function is SECURITY DEFINER with set search_path = public, pg_temp,
-- revokes execute from public and grants it to app_user. Owner functions read the caller's
-- restaurant through owner_restaurant_for_user() and only act on rows of that restaurant.

-- 1. Columns. A staff member works at one branch, or at all branches. A pairing code
--    remembers the branch it was made for, so the till that pairs with it gets that branch.
alter table staff_member add column all_branches boolean not null default false;
alter table one_time_code add column location_id uuid references location(id) on delete set null;

-- 2. Fill the branch when a row is written without one. A branch named in app.location_id
--    is used only when it is a valid uuid (checked BEFORE the cast, so bad text never raises)
--    and it is an ACTIVE branch of the same restaurant. Otherwise the main branch is used.
create or replace function fill_main_location()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  context_location text := current_setting('app.location_id', true);
  main_id uuid;
begin
  if new.location_id is null then
    perform set_config('app.is_operator', 'true', true);
    if context_location ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select l.id into main_id from location l
        where l.id = context_location::uuid and l.restaurant_id = new.restaurant_id and l.active
        limit 1;
    end if;
    if main_id is null then
      select l.id into main_id from location l
        where l.restaurant_id = new.restaurant_id and l.is_main limit 1;
    end if;
    perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
    new.location_id := main_id;
  end if;
  return new;
end;
$$;

revoke all on function fill_main_location() from public;

-- 3. Add a branch. The caller must own or manage exactly one restaurant. A new branch is never main.
create or replace function create_location(
  p_user_id text,
  p_name text,
  p_address text,
  p_suburb text,
  p_city text
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  new_id uuid;
begin
  rid := owner_restaurant_for_user(p_user_id);
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80
     or (p_address is not null and char_length(p_address) > 200)
     or p_city is null or char_length(btrim(p_city)) not between 1 and 80 then
    raise exception 'invalid_value';
  end if;
  perform set_config('app.is_operator', 'true', true);
  insert into location (restaurant_id, name, address, suburb, city, is_main, active)
    values (rid, btrim(p_name), nullif(btrim(coalesce(p_address, '')), ''),
            nullif(btrim(coalesce(p_suburb, '')), ''), btrim(p_city), false, true)
    returning id into new_id;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'location_added', 'location', new_id::text, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
  return new_id;
end;
$$;

revoke all on function create_location(text, text, text, text, text) from public;
grant execute on function create_location(text, text, text, text, text) to app_user;

-- 4. Edit a branch. The branch must belong to the caller's restaurant (checked, not trusted).
create or replace function update_location(
  p_user_id text,
  p_location_id uuid,
  p_name text,
  p_address text,
  p_suburb text,
  p_city text
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  found_id uuid;
begin
  rid := owner_restaurant_for_user(p_user_id);
  if p_location_id is null then raise exception 'not_found'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80
     or (p_address is not null and char_length(p_address) > 200)
     or p_city is null or char_length(btrim(p_city)) not between 1 and 80 then
    raise exception 'invalid_value';
  end if;
  perform set_config('app.is_operator', 'true', true);
  select l.id into found_id from location l where l.id = p_location_id and l.restaurant_id = rid;
  if found_id is null then
    perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
    raise exception 'not_found';
  end if;
  update location
    set name = btrim(p_name), address = nullif(btrim(coalesce(p_address, '')), ''),
        suburb = nullif(btrim(coalesce(p_suburb, '')), ''), city = btrim(p_city)
    where id = found_id;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'location_changed', 'location', found_id::text, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
end;
$$;

revoke all on function update_location(text, uuid, text, text, text, text) from public;
grant execute on function update_location(text, uuid, text, text, text, text) to app_user;

-- 5. Make a branch the main one. Clear the old main first: the unique index allows only one.
create or replace function set_main_location(p_user_id text, p_location_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  target_id uuid;
begin
  rid := owner_restaurant_for_user(p_user_id);
  if p_location_id is null then raise exception 'not_found'; end if;
  perform set_config('app.is_operator', 'true', true);
  select l.id into target_id from location l
    where l.id = p_location_id and l.restaurant_id = rid and l.active;
  if target_id is null then
    perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
    raise exception 'not_found';
  end if;
  update location set is_main = false where restaurant_id = rid and is_main and id <> target_id;
  update location set is_main = true where id = target_id;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'location_main_changed', 'location', target_id::text, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
end;
$$;

revoke all on function set_main_location(text, uuid) from public;
grant execute on function set_main_location(text, uuid) to app_user;

-- 6. Turn a branch off or on. The main branch cannot be turned off. A branch is never deleted.
--    Turning one on checks the plan limit, because the insert guard only runs on insert.
create or replace function deactivate_location(p_user_id text, p_location_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  target record;
begin
  rid := owner_restaurant_for_user(p_user_id);
  if p_location_id is null then raise exception 'not_found'; end if;
  perform set_config('app.is_operator', 'true', true);
  select l.id, l.is_main into target from location l
    where l.id = p_location_id and l.restaurant_id = rid;
  if target.id is null then
    perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
    raise exception 'not_found';
  end if;
  if target.is_main then
    perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
    raise exception 'main_location';
  end if;
  update location set active = false where id = target.id;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'location_deactivated', 'location', target.id::text, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
end;
$$;

revoke all on function deactivate_location(text, uuid) from public;
grant execute on function deactivate_location(text, uuid) to app_user;

create or replace function reactivate_location(p_user_id text, p_location_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  target_id uuid;
  already_on boolean;
  r_plan plan_tier;
  r_max integer;
  r_count integer;
begin
  rid := owner_restaurant_for_user(p_user_id);
  if p_location_id is null then raise exception 'not_found'; end if;
  perform set_config('app.is_operator', 'true', true);
  select l.id, l.active into target_id, already_on from location l
    where l.id = p_location_id and l.restaurant_id = rid;
  if target_id is null then
    perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
    raise exception 'not_found';
  end if;
  select plan into r_plan from restaurant where id = rid;
  select max_locations into r_max from plan_limit where plan = r_plan;
  select count(*)::int into r_count from location where restaurant_id = rid and active;
    if not already_on and r_max is not null and r_count >= r_max then
    perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
    raise exception 'plan_limit_locations';
  end if;

  update location set active = true where id = target_id;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'location_reactivated', 'location', target_id::text, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
end;
$$;

revoke all on function reactivate_location(text, uuid) from public;
grant execute on function reactivate_location(text, uuid) to app_user;

-- 7. Which branch a team member works at, or all branches. Both ids must belong to the caller's restaurant.
create or replace function set_staff_location(
  p_user_id text,
  p_staff_id uuid,
  p_location_id uuid,
  p_all_branches boolean
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  staff_found uuid;
  location_found uuid;
begin
  rid := owner_restaurant_for_user(p_user_id);
  if p_staff_id is null or p_all_branches is null then raise exception 'invalid_value'; end if;
  perform set_config('app.is_operator', 'true', true);
  select s.id into staff_found from staff_member s where s.id = p_staff_id and s.restaurant_id = rid;
  if staff_found is null then
    perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
    raise exception 'not_found';
  end if;
  if not p_all_branches then
    select l.id into location_found from location l where l.id = p_location_id and l.restaurant_id = rid;
    if location_found is null then
      perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
      raise exception 'not_found';
    end if;
  end if;
  update staff_member
    set all_branches = p_all_branches,
        location_id = case when p_all_branches then location_id else location_found end
    where id = staff_found;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'staff_branch_changed', 'staff_member', staff_found::text, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
end;
$$;

revoke all on function set_staff_location(text, uuid, uuid, boolean) from public;
grant execute on function set_staff_location(text, uuid, uuid, boolean) to app_user;

