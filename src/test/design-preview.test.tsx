import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { demoRepo, updateDemo } from "@/data/repo";

vi.mock("@/server/live", () => ({
  getDataModeFn: async () => ({ mode: "demo" }),
  getPublicPageFn: async () => ({ page: null }),
  getCardFn: async () => ({ card: null }),
  joinGuestFn: async () => ({ ok: false, message: "Demo mode" }),
  recordStampFn: async () => ({ ok: true }),
  verifyScanFn: async () => ({ ok: true }),
}));

async function renderDesign() {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/app/design"] }),
    context: { queryClient },
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByRole("button", { name: "Preview my card" });
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

describe("card design preview", () => {
  it("keeps a design in draft until the owner previews and publishes", async () => {
    const restaurantId = demoRepo.read().restaurants[0]!.id;
    const originalTagline = demoRepo.read().restaurants[0]!.theme.tagline;
    await renderDesign();

    fireEvent.change(screen.getByLabelText("Tagline"), {
      target: { value: "Made for slow mornings" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview my card" }));

    await screen.findByText(/Preview only/);
    expect(
      demoRepo.read().restaurants.find((item) => item.id === restaurantId)!.theme.tagline,
    ).toBe(originalTagline);

    fireEvent.click(screen.getByRole("button", { name: "Publish card design" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, publish" }));

    await screen.findByText(/Published\. Guests see this design now/);
    expect(
      demoRepo.read().restaurants.find((item) => item.id === restaurantId)!.theme.tagline,
    ).toBe("Made for slow mornings");
  });

  it("refuses to preview unreadable text and background colours", async () => {
    await renderDesign();
    const text = screen.getByLabelText("Text") as HTMLInputElement;
    const background = screen.getByLabelText("Background") as HTMLInputElement;
    fireEvent.change(text, { target: { value: "#f2ede4" } });
    fireEvent.change(background, { target: { value: "#f5f0e8" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview my card" }));
    expect(screen.getByRole("status").textContent).toMatch(/too close to read comfortably/);
    expect(screen.queryByText(/Preview only/)).toBeNull();
  });
});
