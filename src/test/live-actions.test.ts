import { describe, expect, it } from "vitest";
import {
  canApproveLiveCampaign,
  canCancelLiveCampaign,
  consentWithdrawal,
} from "@/lib/live-actions";

describe("live consent and campaign rules", () => {
  it("only produces a withdrawal, never a grant", () => {
    expect(consentWithdrawal()).toEqual({
      action: "withdrawn",
      marketingSms: "opted_out",
    });
  });

  it("only offers approval on an unapproved pending campaign", () => {
    expect(
      canApproveLiveCampaign({ status: "pending_approval", requiresApproval: true, approved: false }),
    ).toBe(true);
    expect(
      canApproveLiveCampaign({ status: "pending_approval", requiresApproval: true, approved: true }),
    ).toBe(false);
    expect(
      canApproveLiveCampaign({ status: "sent", requiresApproval: true, approved: false }),
    ).toBe(false);
  });

  it("only cancels a scheduled campaign", () => {
    expect(canCancelLiveCampaign("scheduled")).toBe(true);
    expect(canCancelLiveCampaign("sending")).toBe(false);
    expect(canCancelLiveCampaign("sent")).toBe(false);
  });
});
