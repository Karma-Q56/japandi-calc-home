// @vitest-environment node
// Real database tests for the server side of the spin wheel (D12d): the same functions the owner and guest screens
// call (load, save, test, guest state, spin, and the till hook), run over the app_user role. Skips on a laptop unless
// both database addresses are set.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "../../server/auth-viewer";
import { blankPrize, type WheelPrizeInput, type WheelSettingsInput } from "../../lib/live-wheel";
import {
  appUrl,
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  makeGuest,
  makeMembership,
  makeRestaurant,
  newFixtures,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

// Same shim as the other real-database tests: the app's withContext uses the Neon driver, which CI
// Postgres does not serve, so run the same steps over postgres-js.
vi.mock("../../server/db", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { sql } = await import("drizzle-orm");
  const pg = (await import("postgres")).default;
  return {
    withContext: async (
      context: { databaseUrl: string; restaurantId?: string | null; customerId?: string | null; isOperator?: boolean },
      callback: (transaction: unknown) => Promise<unknown>,
    ) => {
      const client = pg(context.databaseUrl, { max: 1, prepare: false });
      try {
        const database = drizzle(client);
        return await database.transaction(async (transaction) => {
          await transaction.execute(sql`
            select
              set_config('app.restaurant_id', ${context.restaurantId ?? ""}, true),
              set_config('app.customer_id', ${context.customerId ?? ""}, true),
              set_config('app.is_operator', ${context.isOperator ? "true" : "false"}, true)
          `);
          const shaped = {
            execute: async (query: unknown) => ({ rows: await transaction.execute(query as never) }),
          };
          return callback(shaped as never);
        });
      } finally {
        await client.end();
      }
    },
  };
});

const prize = (label: string, overrides: Partial<WheelPrizeInput> = {}): WheelPrizeInput => ({
  ...blankPrize(),
  label,
  ...overrides,
});

const wheel = (overrides: Partial<WheelSettingsInput> = {}): WheelSettingsInput => ({
  enabled: true,
  mode: "earned",
  earnEvery: 2,
  floorCents: 0,
  prizes: [prize("Free coffee")],
  ...overrides,
});

describe.skipIf(!dbTestsEnabled)("live spin wheel server functions (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();
  const limitKeys: string[] = [];
  const savedEnv = { DATABASE_URL: process.env["DATABASE_URL"] };

  beforeAll(() => {
    db = connect();
    process.env["DATABASE_URL"] = appUrl;
  });
  afterAll(async () => {
    if (limitKeys.length) await db.owner`delete from rate_limit_hit where key = any(${limitKeys})`;
    await cleanup(db.owner, fixtures);
    await db.close();
    process.env["DATABASE_URL"] = savedEnv.DATABASE_URL;
  });

  async function owned(role: Viewer["role"] = "owner") {
    const { id, slug } = await makeRestaurant(db.owner, fixtures, { name: "Wheel Cafe", status: "active" });
    const userId = await makeAppUser(db.owner, fixtures, {
      role: role === "operator" ? "operator" : role,
      restaurantId: id,
    });
    limitKeys.push(userId);
    const viewer: Viewer = {
      userId,
      email: `${userId}@test.invalid`,
      name: "Owner",
      role,
      restaurantId: id,
      customerId: null,
      needsPhone: false,
    };
    const guest = await makeGuest(db.owner, fixtures);
    limitKeys.push(guest.id);
    const membership = await makeMembership(db.owner, id, guest.id);
    return { id, slug, viewer, guest: guest.id, membership };
  }

  const stamp = async (restaurantId: string, membershipId: string) => {
    await db.owner`
      insert into stamp_event (restaurant_id, membership_id, idempotency_key, reason)
      values (${restaurantId}, ${membershipId}, ${`t-${randomUUID()}`}, 'visit')
    `;
  };

  it("loads calm defaults for a restaurant that never set up a wheel", async () => {
    const { loadOwnerWheel } = await import("../../server/live-wheel");
    const { viewer } = await owned();
    expect(await loadOwnerWheel(viewer)).toEqual({
      enabled: false,
      mode: "earned",
      earnEvery: 5,
      floorCents: 0,
      prizes: [],
    });
  });

  it("saves the wheel and loads the same prizes back, in order", async () => {
    const { saveOwnerWheel, loadOwnerWheel } = await import("../../server/live-wheel");
    const { viewer } = await owned();
    const input = wheel({
      earnEvery: 4,
      prizes: [
        prize("Free coffee", { weight: 5, valueCents: 3500, validDays: 30 }),
        prize("10% off", { type: "percent_off", percentOff: 10, weight: 3, valueCents: 1000 }),
        prize("R20 off", { type: "amount_off", amountOffCents: 2000, weight: 2 }),
        prize("2 stamps", { type: "stamps", stamps: 2, weight: 1 }),
        prize("Try again", { type: "nothing", weight: 4, valueCents: 999, validDays: 9 }),
      ],
    });
    expect(await saveOwnerWheel(viewer, input)).toEqual({ ok: true });
    const loaded = await loadOwnerWheel(viewer);
    expect(loaded?.earnEvery).toBe(4);
    expect(loaded?.prizes.map((p) => p.label)).toEqual(["Free coffee", "10% off", "R20 off", "2 stamps", "Try again"]);
    expect(loaded?.prizes[0]).toMatchObject({ type: "free_item", weight: 5, valueCents: 3500, validDays: 30 });
    expect(loaded?.prizes[1]).toMatchObject({ type: "percent_off", percentOff: 10, amountOffCents: null });
    // A rand off prize is worth at least what it takes off.
    expect(loaded?.prizes[2]).toMatchObject({ type: "amount_off", amountOffCents: 2000, valueCents: 2000 });
    expect(loaded?.prizes[3]).toMatchObject({ type: "stamps", stamps: 2, validDays: null });
    // A try again prize carries no worth and no expiry, whatever the browser sent.
    expect(loaded?.prizes[4]).toMatchObject({ type: "nothing", valueCents: 0, validDays: null });
  });

  it("gives a plain message for a wheel that cannot be saved and never reaches the database", async () => {
    const { saveOwnerWheel, loadOwnerWheel } = await import("../../server/live-wheel");
    const { viewer } = await owned();
    const empty = await saveOwnerWheel(viewer, wheel({ prizes: [] }));
    expect(empty).toEqual({
      ok: false,
      message: "Add at least one real prize with a chance above 0 before you switch the wheel on.",
    });
    const nine = await saveOwnerWheel(viewer, wheel({ prizes: Array.from({ length: 9 }, (_, i) => prize(`P${i}`)) }));
    expect(nine).toEqual({ ok: false, message: "A wheel can have up to 8 prizes." });
    expect((await loadOwnerWheel(viewer))?.prizes).toEqual([]);
  });

  it("refuses signed-out visitors, guests and staff without a restaurant", async () => {
    const { saveOwnerWheel, loadOwnerWheel, testOwnerWheel } = await import("../../server/live-wheel");
    const { viewer } = await owned();
    for (const bad of [null, { ...viewer, role: "guest" as const }, { ...viewer, restaurantId: null }]) {
      expect(await saveOwnerWheel(bad, wheel())).toEqual({ ok: false, message: "You can't change this wheel." });
      expect(await testOwnerWheel(bad)).toEqual({ ok: false, message: "You can't change this wheel." });
      expect(await loadOwnerWheel(bad)).toBeNull();
    }
  });

  it("lets an owner see and change only their own restaurant's wheel", async () => {
    const { saveOwnerWheel, loadOwnerWheel } = await import("../../server/live-wheel");
    const a = await owned();
    const b = await owned();
    await saveOwnerWheel(a.viewer, wheel({ prizes: [prize("A prize")] }));
    await saveOwnerWheel(b.viewer, wheel({ prizes: [prize("B prize")] }));
    expect((await loadOwnerWheel(a.viewer))?.prizes.map((p) => p.label)).toEqual(["A prize"]);
    expect((await loadOwnerWheel(b.viewer))?.prizes.map((p) => p.label)).toEqual(["B prize"]);
    // A viewer who claims another restaurant's id still only gets the user's own restaurant, because the id comes from
    // the signed-in user's record in SQL, not from the browser.
    const sneaky: Viewer = { ...a.viewer, restaurantId: b.id };
    expect(await saveOwnerWheel(sneaky, wheel({ prizes: [prize("Hijack")] }))).toEqual({ ok: true });
    expect((await loadOwnerWheel(b.viewer))?.prizes.map((p) => p.label)).toEqual(["B prize"]);
    expect((await loadOwnerWheel(a.viewer))?.prizes.map((p) => p.label)).toEqual(["Hijack"]);
  });

  it("tests the wheel without using a spin or making a reward", async () => {
    const { saveOwnerWheel, testOwnerWheel } = await import("../../server/live-wheel");
    const r = await owned();
    await saveOwnerWheel(r.viewer, wheel({ prizes: [prize("Free coffee")] }));
    await db.owner`insert into spin_credit (membership_id, restaurant_id, earned) values (${r.membership}, ${r.id}, 1)`;
    expect(await testOwnerWheel(r.viewer)).toEqual({ ok: true, prizeLabel: "Free coffee", prizeType: "free_item" });
    const [credit] = await db.owner`select earned, used from spin_credit where membership_id = ${r.membership}`;
    expect(credit).toMatchObject({ earned: 1, used: 0 });
    const [rewards] = await db.owner`select count(*)::int as n from reward where restaurant_id = ${r.id}`;
    expect(rewards!["n"]).toBe(0);
    const [results] = await db.owner`select count(*)::int as n from spin_result where restaurant_id = ${r.id}`;
    expect(results!["n"]).toBe(0);
  });

  it("says plainly when there is nothing to test", async () => {
    const { testOwnerWheel } = await import("../../server/live-wheel");
    const { viewer } = await owned();
    const result = await testOwnerWheel(viewer);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/no prize/i);
  });

  it("shows a guest their own spin state without the weights", async () => {
    const { saveOwnerWheel, loadGuestSpin } = await import("../../server/live-wheel");
    const r = await owned();
    await saveOwnerWheel(r.viewer, wheel({ prizes: [prize("Free coffee", { weight: 9 }), prize("Try again", { type: "nothing" })] }));
    await db.owner`insert into spin_credit (membership_id, restaurant_id, earned, visits_toward) values (${r.membership}, ${r.id}, 2, 1)`;
    const state = await loadGuestSpin(r.guest, r.membership);
    expect(state).toMatchObject({ enabled: true, mode: "earned", available: 2, visitsToNext: 1, earnEvery: 2 });
    expect(state?.prizes.map((p) => p.label)).toEqual(["Free coffee", "Try again"]);
    expect(JSON.stringify(state)).not.toMatch(/weight/i);
  });

  it("shows nothing about another guest's card", async () => {
    const { saveOwnerWheel, loadGuestSpin } = await import("../../server/live-wheel");
    const a = await owned();
    const b = await owned();
    await saveOwnerWheel(a.viewer, wheel());
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await loadGuestSpin(b.guest, a.membership)).toBeNull();
    } finally {
      quiet.mockRestore();
    }
  });

  it("saves and loads a weekly limit with how many wins count against it, and drops a limit on a try again slot", async () => {
    const { saveOwnerWheel, loadOwnerWheel, guestSpin } = await import("../../server/live-wheel");
    const r = await owned();
    const saved = await saveOwnerWheel(
      r.viewer,
      wheel({ prizes: [prize("Free coffee", { weeklyCap: 3 }), prize("Try again", { type: "nothing", weeklyCap: 4 })] }),
    );
    expect(saved).toEqual({ ok: true });
    await db.owner`insert into spin_credit (membership_id, restaurant_id, earned) values (${r.membership}, ${r.id}, 5)`;
    await db.owner`update spin_prize set weight = 0 where restaurant_id = ${r.id} and prize_type = 'nothing'`;
    expect((await guestSpin(r.guest, r.membership, randomUUID())).ok).toBe(true);
    const loaded = await loadOwnerWheel(r.viewer);
    expect(loaded?.prizes.map((p) => [p.label, p.weeklyCap, p.wonThisWeek])).toEqual([
      ["Free coffee", 3, 1],
      ["Try again", null, 0],
    ]);
  });

  it("tells the guest the wheel is resting, keeps their spin, and tells the owner why a test spin is refused", async () => {
    const { saveOwnerWheel, guestSpin, loadGuestSpin, testOwnerWheel } = await import("../../server/live-wheel");
    const r = await owned();
    await saveOwnerWheel(r.viewer, wheel({ prizes: [prize("Free coffee", { weeklyCap: 1 })] }));
    await db.owner`insert into spin_credit (membership_id, restaurant_id, earned) values (${r.membership}, ${r.id}, 3)`;
    expect((await guestSpin(r.guest, r.membership, randomUUID())).ok).toBe(true);
    const resting = await guestSpin(r.guest, r.membership, randomUUID());
    expect(resting).toEqual({ ok: false, message: "The wheel is resting right now. Your spin is saved, so please try again soon." });
    expect(await loadGuestSpin(r.guest, r.membership)).toMatchObject({ paused: true, available: 2 });
    const test = await testOwnerWheel(r.viewer);
    expect(test.ok === false && test.message).toMatch(/weekly limit/);
    const [credit] = await db.owner`select earned, used from spin_credit where membership_id = ${r.membership}`;
    expect(credit).toMatchObject({ earned: 3, used: 1 });
  });

  it("spins end to end: draws, pays, repeats safely, and runs out", async () => {
    const { saveOwnerWheel, guestSpin, loadGuestSpin } = await import("../../server/live-wheel");
    const r = await owned();
    await saveOwnerWheel(r.viewer, wheel({ prizes: [prize("Free coffee", { validDays: 7 })] }));
    await db.owner`insert into spin_credit (membership_id, restaurant_id, earned) values (${r.membership}, ${r.id}, 1)`;
    const spinId = randomUUID();
    const first = await guestSpin(r.guest, r.membership, spinId);
    expect(first).toMatchObject({ ok: true, repeat: false, label: "Free coffee", prizeType: "free_item", keptAdvertised: false });
    const again = await guestSpin(r.guest, r.membership, spinId);
    expect(again).toMatchObject({ ok: true, repeat: true, label: "Free coffee" });
    expect(first.ok && again.ok && again.prizeId === first.prizeId).toBe(true);
    expect(await guestSpin(r.guest, r.membership, randomUUID())).toEqual({
      ok: false,
      message: "You have no spin to use right now.",
    });
    const [rewards] = await db.owner`select count(*)::int as n from reward where membership_id = ${r.membership} and source = 'spin'`;
    expect(rewards!["n"]).toBe(1);
    expect((await loadGuestSpin(r.guest, r.membership))?.available).toBe(0);
  });

  it("refuses to spin another guest's card with a plain message", async () => {
    const { saveOwnerWheel, guestSpin } = await import("../../server/live-wheel");
    const a = await owned();
    const b = await owned();
    await saveOwnerWheel(a.viewer, wheel());
    await db.owner`insert into spin_credit (membership_id, restaurant_id, earned) values (${a.membership}, ${a.id}, 3)`;
    expect(await guestSpin(b.guest, a.membership, randomUUID())).toEqual({
      ok: false,
      message: "Sign in to your own card to spin.",
    });
    expect((await db.owner`select used from spin_credit where membership_id = ${a.membership}`)[0]!["used"]).toBe(0);
  });

  it("slows down a guest who tries too many times in an hour, even when every try was refused", async () => {
    const { saveOwnerWheel, guestSpin } = await import("../../server/live-wheel");
    const r = await owned();
    await saveOwnerWheel(r.viewer, wheel());
    await db.owner`
      insert into rate_limit_hit (bucket, key) select 'guest-spin', ${r.guest} from generate_series(1, 40)
    `;
    const result = await guestSpin(r.guest, r.membership, randomUUID());
    expect(result).toEqual({
      ok: false,
      message: "That is a lot of tries in a short time. Please wait a little and try again.",
    });
  });

  it("counts a recorded visit towards the next earned spin through the till hook", async () => {
    const { saveOwnerWheel, applyWheelHook } = await import("../../server/live-wheel");
    const r = await owned();
    await saveOwnerWheel(r.viewer, wheel({ earnEvery: 2 }));
    await stamp(r.id, r.membership);
    await applyWheelHook(r.id, r.membership);
    expect((await db.owner`select earned, visits_toward from spin_credit where membership_id = ${r.membership}`)[0]).toMatchObject({
      earned: 0,
      visits_toward: 1,
    });
    // Running the hook again for the same visit does not count it twice.
    await applyWheelHook(r.id, r.membership);
    expect((await db.owner`select visits_toward from spin_credit where membership_id = ${r.membership}`)[0]!["visits_toward"]).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await stamp(r.id, r.membership);
    await applyWheelHook(r.id, r.membership);
    expect((await db.owner`select earned, visits_toward from spin_credit where membership_id = ${r.membership}`)[0]).toMatchObject({
      earned: 1,
      visits_toward: 0,
    });
  });

  it("does nothing at the till when a guest has no visit stamp yet", async () => {
    const { saveOwnerWheel, applyWheelHook } = await import("../../server/live-wheel");
    const r = await owned();
    await saveOwnerWheel(r.viewer, wheel({ earnEvery: 1 }));
    await applyWheelHook(r.id, r.membership);
    expect((await db.owner`select count(*)::int as n from spin_credit where membership_id = ${r.membership}`)[0]!["n"]).toBe(0);
  });
});
