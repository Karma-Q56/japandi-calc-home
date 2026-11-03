// An owner may only take consent away. Turning SMS back on is a guest action,
// so there is deliberately no helper that produces a grant.
export function consentWithdrawal() {
  return {
    action: "withdrawn" as const,
    marketingSms: "opted_out" as const,
  };
}

export function canApproveLiveCampaign(input: {
  status: string;
  requiresApproval: boolean;
  approved: boolean;
}) {
  return (
    input.requiresApproval &&
    !input.approved &&
    (input.status === "draft" || input.status === "pending_approval")
  );
}

export function canCancelLiveCampaign(status: string) {
  return status === "scheduled";
}
