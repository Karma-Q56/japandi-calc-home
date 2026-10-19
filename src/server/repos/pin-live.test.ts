import { describe, expect, it } from "vitest";

// Live till-PIN tests against the DEV branch only (skipped without
// DATABASE_URL + DATABASE_URL_MIGRATE). Never touches production.
const appUrl = process.env["DATABASE_URL"];
const ownerUrl = process.env["DATABASE_URL_MIGRATE"];

describe.skipIf(!appUrl || !ownerUrl)("till PIN live (dev branch)", () => {
  it("rejects empty PIN, wrong PIN, and locks out after 5 attempts", async () => {
    const { createPgRepos } = await import("./pg");
    const { pinHmacHex } = await import("./pg");
    const { randomUUID } = await import("node:crypto");
    const { default: postgres } = await import("postgres");
    const owner = postgres(ownerUrl!, { max: 1, prepare: false });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const staffId = randomUUID();
    const pepper = `test-pepper-${suffix}`;
    const saved = process.env["PIN_PEPPER"];
    process.env["PIN_PEPPER"] = pepper;
    let restaurantId = "";
    let customerId = "";
    let membershipA = "";
    try {
      const r = (await owner`insert into restaurant (slug, name) values (${`pin-${suffix}`}, 'PIN Test') returning id`) as { id: string }[];
      if (!r[0]) throw new Error("fixture failed");
      restaurantId = r[0].id;
      const hmac = pinHmacHex(pepper, restaurantId, staffId, "1234");
      await owner`insert into staff_member (id, restaurant_id, display_name, pin_hmac) values (${staffId}, ${restaurantId}, 'Till', ${hmac})`;
      const digits = String(Math.floor(1000000 + Math.random() * 8999999));
      const c = (await owner`insert into customer (user_id, phone_e164, name) values (${`pin-${suffix}`}, ${`+2789${digits}`}, 'PIN Guest') returning id`) as { id: string }[];
      if (!c[0]) throw new Error("fixture failed");
      customerId = c[0].id;
      const m1 = (await owner`insert into membership (restaurant_id, customer_id) values (${restaurantId}, ${customerId}) returning id`) as { id: string }[];
      if (!m1[0]) throw new Error("fixture failed");
      membershipA = m1[0].id;

      const repos = createPgRepos({ databaseUrl: appUrl! });
      const stamp = (membershipId: string, pin: string, key: string) =>
        repos.recordStamp({ restaurantId, membershipId, staffId, key, pin });

      await expect(stamp(membershipA, "", "k-empty")).rejects.toThrow("PIN required");
      await expect(stamp(membershipA, "0000", "k-wrong")).rejects.toThrow("Wrong PIN.");
      const ok = await stamp(membershipA, "1234", "k-good");
      expect(["stamped", "reward"].includes(ok.result)).toBe(true);

      for (let i = 0; i < 5; i++) {
        await expect(stamp(membershipA, "0000", `k-lock-${i}`)).rejects.toThrow("Wrong PIN.");
      }
      // Locked: even the correct PIN returns the same wrong-PIN error.
      await expect(stamp(membershipA, "1234", "k-locked-out")).rejects.toThrow("Wrong PIN.");
    } finally {
      if (saved === undefined) delete process.env["PIN_PEPPER"];
      else process.env["PIN_PEPPER"] = saved;
      if (restaurantId) await owner`delete from restaurant where id = ${restaurantId}`;
      if (customerId) await owner`delete from customer where id = ${customerId}`;
      await owner`delete from rate_limit_hit where bucket = 'pin' and key = ${staffId}`;
      await owner.end({ timeout: 5 });
    }
  });
});

if (!appUrl || !ownerUrl) it.skip("till PIN live needs DATABASE_URL + DATABASE_URL_MIGRATE (dev)", () => {});
