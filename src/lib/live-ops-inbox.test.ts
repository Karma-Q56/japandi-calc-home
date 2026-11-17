import { describe, expect, it } from "vitest";
import {
  feedbackContactLabel,
  feedbackStatusLabel,
  leadStatusLabel,
  maskPhone,
  outboxStatusLabel,
} from "./live-ops-inbox";
import { inboxRefusalCode, inboxMessageForRefusal } from "../server/live-ops-inbox";

describe("live operator inbox helpers", () => {
  it("shows plain words for lead statuses, including the seven values in the database", () => {
    expect(leadStatusLabel("demo_booked")).toBe("Demo booked");
    expect(leadStatusLabel("replied")).toBe("Replied");
    expect(leadStatusLabel("closed")).toBe("Closed");
  });

  it("shows plain words for feedback and outbox statuses", () => {
    expect(feedbackStatusLabel("not_now")).toBe("Not now");
    expect(outboxStatusLabel("queued")).toBe("Waiting to send");
  });

  it("shows the contact only when the sender allowed it", () => {
    expect(feedbackContactLabel("thandi@example.com", true)).toBe("thandi@example.com");
    expect(feedbackContactLabel("thandi@example.com", false)).toBe("Not shared");
    expect(feedbackContactLabel(null, true)).toBe("Not shared");
  });

  it("masks a phone to country code and last three digits", () => {
    expect(maskPhone("+27821234567")).toBe("+27***567");
  });
});

describe("refusal codes", () => {
  it("reads the exact code from the cause chain", () => {
    const inner = new Error("lead_not_found");
    const outer = new Error("query failed", { cause: inner });
    expect(inboxRefusalCode(outer)).toBe("lead_not_found");
  });

  it("ignores messages that are not one of our codes", () => {
    expect(inboxRefusalCode(new Error("some other failure"))).toBeNull();
    expect(inboxRefusalCode(new Error("lead_not_found_extra"))).toBeNull();
  });

  it("maps an unknown code to a safe message", () => {
    expect(inboxMessageForRefusal(null)).toBe("Something went wrong. Nothing changed. Try again.");
    expect(inboxMessageForRefusal("feedback_not_found")).toBe("That feedback was not found.");
  });
});
