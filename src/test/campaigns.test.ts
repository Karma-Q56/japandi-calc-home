import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { clock } from "@/lib/clock";
import {
  approveCampaign,
  campaignResults,
  checkCopy,
  confirmCampaign,
  costPreview,
  dispatchBatch,
  eligibleMemberships,
  fixCopy,
  fullBody,
  inQuietHours,
  messageSegments,
  nextEightAm,
  refundMessage,
  runDispatcher,
  saveDraft,
  settleCampaign,
} from "@/domain/campaigns";
import { balanceFor, confirmTopup, requestTopup } from "@/domain/credit";
import { createRestaurant } from "@/domain/restaurants";
import { redeemCampaignCode } from "@/domain/stamps";
import { withdrawMarketingConsent } from "@/domain/members";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

const RESTAURANT = "rest-daily-grind";
const OWNER = { role: "owner", restaurantId: RESTAURANT };

function addMembers(count: number, startIndex = 1000, restaurantId = RESTAURANT) {
  const state = demoRepo.read();
  const now = new Date(state.now).toISOString();
  const customers = Array.from({ length: count }, (_, i) => ({
    id: `bulk-customer-${startIndex + i}`,
    name: `Bulk Guest ${startIndex + i}`,
    phoneE164: `+2782999${String(startIndex + i).padStart(4, "0")}`,
    memberCode: `PTBULK${startIndex + i}`,
    qrToken: `bulk-token-${startIndex + i}`,
  }));
  const memberships = customers.map((customer) => ({
    id: `bulk-membership-${customer.id}`,
    restaurantId,
    customerId: customer.id,
    joinedAt: now,
    source: "qr",
    stampsCurrent: 0,
    stampsTotal: 0,
    lastVisitAt: now,
    welcomeStamp: false,
    marketingSms: true,
    marketingPush: false,
    lastSeenStamps: 0,
  }));
  updateDemo((current) => ({
    ...current,
    customers: [...current.customers, ...customers],
    memberships: [...current.memberships, ...memberships],
  }));
  return memberships;
}

function topUp(cents: number) {
  const requested = requestTopup({ restaurantId: RESTAURANT, amountCents: cents, requestedBy: "owner-1" });
  expect(requested.ok).toBe(true);
  if (!requested.ok) throw new Error("top-up failed");
  const confirmed = confirmTopup({ paymentId: requested.data.id, confirmedBy: "operator-1" });
  expect(confirmed.ok).toBe(true);
}

function makeDraft(body = "Hello {first_name}, a treat awaits.") {
  const draft = saveDraft({
    restaurantId: RESTAURANT,
    actor: "owner-1",
    actorRole: "owner",
    fields: { name: "Test blast", body, audience: { type: "all_opted_in" } },
  });
  expect(draft.ok).toBe(true);
  if (!draft.ok) throw new Error("draft failed");
  return draft.data;
}

describe("message copy", () => {
  it("counts the Stop footer in segments and warns on smart quotes with a fix", () => {
    const segments = messageSegments("Hi {first_name}, pop by!", "Thandi");
    expect(segments).toBeGreaterThanOrEqual(1);
    expect(fullBody("Hi", "Thandi")).toContain("Reply STOP to opt out.");
    const warnings = checkCopy("“Special” offer just for you!");
    expect(warnings.some((w) => w.kind === "smart-quotes" && w.fixable)).toBe(true);
    expect(checkCopy(fixCopy("“Special” offer just for you!")).some((w) => w.kind === "smart-quotes")).toBe(false);
    expect(checkCopy("Free coffee 🎉").some((w) => w.kind === "unicode")).toBe(true);
  });

  it("renders the cost preview in plain language", () => {
    expect(costPreview({ recipients: 84, segments: 1, creditCents: 12000 })).toBe(
      "84 guests x 1 segment x R0.35 = R29.40, your credit R120.00",
    );
  });
});

describe("84-guest reserve, send and settle", () => {
  it("holds the ledger invariant end to end", () => {
    addMembers(84);
    topUp(50000);
    const startBalance = balanceFor(demoRepo.read(), RESTAURANT);
    const draft = makeDraft();
    const eligible = eligibleMemberships(demoRepo.read(), RESTAURANT, { type: "all_opted_in" });
    expect(eligible.length).toBeGreaterThanOrEqual(84);
    const confirmed = confirmCampaign({ campaignId: draft.id, actor: "owner-1", sendNow: true });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.data.recipients).toBe(eligible.length);
    const afterReserve = balanceFor(demoRepo.read(), RESTAURANT);
    expect(afterReserve).toBe(startBalance - confirmed.data.estCostCents);
    expect(afterReserve).toBeGreaterThanOrEqual(0);

    let sent = 0;
    for (let guard = 0; guard < 10; guard++) {
      const report = runDispatcher();
      sent += report.sent;
      if (report.sent === 0) break;
    }
    expect(sent).toBe(eligible.length);

    const settled = settleCampaign({ campaignId: draft.id, actor: "owner-1" });
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    const endBalance = balanceFor(demoRepo.read(), RESTAURANT);
    expect(endBalance).toBe(startBalance - settled.data.actualCostCents);
    expect(endBalance).toBeGreaterThanOrEqual(0);
    const results = campaignResults(demoRepo.read(), draft.id);
    expect(results!.sent).toBe(eligible.length);
    expect(results!.visitsLabel).toContain("not proof the message caused them");
  });
});

describe("send-time re-checks", () => {
  it("a guest who withdrew consent after confirm is skipped and not charged", () => {
    addMembers(3, 2000);
    topUp(20000);
    const draft = makeDraft();
    const before = eligibleMemberships(demoRepo.read(), RESTAURANT, { type: "all_opted_in" });
    const confirmed = confirmCampaign({ campaignId: draft.id, actor: "owner-1", sendNow: true });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const victim = before[0]!;
    withdrawMarketingConsent(victim.id, "card_settings");
    runDispatcher();
    const state = demoRepo.read();
    const skipped = state.messages.find(
      (m) => m.campaignId === draft.id && m.membershipId === victim.id,
    )!;
    expect(skipped.status).toBe("skipped");
    const settled = settleCampaign({ campaignId: draft.id, actor: "owner-1" });
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.data.actualCostCents).toBe((before.length - 1) * 35);
  });

  it("insufficient credit blocks confirm with a clear message", () => {
    const created = createRestaurant({ name: "Broke Cafe", slug: "broke-cafe", suburb: "Nowhere" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    addMembers(2, 3000, created.data.id);
    const draft = saveDraft({
      restaurantId: created.data.id,
      actor: "owner-1",
      actorRole: "owner",
      fields: { name: "Broke blast", body: "Hello {first_name}!", audience: { type: "all_opted_in" } },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const confirmed = confirmCampaign({ campaignId: draft.data.id, actor: "owner-1", sendNow: true });
    expect(confirmed.ok).toBe(false);
    if (confirmed.ok) return;
    expect(confirmed.error.message).toMatch(/Insufficient credit/);
  });

  it("weekly caps exclude capped members at send time", () => {
    addMembers(1, 4000);
    topUp(20000);
    const draft = makeDraft();
    const confirmed = confirmCampaign({ campaignId: draft.id, actor: "owner-1", sendNow: true });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    // Push every eligible member over the 2-per-week cap with backdated sends.
    const state = demoRepo.read();
    const now = new Date(state.now).toISOString();
    updateDemo((current) => ({
      ...current,
      messages: [
        ...current.messages,
        ...eligibleMemberships(current, RESTAURANT, { type: "all_opted_in" }).flatMap((m, i) => [
          {
            id: `cap-a-${i}`,
            restaurantId: RESTAURANT,
            customerId: m.customerId,
            membershipId: m.id,
            channel: "sms" as const,
            body: "x",
            segments: 1,
            costCents: 35,
            status: "sent" as const,
            attempts: 1,
            createdAt: now,
            sentAt: now,
          },
          {
            id: `cap-b-${i}`,
            restaurantId: RESTAURANT,
            customerId: m.customerId,
            membershipId: m.id,
            channel: "sms" as const,
            body: "x",
            segments: 1,
            costCents: 35,
            status: "delivered" as const,
            attempts: 1,
            createdAt: now,
            sentAt: now,
          },
        ]),
      ],
    }));
    const report = runDispatcher();
    expect(report.sent).toBe(0);
    expect(report.skipped).toBeGreaterThan(0);
  });
});

describe("quiet hours", () => {
  it("pushes quiet-hour sends to 08:00 SAST", () => {
    // 2026-10-01T20:00:00Z is 22:00 in Johannesburg (UTC+2, no DST).
    const quietNow = Date.parse("2026-10-01T20:00:00.000Z");
    expect(inQuietHours(quietNow)).toBe(true);
    addMembers(1, 5000);
    topUp(20000);
    const draft = makeDraft();
    const confirmed = confirmCampaign({ campaignId: draft.id, actor: "owner-1", sendNow: true });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const { state: held, report } = dispatchBatch(demoRepo.read(), quietNow);
    expect(report.held).toBeGreaterThan(0);
    expect(report.sent).toBe(0);
    const eightAm = nextEightAm(quietNow);
    expect(new Date(eightAm).toISOString()).toBe("2026-10-02T06:00:00.000Z");
    const queued = held.messages.find((m) => m.campaignId === draft.id)!;
    expect(queued.notBefore).toBe(new Date(eightAm).toISOString());
    const { report: morning } = dispatchBatch(held, eightAm);
    expect(morning.sent).toBeGreaterThan(0);
  });
});

describe("operator approval", () => {
  it("an operator draft cannot send before an owner approves", () => {
    addMembers(1, 6000);
    topUp(20000);
    const draft = saveDraft({
      restaurantId: RESTAURANT,
      actor: "operator-1",
      actorRole: "operator",
      fields: { name: "Ops blast", body: "Hello {first_name}!", audience: { type: "all_opted_in" } },
    });
    expect(draft.ok && draft.data.requiresApproval).toBe(true);
    if (!draft.ok) return;
    const blocked = confirmCampaign({ campaignId: draft.data.id, actor: "operator-1", sendNow: true });
    expect(blocked.ok).toBe(false);
    const approved = approveCampaign({ campaignId: draft.data.id, actor: "owner-1", role: "owner" });
    expect(approved.ok).toBe(true);
    const confirmed = confirmCampaign({ campaignId: draft.data.id, actor: "owner-1", sendNow: true });
    expect(confirmed.ok).toBe(true);
  });
});

describe("dispatcher restarts", () => {
  it("killing the run mid-batch and restarting sends nothing twice", () => {
    addMembers(10, 7000);
    topUp(30000);
    const draft = makeDraft();
    const confirmed = confirmCampaign({ campaignId: draft.id, actor: "owner-1", sendNow: true });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const total = confirmed.data.recipients;
    expect(total).toBeGreaterThan(3);
    const first = dispatchBatch(demoRepo.read(), demoRepo.read().now, { limit: 3 });
    expect(first.report.sent).toBe(3);
    const second = dispatchBatch(first.state, demoRepo.read().now);
    expect(second.report.sent).toBe(total - 3);
    const sent = second.state.messages.filter(
      (m) => m.campaignId === draft.id && (m.status === "sent" || m.status === "delivered"),
    );
    const pairs = sent.map((m) => `${m.membershipId}:sms`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(sent.length).toBe(total);
  });
});

describe("offer redemption", () => {
  it("the same code twice for one guest fails", () => {
    const state = demoRepo.read();
    const membership = state.memberships.find((m) => m.restaurantId === RESTAURANT)!;
    const first = redeemCampaignCode({
      code: "tuesday",
      membershipId: membership.id,
      actorId: "staff-1",
      session: OWNER,
    });
    expect(first.ok).toBe(true);
    const repeat = redeemCampaignCode({
      code: "TUESDAY",
      membershipId: membership.id,
      actorId: "staff-1",
      session: OWNER,
    });
    expect(repeat.ok).toBe(false);
  });
});

describe("refunds", () => {
  it("a failed message after settlement produces exactly one refund entry", () => {
    addMembers(2, 8000);
    topUp(20000);
    const draft = makeDraft();
    const confirmed = confirmCampaign({ campaignId: draft.id, actor: "owner-1", sendNow: true });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    // One message fails in the network; the rest go out.
    const state = demoRepo.read();
    const target = state.messages.find((m) => m.campaignId === draft.id)!;
    updateDemo((current) => ({
      ...current,
      messages: current.messages.map((m) =>
        m.id === target.id ? { ...m, status: "failed" as const, errorCode: "send_failed" } : m,
      ),
    }));
    runDispatcher();
    const settled = settleCampaign({ campaignId: draft.id, actor: "owner-1" });
    expect(settled.ok).toBe(true);
    const refunded = refundMessage({ messageId: target.id, actor: "operator-1" });
    expect(refunded.ok).toBe(true);
    const again = refundMessage({ messageId: target.id, actor: "operator-1" });
    expect(again.ok).toBe(false);
    const refunds = demoRepo
      .read()
      .ledger.filter((entry) => entry.reference === `refund:${target.id}`);
    expect(refunds).toHaveLength(1);
  });
});
