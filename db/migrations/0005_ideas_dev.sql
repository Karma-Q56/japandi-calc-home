-- 0005_ideas_dev.sql - DEV BRANCH ONLY.
-- Guests can ask for a place to join Patron at /suggest. One row per place
-- and suburb carries how many guests have asked. The page collects no
-- contact details by design, so no phone or email columns are added.
-- Do not run this against production until the live operator sign-in exists
-- and /suggest has been tested on a dev database. No data is deleted.
-- Status so far: written and reviewed, not run against any live database.

create table if not exists idea (
  id text primary key,
  place text not null,
  suburb text not null,
  asks integer not null default 1,
  note text,
  name text,
  status text not null default 'new'
    check (status in ('new', 'exploring', 'added')),
  admin_notes text,
  created_at timestamptz not null default now()
);

-- The guest form dedupes in code, but a unique index keeps the one-row-per-place
-- rule even if two asks arrive at the same moment.
create unique index if not exists idea_place_suburb_unique on idea (
  lower(place),
  lower(suburb)
);

create index if not exists idea_suburb_created on idea (suburb, created_at desc);
create index if not exists idea_status_created on idea (status, created_at desc);

alter table idea enable row level security;
alter table idea force row level security;

-- Guests insert through the server function with no operator context, the same
-- pattern the lead table uses. Nobody reads or edits a row without an
-- operator context set by the server transaction. A repeat ask for the same
-- place is bumped inside that server transaction (a requested update of the
-- asks column), never through a public policy.
create policy idea_submit on idea for insert with check (
  asks = 1 and status = 'new' and admin_notes is null
);
create policy idea_operator_read on idea for select using (app_is_operator());
create policy idea_operator_update on idea for update using (app_is_operator())
  with check (app_is_operator());
