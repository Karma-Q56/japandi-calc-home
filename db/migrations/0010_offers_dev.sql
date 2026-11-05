-- 0010_offers_dev.sql - DEV BRANCH ONLY.
-- Merges Specials and Campaigns into one Offers table. Old special and
-- campaign rows are copied across, then the old tables become read-only
-- history for the app role. Safe to re-run: every step checks first.
--
-- Do not run this against production.

create table if not exists offer (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurant(id) on delete cascade,
  title             text not null,
  body              text not null default '',
  kind              text not null default 'public',
  code              text,
  min_tier          text,
  valid_from        timestamp,
  valid_to          timestamp,
  active            boolean not null default true,
  placement_page    boolean not null default true,
  placement_till    boolean not null default false,
  placement_push    boolean not null default false,
  placement_sms     boolean not null default false,
  audience          jsonb,
  status            text not null default 'live',
  legacy_special_id uuid unique references special(id) on delete set null,
  legacy_campaign_id uuid unique references campaign(id) on delete set null,
  created_at        timestamp not null default now()
);

create unique index if not exists offer_restaurant_code_unique
  on offer (restaurant_id, upper(code)) where code is not null;

-- Copy specials that have not been copied yet.
insert into offer (restaurant_id, title, body, kind, code, min_tier,
                   valid_from, valid_to, active, placement_page, legacy_special_id, created_at)
select s.restaurant_id, s.title, coalesce(s.body, ''), s.kind, s.code, s.min_tier,
       s.starts_at, s.ends_at, s.active, true, s.id, s.created_at
from special s
where not exists (select 1 from offer o where o.legacy_special_id = s.id);

-- Copy campaigns that have not been copied yet. Campaigns become offers
-- with a push or SMS placement and keep their audience.
insert into offer (restaurant_id, title, body, kind, code,
                   valid_from, valid_to, active, placement_page,
                   placement_push, placement_sms, audience, status, legacy_campaign_id, created_at)
select c.restaurant_id, c.name, c.message_body, 'campaign', c.code,
       c.valid_from, c.valid_to, c.status not in ('cancelled', 'failed'), false,
       c.channel in ('push', 'both'), c.channel in ('sms', 'both'), c.audience,
       c.status::text, c.id, c.created_at
from campaign c
where not exists (select 1 from offer o where o.legacy_campaign_id = c.id);

-- Old tables are history now: the app role can read them but not change them.
revoke insert, update, delete on special, campaign from app_user;
grant select on special, campaign to app_user;

grant select, insert, update, delete on offer to app_user;
