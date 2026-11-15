-- Phase D13b2: finish the card design and "Your page" for real restaurants.
-- Not applied by the build. Test on the preview database first.
--
-- SECURITY:
-- - Both save functions take a user id the SERVER supplies (the signed-in owner or manager),
--   and owner_restaurant_for_user refuses anyone who is not an owner or manager of a restaurant.
--   They only ever change that one restaurant.
-- - The shape of what is saved is checked here as well as in the app: opening hours and the card
--   theme go through valid_opening_hours and valid_card_theme, so a call that skips the app still
--   cannot store anything odd (no script text in the stamp pictures, no oversized values).
-- - The logo stays in its own table. Owners may now also remove their own logo (the policy already
--   limits every write to the caller's restaurant).

-- 1. A story of up to 240 characters for the public page.
alter table restaurant add column if not exists about_text text;
alter table restaurant drop constraint if exists restaurant_about_text_len;
alter table restaurant add constraint restaurant_about_text_len
  check (about_text is null or char_length(about_text) <= 240);

-- 2. Removing a logo.
grant delete on restaurant_logo to app_user;

-- 3. Opening hours: Monday to Sunday, each null (closed) or {open, close} as HH:MM with open before close.
--    At least one open day.
create or replace function valid_opening_hours(p jsonb)
returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(
    jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(p) k
      where k not in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
    )
    and not exists (
      select 1 from jsonb_each(p) e
      where jsonb_typeof(e.value) <> 'null'
        and not (
          jsonb_typeof(e.value) = 'object'
          and (select count(*) from jsonb_object_keys(e.value)) = 2
          and e.value ? 'open' and e.value ? 'close'
          and (e.value->>'open') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and (e.value->>'close') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and (e.value->>'close') > (e.value->>'open')
        )
    )
    and exists (select 1 from jsonb_each(p) e where jsonb_typeof(e.value) = 'object'),
    false
  )
$$;

-- 4. The guest card design: six hex colours, fonts, a radius, a stamp shape, a background, a tagline,
--    and optionally a pixel stamp made from the logo (two SVG pictures of up to 160000 characters each, no scripts).
create or replace function valid_card_theme(p jsonb)
returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(
    jsonb_typeof(p) = 'object'
    and octet_length(p::text) <= 400000
    and (p->>'ink') ~ '^#[0-9a-fA-F]{6}$'
    and (p->>'paper') ~ '^#[0-9a-fA-F]{6}$'
    and (p->>'accent') ~ '^#[0-9a-fA-F]{6}$'
    and (p->>'accentSoft') ~ '^#[0-9a-fA-F]{6}$'
    and (p->>'stampFilled') ~ '^#[0-9a-fA-F]{6}$'
    and (p->>'stampEmpty') ~ '^#[0-9a-fA-F]{6}$'
    and (p->>'headingFont') in ('Bricolage Grotesque', 'DM Sans', 'Georgia')
    and (p->>'bodyFont') in ('DM Sans', 'Bricolage Grotesque', 'Arial')
    and jsonb_typeof(p->'radius') = 'number'
    and (p->>'radius')::numeric between 0 and 40
    and (p->>'stampShape') in ('circle', 'square', 'pixel-star', 'coffee-cup', 'croissant', 'heart',
                              'leaf', 'moon', 'sun', 'bean', 'flame', 'diamond', 'custom-svg')
    and (p->>'cardBackground') in ('flat', 'paper', 'gradient')
    and char_length(coalesce(p->>'tagline', '')) between 2 and 70
    and (
      not (p ? 'logoStamp')
      or (
        jsonb_typeof(p->'logoStamp') = 'object'
        and jsonb_typeof(p->'logoStamp'->'grid') = 'number'
        and (p->'logoStamp'->>'grid')::numeric between 3 and 40
        and (p->'logoStamp'->>'filled') ~ '^data:image/svg\+xml;charset=utf-8,[A-Za-z0-9%._~!*()'';:@&=+$,/?#-]+$'
        and (p->'logoStamp'->>'empty') ~ '^data:image/svg\+xml;charset=utf-8,[A-Za-z0-9%._~!*()'';:@&=+$,/?#-]+$'
        and char_length(p->'logoStamp'->>'filled') <= 160000
        and char_length(p->'logoStamp'->>'empty') <= 160000
        and lower(p->'logoStamp'->>'filled') !~ '(%3cscript|<script|onload|javascript)'
        and lower(p->'logoStamp'->>'empty') !~ '(%3cscript|<script|onload|javascript)'
      )
    ),
    false
  )
$$;

-- 5. Save the words and opening hours of the public page.
create or replace function save_owner_page(
  p_user_id text,
  p_tagline text,
  p_about text,
  p_suburb text,
  p_address text,
  p_hours jsonb
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
begin
  rid := owner_restaurant_for_user(p_user_id);
  if char_length(tagline_clean) not between 2 and 70
     or char_length(coalesce(about_clean, '')) > 240
     or char_length(suburb_clean) not between 2 and 60
     or char_length(coalesce(address_clean, '')) > 120
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
    hours = p_hours
  where id = rid;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'page_changed', 'restaurant', rid::text, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

revoke all on function save_owner_page(text, text, text, text, text, jsonb) from public;
grant execute on function save_owner_page(text, text, text, text, text, jsonb) to app_user;

-- 6. Save the guest card design. The logo and cover photo already stored are kept as they are: the logo
--    is changed only by uploading or removing it, never through this call. The line under the name is
--    edited on Your page, so a saved line is kept too (the design call only fills it when there is none).
create or replace function save_owner_design(p_user_id text, p_theme jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  r restaurant%rowtype;
  kept jsonb;
begin
  rid := owner_restaurant_for_user(p_user_id);
  if not valid_card_theme(p_theme) then
    raise exception 'invalid_value';
  end if;
  perform set_config('app.is_operator', 'true', true);
  select * into r from restaurant where id = rid for update;
  kept := '{}'::jsonb;
  if coalesce(r.theme, '{}'::jsonb) ? 'logo' then
    kept := kept || jsonb_build_object('logo', r.theme->'logo');
  end if;
  if coalesce(r.theme, '{}'::jsonb) ? 'coverPhoto' then
    kept := kept || jsonb_build_object('coverPhoto', r.theme->'coverPhoto');
  end if;
  if char_length(coalesce(r.theme->>'tagline', '')) between 2 and 70 then
    kept := kept || jsonb_build_object('tagline', r.theme->'tagline');
  end if;
  update restaurant set theme = (p_theme - 'logo' - 'coverPhoto') || kept where id = rid;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'design_changed', 'restaurant', rid::text, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

revoke all on function save_owner_design(text, jsonb) from public;
grant execute on function save_owner_design(text, jsonb) to app_user;

-- 7. After a logo is uploaded or removed: point the card at the stored logo (a link on our own site),
--    or clear it. The link carries the version so a new logo shows straight away.
create or replace function sync_owner_logo(p_user_id text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  logo_version integer;
  rest_slug text;
begin
  rid := owner_restaurant_for_user(p_user_id);
  perform set_config('app.is_operator', 'true', true);
  select slug into rest_slug from restaurant where id = rid;
  select version into logo_version from restaurant_logo where restaurant_id = rid;
  update restaurant set theme = case
    when logo_version is null then coalesce(theme, '{}'::jsonb) - 'logo'
    else coalesce(theme, '{}'::jsonb) || jsonb_build_object('logo', '/r/' || rest_slug || '/logo?v=' || logo_version)
  end where id = rid;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

revoke all on function sync_owner_logo(text) from public;
grant execute on function sync_owner_logo(text) to app_user;
