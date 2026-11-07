// Helper for tests that talk to a REAL Postgres (not a mock).
//
// Why this exists: a mocked database cannot catch the mistakes that hurt us most (a missing
// grant, a policy that lets another restaurant in, a SECURITY DEFINER function that leaks
// operator power). These tests run the real SQL as the real restricted role (app_user).
//
// They run automatically on GitHub for every push (CI sets both addresses below on a fresh
// database with every migration applied). On a laptop they skip unless you set the two
// addresses yourself. Never point them at production.
//   DATABASE_URL_MIGRATE  owner connection, used only to create and remove fixtures
//   DATABASE_URL_TEST     app_user connection, used to exercise the code under test
//
// Use this in a test file that starts with `// @vitest-environment node`:
//   describe.skipIf(!dbTestsEnabled)("my phase (real database)", () => { ... });
import { randomUUID } from "node:crypto";
import postgres from "postgres";

export const ownerUrl = process.env["DATABASE_URL_MIGRATE"];
export const appUrl = process.env["DATABASE_URL_TEST"];
export const dbTestsEnabled = Boolean(ownerUrl && appUrl);

export type Sql = ReturnType<typeof postgres>;
export type Tx = postgres.TransactionSql;

export type DbConnections = { owner: Sql; app: Sql; close: () => Promise<void> };

export function connect(): DbConnections {
  if (!ownerUrl || !appUrl) throw new Error("DATABASE_URL_MIGRATE and DATABASE_URL_TEST are required.");
  const owner = postgres(ownerUrl, { max: 1, prepare: false });
  const app = postgres(appUrl, { max: 1, prepare: false });
  return {
    owner,
    app,
    close: async () => {
      await owner.end({ timeout: 5 });
      await app.end({ timeout: 5 });
    },
  };
}

/** Request context, the same three settings the server sets in withContext. */
export type Context = { restaurantId?: string; customerId?: string; operator?: boolean };

/**
 * Run work as app_user inside ONE transaction with the request context set.
 * The transaction is rolled back at the end when `rollback` is true (default), so
 * checks never leave rows behind. Errors thrown inside `work` propagate to the test.
 */
export async function asApp<T>(
  app: Sql,
  context: Context,
  work: (tx: Tx) => Promise<T>,
  options: { rollback?: boolean } = {},
): Promise<T> {
  const rollback = options.rollback ?? true;
  const marker = Symbol("rollback");
  let result: T | undefined;
  try {
    await app.begin(async (tx) => {
      await tx`
        select set_config('app.restaurant_id', ${context.restaurantId ?? ""}, true),
               set_config('app.customer_id', ${context.customerId ?? ""}, true),
               set_config('app.is_operator', ${context.operator ? "true" : "false"}, true)
      `;
      result = await work(tx);
      if (rollback) throw marker;
    });
  } catch (error) {
    if (error !== marker) throw error;
  }
  return result as T;
}

/** A short random token for unique slugs, ids and phone digits. */
export const token = () => randomUUID().replaceAll("-", "");

/** Digits only, so it passes the E.164 check (hex letters from a UUID would not). */
export const phoneDigits = () =>
  String(BigInt(`0x${token().slice(0, 12)}`) % 10000000n).padStart(7, "0");

/** Everything a fixture creates, so cleanup can remove it. */
export type Fixtures = { restaurants: string[]; customers: string[]; users: string[] };
export const newFixtures = (): Fixtures => ({ restaurants: [], customers: [], users: [] });

export async function makeRestaurant(
  owner: Sql,
  fixtures: Fixtures,
  values: { name?: string; status?: "draft" | "active" | "paused" | "closed" } = {},
): Promise<{ id: string; slug: string }> {
  const slug = `t-${token().slice(0, 24)}`;
  const [row] = await owner`
    insert into restaurant (slug, name, status)
    values (${slug}, ${values.name ?? "Test restaurant"}, ${values.status ?? "draft"})
    returning id
  `;
  fixtures.restaurants.push(row!["id"] as string);
  return { id: row!["id"] as string, slug };
}

export async function makeGuest(owner: Sql, fixtures: Fixtures): Promise<{ id: string; userId: string }> {
  const userId = `t-${token()}`;
  const [row] = await owner`
    insert into customer (user_id, phone_e164, name)
    values (${userId}, ${`+2782${phoneDigits()}`}, 'Test guest')
    returning id
  `;
  fixtures.customers.push(row!["id"] as string);
  return { id: row!["id"] as string, userId };
}

export async function makeMembership(
  owner: Sql,
  restaurantId: string,
  customerId: string,
): Promise<string> {
  const [row] = await owner`
    insert into membership (restaurant_id, customer_id) values (${restaurantId}, ${customerId}) returning id
  `;
  return row!["id"] as string;
}

/** A signed-in login row with a role, for functions that take a user id. */
export async function makeAppUser(
  owner: Sql,
  fixtures: Fixtures,
  values: { role?: "guest" | "owner" | "manager" | "operator"; restaurantId?: string } = {},
): Promise<string> {
  const userId = `t-${token()}`;
  await owner`
    insert into app_user (user_id, email, role, restaurant_id)
    values (${userId}, ${`${userId}@test.invalid`}, ${values.role ?? "guest"}, ${values.restaurantId ?? null})
  `;
  fixtures.users.push(userId);
  return userId;
}

/** Remove everything the fixtures created. Call from afterAll. */
export async function cleanup(owner: Sql, fixtures: Fixtures): Promise<void> {
  await owner.begin(async (tx) => {
    await tx`
      select set_config('app.restaurant_id', '', true),
             set_config('app.customer_id', '', true),
             set_config('app.is_operator', 'true', true)
    `;
    if (fixtures.users.length) await tx`delete from app_user where user_id = any(${fixtures.users})`;
    if (fixtures.restaurants.length) await tx`delete from restaurant where id = any(${fixtures.restaurants})`;
    if (fixtures.customers.length) await tx`delete from customer where id = any(${fixtures.customers})`;
  });
}
