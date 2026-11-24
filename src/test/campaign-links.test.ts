import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIENCE_TYPES,
  COMPOSER_BODY_MAX,
  COMPOSER_NAME_MAX,
  composerHref,
  initialComposerSegment,
  isUuid,
  parseComposerSearch,
} from "@/lib/live-campaigns";

const LIST_ID = "6f1c2a3e-4b5d-4e6f-8a7b-9c0d1e2f3a4b";

function searchOf(href: string): Record<string, unknown> {
  return Object.fromEntries(new URL(href, "https://patron.test").searchParams.entries());
}

describe("composerHref", () => {
  it("has no query when nothing is given", () => {
    expect(composerHref()).toBe("/app/campaigns/new");
  });

  it("every audience segment survives the trip through the route's search rule", () => {
    for (const segment of AUDIENCE_TYPES) {
      const parsed = parseComposerSearch(searchOf(composerHref({ segment })));
      expect(parsed.segment).toBe(segment);
    }
  });

  it("keeps the weekday for a weekday audience", () => {
    const parsed = parseComposerSearch(searchOf(composerHref({ segment: "weekday", weekday: 2 })));
    expect(parsed.segment).toBe("weekday");
    expect(parsed.weekday).toBe(2);
  });

  it("drops a weekday outside 0 to 6", () => {
    expect(composerHref({ segment: "weekday", weekday: 9 })).not.toContain("weekday=");
  });

  it("builds the saved list link with the segment first, then the list", () => {
    expect(composerHref({ segment: "saved_list", listId: LIST_ID })).toContain(`segment=saved_list&listId=${LIST_ID}`);
  });

  it("encodes name and body so they come back unchanged", () => {
    const href = composerHref({ name: "Win back & more", body: "Hi {first_name}, 20% off?" });
    const parsed = parseComposerSearch(searchOf(href));
    expect(parsed.name).toBe("Win back & more");
    expect(parsed.body).toBe("Hi {first_name}, 20% off?");
  });
});

describe("parseComposerSearch", () => {
  it("throws away the old audience key and unknown segments", () => {
    expect(parseComposerSearch({ audience: "lapsed30" }).segment).toBeUndefined();
    expect(parseComposerSearch({ segment: "nope" }).segment).toBeUndefined();
  });

  it("cuts name to 80 and body to 600 characters", () => {
    const parsed = parseComposerSearch({ name: "n".repeat(200), body: "b".repeat(900) });
    expect(parsed.name).toHaveLength(COMPOSER_NAME_MAX);
    expect(parsed.body).toHaveLength(COMPOSER_BODY_MAX);
  });

  it("ignores blank text", () => {
    const parsed = parseComposerSearch({ name: "   ", body: "" });
    expect(parsed.name).toBeUndefined();
    expect(parsed.body).toBeUndefined();
  });
});

describe("initialComposerSegment", () => {
  it("starts on the saved list when a valid list id arrives with no segment", () => {
    expect(initialComposerSegment({ listId: LIST_ID })).toEqual({ segment: "saved_list", listId: LIST_ID });
  });

  it("starts on the saved list when the segment says saved_list", () => {
    expect(initialComposerSegment({ segment: "saved_list", listId: LIST_ID })).toEqual({ segment: "saved_list", listId: LIST_ID });
  });

  it("ignores a list id that is not a UUID", () => {
    expect(initialComposerSegment({ listId: "list-1" })).toEqual({ segment: "everyone", listId: undefined });
    expect(initialComposerSegment({ segment: "saved_list", listId: "nope" })).toEqual({ segment: "everyone", listId: undefined });
  });

  it("keeps another segment and drops the list id", () => {
    expect(initialComposerSegment({ segment: "lapsed30", listId: LIST_ID })).toEqual({ segment: "lapsed30", listId: undefined });
  });

  it("never starts on saved_list without a list", () => {
    expect(initialComposerSegment({ segment: "saved_list" })).toEqual({ segment: "everyone", listId: undefined });
  });

  it("isUuid accepts real ids only", () => {
    expect(isUuid(LIST_ID)).toBe(true);
    expect(isUuid("12345")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("pages build their composer links with composerHref", () => {
  it("the lists page sends each list with segment and list id", () => {
    const source = readFileSync("src/routes/app.lists.tsx", "utf8");
    expect(source.match(/composerHref\(\{ segment: "saved_list", listId: list\.id \}\)/g)).toHaveLength(2);
    expect(source).not.toMatch(/href="\/app\/campaigns\/new">\s*Send to this list/);
  });

  it("insights no longer uses the old audience key", () => {
    const source = readFileSync("src/components/patron/live/LiveInsights.tsx", "utf8");
    expect(source).not.toContain("?audience=");
    expect(source).toContain("composerHref");
  });
});
