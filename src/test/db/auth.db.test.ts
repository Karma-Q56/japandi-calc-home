// @vitest-environment node
// Real-database checks for signing up and signing in with the rate limiter switched on
// (migration 0040). Skipped unless DATABASE_URL_MIGRATE and DATABASE_URL_TEST are set.
// Never point these at production.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "@/server/auth";
import * as schema from "@/server/auth-schema";
import { connect, dbTestsEnabled, type DbConnections } from "../db-fixture";

const BASE = "http://localhost:5173";

describe.skipIf(!dbTestsEnabled)("0040 sign-up and sign-in (real database)", () => {
  let db: DbConnections;
  let auth: ReturnType<typeof createAuth>;
  const email = `auth-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  // A made-up address per run, so the attempt counters belong to this run only.
  const part = () => Math.floor(Math.random() * 250) + 1;
  const ip = `10.${part()}.${part()}.${part()}`;

  const post = (path: string, body: unknown) =>
    auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, "cf-connecting-ip": ip },
        body: JSON.stringify(body),
      }),
    );

  beforeAll(() => {
    process.env["BETTER_AUTH_SECRET"] = `test-secret-${randomUUID()}`;
    process.env["BETTER_AUTH_URL"] = BASE;
    db = connect();
    auth = createAuth(drizzle(db.app, { schema }));
  });

  afterAll(async () => {
    if (!db) return;
    await db.owner`delete from "user" where email = ${email}`;
    await db.owner`delete from "rateLimit" where key like ${`%${ip}%`}`;
    await db.close();
  });

  it("creates an account and signs it in", async () => {
    const signUp = await post("/sign-up/email", {
      name: "Test Owner",
      email,
      password,
      phoneNumber: "0820000000",
    });
    expect(signUp.status).toBe(200);
    const signIn = await post("/sign-in/email", { email, password });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.email).toBe(email);
  });

  it("stores the attempt time as a number of milliseconds", async () => {
    const rows = await db.owner`
      select "lastRequest" from "rateLimit" where key like ${`%${ip}%`}
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Math.abs(Date.now() - Number(row["lastRequest"]))).toBeLessThan(60_000);
    }
  });

  it("refuses a wrong password, then blocks after too many tries", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      statuses.push((await post("/sign-in/email", { email, password: "wrong-password-1" })).status);
    }
    expect(statuses[0]).toBe(401);
    expect(statuses.at(-1)).toBe(429);
  });
});
