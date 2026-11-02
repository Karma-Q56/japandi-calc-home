import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo } from "@/data/repo";
import { clock } from "@/lib/clock";
import type { FeedbackSource } from "@/data/types";
import {
  FEEDBACK_SHOT_MAX_BYTES,
  feedbackForOwner,
  listFeedback,
  submitFeedback,
  updateFeedback,
} from "@/domain/feedback";

const DAILY = "rest-daily-grind";
const SUNRISE = "rest-sunrise-bakes";
const OPERATOR = { role: "operator" };

function note(restaurantId: string, source: FeedbackSource = "owner") {
  return {
    source,
    category: "broken" as const,
    message: `Something went wrong on this screen ${Math.random()}`,
    restaurantId,
  };
}

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

describe("submitFeedback", () => {
  it("accepts each source and keeps it apart", () => {
    const owner = submitFeedback(note(DAILY));
    const guest = submitFeedback(note(DAILY, "guest"));
    const publicNote = submitFeedback({
      source: "public",
      category: "feature",
      message: "Please show which places are open right now.",
    });
    expect(owner.ok && owner.data.stored).toBe(true);
    expect(guest.ok && guest.data.stored).toBe(true);
    expect(publicNote.ok && publicNote.data.stored).toBe(true);
    const inbox = listFeedback({ session: OPERATOR, filters: {} });
    expect(inbox.ok).toBe(true);
    if (inbox.ok) {
      expect(inbox.data.items.some((item) => item.source === "public")).toBe(true);
      expect(inbox.data.items.some((item) => item.source === "guest")).toBe(true);
    }
  });

  it("treats a filled honeypot as success and stores nothing", () => {
    const before = demoRepo.read().feedback.length;
    const result = submitFeedback({ ...note(DAILY), website: "https://spam.example" });
    expect(result.ok && result.data.stored).toBe(false);
    expect(demoRepo.read().feedback).toHaveLength(before);
  });

  it("rate limits one sender after five notes in an hour", () => {
    for (let index = 0; index < 5; index++) {
      const result = submitFeedback(note("rest-oak-table"));
      expect(result.ok).toBe(true);
      clock.advance(1000);
    }
    const blocked = submitFeedback(note("rest-oak-table"));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("RATE_LIMITED");
  });

  it("refuses a file that is not a picture and a picture over the limit", () => {
    const text = submitFeedback({
      ...note(DAILY),
      screenshot: { name: "notes.txt", type: "text/plain", dataUrl: "data:text/plain;base64,aGk=" },
    });
    expect(text.ok).toBe(false);
    const tooBig = submitFeedback({
      ...note(DAILY),
      screenshot: {
        name: "huge.png",
        type: "image/png",
        dataUrl: `data:image/png;base64,${"A".repeat(Math.ceil((FEEDBACK_SHOT_MAX_BYTES * 4) / 3) + 100)}`,
      },
    });
    expect(tooBig.ok).toBe(false);
    const good = submitFeedback({
      ...note(DAILY),
      screenshot: { name: "screen.png", type: "image/png", dataUrl: "data:image/png;base64,aGk=" },
    });
    expect(good.ok).toBe(true);
  });

  it("keeps a short or empty note out", () => {
    const short = submitFeedback({ ...note(DAILY), message: "Help" });
    expect(short.ok).toBe(false);
  });
});

describe("feedback privacy and status", () => {
  it("shows an owner only their own restaurant's notes", () => {
    submitFeedback(note(SUNRISE));
    submitFeedback(note(DAILY));
    const mine = feedbackForOwner(DAILY);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((item) => item.restaurantId === DAILY)).toBe(true);
    expect(feedbackForOwner(SUNRISE).some((item) => item.restaurantId === DAILY)).toBe(false);
  });

  it("shows a status change back to the sender", () => {
    const unique = `The printer button failed ${Date.now()}`;
    const sent = submitFeedback({ ...note(DAILY), message: unique });
    if (!sent.ok) throw new Error("Submit failed.");
    const before = feedbackForOwner(DAILY).find((item) => item.id === sent.data.id)!;
    expect(before.status).toBe("new");
    const updated = updateFeedback({
      id: sent.data.id,
      status: "planned",
      session: OPERATOR,
    });
    expect(updated.ok).toBe(true);
    const after = feedbackForOwner(DAILY).find((item) => item.id === sent.data.id)!;
    expect(after.status).toBe("planned");
  });

  it("keeps status changes and private notes operator only", () => {
    const sent = submitFeedback(note(DAILY));
    if (!sent.ok) throw new Error("Submit failed.");
    const refused = updateFeedback({
      id: sent.data.id,
      status: "done",
      session: { role: "owner" },
    });
    expect(refused.ok).toBe(false);
    const listed = listFeedback({ session: { role: "owner" }, filters: {} });
    expect(listed.ok).toBe(false);
  });

  it("filters the operator inbox by status and source", () => {
    submitFeedback(note(SUNRISE, "guest"));
    const inbox = listFeedback({
      session: OPERATOR,
      filters: { status: "new", source: "guest" },
    });
    expect(inbox.ok).toBe(true);
    if (inbox.ok) {
      expect(inbox.data.items.every((item) => item.status === "new")).toBe(true);
      expect(inbox.data.items.every((item) => item.source === "guest")).toBe(true);
    }
  });
});
