# Testing and handoff for Patron

Contents: what you run, what GitHub runs, the real-database helper, how to read the GitHub check, what the reviewer does next.

## What you run, what GitHub runs

You run, on your machine: `npx tsc --noEmit` and your own new test files only (for example `npx vitest run src/server/live-publish.test.ts`). This keeps your runs cheap.

GitHub runs everything on each push (see .github/workflows/ci.yml): install, every migration on a fresh Postgres, the restricted app role, build, type check, lint, every unit test, your real-database tests, the database security check (scripts/rls-check.mjs) and the browser tests. You do not need to run these yourself, but you do need to read the result.

## Three kinds of test, and when to write each

1. **Unit test with a mocked database.** For validation, mapping error codes to messages, rate limiting and the shape of server functions. Model: src/server/live-till.test.ts and src/server/live-onboarding.test.ts. Make the mock behave like the real driver: when it throws, wrap the error the way drizzle does (`DrizzleQueryError` with the database message in `cause`).
2. **Real-database test.** Required whenever you add or change a migration. It runs your SQL as the restricted `app_user` role against a real Postgres. Use the helper `src/test/db-fixture.ts` and copy the shape of `src/test/db/create-restaurant.db.test.ts`. Name it `src/test/db/<phase>.db.test.ts` and start the file with `// @vitest-environment node`. It skips on a laptop and runs on GitHub.
3. **Text test of the migration file.** Assert the .sql text contains `security definer`, `set search_path = public, pg_temp`, `revoke all`, `grant execute`, and that nothing lets the caller set a role, plan, status or credit. Cheap and catches paste mistakes.

Component and route tests follow the existing files in `src/test/` and `src/components/`. Browser tests live in `tests/e2e/`. Add one only if your prompt says so.

## What every real-database test must try

- The happy path as the right person.
- Another restaurant: restaurant B's login or context cannot read or change restaurant A's rows (select returns zero rows, update and delete affect zero rows).
- Signed out or no context: sees nothing private.
- The wrong role: a guest or staff login cannot do an owner action.
- A repeat: the same call twice does not double a stamp, a credit or a reward.
- A bad input: refused with the expected short code, and nothing was written.
- Operator power: after a SECURITY DEFINER function returns, `current_setting('app.is_operator')` is back to `'false'` and `select count(*) from app_user` returns 0 for a normal context.

## Time and data

- Tests must not depend on the day or the hour. Use a fixed clock for anything about weekdays, "today" or windows, or create fresh fixtures with explicit timestamps.
- Never take "the first guest" from the seed. Create what you need with the helper (`makeRestaurant`, `makeGuest`, `makeMembership`, `makeAppUser`) and remove it in `afterAll` with `cleanup`.
- Phone numbers must be digits only. Use `phoneDigits()`.

## Reading the GitHub check

1. If the `gh` command works for you: `gh run list --branch <your-branch> --limit 3`, then `gh run view <id> --log-failed` for the first failing step.
2. If `gh` is not available, tell Karma in your handoff that the branch is pushed and ask him to open the Actions tab on GitHub and paste the first red step.
3. Typical meanings: "Apply schema" red means your migration has a SQL error on a fresh database. "Typecheck, lint, tests, and build" red shows the failing test or file in its log. "Browser smoke test" red means a screen changed in a way an existing browser test did not expect, so read the test before changing the screen.
4. Fix the first failure, push, read again. Three rounds at most, then report what is still red.

## What the reviewer does after you

Applies your migration to the preview database, calls your functions as the restricted role from another restaurant, opens your screens at 375 px and 1280 px, clicks every button, and runs the full checks. Anything you would not want found there, check first.
