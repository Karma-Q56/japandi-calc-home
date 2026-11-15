// @vitest-environment node
// Real database tests for migration 0035 (the spin wheel weekly prize limit). A prize can be won only so many times
// in any 7 days. A prize at its limit leaves the wheel, and when every real prize is at its limit the wheel stops:
// nothing is used up, and the guest spins later. The limit counts wins, never money. Runs on GitHub for every push.
// Skips on a laptop unless both database addresses are set.
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appUrl,
  asApp,
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
  type Sql,
} from "../db-fixture";

type Prize = Record<string, unknown>;

const prize = (label: string, weight: number, type = "free_item", extra: Prize = {}): Prize => ({
  label,
  weight,
  type,
  ...extra,
});

type WheelOptions = {
  mode?: "join" | "earned" | "reward_decider";
  floorCents?: number;
  prizes?: Prize[];
};

describe.skipIf(!dbTestsEnabled)("spin wheel weekly limits (real database, as app_user)", () => {
  let db: DbConnections;
  let pool: Sql;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
    pool = postgres(appUrl!, { max: 4, prepare: false });
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await pool.end({ timeout: 5 });
    await db.close();
  });

  const saveWheel = (user: string, options: WheelOptions = {}) => {
    const o = { mode: "earned" as const, floorCents: 0, prizes: [prize("Free coffee", 1, "free_item", { weeklyCap: 2 })], ...options };
    return asApp(
      db.app,
      {},
      (tx) =>
        tx`select save_spin_wheel(${user}, true::boolean, ${o.mode}, 3::integer,
          ${o.floorCents}::integer, ${JSON.stringify(o.prizes)}::text::jsonb)`,
      { rollback: false },
    );
  };

  async function setup(options: WheelOptions = {}) {
    const { id } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await db.owner`update restaurant set reward_description = 'Free coffee' where id = ${id}`;
    const owner = await makeAppUser(db.owner, fixtures, { role: "owner", restaurantId: id });
    await saveWheel(owner, options);
    return { id, owner };
  }

  /** One more guest with a card at the restaurant and some earned spins. */
  async function addGuest(restaurantId: string, spins = 5) {
    const guest = await makeGuest(db.owner, fixtures);
    const membership = await makeMembership(db.owner, restaurantId, guest.id);
    if (spins > 0) {
      await db.owner`
        insert into spin_credit (membership_id, restaurant_id, earned, used) values (${membership}, ${restaurantId}, ${spins}, 0)
      `;
    }
    return { guest: guest.id, membership };
  }

  const spin = (guestId: string, membershipId: string, run: Sql = db.app) =>
    asApp(
      run,
      { customerId: guestId },
      async (tx) => {
        const rows = await tx`select * from spin_wheel(${membershipId}::uuid, ${randomUUID()}::uuid)`;
        return rows[0]!;
      },
      { rollback: false },
    );

  const state = (guestId: string, membershipId: string) =>
    asApp(db.app, { customerId: guestId }, async (tx) => {
      const [row] = await tx`select spin_state_for_guest(${membershipId}::uuid) as s`;
      return row!["s"] as Record<string, unknown>;
    });

  const testSpin = (user: string) =>
    asApp(db.app, {}, (tx) => tx`select * from test_spin_wheel(${user})`, { rollback: false });

  const refusal = (code: string) => expect.objectContaining({ message: code });

  const spinsUsed = async (membershipId: string) => {
    const [row] = await db.owner`select used from spin_credit where membership_id = ${membershipId}`;
    return row!["used"] as number;
  };

  const winsRecorded = async (restaurantId: string) => {
    const [row] = await db.owner`select count(*)::int as n from spin_result where restaurant_id = ${restaurantId}`;
    return row!["n"] as number;
  };

  const ageWins = (restaurantId: string, days: number) =>
    db.owner`update spin_result set won_at = now() - make_interval(days => ${days}::integer) where restaurant_id = ${restaurantId}`;

  describe("a prize at its weekly limit", () => {
    it("is won up to its limit and then the wheel stops without using up the spin", async () => {
      const r = await setup();
      const g = await addGuest(r.id, 5);
      expect((await spin(g.guest, g.membership))["out_label"]).toBe("Free coffee");
      expect((await spin(g.guest, g.membership))["out_label"]).toBe("Free coffee");
      await expect(spin(g.guest, g.membership)).rejects.toEqual(refusal("prizes_gone"));
      expect(await spinsUsed(g.membership)).toBe(2);
      expect(await winsRecorded(r.id)).toBe(2);
    });

    it("shows the guest a paused wheel and keeps the spins they have earned", async () => {
      const r = await setup();
      const g = await addGuest(r.id, 4);
      const before = await state(g.guest, g.membership);
      expect(before["paused"]).toBe(false);
      expect(before["available"]).toBe(4);
      await spin(g.guest, g.membership);
      await spin(g.guest, g.membership);
      const after = await state(g.guest, g.membership);
      // The spins are still counted, but the wheel will not turn.
      expect(after["paused"]).toBe(true);
      expect(after["available"]).toBe(2);
      expect(after["enabled"]).toBe(true);
      // The guest never sees the limit itself.
      expect(JSON.stringify(after)).not.toMatch(/weeklyCap|weekly_cap/);
      // A win more than 7 days old no longer counts: the wheel is back and the spins are still there.
      await ageWins(r.id, 8);
      const later = await state(g.guest, g.membership);
      expect(later["paused"]).toBe(false);
      expect(later["available"]).toBe(2);
      expect((await spin(g.guest, g.membership))["out_label"]).toBe("Free coffee");
    });

    it("counts wins from every guest of the restaurant together", async () => {
      const r = await setup();
      const a = await addGuest(r.id, 3);
      const b = await addGuest(r.id, 3);
      await spin(a.guest, a.membership);
      await spin(b.guest, b.membership);
      await expect(spin(a.guest, a.membership)).rejects.toEqual(refusal("prizes_gone"));
      await expect(spin(b.guest, b.membership)).rejects.toEqual(refusal("prizes_gone"));
    });

    it("does not count another restaurant's wins", async () => {
      const a = await setup();
      const b = await setup();
      const ga = await addGuest(a.id, 3);
      const gb = await addGuest(b.id, 3);
      await spin(ga.guest, ga.membership);
      await spin(ga.guest, ga.membership);
      await expect(spin(ga.guest, ga.membership)).rejects.toEqual(refusal("prizes_gone"));
      expect((await spin(gb.guest, gb.membership))["out_label"]).toBe("Free coffee");
    });

    it("never lets two guests spinning at the same moment both take the last win", async () => {
      const r = await setup({ prizes: [prize("Free coffee", 1, "free_item", { weeklyCap: 1 })] });
      const guests = await Promise.all([addGuest(r.id, 2), addGuest(r.id, 2), addGuest(r.id, 2), addGuest(r.id, 2)]);
      const outcomes = await Promise.allSettled(guests.map((g) => spin(g.guest, g.membership, pool)));
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      for (const o of outcomes.filter((o) => o.status === "rejected")) {
        expect((o as PromiseRejectedResult).reason).toEqual(refusal("prizes_gone"));
      }
      expect(await winsRecorded(r.id)).toBe(1);
    });
  });

  describe("other prizes and try again slots", () => {
    it("keeps drawing the prizes that are still open", async () => {
      const r = await setup({
        prizes: [prize("Free coffee", 50, "free_item", { weeklyCap: 1 }), prize("10% off", 1, "percent_off", { percentOff: 10 })],
      });
      const g = await addGuest(r.id, 6);
      // Win the capped prize once by drawing until it comes up, then it must never come up again.
      let coffee = 0;
      for (let i = 0; i < 6 && coffee === 0; i += 1) {
        const result = await spin(g.guest, g.membership);
        if (result["out_label"] === "Free coffee") coffee += 1;
      }
      expect(coffee).toBe(1);
      const rows = await db.owner`
        select p.label, count(*)::int as n
        from (select spin_pick_prize(${r.id}::uuid, 'earned', 0) as id from generate_series(1, 200)) d
        join spin_prize p on p.id = d.id
        group by p.label
      `;
      expect(rows.map((row) => row["label"])).toEqual(["10% off"]);
    });

    it("stops the wheel when only a try again slot is left, instead of giving guests nothing", async () => {
      const r = await setup({
        prizes: [prize("Free coffee", 1, "free_item", { weeklyCap: 1 }), prize("Try again", 9, "nothing")],
      });
      const g = await addGuest(r.id, 30);
      // Keep spinning until the coffee is won (it is the only way to use the limit up).
      let won = false;
      for (let i = 0; i < 30 && !won; i += 1) {
        won = (await spin(g.guest, g.membership))["out_label"] === "Free coffee";
      }
      expect(won).toBe(true);
      const usedAfterWin = await spinsUsed(g.membership);
      await expect(spin(g.guest, g.membership)).rejects.toEqual(refusal("prizes_gone"));
      expect(await spinsUsed(g.membership)).toBe(usedAfterWin);
      expect((await state(g.guest, g.membership))["paused"]).toBe(true);
    });

    it("ignores a limit on a try again slot", async () => {
      const r = await setup({
        prizes: [prize("Free coffee", 1), prize("Try again", 1, "nothing", { weeklyCap: 1 })],
      });
      const rows = await db.owner`select label, weekly_cap from spin_prize where restaurant_id = ${r.id} order by position`;
      expect(rows.map((row) => row["weekly_cap"])).toEqual([null, null]);
    });
  });

  describe("the other kinds of wheel", () => {
    it("welcome spin: a paused wheel does not use up the guest's one spin", async () => {
      const r = await setup({
        mode: "join",
        prizes: [prize("Free coffee", 1, "free_item", { weeklyCap: 1 })],
      });
      const first = await addGuest(r.id, 0);
      const second = await addGuest(r.id, 0);
      expect((await state(second.guest, second.membership))["available"]).toBe(1);
      await spin(first.guest, first.membership);
      await expect(spin(second.guest, second.membership)).rejects.toEqual(refusal("prizes_gone"));
      const paused = await state(second.guest, second.membership);
      expect(paused["paused"]).toBe(true);
      expect(paused["available"]).toBe(1);
      await ageWins(r.id, 8);
      const back = await state(second.guest, second.membership);
      expect(back["paused"]).toBe(false);
      expect(back["available"]).toBe(1);
      expect((await spin(second.guest, second.membership))["out_label"]).toBe("Free coffee");
    });

    it("reward decider: a paused wheel leaves the guest's earned reward as it is", async () => {
      const r = await setup({
        mode: "reward_decider",
        floorCents: 1000,
        prizes: [prize("Big dessert", 1, "free_item", { valueCents: 5000, weeklyCap: 1 })],
      });
      const winner = await addGuest(r.id, 0);
      const waiting = await addGuest(r.id, 0);
      for (const g of [winner, waiting]) {
        await db.owner`
          insert into reward (restaurant_id, membership_id, description, kind, source, status)
          values (${r.id}, ${g.membership}, 'Free coffee', 'free_item', 'stamp_card', 'available'::reward_status)
        `;
      }
      expect((await spin(winner.guest, winner.membership))["out_label"]).toBe("Big dessert");
      await expect(spin(waiting.guest, waiting.membership)).rejects.toEqual(refusal("prizes_gone"));
      const [row] = await db.owner`
        select description, source::text as source from reward where membership_id = ${waiting.membership}
      `;
      expect(row).toMatchObject({ description: "Free coffee", source: "stamp_card" });
      const [results] = await db.owner`select count(*)::int as n from spin_result where membership_id = ${waiting.membership}`;
      expect(results!["n"]).toBe(0);
      expect((await state(waiting.guest, waiting.membership))["paused"]).toBe(true);
    });

    it("reward decider: when nothing beats the earned reward the guest still keeps it, with or without limits", async () => {
      const r = await setup({
        mode: "reward_decider",
        floorCents: 50,
        prizes: [prize("Small treat", 1, "free_item", { valueCents: 100, weeklyCap: 1 })],
      });
      // The owner later raises the smallest value above the prize, so nothing on the wheel beats the earned reward.
      await db.owner`update spin_config set reward_floor_cents = 9000 where restaurant_id = ${r.id}`;
      const g = await addGuest(r.id, 0);
      await db.owner`
        insert into reward (restaurant_id, membership_id, description, kind, source, status)
        values (${r.id}, ${g.membership}, 'Free coffee', 'free_item', 'stamp_card', 'available'::reward_status)
      `;
      // The only prize is worth less than the smallest value, so it is not in the pool: no limit is involved.
      const result = await spin(g.guest, g.membership);
      expect(result["out_kept_advertised"]).toBe(true);
    });

    it("the owner's test spin says so when every prize is at its limit", async () => {
      const r = await setup({ prizes: [prize("Free coffee", 1, "free_item", { weeklyCap: 1 })] });
      const g = await addGuest(r.id, 2);
      expect((await testSpin(r.owner))[0]!["out_label"]).toBe("Free coffee");
      await spin(g.guest, g.membership);
      await expect(testSpin(r.owner)).rejects.toEqual(refusal("prizes_gone"));
    });
  });

  describe("saving the wheel", () => {
    it("stores the limit, and a plain prize has none", async () => {
      const r = await setup({
        prizes: [prize("Free coffee", 1, "free_item", { weeklyCap: 5 }), prize("Two stamps", 1, "stamps", { stamps: 2 })],
      });
      const rows = await db.owner`select label, weekly_cap from spin_prize where restaurant_id = ${r.id} order by position`;
      expect(rows.map((row) => row["weekly_cap"])).toEqual([5, null]);
    });

    it("keeps the wins counted against a limit when the owner edits the wheel", async () => {
      const r = await setup();
      const g = await addGuest(r.id, 5);
      await spin(g.guest, g.membership);
      await spin(g.guest, g.membership);
      // Rename the prize and save: the two wins still count, so the wheel stays stopped.
      await saveWheel(r.owner, { prizes: [prize("Free flat white", 1, "free_item", { weeklyCap: 2 })] });
      await expect(spin(g.guest, g.membership)).rejects.toEqual(refusal("prizes_gone"));
      // Raising the limit opens the wheel again.
      await saveWheel(r.owner, { prizes: [prize("Free flat white", 1, "free_item", { weeklyCap: 3 })] });
      expect((await spin(g.guest, g.membership))["out_label"]).toBe("Free flat white");
    });

    it("removes the prizes that are no longer on the wheel", async () => {
      const r = await setup({ prizes: [prize("A", 1), prize("B", 1), prize("C", 1)] });
      await saveWheel(r.owner, { prizes: [prize("Only", 1, "free_item", { weeklyCap: 4 })] });
      const rows = await db.owner`select label, weekly_cap from spin_prize where restaurant_id = ${r.id}`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ label: "Only", weekly_cap: 4 });
    });

    it("refuses a limit that is not a whole number from 1 to 10 000", async () => {
      const r = await setup();
      for (const bad of [0, -1, 10001, 1.5, "abc", "7; drop table spin_prize"]) {
        await expect(
          saveWheel(r.owner, { prizes: [prize("Free coffee", 1, "free_item", { weeklyCap: bad })] }),
        ).rejects.toEqual(refusal("invalid_value"));
      }
      // A refused save changes nothing.
      const rows = await db.owner`select weekly_cap from spin_prize where restaurant_id = ${r.id}`;
      expect(rows.map((row) => row["weekly_cap"])).toEqual([2]);
    });

    it("an empty limit means no limit", async () => {
      const r = await setup({ prizes: [prize("Free coffee", 1, "free_item", { weeklyCap: null })] });
      const g = await addGuest(r.id, 6);
      for (let i = 0; i < 6; i += 1) await spin(g.guest, g.membership);
      expect(await winsRecorded(r.id)).toBe(6);
    });
  });

  describe("permissions", () => {
    it("the app role cannot call the limit helpers or write the limit directly", async () => {
      const r = await setup();
      await expect(
        asApp(db.app, { restaurantId: r.id }, (tx) => tx`select spin_prize_capped(gen_random_uuid())`, { rollback: false }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asApp(db.app, { restaurantId: r.id }, (tx) => tx`select * from spin_real_counts(${r.id}::uuid, 'earned', 0)`, {
          rollback: false,
        }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asApp(db.app, { restaurantId: r.id }, (tx) => tx`update spin_prize set weekly_cap = 9999 where restaurant_id = ${r.id}`, {
          rollback: false,
        }),
      ).rejects.toThrow(/permission denied|row-level security/);
    });
  });
});
