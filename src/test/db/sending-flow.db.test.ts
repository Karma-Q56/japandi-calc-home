// @vitest-environment node
// Real database tests for the sending flow (migration 0027): who gets queued, no double sends,
// settling the money, and a full dispatch run with a fake SMS provider. Runs on GitHub for every
// push. Skips on a laptop unless both database addresses are set.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { runLiveDispatch } from "../../server/live-dispatch";
import { runLiveSettle } from "../../server/live-settle";
import { STOP_FOOTER } from "../../domain/campaigns";
import type { SmsMessage, SmsProvider } from "../../server/sms/types";
import {
  appUrl,
  asApp,
  cleanup,
  connect,
  dbTestsEnabled,
  makeGuest,
  makeMembership,
  makeRestaurant,
  newFixtures,
  token,
  type DbConnections,
  type Fixtures,
  type Sql,
} from "../db-fixture";

// The app's withContext uses the Neon WebSocket driver, which CI Postgres does not serve. This runs
// the same steps over the app_user role with the standard Postgres driver (same as campaigns-live).
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

type Guest = { name: string; optedIn?: boolean; joinedDaysAgo?: number; erased?: boolean };

describe.skipIf(!dbTestsEnabled)("sending flow (real database)", () => {
  let db: DbConnections;
  let second: Sql;
  const fixtures: Fixtures = newFixtures();
  const savedEnv = { DATABASE_URL: process.env["DATABASE_URL"] };

  beforeAll(() => {
    db = connect();
    second = postgres(appUrl!, { max: 1, prepare: false });
    process.env["DATABASE_URL"] = appUrl;
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await second.end({ timeout: 5 });
    await db.close();
    process.env["DATABASE_URL"] = savedEnv.DATABASE_URL;
  });

  const code = () => `S${token().toUpperCase().replace(/[^A-Z0-9]/g, "")}`.slice(0, 12);

  /** A live restaurant, guests, and a campaign due two hours ago with its credit held. */
  async function setup(
    guests: Guest[],
    options: { audience?: object; reserveCents?: number; status?: "scheduled" | "sending"; body?: string } = {},
  ) {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const memberships: string[] = [];
    for (const guest of guests) {
      const { id: customerId } = await makeGuest(db.owner, fixtures);
      await db.owner`update customer set name = ${guest.name}, erased_at = ${guest.erased ? new Date() : null} where id = ${customerId}`;
      const membershipId = await makeMembership(db.owner, restaurantId, customerId);
      await db.owner`
        update membership set
          marketing_sms = ${guest.optedIn === false ? "opted_out" : "opted_in"},
          joined_at = now() - make_interval(days => ${guest.joinedDaysAgo ?? 0})
        where id = ${membershipId}
      `;
      memberships.push(membershipId);
    }
    const [campaign] = await db.owner`
      insert into campaign (restaurant_id, name, message_body, channel, audience, code, status, scheduled_at,
                            est_recipients, est_segments, est_cost_cents, created_by)
      values (${restaurantId}, 'Flow test', ${options.body ?? "Hi {first_name}, come back soon."}, 'sms',
              ${db.owner.json((options.audience ?? { type: "everyone" }) as never)}, ${code()},
              ${options.status ?? "scheduled"}, now() - interval '2 hours', ${guests.length}, 1,
              ${(options.reserveCents ?? 0)}, 'test')
      returning id, scheduled_at
    `;
    const campaignId = campaign!["id"] as string;
    await db.owner`
      insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, created_by)
      values (${restaurantId}, 'topup', 10000, ${`topup:${campaignId}`}, 'test')
    `;
    if ((options.reserveCents ?? 0) > 0) {
      await db.owner`
        insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, campaign_id, created_by)
        values (${restaurantId}, 'reserve', ${-(options.reserveCents ?? 0)}, ${`reserve:${campaignId}`}, ${campaignId}, 'test')
      `;
    }
    return { restaurantId, campaignId, memberships, scheduledAt: campaign!["scheduled_at"] as Date };
  }

  const operator = <T>(work: (tx: Parameters<Parameters<typeof asApp>[2]>[0]) => Promise<T>) =>
    asApp(db.app, { operator: true }, work, { rollback: false });

  async function queue(campaignId: string, scheduledAt: Date) {
    const due = new Date(scheduledAt.getTime() + 60_000);
    const claimed = await operator((tx) => tx`select campaign_id from claim_due_campaigns(${due}, 50)`);
    expect(claimed.map((row) => row["campaign_id"])).toContain(campaignId);
    const queued = await operator((tx) => tx`select queue_campaign_messages(${campaignId}, ${new Date()}) as n`);
    return Number(queued[0]!["n"]);
  }

  it("queues only the guests the owner chose: right audience, opted in, not erased", async () => {
    const t = await setup(
      [
        { name: "Newly Joined", joinedDaysAgo: 0 },
        { name: "Joined Long Ago", joinedDaysAgo: 60 },
        { name: "Opted Out", optedIn: false, joinedDaysAgo: 0 },
        { name: "Erased Guest", erased: true, joinedDaysAgo: 0 },
      ],
      { audience: { type: "new", days: 7 } },
    );
    expect(await queue(t.campaignId, t.scheduledAt)).toBe(1);
    const rows = await db.owner`select membership_id from message where campaign_id = ${t.campaignId}`;
    expect(rows.map((row) => row["membership_id"])).toEqual([t.memberships[0]]);
  });

  it("a campaign saved without a time is still picked up, and a rerun queues nothing twice", async () => {
    const t = await setup([{ name: "Sam Smith" }, { name: "Lee Jones" }]);
    await db.owner`update campaign set scheduled_at = null where id = ${t.campaignId}`;
    const due = new Date(Date.now() + 3_600_000);
    const claimed = await operator((tx) => tx`select campaign_id from claim_due_campaigns(${due}, 100)`);
    expect(claimed.map((row) => row["campaign_id"])).toContain(t.campaignId);
    const first = await operator((tx) => tx`select queue_campaign_messages(${t.campaignId}, ${new Date()}) as n`);
    expect(Number(first[0]!["n"])).toBe(2);
    const again = await operator((tx) => tx`select queue_campaign_messages(${t.campaignId}, ${new Date()}) as n`);
    expect(Number(again[0]!["n"])).toBe(0);
    const [count] = await db.owner`select count(*)::int as n from message where campaign_id = ${t.campaignId}`;
    expect(count!["n"]).toBe(2);
  });

  it("two overlapping dispatchers never claim the same text", async () => {
    const t = await setup(Array.from({ length: 6 }, (_, i) => ({ name: `Guest ${i} Name` })), { status: "sending" });
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments)
      select ${t.campaignId}, ${t.restaurantId}, m, 'sms', 'queued', 1 from unnest(${t.memberships}::uuid[]) as m
    `;
    const when = new Date();
    let fromSecond: Record<string, unknown>[] = [];
    const fromFirst = await asApp(
      db.app,
      { operator: true },
      async (tx) => {
        const mine = await tx`select message_id from claim_queued_messages(${when}, 3, 3)`;
        // The first claim is still open (not committed) while the second dispatcher runs.
        fromSecond = await second.begin(async (other) => {
          await other`select set_config('app.is_operator', 'true', true)`;
          return other`select message_id from claim_queued_messages(${when}, 3, 3)`;
        });
        return mine;
      },
      { rollback: false },
    );
    const a = fromFirst.map((row) => row["message_id"] as string);
    const b = fromSecond.map((row) => row["message_id"] as string);
    expect(a.length).toBe(3);
    expect(b.length).toBe(3);
    expect(new Set([...a, ...b]).size).toBe(6);
  });

  it("a claimed text carries the guest's name and moves to sending with one attempt", async () => {
    const t = await setup([{ name: "Thandi Nkosi" }], { status: "sending" });
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments)
      values (${t.campaignId}, ${t.restaurantId}, ${t.memberships[0]!}, 'sms', 'queued', 1)
    `;
    const [own] = await db.owner`select id from message where campaign_id = ${t.campaignId}`;
    const rows = await operator((tx) => tx`select * from claim_queued_messages(${new Date()}, 100, 3)`);
    const mine = rows.find((row) => row["message_id"] === own!["id"]);
    expect(mine).toBeDefined();
    expect(mine!["first_name"]).toBe("Thandi Nkosi");
    expect(mine!["attempt"]).toBe(1);
    const [state] = await db.owner`select status from message where campaign_id = ${t.campaignId}`;
    expect(state!["status"]).toBe("sending");
  });

  it("a text stuck in sending is failed, never sent again, and not charged", async () => {
    const t = await setup([{ name: "Stuck Guest" }], { status: "sending", reserveCents: 35 });
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments, attempts, last_attempt_at)
      values (${t.campaignId}, ${t.restaurantId}, ${t.memberships[0]!}, 'sms', 'sending', 1, 1, now() - interval '1 hour')
    `;
    const n = await operator((tx) => tx`select fail_stale_sending(${new Date()}, 15) as n`);
    expect(Number(n[0]!["n"])).toBeGreaterThanOrEqual(1);
    const [state] = await db.owner`select status, error_code from message where campaign_id = ${t.campaignId}`;
    expect(state).toMatchObject({ status: "failed", error_code: "send_unknown" });
    const claimed = await operator((tx) => tx`select message_id from claim_queued_messages(${new Date()}, 100, 3)`);
    const [msg] = await db.owner`select id from message where campaign_id = ${t.campaignId}`;
    expect(claimed.map((row) => row["message_id"])).not.toContain(msg!["id"]);
  });

  it("settling charges the real cost, gives back the whole hold, and does nothing the second time", async () => {
    // 3 guests x 2 segments x 35 = 210 held. Two texts sent (35 x 2 segments each) and one failed.
    const t = await setup([{ name: "A One" }, { name: "B Two" }, { name: "C Three" }], {
      status: "sending",
      reserveCents: 210,
    });
    const [m1, m2, m3] = t.memberships as [string, string, string];
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments, cost_cents) values
        (${t.campaignId}, ${t.restaurantId}, ${m1}, 'sms', 'sent', 2, 70),
        (${t.campaignId}, ${t.restaurantId}, ${m2}, 'sms', 'delivered', 2, 70),
        (${t.campaignId}, ${t.restaurantId}, ${m3}, 'sms', 'failed', 2, 0)
    `;
    const first = await operator((tx) => tx`select settle_campaign(${t.campaignId}) as outcome`);
    expect(first[0]!["outcome"]).toBe("sent");
    const second = await operator((tx) => tx`select settle_campaign(${t.campaignId}) as outcome`);
    expect(second[0]!["outcome"]).toBe("sent");

    const entries = await db.owner`
      select entry_type::text as kind, amount_cents from credit_ledger where campaign_id = ${t.campaignId} order by amount_cents
    `;
    expect(entries.map((row) => [row["kind"], row["amount_cents"]])).toEqual([
      ["reserve", -210],
      ["charge", -140],
      ["release", 210],
    ]);
    const [balance] = await db.owner`select available_cents from restaurant_credit_balance where restaurant_id = ${t.restaurantId}`;
    expect(balance!["available_cents"]).toBe(10000 - 140);
    const [campaign] = await db.owner`select status, actual_cost_cents from campaign where id = ${t.campaignId}`;
    expect(campaign).toMatchObject({ status: "sent", actual_cost_cents: 140 });
  });

  it("a campaign where nothing was delivered is failed and the whole hold comes back", async () => {
    const t = await setup([{ name: "Nobody Home" }], { status: "sending", reserveCents: 35 });
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments, cost_cents)
      values (${t.campaignId}, ${t.restaurantId}, ${t.memberships[0]!}, 'sms', 'failed', 1, 0)
    `;
    const outcome = await operator((tx) => tx`select settle_campaign(${t.campaignId}) as outcome`);
    expect(outcome[0]!["outcome"]).toBe("failed");
    const [balance] = await db.owner`select available_cents from restaurant_credit_balance where restaurant_id = ${t.restaurantId}`;
    expect(balance!["available_cents"]).toBe(10000);
  });

  it("does not settle while a text is still waiting", async () => {
    const t = await setup([{ name: "Waiting Guest" }], { status: "sending", reserveCents: 35 });
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments)
      values (${t.campaignId}, ${t.restaurantId}, ${t.memberships[0]!}, 'sms', 'queued', 1)
    `;
    const outcome = await operator((tx) => tx`select settle_campaign(${t.campaignId}) as outcome`);
    expect(outcome[0]!["outcome"]).toBe("pending");
  });

  it("refuses every sending function for a caller that is not the operator", async () => {
    const calls = [
      (tx: Sql) => tx`select * from claim_queued_messages(now(), 5, 3)`,
      (tx: Sql) => tx`select finish_message_send(gen_random_uuid(), 'x', 1, 1)`,
      (tx: Sql) => tx`select fail_message_send(gen_random_uuid(), true, 'x')`,
      (tx: Sql) => tx`select fail_stale_sending(now(), 15)`,
      (tx: Sql) => tx`select settle_campaign(gen_random_uuid())`,
    ];
    for (const call of calls) {
      const error = await asApp(db.app, {}, async (tx) => call(tx as unknown as Sql)).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).not.toBeNull();
      const cause = (error as { cause?: { code?: string } }).cause;
      expect(cause?.code ?? (error as { code?: string }).code).toBe("42501");
    }
  });

  describe("a full dispatch run with a fake provider", () => {
    // Fixed daytime clock (11:00 SAST, in the past so it never picks up other tests' campaigns) so it
    // never depends on the real hour.
    const DAY = Date.UTC(2026, 0, 15, 9, 0);

    function fakeProvider(failFirst = 0) {
      const sent: SmsMessage[] = [];
      let failures = failFirst;
      const provider: SmsProvider = {
        name: "fake",
        async send(message: SmsMessage) {
          if (failures > 0) {
            failures -= 1;
            throw new Error("provider down");
          }
          sent.push(message);
          return { providerMessageId: `fake-${message.reference}`, segments: 1 };
        },
        async parseDeliveryWebhook() {
          return [];
        },
        async parseInboundWebhook() {
          return [];
        },
        async verifyWebhook() {
          return true;
        },
      };
      return { provider, sent };
    }

    async function dueRestaurant() {
      const t = await setup([{ name: "Thandi Nkosi" }, { name: "Not Opted", optedIn: false }], { reserveCents: 35 });
      await db.owner`update campaign set scheduled_at = ${new Date(DAY - 3_600_000)} where id = ${t.campaignId}`;
      return t;
    }

    it("sends the filled-in text with the STOP line once, then settles the money", async () => {
      const t = await dueRestaurant();
      const { provider, sent } = fakeProvider();
      const run = await runLiveDispatch(appUrl!, {}, DAY, provider);
      expect(run.claimed).toBeGreaterThanOrEqual(1);
      const mine = sent.filter((message) => message.body.startsWith("Hi Thandi"));
      expect(mine).toHaveLength(1);
      expect(mine[0]!.body).toBe(`Hi Thandi, come back soon.${STOP_FOOTER}`);
      expect(sent.some((message) => message.body.includes("{first_name}"))).toBe(false);

      // Running again sends nothing twice.
      const again = fakeProvider();
      await runLiveDispatch(appUrl!, {}, DAY + 60_000, again.provider);
      expect(again.sent.filter((message) => message.body.startsWith("Hi Thandi"))).toHaveLength(0);

      const messages = await db.owner`select status, cost_cents, provider_message_id from message where campaign_id = ${t.campaignId}`;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ status: "sent", cost_cents: 35 });

      await runLiveSettle(appUrl!);
      const [campaign] = await db.owner`select status, actual_cost_cents from campaign where id = ${t.campaignId}`;
      expect(campaign).toMatchObject({ status: "sent", actual_cost_cents: 35 });
      const [balance] = await db.owner`select available_cents from restaurant_credit_balance where restaurant_id = ${t.restaurantId}`;
      expect(balance!["available_cents"]).toBe(10000 - 35);
    });

    it("tries a failed send again on the next run, and gives up after three tries", async () => {
      const t = await dueRestaurant();
      const flaky = fakeProvider(1);
      await runLiveDispatch(appUrl!, {}, DAY, flaky.provider);
      const [afterOne] = await db.owner`select status, attempts from message where campaign_id = ${t.campaignId}`;
      expect(afterOne).toMatchObject({ status: "queued", attempts: 1 });

      const down = fakeProvider(10);
      await runLiveDispatch(appUrl!, {}, DAY + 60_000, down.provider);
      await runLiveDispatch(appUrl!, {}, DAY + 120_000, down.provider);
      const [afterThree] = await db.owner`select status, attempts, error_code from message where campaign_id = ${t.campaignId}`;
      expect(afterThree).toMatchObject({ status: "failed", attempts: 3, error_code: "send_error" });
    });

    it("waits through quiet hours and sends nothing", async () => {
      const t = await dueRestaurant();
      const night = Date.UTC(2026, 0, 15, 1, 0); // 03:00 SAST, after the campaign was due
      await db.owner`update campaign set scheduled_at = ${new Date(night - 3_600_000)} where id = ${t.campaignId}`;
      const { provider, sent } = fakeProvider();
      const run = await runLiveDispatch(appUrl!, {}, night, provider);
      expect(sent).toHaveLength(0);
      expect(run.sent).toBe(0);
      const [state] = await db.owner`select status from message where campaign_id = ${t.campaignId}`;
      expect(state!["status"]).toBe("queued");
    });
  });
});
