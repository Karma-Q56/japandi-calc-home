-- Phase D11: branch-ready data (no screens). Not applied by the build.
-- Test on the preview database first.
--
-- A restaurant (brand) can later have several locations (branches), with one loyalty
-- card across all of them. Every restaurant gets one main location automatically, and
-- stamps, staff, rewards and redemptions record which location they belong to.
-- Nothing changes for owners or guests yet.
--
-- The fill triggers are SECURITY DEFINER and save and restore app.is_operator, the same
-- way as migration 0013. Existing functions such as record_stamp() are not changed.

-- 1. The location table.
create table location (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurant(id) on delete cascade,
  name          text not null check (length(name) between 1 and 80),
  address       text check (address is null or length(address) <= 200),
  suburb        text,
  city          text not null default 'Johannesburg',
  is_main       boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- One main location per restaurant.
create unique index location_one_main on location (restaurant_id) where is_main;
create index location_restaurant on location (restaurant_id);

alter table location enable row level security;
alter table location force row level security;

-- Tenant write: the restaurant's own login (or an operator) can read and change its locations.
create policy tenant_all on location
  using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());

-- Anyone can read the locations of an active restaurant (public pages and Find need this later).
create policy public_read on location for select
  using (exists (
    select 1 from restaurant r where r.id = location.restaurant_id and r.status = 'active'
  ));

-- app_user can read, add and change locations, but never delete them.
grant select, insert, update on location to app_user;

-- 2. Backfill: one main location for every existing restaurant.
-- The backfill runs as the migration owner, so it is not blocked by row level security.
insert into location (restaurant_id, name, suburb, city, is_main)
select r.id, r.name, r.suburb, r.city, true
from restaurant r
where not exists (select 1 from location l where l.restaurant_id = r.id and l.is_main);

-- 3. Every new restaurant gets its main location automatically.
create or replace function restaurant_add_main_location()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
begin
  perform set_config('app.is_operator', 'true', true);
  insert into location (restaurant_id, name, suburb, city, is_main)
  values (new.id, new.name, new.suburb, new.city, true);
  perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
  return new;
end;
$$;

revoke all on function restaurant_add_main_location() from public;

create trigger restaurant_main_location
  after insert on restaurant
  for each row execute function restaurant_add_main_location();

-- 4. A nullable location column on the four tables that record branch activity.
alter table staff_member  add column location_id uuid references location(id) on delete set null;
alter table stamp_event   add column location_id uuid references location(id) on delete set null;
alter table redemption    add column location_id uuid references location(id) on delete set null;
alter table reward        add column location_id uuid references location(id) on delete set null;

create index staff_member_location on staff_member (location_id);
create index stamp_event_location  on stamp_event (location_id);
create index redemption_location   on redemption (location_id);
create index reward_location       on reward (location_id);

-- 5. Fill the location when a row is written without one. One function serves all four tables.
create or replace function fill_main_location()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  main_id uuid;
begin
  if new.location_id is null then
    perform set_config('app.is_operator', 'true', true);
    select l.id into main_id from location l
      where l.restaurant_id = new.restaurant_id and l.is_main limit 1;
    perform set_config('app.is_operator', coalesce(prior_operator, 'false'), true);
    new.location_id := main_id;
  end if;
  return new;
end;
$$;

revoke all on function fill_main_location() from public;

create trigger staff_member_fill_location before insert on staff_member
  for each row execute function fill_main_location();
create trigger stamp_event_fill_location before insert on stamp_event
  for each row execute function fill_main_location();
create trigger redemption_fill_location before insert on redemption
  for each row execute function fill_main_location();
create trigger reward_fill_location before insert on reward
  for each row execute function fill_main_location();
