// @vitest-environment node
// Real-database checks for the live Insights page (D14). Skipped unless
// DATABASE_URL_MIGRATE and DATABASE_URL_TEST are set. Never point these at production.
// Dates are fixed, so the checks do not depend on the day they run.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cleanup,
  connect,
  dbTestsEnabled,
  makeGuest,
  makeMembership,
  makeRestaurant,
  newFixtures,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";
import type { Viewer } from "@/server/auth-viewer";

const originalUrl = process.env["DATABASE_URL"];

describe.skipIf(!dbTestsEnabled)("live insights (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();
  let restaurantA: string;
  let restaurantB: string;
  let membershipA: string;
  let membershipB: string;
  let loadInsights: typeof import("@/server/live-insights").loadInsights;
  let buildInsightsCsv: typeof import("@/server/live-insights").buildInsightsCsv;

  const ownerOf = (restaurantId: string): Viewer => ({
    userId: "t-owner",
    email: "owner@example.test",
    name: "Owner",
    role: "owner",
    restaurantId,
    customerId: null,
    needsPhone: false,
  });

  beforeAll(async () => {
    process.env["DATABASE_URL"] = process.env["DATABASE_URL_TEST"];
    ({ loadInsights, buildInsightsCsv } = await import("@/server/live-insights"));
    db = connect();
    restaurantA = (await makeRestaurant(db.owner, fixtures, { status: "active" })).id;
    restaurantB = (await makeRestaurant(db.owner, fixtures, { status: "active" })).id;
    const guestA = await makeGuest(db.owner, fixtures);
    membershipA = await makeMembership(db.owner, restaurantA, guestA.id);
    const guestB = await makeGuest(db.owner, fixtures);
    membershipB = await makeMembership(db.owner, restaurantB, guestB.id);
  });

  beforeEach(async () => {
    await db.owner`delete from stamp_event where restaurant_id in (${restaurantA}, ${restaurantB})`;
  });

  afterAll(async () => {
    process.env["DATABASE_URL"] = originalUrl;
    if (db) {
      await cleanup(db.owner, fixtures);
      await db.close();
    }
  });

  it("counts visits per day for the restaurant only", async () => {
    await db.owner`
      insert into stamp_event (restaurant_id, membership_id, idempotency_key, created_at)
      values
        (${restaurantA}, ${membershipA}, ${`k-${crypto.randomUUID()}`}, '2026-11-03T10:00:00+02:00'),
        (${restaurantA}, ${membershipA}, ${`k-${crypto.randomUUID()}`}, '2026-11-03T18:00:00+02:00'),
        (${restaurantB}, ${membershipB}, ${`k-${crypto.randomUUID()}`}, '2026-11-03T12:00:00+02:00')
    `;
    const result = await loadInsights(ownerOf(restaurantA), "2026-11-01", "2026-11-07");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.performance.visits).toBe(2);
    expect(result.performance.dailyVisits).toEqual([{ day: "2026-11-03", count: 2 }]);
  });

  it("returns zero data without errors when the range is empty", async () => {
    const result = await loadInsights(ownerOf(restaurantA), "2026-11-01", "2026-11-07");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.performance.visits).toBe(0);
    expect(result.performance.dailyVisits).toEqual([]);
    expect(result.guests.newGuests).toBe(0);
  });

  it("refuses a range longer than 400 days", async () => {
    const result = await loadInsights(ownerOf(restaurantA), "2024-01-01", "2026-11-07");
    expect(result.ok).toBe(false);
  });

  it("includes both edge days of the range", async () => {
    await db.owner`
      insert into stamp_event (restaurant_id, membership_id, idempotency_key, created_at)
      values
        (${restaurantA}, ${membershipA}, ${`k-${crypto.randomUUID()}`}, '2026-11-01T09:00:00+02:00'),
        (${restaurantA}, ${membershipA}, ${`k-${crypto.randomUUID()}`}, '2026-11-07T20:00:00+02:00')
    `;
    const result = await loadInsights(ownerOf(restaurantA), "2026-11-01", "2026-11-07");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.performance.visits).toBe(2);
  });

  it("refuses a viewer who is a guest", async () => {
    const guest: Viewer = { ...ownerOf(restaurantA), role: "guest", restaurantId: null };
    const csv = await buildInsightsCsv(guest, "2026-11-01", "2026-11-07");
    expect(csv.ok).toBe(false);
  });

  it("builds a CSV with counts and dates only", async () => {
    await db.owner`
      insert into stamp_event (restaurant_id, membership_id, idempotency_key, created_at)
      values (${restaurantA}, ${membershipA}, ${`k-${crypto.randomUUID()}`}, '2026-11-05T09:00:00+02:00')
    `;
    const csv = await buildInsightsCsv(ownerOf(restaurantA), "2026-11-05", "2026-11-05");
    expect(csv.ok).toBe(true);
    if (!csv.ok) return;
    expect(csv.csv.split("\r\n")[0]).toBe("date,visits,new_guests");
    expect(csv.csv).toContain("2026-11-05,1,");
    expect(csv.csv).not.toMatch(/Test guest|\+27/);
  });
});
