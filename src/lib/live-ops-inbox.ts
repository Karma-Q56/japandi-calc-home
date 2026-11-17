// Pure helpers for the live operator inbox screens (D24). Browser-safe: no database or server imports.

/** Plain words for a lead (enquiry) status. */
export function leadStatusLabel(status: string): string {
  switch (status) {
    case "new":
      return "New";
    case "replied":
      return "Replied";
    case "closed":
      return "Closed";
    case "contacted":
      return "Contacted";
    case "demo_booked":
      return "Demo booked";
    case "won":
      return "Won";
    case "lost":
      return "Lost";
    default:
      return status;
  }
}

/** Plain words for a feedback status. */
export function feedbackStatusLabel(status: string): string {
  switch (status) {
    case "new":
      return "New";
    case "seen":
      return "Seen";
    case "planned":
      return "Planned";
    case "done":
      return "Done";
    case "not_now":
      return "Not now";
    default:
      return status;
  }
}

/** Plain words for an idea status. */
export function ideaStatusLabel(status: string): string {
  switch (status) {
    case "new":
      return "New";
    case "exploring":
      return "Exploring";
    case "added":
      return "Added";
    default:
      return status;
  }
}

/** Plain words for an outbox message status. */
export function outboxStatusLabel(status: string): string {
  switch (status) {
    case "queued":
      return "Waiting to send";
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
    default:
      return status;
  }
}

/** Show a contact only when the sender allowed it. Anything else reads as not shared. */
export function feedbackContactLabel(contact: string | null, contactOk: boolean): string {
  return contactOk && contact ? contact : "Not shared";
}

/** Mask a phone for display: country code and last three digits only, for example +27***123. */
export function maskPhone(phoneE164: string): string {
  if (phoneE164.length <= 7) return "***";
  return `${phoneE164.slice(0, 3)}***${phoneE164.slice(-3)}`;
}

// Reads the plain-words message from a failed read. Returns null for a good read.
export function failureMessage(result: unknown): string | null {
  if (result && typeof result === "object" && "ok" in result && result.ok === false && "message" in result) {
    const message = (result as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  return null;
}
