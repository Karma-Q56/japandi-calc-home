import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The live operator screens that review rewrote: enquiries, credit (confirm or reject a top up) and
// the money actions on a restaurant (refunds). The server calls are replaced, so these tests check
// what the owner of Patron sees and what each button sends.

const calls = vi.hoisted(() => ({
  listLeadsFn: vi.fn(),
  updateLeadFn: vi.fn(),
  confirmTopupFn: vi.fn(),
  rejectTopupFn: vi.fn(),
  recordRefundFn: vi.fn(),
  addCreditFn: vi.fn(),
}));

vi.mock("@/server/live-ops-inbox-fns", () => ({
  listLeadsFn: calls.listLeadsFn,
  updateLeadFn: calls.updateLeadFn,
}));
vi.mock("@/server/live-ops-restaurants-fns", () => ({
  confirmTopupFn: calls.confirmTopupFn,
  rejectTopupFn: calls.rejectTopupFn,
  recordRefundFn: calls.recordRefundFn,
  createInvoiceFn: vi.fn(),
  markInvoicePaidFn: vi.fn(),
  voidInvoiceFn: vi.fn(),
}));
vi.mock("@/server/live-ops-fns", () => ({ addCreditFn: calls.addCreditFn }));

import { LiveOpsLeads } from "@/components/patron/live/ops/LiveOpsLeads";
import { LiveOpsCredit } from "@/components/patron/live/ops/LiveOpsCredit";
import { LiveOpsMoneyActions } from "@/components/patron/live/ops/LiveOpsMoneyActions";
import type { LeadRow } from "@/server/live-ops-inbox";

const lead = (over: Partial<LeadRow> = {}): LeadRow =>
  ({
    id: "lead-1",
    reference: "ENQ-2026-001",
    kind: "waitlist",
    restaurant_name: "Mama Zee Kitchen",
    contact_name: "Zanele Dube",
    phone: "+27825550101",
    email: "zanele@example.test",
    role: "Owner",
    venue_type: "Cafe",
    suburb: "Melville",
    quiet_time: "Tuesday afternoons",
    weekly_guests: "200",
    plan_interest: "Growth",
    visit_wanted: true,
    preferred_day: "Thursday",
    consent_at: "2026-11-01T08:00:00.000Z",
    calculator: { guests: 200, wants_sms: true },
    status: "new",
    admin_notes: null,
    created_at: "2026-11-01T08:00:00.000Z",
    replied_at: null,
    closed_at: null,
    ...over,
  }) as LeadRow;

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockReset();
});
afterEach(() => cleanup());

describe("LiveOpsLeads", () => {
  it("opens an enquiry to show the contact details and every answer the visitor gave", () => {
    render(<LiveOpsLeads initial={[lead()]} />);
    expect(screen.getByText(/ENQ-2026-001/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const panel = screen.getByRole("region", { name: /Enquiry ENQ-2026-001/ });
    expect(within(panel).getByRole("link", { name: "+27825550101" })).toHaveAttribute("href", "tel:+27825550101");
    expect(within(panel).getByRole("link", { name: "zanele@example.test" })).toHaveAttribute("href", "mailto:zanele@example.test");
    expect(within(panel).getByText(/Tuesday afternoons/)).toBeInTheDocument();
    expect(within(panel).getByText(/Yes, Thursday/)).toBeInTheDocument();
    expect(within(panel).getByText(/guests: 200/)).toBeInTheDocument();
  });

  it("saves the status and the private note, reloads the list and says Saved", async () => {
    calls.updateLeadFn.mockResolvedValue({ ok: true, message: "Saved." });
    calls.listLeadsFn.mockResolvedValue({ ok: true, rows: [lead({ status: "won", admin_notes: "Signed up" })] });
    render(<LiveOpsLeads initial={[lead()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const panel = screen.getByRole("region", { name: /Enquiry/ });
    fireEvent.change(within(panel).getByLabelText("Status"), { target: { value: "won" } });
    fireEvent.change(within(panel).getByLabelText(/Private note/), { target: { value: "Signed up" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));
    expect(calls.updateLeadFn).toHaveBeenCalledWith({ data: { leadId: "lead-1", status: "won", notes: "Signed up" } });
    expect(calls.listLeadsFn).toHaveBeenCalled();
    // The button keeps its name; it never turns into "Saving".
    expect(within(panel).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows the reason when a save is refused and keeps what was typed", async () => {
    calls.updateLeadFn.mockResolvedValue({ ok: false, message: "That enquiry was not found." });
    render(<LiveOpsLeads initial={[lead()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.change(screen.getByLabelText(/Private note/), { target: { value: "Call back Friday" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("That enquiry was not found."));
    expect(screen.getByLabelText(/Private note/)).toHaveValue("Call back Friday");
  });

  it("filters by status and searches through the server, and says so when nothing matches", async () => {
    calls.listLeadsFn.mockResolvedValue({ ok: true, rows: [] });
    render(<LiveOpsLeads initial={[lead()]} />);
    fireEvent.change(screen.getAllByLabelText("Status")[0]!, { target: { value: "lost" } });
    await waitFor(() => expect(calls.listLeadsFn).toHaveBeenCalledWith({ data: { status: "lost", search: "", limit: 50, offset: 0 } }));
    fireEvent.change(screen.getByLabelText(/Search by/), { target: { value: "50%" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(calls.listLeadsFn).toHaveBeenLastCalledWith({ data: { status: "lost", search: "50%", limit: 50, offset: 0 } }));
    expect(await screen.findByText("No enquiries match.")).toBeInTheDocument();
  });

  it("shows a message instead of an empty list when the list cannot be loaded", async () => {
    calls.listLeadsFn.mockResolvedValue({ ok: false, message: "Could not load enquiries." });
    render(<LiveOpsLeads initial={[lead()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load enquiries.");
  });
});

describe("LiveOpsCredit", () => {
  const pending = [{ id: "pay-1", restaurant_id: "r-1", restaurant_name: "Mama Zee Kitchen", amount_cents: 50000, reference: "EFT-123", created_at: "2026-11-20T08:00:00.000Z" }];
  const restaurants = [{ id: "r-1", name: "Mama Zee Kitchen", credit_cents: 5000 }];

  it("confirms a waiting top up and shows the server's message", async () => {
    calls.confirmTopupFn.mockResolvedValue({ ok: true, message: "Credit added." });
    render(<LiveOpsCredit pending={pending} restaurants={restaurants} />);
    expect(screen.getByText("R500")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Money received, add credit" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Credit added."));
    expect(calls.confirmTopupFn).toHaveBeenCalledWith({ data: { paymentId: "pay-1" } });
  });

  it("only allows a rejection once a reason is typed, and sends the trimmed reason", async () => {
    calls.rejectTopupFn.mockResolvedValue({ ok: true, message: "Top up rejected." });
    render(<LiveOpsCredit pending={pending} restaurants={restaurants} />);
    const reject = screen.getByRole("button", { name: "Not received, reject" });
    expect(reject).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason if not received/), { target: { value: "  Nothing in the bank  " } });
    expect(reject).toBeEnabled();
    fireEvent.click(reject);
    fireEvent.click(screen.getByRole("button", { name: "Yes, reject it" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Top up rejected."));
    expect(calls.rejectTopupFn).toHaveBeenCalledWith({ data: { paymentId: "pay-1", reason: "Nothing in the bank" } });
  });

  it("shows why a confirm was refused", async () => {
    calls.confirmTopupFn.mockResolvedValue({ ok: false, message: "That top up was already checked." });
    render(<LiveOpsCredit pending={pending} restaurants={restaurants} />);
    fireEvent.click(screen.getByRole("button", { name: "Money received, add credit" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("That top up was already checked."));
  });

  it("says when nothing is waiting, and filters the balances to low credit", () => {
    render(
      <LiveOpsCredit
        pending={[]}
        restaurants={[
          { id: "r-1", name: "Low Cafe", credit_cents: 2000 },
          { id: "r-2", name: "Rich Diner", credit_cents: 500000 },
        ]}
      />,
    );
    expect(screen.getByText("No top ups waiting")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rich Diner" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Only restaurants with low credit/));
    expect(screen.queryByRole("link", { name: "Rich Diner" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Low Cafe" })).toBeInTheDocument();
  });
});

describe("LiveOpsMoneyActions refunds", () => {
  const payment = (over: Record<string, unknown>) => ({
    id: "p-1",
    kind: "topup",
    amount_cents: 50000,
    status: "paid",
    reference: "ref",
    refunded_cents: 0,
    created_at: "2026-11-10T08:00:00.000Z",
    ...over,
  });
  const render_ = (payments: ReturnType<typeof payment>[]) =>
    render(<LiveOpsMoneyActions restaurantId="r-1" pendingTopups={[]} invoices={[]} payments={payments as never} />);

  it("offers a refund for a paid card top up and a confirmed EFT top up, not for money never received", () => {
    render_([
      payment({ id: "card", status: "paid" }),
      payment({ id: "eft", status: "confirmed" }),
      payment({ id: "wait", status: "pending" }),
      payment({ id: "setup", kind: "setup", status: "paid" }),
    ]);
    expect(screen.getAllByLabelText("Refund amount in rand")).toHaveLength(2);
    expect(screen.getAllByText("Not refundable")).toHaveLength(2);
  });

  it("sends the refund in cents with the reason, and refuses more than what is left", async () => {
    calls.recordRefundFn.mockResolvedValue({ ok: true, message: "Refund recorded." });
    render_([payment({ refunded_cents: 20000 })]);
    const button = screen.getByRole("button", { name: "Record refund" });
    expect(button).toBeDisabled(); // a reason is needed first
    fireEvent.change(screen.getByLabelText(/Why are you doing this/), { target: { value: "Charged twice" } });
    fireEvent.change(screen.getByLabelText("Refund amount in rand"), { target: { value: "400" } });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Yes, record it" }));
    expect(calls.recordRefundFn).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/more than the amount left to refund \(R300\)/);

    fireEvent.change(screen.getByLabelText("Refund amount in rand"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));
    expect(calls.recordRefundFn).not.toHaveBeenCalled(); // asks first
    fireEvent.click(screen.getByRole("button", { name: "Yes, record it" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Refund recorded."));
    expect(calls.recordRefundFn).toHaveBeenCalledWith({ data: { paymentId: "p-1", amountCents: 30000, reason: "Charged twice" } });
  });

  it("says Fully refunded once nothing is left", () => {
    render_([payment({ refunded_cents: 50000 })]);
    expect(screen.getByText("Fully refunded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record refund" })).not.toBeInTheDocument();
  });
});
