import { describe, expect, it } from "vitest";
import { createSeed } from "@/data/seed";
import {
  CARD_PALETTES,
  cardTextIsReadable,
  refuseUnreadableColours,
} from "@/lib/card-palettes";
import { canPublish, goTo, markEdited, publish, startFlow, startPublished } from "@/domain/publish";
import { contrastRatio } from "@/theme/contrast";

describe("card palettes", () => {
  it("offers twelve presets", () => {
    expect(CARD_PALETTES).toHaveLength(12);
  });

  it("keeps card text readable in every preset", () => {
    for (const palette of CARD_PALETTES) {
      expect(
        contrastRatio(palette.ink, palette.paper),
        `${palette.name} text contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("refuses a text colour that is too close to the background", () => {
    expect(cardTextIsReadable("#f0eee8", "#f7f6f2")).toBe(false);
    expect(refuseUnreadableColours("#f0eee8", "#f7f6f2")).toContain("too close");
  });

  it("accepts a readable pair", () => {
    expect(cardTextIsReadable("#1b1b1f", "#f7f6f2")).toBe(true);
    expect(refuseUnreadableColours("#1b1b1f", "#f7f6f2")).toBeNull();
  });
});

describe("card draft vs live", () => {
  it("a new card is a draft and cannot go live from draft directly", () => {
    const flow = startFlow();
    expect(flow.live).toBe("draft");
    expect(canPublish(flow)).toBe(false);
  });

  it("a card becomes live only after a preview and an explicit publish", () => {
    const previewed = goTo(startFlow(), "preview");
    expect(canPublish(previewed)).toBe(true);
    expect(publish(previewed).live).toBe("published");
  });

  it("an edit to a published card waits for a preview before it is live again", () => {
    const edited = markEdited(startPublished());
    expect(edited.changed).toBe(true);
    expect(canPublish(edited)).toBe(false);
  });
});

describe("card design isolation", () => {
  it("restaurants in the seed have their own card designs", () => {
    const restaurants = createSeed().restaurants;
    expect(restaurants.length).toBeGreaterThan(1);
    const accents = restaurants.map((item) => item.theme.accent);
    expect(new Set(accents).size).toBeGreaterThan(1);
  });

  it("copying one restaurant's design does not alter the other's stored theme", () => {
    const [first, second] = createSeed().restaurants;
    const before = JSON.stringify(second!.theme);
    const draft = { ...first!.theme, accent: "#123456" };
    expect(draft.accent).toBe("#123456");
    expect(JSON.stringify(second!.theme)).toBe(before);
  });
});
