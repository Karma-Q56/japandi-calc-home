import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { getDataMode } from "./db/mode";
import { getRepos } from "./repos";
import { verifyScanToken } from "@/lib/scan";

// Live-path server functions. The UI calls these instead of reading demoRepo
// directly when DATA_MODE=live (demo stays the default).
//
// SECURITY: the client never receives operator context and cannot send it
// either, every function below builds its context server-side with
// isOperator: false. Tenant ids are validated identifiers (slugs, RLS-confined
// row ids); the RLS policies plus the till PIN are the authority, not the
// caller. Full session binding (signed-in customer/staff) arrives with the
// auth slice; until then these ids are claims confined by RLS.
//
// Input validation: every function validates with a real zod schema (trimmed
// strings with max lengths, slug pattern, uuids, E.164 phones, 4-digit PIN,
// bounded key). Bad input is rejected with a clear error before any database
// work.

const slugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{1,60}$/, "Invalid restaurant link.");

const uuidSchema = z.string().uuid("Invalid id.");

// E.164 (+country, 8–15 digits). Spaces/dashes typed by users are stripped
// first; anything else that is not E.164 is rejected.
const e164Schema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : v),
  z.string().regex(/^\+[1-9]\d{7,14}$/, "Enter a valid phone number in international format."),
);

const pinSchema = z.string().regex(/^\d{4}$/, "PIN required.");

const keySchema = z.string().trim().min(1, "Key required.").max(64);

const shortText = (max: number) => z.string().trim().max(max).optional();

function serverEnv() {
  return {
    DATA_MODE: process.env["DATA_MODE"],
    DATABASE_URL: process.env["DATABASE_URL"],
  };
}

/**
 * Hash the caller IP for rate limiting (SHA-256, never the raw address).
 * Trusts cf-connecting-ip first (Cloudflare sets it and clients cannot
 * spoof it). x-forwarded-for / x-real-ip are only honored when DATA_MODE is
 * not production, where any proxy or client can spoof them.
 */
function requestIpHash(): string | undefined {
  try {
    const headers = getRequestHeaders();
    const cf = headers.get("cf-connecting-ip")?.trim();
    let raw = cf || undefined;
    if (!raw && (process.env["DATA_MODE"] ?? "").toLowerCase() !== "production") {
      raw =
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        headers.get("x-real-ip")?.trim() ||
        undefined;
    }
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
  .validator(z.object({ slug: slugSchema }))
  .handler(async ({ data }) => {
    const { repos } = getRepos(serverEnv());
    return { page: await repos.getPublicPage(data.slug) };
  });

export const submitLeadFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      kind: z.enum(["owner", "diner", "other"]).optional(),
      restaurantName: z.string().trim().min(1, "Restaurant name required.").max(200),
      contactName: z.string().trim().min(1, "Your name required.").max(120),
      phone: e164Schema,
      email: z.string().trim().email("Invalid email.").max(254).optional(),
      role: shortText(120),
      venueType: shortText(120),
      suburb: shortText(200),
      quietTime: shortText(120),
      weeklyGuests: shortText(120),
      planInterest: shortText(120),
      visitWanted: z.boolean().optional(),
      preferredDay: shortText(120),
      consent: z.boolean(),
      consentVersion: shortText(32),
      notes: shortText(2000),
      website: shortText(2000),
    }),
  )
  .handler(async ({ data }) => {
    const { repos } = getRepos(serverEnv());
    try {
      const saved = await repos.submitLead({ ...data, ipHash: requestIpHash() });
      return { ok: true as const, id: saved.id, reference: saved.reference };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Could not submit." };
    }
  });

export const joinGuestFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: slugSchema,
      name: z.string().trim().min(1, "Enter your first name.").max(40),
      phone: e164Schema,
      marketingSms: z.boolean(),
      source: z.string().trim().min(1).max(64),
    }),
  )
  .handler(async ({ data }) => {
    const { repos } = getRepos(serverEnv());
    try {
      // No real phone verification exists yet: joins stay disabled unless the
      // demo bypass is explicitly enabled (DEMO_OTP_BYPASS=true). See
      // docs/decisions.md ("Phone verification (OTP) gate").
      if (process.env["DEMO_OTP_BYPASS"] !== "true") {
        return { ok: false as const, message: "Phone verification is not enabled yet." };
      }
      const result = await repos.joinGuest({ ...data, otpVerified: true });
      return { ok: true as const, ...result };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "Could not join.",
      };
    }
  });

/** Verify a signed card token on the server (live mode). The secret never
 *  reaches the browser; a missing secret fails closed. */
export const verifyScanFn = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().trim().min(1).max(200) }))
  .handler(async ({ data }) => {
    const secret = process.env["SCAN_TOKEN_SECRET"];
    if (!secret) {
      return {
        ok: false as const,
        message: "Card scanning is not configured on this server. Type the member code.",
      };
    }
    const check = await verifyScanToken(data.token, { secret });
    if (!check.ok) {
      return {
        ok: false as const,
        message:
          check.reason === "expired"
            ? "That card code has expired. Ask the guest to refresh it and scan again."
            : "That card code is not valid.",
      };
    }
    return { ok: true as const, memberCode: check.memberCode };
  });

export const getCardFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: slugSchema, customerId: uuidSchema }))
  .handler(async ({ data }) => {
    const { repos } = getRepos(serverEnv());
    return { card: await repos.getCard(data.slug, data.customerId) };
  });

export const listCardsFn = createServerFn({ method: "GET" })
  .validator(z.object({ customerId: uuidSchema }))
  .handler(async ({ data }) => {
    const { repos } = getRepos(serverEnv());
    return { cards: await repos.listCards(data.customerId) };
  });

export const recordStampFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      restaurantId: uuidSchema,
      membershipId: uuidSchema,
      staffId: uuidSchema,
      key: keySchema,
      pin: pinSchema,
    }),
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

/**
 * Signed-in owner overview. The restaurant comes from the session, never from
 * the caller, and the query runs inside that restaurant's RLS context.
 */
export const getOwnerOverviewFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadOwnerOverview }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-dashboard"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return loadOwnerOverview(viewer);
});

/** Signed-in guest cards. The customer id comes from the session. */
export const getMyCardsFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadMyCards }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-dashboard"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return loadMyCards(viewer);
});

/** Session lookup for route guards. The auth module stays off the client graph. */
export const getViewerFn = createServerFn({ method: "GET" }).handler(async () => {
  const { readViewer } = await import("./auth-viewer");
  return readViewer();
});

/** Finish the phone step for a Google account. */
export const completePhoneFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => (typeof value === "string" ? value : ""))
  .handler(async ({ data }) => {
    const { completePhone } = await import("./auth-viewer");
    return completePhone(data);
  });

/** The signed-in owner's guest list. */
export const getCustomerListFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadCustomerList }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-dashboard"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return loadCustomerList(viewer);
});

/** The signed-in owner's campaign list. */
export const getCampaignListFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadCampaignList }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-dashboard"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return loadCampaignList(viewer);
});

/** One live guest profile for the signed-in owner. */
export const getCustomerProfileFn = createServerFn({ method: "GET" })
  .validator(z.object({ customerId: uuidSchema }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { loadCustomerProfile }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-dashboard"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return null;
    return loadCustomerProfile(viewer, data.customerId);
  });

/** One live campaign result for the signed-in owner. */
export const getCampaignResultsFn = createServerFn({ method: "GET" })
  .validator(z.object({ campaignId: uuidSchema }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { loadCampaignResults }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-dashboard"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return null;
    return loadCampaignResults(viewer, data.campaignId);
  });

/** Change one guest's SMS consent. */
export const setSmsConsentFn = createServerFn({ method: "POST" })
  .validator(z.object({ membershipId: uuidSchema, enabled: z.boolean() }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { setSmsConsent }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-actions"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return setSmsConsent(viewer, data.membershipId, data.enabled);
  });

/** Reveal a guest's phone number, with an audit event. */
export const revealCustomerPhoneFn = createServerFn({ method: "POST" })
  .validator(z.object({ customerId: uuidSchema }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { revealPhone }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-actions"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return revealPhone(viewer, data.customerId);
  });

/** Approve a pending campaign without sending it. */
export const approveCampaignFn = createServerFn({ method: "POST" })
  .validator(z.object({ campaignId: uuidSchema }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { approveCampaign }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-actions"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return approveCampaign(viewer, data.campaignId);
  });

/** Cancel a scheduled campaign and release its reservation. */
export const cancelCampaignFn = createServerFn({ method: "POST" })
  .validator(z.object({ campaignId: uuidSchema }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { cancelCampaign }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-actions"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in again." };
    return cancelCampaign(viewer, data.campaignId);
  });
