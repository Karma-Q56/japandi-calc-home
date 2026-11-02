import { describe, expect, it } from "vitest";
import { campaignTotals, messageStatusText } from "@/lib/live-campaigns";

describe("live campaign totals", () => {
  it("counts delivered, sent and failed separately", () => {
    expect(campaignTotals(["delivered", "delivered", "sent", "failed"])).toEqual({
      delivered: 2,
      sent: 1,
      failed: 1,
      queued: 0,
      skipped: 0,
    });
  });

  it("groups queued and sending together", () => {
    expect(campaignTotals(["queued", "sending", "skipped"]).queued).toBe(2);
    expect(campaignTotals(["queued", "sending", "skipped"]).skipped).toBe(1);
  });

  it("returns zeroes for an empty campaign", () => {
    expect(campaignTotals([])).toEqual({
      delivered: 0,
      sent: 0,
      failed: 0,
      queued: 0,
      skipped: 0,
    });
  });

  it("uses plain words for each message status", () => {
    expect(messageStatusText("delivered")).toBe("Delivered");
    expect(messageStatusText("skipped")).toBe("Skipped");
  });
});
