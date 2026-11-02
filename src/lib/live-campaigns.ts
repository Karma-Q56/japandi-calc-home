export type CampaignMessageStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "skipped";

export type CampaignTotals = {
  delivered: number;
  sent: number;
  failed: number;
  queued: number;
  skipped: number;
};

/** Count message statuses once, so the live results page and tests agree. */
export function campaignTotals(statuses: CampaignMessageStatus[]): CampaignTotals {
  const totals: CampaignTotals = { delivered: 0, sent: 0, failed: 0, queued: 0, skipped: 0 };
  for (const status of statuses) {
    if (status === "sending" || status === "queued") totals.queued += 1;
    else totals[status] += 1;
  }
  return totals;
}

export function messageStatusText(status: CampaignMessageStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
  }
}
