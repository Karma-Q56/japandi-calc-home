-- 0008_app_role_grants_dev.sql - DEV BRANCH ONLY.
-- The app role needs the tables added after 0002. These grants are additive
-- and idempotent, so this file can be re-run safely. Column privacy for
-- feedback is tightened in 0009, which must run after this file.
--
-- Do not run this against production. This migration brings a fresh dev
-- database to the state used during development.

grant select, insert, update, delete on
  special_code, saved_list, spin_result, challenge
  to app_user;

grant select, insert, update on
  idea, feedback
  to app_user;

grant usage, select on sequence lead_reference_seq to app_user;
