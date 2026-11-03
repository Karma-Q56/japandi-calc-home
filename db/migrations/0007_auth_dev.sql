-- 0007_auth_dev.sql - DEV BRANCH ONLY.
-- Self-hosted Better Auth (founder choice after the Neon Auth review).
-- Users, sessions and rate limits live in the dev branch. Do not run on
-- production. The app role may use these tables; they are not tenant data.
-- Session tokens are opaque and hashed by Better Auth, never stored here raw
-- in our own columns.

create table if not exists "user" (
  id              text primary key,
  name            text not null,
  email           text not null unique,
  "emailVerified" boolean not null default false,
  image           text,
  "phoneNumber"   text,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

create table if not exists "session" (
  id           text primary key,
  "expiresAt"  timestamptz not null,
  token        text not null unique,
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now(),
  "ipAddress"  text,
  "userAgent"  text,
  "userId"     text not null references "user"(id) on delete cascade
);
create index if not exists session_user_id_idx on "session" ("userId");

create table if not exists "account" (
  id                      text primary key,
  "accountId"             text not null,
  "providerId"            text not null,
  "userId"                text not null references "user"(id) on delete cascade,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope                   text,
  password                text,
  "createdAt"             timestamptz not null default now(),
  "updatedAt"             timestamptz not null default now()
);
create index if not exists account_user_id_idx on "account" ("userId");

create table if not exists "verification" (
  id           text primary key,
  identifier   text not null,
  value        text not null,
  "expiresAt"  timestamptz not null,
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now()
);
create index if not exists verification_identifier on "verification"(identifier);

-- Better Auth's database-backed rate limiter. Postgres, not process memory.
create table if not exists "rateLimit" (
  id            text primary key,
  key           text not null unique,
  count         integer not null default 0,
  "lastRequest" timestamptz not null default now()
);

-- Our link from an auth user to a customer, a restaurant role or the operator
-- flag. Owners and operators are created here by hand; a new sign-up is a guest.
create table if not exists app_user (
  user_id       text primary key,
  email         text not null unique,
  role          text not null default 'guest'
                check (role in ('guest', 'owner', 'manager', 'operator')),
  restaurant_id uuid references restaurant(id) on delete set null,
  customer_id   uuid references customer(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists app_user_restaurant on app_user (restaurant_id);

alter table app_user enable row level security;
alter table app_user force row level security;
create policy app_user_operator on app_user for all using (app_is_operator())
  with check (app_is_operator());

grant select, insert, update, delete on
  "user", "session", "account", "verification", "rateLimit", app_user
  to app_user;

-- These are auth tables, not tenant rows. They are reachable only through the
-- auth handler and the server functions, never a browser query.
