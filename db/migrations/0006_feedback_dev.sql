-- 0006_feedback_dev.sql - DEV BRANCH ONLY.
-- Backs the Feedback feature: an owner, a diner or a visitor on the public page
-- can send one note, with an optional picture. Operators read every note and
-- move it through New, Seen, Planned, Done and Not now. Owners read only the
-- notes for their own restaurant. Senders never read the private operator note.
--
-- Do not run this against production until the live operator sign-in exists and
-- /feedback, /app/feedback and /ops/feedback have been tested on a dev database.
-- No data is deleted. Status so far: written and reviewed, not run against any
-- live database.

create table if not exists feedback (
  id text primary key,
  restaurant_id uuid references restaurant(id) on delete cascade,
  source text not null check (source in ('owner', 'guest', 'public')),
  category text not null check (category in ('broken', 'feature', 'confusing', 'other')),
  message text not null check (char_length(message) between 10 and 1000),
  contact_ok boolean not null default false,
  contact text check (contact is null or char_length(contact) <= 120),
  status text not null default 'new'
    check (status in ('new', 'seen', 'planned', 'done', 'not_now')),
  note text not null default '',
  screenshot_name text,
  screenshot_type text
    check (screenshot_type is null or screenshot_type in ('image/png', 'image/jpeg', 'image/webp')),
  -- About 300 KB of binary as a base64 data URL.
  screenshot_data text
    check (screenshot_data is null or char_length(screenshot_data) <= 420000),
  created_at timestamptz not null default now(),
  check (source <> 'public' or restaurant_id is null),
  check (screenshot_data is null or screenshot_type is not null)
);

create index if not exists feedback_restaurant_created
  on feedback (restaurant_id, created_at desc);
create index if not exists feedback_status_created
  on feedback (status, created_at desc);
create index if not exists feedback_source_created
  on feedback (source, created_at desc);

alter table feedback enable row level security;
alter table feedback force row level security;

-- A visitor on the public page may add one new, unassigned note. They cannot
-- read anything back, set a status, or attach a private operator note.
create policy feedback_public_insert on feedback for insert with check (
  source = 'public'
  and restaurant_id is null
  and status = 'new'
  and note = ''
);

-- An owner or diner may add a note for the restaurant in the current server
-- context. The server sets app.restaurant_id, never the browser.
create policy feedback_owner_insert on feedback for insert with check (
  source in ('owner', 'guest')
  and restaurant_id = current_setting('app.restaurant_id', true)::uuid
  and status = 'new'
  and note = ''
);

-- Owners and managers read only their own restaurant's notes, never the
-- private operator note column via a view that selects it.
create policy feedback_owner_read on feedback for select using (
  restaurant_id = current_setting('app.restaurant_id', true)::uuid
);
create policy feedback_owner_update on feedback for update using (
  restaurant_id = current_setting('app.restaurant_id', true)::uuid
) with check (
  restaurant_id = current_setting('app.restaurant_id', true)::uuid
);

-- The Patron team reads every note and changes status or adds a private note.
create policy feedback_operator_all on feedback for all using (app_is_operator())
  with check (app_is_operator());
