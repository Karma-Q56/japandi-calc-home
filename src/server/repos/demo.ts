import { demoRepo } from "@/data/repo";
import { getCard as demoGetCard, joinRestaurant, customerCards } from "@/domain/members";
import { recordStamp as demoRecordStamp } from "@/domain/stamps";
import { offersForMembership, redeemSpecial as demoRedeemSpecial } from "@/domain/specials";
import { submitEnquiry } from "@/domain/leads";
import type { JoinInput, JsonValue, LeadInput, PatronRepos } from "./contracts";

type StampResultLike =
  | { result: "stamped"; stampId: string; stampsCurrent: number; rewardId: string | null }
  | { result: "too_soon"; stampsCurrent: number }
  | { result: "not_a_member" }
  | { result: "duplicate_retry"; stampId: string; stampsCurrent: number };

// Demo implementation: async wrapper over the browser demo repo.
// Behaviour must stay exactly as today; live mode must match this contract.
export function createDemoRepos(): PatronRepos {
  return {
    async getPublicPage(slug) {
      const s = demoRepo.read();
      const r = s.restaurants.find((x) => x.slug === slug && x.status === "active");
      if (!r) return null;
      const sections = new Map(s.sections.filter((x) => x.restaurantId === r.id).map((x) => [x.id, x.name]));
      const menu = s.items
        .filter((x) => x.restaurantId === r.id)
        .map((x) => ({
          id: x.id,
          sectionId: x.sectionId,
          sectionName: sections.get(x.sectionId) ?? null,
          name: x.name,
          description: x.description ?? null,
          priceCents: x.priceCents,
          available: x.available,
          sortOrder: x.sortOrder,
        }));
      const specials = s.specials
        .filter((x) => x.restaurantId === r.id && x.active)
        .map((x) => ({
          id: x.id,
          title: x.title,
          body: x.body ?? null,
          startsAt: x.startsAt ?? null,
          endsAt: x.endsAt ?? null,
          active: x.active,
          kind: x.kind ?? "public",
          code: x.code ?? null,
          minTier: x.minTier ?? null,
        }));
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        suburb: r.suburb ?? null,
        theme: r.theme as unknown as Record<string, JsonValue>,
        hours: r.hours as unknown as Record<string, JsonValue>,
        stampsRequired: r.stampsRequired,
        rewardDescription: r.rewardDescription,
        visitWindowMinutes: r.visitWindowMinutes,
        welcomeStamp: r.welcomeStamp,
        welcomeStamps: r.welcomeStamps ?? 0,
        pageTemplate: r.pageTemplate ?? "classic",
        menu,
        specials,
        branches: (s.locations ?? [])
          .filter((l) => l.restaurantId === r.id && l.active)
          .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name))
          .map((l) => ({ id: l.id, name: l.name, suburb: l.suburb ?? null, isMain: l.isMain })),
      };
    },

    async submitLead(input: LeadInput) {
      if (input.website) throw new Error("Honeypot detected.");
      if (!input.consent) throw new Error("Consent is required.");
      const s = demoRepo.read();
      const hourAgo = s.now - 3600_000;
      const recent = (s.rateLimitHits ?? []).filter((h) => h.createdAt > hourAgo);
      // Rate limit per phone AND per IP (mirrors the live adapter).
      if (recent.filter((h) => h.bucket === "lead" && h.key === input.phone).length >= 5) {
        throw new Error("Too many requests. Try again later.");
      }
      if (input.ipHash && recent.filter((h) => h.bucket === "lead-ip" && h.key === input.ipHash).length >= 5) {
        throw new Error("Too many requests. Try again later.");
      }
      const saved = submitEnquiry({
        kind: input.kind === "diner" || input.kind === "other" ? input.kind : "owner",
        restaurantName: input.restaurantName,
        contactName: input.contactName,
        phone: input.phone,
        email: input.email,
        role: input.role,
        venueType: input.venueType,
        suburb: input.suburb,
        quietTime: input.quietTime,
        weeklyGuests: input.weeklyGuests,
        planInterest: input.planInterest,
        message: input.notes,
        consent: input.consent,
        consentAt: new Date(s.now).toISOString(),
        now: s.now,
      });
      if (!saved.ok) throw new Error(saved.error.message);
      demoRepo.write({
        ...demoRepo.read(),
        rateLimitHits: [
          ...(s.rateLimitHits ?? []),
          { bucket: "lead", key: input.phone, createdAt: s.now } as never,
          ...(input.ipHash ? [{ bucket: "lead-ip", key: input.ipHash, createdAt: s.now } as never] : []),
        ],
      });
      return saved.data;
    },

    async joinGuest(input: JoinInput) {
      // DEMO OTP SEAM: the demo verification step is accepted as-is here.
      // Real OTP/Auth is explicitly out of scope (see docs/decisions.md).
      const res = joinRestaurant({
        slug: input.slug,
        name: input.name,
        phone: input.phone,
        marketingSms: input.marketingSms,
        source: input.source,
      }) as unknown as
        | { ok: true; value?: unknown; data?: unknown }
        | { ok: false; reason?: string; error?: { message?: string } };
      if (!res.ok) throw new Error((res as { reason?: string }).reason ?? (res as { error?: { message?: string } }).error?.message ?? "Could not join.");
      return ((res as { value?: unknown }).value ?? (res as { data?: unknown }).data) as {
        customerId: string;
        membershipId: string;
        alreadyMember: boolean;
      };
    },

    async getCard(slug, customerId) {
      const res = demoGetCard(slug, customerId) as unknown as
        | { ok: true; value?: never; data?: never }
        | { ok: false };
      if (!res.ok) return null;
      const v = ((res as { value?: unknown }).value ?? (res as { data?: unknown }).data) as unknown as ReturnType<typeof demoGetCard> extends never ? never : {
        restaurant: { id: string; slug: string; name: string; stampsRequired: number; rewardDescription: string };
        customer: { id: string; name: string; qrToken: string };
        membership: { id: string; stampsCurrent: number; stampsTotal: number; lastVisitAt: string | null; marketingSms: boolean };
        visits: { id: string; createdAt: string; status: string }[];
        rewards: { id: string; description: string; redeemedAt?: string | null }[];
        consents: { id: string; purpose: string; action: string; wordingVersion: string; wordingText: string }[];
      };
      return {
        restaurant: {
          id: v.restaurant.id,
          slug: v.restaurant.slug,
          name: v.restaurant.name,
          stampsRequired: v.restaurant.stampsRequired,
          rewardDescription: v.restaurant.rewardDescription,
        },
        customer: { id: v.customer.id, name: v.customer.name, qrToken: v.customer.qrToken },
        membership: {
          id: v.membership.id,
          stampsCurrent: v.membership.stampsCurrent,
          stampsTotal: v.membership.stampsTotal,
          lastVisitAt: v.membership.lastVisitAt,
          marketingSms: v.membership.marketingSms,
        },
        stamps: v.visits.map((x) => ({ id: x.id, createdAt: x.createdAt, status: x.status })),
        rewards: v.rewards.map((x) => ({
          id: x.id,
          description: x.description,
          status: x.redeemedAt ? "redeemed" : "available",
        })),
        consents: v.consents.map((x) => ({
          id: x.id,
          purpose: x.purpose,
          action: x.action,
          wordingVersion: x.wordingVersion,
          wordingText: x.wordingText,
        })),
      };
    },

    async listCards(customerId) {
      const res = customerCards(customerId) as unknown as
        | { ok: true; value?: { id: string; restaurant: { slug: string } }[]; data?: { id: string; restaurant: { slug: string } }[] }
        | { ok: false };
      if (!res.ok) return [];
      const list = res.value ?? res.data ?? [];
      return list.map((m) => ({ membershipId: m.id, restaurantSlug: m.restaurant.slug }));
    },

    async getSpecialOffers(membershipId) {
      const res = offersForMembership(membershipId) as
        | { ok: true; data: { offers: Array<{ special: { id: string; title: string; body: string; kind: "public" | "members" | "targeted"; code?: string; minTier?: string | null }; code: { code: string } | null; redeemed: boolean }> } }
        | { ok: false };
      if (!res.ok) return [];
      return res.data.offers.map(({ special, code, redeemed }) => ({
        id: special.id,
        title: special.title,
        body: special.body,
        kind: special.kind,
        code: code?.code ?? special.code ?? null,
        minTier: special.minTier ?? null,
        redeemed,
      }));
    },

    async redeemSpecial(input) {
      const res = demoRedeemSpecial({
        restaurantId: input.restaurantId,
        membershipId: input.membershipId,
        code: input.code,
        actorId: input.actorId,
        session: { role: "staff", restaurantId: input.restaurantId },
      });
      return res.ok
        ? { ok: true as const, title: res.special.title, code: res.code }
        : { ok: false as const, message: res.error.message };
    },

    async recordStamp(input) {
      const s = demoRepo.read();
      const membership = s.memberships.find((m) => m.id === input.membershipId);
      if (!membership) return { result: "not_a_member" as const };
      const res = demoRecordStamp({
        restaurantId: input.restaurantId,
        membershipId: input.membershipId,
        staffId: input.staffId,
        key: input.key,
        session: { role: "staff", restaurantId: input.restaurantId },
      }) as unknown as
        | { ok: true; value?: StampResultLike; data?: StampResultLike }
        | { ok: false; reason?: string; error?: { message?: string } };
      if (!res.ok)
        throw new Error((res as { reason?: string }).reason ?? (res as { error?: { message?: string } }).error?.message ?? "Could not stamp.");
      const v = (res as { value?: StampResultLike }).value ?? (res as { data?: StampResultLike }).data!;
      if (v.result === "stamped") {
        if (v.rewardId) return { result: "reward", stampId: v.stampId, stampsCurrent: v.stampsCurrent, rewardId: v.rewardId };
        return { result: "stamped", stampId: v.stampId, stampsCurrent: v.stampsCurrent, rewardId: null };
      }
      if (v.result === "too_soon") return { result: "too_soon", stampsCurrent: v.stampsCurrent };
      if (v.result === "duplicate_retry")
        return { result: "duplicate_retry", stampId: v.stampId, stampsCurrent: v.stampsCurrent };
      return { result: "not_a_member" as const };
    },
  };
}
