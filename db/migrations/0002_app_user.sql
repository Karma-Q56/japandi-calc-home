-- Non-owner runtime role. The owning Neon role must apply migrations; the app role owns nothing.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    execute 'create role app_user nologin';
  end if;
end
$$;

revoke create on schema public from public;
grant usage on schema public to app_user;

-- Tenant tables are scoped by RLS and all runtime queries must still use withContext().
grant select, insert, update, delete on
  restaurant, staff_member, menu_section, menu_item, special, membership,
  stamp_event, reward, payment, campaign, message, redemption, credit_ledger,
  push_subscription, one_time_code, customer, consent_event
  to app_user;

-- Operational data receives only the operations the server needs. No SQL object is owned by app_user.
grant select, insert, update on lead, data_request, provider_event to app_user;
grant select, insert on otp_send_log, audit_event to app_user;
grant select, insert, delete on rate_limit_hit to app_user;
grant usage, select on all sequences in schema public to app_user;

-- Consent evidence is append-only, including at the privilege layer.
revoke update, delete, truncate, references, trigger on consent_event from app_user;
grant select, insert on consent_event to app_user;
