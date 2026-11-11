-- 0021 "Try this dish" challenge (D12f). NOT APPLIED.
-- Written to be applied after 0018 and 0024. GitHub runs it on a fresh database.

-- ---------------------------------------------------------------- challenge: the dish or section
alter table challenge
  add column if not exists menu_item_id uuid references menu_item(id) on delete cascade,
  add column if not exists menu_section_id uuid references menu_section(id) on delete cascade;

alter table challenge drop constraint if exists challenge_kind_check;
alter table challenge add constraint challenge_kind_check check (
  (kind = 'visits' and cardinality(weekdays) = 0 and start_hour is null and end_hour is null
     and menu_item_id is null and menu_section_id is null)
  or (kind = 'quiet_days' and cardinality(weekdays) between 1 and 7
      and (start_hour is null) = (end_hour is null)
      and (start_hour is null or (start_hour between 0 and 23 and end_hour between 1 and 24 and end_hour > start_hour))
      and menu_item_id is null and menu_section_id is null)
  or (kind = 'try_item' and cardinality(weekdays) = 0 and start_hour is null and end_hour is null
      and visits between 1 and 50
      and num_nonnulls(menu_item_id, menu_section_id) = 1)
);

-- A dish or section must belong to the same restaurant as the challenge.
create or replace function challenge_menu_same_restaurant()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.menu_item_id is not null and not exists (
    select 1 from menu_item where id = new.menu_item_id and restaurant_id = new.restaurant_id
  ) then
    raise exception 'menu_item_other_restaurant';
  end if;
  if new.menu_section_id is not null and not exists (
    select 1 from menu_section where id = new.menu_section_id and restaurant_id = new.restaurant_id
  ) then
    raise exception 'menu_section_other_restaurant';
  end if;
  return new;
end;
$$;

drop trigger if exists challenge_menu_same_restaurant on challenge;
create trigger challenge_menu_same_restaurant
  before insert or update of restaurant_id, menu_item_id, menu_section_id on challenge
  for each row execute function challenge_menu_same_restaurant();

-- ---------------------------------------------------------------- progress for try_item
-- Counts the till orders (visit_item) for the chosen dish or section, inside the window.
-- Orders recorded before the challenge started do not count. Other restaurants never match.
create or replace function challenge_try_item_progress(p_challenge uuid, p_membership uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(vi.quantity), 0)::int
  from challenge c
  join stamp_event se on se.membership_id = p_membership and se.restaurant_id = c.restaurant_id
  join visit_item vi on vi.stamp_event_id = se.id and vi.restaurant_id = c.restaurant_id
  join menu_item mi on mi.id = vi.menu_item_id
  where c.id = p_challenge
    and c.kind = 'try_item'
    and se.status = 'valid'
    and se.created_at >= greatest(c.created_at, now() - make_interval(days => c.window_days))
    and (
      (c.menu_item_id is not null and vi.menu_item_id = c.menu_item_id)
      or (c.menu_section_id is not null and mi.section_id = c.menu_section_id)
    );
$$;

-- ---------------------------------------------------------------- progress: visits, quiet days or dish orders
create or replace function challenge_progress(p_challenge uuid, p_membership uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when (select kind from challenge where id = p_challenge) = 'try_item'
      then challenge_try_item_progress(p_challenge, p_membership)
    else (
      select count(*)::int
      from stamp_event se
      join challenge c on c.id = p_challenge
      where se.membership_id = p_membership
        and se.restaurant_id = c.restaurant_id
        and se.status = 'valid'
        and se.reason = 'visit'
        and se.created_at >= now() - make_interval(days => c.window_days)
        and (
          c.kind = 'visits'
          or (
            extract(dow from se.created_at at time zone 'Africa/Johannesburg')::smallint = any (c.weekdays)
            and (c.start_hour is null or extract(hour from se.created_at at time zone 'Africa/Johannesburg')
                   between c.start_hour and c.end_hour - 1)
          )
        )
    )
  end;
$$;

revoke all on function challenge_try_item_progress(uuid, uuid) from public;
grant execute on function challenge_try_item_progress(uuid, uuid) to app_user;
revoke all on function challenge_progress(uuid, uuid) from public;
grant execute on function challenge_progress(uuid, uuid) to app_user;
