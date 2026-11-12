// @vitest-environment node
// Real database tests for the finished sending work (migration 0033): push messages, the "Both"
// channel with its text fallback, creating campaigns on each channel, the safe recipient count,
// held delivery reports, the STOP reply lookup and the nightly low-credit check. Runs on GitHub for
// every push. Skips on a laptop unless both database addresses are set.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { runLiveDispatch } from "../../server/live-dispatch";
import { runLiveSettle } from "../../server/live-settle";
import { runLiveNightly } from "../../server/live-nightly";
import type { SmsMessage, SmsProvider } from "../../server/sms/types";
import type { PushChannel, SendOutcome } from "../../server/push/channel";
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
  token,
  type DbConnections,
  type Fixtures,
  type Sql,
} from "../db-fixture";

// The app's withContext uses the Neon WebSocket driver, which CI Postgres does not serve. This runs
// the same steps over the app_user role with the standard Postgres driver (same as sending-flow).
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

type Channel = "sms" | "push" | "both";
type Guest = {
  name: string;
  /** Said yes to texts. Default yes. */
  sms?: boolean;
  /** How many devices the guest has subscribed. Default none. */
  devices?: number;
};

describe.skipIf(!dbTestsEnabled)("finished sending (real database)", () => {
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

  // Fixed daytime clock (11:00 SAST) well in the past, so a run never picks up other tests' campaigns.
  const DAY = Date.UTC(2026, 0, 15, 9, 0);
  const code = () => `F${token().toUpperCase().replace(/[^A-Z0-9]/g, "")}`.slice(0, 12);
  const operator = <T>(work: (tx: Parameters<Parameters<typeof asApp>[2]>[0]) => Promise<T>) =>
    asApp(db.app, { operator: true }, work, { rollback: false });

  /** A live restaurant with R100 credit, guests (with devices if asked) and a campaign due before DAY. */
  async function setup(guests: Guest[], options: { channel?: Channel; reserveCents?: number; status?: "scheduled" | "sending" } = {}) {
    const restaurant = await makeRestaurant(db.owner, fixtures, { status: "active", name: "Smoke Cafe" });
    const restaurantId = restaurant.id;
    const memberships: string[] = [];
    const endpoints: string[][] = [];
    for (const guest of guests) {
      const { id: customerId } = await makeGuest(db.owner, fixtures);
      await db.owner`update customer set name = ${guest.name} where id = ${customerId}`;
      const membershipId = await makeMembership(db.owner, restaurantId, customerId);
      const devices = guest.devices ?? 0;
      await db.owner`
        update membership set
          marketing_sms = ${guest.sms === false ? "opted_out" : "opted_in"},
          marketing_push = ${devices > 0 ? "opted_in" : "opted_out"}
        where id = ${membershipId}
      `;
      const own: string[] = [];
      for (let i = 0; i < devices; i += 1) {
        const endpoint = `https://push.test/${token()}`;
        own.push(endpoint);
        await db.owner`
          insert into push_subscription (customer_id, endpoint, p256dh, auth) values (${customerId}, ${endpoint}, 'p', 'a')
        `;
      }
      memberships.push(membershipId);
      endpoints.push(own);
    }
    const [campaign] = await db.owner`
      insert into campaign (restaurant_id, name, message_body, channel, audience, code, status, scheduled_at,
                            est_recipients, est_segments, est_cost_cents, created_by)
      values (${restaurantId}, 'Finish test', 'Hi {first_name}, come back soon.', ${options.channel ?? "sms"},
              ${db.owner.json({ type: "everyone" } as never)}, ${code()}, ${options.status ?? "scheduled"},
              ${new Date(DAY - 3_600_000)}, ${guests.length}, 1, ${options.reserveCents ?? 0}, 'test')
      returning id
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
    return { restaurantId, slug: restaurant.slug, campaignId, memberships, endpoints };
  }

  function fakePush(outcomes: Record<string, SendOutcome> = {}) {
    const calls: Array<{ endpoint: string; title: string; body: string; url: string }> = [];
    const channel: PushChannel = {
      async send(subscription, payload) {
        calls.push({ endpoint: subscription.endpoint, ...payload });
        return outcomes[subscription.endpoint] ?? "delivered";
      },
    };
    return { channel, calls };
  }

  function fakeSms() {
    const sent: SmsMessage[] = [];
    const provider: SmsProvider = {
      name: "fake",
      async send(message: SmsMessage) {
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

  const messagesOf = (campaignId: string) =>
    db.owner`
      select m.channel, m.status, m.error_code, m.attempts, m.cost_cents, m.membership_id
      from message m where m.campaign_id = ${campaignId} order by m.channel, m.membership_id
    `;

  it("a push campaign reaches only guests with push consent and a live device", async () => {
    const t = await setup(
      [
        { name: "Has Device", devices: 1 },
        { name: "Text Only" },
        { name: "Device But Opted Out", devices: 1 },
      ],
      { channel: "push" },
    );
    await db.owner`update membership set marketing_push = 'opted_out' where id = ${t.memberships[2]!}`;
    const claimed = await operator((tx) => tx`select campaign_id from claim_due_campaigns(${new Date(DAY)}, 100)`);
    expect(claimed.map((row) => row["campaign_id"])).toContain(t.campaignId);
    const queued = await operator((tx) => tx`select queue_campaign_messages(${t.campaignId}, ${new Date(DAY)}) as n`);
    expect(Number(queued[0]!["n"])).toBe(1);
    const rows = await messagesOf(t.campaignId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "push", status: "queued", membership_id: t.memberships[0] });
    // A rerun queues nothing twice.
    const again = await operator((tx) => tx`select queue_campaign_messages(${t.campaignId}, ${new Date(DAY)}) as n`);
    expect(Number(again[0]!["n"])).toBe(0);
  });

  it("a push-only run delivers, shows the restaurant and the offer, costs nothing and settles without a charge", async () => {
    const t = await setup([{ name: "Thandi Nkosi", devices: 1 }], { channel: "push" });
    const push = fakePush();
    const text = fakeSms();
    const run = await runLiveDispatch(appUrl!, {}, DAY, text.provider, push.channel);
    expect(run.pushSent).toBeGreaterThanOrEqual(1);
    const mine = push.calls.filter((call) => t.endpoints[0]!.includes(call.endpoint));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: "Smoke Cafe", body: "Hi Thandi, come back soon.", url: `/r/${t.slug}` });
    expect(mine[0]!.body).not.toContain("STOP");
    expect(text.sent.filter((message) => message.body.startsWith("Hi Thandi"))).toHaveLength(0);

    // Running again sends nothing twice.
    const again = fakePush();
    await runLiveDispatch(appUrl!, {}, DAY + 60_000, text.provider, again.channel);
    expect(again.calls.filter((call) => t.endpoints[0]!.includes(call.endpoint))).toHaveLength(0);

    const rows = await messagesOf(t.campaignId);
    expect(rows[0]).toMatchObject({ channel: "push", status: "sent", cost_cents: 0 });

    await runLiveSettle(appUrl!);
    const [campaign] = await db.owner`select status, actual_cost_cents from campaign where id = ${t.campaignId}`;
    expect(campaign).toMatchObject({ status: "sent", actual_cost_cents: 0 });
    const ledger = await db.owner`select entry_type from credit_ledger where campaign_id = ${t.campaignId}`;
    expect(ledger).toHaveLength(0);
    const [balance] = await db.owner`select available_cents from restaurant_credit_balance where restaurant_id = ${t.restaurantId}`;
    expect(balance!["available_cents"]).toBe(10000);
  });

  it("a device that says it is gone is switched off, and one working device is enough", async () => {
    const t = await setup([{ name: "Two Devices", devices: 2 }], { channel: "push" });
    const [gone, working] = t.endpoints[0]!;
    const push = fakePush({ [gone!]: "gone" });
    await runLiveDispatch(appUrl!, {}, DAY, fakeSms().provider, push.channel);
    const rows = await messagesOf(t.campaignId);
    expect(rows[0]).toMatchObject({ status: "sent" });
    const [goneRow] = await db.owner`select disabled_at from push_subscription where endpoint = ${gone!}`;
    const [workingRow] = await db.owner`select disabled_at from push_subscription where endpoint = ${working!}`;
    expect(goneRow!["disabled_at"]).not.toBeNull();
    expect(workingRow!["disabled_at"]).toBeNull();
  });

  it("Both: texts only the guests the push cannot reach, once, and settles the real text cost", async () => {
    const t = await setup(
      [
        { name: "Pushed Guest", devices: 1 },
        { name: "Text Only Guest" },
        { name: "Push Fails Guest", devices: 1 },
      ],
      { channel: "both", reserveCents: 105 },
    );
    const failing = t.endpoints[2]![0]!;
    const push = fakePush({ [failing]: "gone" });
    const text = fakeSms();
    await runLiveDispatch(appUrl!, {}, DAY, text.provider, push.channel);

    const texted = text.sent.map((message) => message.body.slice(0, 8));
    expect(texted.filter((body) => body.startsWith("Hi Text"))).toHaveLength(1);
    expect(texted.filter((body) => body.startsWith("Hi Push,"))).toHaveLength(1); // the guest whose push failed
    expect(texted.filter((body) => body.startsWith("Hi Pushed"))).toHaveLength(0);

    const rows = await messagesOf(t.campaignId);
    const byGuest = (membership: string) => rows.filter((row) => row["membership_id"] === membership);
    expect(byGuest(t.memberships[0]!).map((row) => `${row["channel"]}:${row["status"]}`)).toEqual(["push:sent"]);
    expect(byGuest(t.memberships[1]!).map((row) => `${row["channel"]}:${row["status"]}`)).toEqual(["sms:sent"]);
    expect(byGuest(t.memberships[2]!).map((row) => `${row["channel"]}:${row["status"]}`).sort()).toEqual(["push:failed", "sms:sent"]);

    await runLiveSettle(appUrl!);
    const [campaign] = await db.owner`select status, actual_cost_cents from campaign where id = ${t.campaignId}`;
    expect(campaign).toMatchObject({ status: "sent", actual_cost_cents: 70 });
    const [balance] = await db.owner`select available_cents from restaurant_credit_balance where restaurant_id = ${t.restaurantId}`;
    expect(balance!["available_cents"]).toBe(10000 - 70);
  });

  it("Both: a push that keeps asking to retry is tried three times, then the guest is texted", async () => {
    const t = await setup([{ name: "Retry Guest", devices: 1 }], { channel: "both", reserveCents: 35 });
    const device = t.endpoints[0]![0]!;
    const push = fakePush({ [device]: "retry" });
    const text = fakeSms();
    await runLiveDispatch(appUrl!, {}, DAY, text.provider, push.channel);
    expect((await messagesOf(t.campaignId)).map((row) => `${row["channel"]}:${row["status"]}:${row["attempts"]}`)).toEqual(["push:queued:1"]);
    await runLiveDispatch(appUrl!, {}, DAY + 60_000, text.provider, push.channel);
    expect((await messagesOf(t.campaignId)).map((row) => `${row["channel"]}:${row["status"]}:${row["attempts"]}`)).toEqual(["push:queued:2"]);
    expect(text.sent.filter((message) => message.body.startsWith("Hi Retry"))).toHaveLength(0);
    await runLiveDispatch(appUrl!, {}, DAY + 120_000, text.provider, push.channel);
    const rows = await messagesOf(t.campaignId);
    expect(rows.map((row) => `${row["channel"]}:${row["status"]}`).sort()).toEqual(["push:failed", "sms:sent"]);
    expect(text.sent.filter((message) => message.body.startsWith("Hi Retry"))).toHaveLength(1);
  });

  it("without push keys a push campaign fails cleanly, and Both falls back to a text", async () => {
    const pushOnly = await setup([{ name: "No Keys Guest", devices: 1 }], { channel: "push" });
    const both = await setup([{ name: "Fallback Guest", devices: 1 }], { channel: "both", reserveCents: 35 });
    const text = fakeSms();
    // No channel passed and no VAPID keys in the environment.
    await runLiveDispatch(appUrl!, {}, DAY, text.provider);
    expect((await messagesOf(pushOnly.campaignId))[0]).toMatchObject({ channel: "push", status: "failed", error_code: "push_not_configured" });
    expect(text.sent.filter((message) => message.body.startsWith("Hi No Keys"))).toHaveLength(0);
    expect(text.sent.filter((message) => message.body.startsWith("Hi Fallback"))).toHaveLength(1);
    await runLiveSettle(appUrl!);
    const [failed] = await db.owner`select status from campaign where id = ${pushOnly.campaignId}`;
    expect(failed!["status"]).toBe("failed");
    const [sent] = await db.owner`select status from campaign where id = ${both.campaignId}`;
    expect(sent!["status"]).toBe("sent");
  });

  it("push waits through quiet hours like texts do", async () => {
    const t = await setup([{ name: "Night Guest", devices: 1 }], { channel: "push" });
    const night = Date.UTC(2026, 0, 15, 1, 0); // 03:00 SAST, after the campaign was due
    await db.owner`update campaign set scheduled_at = ${new Date(night - 3_600_000)} where id = ${t.campaignId}`;
    const push = fakePush();
    await runLiveDispatch(appUrl!, {}, night, fakeSms().provider, push.channel);
    expect(push.calls.filter((call) => t.endpoints[0]!.includes(call.endpoint))).toHaveLength(0);
    expect((await messagesOf(t.campaignId))[0]).toMatchObject({ status: "queued" });
  });

  it("two overlapping dispatchers never claim the same push", async () => {
    const t = await setup(
      Array.from({ length: 6 }, (_, i) => ({ name: `Push Guest ${i}`, devices: 1 })),
      { channel: "push", status: "sending" },
    );
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments, cost_cents)
      select ${t.campaignId}, ${t.restaurantId}, m, 'push', 'queued', 0, 0 from unnest(${t.memberships}::uuid[]) as m
    `;
    const when = new Date();
    let fromSecond: Record<string, unknown>[] = [];
    const fromFirst = await asApp(
      db.app,
      { operator: true },
      async (tx) => {
        const mine = await tx`select message_id from claim_queued_push(${when}, 3, 3)`;
        // The first claim is still open while the second dispatcher runs.
        fromSecond = await second.begin(async (other) => {
          await other`select set_config('app.is_operator', 'true', true)`;
          return other`select message_id from claim_queued_push(${when}, 3, 3)`;
        });
        return mine;
      },
      { rollback: false },
    );
    const a = new Set(fromFirst.map((row) => row["message_id"] as string));
    const b = new Set(fromSecond.map((row) => row["message_id"] as string));
    expect(a.size).toBe(3);
    expect(b.size).toBe(3);
    expect(new Set([...a, ...b]).size).toBe(6);
  });

  describe("creating campaigns on each channel", () => {
    it("push costs nothing and holds no credit, text and Both hold the text cost, a bad channel is refused", async () => {
      const t = await setup([{ name: "Alpha One", devices: 1 }, { name: "Beta Two" }], { channel: "sms" });
      const owner = await makeAppUser(db.owner, fixtures, { role: "owner", restaurantId: t.restaurantId });
      const create = (channel: string, segments = 1) =>
        asApp(db.app, { restaurantId: t.restaurantId }, async (tx) => {
          const row = await tx`
            select create_campaign(${t.restaurantId}::uuid, ${owner}, 'Chan', 'Hi {first_name}', '{"type":"everyone"}'::jsonb,
              ${code()}, now() + interval '2 hours', ${segments}::integer, ${channel}) as id
          `;
          const id = row[0]!["id"] as string;
          const [c] = await tx`select channel, est_recipients, est_cost_cents from campaign where id = ${id}`;
          const reserve = await tx`select amount_cents from credit_ledger where campaign_id = ${id} and entry_type = 'reserve'`;
          return { c: c!, reserve: reserve.map((r) => r["amount_cents"] as number) };
        });

      const push = await create("push");
      expect(push.c).toMatchObject({ channel: "push", est_recipients: 1, est_cost_cents: 0 });
      expect(push.reserve).toEqual([]);
      const sms = await create("sms", 2);
      expect(sms.c).toMatchObject({ channel: "sms", est_recipients: 2, est_cost_cents: 140 });
      expect(sms.reserve).toEqual([-140]);
      const both = await create("both");
      expect(both.c).toMatchObject({ channel: "both", est_recipients: 2, est_cost_cents: 70 });
      expect(both.reserve).toEqual([-70]);

      const bad = await create("email").then(() => null, (error: unknown) => error);
      expect((bad as Error).message).toBe("invalid_channel");
    });

    it("push needs no credit, text and Both are refused when the credit is short", async () => {
      const t = await setup([{ name: "Gamma Three", devices: 1 }, { name: "Delta Four" }], { channel: "sms" });
      await db.owner`
        insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, created_by)
        values (${t.restaurantId}, 'adjustment', -10000, ${`drain:${t.campaignId}`}, 'test')
      `;
      const owner = await makeAppUser(db.owner, fixtures, { role: "owner", restaurantId: t.restaurantId });
      const create = (channel: string) =>
        asApp(db.app, { restaurantId: t.restaurantId }, (tx) =>
          tx`select create_campaign(${t.restaurantId}::uuid, ${owner}, 'Broke', 'Hi', '{"type":"everyone"}'::jsonb,
               ${code()}, now() + interval '2 hours', 1::integer, ${channel}) as id`,
        );
      await expect(create("push")).resolves.toBeDefined();
      for (const channel of ["sms", "both"]) {
        const error = await create(channel).then(() => null, (caught: unknown) => caught);
        expect((error as Error).message).toBe("not_enough_credit");
      }
    });

    it("the owner's recipient count works for their own restaurant and refuses another's", async () => {
      const a = await setup([{ name: "Count One", devices: 1 }, { name: "Count Two" }, { name: "Count Three", sms: false, devices: 1 }]);
      const b = await setup([{ name: "Other Place" }]);
      const counts = await asApp(db.app, { restaurantId: a.restaurantId }, (tx) =>
        tx`select sms_count, push_count, either_count from count_campaign_recipients(${a.restaurantId}::uuid, '{"type":"everyone"}'::jsonb)`,
      );
      expect(counts[0]).toMatchObject({ sms_count: 2, push_count: 2, either_count: 3 });
      const refused = await asApp(db.app, { restaurantId: a.restaurantId }, (tx) =>
        tx`select * from count_campaign_recipients(${b.restaurantId}::uuid, '{"type":"everyone"}'::jsonb)`,
      ).then(() => null, (error: unknown) => error);
      expect((refused as { cause?: { code?: string } }).cause?.code ?? (refused as { code?: string }).code).toBe("42501");
      // The audience function itself is not open to the app login (that was the old bug).
      const direct = await asApp(db.app, { restaurantId: a.restaurantId }, (tx) =>
        tx`select * from campaign_audience_ids(${a.restaurantId}::uuid, '{"type":"everyone"}'::jsonb, now())`,
      ).then(() => null, (error: unknown) => error);
      expect((direct as { cause?: { code?: string } }).cause?.code ?? (direct as { code?: string }).code).toBe("42501");
    });
  });

  describe("delivery reports that arrive early", () => {
    /** A text that has been claimed and is being sent, like the moment before the provider answers. */
    async function sendingText() {
      const t = await setup([{ name: "Receipt Guest" }], { status: "sending", reserveCents: 35 });
      await db.owner`
        insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments, attempts, last_attempt_at)
        values (${t.campaignId}, ${t.restaurantId}, ${t.memberships[0]!}, 'sms', 'sending', 1, 1, now())
      `;
      const [row] = await db.owner`select id from message where campaign_id = ${t.campaignId}`;
      return { ...t, messageId: row!["id"] as string };
    }
    const holdIt = (id: string, status: string, error: string | null = null) =>
      operator((tx) => tx`select hold_receipt('bulksms', ${id}, ${status}, ${error}) as held`);

    it("is kept, then applied the moment the provider's id is saved", async () => {
      const t = await sendingText();
      const providerId = `race-${token()}`;
      const held = await holdIt(providerId, "delivered");
      expect(held[0]!["held"]).toBe(true);
      await operator((tx) => tx`select finish_message_send(${t.messageId}::uuid, ${providerId}, 35, 1)`);
      const [message] = await db.owner`select status, delivered_at, cost_cents from message where id = ${t.messageId}`;
      expect(message).toMatchObject({ status: "delivered", cost_cents: 35 });
      expect(message!["delivered_at"]).not.toBeNull();
      const left = await db.owner`select id from pending_receipt where provider_message_id = ${providerId}`;
      expect(left).toHaveLength(0);
    });

    it("a failed report that came first still fails the text, with its error", async () => {
      const t = await sendingText();
      const providerId = `race-${token()}`;
      await holdIt(providerId, "failed", "21");
      await operator((tx) => tx`select finish_message_send(${t.messageId}::uuid, ${providerId}, 35, 1)`);
      const [message] = await db.owner`select status, error_code from message where id = ${t.messageId}`;
      expect(message).toMatchObject({ status: "failed", error_code: "21" });
    });

    it("a repeat of a report already applied changes nothing and is not kept", async () => {
      const t = await sendingText();
      const providerId = `race-${token()}`;
      await operator((tx) => tx`select finish_message_send(${t.messageId}::uuid, ${providerId}, 35, 1)`);
      const first = await operator((tx) => tx`select record_delivery('bulksms', ${providerId}, 'delivered', null, null, null) as applied`);
      expect(first[0]!["applied"]).toBe(true);
      const repeat = await operator((tx) => tx`select record_delivery('bulksms', ${providerId}, 'delivered', null, null, null) as applied`);
      expect(repeat[0]!["applied"]).toBe(false);
      const held = await holdIt(providerId, "delivered");
      expect(held[0]!["held"]).toBe(false);
      const kept = await db.owner`select id from pending_receipt where provider_message_id = ${providerId}`;
      expect(kept).toHaveLength(0);
    });

    it("a report no text ever claims is cleared after a day by the nightly run", async () => {
      const oldId = `stale-${token()}`;
      const freshId = `fresh-${token()}`;
      await db.owner`
        insert into pending_receipt (provider, provider_message_id, status, received_at)
        values ('bulksms', ${oldId}, 'delivered', now() - interval '25 hours'), ('bulksms', ${freshId}, 'delivered', now())
      `;
      const result = await runLiveNightly(appUrl!, Date.now());
      expect(result.purged).toBeGreaterThanOrEqual(1);
      expect(await db.owner`select id from pending_receipt where provider_message_id = ${oldId}`).toHaveLength(0);
      expect(await db.owner`select id from pending_receipt where provider_message_id = ${freshId}`).toHaveLength(1);
      await db.owner`delete from pending_receipt where provider_message_id = ${freshId}`;
    });
  });

  it("the STOP reply names the restaurant that texted the guest last", async () => {
    const t = await setup([{ name: "Stop Guest" }], { status: "sending" });
    await db.owner`update restaurant set sms_sender_name = 'SmokeCafe' where id = ${t.restaurantId}`;
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments, sent_at)
      values (${t.campaignId}, ${t.restaurantId}, ${t.memberships[0]!}, 'sms', 'sent', 1, now())
    `;
    const [guest] = await db.owner`select c.phone_e164 from membership m join customer c on c.id = m.customer_id where m.id = ${t.memberships[0]!}`;
    const who = await operator((tx) => tx`select restaurant_name, sender from stop_reply_for(${guest!["phone_e164"] as string})`);
    expect(who[0]).toMatchObject({ restaurant_name: "Smoke Cafe", sender: "SmokeCafe" });
    const nobody = await operator((tx) => tx`select restaurant_name from stop_reply_for('+27000000000')`);
    expect(nobody).toHaveLength(0);
  });

  it("the nightly run warns each restaurant under R50 once a day, counting what is held for campaigns", async () => {
    const make = async (status: "active" | "draft", balance: number, held = 0) => {
      const r = await makeRestaurant(db.owner, fixtures, { status });
      if (balance !== 0) {
        await db.owner`
          insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, created_by)
          values (${r.id}, ${balance > 0 ? "topup" : "adjustment"}, ${balance}, ${`night:${r.id}`}, 'test')
        `;
      }
      if (held > 0) {
        const [c] = await db.owner`
          insert into campaign (restaurant_id, name, message_body, channel, audience, code, status, created_by)
          values (${r.id}, 'Held', 'Hi', 'sms', ${db.owner.json({ type: "everyone" } as never)}, ${code()}, 'scheduled', 'test') returning id
        `;
        await db.owner`
          insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference, campaign_id, created_by)
          values (${r.id}, 'reserve', ${-held}, ${`reserve:${c!["id"] as string}`}, ${c!["id"] as string}, 'test')
        `;
      }
      return r.id;
    };
    const low = await make("active", 4999);
    const exactly = await make("active", 5000);
    const heldBack = await make("active", 10000, 6000); // spendable is only R40
    const draft = await make("draft", 0);
    const alerts = async (id: string) =>
      db.owner`select meta from audit_event where restaurant_id = ${id} and action = 'low_credit_alert'`;

    const night = Date.UTC(2026, 5, 1, 4, 0);
    const first = await runLiveNightly(appUrl!, night);
    expect(first.alerted).toBeGreaterThanOrEqual(2);
    expect(await alerts(low)).toHaveLength(1);
    expect(await alerts(heldBack)).toHaveLength(1);
    expect(await alerts(exactly)).toHaveLength(0);
    expect(await alerts(draft)).toHaveLength(0);
    expect((await alerts(low))[0]!["meta"]).toMatchObject({ balance_cents: 4999, day: "2026-06-01" });

    // The same day again adds nothing. The next day warns again.
    await runLiveNightly(appUrl!, night + 3_600_000);
    expect(await alerts(low)).toHaveLength(1);
    await runLiveNightly(appUrl!, night + 86_400_000);
    expect(await alerts(low)).toHaveLength(2);
  });

  it("refuses every new sending function for a caller that is not the operator", async () => {
    const calls = [
      (tx: Sql) => tx`select * from claim_queued_push(now(), 5, 3)`,
      (tx: Sql) => tx`select finish_push_send(gen_random_uuid())`,
      (tx: Sql) => tx`select fail_push_send(gen_random_uuid(), true, 'x')`,
      (tx: Sql) => tx`select disable_push_subscription('https://push.test/x')`,
      (tx: Sql) => tx`select hold_receipt('bulksms', 'x', 'delivered', null)`,
      (tx: Sql) => tx`select * from stop_reply_for('+27820000000')`,
      (tx: Sql) => tx`select * from run_nightly_maintenance(now(), 5000)`,
      // Helpers only other functions call: the app login cannot run them at all.
      (tx: Sql) => tx`select queue_sms_fallback(gen_random_uuid())`,
      (tx: Sql) => tx`select end_push_message(gen_random_uuid(), false, 'x')`,
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

  it("a restaurant's owner cannot read or change another restaurant's held receipts or messages", async () => {
    const a = await setup([{ name: "Owner A Guest" }], { status: "sending" });
    const b = await setup([{ name: "Owner B Guest" }], { status: "sending" });
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments)
      values (${b.campaignId}, ${b.restaurantId}, ${b.memberships[0]!}, 'sms', 'queued', 1)
    `;
    const seen = await asApp(db.app, { restaurantId: a.restaurantId }, async (tx) => {
      const messages = await tx`select id from message where campaign_id = ${b.campaignId}`;
      const receipts = await tx`select id from pending_receipt`.then(
        (rows) => rows,
        () => "denied" as const,
      );
      return { messages, receipts };
    }).catch(() => ({ messages: [], receipts: "denied" as const }));
    expect(seen.messages).toHaveLength(0);
    expect(seen.receipts === "denied" || (Array.isArray(seen.receipts) && seen.receipts.length === 0)).toBe(true);
  });
});
