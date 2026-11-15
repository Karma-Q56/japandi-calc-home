-- Phase D18: operator console (live).
-- Not applied by the build. Test on the preview database first.
--
-- SECURITY: every function below takes the operator's user id and checks, in the
-- database, that the app_user row for that id still has role 'operator'. The app
-- passes the id from the server session, never from the browser.
-- Each function switches operator context on only while it runs, then puts the
-- caller's value back before it returns (same pattern as create_restaurant_for_owner, 0013).
-- Every action writes an audit_event row in the same transaction.

-- Check that the caller is a real operator. Raises 'not_operator' otherwise.
create or replace function assert_operator(p_operator_id text) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from app_user where user_id = p_operator_id and role = 'operator'
  ) then
    raise exception 'not_operator';
  end if;
end;
$$;

-- Pause, resume or close a restaurant. Result: the new status.
-- Refusals: not_operator, restaurant_not_found, bad_status, same_status, bad_reason.
create or replace function operator_set_restaurant_status(
  p_operator_id text, p_restaurant_id uuid, p_status restaurant_status, p_reason text
) returns restaurant_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r           restaurant%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  if char_length(clean_reason) < 3 or char_length(clean_reason) > 200 then
    raise exception 'bad_reason';
  end if;
  if p_status is null then
    raise exception 'bad_status';
  end if;

  select * into r from restaurant where id = p_restaurant_id for update;
  if not found then
    raise exception 'restaurant_not_found';
  end if;
  if r.status = p_status then
    raise exception 'same_status';
  end if;

  update restaurant set status = p_status, updated_at = now() where id = p_restaurant_id;

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, p_restaurant_id, 'restaurant_status_changed', 'restaurant',
            p_restaurant_id::text,
            jsonb_build_object('from', r.status::text, 'to', p_status::text, 'reason', clean_reason));

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return p_status;
end;
$$;

-- Change a restaurant's plan. Result: the new plan.
-- Refusals: not_operator, restaurant_not_found, bad_plan, same_plan, bad_reason.
create or replace function operator_set_restaurant_plan(
  p_operator_id text, p_restaurant_id uuid, p_plan plan_tier, p_reason text
) returns plan_tier
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r           restaurant%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  if char_length(clean_reason) < 3 or char_length(clean_reason) > 200 then
    raise exception 'bad_reason';
  end if;
  if p_plan is null then
    raise exception 'bad_plan';
  end if;

  select * into r from restaurant where id = p_restaurant_id for update;
  if not found then
    raise exception 'restaurant_not_found';
  end if;
  if r.plan = p_plan then
    raise exception 'same_plan';
  end if;

  update restaurant set plan = p_plan, updated_at = now() where id = p_restaurant_id;

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, p_restaurant_id, 'restaurant_plan_changed', 'restaurant',
            p_restaurant_id::text,
            jsonb_build_object('from', r.plan::text, 'to', p_plan::text, 'reason', clean_reason));

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return p_plan;
end;
$$;

-- Add credit (topup) or correct it (adjustment). Amount in whole cents: positive adds,
-- negative removes (adjustment only). The reference is the idempotency key: a repeat with
-- the same reference adds nothing and returns 'duplicate'.
-- Result: the new ledger row id, or the text 'duplicate'.
-- Refusals: not_operator, restaurant_not_found, bad_amount, bad_entry_type, bad_reference, bad_reason.
create or replace function operator_add_credit(
  p_operator_id text, p_restaurant_id uuid, p_entry_type ledger_entry_type,
  p_amount_cents integer, p_reference text, p_reason text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_reason text := btrim(coalesce(p_reason, ''));
  clean_ref    text := btrim(coalesce(p_reference, ''));
  new_id       uuid;
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  if not exists (select 1 from restaurant where id = p_restaurant_id) then
    raise exception 'restaurant_not_found';
  end if;
  if p_entry_type is null or p_entry_type not in ('topup', 'adjustment') then
    raise exception 'bad_entry_type';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 or abs(p_amount_cents) > 10000000 then
    raise exception 'bad_amount';
  end if;
  if p_entry_type = 'topup' and p_amount_cents < 0 then
    raise exception 'bad_amount';
  end if;
  if char_length(clean_ref) < 8 or char_length(clean_ref) > 80 then
    raise exception 'bad_reference';
  end if;
  if char_length(clean_reason) < 3 or char_length(clean_reason) > 200 then
    raise exception 'bad_reason';
  end if;

  -- A repeat with the same reference adds nothing.
  if exists (select 1 from credit_ledger where reference = clean_ref) then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 'duplicate';
  end if;

  insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, note, created_by)
    values (p_restaurant_id, p_entry_type, p_amount_cents, clean_ref, clean_reason, p_operator_id)
    returning id into new_id;

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, p_restaurant_id, 'credit_added', 'credit_ledger',
            new_id::text,
            jsonb_build_object('entry_type', p_entry_type::text, 'amount_cents', p_amount_cents,
                               'reason', clean_reason));

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return new_id::text;
end;
$$;

-- Approve or reject a campaign that is waiting for approval.
-- Approve: writes approved_by and approved_at, status moves to 'scheduled'.
-- Reject: needs a reason, status moves to 'cancelled'.
-- Result: the new campaign status.
-- Refusals: not_operator, campaign_not_found, not_pending, bad_decision, bad_reason.
create or replace function operator_decide_campaign(
  p_operator_id text, p_campaign_id uuid, p_decision text, p_reason text
) returns campaign_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c            campaign%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
  new_status   campaign_status;
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  if p_decision not in ('approve', 'reject') then
    raise exception 'bad_decision';
  end if;
  if p_decision = 'reject' and (char_length(clean_reason) < 3 or char_length(clean_reason) > 200) then
    raise exception 'bad_reason';
  end if;

  select * into c from campaign where id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found';
  end if;
  if c.status <> 'pending_approval' then
    raise exception 'not_pending';
  end if;

  if p_decision = 'approve' then
    new_status := 'scheduled';
    update campaign set status = new_status, approved_by = p_operator_id, approved_at = now()
      where id = p_campaign_id;
  else
    new_status := 'cancelled';
    update campaign set status = new_status where id = p_campaign_id;
  end if;

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, c.restaurant_id,
            case when p_decision = 'approve' then 'campaign_approved' else 'campaign_rejected' end,
            'campaign', p_campaign_id::text,
            jsonb_build_object('reason', nullif(clean_reason, '')));

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return new_status;
end;
$$;


-- Create a draft restaurant for an owner by email. The owner claims it when they sign up
-- with that email (the app links the new login to this restaurant). Starts private on the starter plan.
-- Result: the new restaurant id.
-- Refusals: not_operator, bad_name, bad_slug, slug_reserved, slug_taken, bad_email, bad_location.
create or replace function operator_create_restaurant(
  p_operator_id text, p_owner_email text, p_name text, p_slug text, p_suburb text, p_city text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id      uuid;
  clean_email text := lower(btrim(coalesce(p_owner_email, '')));
  clean_name  text := btrim(coalesce(p_name, ''));
  clean_slug  text := lower(btrim(coalesce(p_slug, '')));
  clean_sub   text := nullif(btrim(coalesce(p_suburb, '')), '');
  clean_city  text := coalesce(nullif(btrim(coalesce(p_city, '')), ''), 'Johannesburg');
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  if char_length(clean_email) < 5 or char_length(clean_email) > 254 or clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'bad_email';
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

  insert into restaurant (slug, name, status, plan, suburb, city, public_listed)
    values (clean_slug, clean_name, 'draft', 'starter', clean_sub, clean_city, false)
    returning id into new_id;

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, new_id, 'restaurant_created_for_owner', 'restaurant',
            new_id::text, jsonb_build_object('slug', clean_slug, 'owner_email', clean_email));

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return new_id;
end;
$$;

revoke all on function assert_operator(text) from public;
revoke all on function operator_create_restaurant(text, text, text, text, text, text) from public;
grant execute on function operator_create_restaurant(text, text, text, text, text, text) to app_user;
revoke all on function operator_set_restaurant_status(text, uuid, restaurant_status, text) from public;
revoke all on function operator_set_restaurant_plan(text, uuid, plan_tier, text) from public;
revoke all on function operator_add_credit(text, uuid, ledger_entry_type, integer, text, text) from public;
revoke all on function operator_decide_campaign(text, uuid, text, text) from public;
grant execute on function assert_operator(text) to app_user;
grant execute on function operator_set_restaurant_status(text, uuid, restaurant_status, text) to app_user;
grant execute on function operator_set_restaurant_plan(text, uuid, plan_tier, text) to app_user;
grant execute on function operator_add_credit(text, uuid, ledger_entry_type, integer, text, text) to app_user;
grant execute on function operator_decide_campaign(text, uuid, text, text) to app_user;
