-- Phase D17: web push (live mode).
-- Not applied by the build. Test on the preview database first.
--
-- SECURITY:
-- - push_subscription already exists (0001). This extends it, it does not duplicate it.
-- - A guest sees and changes only their own rows. The owner role (operators included)
--   never reads the keys, so the old push_own policy that let operators read rows is replaced.
-- - push_reach returns a number only, never the endpoints or keys. It is SECURITY DEFINER,
--   restores the caller's app.is_operator value before it returns (as in 0013), and is
--   granted to app_user only.

-- 1. Columns for a failed send. disabled_at (from 0001) marks a subscription as gone.
alter table push_subscription add column if not exists failed_at timestamptz;
alter table push_subscription add column if not exists last_failure_at timestamptz;

-- 2. Replace the policy: the guest owns the row, nobody else reads it.
drop policy if exists push_own on push_subscription;
create policy push_guest_own on push_subscription
  using (customer_id = app_customer())
  with check (customer_id = app_customer());

-- 3. Number of members who allow push and have at least one live subscription.
create or replace function push_reach(p_restaurant_id uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  reach integer;
begin
  -- A restaurant may only count its own reach. Without this, any signed-in owner could
  -- read another restaurant's push audience size.
  if not app_is_operator() and app_restaurant() is distinct from p_restaurant_id then
    raise exception 'not_allowed';
  end if;
  perform set_config('app.is_operator', 'true', true);

  select count(distinct m.customer_id)::integer into reach
  from membership m
  where m.restaurant_id = p_restaurant_id
    and m.marketing_push = 'opted_in'
    and exists (
      select 1 from push_subscription s
      where s.customer_id = m.customer_id and s.disabled_at is null
    );

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  return coalesce(reach, 0);
end;
$$;

revoke all on function push_reach(uuid) from public;
grant execute on function push_reach(uuid) to app_user;
