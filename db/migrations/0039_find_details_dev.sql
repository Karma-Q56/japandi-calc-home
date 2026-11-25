-- Phase D26: owner pickers (neighbourhood and type), address checks, and a safe way to change a page address.
-- Not applied by the build. Test on the preview database first.
--
-- What this does:
-- 1. Owners can set the venue type (cafe, bakery, restaurant, takeaway, other) from Settings and Your page,
--    so the Find page can filter by it. Both save functions get a last parameter p_venue_type that
--    defaults to null (null leaves the saved type alone), so the old call shapes still work.
-- 2. The address and neighbourhood rules the app checks are repeated here: a call that skips the app
--    cannot store a web link, an email, a phone number or odd characters.
-- 3. Only an operator can change a restaurant's page address. The old address is kept in slug_redirect and
--    always points to the new one, so printed QR codes keep working. An old address can never be taken
--    by another restaurant.
--
-- SECURITY:
-- - slug_redirect has forced row level security with an operator-only policy and no grants to app_user.
--   The only ways in are the functions below. resolve_slug_redirect reveals nothing except the current
--   address of an ACTIVE restaurant, which the public page already shows.
-- - operator_change_slug checks the user id's role first (assert_operator), like the other operator functions.
-- - Every function is SECURITY DEFINER with a fixed search_path, revoked from public and granted to app_user.

-- 1. Shared text rules (kept in step with src/lib/venue-fields.ts).
create or replace function valid_address_text(p text) returns boolean
language sql immutable as $$
  select p is null
      or (char_length(p) between 5 and 200
          and p ~ '[A-Za-z]'
          and p ~ '[0-9]'
          and lower(p) not like '%http%'
          and lower(p) not like '%www.%'
          and p not like '%@%'
          and p !~ '[0-9]{9,}')
$$;

create or replace function valid_suburb_text(p text) returns boolean
language sql immutable as $$
  select p is not null
     and char_length(p) between 2 and 60
     and p ~ '^[[:alnum:]][[:alnum:] ''.-]*$'
$$;

revoke all on function valid_address_text(text) from public;
revoke all on function valid_suburb_text(text) from public;
grant execute on function valid_address_text(text) to app_user;
grant execute on function valid_suburb_text(text) to app_user;

-- 2. Owner save functions with the venue type. The old signatures are dropped and recreated with one more
--    last parameter that has a default, so a call with the old number of arguments still works.
drop function if exists save_owner_settings(text, text, text, text, text, text, text, boolean, boolean, integer, integer);
create or replace function save_owner_settings(
  p_user_id text,
  p_name text,
  p_phone text,
  p_address text,
  p_suburb text,
  p_city text,
  p_enquiry_email text,
  p_offers_alerts boolean,
  p_orders_at_till boolean,
  p_marketing_cap integer,
  p_member_cap integer,
  p_venue_type text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  r restaurant%rowtype;
  p_phone_clean text := nullif(trim(coalesce(p_phone, '')), '');
  p_address_clean text := nullif(trim(coalesce(p_address, '')), '');
  p_email_clean text := nullif(trim(coalesce(p_enquiry_email, '')), '');
  p_name_clean text := trim(coalesce(p_name, ''));
  p_suburb_clean text := nullif(trim(coalesce(p_suburb, '')), '');
  p_city_clean text := trim(coalesce(p_city, ''));
  p_type_clean text := nullif(trim(coalesce(p_venue_type, '')), '');
begin
  rid := owner_restaurant_for_user(p_user_id);
  if char_length(p_name_clean) < 1 or char_length(p_name_clean) > 80 then
    raise exception 'invalid_value';
  end if;
  if char_length(p_city_clean) < 1 or char_length(p_city_clean) > 80 then
    raise exception 'invalid_value';
  end if;
  if p_offers_alerts is null or p_orders_at_till is null then
    raise exception 'invalid_value';
  end if;
  if p_marketing_cap is null or p_marketing_cap not between 0 and 14
     or p_member_cap is null or p_member_cap not between 0 and 14 then
    raise exception 'invalid_value';
  end if;
  if p_venue_type is not null and not coalesce(p_type_clean = any (array['cafe', 'bakery', 'restaurant', 'takeaway', 'other']), false) then
    raise exception 'invalid_value';
  end if;
  if not valid_address_text(p_address_clean) then
    raise exception 'invalid_value';
  end if;
  if p_suburb_clean is not null and not valid_suburb_text(p_suburb_clean) then
    raise exception 'invalid_value';
  end if;
  perform set_config('app.is_operator', 'true', true);
  select * into r from restaurant where id = rid for update;
  update restaurant set
    name = p_name_clean,
    phone = p_phone_clean,
    address = p_address_clean,
    suburb = p_suburb_clean,
    city = p_city_clean,
    enquiry_email = p_email_clean,
    offers_alerts = p_offers_alerts,
    orders_at_till = p_orders_at_till,
    marketing_weekly_cap = p_marketing_cap,
    member_weekly_cap = p_member_cap,
    venue_type = coalesce(p_type_clean, venue_type)
  where id = rid;
  if r.name is distinct from p_name_clean or r.phone is distinct from p_phone_clean then
    insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
      values ('owner', p_user_id, rid, 'restaurant_details_changed', 'restaurant', rid::text,
              jsonb_build_object('name_changed', r.name is distinct from p_name_clean,
                                 'phone_changed', r.phone is distinct from p_phone_clean));
  end if;
  if r.address is distinct from p_address_clean or r.suburb is distinct from p_suburb_clean
     or r.city is distinct from p_city_clean or r.enquiry_email is distinct from p_email_clean
     or r.offers_alerts is distinct from p_offers_alerts or r.orders_at_till is distinct from p_orders_at_till
     or r.marketing_weekly_cap is distinct from p_marketing_cap or r.member_weekly_cap is distinct from p_member_cap
     or r.venue_type is distinct from coalesce(p_type_clean, r.venue_type) then
    insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
      values ('owner', p_user_id, rid, 'settings_changed', 'restaurant', rid::text, '{}'::jsonb);
  end if;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

revoke all on function save_owner_settings(text, text, text, text, text, text, text, boolean, boolean, integer, integer, text) from public;
grant execute on function save_owner_settings(text, text, text, text, text, text, text, boolean, boolean, integer, integer, text) to app_user;

drop function if exists save_owner_page(text, text, text, text, text, jsonb);
create or replace function save_owner_page(
  p_user_id text,
  p_tagline text,
  p_about text,
  p_suburb text,
  p_address text,
  p_hours jsonb,
  p_venue_type text default null
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  r restaurant%rowtype;
  tagline_clean text := trim(coalesce(p_tagline, ''));
  about_clean text := nullif(trim(coalesce(p_about, '')), '');
  suburb_clean text := trim(coalesce(p_suburb, ''));
  address_clean text := nullif(trim(coalesce(p_address, '')), '');
  type_clean text := nullif(trim(coalesce(p_venue_type, '')), '');
begin
  rid := owner_restaurant_for_user(p_user_id);
  if char_length(tagline_clean) not between 2 and 70
     or char_length(coalesce(about_clean, '')) > 240
     or char_length(suburb_clean) not between 2 and 60
     or char_length(coalesce(address_clean, '')) > 120
     or not valid_suburb_text(suburb_clean)
     or not valid_address_text(address_clean)
     or (p_venue_type is not null and not coalesce(type_clean = any (array['cafe', 'bakery', 'restaurant', 'takeaway', 'other']), false))
     or not valid_opening_hours(p_hours) then
    raise exception 'invalid_value';
  end if;
  perform set_config('app.is_operator', 'true', true);
  select * into r from restaurant where id = rid for update;
  update restaurant set
    theme = coalesce(theme, '{}'::jsonb) || jsonb_build_object('tagline', tagline_clean),
    about_text = about_clean,
    suburb = suburb_clean,
    address = address_clean,
    hours = p_hours,
    venue_type = coalesce(type_clean, venue_type)
  where id = rid;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'page_changed', 'restaurant', rid::text, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

revoke all on function save_owner_page(text, text, text, text, text, jsonb, text) from public;
grant execute on function save_owner_page(text, text, text, text, text, jsonb, text) to app_user;

-- 3. Old page addresses. The printed QR codes keep working because the old address redirects to the new one.
create table if not exists slug_redirect (
  old_slug text primary key,
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists slug_redirect_restaurant_idx on slug_redirect (restaurant_id);
alter table slug_redirect enable row level security;
alter table slug_redirect force row level security;
drop policy if exists operator_all on slug_redirect;
create policy operator_all on slug_redirect for all
  using (app_is_operator()) with check (app_is_operator());
revoke all on slug_redirect from public;
-- No direct grants to app_user: the functions below are the only way in.

-- An address is reserved when it is on the fixed list OR it is an old address of any restaurant.
create or replace function restaurant_slug_reserved(p_slug text) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  found boolean;
begin
  if p_slug = any (array[
    'app', 'me', 'stamp', 'ops', 'u', 'api', 'login', 'r', 's',
    'privacy', 'terms', 'healthz', 'sw', 'manifest', 'for-diners'
  ]::text[]) then
    return true;
  end if;
  perform set_config('app.is_operator', 'true', true);
  select exists (select 1 from slug_redirect where old_slug = p_slug) into found;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return found;
end;
$$;
revoke all on function restaurant_slug_reserved(text) from public;
grant execute on function restaurant_slug_reserved(text) to app_user;

-- The current address of the ACTIVE restaurant that used to have p_slug, else null. Needs no signed-in user.
create or replace function resolve_slug_redirect(p_slug text) returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  result text;
begin
  perform set_config('app.is_operator', 'true', true);
  select r.slug into result
    from slug_redirect s
    join restaurant r on r.id = s.restaurant_id
   where s.old_slug = lower(btrim(coalesce(p_slug, '')))
     and r.status = 'active';
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return result;
end;
$$;
revoke all on function resolve_slug_redirect(text) from public;
grant execute on function resolve_slug_redirect(text) to app_user;

-- Operator only: change a restaurant's page address. Result: the new address.
-- Refusals: not_operator, not_found, bad_slug, slug_reserved, slug_taken, same_slug, bad_reason.
create or replace function operator_change_slug(
  p_operator_id text, p_restaurant_id uuid, p_new_slug text, p_reason text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  clean_slug text := lower(btrim(coalesce(p_new_slug, '')));
  clean_reason text := btrim(coalesce(p_reason, ''));
  r restaurant%rowtype;
begin
  perform assert_operator(p_operator_id);
  perform set_config('app.is_operator', 'true', true);
  select * into r from restaurant where id = p_restaurant_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if char_length(clean_reason) < 3 or char_length(clean_reason) > 300 then
    raise exception 'bad_reason';
  end if;
  if char_length(clean_slug) < 3 or char_length(clean_slug) > 40
     or clean_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'bad_slug';
  end if;
  if clean_slug = r.slug then
    raise exception 'same_slug';
  end if;
  -- Reserved means the fixed list or an old address of ANOTHER restaurant. Going back to this
  -- restaurant's own old address is allowed.
  if clean_slug = any (array[
    'app', 'me', 'stamp', 'ops', 'u', 'api', 'login', 'r', 's',
    'privacy', 'terms', 'healthz', 'sw', 'manifest', 'for-diners'
  ]::text[])
     or exists (select 1 from slug_redirect where old_slug = clean_slug and restaurant_id <> r.id) then
    raise exception 'slug_reserved';
  end if;
  if exists (select 1 from restaurant where slug = clean_slug) then
    raise exception 'slug_taken';
  end if;
  insert into slug_redirect (old_slug, restaurant_id) values (r.slug, r.id) on conflict do nothing;
  delete from slug_redirect where old_slug = clean_slug and restaurant_id = r.id;
  update restaurant set slug = clean_slug where id = r.id;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, r.id, 'slug_changed', 'restaurant', r.id::text,
            jsonb_build_object('old_slug', r.slug, 'new_slug', clean_slug, 'reason', clean_reason));
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return clean_slug;
end;
$$;
revoke all on function operator_change_slug(text, uuid, text, text) from public;
grant execute on function operator_change_slug(text, uuid, text, text) to app_user;
