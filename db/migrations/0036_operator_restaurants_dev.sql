-- 0036: live operator console, part 1 (restaurants, credit, top ups, invoices, refunds).
-- Depends on 0029 (assert_operator, operator functions) and 0032 (invoice, payment.plan).
-- Every function is SECURITY DEFINER, sets a search_path, and starts with assert_operator.
-- Reads never return guest phone numbers or names.
--
-- A refund here means Patron gave money back to a restaurant for a card or EFT payment.
-- The money itself is returned by hand (in the PayFast dashboard or by EFT). These
-- functions only RECORD it so the credit balance and the books match. They never move money.

-- ---------------------------------------------------------------- refund table
create table refund (
  id             uuid primary key default gen_random_uuid(),
  payment_id     uuid not null references payment(id),
  restaurant_id  uuid not null references restaurant(id),
  amount_cents   integer not null check (amount_cents > 0),
  reason         text not null check (char_length(reason) between 3 and 300),
  created_by     text not null,
  created_at     timestamptz not null default now()
);
create index refund_payment on refund (payment_id);
create index refund_restaurant on refund (restaurant_id, created_at desc);
alter table refund enable row level security;
alter table refund force row level security;
create policy operator_all on refund for all
  using (app_is_operator()) with check (app_is_operator());
revoke all on refund from public;
-- No direct grants to app_user: the functions below are the only way in.

-- ---------------------------------------------------------------- read: restaurants
-- Refusals: not_operator.
create or replace function operator_list_restaurants(
  p_operator_id text, p_search text, p_status text, p_limit integer, p_offset integer
) returns table (
  id uuid, name text, slug text, status restaurant_status, plan plan_tier, suburb text,
  created_at timestamptz, members integer, last_stamp_at timestamptz, credit_cents bigint,
  owner_email text, active_locations integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  needle text := '%' || replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  off integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  return query
    select r.id, r.name, r.slug, r.status, r.plan, r.suburb, r.created_at,
      (select count(*)::integer from membership m where m.restaurant_id = r.id) as members,
      (select max(s.created_at) from stamp_event s where s.restaurant_id = r.id and s.status = 'valid') as last_stamp_at,
      coalesce((select sum(c.amount_cents) from credit_ledger c where c.restaurant_id = r.id), 0)::bigint as credit_cents,
      (select u.email from app_user u where u.restaurant_id = r.id and u.role = 'owner' order by u.created_at limit 1) as owner_email,
      (select count(*)::integer from location l where l.restaurant_id = r.id and l.active) as active_locations
    from restaurant r
    where (btrim(coalesce(p_search, '')) = ''
           or r.name ilike needle escape '\'
           or r.slug ilike needle escape '\'
           or exists (select 1 from app_user u where u.restaurant_id = r.id and u.role = 'owner'
                      and u.email ilike needle escape '\'))
      and (p_status is null or p_status = '' or r.status::text = p_status)
    order by r.name, r.id
    limit lim offset off;

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;
revoke all on function operator_list_restaurants(text, text, text, integer, integer) from public;
grant execute on function operator_list_restaurants(text, text, text, integer, integer) to app_user;

-- ---------------------------------------------------------------- read: one restaurant
-- Result: a jsonb object. No guest names or phone numbers are included.
-- Refusals: not_operator, restaurant_not_found.
create or replace function operator_restaurant_detail(p_operator_id text, p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r         restaurant%rowtype;
  result    jsonb;
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  select * into r from restaurant where id = p_restaurant_id;
  if not found then
    raise exception 'restaurant_not_found';
  end if;

  result := jsonb_build_object(
    'restaurant', jsonb_build_object('id', r.id, 'name', r.name, 'slug', r.slug, 'status', r.status::text,
                                     'plan', r.plan::text, 'suburb', r.suburb, 'created_at', r.created_at),
    'people', coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'role', u.role) order by u.role, u.email)
                        from app_user u where u.restaurant_id = r.id and u.role in ('owner', 'manager')), '[]'::jsonb),
    'counts', jsonb_build_object(
      'members', (select count(*) from membership m where m.restaurant_id = r.id),
      'stamps_30_days', (select count(*) from stamp_event s where s.restaurant_id = r.id and s.status = 'valid'
                         and s.created_at > now() - interval '30 days'),
      'active_locations', (select count(*) from location l where l.restaurant_id = r.id and l.active)),
    'credit_cents', coalesce((select sum(c.amount_cents) from credit_ledger c where c.restaurant_id = r.id), 0),
    'ledger', coalesce((select jsonb_agg(x order by x.created_at desc) from (
                          select c.entry_type::text as entry_type, c.amount_cents, c.note, c.reference, c.created_at
                          from credit_ledger c where c.restaurant_id = r.id
                          order by c.created_at desc limit 20) x), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(x order by x.created_at desc) from (
                         select a.action, a.actor_type, a.meta, a.created_at
                         from audit_event a where a.restaurant_id = r.id
                         order by a.created_at desc limit 20) x), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(x order by x.created_at desc) from (
                            select i.id, i.amount_cents, i.description, i.due_date, i.status, i.paid_at, i.created_at
                            from invoice i where i.restaurant_id = r.id
                            order by i.created_at desc limit 10) x), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(x order by x.created_at desc) from (
                            select p.id, p.kind::text as kind, p.amount_cents, p.status::text as status,
                                   p.reference, p.provider, p.created_at,
                                   coalesce((select sum(f.amount_cents) from refund f where f.payment_id = p.id), 0) as refunded_cents
                            from payment p where p.restaurant_id = r.id
                            order by p.created_at desc limit 10) x), '[]'::jsonb),
    'pending_topups', coalesce((select jsonb_agg(x order by x.created_at) from (
                            select p.id, p.amount_cents, p.reference, p.created_at
                            from payment p where p.restaurant_id = r.id and p.kind = 'topup'
                              and p.status = 'pending' and p.provider = 'manual_eft'
                            order by p.created_at) x), '[]'::jsonb)
  );

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return result;
end;
$$;
revoke all on function operator_restaurant_detail(text, uuid) from public;
grant execute on function operator_restaurant_detail(text, uuid) to app_user;

-- ---------------------------------------------------------------- read: pending top ups (all restaurants)
-- Refusals: not_operator.
create or replace function operator_pending_topups(p_operator_id text)
returns table (payment_id uuid, restaurant_id uuid, restaurant_name text, amount_cents integer,
               reference text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  return query
    select p.id, p.restaurant_id, r.name, p.amount_cents, p.reference, p.created_at
    from payment p join restaurant r on r.id = p.restaurant_id
    where p.kind = 'topup' and p.status = 'pending' and p.provider = 'manual_eft'
    order by p.created_at;

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;
revoke all on function operator_pending_topups(text) from public;
grant execute on function operator_pending_topups(text) to app_user;

-- ---------------------------------------------------------------- read: invoices (all restaurants)
-- Refusals: not_operator.
create or replace function operator_list_invoices(p_operator_id text, p_status text, p_limit integer)
returns table (invoice_id uuid, restaurant_id uuid, restaurant_name text, amount_cents integer,
               description text, due_date date, status text, paid_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  lim integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  return query
    select i.id, i.restaurant_id, r.name, i.amount_cents, i.description, i.due_date,
           i.status, i.paid_at, i.created_at
    from invoice i join restaurant r on r.id = i.restaurant_id
    where p_status is null or p_status = '' or i.status = p_status
    order by i.created_at desc
    limit lim;

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;
revoke all on function operator_list_invoices(text, text, integer) from public;
grant execute on function operator_list_invoices(text, text, integer) to app_user;

-- ---------------------------------------------------------------- write: confirm a top up
-- Adds credit once. A second call is refused as not_pending (no double credit).
-- Refusals: not_operator, bad_reference, not_pending.
create or replace function operator_confirm_topup(p_operator_id text, p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p       payment%rowtype;
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  if p_payment_id is null then
    raise exception 'bad_reference';
  end if;

  select * into p from payment where id = p_payment_id for update;
  if not found or p.kind <> 'topup' or p.provider <> 'manual_eft' then
    raise exception 'bad_reference';
  end if;
  if p.status <> 'pending' then
    raise exception 'not_pending';
  end if;

  update payment set status = 'confirmed', confirmed_by = p_operator_id, confirmed_at = now()
    where id = p.id;

  insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, payment_id, note, created_by)
    values (p.restaurant_id, 'topup', p.amount_cents, 'payment:' || p.id::text, p.id,
            'Manual EFT top up confirmed', p_operator_id);

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, p.restaurant_id, 'topup_confirmed', 'payment',
            p.id::text, jsonb_build_object('amount_cents', p.amount_cents));

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;
revoke all on function operator_confirm_topup(text, uuid) from public;
grant execute on function operator_confirm_topup(text, uuid) to app_user;

-- ---------------------------------------------------------------- write: reject a top up
-- Refusals: not_operator, bad_reference, not_pending, bad_reason.
create or replace function operator_reject_topup(p_operator_id text, p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p       payment%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  if char_length(clean_reason) < 3 or char_length(clean_reason) > 300 then
    raise exception 'bad_reason';
  end if;
  if p_payment_id is null then
    raise exception 'bad_reference';
  end if;

  select * into p from payment where id = p_payment_id for update;
  if not found or p.kind <> 'topup' or p.provider <> 'manual_eft' then
    raise exception 'bad_reference';
  end if;
  if p.status <> 'pending' then
    raise exception 'not_pending';
  end if;

  update payment set status = 'rejected' where id = p.id;

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, p.restaurant_id, 'topup_rejected', 'payment',
            p.id::text, jsonb_build_object('amount_cents', p.amount_cents, 'reason', clean_reason));

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;
revoke all on function operator_reject_topup(text, uuid, text) from public;
grant execute on function operator_reject_topup(text, uuid, text) to app_user;

-- ---------------------------------------------------------------- write: void an open invoice
-- Refusals: not_operator, invoice_not_found, not_open, bad_reason.
create or replace function operator_void_invoice(p_operator_id text, p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i       invoice%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  if char_length(clean_reason) < 3 or char_length(clean_reason) > 300 then
    raise exception 'bad_reason';
  end if;

  select * into i from invoice where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice_not_found';
  end if;
  if i.status <> 'open' then
    raise exception 'not_open';
  end if;

  update invoice set status = 'void' where id = i.id;

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, i.restaurant_id, 'invoice_voided', 'invoice',
            i.id::text, jsonb_build_object('amount_cents', i.amount_cents, 'reason', clean_reason));

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;
revoke all on function operator_void_invoice(text, uuid, text) from public;
grant execute on function operator_void_invoice(text, uuid, text) to app_user;

-- ---------------------------------------------------------------- write: record a refund
-- The money is returned by hand. This records it.
-- A confirmed top up refund takes the same amount of credit away (negative adjustment row).
-- A monthly payment refund is recorded only; it does not touch credit.
-- Refusals: not_operator, bad_reference, not_refundable, amount_too_large, credit_already_used,
--           bad_reason.
create or replace function operator_record_refund(
  p_operator_id text, p_payment_id uuid, p_amount_cents integer, p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p          payment%rowtype;
  new_id     uuid;
  already    integer;
  credit_left bigint;
  clean_reason text := btrim(coalesce(p_reason, ''));
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);

  if char_length(clean_reason) < 3 or char_length(clean_reason) > 300 then
    raise exception 'bad_reason';
  end if;
  if p_payment_id is null then
    raise exception 'bad_reference';
  end if;

  select * into p from payment where id = p_payment_id for update;
  if not found then
    raise exception 'bad_reference';
  end if;
  if p.status <> 'confirmed' then
    raise exception 'not_refundable';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'bad_amount';
  end if;

  select coalesce(sum(amount_cents), 0)::integer into already from refund where payment_id = p.id;
  if p_amount_cents > p.amount_cents - already then
    raise exception 'amount_too_large';
  end if;

  if p.kind = 'topup' then
    -- Taking the credit back must not push the balance below zero.
    select coalesce(sum(amount_cents), 0) into credit_left
      from credit_ledger where restaurant_id = p.restaurant_id;
    if credit_left - p_amount_cents < 0 then
      raise exception 'credit_already_used';
    end if;
  end if;

  insert into refund (payment_id, restaurant_id, amount_cents, reason, created_by)
    values (p.id, p.restaurant_id, p_amount_cents, clean_reason, p_operator_id)
    returning id into new_id;

  if p.kind = 'topup' then
    insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, payment_id, note, created_by)
      values (p.restaurant_id, 'adjustment', -p_amount_cents, 'refund:' || new_id::text, p.id,
              'Refund recorded: ' || clean_reason, p_operator_id);
  end if;

  insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
    values ('operator', p_operator_id, p.restaurant_id, 'refund_recorded', 'payment',
            p.id::text, jsonb_build_object('amount_cents', p_amount_cents, 'kind', p.kind::text,
                                           'reason', clean_reason));

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return new_id;
end;
$$;
revoke all on function operator_record_refund(text, uuid, integer, text) from public;
grant execute on function operator_record_refund(text, uuid, integer, text) to app_user;
