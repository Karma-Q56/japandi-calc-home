/** Campaign status mapped to a plain label and a badge colour. */
export function campaignBadge(status: string): { label: string; tone?: "sent" | "active" } {
  switch (status) {
    case "sent":
      return { label: "Sent", tone: "sent" };
    case "scheduled":
    case "sending":
      return { label: status === "sending" ? "Sending" : "Scheduled", tone: "active" };
    case "pending_approval":
      return { label: "Needs approval" };
    case "cancelled":
      return { label: "Cancelled" };
    case "failed":
      return { label: "Failed" };
    default:
      return { label: "Draft" };
  }
}
