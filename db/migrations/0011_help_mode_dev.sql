-- 0011_help_mode_dev.sql - DEV BRANCH ONLY.
-- Help from Patron: the owner opens a short window, an operator works inside it,
-- and everything the operator writes lands as a draft. Safe to re-run.
--
-- Do not run this against production. The privacy wording for this feature still
-- needs a lawyer's review before it goes near a live restaurant.

alter table restaurant
  add column if not exists patron_help_enabled boolean not null default false;
alter table restaurant
  add column if not exists patron_help_expires_at timestamptz;

-- Help is open only inside the owner's window. Row level security calls this,
-- so an operator loses access the moment the window passes.
create or replace function app_help_open(target uuid) returns boolean language sql stable as $$
  select exists (
    select 1
    from restaurant r
    where r.id = target
      and r.patron_help_enabled
      and r.patron_help_expires_at is not null
      and r.patron_help_expires_at > now()
  )
$$;

-- Operators may write the restaurant row, but never the help window itself.
-- The window is the owner's decision alone.
create or replace function guard_patron_help() returns trigger language plpgsql as $$
begin
  if app_is_operator()
     and (new.patron_help_enabled is distinct from old.patron_help_enabled
          or new.patron_help_expires_at is distinct from old.patron_help_expires_at) then
    raise exception 'Only the owner can change help from Patron';
  end if;
  return new;
end $$;

drop trigger if exists restaurant_guard_patron_help on restaurant;
create trigger restaurant_guard_patron_help
  before update on restaurant
  for each row execute function guard_patron_help();

create table if not exists help_request (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurant(id) on delete cascade,
  ask            text not null,
  photos         jsonb not null default '[]'::jsonb,
  status         text not null default 'open'
                   check (status in ('open', 'answered', 'closed')),
  reply          text,
  draft_id       uuid,
  created_at     timestamptz not null default now()
);

create table if not exists help_draft (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurant(id) on delete cascade,
  tagline        text not null,
  story          text not null default '',
  summary        text not null,
  -- Fixed wording. The owner must always know who wrote the words.
  label          text not null default 'Patron prepared this'
                   check (label = 'Patron prepared this'),
  prepared_by    text not null,
  status         text not null default 'draft'
                   check (status in ('draft', 'used', 'discarded')),
  request_id     uuid references help_request(id) on delete set null,
  created_at     timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'help_request_draft_fk'
  ) then
    alter table help_request
      add constraint help_request_draft_fk
      foreign key (draft_id) references help_draft(id) on delete set null;
  end if;
end $$;

create index if not exists help_request_restaurant_created
  on help_request (restaurant_id, created_at desc);
create index if not exists help_draft_restaurant_created
  on help_draft (restaurant_id, created_at desc);

alter table help_request enable row level security;
alter table help_request force row level security;
alter table help_draft enable row level security;
alter table help_draft force row level security;

-- The owner reads and writes requests for their own restaurant only. Operators
-- can never create a request in the owner's name.
create policy help_request_owner on help_request for all
  using (restaurant_id = app_restaurant() and not app_is_operator())
  with check (restaurant_id = app_restaurant() and not app_is_operator());

-- While the window is open, an operator reads requests in that restaurant and
-- updates them with an answer. No insert, no delete.
create policy help_request_operator_read on help_request for select
  using (
    app_is_operator()
    and restaurant_id = app_restaurant()
    and app_help_open(restaurant_id)
  );
create policy help_request_operator_answer on help_request for update
  using (
    app_is_operator()
    and restaurant_id = app_restaurant()
    and app_help_open(restaurant_id)
  )
  with check (
    app_is_operator()
    and restaurant_id = app_restaurant()
    and app_help_open(restaurant_id)
  );

-- The owner owns the drafts: read, mark used or thrown away, delete.
create policy help_draft_owner on help_draft for all
  using (restaurant_id = app_restaurant() and not app_is_operator())
  with check (restaurant_id = app_restaurant() and not app_is_operator());

-- An operator may only add new drafts, and only while help is open. There is
-- deliberately no update or delete policy for operators.
create policy help_draft_operator_insert on help_draft for insert
  with check (
    app_is_operator()
    and restaurant_id = app_restaurant()
    and app_help_open(restaurant_id)
    and status = 'draft'
  );
create policy help_draft_operator_read on help_draft for select
  using (
    app_is_operator()
    and restaurant_id = app_restaurant()
    and app_help_open(restaurant_id)
  );

grant select, insert, update, delete on help_request, help_draft to app_user;
