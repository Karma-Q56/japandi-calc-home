-- 0012_offer_rls_dev.sql - DEV BRANCH ONLY. Never run on production.
-- Fixes two problems left by 0010:
--   1. The new offer table had no row level security, so one restaurant could
--      read or change another restaurant's offers.
--   2. 0010 took insert and update on campaign and special away from the app
--      role, but live approve and cancel still update the campaign table.
-- Safe to re-run.

alter table offer enable row level security;
alter table offer force row level security;

drop policy if exists offer_tenant_all on offer;
create policy offer_tenant_all on offer for all
  using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());

-- Anyone can read a live public offer that is shown on the restaurant page.
-- Members only offers, campaigns and drafts are never readable this way.
drop policy if exists offer_public_read on offer;
create policy offer_public_read on offer for select using (
  active
  and placement_page
  and kind = 'public'
  and status = 'live'
);

-- Live approve and cancel still update the campaign table. The old rows stay
-- visible as history in the screens, so keep select, insert and update only.
grant select, insert, update on campaign, special to app_user;
