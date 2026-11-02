# Real accounts setup (Phase D1)

This build self-hosts Better Auth on the Neon dev branch. Demo mode stays the
default and needs none of this. Live mode is switched on with `DATA_MODE=live`.

## What is built

- Email and password sign-up and sign-in, Google sign-in when configured,
  forgotten password, reset password, and a finish-your-phone step for Google
  users.
- One login page for everyone. After sign-in the app sends a guest to `/me`, an
  owner or manager to `/app`, and an operator to `/ops/restaurants`.
- Server guards read the session from the HttpOnly cookie on `/me`, `/app` and
  `/ops`. The demo role switcher is hidden in live mode.
- Better Auth rate limits are stored in Postgres. Sign-in, sign-up and password
  reset have their own limits.
- Sign-in, failed sign-in and password change write an `audit_event`.
- A new sign-up becomes a guest with a `customer` row. Owners, managers and
  operators are linked by hand in `app_user`, never by a screen.

## What the founder must do

Do these in your own accounts. Never paste a secret into chat or commit it.

1. **Apply the dev migration.** In the Neon console open project WallStamp,
   branch "Freebuffy", then SQL Editor. Run
   `db/migrations/0007_auth_dev.sql`. Confirm you are on the dev branch, not
   production. This creates the Better Auth tables and `app_user`.
2. **Make the auth secret.** In a terminal run
   `openssl rand -base64 32`. Put the result in `.dev.vars` as
   `BETTER_AUTH_SECRET`. Set `BETTER_AUTH_URL=http://127.0.0.1:5174`.
3. **Google (optional).** In Google Cloud Console create an OAuth client of
   type Web application. Add the redirect URI
   `http://127.0.0.1:5174/api/auth/callback/google`. Put the client id and
   secret in `.dev.vars` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and
   set `VITE_AUTH_GOOGLE=1`. Add the staging and production callback URLs later,
   one per environment.
4. **Password reset email.** Better Auth has no built-in sender. Point
   `AUTH_EMAIL_WEBHOOK_URL` at a small sender you control (for example a
   Cloudflare Worker using your email provider) and set
   `AUTH_EMAIL_WEBHOOK_SECRET`. The sender receives JSON
   `{ to, subject, text }` and must check the bearer token. Until this is set,
   the forgot-password form says email is not configured.
5. **Make yourself the owner.** Sign up once with the email you want to use.
   Then, on the dev branch SQL Editor, link that user to your restaurant:
   ```sql
   update app_user
   set role = 'owner', restaurant_id = (select id from restaurant where slug = 'daily-grind')
   where email = 'YOUR_EMAIL';
   ```
   Use `'operator'` with no restaurant for the Patron console. Use
   `'manager'` with a restaurant for a manager. Never do this from a screen.
6. **Turn on live mode.** In `.dev.vars` set `DATA_MODE=live` and make sure
   `DATABASE_URL` is the dev branch app_user URL. Start the app and sign up.
   Set it back to `demo` when you want the demo accounts.

## Not verified

- `0007_auth_dev.sql` has not been run against the dev branch yet.
- Google sign-in and the reset email need the credentials above; neither was
  sent or tested.
- No live auth test has run against Postgres. Only the role and phone rules are
  covered by Vitest.
- Phase D2 connects the owner overview and `/me` cards to Postgres. Other
  owner tools show a "comes next" panel in live mode, and guest restaurant and
  settings pages return to `/me` until D3. The live query path has not run
  against the dev branch yet.

## Phone verification decision

Sign-up normalises to a South African mobile number and rejects landlines, but
does not send a code. Risk: a wrong or fake number gets a card and, later, SMS.
Proposed default, behind a switch that stays off until you decide: send one
verification code the first time a guest opts in to SMS offers, paid by Patron,
rate limited per number and per IP. Apple sign-in waits for a paid Apple
developer account.
