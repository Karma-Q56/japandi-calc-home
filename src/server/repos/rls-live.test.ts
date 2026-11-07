import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withContext } from "@/server/db";
import type { Viewer } from "@/server/auth-viewer";
import {
  addStaffMember,
  createPairingCode,
  isPairingCodeUsable,
  pairingCodeHash,
  redeemRewardAs,
} from "@/server/live-till";
import {
  PIN_FAIL_WINDOW_MINUTES,
  PIN_MAX_FAILS,
  isPinLocked,
  pinHmacHex,
} from "@/server/repos/pg";

// Cross-tenant RLS is enforced by scripts/rls-check.mjs against the DEV branch.
// This wrapper runs the same assertion through withContext when DATABASE_URL
// (dev) is present, otherwise it skips, never touching production.
const url = process.env["DATABASE_URL"];

describe.skipIf(!url)("rls cross-tenant (dev branch)", () => {
  // Live Neon roundtrips need longer than vitest's 5s default timeout.
  it("restaurant A context sees zero B rows", { timeout: 120_000 }, async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const ownerUrl = process.env["DATABASE_URL_MIGRATE"];
    if (!ownerUrl) {
      console.warn("skip: DATABASE_URL_MIGRATE not set");
      return;
    }
    const owner = postgres(ownerUrl, { max: 1, prepare: false });
    let a: string | null = null;
    let b: string | null = null;
    try {
      const ra = (await owner`insert into restaurant (slug, name) values (${`t-a-${suffix.slice(0, 20)}`}, 'T A') returning id`) as { id: string }[];
      const rb = (await owner`insert into restaurant (slug, name) values (${`t-b-${suffix.slice(0, 20)}`}, 'T B') returning id`) as { id: string }[];
      if (!ra[0] || !rb[0]) throw new Error("fixture setup failed");
      a = ra[0].id;
      b = rb[0].id;
      const bId: string = b;
      await withContext({ databaseUrl: url ?? "", restaurantId: a }, async (tx) => {
        const countRes = (await tx.execute(
          sql`select count(*)::int as n from membership where restaurant_id = ${bId}`,
        )) as unknown as { rows: { n: string | number }[] };
        expect(Number(countRes.rows[0]?.n ?? -1)).toBe(0);
        const updRes = (await tx.execute(
          sql`update membership set stamps_total = stamps_total + 1 where restaurant_id = ${bId} returning id`,
        )) as unknown as { rows: unknown[] };
        expect(updRes.rows.length).toBe(0);
      });
    } finally {
      if (a && b) {
        await owner`delete from restaurant where id in (${a}, ${b})`;
      }
      await owner.end({ timeout: 5 });
    }
  });
});

// Live till cases for phase D8. Same fixtures style as above: owner role makes
// them, the app role reads and writes through withContext, nothing is left behind.
const pepper = process.env["PIN_PEPPER"];

describe.skipIf(!url || !pepper)("live till (dev branch)", () => {
  it(
    "stores only the PIN HMAC, is owner only, and pairs once",
    { timeout: 120_000 },
    async () => {
      const suffix = randomUUID().replaceAll("-", "");
      const ownerUrl = process.env["DATABASE_URL_MIGRATE"];
      if (!ownerUrl) {
        console.warn("skip: DATABASE_URL_MIGRATE not set");
        return;
      }
      const owner = postgres(ownerUrl, { max: 1, prepare: false });
      let a: string | null = null;
      try {
        const ra = (await owner`insert into restaurant (slug, name) values (${`till-a-${suffix.slice(0, 18)}`}, 'Till A') returning id`) as { id: string }[];
        if (!ra[0]) throw new Error("fixture setup failed");
        a = ra[0].id;
        const restaurantId: string = a;
        const ownerViewer: Viewer = {
          userId: `owner-${suffix.slice(0, 12)}`,
          email: "owner@example.com",
          name: "Owner",
          role: "owner",
          restaurantId,
          customerId: null,
          needsPhone: false,
        };
        const managerViewer: Viewer = { ...ownerViewer, role: "manager" };

        const added = await addStaffMember(ownerViewer, "Thandi");
        expect(added.ok).toBe(true);
        if (!added.ok) return;

        const refund = await addStaffMember(managerViewer, "Nope");
        expect(refund.ok).toBe(false);

        let storedHmac = "";
        let auditMeta = "";
        await withContext({ databaseUrl: url ?? "", restaurantId }, async (tx) => {
          const rows = (await tx.execute(
            sql`select pin_hmac from staff_member where id = ${added.staffId} and restaurant_id = ${restaurantId}`,
          )) as unknown as { rows: { pin_hmac: string }[] };
          storedHmac = rows.rows[0]?.pin_hmac ?? "";
          const meta = (await tx.execute(
            sql`select meta::text as meta from audit_event where action = 'staff_added' and object_id = ${added.staffId}`,
          )) as unknown as { rows: { meta: string }[] };
          auditMeta = meta.rows[0]?.meta ?? "";
        });
        expect(storedHmac).toBe(
          pinHmacHex(pepper ?? "", restaurantId, added.staffId, added.pin),
        );
        expect(storedHmac).not.toBe(added.pin);
        expect(auditMeta).not.toContain(added.pin);

        const created = await createPairingCode(ownerViewer);
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        if (!pepper) return;
        const hash = pairingCodeHash(pepper, created.code);
        await withContext({ databaseUrl: url ?? "", restaurantId }, async (tx) => {
          const row = (await tx.execute(
            sql`select code_hash, expires_at, used_at from one_time_code where code_hash = ${hash} and restaurant_id = ${restaurantId}`,
          )) as unknown as { rows: { code_hash: string; expires_at: string; used_at: string | null }[] };
          const code = row.rows[0];
          expect(code?.code_hash).not.toBe(created.code);
          expect(code ? isPairingCodeUsable(code, Date.now()) : false).toBe(true);
          const first = (await tx.execute(
            sql`update one_time_code set used_at = now() where code_hash = ${hash} and used_at is null and expires_at > now() returning id`,
          )) as unknown as { rows: unknown[] };
          expect(first.rows.length).toBe(1);
          const second = (await tx.execute(
            sql`update one_time_code set used_at = now() where code_hash = ${hash} and used_at is null and expires_at > now() returning id`,
          )) as unknown as { rows: unknown[] };
          expect(second.rows.length).toBe(0);
          const expired = (await tx.execute(
            sql`update one_time_code set expires_at = now() - interval '1 minute' where code_hash = ${hash} and used_at is null and expires_at > now() returning id`,
          )) as unknown as { rows: unknown[] };
          expect(expired.rows.length).toBe(0);
        });

        // Five wrong tries lock that staff member for 15 minutes.
        for (let attempt = 0; attempt < PIN_MAX_FAILS; attempt++) {
          await withContext({ databaseUrl: url ?? "", restaurantId }, async (tx) => {
            await tx.execute(
              sql`insert into rate_limit_hit (bucket, key) values ('pin', ${added.staffId})`,
            );
          });
        }
        await withContext({ databaseUrl: url ?? "", restaurantId }, async (tx) => {
          const rows = (await tx.execute(
            sql`select count(*)::int as n, max(created_at) as last from rate_limit_hit where bucket = 'pin' and key = ${added.staffId} and created_at > now() - make_interval(mins => ${PIN_FAIL_WINDOW_MINUTES})`,
          )) as unknown as { rows: { n: number | string; last: string | null }[] };
          const row = rows.rows[0];
          expect(
            isPinLocked(Number(row?.n ?? 0), row?.last ? Date.parse(row.last) : null, Date.now()),
          ).toBe(true);
        });

        await owner`delete from rate_limit_hit where bucket = 'pin' and key = ${added.staffId}`;
      } finally {
        if (a) await owner`delete from audit_event where restaurant_id = ${a}`;
        if (a) await owner`delete from restaurant where id = ${a}`;
        await owner.end({ timeout: 5 });
      }
    },
  );

  it(
    "redeems once and refuses another restaurant's reward",
    { timeout: 120_000 },
    async () => {
      const suffix = randomUUID().replaceAll("-", "");
      const ownerUrl = process.env["DATABASE_URL_MIGRATE"];
      if (!ownerUrl) {
        console.warn("skip: DATABASE_URL_MIGRATE not set");
        return;
      }
      const owner = postgres(ownerUrl, { max: 1, prepare: false });
      let a: string | null = null;
      let b: string | null = null;
      let customerId: string | null = null;
      try {
        const ra = (await owner`insert into restaurant (slug, name) values (${`till-a-${suffix.slice(0, 18)}`}, 'Till A') returning id`) as { id: string }[];
        const rb = (await owner`insert into restaurant (slug, name) values (${`till-b-${suffix.slice(0, 18)}`}, 'Till B') returning id`) as { id: string }[];
        if (!ra[0] || !rb[0]) throw new Error("fixture setup failed");
        a = ra[0].id;
        b = rb[0].id;
        const restaurantId: string = a;
        const other: string = b;

        const rc = (await owner`insert into customer (user_id, phone_e164, name) values (${`user-${suffix.slice(0, 16)}`}, ${`+2783${suffix.slice(0, 7)}`}, 'Guest One') returning id`) as { id: string }[];
        if (!rc[0]) throw new Error("customer setup failed");
        customerId = rc[0].id;
        const customer: string = customerId;

        const ma = (await owner`insert into membership (restaurant_id, customer_id) values (${restaurantId}, ${customer}) returning id`) as { id: string }[];
        const mb = (await owner`insert into membership (restaurant_id, customer_id) values (${other}, ${customer}) returning id`) as { id: string }[];
        if (!ma[0] || !mb[0]) throw new Error("membership setup failed");
        const memberA: string = ma[0].id;
        const memberB: string = mb[0].id;

        const rewardA = (await owner`insert into reward (restaurant_id, membership_id, description) values (${restaurantId}, ${memberA}, 'Free coffee') returning id`) as { id: string }[];
        const rewardB = (await owner`insert into reward (restaurant_id, membership_id, description) values (${other}, ${memberB}, 'Free coffee') returning id`) as { id: string }[];
        if (!rewardA[0] || !rewardB[0]) throw new Error("reward setup failed");

        const staff = (await owner`insert into staff_member (restaurant_id, display_name, pin_hmac) values (${restaurantId}, 'Thandi', ${`hmac-${suffix}`}) returning id`) as { id: string }[];
        if (!staff[0]) throw new Error("staff setup failed");
        const staffId: string = staff[0].id;

        const first = await redeemRewardAs({
          restaurantId,
          membershipId: memberA,
          rewardId: rewardA[0].id,
          staffId,
        });
        expect(first.ok).toBe(true);

        const second = await redeemRewardAs({
          restaurantId,
          membershipId: memberA,
          rewardId: rewardA[0].id,
          staffId,
        });
        expect(second.ok).toBe(false);
        if (second.ok) return;
        expect(second.message).toBe("Already redeemed.");

        const foreign = await redeemRewardAs({
          restaurantId,
          membershipId: memberB,
          rewardId: rewardB[0].id,
          staffId,
        });
        expect(foreign.ok).toBe(false);

        const still = (await owner`select status from reward where id = ${rewardB[0].id}`) as { status: string }[];
        expect(still[0]?.status).toBe("available");
      } finally {
        if (a) await owner`delete from audit_event where restaurant_id = ${a}`;
        if (b) await owner`delete from audit_event where restaurant_id = ${b}`;
        if (a) await owner`delete from restaurant where id = ${a}`;
        if (b) await owner`delete from restaurant where id = ${b}`;
        if (customerId) await owner`delete from customer where id = ${customerId}`;
        await owner.end({ timeout: 5 });
      }
    },
  );
});

if (!url) it.skip("rls cross-tenant needs DATABASE_URL (dev)", () => {});
