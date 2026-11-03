import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo } from "@/data/repo";
import { leadDetails, listEnquiries, submitEnquiry, updateEnquiry } from "@/domain/leads";

beforeEach(() => {
  demoRepo.reset();
});

describe("enquiries", () => {
  it("numbers a new enquiry ENQ-YEAR-NUMBER after the seeded ones", () => {
    const result = submitEnquiry({
      kind: "owner",
      restaurantName: "The Corner Pantry",
      contactName: "Naledi M.",
      phone: "+27821234010",
      email: "naledi@example.com",
      role: "Owner",
      suburb: "Greenside",
      planInterest: "Growth",
      visitWanted: true,
      preferredDay: "Wednesday",
      consent: true,
      consentAt: "2026-10-31T09:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reference).toBe("ENQ-2026-006");
    const stored = demoRepo.read().leads.find((lead) => lead.id === result.data.id);
    expect(stored?.visitWanted).toBe(true);
    expect(stored?.consentAt).toBe("2026-10-31T09:00:00.000Z");
    expect(stored?.status).toBe("new");
  });

  it("refuses a missing consent, a diner without a suburb and an empty message", () => {
    const noConsent = submitEnquiry({
      kind: "owner",
      restaurantName: "R",
      contactName: "C",
      phone: "+27821234011",
      consent: false,
    });
    expect(noConsent.ok).toBe(false);

    const diner = submitEnquiry({ kind: "diner", restaurantName: "Baked on 7th", consent: true });
    expect(diner.ok).toBe(false);
    if (!diner.ok) expect(diner.error.message).toMatch(/suburb/i);

    const other = submitEnquiry({
      kind: "other",
      contactName: "Sam",
      phone: "+27821234012",
      consent: true,
    });
    expect(other.ok).toBe(false);

    const honeypot = submitEnquiry({
      kind: "owner",
      restaurantName: "R",
      contactName: "C",
      phone: "+27821234013",
      consent: true,
      website: "spam",
    });
    expect(honeypot.ok).toBe(false);
  });

  it("keeps the inbox operator-only and filters by kind, status and search", () => {
    const staff = listEnquiries({ session: { role: "owner" } });
    expect(staff.ok).toBe(false);

    const operator = listEnquiries({ session: { role: "operator" } });
    expect(operator.ok).toBe(true);
    if (!operator.ok) return;
    expect(operator.data.leads.length).toBe(5);
    expect(operator.data.counts).toEqual({ new: 2, replied: 1, closed: 2 });
    expect(operator.data.placesGuestsAskedFor[0]).toEqual({ name: "Baked on 7th", count: 2 });

    const diners = listEnquiries({
      session: { role: "operator" },
      filters: { kind: "diner" },
    });
    expect(diners.ok).toBe(true);
    if (!diners.ok) return;
    expect(diners.data.leads).toHaveLength(2);

    const search = listEnquiries({
      session: { role: "operator" },
      filters: { search: "greenside" },
    });
    expect(search.ok).toBe(true);
    if (!search.ok) return;
    expect(search.data.leads).toHaveLength(1);
    expect(search.data.leads[0]!.reference).toBe("ENQ-2026-001");
  });

  it("moves a lead through replied and closed and keeps private notes", () => {
    const inbox = listEnquiries({ session: { role: "operator" } });
    expect(inbox.ok).toBe(true);
    if (!inbox.ok) return;
    const first = inbox.data.leads.find((lead) => lead.reference === "ENQ-2026-001")!;

    const replied = updateEnquiry({
      id: first.id,
      status: "replied",
      notes: "Called back, visit on Wednesday.",
      session: { role: "operator" },
    });
    expect(replied.ok).toBe(true);
    if (!replied.ok) return;
    expect(replied.data.status).toBe("replied");
    expect(replied.data.adminNotes).toBe("Called back, visit on Wednesday.");

    const ownerTried = updateEnquiry({ id: first.id, status: "closed", session: { role: "owner" } });
    expect(ownerTried.ok).toBe(false);

    const details = leadDetails(replied.data);
    expect(details).toContain("Reference: ENQ-2026-001");
    expect(details).toContain("Wants a visit: Yes");
    expect(details).toContain("Notes: Called back, visit on Wednesday.");
    expect(details).not.toContain("undefined");
  });
});
