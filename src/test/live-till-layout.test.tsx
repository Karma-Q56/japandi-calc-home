import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({
  getTillStateFn: vi.fn(),
  lookupGuestFn: vi.fn(),
  tillRecordStampFn: vi.fn(),
  tillRedeemRewardFn: vi.fn(),
  tillUndoRedeemFn: vi.fn(),
  tillRedeemOfferFn: vi.fn(),
  tillSignOutFn: vi.fn(),
  pairTillFn: vi.fn(),
  tillSignInFn: vi.fn(),
  tillUnpairFn: vi.fn(),
}));
vi.mock("@/server/live", () => server);
vi.mock("@/lib/sign-out", () => ({ signOut: vi.fn() }));
vi.mock("@/components/patron/live/TillOrderStep", () => ({ TillOrderStep: () => null }));
vi.mock("@/components/patron/CardScanner", () => ({ CardScanner: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useNavigate: () => vi.fn(),
}));

import { LiveTill } from "@/components/patron/LiveTill";

const signedIn = {
  paired: true,
  restaurant: { name: "Test Cafe", branchName: "Main" },
  staff: { id: "s1", displayName: "Lerato" },
  crew: [],
};
const guest = {
  ok: true,
  membershipId: "m1",
  firstName: "Thandi",
  lastInitial: "M",
  stampsCurrent: 3,
  stampsRequired: 8,
  rewards: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  server.getTillStateFn.mockResolvedValue(signedIn);
  server.lookupGuestFn.mockResolvedValue(guest);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

async function findGuest() {
  fireEvent.change(screen.getByRole("textbox", { name: /Member code or phone/ }), { target: { value: "PT123" } });
  await act(async () => {
    fireEvent.click(button("Look up"));
  });
}

describe("live till after the PIN", () => {
  it("greets the staff member and shows the three sections before any guest is found", async () => {
    render(<LiveTill />);
    expect(
      await screen.findByRole("heading", { name: "Lerato, you're on the till." }),
    ).toBeTruthy();
    for (const name of ["Add a stamp", "Redeem a reward", "Redeem an offer code"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
    expect(button("Scan card")).toBeTruthy();
    expect(button("Add stamp").disabled).toBe(true);
    expect(button("Sign out")).toBeTruthy();
  });

  it("takes an offer code for the guest and says what to give", async () => {
    server.tillRedeemOfferFn.mockResolvedValue({
      ok: true,
      title: "Winter coffee",
      give: "Free coffee",
    });
    render(<LiveTill />);
    await screen.findByRole("region", { name: "Redeem an offer code" });
    expect(button("Use this code").disabled).toBe(true);
    await findGuest();
    fireEvent.change(screen.getByRole("textbox", { name: /Offer code/ }), {
      target: { value: "winter9" },
    });
    await act(async () => {
      fireEvent.click(button("Use this code"));
    });
    expect(server.tillRedeemOfferFn.mock.calls[0]![0].data).toMatchObject({
      membershipId: "m1",
      code: "WINTER9",
    });
    expect(screen.getByText("Code accepted: Winter coffee. Give: Free coffee")).toBeTruthy();
  });

  it("shows a green status line after a stamp and keeps it readable", async () => {
    server.tillRecordStampFn.mockResolvedValue({ ok: true, result: "stamped", stampsCurrent: 4 });
    render(<LiveTill />);
    await screen.findByRole("region", { name: "Add a stamp" });
    await findGuest();
    await act(async () => {
      fireEvent.click(button("Add stamp"));
    });
    const line = screen.getByRole("status");
    expect(line.textContent).toBe("Stamp added.");
    expect(line.className).toContain("is-ok");
    await findGuest();
    expect(screen.getByRole("status").textContent).toBe("Stamp added.");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6000);
    await findGuest();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a red alert when the stamp is refused", async () => {
    server.tillRecordStampFn.mockResolvedValue({ ok: false, message: "That card is paused." });
    render(<LiveTill />);
    await screen.findByRole("region", { name: "Add a stamp" });
    await findGuest();
    await act(async () => {
      fireEvent.click(button("Add stamp"));
    });
    const line = screen.getByRole("alert");
    expect(line.textContent).toBe("That card is paused.");
    expect(line.className).toContain("is-error");
  });

  it("signs the staff member out and returns to the PIN screen", async () => {
    server.tillSignOutFn.mockResolvedValue({ ok: true });
    render(<LiveTill />);
    await screen.findByRole("region", { name: "Add a stamp" });
    server.getTillStateFn.mockResolvedValue({ ...signedIn, staff: null });
    await act(async () => {
      fireEvent.click(button("Sign out"));
    });
    expect(server.tillSignOutFn).toHaveBeenCalledOnce();
    expect(button("Unlock till")).toBeTruthy();
  });
});
