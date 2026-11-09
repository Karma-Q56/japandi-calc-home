-- D13c: what a guest had at the till. One row per menu item on a visit.
-- This file is written only. It is NOT applied here; GitHub runs it on a fresh database.

create table if not exists visit_item (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurant(id) on delete cascade,
  stamp_event_id uuid not null references stamp_event(id) on delete cascade,
  menu_item_id   uuid not null references menu_item(id) on delete cascade,
  quantity       smallint not null default 1 check (quantity between 1 and 20),
  created_at     timestamptz not null default now(),
  unique (stamp_event_id, menu_item_id)
);
create index if not exists visit_item_stamp on visit_item (stamp_event_id);
create index if not exists visit_item_restaurant_item on visit_item (restaurant_id, menu_item_id);

alter table visit_item enable row level security;
alter table visit_item force row level security;

drop policy if exists tenant_all on visit_item;
create policy tenant_all on visit_item for all
  using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());

-- Guests may read their own visit items through their stamp's membership.
drop policy if exists visit_item_read_own on visit_item;
create policy visit_item_read_own on visit_item for select using (
  exists (
    select 1 from stamp_event se
    join membership m on m.id = se.membership_id
    where se.id = visit_item.stamp_event_id
      and m.customer_id = app_customer()
  )
);

grant select, insert on visit_item to app_user;

-- Save what the guest had. Called by the till right after a stamp.
--   p_stamp_event: the stamp just recorded. It must be valid, in the caller's restaurant,
--                  and no more than 15 minutes old.
--   p_items: jsonb array of { "menu_item_id": uuid, "quantity": 1..20 }. Up to 12 distinct items.
--            Every item must belong to the same restaurant and be available.
--   A repeat call replaces the list for that stamp. An empty list writes nothing.
-- Returns: 'saved', 'no_items', 'stamp_not_found', 'stamp_too_old', 'too_many_items', 'item_not_allowed'.
create or replace function record_visit_items(p_stamp_event uuid, p_items jsonb)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  se          stamp_event%rowtype;
  item_count  integer;
  bad_count   integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return 'no_items';
  end if;

  select count(distinct (e->>'menu_item_id')) into item_count
    from jsonb_array_elements(p_items) e;
  if item_count > 12 or jsonb_array_length(p_items) > 12 then
    return 'too_many_items';
  end if;

  -- Read the stamp and the menu inside this function's own scope. The caller's
  -- restaurant is checked explicitly below, so RLS does not hide rows from it.
  perform set_config('app.is_operator', 'true', true);

  select * into se from stamp_event where id = p_stamp_event;
  if not found or se.restaurant_id is distinct from app_restaurant() then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 'stamp_not_found';
  end if;
  if se.status <> 'valid' or se.created_at < now() - interval '15 minutes' then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 'stamp_too_old';
  end if;

  -- Every item must be on this restaurant's menu and available.
  select count(*) into bad_count
    from jsonb_array_elements(p_items) e
    left join menu_item mi
      on mi.id = (e->>'menu_item_id')::uuid
     and mi.restaurant_id = se.restaurant_id
     and mi.available
    where mi.id is null;
  if bad_count > 0 then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    return 'item_not_allowed';
  end if;

  delete from visit_item where stamp_event_id = se.id;
  insert into visit_item (restaurant_id, stamp_event_id, menu_item_id, quantity)
    select se.restaurant_id, se.id, (e->>'menu_item_id')::uuid,
           coalesce((e->>'quantity')::smallint, 1)
      from jsonb_array_elements(p_items) e
    on conflict (stamp_event_id, menu_item_id)
      do update set quantity = excluded.quantity;

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return 'saved';
end;
$$;

revoke all on function record_visit_items(uuid, jsonb) from public;
grant execute on function record_visit_items(uuid, jsonb) to app_user;
