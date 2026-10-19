import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getDataMode } from "./db/mode";
import { getRepos } from "./repos";

// Live-path server functions. The UI calls these instead of reading demoRepo
// directly when DATA_MODE=live (demo stays the default).
//
// SECURITY: the client never receives operator context and cannot send it
// either — every function below builds its context server-side with
// isOperator: false. Tenant ids are validated identifiers (slugs, RLS-confined
// row ids); the RLS policies plus the till PIN are the authority, not the
// caller. Full session binding (signed-in customer/staff) arrives with the
// auth slice; until then these ids are claims confined by RLS.

function serverEnv() {
  return {
    DATA_MODE: process.env["DATA_MODE"],
    DATABASE_URL: process.env["DATABASE_URL"],
  };
}

/** Hash the caller IP for rate limiting (SHA-256, never the raw address). */
function requestIpHash(): string | undefined {
  try {
    const headers = getRequestHeaders();
    const raw =
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip")?.trim();
    if (!raw) return undefined;
    return createHash("sha256").update(`patron-lead:${raw}`).digest("hex");
  } catch {
    return undefined;
  }
}

export const getDataModeFn = createServerFn({ method: "GET" }).handler(() => ({
  mode: getDataMode(),
}));

export const getPublicPageFn = createServerFn({ method: "GET" })
  .validator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    const { repos } = getRepos(serverEnv());
    return { page: await repos.getPublicPage(data.slug) };
  });

export const submitLeadFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      restaurantName: string;
      contactName: string;
      phone: string;
      email?: string | undefined;
      role?: string | undefined;
      venueType?: string | undefined;
      suburb?: string | undefined;
      quietTime?: string | undefined;
      weeklyGuests?: string | undefined;
      planInterest?: string | undefined;
      consent: boolean;
      consentVersion?: string | undefined;
      notes?: string | undefined;
      website?: string | undefined;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { repos } = getRepos(serverEnv());
    try {
      const { id } = await repos.submitLead({ ...data, ipHash: requestIpHash() });
      return { ok: true as const, id };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Could not submit." };
    }
  });

export const joinGuestFn = createServerFn({ method: "POST" })
  .validator(
    (d: { slug: string; name: string; phone: string; marketingSms: boolean; source: string }) => d,
  )
  .handler(async ({ data }) => {
    const { repos } = getRepos(serverEnv());
    try {
      const result = await repos.joinGuest({ ...data, otpVerified: true });
      return { ok: true as const, ...result };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "Could not join.",
      };
    }
  });

export const getCardFn = createServerFn({ method: "GET" })
  .validator((d: { slug: string; customerId: string }) => d)
  .handler(async ({ data }) => {
    const { repos } = getRepos(serverEnv());
    return { card: await repos.getCard(data.slug, data.customerId) };
  });

export const listCardsFn = createServerFn({ method: "GET" })
  .validator((d: { customerId: string }) => d)
  .handler(async ({ data }) => {
    const { repos } = getRepos(serverEnv());
    return { cards: await repos.listCards(data.customerId) };
  });

export const recordStampFn = createServerFn({ method: "POST" })
  .validator(
    (d: { restaurantId: string; membershipId: string; staffId: string; key: string; pin: string }) => d,
  )
  .handler(async ({ data }) => {
    const { repos } = getRepos(serverEnv());
    try {
      const outcome = await repos.recordStamp(data);
      return { ok: true as const, outcome };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "Could not stamp.",
      };
    }
  });
