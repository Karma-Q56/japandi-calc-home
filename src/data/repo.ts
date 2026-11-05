import { createSeed } from "./seed";
import type { Campaign, DemoState, Offer, Repo } from "./types";

// Bump the key when the demo seed changes shape. Older keys are migrated into this
// one (or discarded when their shape no longer fits), so a browser that still holds
// a snapshot from a previous build never renders stale or half-shaped data.
const STORAGE_KEY = "patron-demo-v9";

/** Keys written by earlier builds, newest first. */
const LEGACY_STORAGE_KEYS = [
  "patron-demo-v8",
  "patron-demo-v7",
  "patron-demo-v6",
  "patron-demo-v5",
  "patron-demo-v4",
  "patron-demo-v3",
  "patron-demo-v2",
  "patron-demo-v1",
  "patron-demo",
];

/** Collections every usable snapshot must carry. */
const REQUIRED_COLLECTIONS = [
  "restaurants",
  "staff",
  "sections",
  "items",
  "specials",
  "customers",
  "memberships",
  "consents",
  "stamps",
  "rewards",
  "campaigns",
  "messages",
  "redemptions",
  "ledger",
  "payments",
  "audit",
  "leads",
  "referrals",
  "dataRequests",
] as const;

const ROLES = ["guest", "staff", "owner", "manager", "operator"] as const;

function allKeys() {
  return [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
}

function clearStored() {
  if (typeof window === "undefined") return;
  for (const key of allKeys()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* Storage can be blocked; the in-memory demo still works. */
    }
  }
}

function persist(state: DemoState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // The migrated copy is authoritative; drop the old keys so they cannot come back.
    for (const key of LEGACY_STORAGE_KEYS) window.localStorage.removeItem(key);
  } catch {
    /* Keep the in-memory demo usable when storage is blocked or full. */
  }
}

/** Read the newest snapshot this browser holds, whatever key it was written under. */
function readSnapshot(): { state: DemoState; key: string } | null {
  if (typeof window === "undefined") return null;
  for (const key of allKeys()) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const state = normalise(JSON.parse(raw));
      if (state) return { state, key };
    } catch {
      /* A broken value is treated like a mismatched one: discard and reseed. */
    }
  }
  return null;
}

/**
 * Offers are the one list the owner works from. Stored offers are kept as they
 * are; any legacy special or campaign without an offer gets one here, so old
 * data shows up once and is never duplicated.
 */
export function mergeOffers(parsed: Partial<DemoState>): Offer[] {
  const offers: Offer[] = [...(parsed.offers ?? [])];
  const linkedSpecials = new Set(offers.map((item) => item.legacySpecialId).filter(Boolean));
  const linkedCampaigns = new Set(offers.map((item) => item.legacyCampaignId).filter(Boolean));
  for (const special of parsed.specials ?? []) {
    if (linkedSpecials.has(special.id)) continue;
    offers.push({
      id: `offer-${special.id}`,
      restaurantId: special.restaurantId,
      title: special.title,
      body: special.body,
      kind: special.kind ?? "public",
      ...(special.code ? { code: special.code } : {}),
      minTier: special.minTier ?? null,
      startsAt: special.startsAt,
      endsAt: special.endsAt,
      active: special.active,
      placements: { page: true, till: false, push: false, sms: false },
      status: special.active ? "live" : "cancelled",
      legacySpecialId: special.id,
      ...(special.createdAt ? { createdAt: special.createdAt } : {}),
    });
  }
  for (const campaign of (parsed.campaigns ?? []) as Campaign[]) {
    if (linkedCampaigns.has(campaign.id)) continue;
    offers.push({
      id: `offer-${campaign.id}`,
      restaurantId: campaign.restaurantId,
      title: campaign.name,
      body: campaign.body,
      kind: "public",
      code: campaign.code,
      ...(campaign.validFrom ? { startsAt: campaign.validFrom } : {}),
      ...(campaign.validTo ? { endsAt: campaign.validTo } : {}),
      active: campaign.status !== "cancelled" && campaign.status !== "failed",
      placements: {
        page: false,
        till: false,
        push: campaign.channel === "push" || campaign.channel === "push_then_sms",
        sms: campaign.channel === "sms" || campaign.channel === "push_then_sms",
      },
      status: campaign.status === "sent" ? "sent" : campaign.status === "scheduled" ? "scheduled" : campaign.status === "cancelled" || campaign.status === "failed" ? "cancelled" : "live",
      legacyCampaignId: campaign.id,
      createdAt: campaign.createdAt,
    });
  }
  return offers;
}

/** Turn whatever a previous build stored into the current shape, or reject it. */
function normalise(raw: unknown): DemoState | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<DemoState>;
  if (parsed.version !== 2) return null;

  const record = raw as Record<string, unknown>;
  if (!REQUIRED_COLLECTIONS.every((key) => Array.isArray(record[key]))) return null;
  if (!Array.isArray(parsed.restaurants) || parsed.restaurants.length === 0) return null;
  if (!parsed.restaurants.every((restaurant) => restaurant && restaurant.id && restaurant.slug)) {
    return null;
  }

  const fresh = createSeed(typeof parsed.now === "number" ? parsed.now : undefined);
  const freshById = new Map(fresh.restaurants.map((restaurant) => [restaurant.id, restaurant]));

  const restaurants = parsed.restaurants.map((restaurant) => {
    const seedRow = freshById.get(restaurant.id);
    const welcomeStamps =
      typeof restaurant.welcomeStamps === "number"
        ? restaurant.welcomeStamps
        : restaurant.welcomeStamp
          ? Math.min(1, restaurant.stampsRequired - 1)
          : 0;
    return {
      ...seedRow,
      ...restaurant,
      senderName: restaurant.senderName ?? seedRow?.senderName ?? restaurant.slug,
      smsCapRestaurant: restaurant.smsCapRestaurant ?? 3,
      smsCapMember: restaurant.smsCapMember ?? 2,
      contact: restaurant.contact ?? "",
      welcomeStamps,
      welcomeStamp: welcomeStamps > 0,
      pageTemplate: restaurant.pageTemplate ?? seedRow?.pageTemplate ?? "classic",
      tiers: restaurant.tiers ?? seedRow?.tiers ?? { regular: 3, vip: 8 },
      mysteryEveryVisits: restaurant.mysteryEveryVisits ?? seedRow?.mysteryEveryVisits ?? 0,
      birthdayReward: restaurant.birthdayReward ?? seedRow?.birthdayReward ?? false,
      birthdayRewardKind: restaurant.birthdayRewardKind ?? seedRow?.birthdayRewardKind ?? "stamp",
      birthdayRewardItem: restaurant.birthdayRewardItem ?? seedRow?.birthdayRewardItem ?? "",
      trackOrders: restaurant.trackOrders ?? seedRow?.trackOrders ?? false,
      ordersMode: restaurant.ordersMode ?? seedRow?.ordersMode ?? "items",
      referral: restaurant.referral ?? seedRow?.referral ?? {
        enabled: false,
        rewardKind: "stamp",
        rewardItem: "",
        limitPerMemberPerMonth: 2,
      },
      spin: restaurant.spin ?? seedRow?.spin ?? {
        enabled: false,
        segments: [],
        weeklyBudgetCents: 0,
        earnEveryVisits: 5,
        earnAtMilestone: false,
        rules: "",
      },
    };
  });

  const restaurantIds = new Set(restaurants.map((restaurant) => restaurant.id));
  const customers = parsed.customers ?? [];
  const customerIds = new Set(customers.map((customer) => customer.id));
  const staff = parsed.staff ?? [];
  const staffIds = new Set(staff.map((member) => member.id));

  // Orders are optional in stored snapshots: old saves simply start empty.
  const convertedOrders = (parsed.orders ?? []).filter(
    (order) => order && restaurantIds.has(order.restaurantId),
  );

  // Memberships that point at a guest or venue that no longer exists cannot render a
  // card. Drop those rows rather than letting a dead link open an empty page.
  const memberships = (parsed.memberships ?? [])
    .filter(
      (membership) =>
        membership && restaurantIds.has(membership.restaurantId) && customerIds.has(membership.customerId),
    )
    .map((membership) => ({
      ...membership,
      marketingPush: membership.marketingPush ?? false,
      lastSeenStamps: membership.lastSeenStamps ?? membership.stampsCurrent,
    }));

  const session = { ...fresh.session, ...(parsed.session ?? {}) };
  if (!ROLES.includes(session.role)) session.role = "guest";
  if (session.customerId && !customerIds.has(session.customerId)) delete session.customerId;
  if (session.restaurantId && !restaurantIds.has(session.restaurantId)) delete session.restaurantId;
  if (session.staffId && !staffIds.has(session.staffId)) delete session.staffId;

  return {
    ...fresh,
    ...parsed,
    version: 2,
    restaurants,
    staff,
    customers,
    memberships,
    session,
    specials: (parsed.specials ?? []).map((special) => ({
      ...special,
      kind: special.kind ?? "public",
    })),
    specialCodes: parsed.specialCodes ?? [],
    offers: mergeOffers(parsed),
    spins: parsed.spins ?? [],
    challenges: parsed.challenges ?? [],
    savedLists: parsed.savedLists ?? [],
    smsReplies: parsed.smsReplies ?? [],
    rateLimitHits: parsed.rateLimitHits ?? [],
    pairingCodes: parsed.pairingCodes ?? [],
    otpSendLog: parsed.otpSendLog ?? [],
    providerEvents: parsed.providerEvents ?? [],
    pinAttempts: parsed.pinAttempts ?? [],
    pinLockouts: parsed.pinLockouts ?? [],
    onboarding: parsed.onboarding ?? [],
    pageVersions: parsed.pageVersions ?? [],
    menuVersions: parsed.menuVersions ?? [],
    feedback: parsed.feedback ?? [],
    helpDrafts: parsed.helpDrafts ?? [],
    helpRequests: parsed.helpRequests ?? [],
    pushSubscriptions: parsed.pushSubscriptions ?? [],
    orders: convertedOrders,
    referrals: (parsed.referrals ?? []).filter(
      (referral) => referral && restaurantIds.has(referral.restaurantId),
    ),
  };
}

function load(): DemoState {
  if (typeof window === "undefined") return createSeed();
  const stored = readSnapshot();
  if (!stored) {
    // Nothing usable was stored: drop the old keys and start from the current seed,
    // so the browser never keeps a snapshot this build cannot read.
    clearStored();
    const fresh = createSeed();
    persist(fresh);
    return fresh;
  }
  if (stored.key !== STORAGE_KEY) persist(stored.state);
  return stored.state;
}

let current = load();
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((listener) => listener());
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && !event.key.startsWith("patron-demo")) return;
    current = load();
    notify();
  });
}

export const demoRepo: Repo = {
  read: () => current,
  update: (mutator) => {
    current = mutator(current);
    persist(current);
    notify();
    return current;
  },
  write: (state) => {
    current = state;
    persist(current);
    notify();
    return current;
  },
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset: () => {
    clearStored();
    current = createSeed();
    persist(current);
    notify();
    return current;
  },
};

export function updateDemo(mutator: (state: DemoState) => DemoState): DemoState {
  return demoRepo.update(mutator);
}

export const demoStorage = {
  key: STORAGE_KEY,
  legacyKeys: LEGACY_STORAGE_KEYS,
} as const;
