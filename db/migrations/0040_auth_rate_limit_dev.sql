-- 0040_auth_rate_limit_dev.sql - DEV BRANCH ONLY until the founder approves production.
-- The sign-in library (Better Auth) stores "lastRequest" as milliseconds since 1970, a plain
-- number. 0007 made the column a date, so every sign-up and sign-in failed in live mode.
-- The rows only count recent attempts, so converting them is safe.

alter table "rateLimit" alter column "lastRequest" drop default;

alter table "rateLimit"
  alter column "lastRequest" type bigint
  using (extract(epoch from "lastRequest") * 1000)::bigint;

alter table "rateLimit"
  alter column "lastRequest" set default (extract(epoch from now()) * 1000)::bigint;
