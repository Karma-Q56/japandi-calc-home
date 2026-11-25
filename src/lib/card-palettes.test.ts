import { describe, expect, it } from "vitest";
import { createSeed } from "@/data/seed";
import {
  CARD_PALETTES,
  cardTextIsReadable,
  refuseUnreadableColours,
  suggestReadableInk,
  suggestReadablePaper,
} from "@/lib/card-palettes";
import { canPublish, goTo, markEdited, publish, startFlow, startPublished } from "@/domain/publish";
import { contrastRatio, darkenForWhiteText, readableOnAccent } from "@/theme/contrast";

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

/** A small seeded generator, so a failure can be repeated. */
function colours(seed: number, count: number): string[] {
  let state = seed;
  return Array.from({ length: count }, () => {
    state = (state * 48271) % 2147483647;
    return `#${(state % 0x1000000).toString(16).padStart(6, "0")}`;
  });
}

describe("readable suggestions", () => {
  const samples = [...colours(20261125, 200), "#777777", "#757575", "#000000", "#ffffff"];

  it("suggests text that reaches 4.5:1 on any background", () => {
    for (const paper of samples) {
      expect(contrastRatio(suggestReadableInk(paper), paper), paper).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("suggests a background that reaches 4.5:1 behind any text", () => {
    for (const ink of samples) {
      expect(contrastRatio(ink, suggestReadablePaper(ink)), ink).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("picks words that can be read on any accent", () => {
    const inks = colours(7, samples.length);
    samples.forEach((accent, index) => {
      const label = readableOnAccent(accent, inks[index]!, inks[(index + 1) % inks.length]!);
      expect(contrastRatio(label, accent), accent).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio("#ffffff", darkenForWhiteText(accent)), accent).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("keeps the paper colour on an accent when it can already be read", () => {
    expect(readableOnAccent("#3a2a22", "#222222", "#faf5ec")).toBe("#faf5ec");
    expect(readableOnAccent("#f5e663", "#222222", "#faf5ec")).toBe("#222222");
  });

  it("passes the extreme pairs and refuses faint or broken colours", () => {
    expect(refuseUnreadableColours("#000000", "#ffffff")).toBeNull();
    expect(refuseUnreadableColours("#ffffff", "#000000")).toBeNull();
    expect(refuseUnreadableColours("#cccccc", "#ffffff")).toContain("too close");
    for (const broken of ["", "#fff", "red", "#gggggg", "123456"]) {
      expect(refuseUnreadableColours(broken, "#ffffff")).toContain("not valid");
      expect(() => suggestReadableInk(broken)).not.toThrow();
      expect(() => suggestReadablePaper(broken)).not.toThrow();
    }
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
