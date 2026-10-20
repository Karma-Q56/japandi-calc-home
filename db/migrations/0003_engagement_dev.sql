-- 0003_engagement_dev.sql — DEV BRANCH ONLY.
-- Adds welcome stamps, public-page templates, the three special kinds with
-- personal codes, spins, challenges and saved lists. Do not run against
-- production until the live adapters are exercised on a dev branch.

alter table restaurant add column if not exists welcome_stamps integer not null default 0;
alter table restaurant add column if not exists page_template text not null default 'classic';
alter table restaurant add column if not exists tiers jsonb not null default '{"regular":3,"vip":8}'::jsonb;
alter table restaurant add column if not exists mystery_every_visits integer not null default 0;
alter table restaurant add column if not exists birthday_reward boolean not null default false;
alter table restaurant add column if not exists spin jsonb not null default '{}'::jsonb;

alter table stamp_event add column if not exists reason text not null default 'visit';

alter table special add column if not exists kind text not null default 'public';
alter table special add column if not exists code text;
alter table special add column if not exists min_tier text;

create unique index if not exists special_restaurant_code_unique
  on special (restaurant_id, upper(code)) where code is not null;

create table if not exists special_code (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  special_id uuid not null references special(id) on delete cascade,
  membership_id uuid not null references membership(id) on delete cascade,
  code text not null,
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by text,
  unique (special_id, membership_id),
  unique (restaurant_id, code)
);

create table if not exists saved_list (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  name text not null,
  membership_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists spin_result (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  membership_id uuid not null references membership(id) on delete cascade,
  segment_id text not null,
  label text not null,
  value_cents integer not null default 0,
  won_at timestamptz not null default now(),
  prize_special_id uuid references special(id) on delete set null
);

create table if not exists challenge (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  title text not null,
  visits integer not null,
  window_days integer not null,
  bonus_stamps integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Redemptions now cover rewards, campaigns and specials.
alter table redemption alter column campaign_id drop not null;
alter table redemption add column if not exists kind text not null default 'campaign';
alter table redemption add column if not exists special_id uuid references special(id) on delete set null;
alter table redemption add column if not exists special_code_id uuid references special_code(id) on delete set null;
alter table redemption add column if not exists code text;

create index if not exists redemption_special_membership
  on redemption (special_id, membership_id) where special_id is not null;

do $$
declare t text;
begin
  foreach t in array array['special_code', 'saved_list', 'spin_result', 'challenge'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_all on %I using (restaurant_id = app_restaurant() or app_is_operator())
         with check (restaurant_id = app_restaurant() or app_is_operator())', t);
  end loop;
end $$;

-- Guests may read their own special codes and spins through their membership.
create policy special_code_read_own on special_code for select using (
  membership_id in (select id from membership where customer_id = app_customer()));
create policy spin_read_own on spin_result for select using (
  membership_id in (select id from membership where customer_id = app_customer()));
