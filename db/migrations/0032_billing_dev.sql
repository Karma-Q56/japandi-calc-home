-- Phase D21: plans, billing and payments (database part).
-- NOT APPLIED. The build does not run this file. Test on the preview database first.
--
-- SECURITY: every function below is SECURITY DEFINER with
-- set search_path = public, pg_temp, revokes execute from public and grants it to app_user.
-- Operator functions save and restore app.is_operator the same way as 0013 and 0029.
-- Owner-facing functions check the restaurant against the caller's own context first.

-- 1. Plan location limit. The plan limits live in src/config/plans.ts; this function reads
--    the same numbers from a small table so the database can enforce them too.
create table plan_limit (
  plan             plan_tier primary key,
  max_locations    integer not null check (max_locations > 0)
);
insert into plan_limit (plan, max_locations) values
  ('starter', 1), ('managed', 3), ('partner', 10), ('custom', 50)
on conflict (plan) do nothing;
alter table plan_limit enable row level security;
alter table plan_limit force row level security;
create policy plan_limit_read on plan_limit for select using (true);
revoke all on plan_limit from public;
grant select on plan_limit to app_user;

-- Refuses a new active location when the restaurant is already at its plan limit.
create or replace function location_limit() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r_plan     plan_tier;
  r_max      integer;
  r_count    integer;
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  select plan into r_plan from restaurant where id = new.restaurant_id;
  select max_locations into r_max from plan_limit where plan = r_plan;
  select count(*)::int into r_count from location
    where restaurant_id = new.restaurant_id and active;
  if new.active and r_max is not null and r_count >= r_max then
    raise exception 'plan_limit_locations';
  end if;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return new;
end;
$$;
revoke all on function location_limit() from public;

create trigger location_limit_guard
  before insert on location
  for each row execute function location_limit();

-- 2. Payment state. A card payment starts 'pending'. The ITN marks it 'paid' or 'failed'.
--    'failed' and 'cancelled' change nothing in the balance.
alter type payment_status add value if not exists 'paid';
alter type payment_status add value if not exists 'failed';
alter type payment_status add value if not exists 'cancelled';

-- 3. Invoices for the managed plan.
create table invoice (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurant(id) on delete cascade,
  amount_cents    integer not null check (amount_cents > 0 and amount_cents <= 10000000),
  description     text not null check (length(description) between 3 and 200),
  due_date        date not null,
  status          text not null default 'open' check (status in ('open', 'paid', 'void')),
  payment_reference text unique,
  paid_at         timestamptz,
  created_by      text,
  created_at      timestamptz not null default now()
);
create index invoice_restaurant on invoice (restaurant_id, created_at desc);
alter table invoice enable row level security;
alter table invoice force row level security;
create policy tenant_read on invoice for select
  using (restaurant_id = app_restaurant() or app_is_operator());
create policy operator_all on invoice for all
  using (app_is_operator()) with check (app_is_operator());
revoke all on invoice from public;
grant select, insert, update on invoice to app_user;

-- 4. Owner's card payment request. The server passes the amount it computed from plan data.
--    Refusals: restaurant_not_found, bad_amount, bad_kind, bad_reference.
create or replace function create_card_payment(
  p_restaurant_id uuid, p_kind payment_kind, p_amount_cents integer, p_reference text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if not app_is_operator() and app_restaurant() is distinct from p_restaurant_id then
    raise exception 'not_allowed';
  end if;
  if not exists (select 1 from restaurant where id = p_restaurant_id) then
    raise exception 'restaurant_not_found';
  end if;
  if p_kind not in ('subscription', 'topup') then
    raise exception 'bad_kind';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 10000000 then
    raise exception 'bad_amount';
  end if;
  if p_reference is null or char_length(p_reference) < 8 or char_length(p_reference) > 80 then
    raise exception 'bad_reference';
  end if;
  insert into payment (restaurant_id, kind, amount_cents, status, reference, provider, requested_by)
    values (p_restaurant_id, p_kind, p_amount_cents, 'pending', p_reference, 'payfast', 'owner')
    returning id into new_id;
  return new_id;
end;
$$;
revoke all on function create_card_payment(uuid, payment_kind, integer, text) from public;
grant execute on function create_card_payment(uuid, payment_kind, integer, text) to app_user;

-- 5. Settle a payment from a verified ITN. Called only by the webhook (server side, app_user).
--    Marks the payment paid and writes one topup ledger entry, reference 'payment:<id>',
--    in the same transaction. A repeat changes nothing. Result: 'paid', 'already_paid'
--    or 'ignored' (failed or cancelled payments change nothing).
--    Refusals: payment_not_found, amount_mismatch.
create or replace function settle_card_payment(
  p_payment_id uuid, p_amount_cents integer, p_provider_ref text, p_outcome text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p       payment%rowtype;
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  select * into p from payment where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found';
  end if;
  if p.status = 'paid' then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 'already_paid';
  end if;
  if p_outcome <> 'paid' then
    update payment set status = case when p_outcome = 'cancelled' then 'cancelled' else 'failed' end,
      provider_ref = p_provider_ref where id = p_payment_id;
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 'ignored';
  end if;
  if p_amount_cents <> p.amount_cents then
    raise exception 'amount_mismatch';
  end if;
  update payment set status = 'paid', confirmed_at = now(), provider_ref = p_provider_ref
    where id = p_payment_id;
  if p.kind = 'topup' then
    insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, payment_id, note, created_by)
      values (p.restaurant_id, 'topup', p.amount_cents, 'payment:' || p.id::text, p.id,
              'Card top up', 'payfast')
      on conflict (reference) do nothing;
  end if;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('system', 'payfast', p.restaurant_id, 'payment_paid', 'payment', p.id::text,
            jsonb_build_object('kind', p.kind::text, 'amount_cents', p.amount_cents));
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return 'paid';
end;
$$;
revoke all on function settle_card_payment(uuid, integer, text, text) from public;
grant execute on function settle_card_payment(uuid, integer, text, text) to app_user;

-- 6. Operator marks an invoice paid once. Writes a topup entry with reference 'invoice:<id>'.
--    Refusals: not_operator, invoice_not_found, already_paid, bad_reference, bad_reason.
create or replace function operator_mark_invoice_paid(
  p_operator_id text, p_invoice_id uuid, p_payment_reference text, p_reason text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i       invoice%rowtype;
  clean_ref text := btrim(coalesce(p_payment_reference, ''));
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  if char_length(clean_ref) < 4 or char_length(clean_ref) > 80 then
    raise exception 'bad_reference';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'bad_reason';
  end if;
  select * into i from invoice where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice_not_found';
  end if;
  if i.status <> 'open' then
    raise exception 'already_paid';
  end if;
  update invoice set status = 'paid', paid_at = now(), payment_reference = clean_ref where id = p_invoice_id;
  insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, note, created_by)
    values (i.restaurant_id, 'topup', i.amount_cents, 'invoice:' || i.id::text,
            'Invoice paid: ' || i.description, p_operator_id)
    on conflict (reference) do nothing;
  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, i.restaurant_id, 'invoice_marked_paid', 'invoice', i.id::text,
            jsonb_build_object('amount_cents', i.amount_cents, 'payment_reference', clean_ref,
                               'reason', btrim(p_reason)));
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return 'paid';
end;
$$;
revoke all on function operator_mark_invoice_paid(text, uuid, text, text) from public;
grant execute on function operator_mark_invoice_paid(text, uuid, text, text) to app_user;

-- 7. Operator creates a managed invoice for a restaurant. Result: the new invoice id.
--    Refusals: not_operator, restaurant_not_found, bad_amount, bad_description, bad_due_date.
create or replace function operator_create_invoice(
  p_operator_id text, p_restaurant_id uuid, p_amount_cents integer,
  p_description text, p_due_date date
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_description text := btrim(coalesce(p_description, ''));
  new_id uuid;
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  if p_amount_cents is null or p_amount_cents < 100 or p_amount_cents > 10000000 then
    raise exception 'bad_amount';
  end if;
  if char_length(clean_description) < 3 or char_length(clean_description) > 200 then
    raise exception 'bad_description';
  end if;
  if p_due_date is null then
    raise exception 'bad_due_date';
  end if;
  if not exists (select 1 from restaurant where id = p_restaurant_id) then
    raise exception 'restaurant_not_found';
  end if;

  insert into invoice (restaurant_id, amount_cents, description, due_date, status)
    values (p_restaurant_id, p_amount_cents, clean_description, p_due_date, 'open')
    returning id into new_id;

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, p_restaurant_id, 'invoice_created', 'invoice', new_id::text,
            jsonb_build_object('amount_cents', p_amount_cents, 'due_date', p_due_date::text,
                               'description', clean_description));
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return new_id;
end;
$$;
revoke all on function operator_create_invoice(text, uuid, integer, text, date) from public;
grant execute on function operator_create_invoice(text, uuid, integer, text, date) to app_user;
