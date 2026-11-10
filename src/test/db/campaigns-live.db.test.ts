// @vitest-environment node
// Real database test for migration 0026 (create_campaign, request_topup, campaign_audience_ids).
// Runs on GitHub for every push. Skips on a laptop unless both addresses are set.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLiveCampaign } from "../../server/live-campaign-create";
import { getLiveCredit, requestLiveTopup } from "../../server/live-credit";
import { cancelCampaign } from "../../server/live-actions";
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
  token,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

// The app's withContext uses the Neon WebSocket driver, which CI Postgres does not serve.
// This runs the same steps (set the RLS settings, then the work) over the app_user role
// with the standard Postgres driver, so the real SQL, row security and functions are tested.
vi.mock("../../server/db", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { sql } = await import("drizzle-orm");
  const postgres = (await import("postgres")).default;
  return {
    withContext: async (
      context: { databaseUrl: string; restaurantId?: string | null; customerId?: string | null; isOperator?: boolean },
      callback: (transaction: unknown) => Promise<unknown>,
    ) => {
      const client = postgres(context.databaseUrl, { max: 1, prepare: false });
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

const savedEnv = { DATA_MODE: process.env["DATA_MODE"], DATABASE_URL: process.env["DATABASE_URL"] };

describe.skipIf(!dbTestsEnabled)("campaigns live (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
    process.env["DATA_MODE"] = "live";
    process.env["DATABASE_URL"] = appUrl;
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
    process.env["DATA_MODE"] = savedEnv.DATA_MODE;
    process.env["DATABASE_URL"] = savedEnv.DATABASE_URL;
  });

  // A restaurant with a manager, a credit top up and one opted-in guest.
  async function setup(balanceCents: number) {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const userId = await makeAppUser(db.owner, fixtures, { role: "owner", restaurantId });
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    await db.owner`update membership set marketing_sms = 'opted_in' where id = ${membershipId}`;
    if (balanceCents > 0) {
      await db.owner`
        insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, created_by)
        values (${restaurantId}, 'topup', ${balanceCents}, ${`fx-${token()}`}, 'test')`;
    }
    const viewer = {
      userId,
      email: `${userId}@test.invalid`,
      name: "Test owner",
      role: "owner" as const,
      restaurantId,
      customerId: null,
      needsPhone: false,
    };
    return { restaurantId, userId, viewer, membershipId };
  }

  const campaignInput = (code: string, segments = 1) => ({
    name: "Test campaign",
    body: "Come in this week for a treat.",
    code,
    audience: { type: "everyone" as const },
    scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    segments,
  });

  const code = () => `T${token().slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, "2")}`;

  it("reserves the estimated cost once in the credit ledger", async () => {
    const { restaurantId, viewer } = await setup(10_000);
    const result = await createLiveCampaign(viewer, campaignInput(code(), 2));
    expect(result.ok).toBe(true);
    const rows = await db.owner`
      select entry_type, amount_cents from credit_ledger
      where restaurant_id = ${restaurantId} and entry_type = 'reserve'`;
    expect(rows.length).toBe(1);
    expect(rows[0]!["amount_cents"]).toBe(-70);
    const credit = await getLiveCredit(viewer);
    expect(credit?.reservedCents).toBe(70);
  });

  it("refuses when the balance is too low and never goes negative", async () => {
    const { restaurantId, viewer } = await setup(50);
    const result = await createLiveCampaign(viewer, campaignInput(code(), 2));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/not enough credit/i);
    const rows = await db.owner`
      select count(*)::int as n from credit_ledger
      where restaurant_id = ${restaurantId} and entry_type = 'reserve'`;
    expect(rows[0]!["n"]).toBe(0);
    const credit = await getLiveCredit(viewer);
    expect(credit?.balanceCents).toBe(50);
  });

  it("refuses a second campaign that uses the same code", async () => {
    const { viewer } = await setup(10_000);
    const sameCode = code();
    const first = await createLiveCampaign(viewer, campaignInput(sameCode));
    expect(first.ok).toBe(true);
    const second = await createLiveCampaign(viewer, campaignInput(sameCode));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.message).toMatch(/already used/i);
  });

  it("refuses a guest and a restaurant the caller does not manage", async () => {
    const { viewer } = await setup(10_000);
    const guestViewer = { ...viewer, role: "guest" as const };
    const guestResult = await createLiveCampaign(guestViewer, campaignInput(code()));
    expect(guestResult.ok).toBe(false);
    const other = await setup(10_000);
    // Owner of restaurant B cannot create against restaurant A, even with A's id.
    const crossResult = await createLiveCampaign(
      { ...other.viewer, restaurantId: viewer.restaurantId },
      campaignInput(code()),
    );
    expect(crossResult.ok).toBe(false);
    const rows = await db.owner`
      select count(*)::int as n from campaign where restaurant_id = ${viewer.restaurantId}`;
    expect(rows[0]!["n"]).toBe(0);
  });

  it("moves a quiet-hours time to the next 08:00 Johannesburg and refuses a past time", async () => {
    const { viewer } = await setup(10_000);
    // 22:30 SAST on a fixed future day (UTC+2), so it lands in quiet hours.
    const late = new Date("2031-03-10T20:30:00Z").toISOString();
    const result = await createLiveCampaign(viewer, { ...campaignInput(code()), scheduledAt: late });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db.owner`
      select to_char(scheduled_at at time zone 'Africa/Johannesburg', 'YYYY-MM-DD HH24:MI') as local
      from campaign where id = ${result.campaignId}`;
    expect(row!["local"]).toBe("2031-03-11 08:00");
    const past = await createLiveCampaign(viewer, {
      ...campaignInput(code()),
      scheduledAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect(past.ok).toBe(false);
    if (past.ok) return;
    expect(past.message).toMatch(/future/i);
  });

  it("cancelling releases exactly the reserved amount once", async () => {
    const { restaurantId, viewer } = await setup(10_000);
    const created = await createLiveCampaign(viewer, campaignInput(code(), 2));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await cancelCampaign(viewer, created.campaignId)).ok).toBe(true);
    // A second cancel of a cancelled campaign is refused and adds no release.
    expect((await cancelCampaign(viewer, created.campaignId)).ok).toBe(false);
    const rows = await db.owner`
      select entry_type, amount_cents from credit_ledger
      where restaurant_id = ${restaurantId} and campaign_id = ${created.campaignId}
      order by entry_type`;
    expect(rows.map((r) => r["entry_type"]).sort()).toEqual(["release", "reserve"]);
    const amounts = rows.map((r) => `${r["entry_type"]}=${r["amount_cents"]}`);
    expect(amounts.sort()).toEqual(["release=70", "reserve=-70"]);
    const net = rows.reduce((sum, r) => sum + Number(r["amount_cents"]), 0);
    expect(net).toBe(0);
    const credit = await getLiveCredit(viewer);
    expect(credit?.reservedCents).toBe(0);
  });

  it("a top-up request is a pending payment and adds no credit", async () => {
    const { restaurantId, viewer } = await setup(0);
    const result = await requestLiveTopup(viewer, 50_000);
    expect(result.ok).toBe(true);
    const [payment] = await db.owner`
      select kind::text as kind, status::text as status, amount_cents from payment
      where restaurant_id = ${restaurantId}`;
    expect(payment!["kind"]).toBe("topup");
    expect(payment!["status"]).toBe("pending");
    expect(Number(payment!["amount_cents"])).toBe(50_000);
    const credit = await getLiveCredit(viewer);
    expect(credit?.balanceCents).toBe(0);
  });

  it("audience leaves out guests who did not consent, withdrew, or hit the weekly cap", async () => {
    const { restaurantId, viewer, membershipId } = await setup(10_000);
    // membershipId is opted in (from setup). Add three more guests with different states.
    const addGuest = async (sms: "not_opted_in" | "opted_in" | "opted_out", erased = false) => {
      const g = await makeGuest(db.owner, fixtures);
      const m = await makeMembership(db.owner, restaurantId, g.id);
      await db.owner`update membership set marketing_sms = ${sms}::marketing_status where id = ${m}`;
      if (erased) await db.owner`update customer set erased_at = now() where id = ${g.id}`;
      return m;
    };
    await addGuest("not_opted_in");
    await addGuest("opted_out");
    await addGuest("opted_in", true);
    // Over the weekly cap: the restaurant cap is 1 and this guest already has one sent message.
    const overCap = await addGuest("opted_in");
    await db.owner`update restaurant set member_weekly_cap = 1 where id = ${restaurantId}`;
    const [seed] = await db.owner`
      insert into campaign (restaurant_id, name, message_body, audience, code, status, created_by)
      values (${restaurantId}, 'Seed', 'x', '{"type":"everyone"}', ${code()}, 'draft', 'test')
      returning id`;
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, last_attempt_at)
      values (${seed!["id"]}, ${restaurantId}, ${overCap}, 'sms', 'sent', now())`;
    const ids = await db.owner`
      select membership_id from campaign_audience_ids(${restaurantId}::uuid, '{"type":"everyone"}'::jsonb, now())`;
    const found = ids.map((r) => r["membership_id"]);
    expect(found).toContain(membershipId);
    expect(found.length).toBe(1);
  });
});
