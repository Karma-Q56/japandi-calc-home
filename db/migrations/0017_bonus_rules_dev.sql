-- 0017 bonus rules and tiers (D12b). NOT APPLIED: written to be applied after 0001, 0003 and 0016.
-- Reads the demo rules in src/domain/tools.ts and src/domain/loyalty.ts.

-- ---------------------------------------------------------------- settings on restaurant
alter table restaurant
  add column if not exists double_stamp_enabled boolean not null default false,
  add column if not exists double_stamp_weekday smallint not null default 2,
  add column if not exists streak_enabled boolean not null default false,
  add column if not exists streak_weeks smallint not null default 4,
  add column if not exists streak_weekly_visits smallint not null default 1,
  add column if not exists streak_bonus_stamps smallint not null default 1,
  add column if not exists tool_stamp_budget integer not null default 0,
  add column if not exists birthday_reward_kind text not null default 'stamp',
  add column if not exists birthday_reward_item text,
  add column if not exists mystery_reward_enabled boolean not null default false;

alter table restaurant drop constraint if exists restaurant_double_stamp_check;
alter table restaurant add constraint restaurant_double_stamp_check
  check (double_stamp_weekday between 0 and 6);

alter table restaurant drop constraint if exists restaurant_streak_check;
alter table restaurant add constraint restaurant_streak_check check (
  streak_weeks between 2 and 12
  and streak_weekly_visits between 1 and 7
  and streak_bonus_stamps between 1 and 5
);

alter table restaurant drop constraint if exists restaurant_tool_budget_check;
alter table restaurant add constraint restaurant_tool_budget_check
  check (tool_stamp_budget between 0 and 2000);

alter table restaurant drop constraint if exists restaurant_birthday_kind_check;
alter table restaurant add constraint restaurant_birthday_kind_check check (
  birthday_reward_kind in ('stamp', 'freeItem')
  and (birthday_reward_item is null or length(birthday_reward_item) <= 80)
);

alter table restaurant drop constraint if exists restaurant_tiers_check;
alter table restaurant add constraint restaurant_tiers_check check (
  (tiers->>'regular')::int between 1 and 100
  and (tiers->>'vip')::int between 2 and 200
  and (tiers->>'vip')::int > (tiers->>'regular')::int
);

-- ---------------------------------------------------------------- member_tier
-- Visits in the last 90 days (normal visit stamps only), using the restaurant thresholds.
create or replace function member_tier(p_membership uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r restaurant%rowtype;
  visits integer;
begin
  select re.* into r from restaurant re join membership m on m.restaurant_id = re.id where m.id = p_membership;
  if not found then return 'new'; end if;
  select count(*) into visits from stamp_event
   where membership_id = p_membership and status = 'valid' and reason = 'visit'
     and created_at >= now() - interval '90 days';
  if visits >= (r.tiers->>'vip')::int then return 'vip'; end if;
  if visits >= (r.tiers->>'regular')::int then return 'regular'; end if;
  return 'new';
end;
$$;

revoke all on function member_tier(uuid) from public;
grant execute on function member_tier(uuid) to app_user;

-- ---------------------------------------------------------------- apply_visit_bonuses
-- Called after each visit stamp. Mirrors evaluateToolsAfterVisit in src/domain/tools.ts.
-- Bonus stamps use demo keys (double:<visit>, streak:<run>) so the unique key on
-- stamp_event makes retries harmless. Bonus stamps never create a second visit.
-- Budget: a grant is refused when used + count > cap (same month, Johannesburg time).
create or replace function apply_visit_bonuses(p_membership uuid, p_stamp_event uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  m membership%rowtype;
  r restaurant%rowtype;
  visit stamp_event%rowtype;
  granted integer := 0;
  used integer;
  month_start timestamptz;
  week_now date;
  week_probe date;
  run integer := 0;
  weeks_with_visits integer;
  n integer;
begin
  select * into m from membership where id = p_membership;
  if not found then return 0; end if;
  select * into r from restaurant where id = m.restaurant_id;
  select * into visit from stamp_event where id = p_stamp_event and membership_id = p_membership;
  if not found then return 0; end if;
  -- Keep the same restaurant-local calendar as the demo (Johannesburg).
  month_start := date_trunc('month', now() at time zone 'Africa/Johannesburg') at time zone 'Africa/Johannesburg';

  -- Budget used this Johannesburg month (demo keys only).
  select count(*) into used from stamp_event
   where restaurant_id = r.id and status = 'valid' and reason in ('bonus', 'missyou')
     and (idempotency_key like 'double:%' or idempotency_key like 'streak:%' or idempotency_key like 'missyou:%')
     and created_at >= month_start;

  -- Double stamp day: visit weekday in Johannesburg equals the configured weekday.
  if r.double_stamp_enabled
     and extract(dow from (visit.created_at at time zone 'Africa/Johannesburg'))::int = r.double_stamp_weekday
     and (r.tool_stamp_budget = 0 or used + 1 <= r.tool_stamp_budget)
     and not exists (select 1 from stamp_event where restaurant_id = r.id and idempotency_key = 'double:' || visit.id::text)
  then
    perform set_config('app.is_operator', 'true', true);
    insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key, reason, created_at)
      values (r.id, m.id, null, 'double:' || visit.id::text, 'bonus', visit.created_at)
      on conflict (restaurant_id, idempotency_key) do nothing;
    get diagnostics n = row_count;
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    granted := granted + n;
    used := used + n;
  end if;

  -- Streak: consecutive Johannesburg Monday weeks with enough visits, ending this week.
  -- A week that has not yet met the bar counts as in progress (the run ends last week).
  if r.streak_enabled then
    week_now := date_trunc('week', now() at time zone 'Africa/Johannesburg')::date;
    week_probe := week_now;
    select count(*) into n from stamp_event
     where membership_id = m.id and status = 'valid' and reason = 'visit'
       and date_trunc('week', created_at at time zone 'Africa/Johannesburg')::date = week_now;
    if n < r.streak_weekly_visits then week_probe := week_now - 7; end if;
    loop
      select count(*) into weeks_with_visits from stamp_event
       where membership_id = m.id and status = 'valid' and reason = 'visit'
         and date_trunc('week', created_at at time zone 'Africa/Johannesburg')::date = week_probe;
      exit when weeks_with_visits < r.streak_weekly_visits;
      run := run + 1;
      week_probe := week_probe - 7;
    end loop;
    if run >= r.streak_weeks and run % r.streak_weeks = 0
       and (r.tool_stamp_budget = 0 or used + r.streak_bonus_stamps <= r.tool_stamp_budget)
    then
      perform set_config('app.is_operator', 'true', true);
      insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key, reason)
        select r.id, m.id, null,
               'streak:' || run::text || case when r.streak_bonus_stamps > 1 then ':' || g::text else '' end,
               'bonus'
          from generate_series(0, r.streak_bonus_stamps - 1) as g
        on conflict (restaurant_id, idempotency_key) do nothing;
      get diagnostics n = row_count;
      perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
      granted := granted + n;
    end if;
  end if;

  return granted;
end;
$$;

revoke all on function apply_visit_bonuses(uuid, uuid) from public;
grant execute on function apply_visit_bonuses(uuid, uuid) to app_user;

-- ---------------------------------------------------------------- birthday and mystery
-- Both are triggered from apply_visit_bonuses' caller path via the visit hook.
-- Birthday: once per year, within 3 days either side of the birthday (Johannesburg).
-- Stamp choice adds a bonus stamp; free item creates a reward through grant_reward.
create or replace function apply_birthday_and_mystery(p_membership uuid, p_stamp_event uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  m membership%rowtype;
  r restaurant%rowtype;
  c customer%rowtype;
  visits integer;
  today date := (now() at time zone 'Africa/Johannesburg')::date;
  year_text text := to_char(today, 'YYYY');
  bday date;
  granted integer := 0;
  n integer;
begin
  select * into m from membership where id = p_membership;
  if not found then return 0; end if;
  select * into r from restaurant where id = m.restaurant_id;
  select * into c from customer where id = m.customer_id;

  -- Birthday week (3 days either side, compared by month and day, Johannesburg).
  if r.birthday_reward and c.birthday is not null then
    bday := make_date(extract(year from today)::int, extract(month from c.birthday)::int, extract(day from c.birthday)::int);
    if abs(today - bday) <= 3 then
      if r.birthday_reward_kind = 'freeItem' then
        if not exists (select 1 from reward where membership_id = m.id and source = 'birthday' and source_id is null
                         and description = 'Free ' || coalesce(nullif(trim(r.birthday_reward_item), ''), 'the birthday treat')
                         and earned_at >= date_trunc('year', now())) then
          perform grant_reward(r.id, m.id, 'free_item',
            'Free ' || coalesce(nullif(trim(r.birthday_reward_item), ''), 'the birthday treat'),
            null, null, 'birthday', null, r.reward_valid_days);
          granted := granted + 1;
        end if;
      else
        perform set_config('app.is_operator', 'true', true);
        insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key, reason)
          values (r.id, m.id, null, 'birthday:' || year_text, 'bonus')
          on conflict (restaurant_id, idempotency_key) do nothing;
        get diagnostics n = row_count;
        perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
        granted := granted + n;
      end if;
    end if;
  end if;

  -- Mystery: every Nth visit (deterministic per membership), when N is above 0.
  if r.mystery_reward_enabled and r.mystery_every_visits > 0 then
    select count(*) into visits from stamp_event
     where membership_id = m.id and status = 'valid' and reason = 'visit';
    if visits > 0 and visits % r.mystery_every_visits = 0 then
      perform set_config('app.is_operator', 'true', true);
      insert into stamp_event (restaurant_id, membership_id, staff_id, idempotency_key, reason)
        values (r.id, m.id, null, 'mystery:' || visits::text, 'mystery')
        on conflict (restaurant_id, idempotency_key) do nothing;
      get diagnostics n = row_count;
      perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
      granted := granted + n;
    end if;
  end if;

  return granted;
end;
$$;

revoke all on function apply_birthday_and_mystery(uuid, uuid) from public;
grant execute on function apply_birthday_and_mystery(uuid, uuid) to app_user;

