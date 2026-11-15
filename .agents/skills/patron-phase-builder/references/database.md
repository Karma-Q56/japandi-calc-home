# Database rules for Patron

Read this before you write any SQL. Contents: files and numbers, the function template, grants and policies, money and time, errors.

## Files and numbers

- One migration file per phase: `db/migrations/NNNN_<topic>_dev.sql`, using the number reserved in your prompt. Migrations apply in file name order, so gaps are harmless.
- Never edit a migration that already exists (0001 to 0013 and any other phase's file). Add a new one.
- Make it safe to read in one go: a short comment at the top saying what it adds and why, `create ... if not exists` where it costs nothing, and never `drop` anything that holds data.
- You never run migrations or SQL yourself. GitHub applies every migration to a fresh database on each push, and the reviewer applies it to the preview database.

## Sensitive writes go through a SECURITY DEFINER function

Use a function when the caller must not be trusted to choose a value (role, plan, status, credit, stamps, rewards, prices). The caller passes only what they are allowed to say; the function decides the rest.

Required shape (the full working example is db/migrations/0013_create_restaurant_dev.sql):

```sql
create or replace function do_thing(p_restaurant_id uuid, p_input text) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_operator text := current_setting('app.is_operator', true);
begin
  -- FIRST: the restaurant you were given must be the caller's own restaurant (or the caller is an operator).
  if not app_is_operator() and app_restaurant() is distinct from p_restaurant_id then
    raise exception 'not_allowed';
  end if;
  perform set_config('app.is_operator', 'true', true);   -- only if the function must see across rows
  -- validate first, refuse with a short code: raise exception 'bad_input';
  -- do the work
  perform set_config('app.is_operator', coalesce(prior_operator, ''), true);  -- ALWAYS restore before returning
  return new_id;
end $$;

revoke all on function do_thing(uuid, text) from public;
grant execute on function do_thing(uuid, text) to app_user;
```

Why the restore matters: without it, the caller keeps operator power for the rest of the transaction and can read every restaurant. A function level `SET app.is_operator` is refused by Postgres for this setting, so save and restore as above.

Check that the caller is allowed inside the function too (their restaurant id from `app_restaurant()`, their role), not only in the server code.

Two traps that cost us a review round: (1) `app_restaurant() = p_restaurant_id` is NULL, not false, when there is no context, so always use `is distinct from`. (2) A CHECK constraint passes when its expression is NULL, so a required value needs `col is not null and ...` inside the check.

## Tables, grants and row level security

- A new table gets all three, in this order: `alter table x enable row level security; alter table x force row level security;`, policies, then explicit grants. The app role has no rights by default.
- Tenant data policy (copy the pattern from 0001):
  `using (restaurant_id = app_restaurant() or app_is_operator()) with check (restaurant_id = app_restaurant() or app_is_operator())`
- Give `app_user` only the rights the app needs: `grant select, insert, update on x to app_user;` Add `delete` only if the feature really deletes. Append-only data (consent, audit) gets select and insert only.
- Public data (menus, specials, the public page) may be readable by everyone, but only for restaurants whose `status = 'active'`. Drafts stay private.
- Every tenant table has `restaurant_id uuid not null references restaurant(id) on delete cascade`.

## Money, time, text

- Money is whole cents in an integer column (`price_cents`, `amount_cents`), currency ZAR. Show it as R plus rands in the UI. Never use floating point for money.
- Store times as `timestamptz`. Anything about "today", weekdays or opening hours uses the restaurant's local time: `at time zone 'Africa/Johannesburg'`. A server in another time zone must give the same answer.
- Phone numbers are E.164, digits only after the plus (`+27821234567`).
- Free text from users gets a length check in the database (`check (char_length(x) <= 200)`), not only in the browser.

## Errors

- Refuse with a short snake_case code as the message: `raise exception 'slug_taken';`. The server maps codes to plain sentences for owners.
- The database driver wraps errors. The database's own message is in `error.cause`. `error.message` contains the query and the typed values, so never search it for a code (it can match what the user typed). Use `refusalCode` in src/server/live-onboarding.ts as the model.
- Rate limit anything a person can repeat (sending, creating, guessing) with the existing `rate_limit_hit` helper. Choose a bucket name and limit, and say them in the code comment.

## Quick checks before you push

- Does every new function have `security definer`, `set search_path = public, pg_temp`, `revoke all ... from public` and `grant execute ... to app_user`?
- Does every new table have RLS enabled and forced, a tenant policy, and explicit grants?
- Could a signed-in owner of restaurant A read or change anything of restaurant B through your code? Write the test that tries.
- Does a text test of the .sql file assert the four function lines above? (AGENTS.md requires it.)
