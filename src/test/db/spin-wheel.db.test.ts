// @vitest-environment node
// Real database tests for migration 0019 (D12d, the spin wheel): the owner's wheel settings, the server-side draw,
// the spins a guest has earned, the reward decider, and the checks that stop one guest or restaurant from touching
// another. Runs on GitHub for every push. Skips on a laptop unless both database addresses are set.
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
  enabled?: boolean;
  mode?: "join" | "earned" | "reward_decider";
  earnEvery?: number;
  floorCents?: number;
  prizes?: Prize[];
};

describe.skipIf(!dbTestsEnabled)("spin wheel (real database, as app_user)", () => {
  let db: DbConnections;
  // A pool with several connections, so two spins really run at the same moment.
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

  const saveWheel = (user: string, options: WheelOptions = {}, run: Sql = db.app) => {
    const o = {
      enabled: true,
      mode: "earned" as const,
      earnEvery: 3,
      floorCents: 0,
      prizes: [prize("Free coffee", 1)],
      ...options,
    };
    return asApp(
      run,
      {},
      (tx) =>
        tx`select save_spin_wheel(${user}, ${o.enabled}::boolean, ${o.mode}, ${o.earnEvery}::integer,
          ${o.floorCents}::integer, ${JSON.stringify(o.prizes)}::text::jsonb)`,
      { rollback: false },
    );
  };

  /** A live restaurant with an owner, one guest who is a member, and a saved wheel. */
  async function setup(options: WheelOptions = {}, skipWheel = false) {
    const { id, slug } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await db.owner`update restaurant set reward_description = 'Free coffee' where id = ${id}`;
    const owner = await makeAppUser(db.owner, fixtures, { role: "owner", restaurantId: id });
    const guest = await makeGuest(db.owner, fixtures);
    const membership = await makeMembership(db.owner, id, guest.id);
    if (!skipWheel) await saveWheel(owner, options);
    return { id, slug, owner, guest: guest.id, membership };
  }

  const giveSpins = (restaurantId: string, membershipId: string, earned: number, used = 0) =>
    db.owner`
      insert into spin_credit (membership_id, restaurant_id, earned, used) values (${membershipId}, ${restaurantId}, ${earned}, ${used})
      on conflict (membership_id) do update set earned = ${earned}, used = ${used}
    `;

  const spin = (guestId: string, membershipId: string, spinId: string = randomUUID(), run: Sql = db.app) =>
    asApp(
      run,
      { customerId: guestId },
      async (tx) => {
        const rows = await tx`select * from spin_wheel(${membershipId}::uuid, ${spinId}::uuid)`;
        return rows[0]!;
      },
      { rollback: false },
    );

  /** Draw many times in one query. The function is volatile, so it runs once per row and gives a fresh result each time. */
  const draws = async (restaurantId: string, mode: string, times: number) => {
    const rows = await db.owner`
      select p.label, count(*)::int as n
      from (select spin_pick_prize(${restaurantId}::uuid, ${mode}, 0) as id from generate_series(1, ${times}::integer)) d
      join spin_prize p on p.id = d.id
      group by p.label
    `;
    return Object.fromEntries(rows.map((row) => [row["label"] as string, row["n"] as number]));
  };

  const refusal = (code: string) => expect.objectContaining({ message: code });

  const count = async (table: string, column: string, value: string) => {
    const [row] = await db.owner`select count(*)::int as n from ${db.owner(table)} where ${db.owner(column)} = ${value}`;
    return row!["n"] as number;
  };

  // ------------------------------------------------------------------ save_spin_wheel
  describe("save_spin_wheel", () => {
    it("saves the settings and prizes for the owner's own restaurant and writes an audit line", async () => {
      const r = await setup({
        mode: "earned",
        earnEvery: 4,
        prizes: [prize("Free coffee", 2, "free_item", { validDays: 30 }), prize("Two stamps", 1, "stamps", { stamps: 2 })],
      });
      const rows = await asApp(db.app, { restaurantId: r.id }, async (tx) => ({
        config: await tx`select enabled, mode, earn_every_visits from spin_config where restaurant_id = ${r.id}`,
        prizes: await tx`select label, position, valid_days from spin_prize where restaurant_id = ${r.id} order by position`,
      }));
      expect(rows.config).toHaveLength(1);
      expect(rows.config[0]).toMatchObject({ enabled: true, mode: "earned", earn_every_visits: 4 });
      expect(rows.prizes.map((p) => p["label"])).toEqual(["Free coffee", "Two stamps"]);
      expect(rows.prizes[0]!["valid_days"]).toBe(30);
      expect(await count("audit_event", "restaurant_id", r.id)).toBeGreaterThanOrEqual(1);
      const [audit] = await db.owner`select count(*)::int as n from audit_event where restaurant_id = ${r.id} and action = 'spin_changed'`;
      expect(audit!["n"]).toBe(1);
    });

    it("replaces the old prizes when the owner saves again", async () => {
      const r = await setup({ prizes: [prize("A", 1), prize("B", 1), prize("C", 1)] });
      await saveWheel(r.owner, { prizes: [prize("Only one", 5)] });
      const rows = await db.owner`select label from spin_prize where restaurant_id = ${r.id}`;
      expect(rows.map((p) => p["label"])).toEqual(["Only one"]);
    });

    it("refuses a guest login, an unknown user and a guest tied to a restaurant", async () => {
      const r = await setup();
      const guestUser = await makeAppUser(db.owner, fixtures, { role: "guest" });
      await expect(saveWheel(guestUser)).rejects.toEqual(refusal("not_allowed"));
      await expect(saveWheel(`t-${randomUUID()}`)).rejects.toEqual(refusal("not_allowed"));
      const staff = await makeAppUser(db.owner, fixtures, { role: "guest", restaurantId: r.id });
      await expect(saveWheel(staff)).rejects.toEqual(refusal("not_allowed"));
    });

    it("lets an owner change only their own restaurant's wheel", async () => {
      const a = await setup({ prizes: [prize("A prize", 1)] });
      const b = await setup({ prizes: [prize("B prize", 1)] });
      await saveWheel(a.owner, { prizes: [prize("A new prize", 1)] });
      const bRows = await db.owner`select label from spin_prize where restaurant_id = ${b.id}`;
      expect(bRows.map((p) => p["label"])).toEqual(["B prize"]);
      // Restaurant A cannot read restaurant B's wheel through row level security either.
      const seen = await asApp(db.app, { restaurantId: a.id }, async (tx) => ({
        prizes: await tx`select id from spin_prize where restaurant_id = ${b.id}`,
        config: await tx`select restaurant_id from spin_config where restaurant_id = ${b.id}`,
      }));
      expect(seen.prizes).toHaveLength(0);
      expect(seen.config).toHaveLength(0);
    });

    it("allows 8 prizes and refuses a 9th", async () => {
      const eight = Array.from({ length: 8 }, (_, i) => prize(`Prize ${i + 1}`, 1));
      const r = await setup({ prizes: eight });
      expect(await count("spin_prize", "restaurant_id", r.id)).toBe(8);
      await expect(saveWheel(r.owner, { prizes: [...eight, prize("Ninth", 1)] })).rejects.toEqual(
        refusal("too_many_prizes"),
      );
      // The refused save changed nothing.
      expect(await count("spin_prize", "restaurant_id", r.id)).toBe(8);
    });

    it("refuses values that are not allowed", async () => {
      const r = await setup();
      const bad: Prize[] = [
        prize("", 1),
        prize("   ", 1),
        prize("x".repeat(41), 1),
        prize("Heavy", 1001),
        prize("Negative", -1),
        prize("Odd type", 1, "gold_bar"),
        prize("Percent zero", 1, "percent_off", { percentOff: 0 }),
        prize("Percent 101", 1, "percent_off", { percentOff: 101 }),
        prize("Percent missing", 1, "percent_off"),
        prize("Stamps six", 1, "stamps", { stamps: 6 }),
        prize("Stamps zero", 1, "stamps", { stamps: 0 }),
        prize("Stamps missing", 1, "stamps"),
        prize("Amount zero", 1, "amount_off", { amountOffCents: 0 }),
        prize("Amount missing", 1, "amount_off"),
        prize("Days too long", 1, "free_item", { validDays: 366 }),
        prize("Days zero", 1, "free_item", { validDays: 0 }),
        prize("Worth too much", 1, "free_item", { valueCents: 1_000_001 }),
        prize("Fraction", 1.5),
      ];
      for (const one of bad) {
        await expect(saveWheel(r.owner, { prizes: [prize("Good", 1), one] }), String(one["label"])).rejects.toEqual(
          refusal("invalid_value"),
        );
      }
      await expect(saveWheel(r.owner, { earnEvery: 0 })).rejects.toEqual(refusal("invalid_value"));
      await expect(saveWheel(r.owner, { earnEvery: 51 })).rejects.toEqual(refusal("invalid_value"));
      await expect(saveWheel(r.owner, { floorCents: -1 })).rejects.toEqual(refusal("invalid_value"));
      await expect(saveWheel(r.owner, { floorCents: 1_000_001 })).rejects.toEqual(refusal("invalid_value"));
      // Nothing from the refused saves stuck: the first good wheel is still there.
      const rows = await db.owner`select label from spin_prize where restaurant_id = ${r.id}`;
      expect(rows.map((p) => p["label"])).toEqual(["Free coffee"]);
    });

    it("will not switch the wheel on without a real prize that can be won", async () => {
      const r = await setup({ enabled: false, prizes: [] });
      await expect(saveWheel(r.owner, { enabled: true, prizes: [] })).rejects.toEqual(refusal("no_prizes"));
      await expect(saveWheel(r.owner, { enabled: true, prizes: [prize("Nothing", 5, "nothing")] })).rejects.toEqual(
        refusal("no_prizes"),
      );
      await expect(saveWheel(r.owner, { enabled: true, prizes: [prize("Off prize", 0)] })).rejects.toEqual(
        refusal("no_prizes"),
      );
      // A welcome spin always hands something over, so "nothing" cannot be the only prize.
      await expect(
        saveWheel(r.owner, { enabled: true, mode: "join", prizes: [prize("Nothing", 5, "nothing")] }),
      ).rejects.toEqual(refusal("no_prizes"));
      // The reward decider needs a reward worth at least the smallest value.
      await expect(
        saveWheel(r.owner, {
          enabled: true,
          mode: "reward_decider",
          floorCents: 1000,
          prizes: [prize("Cheap", 1, "free_item", { valueCents: 500 }), prize("Stamps", 1, "stamps", { stamps: 1 })],
        }),
      ).rejects.toEqual(refusal("no_prizes"));
      // Switched off, the same wheel can be saved while the owner is still working on it.
      await saveWheel(r.owner, { enabled: false, prizes: [prize("Nothing", 5, "nothing")] });
      const [cfg] = await db.owner`select enabled from spin_config where restaurant_id = ${r.id}`;
      expect(cfg!["enabled"]).toBe(false);
    });

    it("puts the caller's operator setting back", async () => {
      const r = await setup({ prizes: [prize("Free coffee", 1)] });
      const after = await asApp(db.app, {}, async (tx) => {
        await tx`select save_spin_wheel(${r.owner}, true::boolean, 'earned', 5::integer, 0::integer,
          ${JSON.stringify([prize("Free coffee", 1)])}::text::jsonb)`;
        const [row] = await tx`select current_setting('app.is_operator', true) as flag`;
        return row!["flag"];
      });
      expect(after).toBe("false");
    });
  });

  // ------------------------------------------------------------------ what the app role may and may not touch
  describe("permissions", () => {
    it("keeps the wheel tables read-only for the app role", async () => {
      const r = await setup();
      await giveSpins(r.id, r.membership, 1);
      const ctx = { restaurantId: r.id };
      await expect(
        asApp(db.app, ctx, (tx) => tx`insert into spin_prize (restaurant_id, position, label, weight, prize_type)
          values (${r.id}, 5, 'Sneaky', 1, 'free_item')`),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asApp(db.app, ctx, (tx) => tx`update spin_credit set earned = 99 where membership_id = ${r.membership}`),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asApp(db.app, ctx, (tx) => tx`update spin_config set enabled = false where restaurant_id = ${r.id}`),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asApp(db.app, ctx, (tx) => tx`insert into spin_result (restaurant_id, membership_id, segment_id, label)
          values (${r.id}, ${r.membership}, 'x', 'Free everything')`),
      ).rejects.toThrow(/permission denied/);
      await expect(asApp(db.app, ctx, (tx) => tx`delete from spin_result where restaurant_id = ${r.id}`)).rejects.toThrow(
        /permission denied/,
      );
    });

    it("does not let the app role call the helper functions", async () => {
      const r = await setup();
      await expect(asApp(db.app, {}, (tx) => tx`select spin_random()`)).rejects.toThrow(/permission denied/);
      await expect(
        asApp(db.app, {}, (tx) => tx`select spin_pick_prize(${r.id}::uuid, 'earned', 0)`),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asApp(db.app, {}, (tx) => tx`select spin_prize_eligible('free_item', 0, 'earned', 0)`),
      ).rejects.toThrow(/permission denied/);
    });

    it("refuses a used count above the earned count in the table itself", async () => {
      const r = await setup();
      await expect(giveSpins(r.id, r.membership, 1, 2)).rejects.toThrow(/check|violates/i);
    });
  });

  // ------------------------------------------------------------------ the draw
  describe("the weighted draw", () => {
    it("follows the weights over a large sample", async () => {
      const r = await setup({ prizes: [prize("Rare", 1), prize("Common", 3)] });
      const got = await draws(r.id, "earned", 4000);
      const share = Object.fromEntries(Object.entries(got).map(([label, n]) => [label, n / 4000]));
      // Expected 0.25 and 0.75. Seven standard deviations of room, so this does not flake.
      expect(share["Rare"]).toBeGreaterThan(0.2);
      expect(share["Rare"]).toBeLessThan(0.3);
      expect(share["Common"]).toBeGreaterThan(0.7);
    });

    it("always lands on a prize with all of the weight and never on one with weight 0", async () => {
      const r = await setup({ prizes: [prize("Never", 0), prize("Always", 7), prize("Also never", 0)] });
      expect(await draws(r.id, "earned", 300)).toEqual({ Always: 300 });
    });

    it("never draws a try again in a welcome spin", async () => {
      const r = await setup({
        mode: "join",
        prizes: [prize("Try again", 1000, "nothing"), prize("Free dessert", 1)],
      });
      expect(await draws(r.id, "join", 200)).toEqual({ "Free dessert": 200 });
    });

    it("returns nothing when there is nothing to win", async () => {
      const r = await setup({ enabled: false, prizes: [prize("Off", 0)] });
      const [row] = await db.owner`select spin_pick_prize(${r.id}::uuid, 'earned', 0) as id`;
      expect(row!["id"]).toBeNull();
    });
  });

  // ------------------------------------------------------------------ test_spin_wheel
  describe("test_spin_wheel", () => {
    it("draws from the saved wheel and writes nothing", async () => {
      const r = await setup({ prizes: [prize("Free coffee", 1)] });
      await giveSpins(r.id, r.membership, 2);
      const before = {
        results: await count("spin_result", "restaurant_id", r.id),
        rewards: await count("reward", "restaurant_id", r.id),
        credit: (await db.owner`select earned, used from spin_credit where membership_id = ${r.membership}`)[0],
      };
      const picked = await asApp(db.app, { restaurantId: r.id }, async (tx) => tx`select * from test_spin_wheel(${r.owner})`);
      expect(picked).toHaveLength(1);
      expect(picked[0]).toMatchObject({ out_label: "Free coffee", out_prize_type: "free_item" });
      expect(await count("spin_result", "restaurant_id", r.id)).toBe(before.results);
      expect(await count("reward", "restaurant_id", r.id)).toBe(before.rewards);
      expect((await db.owner`select earned, used from spin_credit where membership_id = ${r.membership}`)[0]).toEqual(
        before.credit,
      );
    });

    it("refuses a restaurant with no wheel, a guest login and an empty wheel", async () => {
      const bare = await setup({}, true);
      await expect(
        asApp(db.app, {}, (tx) => tx`select * from test_spin_wheel(${bare.owner})`),
      ).rejects.toEqual(refusal("no_prizes"));
      const guestUser = await makeAppUser(db.owner, fixtures, { role: "guest" });
      await expect(asApp(db.app, {}, (tx) => tx`select * from test_spin_wheel(${guestUser})`)).rejects.toEqual(
        refusal("not_allowed"),
      );
      const empty = await setup({ enabled: false, prizes: [prize("Off", 0)] });
      await expect(
        asApp(db.app, {}, (tx) => tx`select * from test_spin_wheel(${empty.owner})`),
      ).rejects.toEqual(refusal("no_prizes"));
    });
  });

  // ------------------------------------------------------------------ spin_wheel: earned
  describe("spin_wheel, earned spins", () => {
    it("uses up one earned spin and records what the server drew", async () => {
      const r = await setup({ prizes: [prize("Free coffee", 1, "free_item", { valueCents: 3000 })] });
      await giveSpins(r.id, r.membership, 2);
      const first = await spin(r.guest, r.membership);
      expect(first).toMatchObject({ out_status: "spun", out_label: "Free coffee", out_prize_type: "free_item" });
      const [credit] = await db.owner`select earned, used from spin_credit where membership_id = ${r.membership}`;
      expect(credit).toMatchObject({ earned: 2, used: 1 });
      const [saved] = await db.owner`select mode, prize_type, value_cents, label from spin_result where id = ${first["out_result_id"]}`;
      expect(saved).toMatchObject({ mode: "earned", prize_type: "free_item", value_cents: 3000, label: "Free coffee" });
      await spin(r.guest, r.membership);
      await expect(spin(r.guest, r.membership)).rejects.toEqual(refusal("no_spin"));
      expect((await db.owner`select used from spin_credit where membership_id = ${r.membership}`)[0]!["used"]).toBe(2);
    });

    it("refuses a guest who has earned nothing", async () => {
      const r = await setup();
      await expect(spin(r.guest, r.membership)).rejects.toEqual(refusal("no_spin"));
      await giveSpins(r.id, r.membership, 1, 1);
      await expect(spin(r.guest, r.membership)).rejects.toEqual(refusal("no_spin"));
      expect(await count("spin_result", "membership_id", r.membership)).toBe(0);
    });

    it("refuses when the wheel is off or was never set up", async () => {
      const off = await setup({ enabled: false });
      await giveSpins(off.id, off.membership, 3);
      await expect(spin(off.guest, off.membership)).rejects.toEqual(refusal("wheel_off"));
      const bare = await setup({}, true);
      await giveSpins(bare.id, bare.membership, 3);
      await expect(spin(bare.guest, bare.membership)).rejects.toEqual(refusal("wheel_off"));
      expect((await db.owner`select used from spin_credit where membership_id = ${off.membership}`)[0]!["used"]).toBe(0);
    });

    it("lets a guest spin only their own membership", async () => {
      const a = await setup();
      const b = await setup();
      await giveSpins(a.id, a.membership, 3);
      await giveSpins(b.id, b.membership, 3);
      // Guest of restaurant A against restaurant B's membership, and the other way round.
      await expect(spin(a.guest, b.membership)).rejects.toEqual(refusal("not_allowed"));
      await expect(spin(b.guest, a.membership)).rejects.toEqual(refusal("not_allowed"));
      // Signed out (no guest at all) and an unknown membership.
      await expect(
        asApp(db.app, {}, (tx) => tx`select * from spin_wheel(${a.membership}::uuid, ${randomUUID()}::uuid)`),
      ).rejects.toEqual(refusal("not_allowed"));
      await expect(spin(a.guest, randomUUID())).rejects.toEqual(refusal("not_allowed"));
      // A restaurant's own context does not let it spin for a guest either.
      await expect(
        asApp(db.app, { restaurantId: a.id }, (tx) => tx`select * from spin_wheel(${a.membership}::uuid, ${randomUUID()}::uuid)`),
      ).rejects.toEqual(refusal("not_allowed"));
      expect(await count("spin_result", "restaurant_id", a.id)).toBe(0);
      expect(await count("spin_result", "restaurant_id", b.id)).toBe(0);
    });

    it("pays once for one spin id and returns the same result when it is repeated", async () => {
      const r = await setup({ prizes: [prize("Free coffee", 1)] });
      await giveSpins(r.id, r.membership, 3);
      const spinId = randomUUID();
      const first = await spin(r.guest, r.membership, spinId);
      const again = await spin(r.guest, r.membership, spinId);
      expect(first["out_status"]).toBe("spun");
      expect(again["out_status"]).toBe("repeat");
      expect(again["out_result_id"]).toBe(first["out_result_id"]);
      expect(again["out_reward_id"]).toBe(first["out_reward_id"]);
      expect(again["out_label"]).toBe("Free coffee");
      expect((await db.owner`select used from spin_credit where membership_id = ${r.membership}`)[0]!["used"]).toBe(1);
      expect(await count("spin_result", "membership_id", r.membership)).toBe(1);
      expect(await count("reward", "membership_id", r.membership)).toBe(1);
    });

    it("lets only one of two spins at the same moment use a single earned spin", async () => {
      const r = await setup({ prizes: [prize("Free coffee", 1)] });
      await giveSpins(r.id, r.membership, 1);
      const outcomes = await Promise.allSettled([
        spin(r.guest, r.membership, randomUUID(), pool),
        spin(r.guest, r.membership, randomUUID(), pool),
        spin(r.guest, r.membership, randomUUID(), pool),
      ]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      const refused = outcomes.filter((o) => o.status === "rejected") as PromiseRejectedResult[];
      expect(refused).toHaveLength(2);
      for (const one of refused) expect(one.reason).toEqual(refusal("no_spin"));
      expect(await count("spin_result", "membership_id", r.membership)).toBe(1);
      expect(await count("reward", "membership_id", r.membership)).toBe(1);
      expect((await db.owner`select used from spin_credit where membership_id = ${r.membership}`)[0]!["used"]).toBe(1);
    });

    it("pays the same spin id only once even when the repeat arrives at the same moment", async () => {
      const r = await setup({ prizes: [prize("Free coffee", 1)] });
      await giveSpins(r.id, r.membership, 5);
      const spinId = randomUUID();
      const outcomes = await Promise.all([
        spin(r.guest, r.membership, spinId, pool),
        spin(r.guest, r.membership, spinId, pool),
        spin(r.guest, r.membership, spinId, pool),
      ]);
      expect(new Set(outcomes.map((o) => o["out_result_id"])).size).toBe(1);
      expect(outcomes.filter((o) => o["out_status"] === "spun")).toHaveLength(1);
      expect((await db.owner`select used from spin_credit where membership_id = ${r.membership}`)[0]!["used"]).toBe(1);
      expect(await count("reward", "membership_id", r.membership)).toBe(1);
    });

    it("never lands on a prize with weight 0", async () => {
      const r = await setup({ prizes: [prize("Never", 0), prize("Always", 3)] });
      await giveSpins(r.id, r.membership, 12);
      for (let i = 0; i < 12; i += 1) {
        expect((await spin(r.guest, r.membership))["out_label"]).toBe("Always");
      }
    });

    it("gives a free item, a percent off and a rand off through the reward system", async () => {
      const r = await setup({
        prizes: [prize("Free coffee", 1, "free_item", { validDays: 30 })],
      });
      await giveSpins(r.id, r.membership, 3);
      const free = await spin(r.guest, r.membership);
      const [reward] = await db.owner`
        select kind, description, source, source_id, status, expires_at > now() as in_future, membership_id
        from reward where id = ${free["out_reward_id"]}
      `;
      expect(reward).toMatchObject({
        kind: "free_item",
        description: "Free coffee",
        source: "spin",
        source_id: free["out_result_id"],
        status: "available",
        in_future: true,
        membership_id: r.membership,
      });

      await saveWheel(r.owner, { prizes: [prize("10% off", 1, "percent_off", { percentOff: 10 })] });
      const percent = await spin(r.guest, r.membership);
      expect(
        (await db.owner`select kind, percent_off, amount_off_cents, expires_at from reward where id = ${percent["out_reward_id"]}`)[0],
      ).toMatchObject({ kind: "percent_off", percent_off: 10, amount_off_cents: null, expires_at: null });

      await saveWheel(r.owner, { prizes: [prize("R20 off", 1, "amount_off", { amountOffCents: 2000 })] });
      const amount = await spin(r.guest, r.membership);
      expect(
        (await db.owner`select kind, percent_off, amount_off_cents from reward where id = ${amount["out_reward_id"]}`)[0],
      ).toMatchObject({ kind: "amount_off", percent_off: null, amount_off_cents: 2000 });
    });

    it("adds bonus stamps once, and not again when the spin is repeated", async () => {
      const r = await setup({ prizes: [prize("Two stamps", 1, "stamps", { stamps: 2 })] });
      await giveSpins(r.id, r.membership, 3);
      const [before] = await db.owner`select stamps_current, stamps_total from membership where id = ${r.membership}`;
      const spinId = randomUUID();
      const first = await spin(r.guest, r.membership, spinId);
      expect(first).toMatchObject({ out_prize_type: "stamps", out_bonus_stamps: 2, out_reward_id: null });
      const repeat = await spin(r.guest, r.membership, spinId);
      expect(repeat).toMatchObject({ out_status: "repeat", out_bonus_stamps: 2 });
      const [after] = await db.owner`select stamps_current, stamps_total from membership where id = ${r.membership}`;
      expect(after!["stamps_current"]).toBe((before!["stamps_current"] as number) + 2);
      expect(after!["stamps_total"]).toBe((before!["stamps_total"] as number) + 2);
      const events = await db.owner`
        select reason, idempotency_key from stamp_event where membership_id = ${r.membership}
      `;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ reason: "bonus", idempotency_key: `spin:${first["out_result_id"]}` });
      // Bonus stamps never count towards the next earned spin.
      expect(await count("spin_credit", "membership_id", r.membership)).toBe(1);
      expect((await db.owner`select visits_toward from spin_credit where membership_id = ${r.membership}`)[0]!["visits_toward"]).toBe(0);
    });

    it("uses the spin and gives nothing for a try again", async () => {
      const r = await setup({ prizes: [prize("Try again", 1, "nothing")], enabled: false });
      await db.owner`update spin_config set enabled = true where restaurant_id = ${r.id}`;
      await giveSpins(r.id, r.membership, 1);
      const result = await spin(r.guest, r.membership);
      expect(result).toMatchObject({ out_prize_type: "nothing", out_reward_id: null, out_bonus_stamps: null });
      expect(await count("reward", "membership_id", r.membership)).toBe(0);
      expect((await db.owner`select used from spin_credit where membership_id = ${r.membership}`)[0]!["used"]).toBe(1);
    });

    it("puts the caller's operator setting back after a spin and after a repeat", async () => {
      const r = await setup();
      await giveSpins(r.id, r.membership, 2);
      const spinId = randomUUID();
      const flags = await asApp(
        db.app,
        { customerId: r.guest },
        async (tx) => {
          await tx`select * from spin_wheel(${r.membership}::uuid, ${spinId}::uuid)`;
          const [one] = await tx`select current_setting('app.is_operator', true) as flag`;
          await tx`select * from spin_wheel(${r.membership}::uuid, ${spinId}::uuid)`;
          const [two] = await tx`select current_setting('app.is_operator', true) as flag`;
          return [one!["flag"], two!["flag"]];
        },
        { rollback: false },
      );
      expect(flags).toEqual(["false", "false"]);
    });
  });

  // ------------------------------------------------------------------ spin_wheel: welcome spin
  describe("spin_wheel, welcome spin", () => {
    it("gives one welcome spin to a member and no second one", async () => {
      const r = await setup({ mode: "join", prizes: [prize("Free dessert", 1)] });
      const first = await spin(r.guest, r.membership);
      expect(first).toMatchObject({ out_status: "spun", out_label: "Free dessert" });
      await expect(spin(r.guest, r.membership)).rejects.toEqual(refusal("no_spin"));
      expect(await count("spin_result", "membership_id", r.membership)).toBe(1);
      expect(await count("reward", "membership_id", r.membership)).toBe(1);
    });

    it("lets two spins at the same moment pay a welcome spin once", async () => {
      const r = await setup({ mode: "join", prizes: [prize("Free dessert", 1)] });
      const outcomes = await Promise.allSettled([
        spin(r.guest, r.membership, randomUUID(), pool),
        spin(r.guest, r.membership, randomUUID(), pool),
      ]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      expect(await count("spin_result", "membership_id", r.membership)).toBe(1);
      expect(await count("reward", "membership_id", r.membership)).toBe(1);
    });
  });

  // ------------------------------------------------------------------ spin_wheel: reward decider
  describe("spin_wheel, reward decider", () => {
    const earnedReward = async (r: { id: string; membership: string }, values: { expired?: boolean; redeemed?: boolean } = {}) => {
      const [row] = await db.owner`
        insert into reward (restaurant_id, membership_id, description, kind, source, status, expires_at)
        values (${r.id}, ${r.membership}, 'Free coffee', 'free_item', 'stamp_card',
                ${values.redeemed ? "redeemed" : "available"}::reward_status,
                ${values.expired ? db.owner`now() - interval '1 day'` : null})
        returning id
      `;
      return row!["id"] as string;
    };

    const decider = (prizes: Prize[], floorCents = 1000) =>
      ({ mode: "reward_decider" as const, floorCents, prizes });

    it("needs an earned card reward, and not an expired or redeemed one", async () => {
      const r = await setup(decider([prize("Big prize", 1, "free_item", { valueCents: 5000 })]));
      await expect(spin(r.guest, r.membership)).rejects.toEqual(refusal("no_spin"));
      await earnedReward(r, { expired: true });
      await earnedReward(r, { redeemed: true });
      await expect(spin(r.guest, r.membership)).rejects.toEqual(refusal("no_spin"));
    });

    it("replaces the earned reward with a prize worth at least the smallest value, and decides only once", async () => {
      const r = await setup(
        decider(
          [
            prize("Cheap treat", 1000, "free_item", { valueCents: 500 }),
            prize("Big prize", 1, "free_item", { valueCents: 2000, validDays: 14 }),
            prize("Bonus stamps", 1000, "stamps", { stamps: 2 }),
          ],
          1000,
        ),
      );
      const rewardId = await earnedReward(r);
      const result = await spin(r.guest, r.membership);
      // Only the Big prize is worth at least R10, so it always wins, however heavy the others are.
      expect(result).toMatchObject({
        out_status: "spun",
        out_label: "Big prize",
        out_reward_id: rewardId,
        out_kept_advertised: false,
      });
      const rewards = await db.owner`
        select id, description, source, source_id, kind, expires_at > now() as in_future from reward where membership_id = ${r.membership}
      `;
      expect(rewards).toHaveLength(1);
      expect(rewards[0]).toMatchObject({
        id: rewardId,
        description: "Big prize",
        source: "spin",
        source_id: result["out_result_id"],
        kind: "free_item",
        in_future: true,
      });
      // The same reward cannot be drawn again.
      await expect(spin(r.guest, r.membership)).rejects.toEqual(refusal("no_spin"));
      expect(await count("spin_result", "membership_id", r.membership)).toBe(1);
    });

    it("swaps in a percent off or a rand off prize with the right amounts", async () => {
      const r = await setup(
        decider([prize("20% off", 1, "percent_off", { percentOff: 20, valueCents: 1500 })], 1000),
      );
      const rewardId = await earnedReward(r);
      await spin(r.guest, r.membership);
      expect(
        (await db.owner`select kind, percent_off, amount_off_cents from reward where id = ${rewardId}`)[0],
      ).toMatchObject({ kind: "percent_off", percent_off: 20, amount_off_cents: null });

      const s = await setup(decider([prize("R50 off", 1, "amount_off", { amountOffCents: 5000 })], 1000));
      const second = await earnedReward(s);
      await spin(s.guest, s.membership);
      expect(
        (await db.owner`select kind, percent_off, amount_off_cents from reward where id = ${second}`)[0],
      ).toMatchObject({ kind: "amount_off", percent_off: null, amount_off_cents: 5000 });
    });

    it("lets the guest keep the reward they earned when nothing on the wheel beats it", async () => {
      const r = await setup(decider([prize("Big prize", 1, "free_item", { valueCents: 5000 })], 1000));
      const rewardId = await earnedReward(r);
      // The owner raises the smallest value after the wheel was saved, so nothing qualifies any more.
      await db.owner`update spin_config set reward_floor_cents = 100000 where restaurant_id = ${r.id}`;
      const result = await spin(r.guest, r.membership);
      expect(result).toMatchObject({
        out_status: "spun",
        out_label: "Free coffee",
        out_reward_id: rewardId,
        out_kept_advertised: true,
      });
      const [reward] = await db.owner`select description, source from reward where id = ${rewardId}`;
      expect(reward).toMatchObject({ description: "Free coffee", source: "stamp_card" });
      expect((await db.owner`select count(*)::int as n from reward where membership_id = ${r.membership}`)[0]!["n"]).toBe(1);
      expect(
        (await db.owner`select kept_advertised from spin_result where id = ${result["out_result_id"]}`)[0]!["kept_advertised"],
      ).toBe(true);
      // Decided once: the kept reward is not offered to the wheel again.
      await expect(spin(r.guest, r.membership)).rejects.toEqual(refusal("no_spin"));
    });

    it("lets two spins at the same moment decide one reward once", async () => {
      const r = await setup(decider([prize("Big prize", 1, "free_item", { valueCents: 2000 })], 1000));
      await earnedReward(r);
      const outcomes = await Promise.allSettled([
        spin(r.guest, r.membership, randomUUID(), pool),
        spin(r.guest, r.membership, randomUUID(), pool),
      ]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      expect(await count("spin_result", "membership_id", r.membership)).toBe(1);
      expect(await count("reward", "membership_id", r.membership)).toBe(1);
    });
  });

  // ------------------------------------------------------------------ spin_state_for_guest
  describe("spin_state_for_guest", () => {
    const state = (guestId: string, membershipId: string) =>
      asApp(db.app, { customerId: guestId }, async (tx) => {
        const [row] = await tx`select spin_state_for_guest(${membershipId}::uuid) as s`;
        return row!["s"] as Record<string, unknown>;
      });

    it("shows the prize names without the weights, and how many spins are ready", async () => {
      const r = await setup({
        earnEvery: 4,
        prizes: [prize("Free coffee", 7), prize("Try again", 3, "nothing"), prize("Hidden", 0)],
      });
      await giveSpins(r.id, r.membership, 3, 1);
      await db.owner`update spin_credit set visits_toward = 1 where membership_id = ${r.membership}`;
      const s = await state(r.guest, r.membership);
      expect(s).toMatchObject({ enabled: true, mode: "earned", available: 2, visitsToNext: 3, earnEvery: 4 });
      const prizes = s["prizes"] as Array<Record<string, unknown>>;
      expect(prizes.map((p) => p["label"])).toEqual(["Free coffee", "Try again"]);
      for (const one of prizes) expect(Object.keys(one).sort()).toEqual(["id", "label", "type"]);
      expect(JSON.stringify(s)).not.toMatch(/weight/i);
    });

    it("says the wheel is off when it is off or has never been set up", async () => {
      const off = await setup({ enabled: false });
      expect(await state(off.guest, off.membership)).toEqual({ enabled: false, available: 0 });
      const bare = await setup({}, true);
      expect(await state(bare.guest, bare.membership)).toEqual({ enabled: false, available: 0 });
    });

    it("counts one welcome spin until it is used", async () => {
      const r = await setup({ mode: "join", prizes: [prize("Free dessert", 1)] });
      expect((await state(r.guest, r.membership))["available"]).toBe(1);
      await spin(r.guest, r.membership);
      expect((await state(r.guest, r.membership))["available"]).toBe(0);
    });

    it("counts one ready reward for the reward decider", async () => {
      const r = await setup({
        mode: "reward_decider",
        floorCents: 1000,
        prizes: [prize("Big prize", 1, "free_item", { valueCents: 2000 })],
      });
      expect((await state(r.guest, r.membership))["available"]).toBe(0);
      await db.owner`
        insert into reward (restaurant_id, membership_id, description, source) values (${r.id}, ${r.membership}, 'Free coffee', 'stamp_card')
      `;
      const s = await state(r.guest, r.membership);
      expect(s["available"]).toBe(1);
      expect(s["advertisedReward"]).toBe("Free coffee");
    });

    it("shows nothing to anyone but the guest who owns the card", async () => {
      const a = await setup();
      const b = await setup();
      await expect(state(a.guest, b.membership)).rejects.toEqual(refusal("not_allowed"));
      await expect(state(b.guest, a.membership)).rejects.toEqual(refusal("not_allowed"));
      await expect(
        asApp(db.app, {}, (tx) => tx`select spin_state_for_guest(${a.membership}::uuid)`),
      ).rejects.toEqual(refusal("not_allowed"));
    });
  });

  // ------------------------------------------------------------------ grant_visit_spin
  describe("grant_visit_spin", () => {
    const stamp = async (r: { id: string; membership: string }, reason = "visit", status = "valid") => {
      const [row] = await db.owner`
        insert into stamp_event (restaurant_id, membership_id, idempotency_key, reason, status)
        values (${r.id}, ${r.membership}, ${`t-${randomUUID()}`}, ${reason}, ${status}::stamp_status)
        returning id
      `;
      return row!["id"] as string;
    };
    const grant = (restaurantContext: string, restaurantId: string, membershipId: string, stampId: string) =>
      asApp(
        db.app,
        { restaurantId: restaurantContext },
        async (tx) => {
          const [row] = await tx`select grant_visit_spin(${restaurantId}::uuid, ${membershipId}::uuid, ${stampId}::uuid) as left_now`;
          return row!["left_now"] as number;
        },
        { rollback: false },
      );
    const credit = async (membershipId: string) =>
      (await db.owner`select earned, used, visits_toward from spin_credit where membership_id = ${membershipId}`)[0];

    it("earns a spin every N visits", async () => {
      const r = await setup({ earnEvery: 3 });
      expect(await grant(r.id, r.id, r.membership, await stamp(r))).toBe(0);
      expect(await grant(r.id, r.id, r.membership, await stamp(r))).toBe(0);
      expect(await grant(r.id, r.id, r.membership, await stamp(r))).toBe(1);
      expect(await credit(r.membership)).toMatchObject({ earned: 1, used: 0, visits_toward: 0 });
      for (let i = 0; i < 3; i += 1) await grant(r.id, r.id, r.membership, await stamp(r));
      expect(await credit(r.membership)).toMatchObject({ earned: 2, used: 0, visits_toward: 0 });
    });

    it("counts the same stamp once, however often the till retries it", async () => {
      const r = await setup({ earnEvery: 2 });
      const one = await stamp(r);
      await grant(r.id, r.id, r.membership, one);
      await grant(r.id, r.id, r.membership, one);
      expect(await credit(r.membership)).toMatchObject({ earned: 0, visits_toward: 1 });
      await grant(r.id, r.id, r.membership, await stamp(r));
      expect(await credit(r.membership)).toMatchObject({ earned: 1, visits_toward: 0 });
    });

    it("does not count bonus stamps, undone stamps or another member's stamp", async () => {
      const r = await setup({ earnEvery: 1 });
      expect(await grant(r.id, r.id, r.membership, await stamp(r, "bonus"))).toBe(0);
      expect(await grant(r.id, r.id, r.membership, await stamp(r, "visit", "undone"))).toBe(0);
      const otherGuest = await makeGuest(db.owner, fixtures);
      const otherMembership = await makeMembership(db.owner, r.id, otherGuest.id);
      const foreignStamp = await stamp({ id: r.id, membership: otherMembership });
      expect(await grant(r.id, r.id, r.membership, foreignStamp)).toBe(0);
      expect(await grant(r.id, r.id, r.membership, randomUUID())).toBe(0);
      expect((await credit(r.membership))?.["earned"] ?? 0).toBe(0);
    });

    it("does nothing when the wheel is off, never set up, or not an earned wheel", async () => {
      const off = await setup({ enabled: false, earnEvery: 1 });
      expect(await grant(off.id, off.id, off.membership, await stamp(off))).toBe(0);
      expect(await credit(off.membership)).toBeUndefined();
      const bare = await setup({}, true);
      expect(await grant(bare.id, bare.id, bare.membership, await stamp(bare))).toBe(0);
      const join = await setup({ mode: "join" });
      expect(await grant(join.id, join.id, join.membership, await stamp(join))).toBe(0);
      expect(await credit(join.membership)).toBeUndefined();
    });

    it("refuses another restaurant's context and a membership from another restaurant", async () => {
      const a = await setup({ earnEvery: 1 });
      const b = await setup({ earnEvery: 1 });
      const aStamp = await stamp(a);
      // Restaurant B's till cannot give spins to restaurant A's guest.
      await expect(grant(b.id, a.id, a.membership, aStamp)).rejects.toEqual(refusal("not_allowed"));
      // Restaurant A's till cannot name a member of restaurant B.
      await expect(grant(a.id, a.id, b.membership, await stamp(b))).rejects.toEqual(refusal("not_a_member"));
      // A guest context (no restaurant) cannot call it at all.
      await expect(
        asApp(db.app, { customerId: a.guest }, (tx) => tx`select grant_visit_spin(${a.id}::uuid, ${a.membership}::uuid, ${aStamp}::uuid)`),
      ).rejects.toEqual(refusal("not_allowed"));
      expect(await credit(a.membership)).toBeUndefined();
      expect(await credit(b.membership)).toBeUndefined();
    });

    it("puts the caller's operator setting back, including when it counts nothing", async () => {
      const r = await setup({ earnEvery: 1 });
      const flags = await asApp(
        db.app,
        { restaurantId: r.id },
        async (tx) => {
          const real = await stamp(r);
          await tx`select grant_visit_spin(${r.id}::uuid, ${r.membership}::uuid, ${real}::uuid)`;
          const [one] = await tx`select current_setting('app.is_operator', true) as flag`;
          await tx`select grant_visit_spin(${r.id}::uuid, ${r.membership}::uuid, ${randomUUID()}::uuid)`;
          const [two] = await tx`select current_setting('app.is_operator', true) as flag`;
          return [one!["flag"], two!["flag"]];
        },
        { rollback: false },
      );
      expect(flags).toEqual(["false", "false"]);
    });

    it("lets the guest spin what the visits earned, start to finish", async () => {
      const r = await setup({ earnEvery: 2, prizes: [prize("Free coffee", 1)] });
      await grant(r.id, r.id, r.membership, await stamp(r));
      await expect(spin(r.guest, r.membership)).rejects.toEqual(refusal("no_spin"));
      await grant(r.id, r.id, r.membership, await stamp(r));
      expect(await spin(r.guest, r.membership)).toMatchObject({ out_status: "spun", out_label: "Free coffee" });
      await expect(spin(r.guest, r.membership)).rejects.toEqual(refusal("no_spin"));
    });
  });
});
