-- 0041_till_offer_codes_dev.sql - DEV BRANCH ONLY until the founder approves production.
-- The till could not take offer codes. The 0020 function only worked for members-only
-- codes: a public code was refused (no guest holds a personal copy of it) and a personal
-- code was never found. This replaces it and adds campaign codes.
--
-- SECURITY: security definer. The caller passes a restaurant id, a guest card, a typed
-- code, the signed-in staff member and a retry key. The restaurant must be the till's own,
-- the staff member active there, and the card from that restaurant.
-- Results: ok, replay, not_found, not_active, not_member, already_used.

drop function if exists redeem_special_code(uuid, text, uuid, uuid, text);

create function redeem_special_code(
  p_restaurant uuid, p_code text, p_membership uuid, p_staff uuid, p_key text
) returns table (
  out_result text, out_special_id uuid, out_title text,
  out_reward text, out_percent_off integer, out_amount_off_cents integer
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
  needle      text := upper(trim(p_code));
  sp          special%rowtype;
  camp        campaign%rowtype;
  held        special_code%rowtype;
  prior_use   special_use%rowtype;
  now_ts      timestamptz := now();
  verdict     text := 'ok';
begin
  if not app_is_operator() and app_restaurant() is distinct from p_restaurant then
    raise exception 'not_allowed';
  end if;
  perform set_config('app.is_operator', 'true', true);

  if not exists (select 1 from staff_member
                  where id = p_staff and restaurant_id = p_restaurant and active) then
    perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
    raise exception 'not_allowed';
  end if;

  -- One redemption at a time for each card, so two taps cannot use a code twice.
  perform pg_advisory_xact_lock(hashtext('offer:' || p_membership::text));

  <<attempt>>
  begin
    -- A retry with the same key returns the first answer and changes nothing.
    select * into prior_use from special_use
      where restaurant_id = p_restaurant and idempotency_key = p_key;
    if found then
      select * into sp from special where id = prior_use.special_id;
      verdict := 'replay';
      exit attempt;
    end if;

    if not exists (select 1 from membership
                    where id = p_membership and restaurant_id = p_restaurant) then
      verdict := 'not_member';
      exit attempt;
    end if;

    -- A shared code (public or members-only), or one guest's personal code.
    select * into sp from special
      where restaurant_id = p_restaurant and upper(code) = needle and kind <> 'targeted';
    if not found then
      select * into held from special_code
        where restaurant_id = p_restaurant and upper(code) = needle;
      if found then
        select * into sp from special where id = held.special_id;
        if held.membership_id <> p_membership then
          verdict := 'not_member';
          exit attempt;
        end if;
      end if;
    end if;

    if sp.id is not null then
      if not sp.active
         or (sp.starts_at is not null and sp.starts_at > now_ts)
         or (sp.ends_at is not null and sp.ends_at < now_ts) then
        verdict := 'not_active';
        exit attempt;
      end if;
      -- Every special works once for each card.
      if held.redeemed_at is not null
         or exists (select 1 from special_use
                     where special_id = sp.id and membership_id = p_membership) then
        verdict := 'already_used';
        exit attempt;
      end if;
      if held.id is not null then
        update special_code set redeemed_at = now_ts, redeemed_by = p_staff::text
          where id = held.id;
      end if;
      insert into special_use (restaurant_id, special_id, membership_id, special_code_id,
                               staff_id, idempotency_key, used_at)
        values (p_restaurant, sp.id, p_membership, held.id, p_staff, p_key, now_ts);
      insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
        values ('staff', p_staff::text, p_restaurant, 'special.redeemed', 'special', sp.id::text,
                jsonb_build_object('membership_id', p_membership, 'kind', sp.kind));
      exit attempt;
    end if;

    -- A campaign code works for a guest who was sent that campaign, once, while it runs.
    select c.* into camp from campaign c
      where c.restaurant_id = p_restaurant and upper(c.code) = needle
        and c.status in ('sending', 'sent')
      order by exists (select 1 from message m
                        where m.campaign_id = c.id and m.membership_id = p_membership) desc,
               c.created_at desc
      limit 1;
    if not found then
      verdict := 'not_found';
      exit attempt;
    end if;
    sp.title := camp.name;
    sp.reward_text := camp.message_body;
    if not exists (select 1 from message m
                    where m.campaign_id = camp.id and m.membership_id = p_membership
                      and m.status in ('sending', 'sent', 'delivered')) then
      verdict := 'not_member';
      exit attempt;
    end if;
    if (camp.valid_from is not null and camp.valid_from > now_ts)
       or (camp.valid_to is not null and camp.valid_to < now_ts) then
      verdict := 'not_active';
      exit attempt;
    end if;
    if exists (select 1 from redemption
                where campaign_id = camp.id and membership_id = p_membership) then
      verdict := 'already_used';
      exit attempt;
    end if;
    insert into redemption (restaurant_id, campaign_id, membership_id, kind, code, staff_id, redeemed_at)
      values (p_restaurant, camp.id, p_membership, 'campaign', camp.code, p_staff, now_ts);
    insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id, meta)
      values ('staff', p_staff::text, p_restaurant, 'campaign.redeemed', 'campaign', camp.id::text,
              jsonb_build_object('membership_id', p_membership));
  end attempt;

  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);
  -- Title and reward are only shared when the code belongs to this card or is shared.
  if verdict = 'not_member' then
    return query select verdict, null::uuid, null::text, null::text, null::integer, null::integer;
    return;
  end if;
  return query select verdict, sp.id, sp.title::text, sp.reward_text::text,
                      sp.percent_off, sp.amount_off_cents;
end;
$$;

revoke all on function redeem_special_code(uuid, text, uuid, uuid, text) from public;
grant execute on function redeem_special_code(uuid, text, uuid, uuid, text) to app_user;
