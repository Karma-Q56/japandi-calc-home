import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { demoRepo, updateDemo } from "@/data/repo";
import { formatRand } from "@/lib/money";

vi.mock("@/server/live", () => ({
  getDataModeFn: async () => ({ mode: "demo" }),
  getPublicPageFn: async () => ({ page: null }),
  getCardFn: async () => ({ card: null }),
  joinCardFn: async () => ({ ok: false as const, message: "Demo mode" }),
  recordStampFn: async () => ({ ok: true }),
  verifyScanFn: async () => ({ ok: true }),
}));

async function renderMenu() {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/app/menu"] }),
    context: { queryClient },
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByText("Preview item");
  return router;
}

beforeEach(() => {
  demoRepo.reset();
  updateDemo((state) => ({
    ...state,
    session: { role: "owner", restaurantId: state.restaurants[0]!.id },
  }));
});

afterEach(() => {
  cleanup();
});

describe("menu preview before publish", () => {
  it("keeps a new item off the live menu until the owner publishes", async () => {
    const restaurant = demoRepo.read().restaurants[0]!;
    const before = demoRepo
      .read()
      .items.filter((item) => item.restaurantId === restaurant.id).length;

    await renderMenu();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Koeksister" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Syrup and cinnamon" },
    });
    fireEvent.change(screen.getByLabelText("Price in rand"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview item" }));

    await screen.findByText(/Preview only/);
    expect(demoRepo.read().items.some((item) => item.name === "Koeksister")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Publish to my menu" }));
    await screen.findByText("Koeksister is live.");

    const saved = demoRepo.read().items.filter((item) => item.restaurantId === restaurant.id);
    expect(saved).toHaveLength(before + 1);
    expect(saved.some((item) => item.name === "Koeksister")).toBe(true);
  });

  it("switches the preview template without touching the live page", async () => {
    const restaurant = demoRepo.read().restaurants[0]!;
    const liveTemplate = restaurant.pageTemplate;
    await renderMenu();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Rusks" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview item" }));

    const minimal = await screen.findByRole("button", { name: "Minimal" });
    fireEvent.click(minimal);

    expect(minimal.getAttribute("aria-pressed")).toBe("true");
    expect(restaurant.pageTemplate).toBe(liveTemplate);
  });

  it("shows seeded menu prices as ordinary cafe prices", () => {
    const prices = demoRepo.read().items.map((item) => formatRand(item.priceCents));
    expect(prices).toEqual(["R38", "R24", "R26", "R32", "R45", "R95"]);
    for (const price of prices) expect(price).not.toMatch(",");
  });
});
