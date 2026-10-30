# Patron

Patron is a loyalty card and customer-list platform for independent South African restaurants. This repository currently contains the marketing site and the M0 platform foundation; later product milestones remain tracked in [Tasks completed.md](./Tasks%20completed.md).

## Local development

Requirements: Node.js 22 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

For a production-like local preview:

```sh
pnpm build
pnpm preview
```

The app runs on the Cloudflare Workers runtime locally. Copy `.dev.vars.example` to `.dev.vars` and provide a runtime `DATABASE_URL` only after the Neon app role has been provisioned. Do not put secrets in client-visible Vite variables.

## Neon database setup

1. Copy `.env.example` to `.env` and fill in the owner migration URL and a unique random `APP_USER_PASSWORD` locally.
2. Apply the versioned schema migrations with `pnpm db:migrate`.
3. Provision the restricted `app_user` login with `pnpm db:role`.
4. Put the `app_user` pooled connection string in `.dev.vars` as `DATABASE_URL` for local Worker runtime access.

`db/schema.sql` is the canonical PostgreSQL DDL. `db/migrations/` is append-only after merge. `pnpm db:reset` refuses remote hosts and requires `APP_ENV=development` or `APP_ENV=test`.

Authentication and OTP are intentionally deferred at the user's direction. Do not treat the current unauthenticated surfaces as production-ready.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

The cross-tenant integration check requires `DATABASE_URL_MIGRATE` and `DATABASE_URL_TEST`. CI provisions a disposable PostgreSQL 16 service and runs the check there.

## Deployment

The `deploy` script targets the staging Worker. Configure `DATABASE_URL` as a Cloudflare secret before serving `/healthz/db`; migration credentials must never be deployed to the Worker.
