import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSeed } from "@/data/seed";

vi.mock("@/server/live", () => ({
  getDataModeFn: async () => ({ mode: "demo" }),
  getPublicPageFn: async () => ({ page: null }),
  getCardFn: async () => ({ card: null }),
  joinCardFn: async () => ({ ok: false as const, message: "Demo mode" }),
  recordStampFn: async () => ({ ok: true }),
  verifyScanFn: async () => ({ ok: true }),
}));

/** The key the build before this one wrote under. */
const LEGACY_KEY = "patron-demo-v8";
/** The key this build writes under. */
const CURRENT_KEY = "patron-demo-v9";

/**
 * A realistic snapshot from the previous build: same version number, but written
 * before welcome stamps, push consent, special kinds, spins, challenges and saved
 * lists existed. Migrating it must not break a card.
 */
function previousVersionSnapshot(): Record<string, unknown> {
  const seed = createSeed();
  const snapshot: Record<string, unknown> = {
    ...seed,
    restaurants: seed.restaurants.map((restaurant) => {
      const { welcomeStamps: _welcomeStamps, spin: _spin, ...rest } = restaurant;
      return {
        ...rest,
        welcomeStamp: true,
        spin: {
          enabled: false,
          modes: ["welcome"],
          segments: [],
          weeklyBudgetCents: 0,
          earnEveryVisits: 5,
          earnAtMilestone: false,
          rules: "",
        },
      };
    }),
    memberships: seed.memberships.map((membership) => {
      const { marketingPush: _push, lastSeenStamps: _seen, ...rest } = membership;
      return rest;
    }),
    specials: seed.specials.map(({ kind: _kind, ...rest }) => rest),
    session: { role: "guest", customerId: seed.memberships[0]!.customerId },
  };
  delete snapshot["savedLists"];
  delete snapshot["challenges"];
  delete snapshot["spins"];
  delete snapshot["pushSubscriptions"];
  delete snapshot["specialCodes"];
  return snapshot;
}

/** Import the app afresh so its module-level storage read sees the seeded snapshot. */
async function loadFreshApp() {
  vi.resetModules();
  const [{ routeTree }, repoModule] = await Promise.all([
    import("@/routeTree.gen"),
    import("@/data/repo"),
  ]);
  return { routeTree, ...repoModule };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("demo storage from a previous build", () => {
  it("migrates the old snapshot and opens a card for every membership", async () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(previousVersionSnapshot()));
    const { routeTree, demoRepo, updateDemo } = await loadFreshApp();

    const state = demoRepo.read();
    expect(state.version).toBe(2);
    expect(state.memberships.length).toBeGreaterThan(0);
    // The old key is retired and the migrated copy lives under the current key.
    expect(window.localStorage.getItem(CURRENT_KEY)).toBeTruthy();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();

    const queryClient = new QueryClient();
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/me"] }),
      context: { queryClient },
    });
    await router.load();
    render(<RouterProvider router={router} />);

    for (const membership of state.memberships) {
      const customer = state.customers.find((item) => item.id === membership.customerId);
      const restaurant = state.restaurants.find((item) => item.id === membership.restaurantId);
      expect(customer, `membership ${membership.id} keeps its guest`).toBeTruthy();
      expect(restaurant, `membership ${membership.id} keeps its venue`).toBeTruthy();

      updateDemo((current) => ({
        ...current,
        session: { role: "guest", customerId: membership.customerId },
      }));
      await router.navigate({
        to: "/r/$slug/card",
        params: { slug: restaurant!.slug },
        search: {},
      });
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /Rewards waiting/i })).toBeInTheDocument(),
      );
      // The card for this guest actually rendered, rather than the previous guest's.
      expect(screen.getAllByText(customer!.name).length).toBeGreaterThan(0);
    }
  }, 240_000);

  it("discards a snapshot whose shape or version does not match", async () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify({ version: 1, restaurants: [] }));
    const { demoRepo } = await loadFreshApp();

    const state = demoRepo.read();
    expect(state.restaurants.length).toBe(3);
    expect(state.memberships.length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(CURRENT_KEY)).toBeTruthy();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  }, 60_000);

  it("drops memberships that point at a guest or venue that no longer exists", async () => {
    const snapshot = previousVersionSnapshot();
    const memberships = snapshot["memberships"] as Array<Record<string, unknown>>;
    memberships.push({ ...memberships[0]!, id: "orphan-restaurant", restaurantId: "gone" });
    memberships.push({ ...memberships[0]!, id: "orphan-guest", customerId: "gone" });
    snapshot["session"] = { role: "guest", customerId: "gone" };
    window.localStorage.setItem(CURRENT_KEY, JSON.stringify(snapshot));

    const { demoRepo } = await loadFreshApp();
    const state = demoRepo.read();

    expect(state.memberships.map((item) => item.id)).not.toContain("orphan-restaurant");
    expect(state.memberships.map((item) => item.id)).not.toContain("orphan-guest");
    expect(state.memberships.length).toBeGreaterThan(0);
    // A session pointing at a removed guest is cleared rather than left dangling.
    expect(state.session.customerId).toBeUndefined();
  }, 60_000);
});
