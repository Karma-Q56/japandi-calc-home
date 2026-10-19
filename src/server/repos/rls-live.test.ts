import { describe, expect, it } from "vitest";

// Cross-tenant RLS is enforced by scripts/rls-check.mjs against the DEV branch.
// This wrapper runs the same assertion through withContext when DATABASE_URL
// (dev) is present, otherwise it skips — never touching production.
const url = process.env["DATABASE_URL"];

describe.skipIf(!url)("rls cross-tenant (dev branch)", () => {
  it("restaurant A context sees zero B rows", async () => {
    const { withContext } = await import("@/server/db");
    const { randomUUID } = await import("node:crypto");
    const suffix = randomUUID().replaceAll("-", "");
    const ownerUrl = process.env["DATABASE_URL_MIGRATE"];
    if (!ownerUrl) {
      console.warn("skip: DATABASE_URL_MIGRATE not set");
      return;
    }
    const { default: postgres } = await import("postgres");
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
        const { sql } = await import("drizzle-orm");
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

if (!url) it.skip("rls cross-tenant needs DATABASE_URL (dev)", () => {});
