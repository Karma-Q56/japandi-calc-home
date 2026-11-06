-- Phase D9: a signed-in guest creates their own restaurant (live mode only).
-- Not applied by the build. Test on the preview database first.
--
-- SECURITY: the caller passes only a user id and the restaurant's own details.
-- The function decides everything else: the restaurant starts as a private draft
-- on the starter plan, and the caller becomes its owner. The caller cannot choose
-- role, plan, status, public listing, credit or ids.

-- Reserved slugs. Keep this list in step with RESERVED_SLUGS in src/config/app.ts.
create or replace function restaurant_slug_reserved(p_slug text) returns boolean
language sql immutable as $$
  select p_slug = any (array[
    'app', 'me', 'stamp', 'ops', 'u', 'api', 'login', 'r', 's',
    'privacy', 'terms', 'healthz', 'sw', 'manifest', 'for-diners'
  ]::text[])
$$;

-- Result: the new restaurant id. Refusals are raised with a short code as the
-- message: user_not_found, already_has_restaurant, not_a_guest, bad_name,
-- bad_location, bad_slug, slug_reserved, slug_taken.
create or replace function create_restaurant_for_owner(
  p_user_id text, p_name text, p_slug text, p_suburb text, p_city text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  u           app_user%rowtype;
  new_id      uuid;
  clean_name  text := btrim(coalesce(p_name, ''));
  clean_slug  text := lower(btrim(coalesce(p_slug, '')));
  clean_sub   text := nullif(btrim(coalesce(p_suburb, '')), '');
  clean_city  text := coalesce(nullif(btrim(coalesce(p_city, '')), ''), 'Johannesburg');
begin
  -- app_user and restaurant are forced under row level security. This function is the
  -- only code that switches operator context on, and only for this transaction.
  perform set_config('app.is_operator', 'true', true);

  -- Lock this user's link row first, so one user cannot create two restaurants at once.
  select * into u from app_user where user_id = p_user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;
  if u.restaurant_id is not null then
    raise exception 'already_has_restaurant';
  end if;
  if u.role <> 'guest' then
    raise exception 'not_a_guest';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'bad_name';
  end if;
  if char_length(clean_slug) < 3 or char_length(clean_slug) > 40
     or clean_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'bad_slug';
  end if;
  if restaurant_slug_reserved(clean_slug) then
    raise exception 'slug_reserved';
  end if;
  if char_length(coalesce(clean_sub, '')) > 80 or char_length(clean_city) > 80 then
    raise exception 'bad_location';
  end if;
  if exists (select 1 from restaurant where slug = clean_slug) then
    raise exception 'slug_taken';
  end if;

  begin
    insert into restaurant (slug, name, status, plan, suburb, city, public_listed)
      values (clean_slug, clean_name, 'draft', 'starter', clean_sub, clean_city, false)
      returning id into new_id;
  exception when unique_violation then
    raise exception 'slug_taken';
  end;

  update app_user
     set role = 'owner', restaurant_id = new_id, updated_at = now()
   where user_id = p_user_id;

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, new_id, 'restaurant_created', 'restaurant', new_id::text,
            jsonb_build_object('slug', clean_slug));

  return new_id;
end;
$$;

revoke all on function create_restaurant_for_owner(text, text, text, text, text) from public;
revoke all on function restaurant_slug_reserved(text) from public;
grant execute on function create_restaurant_for_owner(text, text, text, text, text) to app_user;
grant execute on function restaurant_slug_reserved(text) to app_user;
