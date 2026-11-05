import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo } from "@/data/repo";
import { clock } from "@/lib/clock";
import {
  answerRequest,
  applyDraft,
  askRequest,
  draftsFor,
  helpModeNow,
  helpStateFor,
  maskedGuestsFor,
  prepareDraft,
  requestsFor,
  setHelpAccess,
  startHelpMode,
  stopHelpMode,
} from "@/domain/help";
import { revealPhone } from "@/domain/customers";

const RESTAURANT = "rest-daily-grind";
const OTHER = "rest-sunrise-bakes";
const owner = { role: "owner" as const, restaurantId: RESTAURANT };
const otherOwner = { role: "owner" as const, restaurantId: OTHER };
const operator = { role: "operator" as const };
const DAY = 86_400_000;

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

function enableHelp(days = 7) {
  return setHelpAccess({ restaurantId: RESTAURANT, enabled: true, days, session: owner });
}

function openHelp() {
  enableHelp();
  return startHelpMode({ restaurantId: RESTAURANT, operator: "Thandi from Patron", session: operator });
}

function restaurantNow(id = RESTAURANT) {
  return demoRepo.read().restaurants.find((item) => item.id === id)!;
}

describe("help from Patron", () => {
  it("is off by default and cannot be opened until the owner allows it", () => {
    expect(helpStateFor(RESTAURANT).enabled).toBe(false);
    expect(helpStateFor(RESTAURANT).active).toBe(false);
    const blocked = startHelpMode({ restaurantId: RESTAURANT, operator: "Thandi", session: operator });
    expect(blocked.ok).toBe(false);
    expect(helpModeNow().active).toBe(false);
  });

  it("stops at expiry, even if the operator session was left open", () => {
    const enabled = enableHelp(7);
    expect(enabled.ok).toBe(true);
    expect(helpStateFor(RESTAURANT).daysLeft).toBe(7);
    expect(openHelp().ok).toBe(true);
    expect(helpModeNow().active).toBe(true);

    clock.advance(8 * DAY);

    expect(helpStateFor(RESTAURANT).active).toBe(false);
    expect(helpStateFor(RESTAURANT).daysLeft).toBe(0);
    expect(helpModeNow().active).toBe(false);
    expect(helpModeNow().ended).toBe(true);
    const late = prepareDraft({
      restaurantId: RESTAURANT,
      tagline: "Late words",
      about: "This should not save.",
      summary: "Too late",
      session: operator,
    });
    expect(late.ok).toBe(false);
  });

  it("switching help off ends an open session at once", () => {
    expect(openHelp().ok).toBe(true);
    const off = setHelpAccess({ restaurantId: RESTAURANT, enabled: false, session: owner });
    expect(off.ok).toBe(true);
    expect(helpModeNow().active).toBe(false);
    expect(demoRepo.read().session.helpMode).toBeUndefined();
  });

  it("saves drafts and never touches the live page", () => {
    expect(openHelp().ok).toBe(true);
    const before = restaurantNow();
    const draft = prepareDraft({
      restaurantId: RESTAURANT,
      tagline: "Slow mornings, warm plates",
      about: "Open from seven for coffee and breakfast.",
      summary: "Warmer tagline and a shorter story.",
      session: operator,
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    expect(draft.data.label).toBe("Patron prepared this");
    expect(draft.data.status).toBe("draft");
    const after = restaurantNow();
    expect(after.theme.tagline).toBe(before.theme.tagline);
    expect(after.aboutText).toBe(before.aboutText);

    const operatorApply = applyDraft({ draftId: draft.data.id, session: operator });
    expect(operatorApply.ok).toBe(false);

    const used = applyDraft({ draftId: draft.data.id, session: owner });
    expect(used.ok).toBe(true);
    expect(restaurantNow().theme.tagline).toBe("Slow mornings, warm plates");
    expect(restaurantNow().aboutText).toBe("Open from seven for coffee and breakfast.");
  });

  it("masks guest phones for operators and refuses to reveal them", () => {
    expect(openHelp().ok).toBe(true);
    const guests = maskedGuestsFor({ restaurantId: RESTAURANT, session: operator });
    expect(guests.ok).toBe(true);
    if (!guests.ok) return;
    expect(guests.data.length).toBeGreaterThan(0);
    for (const guest of guests.data) {
      expect(guest.phone).toContain("***");
      expect(guest.phone).not.toMatch(/^\+27\s?\d{2}\s?\d{3}\s?\d{4}$/);
    }

    const customer = demoRepo.read().customers[0]!;
    const reveal = revealPhone({
      customerId: customer.id,
      restaurantId: RESTAURANT,
      actorId: "operator",
      session: operator,
    });
    expect(reveal.ok).toBe(false);
  });

  it("keeps each restaurant's drafts, requests and guests apart", () => {
    expect(openHelp().ok).toBe(true);

    const foreignDrafts = draftsFor({ restaurantId: OTHER, session: operator });
    expect(foreignDrafts.ok).toBe(false);
    const foreignRequests = requestsFor({ restaurantId: OTHER, session: operator });
    expect(foreignRequests.ok).toBe(false);
    const foreignDraft = prepareDraft({
      restaurantId: OTHER,
      tagline: "Not mine",
      about: "",
      summary: "Crossed the fence",
      session: operator,
    });
    expect(foreignDraft.ok).toBe(false);
    const foreignGuests = maskedGuestsFor({ restaurantId: OTHER, session: operator });
    expect(foreignGuests.ok).toBe(false);

    const ownDraft = prepareDraft({
      restaurantId: RESTAURANT,
      tagline: "Our own words",
      about: "",
      summary: "Prepared for this restaurant",
      session: operator,
    });
    expect(ownDraft.ok).toBe(true);
    if (!ownDraft.ok) return;
    const otherOwnerRead = draftsFor({ restaurantId: RESTAURANT, session: otherOwner });
    expect(otherOwnerRead.ok).toBe(false);
    const otherOwnerUse = applyDraft({ draftId: ownDraft.data.id, session: otherOwner });
    expect(otherOwnerUse.ok).toBe(false);
  });

  it("answers a request with a draft and leaves the page alone", () => {
    const asked = askRequest({
      restaurantId: RESTAURANT,
      ask: "Please rewrite our winter story for the new menu.",
      photos: [],
      session: owner,
    });
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;

    expect(openHelp().ok).toBe(true);
    const before = restaurantNow();
    const answer = answerRequest({
      requestId: asked.data.id,
      reply: "A shorter story that leads with the winter menu.",
      tagline: "Winter plates are here",
      about: "The winter menu starts this week.",
      session: operator,
    });
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.data.request.status).toBe("answered");
    expect(answer.data.draft.requestId).toBe(asked.data.id);
    expect(restaurantNow().theme.tagline).toBe(before.theme.tagline);

    const requests = requestsFor({ restaurantId: RESTAURANT, session: operator });
    expect(requests.ok).toBe(true);
    if (requests.ok) {
      expect(requests.data.find((item) => item.id === asked.data.id)?.status).toBe("answered");
    }
  });

  it("lets only the owner change the help window", () => {
    const denied = setHelpAccess({ restaurantId: RESTAURANT, enabled: true, session: operator });
    expect(denied.ok).toBe(false);
    expect(helpStateFor(RESTAURANT).enabled).toBe(false);
    expect(stopHelpMode({ session: operator }).ok).toBe(true);
  });
});
