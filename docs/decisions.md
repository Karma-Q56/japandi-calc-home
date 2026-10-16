# Decisions and verified facts

## 2026-10-16 — M0 demo-only product foundation

- **User direction and milestone prompt:** build M0/M2/M3 in demo mode, with no real login, SMS provider, or database. Do not call Neon in these milestones; the existing PostgreSQL schema remains untouched.
- **Implementation:** deterministic demo seed, browser-safe `DemoRepo` with guarded localStorage and in-memory fallback, cross-tab storage listener, persisted demo clock/session, API and domain seams, role-gated demo tunnels, and a fake SMS outbox.
- **Unverified:** TypeScript, lint, unit tests, route generation/build, and mobile acceptance. Node-based checks did not return during this session; `git diff --check` passed.
- **Source of truth detail:** the M0/M2/M3 prompt files were supplied by the user; M0 requires this demo seam before later milestone screens.

## 2026-10-15 — Cloudflare Workers Vite integration

- **Verified:** Cloudflare's current TanStack Start guide uses `@cloudflare/vite-plugin` together with TanStack Start's Vite plugin and React plugin, with a Wrangler config whose main entry is `@tanstack/react-start/server-entry`. The guide says to remove any other deployment adapter such as Nitro. This replaces the Lovable wrapper and prior Nitro adapter while retaining the existing routes and UI.
- **Verified:** TanStack Start supports a custom `src/server.ts` entry through `createServerEntry`, which delegates to the built-in handler. The project keeps its custom error-page normalization through that supported entry point.
- **Sources:** [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/), [TanStack Start server entry docs](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point).

## 2026-10-15 — Neon connection approach

- **Verified:** Neon’s serverless driver supports SQL over HTTP and WebSockets; `Pool`/`Client` provide real transactions across multiple statements, while the `neon()` HTTP function is for single-shot queries. This code uses one request-scoped WebSocket `Pool` for transaction-scoped RLS context and closes it after the transaction.
- **Sources:** [Neon serverless driver GA](https://neon.com/blog/serverless-driver-ga), [Neon driver overview](https://neon.com/docs/serverless/serverless-driver).
- **Unverified for this project:** no Neon credentials or connected account were available to apply the schema, run tenant-isolation queries, measure Johannesburg-to-Frankfurt latency, or record Cloudflare CPU time.

## 2026-10-15 — Runtime database role

- **Verified:** Neon documents that login roles need a password when created. Secrets are therefore kept out of checked-in SQL: migration 0002 creates the least-privileged `app_user` role without login and grants only runtime privileges; a separate local provisioning script will enable login and set its password from `APP_USER_PASSWORD` after the role is created.
- **Unverified:** role creation/grant execution against the user's Neon project and free-plan permissions; no project was connected during this work.
- **Source:** [Neon Postgres roles](https://neon.com/blog/postgres-roles).
- **Deviation from BUILD_PLAN M0:** app role password provisioning is a separate command, not a password embedded in the migration, to keep credentials out of migrations.

## 2026-10-15 — Authentication deferred

- **User direction:** defer all authentication and OTP work for now. The auth middleware is disabled; routes remain public or demo-only until a later milestone adds the specified auth model. No login flow or Better Auth dependencies were added.

## 2026-10-15 — Append-only consent and private operational rows

- **Schema correction:** the supplied consent policy defaulted to `FOR ALL`, which allowed updates/deletes under RLS despite the requirement that consent evidence be insert-only. The canonical schema now has select/insert-only consent policies and the `app_user` grant revokes update/delete. Tenant-scoped audit and data-request rows are RLS-protected; leads allow public server-side inserts and operator-only reads/updates.
- **Intentional exception from the supplied schema:** `one_time_code` remains outside RLS because the SQL comments specify it is accessed before a tenant context exists. Callers must still keep access in trusted server functions and avoid returning codes or hashes to clients.

## 2026-10-15 — Lint baseline

- The repository's existing sources produced more than 400 Prettier-only errors under the prior `eslint-plugin-prettier/recommended` setup. Reformatting the whole UI would create a large unrelated diff, so ESLint now checks code rules and the existing `format` script remains the explicit Prettier operation. No UI files were reformatted for M0.

## 2026-10-15 — Neon access follow-up

- The user confirmed Neon is connected and authorized applying migrations. In this session the exposed Neon operations require an explicit project_id; describe_project confirmed the connection is unscoped. The available operations do not include project listing, SQL execution, or migration preparation, and the repository .env contains no DATABASE_URL/DATABASE_URL_MIGRATE entries (only existing Supabase variable names; values were not read).
- No database changes were made. Need a Neon connection that exposes list/project and migration/SQL operations, or a secure local .env configured with direct owner DATABASE_URL_MIGRATE and pooled runtime DATABASE_URL, before applying and verifying migrations. Do not paste credentials in chat.
- Per AGENTS.md, M1/M2 remain gated on M0 acceptance; this turn did not start later milestones.


## 2026-10-15 — Neon CLI setup attempt

- User supplied organization org-sweet-wave-28962628, project super-waterfall-31745320, and branch production, and authorized setup. Neon CLI installation and help attempts using npx neon@latest and npm install --global neon@latest stalled without output and were interrupted. No login launched and no database changes were made.
- The provided services list included auth and optional AI/object-storage/functions. Auth remains deferred per the user's earlier explicit direction; only Postgres is in scope for M0-M2. The requested production branch is an existing live target; apply schema only after a CLI/connection is usable and the ordered migrations can be reviewed against it.
