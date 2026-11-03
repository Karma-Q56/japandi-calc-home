-- 0004_enquiry_inbox_dev.sql - DEV BRANCH ONLY.
-- The enquiry inbox needs a human reference, reply/close states and room for
-- the richer contact form answers. Do not run this against production until
-- the live operator sign-in exists and the inbox has been tested on a dev
-- database. No data is deleted and the existing lead rows stay in place.

create sequence if not exists lead_reference_seq;

alter table lead add column if not exists reference text;
alter table lead add column if not exists visit_wanted boolean;
alter table lead add column if not exists preferred_day text;
alter table lead add column if not exists consent_at timestamptz;
alter table lead add column if not exists admin_notes text;
alter table lead add column if not exists replied_at timestamptz;
alter table lead add column if not exists closed_at timestamptz;

-- Give every existing row a stable ENQ-YEAR-NUMBER before the column is
-- required. The order is oldest first so numbers follow the inbox.
update lead
set reference = 'ENQ-' || to_char(created_at, 'YYYY') || '-' ||
  lpad(nextval('lead_reference_seq')::text, 3, '0')
where reference is null;

alter table lead alter column reference set default (
  'ENQ-' || to_char(now(), 'YYYY') || '-' ||
  lpad(nextval('lead_reference_seq')::text, 3, '0')
);
alter table lead alter column reference set not null;

create unique index if not exists lead_reference_unique on lead (reference);
create index if not exists lead_status_created on lead (status, created_at desc);

-- Existing enum values stay. These two are the inbox states the page uses.
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'lead_status' and e.enumlabel = 'replied') then
    alter type lead_status add value 'replied';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'lead_status' and e.enumlabel = 'closed') then
    alter type lead_status add value 'closed';
  end if;
end $$;

-- Lead rows stay operator-only. No new policy opens them to the public.
