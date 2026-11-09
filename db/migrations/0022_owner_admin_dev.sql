-- 0022_owner_admin_dev.sql - DEV BRANCH ONLY. Not applied by the build.
-- Phase D13a: live Settings, Activity log, Feedback and Ideas for owners.
--
-- SECURITY: the caller passes only a user id (and the values to save). Each
-- function looks up the caller's own app_user row, requires role owner or
-- manager, and acts only on that user's restaurant. Refusals use short codes:
-- not_allowed, invalid_value, rate_limited.
--
-- Safe to re-run: columns use IF NOT EXISTS, functions use CREATE OR REPLACE.

-- 1. Settings columns on restaurant. D13c reads orders_at_till; D13a only owns the switch.
-- marketing_weekly_cap and member_weekly_cap already exist (0001) and are the message limits.
alter table restaurant
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists enquiry_email text,
  add column if not exists offers_alerts boolean not null default true,
  add column if not exists orders_at_till boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurant_weekly_caps_range') then
    alter table restaurant add constraint restaurant_weekly_caps_range
      check (marketing_weekly_cap between 0 and 14 and member_weekly_cap between 0 and 14);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurant_phone_format') then
    alter table restaurant add constraint restaurant_phone_format
      check (phone is null or phone ~ '^[0-9+ ()-]{7,20}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurant_address_length') then
    alter table restaurant add constraint restaurant_address_length
      check (address is null or char_length(address) between 1 and 160);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurant_enquiry_email_format') then
    alter table restaurant add constraint restaurant_enquiry_email_format
      check (enquiry_email is null or (char_length(enquiry_email) <= 120 and enquiry_email ~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'));
  end if;
end $$;

-- 2. Owner or manager lookup, as in 0014. Only this function may read the caller's link row.
create or replace function owner_restaurant_for_user(p_user_id text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  u app_user%rowtype;
begin
  perform set_config('app.is_operator', 'true', true);
  select * into u from app_user where user_id = p_user_id;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  if not found or u.restaurant_id is null or u.role not in ('owner', 'manager') then
    raise exception 'not_allowed';
  end if;
  return u.restaurant_id;
end;
$$;

-- 3. Save business details and preferences. Writes one audit row per changed
-- business name or phone, and one for any other settings change.
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
  p_member_cap integer
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
    member_weekly_cap = p_member_cap
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
     or r.marketing_weekly_cap is distinct from p_marketing_cap or r.member_weekly_cap is distinct from p_member_cap then
    insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
      values ('owner', p_user_id, rid, 'settings_changed', 'restaurant', rid::text, '{}'::jsonb);
  end if;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

-- 4. Owner sends feedback. Rate limited: 10 per day per user (bucket feedback-send).
-- The row is stored with source 'owner' and the caller's restaurant, never a browser id.
create or replace function send_owner_feedback(
  p_user_id text,
  p_id text,
  p_category text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  msg text := trim(coalesce(p_message, ''));
  sent_today integer;
begin
  rid := owner_restaurant_for_user(p_user_id);
  if p_category not in ('broken', 'feature', 'confusing', 'other') then
    raise exception 'invalid_value';
  end if;
  if char_length(msg) < 10 or char_length(msg) > 1000 then
    raise exception 'invalid_value';
  end if;
  perform set_config('app.is_operator', 'true', true);
  select count(*) into sent_today from rate_limit_hit
    where bucket = 'feedback-send' and key = p_user_id and created_at > now() - interval '1 day';
  if sent_today >= 10 then
    raise exception 'rate_limited';
  end if;
  insert into rate_limit_hit (bucket, key) values ('feedback-send', p_user_id);
  insert into feedback (id, restaurant_id, source, category, message, status, note)
    values (p_id, rid, 'owner', p_category, msg, 'new', '');
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'feedback_received', 'feedback', p_id, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

-- 5. Owner reads their own feedback (never the private operator note).
create or replace function list_owner_feedback(p_user_id text)
returns table (id text, category text, message text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
begin
  rid := owner_restaurant_for_user(p_user_id);
  perform set_config('app.is_operator', 'true', true);
  perform set_config('app.restaurant_id', rid::text, true);
  return query
    select f.id, f.category, f.message, f.status, f.created_at
    from feedback f
    where f.restaurant_id = rid and f.source = 'owner'
    order by f.created_at desc
    limit 50;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

-- 6. Owner asks for an idea in their suburb: adds one ask, or counts up an
-- existing row for the same place and suburb (the demo behaviour). Rate limited
-- with the same daily bucket as feedback.
create or replace function submit_owner_idea(p_user_id text, p_place text, p_note text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  r restaurant%rowtype;
  place_clean text := trim(coalesce(p_place, ''));
  note_clean text := nullif(trim(coalesce(p_note, '')), '');
  asks_now integer;
  sent_today integer;
begin
  rid := owner_restaurant_for_user(p_user_id);
  perform set_config('app.is_operator', 'true', true);
  select * into r from restaurant where id = rid;
  if char_length(place_clean) < 1 or char_length(place_clean) > 120 then
    raise exception 'invalid_value';
  end if;
  if note_clean is not null and char_length(note_clean) > 280 then
    raise exception 'invalid_value';
  end if;
  if r.suburb is null then
    raise exception 'invalid_value';
  end if;
  select count(*) into sent_today from rate_limit_hit
    where bucket = 'feedback-send' and key = p_user_id and created_at > now() - interval '1 day';
  if sent_today >= 10 then
    raise exception 'rate_limited';
  end if;
  insert into rate_limit_hit (bucket, key) values ('feedback-send', p_user_id);
  insert into idea (id, place, suburb, asks, note, status)
    values ('idea-' || gen_random_uuid()::text, place_clean, r.suburb, 1, note_clean, 'new')
    on conflict (lower(place), lower(suburb)) do update
      set asks = idea.asks + 1, note = coalesce(excluded.note, idea.note)
    returning asks into asks_now;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'idea_received', 'idea', place_clean, '{}'::jsonb);
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return asks_now;
end;
$$;

-- 7. Owner reads the asks board for their suburb: place and counts only, no notes or names.
create or replace function list_owner_ideas(p_user_id text)
returns table (place text, asks bigint, latest_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  r restaurant%rowtype;
begin
  rid := owner_restaurant_for_user(p_user_id);
  perform set_config('app.is_operator', 'true', true);
  select * into r from restaurant where id = rid;
  return query
    select i.place, sum(i.asks)::bigint, max(i.created_at)
    from idea i
    where lower(i.suburb) = lower(r.suburb)
    group by i.place
    order by sum(i.asks) desc, i.place
    limit 50;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

-- 8. Owner reads their restaurant's activity, newest first, 50 per page.
-- Only this restaurant's rows. The app turns action names into plain wording.
create or replace function list_owner_activity(p_user_id text, p_before timestamptz)
returns table (id uuid, action text, actor_type text, actor_id text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
begin
  rid := owner_restaurant_for_user(p_user_id);
  perform set_config('app.is_operator', 'true', true);
  return query
    select a.id, a.action, a.actor_type, a.actor_id, a.created_at
    from audit_event a
    where a.restaurant_id = rid
      and (p_before is null or a.created_at < p_before)
    order by a.created_at desc, a.id desc
    limit 50;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

-- 9. Owner or manager turns Help from Patron on or off. The owner's own window:
-- operators still cannot change it (guard_patron_help in 0011). Days are 1, 7, 14 or 30.
create or replace function set_owner_help(p_user_id text, p_enabled boolean, p_days integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
begin
  rid := owner_restaurant_for_user(p_user_id);
  if p_enabled is null then
    raise exception 'invalid_value';
  end if;
  if p_enabled and (p_days is null or p_days not in (1, 7, 14, 30)) then
    raise exception 'invalid_value';
  end if;
  perform set_config('app.is_operator', 'true', true);
  update restaurant set
    patron_help_enabled = p_enabled,
    patron_help_expires_at = case when p_enabled then now() + make_interval(days => p_days) else null end
  where id = rid;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'settings_changed', 'restaurant', rid::text,
            jsonb_build_object('help_enabled', p_enabled));
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

-- 10. Done-for-you campaign request. Saved as a lead row with kind 'waitlist' so an
-- operator can read it. It is a request only: nothing is sent.
create or replace function request_owner_campaign(p_user_id text, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  rid uuid;
  r restaurant%rowtype;
  u app_user%rowtype;
  note_clean text := trim(coalesce(p_note, ''));
begin
  rid := owner_restaurant_for_user(p_user_id);
  if char_length(note_clean) < 10 or char_length(note_clean) > 500 then
    raise exception 'invalid_value';
  end if;
  perform set_config('app.is_operator', 'true', true);
  select * into r from restaurant where id = rid;
  select * into u from app_user where user_id = p_user_id;
  insert into lead (kind, restaurant_name, contact_name, phone, email, suburb, plan_interest, consent, consent_at,
                    consent_version, notes, status)
    values ('waitlist', r.name, 'Owner', coalesce(r.phone, 'not given'), u.email,
            r.suburb, 'done_for_you_campaign', true, now(), 'owner-settings-v1', note_clean, 'new');
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('owner', p_user_id, rid, 'settings_changed', 'restaurant', rid::text,
            jsonb_build_object('campaign_requested', true));
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

-- 11. Grants. Each function is revoked from public and granted only to the app role.
revoke all on function owner_restaurant_for_user(text) from public;
revoke all on function set_owner_help(text, boolean, integer) from public;
revoke all on function request_owner_campaign(text, text) from public;
revoke all on function save_owner_settings(text, text, text, text, text, text, text, boolean, boolean, integer, integer) from public;
revoke all on function send_owner_feedback(text, text, text, text) from public;
revoke all on function list_owner_feedback(text) from public;
revoke all on function submit_owner_idea(text, text, text) from public;
revoke all on function list_owner_ideas(text) from public;
revoke all on function list_owner_activity(text, timestamptz) from public;
grant execute on function set_owner_help(text, boolean, integer) to app_user;
grant execute on function request_owner_campaign(text, text) to app_user;
grant execute on function save_owner_settings(text, text, text, text, text, text, text, boolean, boolean, integer, integer) to app_user;
grant execute on function send_owner_feedback(text, text, text, text) to app_user;
grant execute on function list_owner_feedback(text) to app_user;
grant execute on function submit_owner_idea(text, text, text) to app_user;
grant execute on function list_owner_ideas(text) to app_user;
grant execute on function list_owner_activity(text, timestamptz) to app_user;
