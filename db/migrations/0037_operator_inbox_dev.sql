-- 0037_operator_inbox_dev.sql - DEV BRANCH ONLY. NOT APPLIED to any database.
-- Live operator console, part 2 (phase D24): campaign approvals, enquiries,
-- feedback, ideas and the SMS outbox. Functions only, plus a small reference
-- column for feedback. Every function checks the operator role again through
-- assert_operator (from 0029). Reads never return guest names or phone numbers.
-- Outbox phones are masked: country code and last three digits only.
--
-- Refusals raised: not_operator, campaign_not_found, not_pending, bad_decision,
-- bad_reason, lead_not_found, feedback_not_found, idea_not_found, invalid_value.
--
-- Safe to re-run: uses if-not-exists and create or replace.

-- Feedback gets a short reference so operators can quote it. Existing rows are
-- numbered in order, and new rows get the next number.
create sequence if not exists feedback_reference_seq;
alter table feedback add column if not exists reference text;
update feedback
set reference = 'FB-' || to_char(created_at, 'YYYY') || '-' ||
  lpad(nextval('feedback_reference_seq')::text, 3, '0')
where reference is null;
alter table feedback alter column reference set default (
  'FB-' || to_char(now(), 'YYYY') || '-' ||
  lpad(nextval('feedback_reference_seq')::text, 3, '0')
);
create unique index if not exists feedback_reference_unique on feedback (reference);

-- Lead statuses the inbox shows. 0004 already added replied and closed.
-- Here we add the sales states the operator uses after a reply.
-- (Enum values already present are skipped.)
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'lead_status' and e.enumlabel = 'demo_booked') then
    alter type lead_status add value 'demo_booked';
  end if;
end $$;

-- Campaigns waiting for approval, across restaurants. Operators only.
create or replace function operator_list_pending_campaigns(p_operator_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  result jsonb;
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) into result
  from (
    select c.id, c.restaurant_id, r.name as restaurant_name, c.name, c.message_body,
      c.code, c.est_recipients, c.est_cost_cents, c.created_at
    from campaign c join restaurant r on r.id = c.restaurant_id
    where c.status = 'pending_approval'
  ) x;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return result;
end;
$$;

-- Move an enquiry to a new status. Refusals: not_operator, lead_not_found, invalid_value.
create or replace function operator_set_lead_status(
  p_operator_id text, p_lead_id uuid, p_status text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  found_id uuid;
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  if p_status not in ('new', 'replied', 'closed', 'contacted', 'demo_booked', 'won', 'lost') then
    raise exception 'invalid_value';
  end if;
  update lead
    set status = p_status::lead_status,
        replied_at = case when p_status = 'replied' then now() else replied_at end,
        closed_at = case when p_status in ('closed', 'won', 'lost') then now() else null end
    where id = p_lead_id
    returning id into found_id;
  if found_id is null then
    raise exception 'lead_not_found';
  end if;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

-- Feedback list for the operator. The screenshot picture is never in the list;
-- it comes from operator_feedback_screenshot. Contact is returned only when the
-- sender allowed it (contact_ok). Refusals: not_operator, invalid_value.
create or replace function operator_list_feedback(
  p_operator_id text, p_status text, p_limit integer, p_offset integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  result jsonb;
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  if p_status not in ('', 'new', 'seen', 'planned', 'done', 'not_now') then
    raise exception 'invalid_value';
  end if;
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into result
  from (
    select f.id, f.reference, f.restaurant_id, r.name as restaurant_name, f.source,
      f.category, f.message,
      case when f.contact_ok then f.contact else null end as contact,
      f.contact_ok, f.status, f.note, f.screenshot_name is not null as has_screenshot,
      f.created_at
    from feedback f left join restaurant r on r.id = f.restaurant_id
    where (p_status = '' or f.status::text = p_status)
    order by f.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  ) x;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return result;
end;
$$;

-- One feedback screenshot, for the operator only. Refusals: not_operator, feedback_not_found.
create or replace function operator_feedback_screenshot(p_operator_id text, p_feedback_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  picture text;
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  select f.screenshot_data into picture from feedback f where f.id = p_feedback_id;
  if not found then
    raise exception 'feedback_not_found';
  end if;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return picture;
end;
$$;

-- Move feedback to a status and save the private note. Refusals: not_operator, feedback_not_found, invalid_value, bad_reason.
create or replace function operator_set_feedback(
  p_operator_id text, p_feedback_id text, p_status text, p_note text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  found_id text;
  clean_note text := coalesce(p_note, '');
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  if p_status not in ('new', 'seen', 'planned', 'done', 'not_now') then
    raise exception 'invalid_value';
  end if;
  if char_length(clean_note) > 500 then
    raise exception 'bad_reason';
  end if;
  update feedback set status = p_status::text, note = clean_note
    where id = p_feedback_id returning id into found_id;
  if found_id is null then
    raise exception 'feedback_not_found';
  end if;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

-- Ideas (places guests asked for), most asked first. Operators only.
create or replace function operator_list_ideas(
  p_operator_id text, p_status text, p_limit integer, p_offset integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  result jsonb;
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  if p_status not in ('', 'new', 'exploring', 'added') then
    raise exception 'invalid_value';
  end if;
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into result
  from (
    select i.id, i.place, i.suburb, i.asks, i.note, i.status, i.admin_notes, i.created_at
    from idea i
    where (p_status = '' or i.status::text = p_status)
    order by i.asks desc, i.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  ) x;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return result;
end;
$$;

-- Move an idea to a new status and save the private note. Refusals: not_operator, idea_not_found, invalid_value, bad_reason.
create or replace function operator_set_idea(
  p_operator_id text, p_idea_id text, p_status text, p_admin_notes text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  found_id text;
  clean_notes text := coalesce(p_admin_notes, '');
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  if p_status not in ('new', 'exploring', 'added') then
    raise exception 'invalid_value';
  end if;
  if char_length(clean_notes) > 500 then
    raise exception 'bad_reason';
  end if;
  update idea set status = p_status::text, admin_notes = clean_notes
    where id = p_idea_id returning id into found_id;
  if found_id is null then
    raise exception 'idea_not_found';
  end if;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
end;
$$;

-- SMS outbox messages, newest first. The phone is masked: country code and last
-- three digits only (for example +27***123). Guest names are never returned.
create or replace function operator_list_outbox(
  p_operator_id text, p_status text, p_limit integer, p_offset integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  result jsonb;
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  if p_status not in ('', 'queued', 'sending', 'sent', 'delivered', 'failed', 'skipped') then
    raise exception 'invalid_value';
  end if;
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into result
  from (
    select m.id, r.name as restaurant_name, c.name as campaign_name, m.channel, m.status,
      m.segments, m.cost_cents, m.error_code, m.queued_at, m.sent_at, m.delivered_at,
      left(cu.phone_e164, 3) || '***' || right(cu.phone_e164, 3) as phone_masked
    from message m
    join campaign c on c.id = m.campaign_id
    join restaurant r on r.id = m.restaurant_id
    join membership ms on ms.id = m.membership_id
    join customer cu on cu.id = ms.customer_id
    where (p_status = '' or m.status::text = p_status)
    order by m.queued_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  ) x;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return result;
end;
$$;

-- Outbox totals for the summary line. Counts only, no guest data.
create or replace function operator_outbox_summary(p_operator_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  result jsonb;
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  select jsonb_build_object(
    'queued', count(*) filter (where status = 'queued'),
    'sent', count(*) filter (where status in ('sent', 'delivered')),
    'failed', count(*) filter (where status = 'failed'),
    'skipped', count(*) filter (where status = 'skipped')
  ) into result from message;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return result;
end;
$$;

-- Enquiry (lead) list for the operator. Contact name and phone are NOT returned.
create or replace function operator_list_leads(
  p_operator_id text, p_status text, p_search text, p_limit integer, p_offset integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  result jsonb;
begin
  perform set_config('app.is_operator', 'true', true);
  perform assert_operator(p_operator_id);
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into result
  from (
    select l.id, l.reference, l.kind, l.restaurant_name, l.suburb, l.plan_interest,
      l.status, l.created_at, l.replied_at, l.closed_at
    from lead l
    where (p_status = '' or l.status::text = p_status)
      and (p_search = '' or l.restaurant_name ilike '%' || p_search || '%'
           or l.reference ilike '%' || p_search || '%')
    order by l.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  ) x;
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return result;
end;
$$;

-- Lock the operator functions down: no public execute, app role only.
revoke all on function operator_list_pending_campaigns(text) from public;
revoke all on function operator_list_leads(text, text, text, integer, integer) from public;
revoke all on function operator_set_lead_status(text, uuid, text) from public;
revoke all on function operator_list_feedback(text, text, integer, integer) from public;
revoke all on function operator_feedback_screenshot(text, text) from public;
revoke all on function operator_set_feedback(text, text, text, text) from public;
revoke all on function operator_list_ideas(text, text, integer, integer) from public;
revoke all on function operator_set_idea(text, text, text, text) from public;
revoke all on function operator_list_outbox(text, text, integer, integer) from public;
revoke all on function operator_outbox_summary(text) from public;

grant execute on function operator_list_pending_campaigns(text) to app_user;
grant execute on function operator_list_leads(text, text, text, integer, integer) to app_user;
grant execute on function operator_set_lead_status(text, uuid, text) to app_user;
grant execute on function operator_list_feedback(text, text, integer, integer) to app_user;
grant execute on function operator_feedback_screenshot(text, text) to app_user;
grant execute on function operator_set_feedback(text, text, text, text) to app_user;
grant execute on function operator_list_ideas(text, text, integer, integer) to app_user;
grant execute on function operator_set_idea(text, text, text, text) to app_user;
grant execute on function operator_list_outbox(text, text, integer, integer) to app_user;
grant execute on function operator_outbox_summary(text) to app_user;
