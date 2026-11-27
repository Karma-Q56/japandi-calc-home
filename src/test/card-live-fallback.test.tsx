import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSeed } from "@/data/seed";

/**
 * Live mode on a dev branch that has not run the latest migration: the venue
 * read fails. A diner's card must still open, and the venue page must say so
 * instead of crashing the whole /r/... subtree.
 */
const live = vi.hoisted(() => ({
  mode: "live" as "live" | "demo",
  failVenue: true,
  venueReads: 0,
}));

vi.mock("@/server/live", () => ({
  getDataModeFn: async () => ({ mode: live.mode }),
  getPublicPageFn: async () => {
    live.venueReads += 1;
    if (live.failVenue) throw new Error('column "welcome_stamps" does not exist');
    return { page: null };
  },
  getCardFn: async () => ({ card: null }),
  getViewerFn: async () => ({ role: "guest", customerId: "c1" }),
  joinCardFn: async () => ({ ok: false as const, message: "Demo mode" }),
  recordStampFn: async () => ({ ok: true }),
  verifyScanFn: async () => ({ ok: true }),
}));

const STORAGE_KEY = "patron-demo-v7";

function dinerFixture() {
  const seed = createSeed();
  const membership = seed.memberships[0]!;
  const restaurant = seed.restaurants.find((item) => item.id === membership.restaurantId)!;
  const customer = seed.customers.find((item) => item.id === membership.customerId)!;
  return {
    snapshot: { ...seed, session: { role: "guest", customerId: customer.id } },
    slug: restaurant.slug,
    customerName: customer.name,
  };
}

/** Load the app fresh so the repo reads the seeded demo session, then render `path`. */
async function renderAt(path: string) {
  const fixture = dinerFixture();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fixture.snapshot));
  vi.resetModules();
  const { routeTree } = await import("@/routeTree.gen");

  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return fixture;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  live.mode = "live";
  live.failVenue = true;
  live.venueReads = 0;
});

describe("live mode with a failing venue read", () => {
  it("opens the card page and never borrows a demo card", { timeout: 120_000 }, async () => {
    const fixture = await renderAt(`/r/${dinerFixture().slug}/card`);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /You have no card here yet/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText(fixture.customerName)).not.toBeInTheDocument();
    // The card is the guest's own page; it never needs the venue read.
    expect(live.venueReads).toBe(0);
  });

  it("renders a clear venue message instead of throwing", { timeout: 120_000 }, async () => {
    await renderAt(`/r/${dinerFixture().slug}`);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /We couldn’t load this place/i })).toBeInTheDocument(),
    );
    expect(live.venueReads).toBe(1);
  });
});
