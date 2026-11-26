import { readFileSync, readdirSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";

vi.mock("@/server/live", () => ({
  getDataModeFn: async () => ({ mode: "live" }),
  getViewerFn: async () => ({ role: "owner", restaurantId: "r1", customerId: null }),
  getOwnerOverviewFn: async () => ({
    restaurantName: "Walk Cafe",
    overview: { stats: [], weeklyVisits: [], nextCampaign: null, lastCampaign: null },
  }),
  getMyRestaurantFn: async () => ({ published: true, slug: "walk-cafe", name: "Walk Cafe" }),
}));
vi.mock("@/server/live-billing-fns", () => ({ getBillingBannerFn: async () => null }));
vi.mock("@/server/live-publish-fns", () => ({
  getPublishStateFn: async () => null,
  publishRestaurantFn: async () => null,
  setRestaurantListedFn: async () => null,
  unpublishRestaurantFn: async () => null,
}));
vi.mock("@/server/live-insights-fns", () => ({
  getInsightsFn: async () => ({
    ok: true,
    restaurantName: "Walk Cafe",
    guests: {
      newGuests: 0,
      newGuestsChange: "No change",
      returningGuests: 0,
      lapsedGuests: 0,
      lapsedDays: 30,
      dailyNew: [],
    },
    performance: {
      visits: 0,
      visitsChange: "No change",
      uniqueGuests: 0,
      rewardsEarned: 0,
      rewardsRedeemed: 0,
      redemptionRate: "0%",
      dailyVisits: [],
      topItems: [],
      tillOrdersEnabled: false,
    },
  }),
}));

afterEach(cleanup);

async function open(url: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    context: { queryClient: new QueryClient() },
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

describe("live owner screens", () => {
  it("every owner page asks which mode it is in, so none can show sample data by accident", () => {
    const pages = readdirSync("src/routes").filter((name) => /^app\..+\.tsx$/.test(name));
    expect(pages.length).toBeGreaterThan(20);
    const missing = pages.filter(
      (name) => !readFileSync(`src/routes/${name}`, "utf8").includes("getDataModeFn"),
    );
    expect(missing).toEqual([]);
  });

  it("opens Insights itself, with exactly one tab bar", async () => {
    await open("/app/insights");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Insights." })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/not live yet/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll(".section-tabs")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "Performance" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
  });

  it("sends the sample setup checklist to the overview", async () => {
    const router = await open("/app/onboarding");
    expect(router.state.location.pathname).toBe("/app");
  });
});
