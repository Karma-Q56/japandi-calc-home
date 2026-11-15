import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { withContext } from "@/server/db";
import type { Viewer } from "@/server/auth-viewer";
import {
  loadCampaignList,
  loadCampaignResults,
  loadCustomerList,
  loadCustomerProfile,
  loadMyCards,
  loadOwnerOverview,
} from "@/server/live-dashboard";
import { approveCampaign, cancelCampaign, revealPhone, withdrawSmsConsent } from "@/server/live-actions";
import { loadLoyaltySettings, saveLoyaltySettings } from "@/server/live-loyalty";
import { createItem, createSection, loadMenu, setItemAvailable } from "@/server/live-menu";

// Live checks run only against the DEV branch URL. The host must not
// equal PROD_DB_HOST. If the guard is missing, the file refuses to run rather
// than guessing. No URL, host or secret is printed.
function readEnvFile(name: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(resolve(process.cwd(), name), "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      const key = match?.[1];
      if (key) out[key] = (match?.[2] ?? "").replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return out;
}

const fileEnv = { ...readEnvFile(".dev.vars"), ...readEnvFile(".env") };
// The live suite is opt-in. A stale local DATABASE_URL_DEV must not turn a
// normal test run into a database test, so only the process environment counts.
const devUrl = process.env["DATABASE_URL_DEV"] ?? "";
const prodHost = (process.env["PROD_DB_HOST"] ?? fileEnv["PROD_DB_HOST"] ?? "")
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, "")
  .split("/")[0]
  ?.split(":")[0] ?? "";

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    throw new Error("Refusing live DB checks: DATABASE_URL_DEV is not a valid URL.");
  }
}

if (devUrl && !prodHost) {
  throw new Error("Refusing live DB checks: PROD_DB_HOST is required for the safety guard.");
}
if (devUrl && prodHost && hostOf(devUrl) === prodHost) {
  throw new Error("Refusing live DB checks: DATABASE_URL_DEV points at PROD_DB_HOST.");
}

const canRunLive = Boolean(devUrl && prodHost && hostOf(devUrl) !== prodHost);
const live = canRunLive ? describe : describe.skip;
const TIMEOUT = 180_000;
const previousDatabaseUrl = process.env["DATABASE_URL"];

type Fixture = {
  restaurantA: string;
  restaurantB: string;
  customerA: string;
  customerB: string;
  membershipA: string;
  membershipB: string;
  campaignApproveA: string;
  campaignCancelA: string;
  campaignB: string;
  sectionA: string;
  sectionB: string;
  itemA: string;
  itemB: string;
  feedbackA: string;
  feedbackB: string;
  slugA: string;
  slugB: string;
  phoneA: string;
  phoneB: string;
};

let fixture: Fixture;

if (canRunLive) {
  live("live dev database safety", () => {
    beforeAll(async () => {
      process.env["DATABASE_URL"] = devUrl;
      const suffix = randomUUID().replaceAll("-", "");
      const slugA = `safety-a-${suffix.slice(0, 16)}`;
      const slugB = `safety-b-${suffix.slice(0, 16)}`;
      const suffixDigits = `${String(Date.now()).slice(-4)}${randomInt(100, 999)}`;
      const phoneA = `+2782${suffixDigits}1`;
      const phoneB = `+2782${suffixDigits}2`;
      const feedbackA = `safety-feedback-a-${suffix}`;
      const feedbackB = `safety-feedback-b-${suffix}`;

      fixture = await withContext(
        { databaseUrl: devUrl, isOperator: true },
        async (transaction) => {
          const restaurantA = (
            await transaction.execute<{ id: string }>(sql`
              insert into restaurant (slug, name) values (${slugA}, 'Safety A') returning id
            `)
          ).rows[0]?.id;
          const restaurantB = (
            await transaction.execute<{ id: string }>(sql`
              insert into restaurant (slug, name) values (${slugB}, 'Safety B') returning id
            `)
          ).rows[0]?.id;
          if (!restaurantA || !restaurantB) throw new Error("Could not create test restaurants.");

          const customerA = (
            await transaction.execute<{ id: string }>(sql`
              insert into customer (user_id, phone_e164, name)
              values (${`safety-a-${suffix}`}, ${phoneA}, 'Safety Guest A')
              returning id
            `)
          ).rows[0]?.id;
          const customerB = (
            await transaction.execute<{ id: string }>(sql`
              insert into customer (user_id, phone_e164, name)
              values (${`safety-b-${suffix}`}, ${phoneB}, 'Safety Guest B')
              returning id
            `)
          ).rows[0]?.id;
          if (!customerA || !customerB) throw new Error("Could not create test customers.");

          const membershipA = (
            await transaction.execute<{ id: string }>(sql`
              insert into membership (restaurant_id, customer_id, marketing_sms)
              values (${restaurantA}, ${customerA}, 'opted_in') returning id
            `)
          ).rows[0]?.id;
          const membershipB = (
            await transaction.execute<{ id: string }>(sql`
              insert into membership (restaurant_id, customer_id, marketing_sms)
              values (${restaurantB}, ${customerB}, 'opted_in') returning id
            `)
          ).rows[0]?.id;
          if (!membershipA || !membershipB) throw new Error("Could not create test memberships.");

          const campaignApproveA = (
            await transaction.execute<{ id: string }>(sql`
              insert into campaign
                (restaurant_id, name, message_body, audience, code, status, requires_approval, created_by)
              values
                (${restaurantA}, 'Approve A', 'Test message A',
                 ${JSON.stringify({ type: "all_opted_in" })}::jsonb,
                 ${`APA${suffix.slice(0, 8).toUpperCase()}`}, 'pending_approval', true, 'safety-test')
              returning id
            `)
          ).rows[0]?.id;
          const campaignCancelA = (
            await transaction.execute<{ id: string }>(sql`
              insert into campaign
                (restaurant_id, name, message_body, audience, code, status, est_cost_cents, created_by)
              values
                (${restaurantA}, 'Cancel A', 'Test message C',
                 ${JSON.stringify({ type: "all_opted_in" })}::jsonb,
                 ${`CNA${suffix.slice(0, 8).toUpperCase()}`}, 'scheduled', 0, 'safety-test')
              returning id
            `)
          ).rows[0]?.id;
          const campaignB = (
            await transaction.execute<{ id: string }>(sql`
              insert into campaign
                (restaurant_id, name, message_body, audience, code, status, requires_approval, created_by)
              values
                (${restaurantB}, 'Campaign B', 'Test message B',
                 ${JSON.stringify({ type: "all_opted_in" })}::jsonb,
                 ${`CPB${suffix.slice(0, 8).toUpperCase()}`}, 'pending_approval', true, 'safety-test')
              returning id
            `)
          ).rows[0]?.id;
          if (!campaignApproveA || !campaignCancelA || !campaignB) {
            throw new Error("Could not create test campaigns.");
          }

          const sectionA = (
            await transaction.execute<{ id: string }>(sql`
              insert into menu_section (restaurant_id, name)
              values (${restaurantA}, 'Safety section A') returning id
            `)
          ).rows[0]?.id;
          const sectionB = (
            await transaction.execute<{ id: string }>(sql`
              insert into menu_section (restaurant_id, name)
              values (${restaurantB}, 'Safety section B') returning id
            `)
          ).rows[0]?.id;
          if (!sectionA || !sectionB) throw new Error("Could not create test menu sections.");

          const itemA = (
            await transaction.execute<{ id: string }>(sql`
              insert into menu_item (restaurant_id, section_id, name, price_cents)
              values (${restaurantA}, ${sectionA}, 'Safety item A', 1000) returning id
            `)
          ).rows[0]?.id;
          const itemB = (
            await transaction.execute<{ id: string }>(sql`
              insert into menu_item (restaurant_id, section_id, name, price_cents)
              values (${restaurantB}, ${sectionB}, 'Safety item B', 1000) returning id
            `)
          ).rows[0]?.id;
          if (!itemA || !itemB) throw new Error("Could not create test menu items.");

          return {
            restaurantA,
            restaurantB,
            customerA,
            customerB,
            membershipA,
            membershipB,
            campaignApproveA,
            campaignCancelA,
            campaignB,
            sectionA,
            sectionB,
            itemA,
            itemB,
            feedbackA,
            feedbackB,
            slugA,
            slugB,
            phoneA,
            phoneB,
          };
        },
      );

      // The feedback owner insert policy casts app.restaurant_id, so each
      // fixture needs a real restaurant context even though the operator
      // policy also passes.
      await withContext(
        { databaseUrl: devUrl, restaurantId: fixture.restaurantA, isOperator: true },
        async (transaction) => {
          await transaction.execute(sql`
            insert into feedback (id, restaurant_id, source, category, message, status, note)
            values (${feedbackA}, ${fixture.restaurantA}, 'owner', 'broken',
                    'Private note fixture A', 'planned', 'operator only A')
          `);
        },
      );
      await withContext(
        { databaseUrl: devUrl, restaurantId: fixture.restaurantB, isOperator: true },
        async (transaction) => {
          await transaction.execute(sql`
            insert into feedback (id, restaurant_id, source, category, message, status, note)
            values (${feedbackB}, ${fixture.restaurantB}, 'owner', 'broken',
                    'Private note fixture B', 'planned', 'operator only B')
          `);
        },
      );
    }, TIMEOUT);

    afterAll(async () => {
      try {
        if (fixture) {
          await withContext({ databaseUrl: devUrl, isOperator: true }, async (transaction) => {
            await transaction.execute(sql`
              delete from restaurant where id in (${fixture.restaurantA}, ${fixture.restaurantB})
            `);
            await transaction.execute(sql`
              delete from customer where id in (${fixture.customerA}, ${fixture.customerB})
            `);
          });
        }
      } finally {
        if (previousDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
        else process.env["DATABASE_URL"] = previousDatabaseUrl;
      }
    }, TIMEOUT);

    const ownerA = (): Viewer => ({
      userId: `safety-owner-a-${fixture.restaurantA}`,
      email: "owner-a@example.test",
      name: "Owner A",
      role: "owner",
      restaurantId: fixture.restaurantA,
      customerId: null,
      needsPhone: false,
    });
    const guestA = (): Viewer => ({
      userId: `safety-guest-a-${fixture.customerA}`,
      email: "guest-a@example.test",
      name: "Guest A",
      role: "guest",
      restaurantId: null,
      customerId: fixture.customerA,
      needsPhone: false,
    });

    it(
      "reads every live screen for restaurant A only",
      { timeout: TIMEOUT },
      async () => {
        const overview = await loadOwnerOverview(ownerA());
        expect(overview?.restaurantName).toBe("Safety A");
        expect(overview?.overview.nextCampaign?.id).not.toBe(fixture.campaignB);

        const cards = await loadMyCards(guestA());
        expect(cards?.cards.every((card) => card.restaurantSlug === fixture.slugA)).toBe(true);
        expect(cards?.cards.some((card) => card.restaurantSlug === fixture.slugB)).toBe(false);

        const customers = await loadCustomerList(ownerA());
        expect(customers?.rows.some((row) => row.customerId === fixture.customerB)).toBe(false);
        expect(customers?.rows.some((row) => row.customerId === fixture.customerA)).toBe(true);

        const campaigns = await loadCampaignList(ownerA());
        expect(campaigns?.campaigns.some((row) => row.id === fixture.campaignB)).toBe(false);
        expect(campaigns?.campaigns.some((row) => row.id === fixture.campaignApproveA)).toBe(true);

        const profile = await loadCustomerProfile(ownerA(), fixture.customerA);
        expect(profile?.restaurantName).toBe("Safety A");
        expect(profile?.membershipId).toBe(fixture.membershipA);
        expect(await loadCustomerProfile(ownerA(), fixture.customerB)).toBeNull();

        const results = await loadCampaignResults(ownerA(), fixture.campaignApproveA);
        expect(results?.campaign.id).toBe(fixture.campaignApproveA);
        expect(await loadCampaignResults(ownerA(), fixture.campaignB)).toBeNull();

        const loyalty = await loadLoyaltySettings(ownerA());
        expect(loyalty?.restaurantName).toBe("Safety A");

        const menu = await loadMenu(ownerA());
        expect(menu?.sections.some((section) => section.id === fixture.sectionA)).toBe(true);
        expect(menu?.sections.some((section) => section.id === fixture.sectionB)).toBe(false);
      },
    );

    it(
      "lets an owner withdraw SMS consent but never grant it",
      { timeout: TIMEOUT },
      async () => {
        const first = await withdrawSmsConsent(ownerA(), fixture.membershipA);
        expect(first).toEqual({ ok: true, enabled: false });

        const afterFirst = await withContext(
          { databaseUrl: devUrl, restaurantId: fixture.restaurantA, isOperator: false },
          async (transaction) => {
            const membership = await transaction.execute<{ marketing_sms: string }>(sql`
              select marketing_sms::text as marketing_sms
              from membership where id = ${fixture.membershipA}
            `);
            const consent = await transaction.execute<{ action: string }>(sql`
              select action::text as action
              from consent_event
              where membership_id = ${fixture.membershipA}
              order by created_at desc limit 1
            `);
            const audit = await transaction.execute<{ action: string }>(sql`
              select action from audit_event
              where object_id = ${fixture.membershipA} and action = 'consent_withdrawn'
              limit 1
            `);
            const consentCount = await transaction.execute<{ count: number }>(sql`
              select count(*)::int as count
              from consent_event where membership_id = ${fixture.membershipA}
            `);
            return {
              marketingSms: membership.rows[0]?.marketing_sms,
              consentAction: consent.rows[0]?.action,
              consentCount: Number(consentCount.rows[0]?.count ?? 0),
              audited: Boolean(audit.rows[0]),
            };
          },
        );
        expect(afterFirst.marketingSms).toBe("opted_out");
        expect(afterFirst.consentAction).toBe("withdrawn");
        expect(afterFirst.consentCount).toBe(1);
        expect(afterFirst.audited).toBe(true);

        // Even a forged extra "enabled" value is ignored: the action has no
        // grant branch. The guest stays opted out.
        const forced = await (
          withdrawSmsConsent as unknown as (
            viewer: Viewer,
            membershipId: string,
            enabled: boolean,
          ) => Promise<{ ok: boolean; enabled?: boolean }>
        )(ownerA(), fixture.membershipA, true);
        expect(forced.ok).toBe(true);
        expect(forced.enabled).toBe(false);

        const afterForced = await withContext(
          { databaseUrl: devUrl, restaurantId: fixture.restaurantA, isOperator: false },
          async (transaction) => {
            const result = await transaction.execute<{ marketing_sms: string }>(sql`
              select marketing_sms::text as marketing_sms
              from membership where id = ${fixture.membershipA}
            `);
            const consentCount = await transaction.execute<{ count: number }>(sql`
              select count(*)::int as count
              from consent_event where membership_id = ${fixture.membershipA}
            `);
            return {
              marketingSms: result.rows[0]?.marketing_sms,
              consentCount: Number(consentCount.rows[0]?.count ?? 0),
            };
          },
        );
        expect(afterForced.marketingSms).toBe("opted_out");
        expect(afterForced.consentCount).toBe(1);

        const cross = await withdrawSmsConsent(ownerA(), fixture.membershipB);
        expect(cross.ok).toBe(false);

        const guestB = await withContext(
          { databaseUrl: devUrl, isOperator: true },
          async (transaction) => {
            const result = await transaction.execute<{ marketing_sms: string }>(sql`
              select marketing_sms::text as marketing_sms
              from membership where id = ${fixture.membershipB}
            `);
            return result.rows[0]?.marketing_sms;
          },
        );
        expect(guestB).toBe("opted_in");
      },
    );

    it(
      "runs every live write for restaurant A",
      { timeout: TIMEOUT },
      async () => {
        const phone = await revealPhone(ownerA(), fixture.customerA);
        expect(phone).toEqual({ ok: true, phone: fixture.phoneA });

        expect(await approveCampaign(ownerA(), fixture.campaignApproveA)).toEqual({ ok: true });
        expect(await cancelCampaign(ownerA(), fixture.campaignCancelA)).toEqual({ ok: true });

        const loyalty = await saveLoyaltySettings(ownerA(), {
          stampsRequired: 9,
          rewardDescription: "Safety reward",
          rewardKind: "free_item",
          rewardPercentOff: null,
          rewardAmountOffCents: null,
          rewardValidDays: null,
          visitWindowMinutes: 240,
          welcomeStamp: true,
          marketingWeeklyCap: 3,
          memberWeeklyCap: 2,
        });
        expect(loyalty.ok).toBe(true);

        const section = await createSection(ownerA(), "Safety specials");
        expect(section.ok).toBe(true);
        if (!section.ok) throw new Error("Could not create test section.");

        const item = await createItem(ownerA(), {
          sectionId: section.id,
          name: "Safety flat white",
          description: "Test item",
          priceCents: 3800,
        });
        expect(item.ok).toBe(true);
        if (!item.ok) throw new Error("Could not create test item.");

        const hidden = await setItemAvailable(ownerA(), item.id, false);
        expect(hidden).toEqual({ ok: true });

        const state = await withContext(
          { databaseUrl: devUrl, restaurantId: fixture.restaurantA, isOperator: false },
          async (transaction) => {
            const campaign = await transaction.execute<{ status: string; approved_by: string | null }>(sql`
              select status::text as status, approved_by
              from campaign where id = ${fixture.campaignApproveA}
            `);
            const cancelled = await transaction.execute<{ status: string }>(sql`
              select status::text as status from campaign where id = ${fixture.campaignCancelA}
            `);
            const restaurant = await transaction.execute<{ stamps_required: number }>(sql`
              select stamps_required from restaurant where id = ${fixture.restaurantA}
            `);
            const menuItem = await transaction.execute<{ available: boolean }>(sql`
              select available from menu_item where id = ${item.id}
            `);
            return {
              campaignStatus: campaign.rows[0]?.status,
              approvedBy: campaign.rows[0]?.approved_by,
              cancelledStatus: cancelled.rows[0]?.status,
              stampsRequired: restaurant.rows[0]?.stamps_required,
              available: menuItem.rows[0]?.available,
            };
          },
        );
        expect(state.campaignStatus).toBe("pending_approval");
        expect(state.approvedBy).toBe(ownerA().userId);
        expect(state.cancelledStatus).toBe("cancelled");
        expect(Number(state.stampsRequired)).toBe(9);
        expect(state.available).toBe(false);
      },
    );

    it(
      "blocks cross-restaurant reads and changes",
      { timeout: TIMEOUT },
      async () => {
        expect(await loadCustomerProfile(ownerA(), fixture.customerB)).toBeNull();
        expect(await loadCampaignResults(ownerA(), fixture.campaignB)).toBeNull();
        expect(await approveCampaign(ownerA(), fixture.campaignB)).toMatchObject({ ok: false });
        expect(await cancelCampaign(ownerA(), fixture.campaignB)).toMatchObject({ ok: false });
        expect(await setItemAvailable(ownerA(), fixture.itemB, false)).toMatchObject({ ok: false });
        expect(await withdrawSmsConsent(ownerA(), fixture.membershipB)).toMatchObject({ ok: false });

        const untouched = await withContext(
          { databaseUrl: devUrl, isOperator: true },
          async (transaction) => {
            const campaign = await transaction.execute<{ status: string; approved_by: string | null }>(sql`
              select status::text as status, approved_by
              from campaign where id = ${fixture.campaignB}
            `);
            const item = await transaction.execute<{ available: boolean }>(sql`
              select available from menu_item where id = ${fixture.itemB}
            `);
            return { campaign: campaign.rows[0], item: item.rows[0] };
          },
        );
        expect(untouched.campaign?.status).toBe("pending_approval");
        expect(untouched.campaign?.approved_by).toBeNull();
        expect(untouched.item?.available).toBe(true);
      },
    );

    it(
      "hides the operator note and refuses owner feedback changes",
      { timeout: TIMEOUT },
      async () => {
        const safe = await withContext(
          { databaseUrl: devUrl, restaurantId: fixture.restaurantA, isOperator: false },
          async (transaction) => {
            const result = await transaction.execute<{ id: string; status: string }>(sql`
              select id, status from feedback where id = ${fixture.feedbackA}
            `);
            const other = await transaction.execute<{ id: string }>(sql`
              select id from feedback where id = ${fixture.feedbackB}
            `);
            return { row: result.rows[0], otherReadable: Boolean(other.rows[0]) };
          },
        );
        expect(safe.row?.status).toBe("planned");
        expect(safe.otherReadable).toBe(false);

        let noteReadDenied = false;
        try {
          await withContext(
            { databaseUrl: devUrl, restaurantId: fixture.restaurantA, isOperator: false },
            async (transaction) => {
              await transaction.execute(sql`
                select note from feedback where id = ${fixture.feedbackA}
              `);
            },
          );
        } catch {
          noteReadDenied = true;
        }
        expect(noteReadDenied).toBe(true);

        let updateDenied = false;
        try {
          await withContext(
            { databaseUrl: devUrl, restaurantId: fixture.restaurantA, isOperator: false },
            async (transaction) => {
              await transaction.execute(sql`
                update feedback set status = 'done', note = 'owner edit'
                where id = ${fixture.feedbackA}
              `);
            },
          );
        } catch {
          updateDenied = true;
        }
        expect(updateDenied).toBe(true);
      },
    );
  });
} else {
  describe.skip("live dev database safety", () => {
    it("needs a guarded DATABASE_URL_DEV and PROD_DB_HOST", () => {});
  });
}
