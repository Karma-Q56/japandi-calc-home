import { createSeed } from "./seed";
import type { DemoState, Repo } from "./types";

// Bump the key when the demo seed changes shape, so browsers that still hold
// an older demo snapshot start from the current seed instead of stale data.
const STORAGE_KEY = "patron-demo-v6";
function load(): DemoState {
  try {
    if (typeof window === "undefined") return createSeed();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeed();
    const parsed = JSON.parse(raw) as DemoState;
    if (parsed.version !== 2) return createSeed();
    const fresh = createSeed(parsed.now);
    const freshById = new Map(fresh.restaurants.map((r) => [r.id, r]));
    return {
      ...fresh,
      ...parsed,
      restaurants: parsed.restaurants.map((r) => {
        const seedRow = freshById.get(r.id);
        const welcomeStamps =
          typeof r.welcomeStamps === "number"
            ? r.welcomeStamps
            : r.welcomeStamp
              ? Math.min(1, r.stampsRequired - 1)
              : 0;
        return {
          ...seedRow,
          ...r,
          senderName: r.senderName ?? seedRow?.senderName ?? r.slug,
          smsCapRestaurant: r.smsCapRestaurant ?? 3,
          smsCapMember: r.smsCapMember ?? 2,
          contact: r.contact ?? "",
          welcomeStamps,
          welcomeStamp: welcomeStamps > 0,
          pageTemplate: r.pageTemplate ?? seedRow?.pageTemplate ?? "classic",
          tiers: r.tiers ?? seedRow?.tiers ?? { regular: 3, vip: 8 },
          mysteryEveryVisits: r.mysteryEveryVisits ?? seedRow?.mysteryEveryVisits ?? 0,
          birthdayReward: r.birthdayReward ?? seedRow?.birthdayReward ?? false,
          spin: r.spin ?? seedRow?.spin ?? {
            enabled: false,
            segments: [],
            weeklyBudgetCents: 0,
            earnEveryVisits: 5,
            earnAtMilestone: false,
            rules: "",
          },
        };
      }),
      specials: parsed.specials.map((special) => ({
        ...special,
        kind: special.kind ?? "public",
      })),
      specialCodes: parsed.specialCodes ?? [],
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
    };
  } catch {
    return createSeed();
  }
}

let current = load();
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((listener) => listener());
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    current = load();
    notify();
  });
}

export const demoRepo: Repo = {
  read: () => current,
  update: (mutator) => {
    current = mutator(current);
    try {
      if (typeof window !== "undefined")
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      /* Keep the in-memory demo usable when storage is blocked or full. */
    }
    notify();
    return current;
  },
  write: (state) => {
    current = state;
    try {
      if (typeof window !== "undefined")
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* Keep the in-memory demo usable when storage is blocked or full. */
    }
    notify();
    return current;
  },
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset: () => {
    current = createSeed();
    try {
      if (typeof window !== "undefined")
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      /* Keep the in-memory demo usable when storage is blocked or full. */
    }
    notify();
    return current;
  },
};

export function updateDemo(mutator: (state: DemoState) => DemoState): DemoState {
  return demoRepo.update(mutator);
}
