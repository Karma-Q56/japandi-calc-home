-- Phase D13b: restaurant logo (live mode).
-- Not applied by the build. Test on the preview database first.
--
-- SECURITY:
-- - Only the owning restaurant (or an operator) writes its logo. Other restaurants cannot
--   overwrite it, and the write policy checks the restaurant the caller is in.
-- - The logo is readable only for active restaurants, so a draft restaurant's logo is hidden
--   from guests and other owners. The owner always sees its own row.
-- - Size limits are enforced here as well as in the server: the PNG is at most 512 KB and the
--   print JPEG at most 100 KB. The server also checks the PNG and JPEG file signatures.
-- - The table holds only the two converted images. It never holds SVG or script.

create table if not exists restaurant_logo (
  restaurant_id uuid primary key references restaurant(id) on delete cascade,
  png           bytea not null check (octet_length(png) between 1 and 524288),
  print_jpeg    bytea not null check (octet_length(print_jpeg) between 1 and 102400),
  version       integer not null default 1 check (version >= 1),
  updated_at    timestamptz not null default now()
);

alter table restaurant_logo enable row level security;
alter table restaurant_logo force row level security;

drop policy if exists restaurant_logo_read on restaurant_logo;
create policy restaurant_logo_read on restaurant_logo for select using (
  restaurant_id = app_restaurant()
  or app_is_operator()
  or exists (
    select 1 from restaurant r
    where r.id = restaurant_logo.restaurant_id and r.status = 'active'
  )
);

drop policy if exists restaurant_logo_write on restaurant_logo;
create policy restaurant_logo_write on restaurant_logo for all
  using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());

grant select, insert, update on restaurant_logo to app_user;
