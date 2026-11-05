import { describe, expect, it } from "vitest";
import { mergeOffers } from "@/data/repo";
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
