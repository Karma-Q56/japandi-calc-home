import { beforeEach, describe, expect, it } from "vitest";
import { clock } from "@/lib/clock";
import { demoRepo, updateDemo } from "@/data/repo";
import {
  applyFillIns,
  messageFillFacts,
  suggestMessages,
} from "@/domain/suggestions";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

const RESTAURANT_ID = "rest-daily-grind";
const Everyone = { type: "everyone" } as const;

function restaurant() {
  const found = demoRepo.read().restaurants.find((item) => item.id === RESTAURANT_ID);
  expect(found).toBeTruthy();
  return found!;
}

function facts() {
  return messageFillFacts(RESTAURANT_ID);
}

describe("smart message suggestions", () => {
  it("suggests a win back for lapsed guests and keeps the name as a fill-in", () => {
    const list = suggestMessages({
      restaurant: restaurant(),
      audience: { type: "lapsed30", days: 30 },
      facts: facts(),
    });
    expect(list.length).toBeGreaterThan(0);
    const rendered = applyFillIns(list[0]!.body, facts(), "Thandi");
    expect(rendered).toContain("Thandi");
    expect(rendered.toLowerCase()).toContain("while");
  });

  it("suggests a birthday message for the birthday segment", () => {
    const list = suggestMessages({
      restaurant: restaurant(),
      audience: { type: "birthday_month" },
      facts: facts(),
    });
    expect(list[0]!.title.toLowerCase()).toContain("birthday");
    const rendered = applyFillIns(list[0]!.body, facts(), "Sipho");
    expect(rendered.toLowerCase()).toContain("birthday");
  });

  it("resolves the favourite item fill-in from real orders", () => {
    const fact = facts();
    expect(fact.favouriteItem).toBe("flat white"); // seeded from till orders
    const rendered = applyFillIns("Your favourite {favourite_item} is ready.", fact, "Thandi");
    expect(rendered).toBe("Your favourite flat white is ready.");
  });

  it("uses a safe wording when a fill-in has no data", () => {
    const noData: Parameters<typeof applyFillIns>[1] = {
      favouriteItem: null,
      usualDay: null,
      reward: null,
      slippingRegulars: 0,
    };
    const rendered = applyFillIns(
      "{name}, {favourite_item} around {usual_day}? {reward}!",
      noData,
      "Thandi",
    );
    expect(rendered).toBe("Thandi, your favourite around your next visit? a treat on us!");
  });

  it("resolves {name} the same as {first_name}", () => {
    const fact = facts();
    expect(applyFillIns("{name}", fact, "Sipho")).toBe(applyFillIns("{first_name}", fact, "Sipho"));
  });

  it("uses the chosen weekday for a weekday campaign", () => {
    const list = suggestMessages({
      restaurant: restaurant(),
      audience: { type: "weekday", weekday: 2 },
      facts: facts(),
    });
    const rendered = applyFillIns(list[0]!.body, facts(), "Thandi");
    expect(rendered).toContain("Tuesday");
  });

  it("reports slipping regulars from their own visit gaps", () => {
    // Craft one slipping regular: five Tuesdays, then a five week silence.
    const state = demoRepo.read();
    const membership = state.memberships.find((m) => m.restaurantId === RESTAURANT_ID)!;
    const allStamps = demoRepo.read().stamps.filter((s) => s.membershipId !== membership.id);
    const crafted = [
      "2026-08-04T07:00:00.000Z",
      "2026-08-11T07:00:00.000Z",
      "2026-08-18T07:00:00.000Z",
      "2026-08-25T07:00:00.000Z",
      "2026-09-01T07:00:00.000Z",
    ].map((createdAt, index) => ({
      id: `suggest-stamp-${index}`,
      restaurantId: RESTAURANT_ID,
      membershipId: membership.id,
      staffId: null,
      key: `slip-${index}`,
      createdAt,
      status: "valid" as const,
    }));
    updateDemo((current) => ({ ...current, stamps: [...allStamps, ...crafted] }));
    clock.advance(Date.UTC(2026, 9, 20, 8) - Date.UTC(2026, 9, 1, 8));
    const fact = facts();
    expect(fact.slippingRegulars).toBeGreaterThan(0);
    const list = suggestMessages({
      restaurant: restaurant(),
      audience: Everyone,
      facts: fact,
    });
    const winBack = list.find((item) => item.id === "slipping");
    expect(winBack).toBeTruthy();
  });
});
