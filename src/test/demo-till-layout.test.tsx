import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    options,
    useLoaderData: () => ({ mode: "demo" }),
  }),
  redirect: (value: unknown) => value,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/server/live", () => ({
  getDataModeFn: vi.fn(),
  recordStampFn: vi.fn(),
  verifyScanFn: vi.fn(),
}));
vi.mock("@/components/patron/LiveTill", () => ({ LiveTill: () => null }));
vi.mock("@/components/patron/CardScanner", () => ({ CardScanner: () => null }));

import { api } from "@/api";
import { demoRepo, updateDemo } from "@/data/repo";
import { Route } from "@/routes/stamp";

const Till = (Route as unknown as { options: { component: ComponentType } }).options.component;
const RESTAURANT = "rest-daily-grind";

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

beforeEach(async () => {
  demoRepo.reset();
  updateDemo((state) => ({ ...state, session: { role: "staff", restaurantId: RESTAURANT } }));
  api.team.pairThisDevice(RESTAURANT);
  const member = demoRepo.read().staff.find((s) => s.restaurantId === RESTAURANT && s.active)!;
  const signedIn = await api.team.signIn({ staffId: member.id, pin: "1234" });
  expect(signedIn.ok).toBe(true);
});
afterEach(cleanup);

function guestCode() {
  const state = demoRepo.read();
  const membership = state.memberships.find((m) => m.restaurantId === RESTAURANT)!;
  return state.customers.find((c) => c.id === membership.customerId)!.memberCode;
}

async function findGuest() {
  fireEvent.change(screen.getByLabelText(/Member code or phone/), {
    target: { value: guestCode() },
  });
  await act(async () => {
    fireEvent.click(button("Look up"));
  });
}

describe("demo till after the PIN", () => {
  it("shows the heading, the sign out button and the three sections", () => {
    render(<Till />);
    expect(screen.getByRole("heading", { name: /, you're on the till\.$/ })).toBeTruthy();
    for (const name of ["Add a stamp", "Redeem a reward", "Redeem an offer code"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
    expect(button("Add stamp").disabled).toBe(true);
    expect(button("Redeem offer").disabled).toBe(true);
    expect(button("Sign out")).toBeTruthy();
  });

  it("announces a stamp as success and a refused code as an error", async () => {
    render(<Till />);
    await findGuest();
    await act(async () => {
      fireEvent.click(button("Add stamp"));
    });
    // Either the stamp is added or the guest was stamped too recently; both are announced.
    const line = document.querySelector(".till-staffbar .till-toast")!;
    expect(["status", "alert"]).toContain(line.getAttribute("role"));
    fireEvent.change(screen.getByLabelText(/Offer code/), { target: { value: "NOPE99" } });
    await act(async () => {
      fireEvent.click(button("Redeem offer"));
    });
    const error = screen.getByRole("alert");
    expect(error.className).toContain("is-error");
  });

  it("adds a stamp, shows the new count and a green status line", async () => {
    updateDemo((state) => ({
      ...state,
      stamps: [],
      memberships: state.memberships.map((m) => ({ ...m, stampsCurrent: 1, lastVisitAt: null })),
    }));
    render(<Till />);
    await findGuest();
    await act(async () => {
      fireEvent.click(button("Add stamp"));
    });
    const line = screen.getByRole("status");
    expect(line.className).toContain("is-ok");
    expect(line.textContent).toMatch(/^Stamp added, \d+ of \d+\.$/);
    const count = line.textContent!.match(/\d+/)![0];
    expect(
      screen.getByRole("region", { name: "Guest" }).querySelector("strong")!.textContent,
    ).toMatch(new RegExp(`^${count}`));
  });
});
