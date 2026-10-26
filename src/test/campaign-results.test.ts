import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { clock } from "@/lib/clock";
import {
  campaignRecipients,
  campaignResults,
  confirmCampaign,
  runDispatcher,
  messageStatusLabel,
  saveDraft,
  settleCampaign,
} from "@/domain/campaigns";
import { confirmTopup, requestTopup } from "@/domain/credit";
import type { MessageStatus } from "@/data/types";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

const RESTAURANT = "rest-daily-grind";

function addMembers(count: number) {
  const state = demoRepo.read();
  const now = new Date(state.now).toISOString();
  const customers = Array.from({ length: count }, (_, i) => ({
    id: `results-customer-${i}`,
    name: `Results Guest ${i}`,
    phoneE164: `+27829990${String(i).padStart(3, "0")}`,
    memberCode: `PTRES${i}`,
    qrToken: `results-token-${i}`,
  }));
  const memberships = customers.map((customer) => ({
    id: `results-membership-${customer.id}`,
    restaurantId: RESTAURANT,
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
  if (!requested.ok) throw new Error("top-up failed");
  const confirmed = confirmTopup({ paymentId: requested.data.id, confirmedBy: "operator-1" });
  if (!confirmed.ok) throw new Error("top-up confirm failed");
}

function sendSmallCampaign() {
  const memberships = addMembers(3);
  topUp(100000);
  const draft = saveDraft({
    restaurantId: RESTAURANT,
    actor: "owner-1",
    actorRole: "owner",
    fields: { name: "Results test", body: "Hi {first_name}, see you soon.", audience: { type: "all_opted_in" } },
  });
  if (!draft.ok) throw new Error("draft failed");
  const confirmed = confirmCampaign({ campaignId: draft.data.id, actor: "owner-1", sendNow: true });
  if (!confirmed.ok) throw new Error("confirm failed");
  runDispatcher();
  const settled = settleCampaign({ campaignId: draft.data.id, actor: "owner-1" });
  if (!settled.ok) throw new Error("settle failed");
  return { campaignId: draft.data.id, atLeast: memberships.length, sent: confirmed.data.recipients };
}

describe("campaign results page data", () => {
  it("lists one row per message with plain delivery labels", () => {
    const { campaignId, atLeast, sent } = sendSmallCampaign();
    const rows = campaignRecipients(demoRepo.read(), campaignId);
    expect(rows).toHaveLength(sent);
    expect(rows.length).toBeGreaterThanOrEqual(atLeast);
    expect(rows.some((row) => row.name.startsWith("Results Guest"))).toBe(true);
    expect(rows.every((row) => row.channel === "sms")).toBe(true);
    expect(rows.every((row) => row.segments >= 1)).toBe(true);
    expect(new Set(rows.map((row) => row.messageId)).size).toBe(3);
  });

  it("adds row costs up to the settled campaign cost", () => {
    const { campaignId, sent } = sendSmallCampaign();
    const state = demoRepo.read();
    const rows = campaignRecipients(state, campaignId);
    const results = campaignResults(state, campaignId);
    expect(results).not.toBeNull();
    expect(sent).toBe(rows.length);
    const rowTotal = rows.reduce((sum, row) => sum + row.costCents, 0);
    expect(rowTotal).toBe(results!.costCents);
    expect(results!.costCents).toBeGreaterThan(0);
  });

  it("counts delivery states that add up to the recipients", () => {
    const { campaignId, sent } = sendSmallCampaign();
    const state = demoRepo.read();
    const results = campaignResults(state, campaignId)!;
    expect(results.sent).toBe(sent);
    expect(results.queued + results.sent + results.failed + results.skipped).toBe(sent);
    const rows = campaignRecipients(state, campaignId);
    expect(rows.every((row) => row.status === "sent" || row.status === "delivered")).toBe(true);
  });

  it("returns no rows for an unknown campaign", () => {
    expect(campaignRecipients(demoRepo.read(), "nope")).toEqual([]);
    expect(campaignResults(demoRepo.read(), "nope")).toBeNull();
  });

  it("labels every delivery state in plain words", () => {
    const labels: Array<MessageStatus> = ["queued", "sending", "sent", "delivered", "failed", "skipped"];
    expect(labels.map(messageStatusLabel)).toEqual([
      "Waiting",
      "Sending",
      "Sent",
      "Delivered",
      "Did not send",
      "Not sent",
    ]);
  });
});
