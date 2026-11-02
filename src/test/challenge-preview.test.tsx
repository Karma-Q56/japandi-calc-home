import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { demoRepo, updateDemo } from "@/data/repo";
import { ChallengeRow } from "@/components/patron/ChallengeRow";

vi.mock("@/server/live", () => ({
  getDataModeFn: async () => ({ mode: "demo" }),
  getPublicPageFn: async () => ({ page: null }),
  getCardFn: async () => ({ card: null }),
  joinGuestFn: async () => ({ ok: false, message: "Demo mode" }),
  recordStampFn: async () => ({ ok: true }),
  verifyScanFn: async () => ({ ok: true }),
}));

async function renderChallenges() {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/app/challenges"] }),
    context: { queryClient },
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByRole("button", { name: "Preview this challenge" });
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

describe("challenge preview before publish", () => {
  it("shows the guest row and saves nothing until Publish", async () => {
    const restaurantId = demoRepo.read().restaurants[0]!.id;
    const before = demoRepo
      .read()
      .challenges.filter((item) => item.restaurantId === restaurantId).length;

    await renderChallenges();
    fireEvent.change(screen.getByLabelText(/Challenge name/), {
      target: { value: "Five visits before Sunday" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview this challenge" }));

    await screen.findByText(/Preview only/);
    expect(screen.getAllByText("Five visits before Sunday").length).toBeGreaterThan(0);
    expect(
      demoRepo.read().challenges.some((item) => item.title === "Five visits before Sunday"),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Publish challenge" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, publish" }));

    await screen.findByText("Five visits before Sunday is live.");
    const saved = demoRepo.read().challenges.filter((item) => item.restaurantId === restaurantId);
    expect(saved).toHaveLength(before + 1);
    expect(saved.some((item) => item.title === "Five visits before Sunday")).toBe(true);
  });

  it("never previews a title that is too short", async () => {
    await renderChallenges();
    fireEvent.change(screen.getByLabelText(/Challenge name/), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview this challenge" }));
    expect(screen.getByRole("status").textContent).toMatch(/2 to 70 letters/);
    expect(screen.queryByText(/Preview only/)).toBeNull();
  });
});

describe("guest challenge row", () => {
  it("reads singular and plural bonus stamps correctly", () => {
    const { unmount } = render(
      <ChallengeRow
        title="One"
        visits={0}
        needed={3}
        windowDays={14}
        bonusStamps={1}
        done={false}
      />,
    );
    expect(screen.getByText("+1 bonus stamp")).toBeTruthy();
    unmount();
    render(
      <ChallengeRow
        title="Two"
        visits={0}
        needed={3}
        windowDays={14}
        bonusStamps={2}
        done={false}
      />,
    );
    expect(screen.getByText("+2 bonus stamps")).toBeTruthy();
  });
});
