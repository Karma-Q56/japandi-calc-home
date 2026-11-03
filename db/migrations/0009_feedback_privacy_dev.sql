-- 0009_feedback_privacy_dev.sql - DEV BRANCH ONLY.
-- Owners may read feedback for their own restaurant, but the private operator
-- note is not theirs. They also cannot move status or write a note. The table
-- level SELECT and UPDATE grants from 0008 are replaced by a safe column list,
-- and the owner UPDATE policy is removed so a future grant cannot open it again.
--
-- Inserts stay available for the feedback form. Operators keep their all-rows
-- policy, and a server-side operator function can be added when the live
-- operator inbox exists.
--
-- Safe to re-run: revokes and grants are idempotent.

revoke select, update on feedback from app_user;
drop policy if exists feedback_owner_update on feedback;

-- note is deliberately absent. A SELECT * will now fail for the app role,
-- which is safer than silently returning an empty private note.
grant select (
  id,
  restaurant_id,
  source,
  category,
  message,
  contact_ok,
  contact,
  status,
  screenshot_name,
  screenshot_type,
  created_at
) on feedback to app_user;
