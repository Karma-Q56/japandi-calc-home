export function consentChange(enabled: boolean) {
  return {
    action: enabled ? ("granted" as const) : ("withdrawn" as const),
    marketingSms: enabled ? ("opted_in" as const) : ("opted_out" as const),
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
