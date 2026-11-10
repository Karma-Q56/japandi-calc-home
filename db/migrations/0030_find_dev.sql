-- 0030: live Find directory (D19).
-- Adds a venue type to restaurants and one read-only function that lists
-- only active, publicly listed restaurants. The function is the only path the
-- Find screen uses, so draft, paused and unlisted restaurants cannot be reached
-- through any parameter, and private columns are never returned.
-- Not applied by the builder: run through the normal migration flow.

alter table restaurant
  add column if not exists venue_type text not null default 'other';

alter table restaurant
  drop constraint if exists restaurant_venue_type_check;
alter table restaurant
  add constraint restaurant_venue_type_check
  check (venue_type in ('cafe', 'bakery', 'restaurant', 'takeaway', 'other'));

-- Plain lowercase index for name search (ilike, no extension needed).
create index if not exists restaurant_name_lower_idx on restaurant (lower(name));

create or replace function find_restaurants(
  p_query  text,
  p_suburb text,
  p_type   text,
  p_limit  integer,
  p_offset integer
)
returns table (
  id                 uuid,
  slug               text,
  name               text,
  suburb             text,
  venue_type         text,
  logo_url           text,
  hours              jsonb,
  stamps_required    integer,
  reward_description text,
  has_member_offer   boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with pat as (
    select '%' || replace(replace(replace(lower(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%' as p
  )
  select
    r.id,
    r.slug,
    r.name,
    r.suburb,
    r.venue_type,
    r.logo_url,
    r.hours,
    r.stamps_required,
    r.reward_description,
    exists (
      select 1 from special s
      where s.restaurant_id = r.id
        and s.active
        and s.kind <> 'public'
    ) as has_member_offer
  from restaurant r
  where r.status = 'active'
    and r.public_listed = true
    and (
      nullif(btrim(p_query), '') is null
      or lower(r.name) like (select p from pat) escape '\'
      or lower(coalesce(r.suburb, '')) like (select p from pat) escape '\'
      or lower(r.venue_type) like (select p from pat) escape '\'
    )
    and (
      nullif(btrim(p_suburb), '') is null
      or lower(coalesce(r.suburb, '')) = lower(btrim(p_suburb))
    )
    and (
      nullif(btrim(p_type), '') is null
      or r.venue_type = btrim(p_type)
    )
  order by r.name, r.id
  limit least(greatest(coalesce(p_limit, 24), 1), 24)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function find_restaurants(text, text, text, integer, integer) from public;
grant execute on function find_restaurants(text, text, text, integer, integer) to app_user;
