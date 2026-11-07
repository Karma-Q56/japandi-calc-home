import { describe, expect, it } from "vitest";
import { demoRepo, mergeOffers } from "@/data/repo";
import { confirmCampaign, saveDraft } from "@/domain/campaigns";
import type { DemoState } from "@/data/types";

function stateWith(parts: Partial<DemoState>): Partial<DemoState> {
  return { version: 2, ...parts } as Partial<DemoState>;
}

describe("offers merge", () => {
  it("turns a legacy special into one offer with a page placement", () => {
    const offers = mergeOffers(
      stateWith({
        specials: [
          {
            id: "s1",
            restaurantId: "r1",
            title: "Happy hour",
            body: "Half price",
            startsAt: "2026-01-01T00:00:00.000Z",
            endsAt: "2026-02-01T00:00:00.000Z",
            active: true,
            kind: "public",
            code: "HAPPY",
          },
        ],
      }),
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      title: "Happy hour",
      code: "HAPPY",
      legacySpecialId: "s1",
      placements: { page: true, till: false, push: false, sms: false },
    });
  });

  it("turns a legacy campaign into an offer with push and SMS placements from its channel", () => {
    const offers = mergeOffers(
      stateWith({
        campaigns: [
          {
            id: "c1",
            restaurantId: "r1",
            name: "Winter push",
            body: "Come back soon",
            channel: "push_then_sms",
            audience: { kind: "lapsed" } as never,
            code: "WINTER",
            status: "sent",
            requiresApproval: false,
            sentAt: null,
            recipients: 0,
            delivered: 0,
            failed: 0,
            createdBy: "owner",
            createdAt: "2026-01-01T00:00:00.000Z",
            actualCostCents: 0,
          },
        ],
      }),
    );
    expect(offers[0]).toMatchObject({
      legacyCampaignId: "c1",
      status: "sent",
      placements: { page: false, till: false, push: true, sms: true },
    });
  });

  it("does not duplicate offers when the same legacy rows are merged again", () => {
    const special = {
      id: "s1",
      restaurantId: "r1",
      title: "Lunch",
      body: "",
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-02-01T00:00:00.000Z",
      active: true,
      kind: "members" as const,
    };
    const once = mergeOffers(stateWith({ specials: [special] }));
    const twice = mergeOffers(stateWith({ specials: [special], offers: once }));
    expect(twice).toHaveLength(1);
  });
});

describe("offers from the composer", () => {
  it("keeps one offer per draft and marks it live when the messages go out", () => {
    demoRepo.reset();
    const now = new Date(demoRepo.read().now);
    demoRepo.update((state) => ({
      ...state,
      now: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8),
    }));
    const placements = { page: true, till: true, push: true, sms: false };
    const sampleCount = demoRepo.read().offers.length;
    const mine = () =>
      demoRepo.read().offers.filter((offer) => offer.title.startsWith("Friday push"));
    const draft = saveDraft({
      restaurantId: "rest-daily-grind",
      actor: "owner-1",
      actorRole: "owner",
      fields: {
        name: "Friday push",
        body: "Hi {first_name}, come by Friday.",
        audience: { type: "all_opted_in" },
        placements,
      },
    });
    if (!draft.ok) throw new Error(draft.error.message);
    expect(demoRepo.read().offers).toHaveLength(sampleCount + 1);
    expect(mine()[0]).toMatchObject({
      id: `offer-${draft.data.id}`,
      title: "Friday push",
      placements,
      status: "live",
    });

    const edited = saveDraft({
      restaurantId: "rest-daily-grind",
      actor: "owner-1",
      actorRole: "owner",
      draftId: draft.data.id,
      fields: {
        name: "Friday push, edited",
        body: "Hi {first_name}, see you Friday.",
        audience: { type: "all_opted_in" },
        placements,
      },
    });
    expect(edited.ok).toBe(true);
    expect(demoRepo.read().offers).toHaveLength(sampleCount + 1);
    expect(mine()[0]?.title).toBe("Friday push, edited");

    const confirmed = confirmCampaign({
      campaignId: draft.data.id,
      actor: "owner-1",
      sendNow: true,
    });
    expect(confirmed.ok).toBe(true);
    expect(demoRepo.read().offers).toHaveLength(sampleCount + 1);
    expect(mine()[0]?.status).toBe("live");
  });
});
