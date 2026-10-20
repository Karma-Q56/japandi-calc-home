import { createHmac, timingSafeEqual } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { normalizePhone, isValidSAMobile } from "@/lib/phone";
import { getConsentWording } from "@/config/consent";
import { withContext, type DatabaseTransaction } from "@/server/db";
import type { JoinInput, JsonValue, LeadInput, PatronRepos, PublicPage, StampOutcome } from "./contracts";

type Ctx = { databaseUrl: string; restaurantId?: string | null; customerId?: string | null; isOperator?: boolean };

// All queries run inside withContext (SPEC 8.1). One Pool per request is
// created inside withContext — never a module-global client.
async function q<T>(tx: DatabaseTransaction, query: SQL): Promise<T[]> {
  const res = (await tx.execute(query)) as unknown as { rows: T[] };
  return res.rows;
}

interface RestaurantRow {
  id: string;
  slug: string;
  name: string;
  suburb: string | null;
  theme: Record<string, JsonValue> | null;
  hours: Record<string, JsonValue> | null;
  stamps_required: number;
  reward_description: string;
  visit_window_minutes: number;
  welcome_stamp: boolean;
}

interface MenuRow {
  id: string;
  section_id: string | null;
  section_name: string | null;
  name: string;
  description: string | null;
  price_cents: number | null;
  available: boolean;
  sort_order: number;
}

// Lead insert columns. leadValues() must return exactly one value per column;
// renderLeadInsertSql() renders the same statement for the count test below.
export const LEAD_COLUMNS = [
  "kind",
  "restaurant_name",
  "contact_name",
  "phone",
  "email",
  "role",
  "venue_type",
  "suburb",
  "quiet_time",
  "weekly_guests",
  "plan_interest",
  "consent",
  "consent_version",
  "calculator",
  "notes",
] as const;

export function leadValues(input: LeadInput): unknown[] {
  return [
    input.kind ?? "waitlist",
    input.restaurantName,
    input.contactName,
    input.phone,
    input.email ?? null,
    input.role ?? null,
    input.venueType ?? null,
    input.suburb ?? null,
    input.quietTime ?? null,
    input.weeklyGuests ?? null,
    input.planInterest ?? null,
    true,
    input.consentVersion ?? "v1",
    input.calculator ? JSON.stringify(input.calculator) : null,
    input.notes ?? null,
  ];
}

/** Rendered SQL for the lead insert (placeholders $1..$N); the live query
 *  composes the identical column/value lists through drizzle. */
export function renderLeadInsertSql(): string {
  const cols = LEAD_COLUMNS.join(", ");
  const vals = LEAD_COLUMNS.map((c, i) =>
    c === "calculator" ? `$${i + 1}::jsonb` : `$${i + 1}`,
  ).join(", ");
  return `insert into lead (${cols}) values (${vals}) returning id`;
}

// Till PIN policy (live mode). No fallback pepper, no skipped checks.
export const PIN_FAIL_WINDOW_MINUTES = 10;
export const PIN_LOCK_MINUTES = 15;
export const PIN_MAX_FAILS = 5;

export function assertPinPresent(pin: string | undefined): asserts pin is string {
  if (!pin || !/^\d{4}$/.test(pin)) throw new Error("PIN required");
}

export function requirePinPepper(): string {
  const pepper = process.env["PIN_PEPPER"];
  if (!pepper) throw new Error("PIN_PEPPER is not configured.");
  return pepper;
}

export function pinHmacHex(pepper: string, restaurantId: string, staffId: string, pin: string): string {
  return createHmac("sha256", pepper).update(`${restaurantId}:${staffId}:${pin}`).digest("hex");
}

export function pinMatches(storedHex: string, computedHex: string): boolean {
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(storedHex, "hex");
    b = Buffer.from(computedHex, "hex");
  } catch {
    return false;
  }
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isPinLocked(failCount: number, lastFailAtMs: number | null, nowMs: number): boolean {
  if (failCount < PIN_MAX_FAILS || lastFailAtMs === null) return false;
  return nowMs - lastFailAtMs < PIN_LOCK_MINUTES * 60_000;
}

interface SpecialRow {
  id: string;
  title: string;
  body: string | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
}

export function createPgRepos(ctx: Ctx): PatronRepos {
  return {
    async getPublicPage(slug: string): Promise<PublicPage | null> {
      return withContext(ctx, async (tx) => {
        const rRows = await q<RestaurantRow>(
          tx,
          sql`select id, slug, name, suburb, theme, hours, stamps_required, reward_description, visit_window_minutes, welcome_stamp from restaurant where slug = ${slug} and status = 'active' limit 1`,
        );
        const r = rRows[0];
        if (!r) return null;
        const menuRes = await q<MenuRow>(
          tx,
          sql`select mi.id, mi.section_id, ms.name as section_name, mi.name, mi.description, mi.price_cents, mi.available, mi.sort_order from menu_item mi left join menu_section ms on ms.id = mi.section_id where mi.restaurant_id = ${r.id} order by mi.sort_order`,
        );
        const specRes = await q<SpecialRow>(
          tx,
          sql`select id, title, body, starts_at, ends_at, active from special where restaurant_id = ${r.id} and active = true order by created_at desc`,
        );
        return {
          id: r.id,
          slug: r.slug,
          name: r.name,
          suburb: r.suburb,
          theme: r.theme ?? {},
          hours: r.hours ?? {},
          stampsRequired: r.stamps_required,
          rewardDescription: r.reward_description,
          visitWindowMinutes: r.visit_window_minutes,
          welcomeStamp: r.welcome_stamp,
          menu: menuRes.map((m) => ({
            id: m.id,
            sectionId: m.section_id,
            sectionName: m.section_name,
            name: m.name,
            description: m.description,
            priceCents: m.price_cents,
            available: m.available,
            sortOrder: m.sort_order,
          })),
          specials: specRes.map((x) => ({
            id: x.id,
            title: x.title,
            body: x.body,
            startsAt: x.starts_at ? new Date(x.starts_at).toISOString() : null,
            endsAt: x.ends_at ? new Date(x.ends_at).toISOString() : null,
            active: x.active,
          })),
        };
      });
    },

    async submitLead(input: LeadInput) {
      if (input.website) throw new Error("Honeypot detected.");
      if (!input.consent) throw new Error("Consent is required.");
      // Trusted server insert: the lead row is written by the server after
      // honeypot/consent/rate-limit checks, so this tx runs as operator
      // (never exposed to clients). A public ctx cannot use `returning id`
      // because lead SELECT is operator-only and RLS rejects RETURNING rows
      // that fail the SELECT policy — the public insert policy alone is not
      // enough.
      const sys: Ctx = { ...ctx, isOperator: true };
      return withContext(sys, async (tx) => {
        // Rate limit: max 5 lead posts per phone AND per IP per hour.
        const hits = await q<{ n: string | number }>(
          tx,
          sql`select count(*)::int as n from rate_limit_hit where bucket = 'lead' and key = ${input.phone} and created_at > now() - interval '1 hour'`,
        );
        if (Number(hits[0]?.n ?? 0) >= 5) throw new Error("Too many requests. Try again later.");
        if (input.ipHash) {
          const ipHits = await q<{ n: string | number }>(
            tx,
            sql`select count(*)::int as n from rate_limit_hit where bucket = 'lead-ip' and key = ${input.ipHash} and created_at > now() - interval '1 hour'`,
          );
          if (Number(ipHits[0]?.n ?? 0) >= 5) throw new Error("Too many requests. Try again later.");
        }
        await q<unknown>(tx, sql`insert into rate_limit_hit (bucket, key) values ('lead', ${input.phone})`);
        if (input.ipHash) {
          await q<unknown>(tx, sql`insert into rate_limit_hit (bucket, key) values ('lead-ip', ${input.ipHash})`);
        }
        const values = leadValues(input);
        const frags = values.map((v, i) =>
          LEAD_COLUMNS[i] === "calculator" ? sql`${v}::jsonb` : sql`${v}`,
        );
        const rows = await q<{ id: string }>(
          tx,
          sql`insert into lead (${sql.join(LEAD_COLUMNS.map((c) => sql.identifier(c)), sql`, `)}) values (${sql.join(frags, sql`, `)}) returning id`,
        );
        const id = rows[0]?.id;
        if (!id) throw new Error("Could not submit.");
        return { id };
      });
    },

    async joinGuest(input: JoinInput) {
      const phoneE164 = normalizePhone(input.phone);
      if (!input.name.trim() || !phoneE164 || !isValidSAMobile(phoneE164))
        throw new Error("Enter your first name and a valid South African mobile number.");
      // Trusted server join: customer has no public INSERT policy, so the
      // server runs this tx as operator (never exposed to clients).
      const sys: Ctx = { ...ctx, isOperator: true };
      return withContext(sys, async (tx) => {
        const rRows = await q<{ id: string; name: string }>(
          tx,
          sql`select id, name, welcome_stamp from restaurant where slug = ${input.slug} and status = 'active' limit 1`,
        );
        const r = rRows[0];
        if (!r) throw new Error("We could not find that restaurant.");
        const found = await q<{ id: string }>(
          tx,
          sql`select id from customer where phone_e164 = ${phoneE164} limit 1`,
        );
        let customerId = found[0]?.id;
        if (!customerId) {
          const name = input.name.trim().slice(0, 40);
          const created = await q<{ id: string }>(
            tx,
            sql`insert into customer (user_id, phone_e164, name) values (${`join:${phoneE164}`}, ${phoneE164}, ${name}) returning id`,
          );
          customerId = created[0]?.id;
          if (!customerId) throw new Error("Could not join.");
        }
        const existing = await q<{ id: string }>(
          tx,
          sql`select id from membership where restaurant_id = ${r.id} and customer_id = ${customerId} limit 1`,
        );
        if (existing[0]) return { customerId, membershipId: existing[0].id, alreadyMember: true };
        const mem = await q<{ id: string }>(
          tx,
          sql`insert into membership (restaurant_id, customer_id, source, marketing_sms) values (${r.id}, ${customerId}, ${input.source}, ${input.marketingSms ? "opted_in" : "not_opted_in"}) returning id`,
        );
        const membershipId = mem[0]?.id;
        if (!membershipId) throw new Error("Could not join.");
        const loyalty = getConsentWording("loyalty", r.name);
        await q<unknown>(
          tx,
          sql`insert into consent_event (membership_id, purpose, action, wording_version, wording_text, source) values (${membershipId}, 'loyalty', 'granted', ${loyalty.version}, ${loyalty.text}, 'join_form')`,
        );
        if (input.marketingSms) {
          const sms = getConsentWording("marketing_sms", r.name);
          await q<unknown>(
            tx,
            sql`insert into consent_event (membership_id, purpose, action, wording_version, wording_text, source) values (${membershipId}, 'marketing_sms', 'granted', ${sms.version}, ${sms.text}, 'join_form')`,
          );
        }
        // DEMO OTP SEAM: no real OTP is sent; otpVerified is accepted as-is.
        return { customerId, membershipId, alreadyMember: false };
      });
    },

    async getCard(slug, customerId) {
      return withContext({ ...ctx, customerId }, async (tx) => {
        const rRows = await q<{ id: string; slug: string; name: string; stamps_required: number; reward_description: string }>(
          tx,
          sql`select id, slug, name, stamps_required, reward_description from restaurant where slug = ${slug} and status = 'active' limit 1`,
        );
        const r = rRows[0];
        if (!r) return null;
        const mRows = await q<{
          id: string;
          stamps_current: number;
          stamps_total: number;
          last_visit_at: string | null;
          marketing_sms: string;
          cid: string;
          cname: string;
          qr_token: string;
        }>(
          tx,
          sql`select m.id, m.stamps_current, m.stamps_total, m.last_visit_at, m.marketing_sms, c.id as cid, c.name as cname, c.qr_token from membership m join customer c on c.id = m.customer_id where m.restaurant_id = ${r.id} and m.customer_id = ${customerId} limit 1`,
        );
        const m = mRows[0];
        if (!m) return null;
        const stamps = await q<{ id: string; created_at: string; status: string }>(
          tx,
          sql`select id, created_at, status from stamp_event where membership_id = ${m.id} order by created_at desc limit 20`,
        );
        const rewards = await q<{ id: string; description: string; status: string }>(
          tx,
          sql`select id, description, status from reward where membership_id = ${m.id}`,
        );
        const consents = await q<{ id: string; purpose: string; action: string; wording_version: string; wording_text: string }>(
          tx,
          sql`select id, purpose, action, wording_version, wording_text from consent_event where membership_id = ${m.id} order by created_at desc`,
        );
        return {
          restaurant: { id: r.id, slug: r.slug, name: r.name, stampsRequired: r.stamps_required, rewardDescription: r.reward_description },
          customer: { id: m.cid, name: m.cname, qrToken: m.qr_token },
          membership: {
            id: m.id,
            stampsCurrent: m.stamps_current,
            stampsTotal: m.stamps_total,
            lastVisitAt: m.last_visit_at ? new Date(m.last_visit_at).toISOString() : null,
            marketingSms: m.marketing_sms,
          },
          stamps: stamps.map((x) => ({ id: x.id, createdAt: new Date(x.created_at).toISOString(), status: x.status })),
          rewards: rewards.map((x) => ({ id: x.id, description: x.description, status: x.status })),
          consents: consents.map((x) => ({
            id: x.id,
            purpose: x.purpose,
            action: x.action,
            wordingVersion: x.wording_version,
            wordingText: x.wording_text,
          })),
        };
      });
    },

    async listCards(customerId) {
      return withContext({ ...ctx, customerId }, async (tx) => {
        const rows = await q<{ membership_id: string; slug: string }>(
          tx,
          sql`select m.id as membership_id, r.slug as slug from membership m join restaurant r on r.id = m.restaurant_id where m.customer_id = ${customerId}`,
        );
        return rows.map((x) => ({ membershipId: x.membership_id, restaurantSlug: x.slug }));
      });
    },

    async recordStamp(input): Promise<StampOutcome> {
      // PIN is never optional in live mode: validated before any database work.
      assertPinPresent(input.pin);
      const pepper = requirePinPepper();
      // Transaction 1 (committed on its own): staff lookup + PIN check. The
      // wrong-PIN failure insert MUST commit here — inserting it inside the
      // stamp transaction and then throwing rolled it back, so the lockout
      // never triggered. This block returns a result value and never throws
      // for wrong/locked PINs, so the failure insert survives.
      const pinCheck = await withContext({ ...ctx, restaurantId: input.restaurantId }, async (tx) => {
        // Staff row + recent PIN fails in one round trip.
        const staff = await q<{ id: string; pin_hmac: string; fails: string | number; last_fail: string | null }>(
          tx,
          sql`select s.id, s.pin_hmac, (select count(*)::int from rate_limit_hit where bucket = 'pin' and key = ${input.staffId} and created_at > now() - make_interval(mins => ${PIN_FAIL_WINDOW_MINUTES})) as fails, (select max(created_at) from rate_limit_hit where bucket = 'pin' and key = ${input.staffId} and created_at > now() - make_interval(mins => ${PIN_FAIL_WINDOW_MINUTES})) as last_fail from staff_member s where s.id = ${input.staffId} and s.restaurant_id = ${input.restaurantId} and s.active = true limit 1`,
        );
        if (!staff[0]) return { status: "no_staff" } as const;
        const fails = Number(staff[0].fails ?? 0);
        const lastFailMs = staff[0].last_fail ? Date.parse(staff[0].last_fail) : null;
        // Locked attempts return the same error as a wrong PIN and are not
        // recorded, so the lockout expires instead of extending forever.
        if (isPinLocked(fails, lastFailMs, Date.now())) return { status: "locked" } as const;
        const ok = pinMatches(staff[0].pin_hmac, pinHmacHex(pepper, input.restaurantId, input.staffId, input.pin));
        if (!ok) {
          await q<unknown>(tx, sql`insert into rate_limit_hit (bucket, key) values ('pin', ${input.staffId})`);
          return { status: "wrong" } as const;
        }
        return { status: "ok" } as const;
      });
      // Thrown AFTER transaction 1 commits, so the failure insert is kept.
      if (pinCheck.status === "no_staff") throw new Error("Staff member not found.");
      if (pinCheck.status !== "ok") throw new Error("Wrong PIN.");
      // Transaction 2 runs only when the PIN is correct.
      return withContext({ ...ctx, restaurantId: input.restaurantId }, async (tx) => {
        const out = await q<{ out_result: string; out_stamp_id: string | null; out_stamps: number | null; out_reward_id: string | null }>(
          tx,
          sql`select * from record_stamp(${input.restaurantId}::uuid, ${input.membershipId}::uuid, ${input.staffId}::uuid, ${input.key})`,
        );
        const row = out[0];
        if (!row) throw new Error("Could not stamp.");
        await q<unknown>(
          tx,
          sql`insert into audit_event (actor_type, actor_id, restaurant_id, action, object_type, object_id) values ('staff', ${input.staffId}, ${input.restaurantId}, ${`stamp:${row.out_result}`}, 'membership', ${input.membershipId})`,
        );
        if (row.out_result === "stamped") {
          if (row.out_reward_id)
            return { result: "reward", stampId: row.out_stamp_id ?? "", stampsCurrent: row.out_stamps ?? 0, rewardId: row.out_reward_id };
          return { result: "stamped", stampId: row.out_stamp_id ?? "", stampsCurrent: row.out_stamps ?? 0, rewardId: null };
        }
        if (row.out_result === "duplicate_retry")
          return { result: "duplicate_retry", stampId: row.out_stamp_id ?? "", stampsCurrent: row.out_stamps ?? 0 };
        if (row.out_result === "too_soon") return { result: "too_soon", stampsCurrent: row.out_stamps ?? 0 };
        return { result: "not_a_member" };
      });
    },
  };
}
