> [!IMPORTANT]
> Preserve published Git history. Avoid force-pushing or rewriting commits that have already been shared.

## Standing rules (from the founder, always apply)
- No zips. Push work to your own branch on GitHub (freebuff/<phase>), never to main.
- No secrets in code, chat or docs. Never connect to production. Do not run migrations or SQL yourself: write the .sql file in db/migrations and say it is not applied.
- No em dashes or en dashes anywhere (copy, comments, docs). Plain words for restaurant owners.
- Do not restyle, rename or move anything you were not asked to. Demo mode must keep working exactly as before.
- Keep runs cheap: run `npx tsc --noEmit` and your own new test files only. The reviewer runs the full suite, lint, build and the database checks.
- Finish with: the branch name, the files you changed, and what you could not verify. Do not claim "done" for anything you did not run.

## Skill and parallel work
- Before any Patron task, load the skill `patron-phase-builder` (`/skill:patron-phase-builder`, files in `.agents/skills/patron-phase-builder/`). It has the build loop, the database and screen rules, the test helper and the handoff format.
- Prompts for each phase live in `docs/prompts/` (start with `docs/prompts/README.md`). Several phases are built at the same time on separate branches, so own only the files your prompt lists and use only your reserved migration number.
- After you push, GitHub runs the full checks (install, all migrations on a fresh database, build, type check, lint, all tests, real-database tests, browser tests). Read the result and fix red before you say done.

## Live mode rules (real database), learned from reviews
- The signed in user comes from the server session. Never accept a restaurant id, role, plan, status or credit amount from the browser.
- Database access goes through `withContext` (restaurantId set, isOperator false). Operator context is only switched on inside a SECURITY DEFINER function, which must remember the caller's `app.is_operator` value and put it back before it returns (copy db/migrations/0013_create_restaurant_dev.sql). A function level SET is refused by Postgres for this setting.
- Sensitive writes (roles, plans, status, credit, stamps) go through SQL functions with `set search_path = public, pg_temp`, `revoke all ... from public` and `grant execute ... to app_user`.
- The database driver wraps errors: the database's own message is in `error.cause`, and `error.message` holds the query text and typed values. Read refusal codes from the cause chain by exact match (refusalCode in src/server/live-onboarding.ts). Never search `error.message` for a code.
- Rate limit sensitive actions with the existing rate_limit_hit helper (per user, or per IP when signed out).
- Public pages, join and card only show restaurants with status active. Drafts stay hidden.
- A live screen must never show sample data. Every owner screen needs a real live version before launch. Until then it must say it is not ready, not quietly show demo numbers.
- When a test mocks the database, make the mock behave like the real driver (wrap thrown errors in DrizzleQueryError). Mocks that are kinder than the real thing hide bugs.

## Tests
- Tests must not depend on the day or the hour. Use a fixed clock, or pick a guest with no visits in the last 28 days. Never take "the first guest" from the seed.
- Every new migration gets a text test (security definer, revoke from public, caller cannot set role or plan).
- Cross checks matter more than happy paths: another restaurant, signed out, wrong role, repeated call.

## Design and copy
- Build screens from the shared kit in src/components/patron/dash.tsx and the existing classes. Do not add colours or new one-off styles.
- One tab bar per section. Loyalty, Challenges and Referrals share LoyaltyTabs (src/components/patron/LoyaltyTabs.tsx).
- Decisions live in docs/decisions.md. Add a short entry when you make one.

## Application structure
- Keep the marketing experience on the index route; product flows are outside the homepage scope.
- Keep brand and proposed commercial data in a shared browser-safe module so the working name and pricing can be changed in one place.
- Keep calculator mathematics in a pure helper with regression tests so estimates remain consistent with the supplied reference.
- Use semantic global CSS tokens and existing UI primitives for the marketing design to keep its visual language consistent.
- Build dashboard screens from the shared kit in src/components/patron/dash.tsx (PageHeader, StatCard, DataTable, EmptyState, FormField, Badge, ConfirmDialog, PreviewBanner) instead of one-off styles; PageHeader stays a div so the shell owns the single page header.
