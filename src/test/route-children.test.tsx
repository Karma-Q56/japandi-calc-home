import { QueryClient } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
  type AnyRoute,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { demoRepo, updateDemo } from "@/data/repo";
import type { OutletComponent } from "@/lib/nested";

vi.mock("@/server/live", () => ({
  getDataModeFn: async () => ({ mode: "demo" }),
  getPublicPageFn: async () => ({ page: null }),
  getCardFn: async () => ({ card: null }),
  joinCardFn: async () => ({ ok: false as const, message: "Demo mode" }),
  recordStampFn: async () => ({ ok: true }),
  verifyScanFn: async () => ({ ok: true }),
}));

/**
 * A file route with child routes must hand the URL to its child. If the parent
 * renders its own page instead, child URLs silently show the parent.
 */
function parentsMissingOutlet(): string[] {
  const missing: string[] = [];
  const walk = (route: AnyRoute) => {
    const children = (route.children ?? []) as AnyRoute[];
    if (route !== (routeTree as AnyRoute) && children.length > 0) {
      const component = route.options.component as OutletComponent | undefined;
      if (!component?.rendersChildren) {
        missing.push(
          `${children.map((child) => (child.options as { path?: string }).path).join(" | ")} (${typeof component}, unmarked)`,
        );
      }
    }
    for (const child of children) walk(child);
  };
  walk(routeTree as AnyRoute);
  return missing;
}

describe("nested routes", () => {
  it("every parent route with children renders an <Outlet />", () => {
    expect(parentsMissingOutlet()).toEqual([]);
  });
});

const owner = { role: "owner" as const, restaurantId: "rest-daily-grind" };
const operator = { role: "operator" as const };

beforeEach(() => {
  demoRepo.reset();
});

afterEach(() => {
  cleanup();
});

async function expectAt(url: string, heading: RegExp | string) {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    context: { queryClient },
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument());
}

describe("child URLs render their own content", () => {
  it("/app/customers/:id renders the guest profile, not the list", async () => {
    updateDemo((state) => ({ ...state, session: owner }));
    const state = demoRepo.read();
    const membership = state.memberships.find((m) => m.restaurantId === owner.restaurantId)!;
    await expectAt(`/app/customers/${membership.customerId}`, /Visit timeline/i);
  });

  it("/app/campaigns/:id renders campaign results, not the campaign list", async () => {
    updateDemo((state) => ({ ...state, session: owner }));
    const campaign = demoRepo.read().campaigns.find((c) => c.restaurantId === owner.restaurantId)!;
    // The results page leads with the campaign name and its delivery table.
    await expectAt(`/app/campaigns/${campaign.id}`, /A little Tuesday treat/i);
    await waitFor(() =>
      expect(screen.getByRole("table", { name: /delivery status/i })).toBeInTheDocument(),
    );
  });

  it("/me/restaurants renders the diner restaurant list", async () => {
    const state = demoRepo.read();
    const customer = state.customers.find((c) =>
      state.memberships.some((m) => m.customerId === c.id),
    )!;
    updateDemo((current) => ({
      ...current,
      session: { role: "guest", customerId: customer.id },
    }));
    await expectAt("/me/restaurants", /Your places/i);
  });

  it("/me/restaurants/:slug renders the venue page for that card", async () => {
    const state = demoRepo.read();
    const membership = state.memberships[0]!;
    const restaurant = state.restaurants.find((r) => r.id === membership.restaurantId)!;
    updateDemo((current) => ({
      ...current,
      session: { role: "guest", customerId: membership.customerId },
    }));
    await expectAt(`/me/restaurants/${restaurant.slug}`, new RegExp(restaurant.name, "i"));
  });

  it("/me/settings renders the messages section", async () => {
    const state = demoRepo.read();
    const customer = state.customers.find((c) =>
      state.memberships.some((m) => m.customerId === c.id),
    )!;
    updateDemo((current) => ({
      ...current,
      session: { role: "guest", customerId: customer.id },
    }));
    await expectAt("/me/settings", /Messages/i);
  });

  it("/ops/restaurants/:id renders the operator editor", async () => {
    updateDemo((state) => ({ ...state, session: operator }));
    const restaurant = demoRepo.read().restaurants[0]!;
    await expectAt(`/ops/restaurants/${restaurant.id}`, new RegExp(`${restaurant.name}\\.`, "i"));
  });

  it("/ops/restaurants/:id/look renders the look editor", async () => {
    updateDemo((state) => ({ ...state, session: operator }));
    const restaurant = demoRepo.read().restaurants[0]!;
    await expectAt(`/ops/restaurants/${restaurant.id}/look`, /Make it yours/i);
  });

  it("/ops/restaurants/:id/qr renders the QR print pack", async () => {
    updateDemo((state) => ({ ...state, session: operator }));
    const restaurant = demoRepo.read().restaurants[0]!;
    await expectAt(`/ops/restaurants/${restaurant.id}/qr`, new RegExp(restaurant.name, "i"));
  });

  it("/r/:slug/join renders the join flow, not the venue page", async () => {
    const restaurant = demoRepo
      .read()
      .restaurants.find((r) => r.status === "active")!;
    await expectAt(`/r/${restaurant.slug}/join`, /Join the regulars at/i);
  });

  it("/r/:slug/card renders the guest card", async () => {
    const state = demoRepo.read();
    const membership = state.memberships[0]!;
    const restaurant = state.restaurants.find((r) => r.id === membership.restaurantId)!;
    updateDemo((current) => ({
      ...current,
      session: { role: "guest", customerId: membership.customerId },
    }));
    await expectAt(`/r/${restaurant.slug}/card`, /Rewards waiting/i);
  });
});
