import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo } from "@/data/repo";
import type { Restaurant } from "@/data/types";
import { clock } from "@/lib/clock";
import {
  ABOUT_LIMIT,
  PAGE_DAYS,
  applyPageEdit,
  pageEditFor,
  pageVersionsFor,
  publishPageEdit,
  restorePageDraft,
  summarisePageChange,
  validatePageEdit,
} from "@/domain/page";

const RESTAURANT = "rest-daily-grind";

const goodEdit = () => ({
  tagline: "Good food, familiar faces",
  about: "A corner cafe with slow mornings and quick lunches.",
  address: "4th Avenue, Parkhurst",
  suburb: "Parkhurst",
  hours: {
    Monday: { open: "07:00", close: "16:00" },
    Tuesday: { open: "07:00", close: "16:00" },
    Wednesday: { open: "07:00", close: "16:00" },
    Thursday: { open: "07:00", close: "16:00" },
    Friday: { open: "07:00", close: "17:00" },
    Saturday: { open: "08:00", close: "15:00" },
    Sunday: null,
  },
});

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

describe("validatePageEdit", () => {
  it("passes the seed-shaped edit", () => {
    expect(validatePageEdit(goodEdit())).toEqual([]);
  });

  it("keeps every check in plain language, one problem each", () => {
    const problems = validatePageEdit({
      tagline: "",
      about: "x".repeat(ABOUT_LIMIT + 1),
      address: "y".repeat(121),
      suburb: "",
      hours: {
        Monday: { open: "16:00", close: "07:00" },
        Tuesday: { open: "07:30", close: "not-a-time" },
        Wednesday: null,
        Thursday: null,
        Friday: null,
        Saturday: null,
        Sunday: null,
      },
    });
    expect(problems.length).toBeGreaterThanOrEqual(6);
    expect(problems.every((problem) => /[A-Z]/.test(problem[0]!))).toBe(true);
  });

  it("demands at least one open day", () => {
    const edit = goodEdit();
    const allClosed = PAGE_DAYS.reduce<Restaurant["hours"]>(
      (all, day) => {
        all[day] = null;
        return all;
      },
      {},
    );
    expect(validatePageEdit({ ...edit, hours: allClosed })).toContain(
      "Keep at least one opening day so the page can show when you are open.",
    );
  });

  it("accepts a tagline at the exact limit", () => {
    const edit = { ...goodEdit(), tagline: "x".repeat(70) };
    expect(validatePageEdit(edit)).toEqual([]);
  });
});

describe("applyPageEdit", () => {
  it("returns a new venue object and leaves the stored one untouched", () => {
    const before = demoRepo.read().restaurants.find((item) => item.id === RESTAURANT)!;
    const edit = goodEdit();
    const merged = applyPageEdit(before, edit);
    expect(merged.suburb).toBe("Parkhurst");
    expect(merged.aboutText).toBe(edit.about);
    expect(merged.theme.tagline).toBe(edit.tagline);
    expect(before.aboutText ?? "").toBe("");
    expect(before.theme.tagline).not.toBe(edit.tagline.replace("Good", "X"));
  });

  it("roundtrips with pageEditFor", () => {
    const venue = demoRepo.read().restaurants.find((item) => item.id === RESTAURANT)!;
    const edit = goodEdit();
    const merged = applyPageEdit(venue, edit);
    expect(pageEditFor(merged)).toEqual(edit);
  });
});

describe("publishPageEdit", () => {
  it("goes live only after validation and keeps one version per publish", () => {
    const bad = { ...goodEdit(), tagline: "" };
    const rejected = publishPageEdit(RESTAURANT, bad);
    expect(rejected.ok).toBe(false);
    expect(pageVersionsFor(RESTAURANT)).toHaveLength(0);

    const first = goodEdit();
    const ok = publishPageEdit(RESTAURANT, first);
    expect(ok.ok).toBe(true);
    const live = demoRepo.read().restaurants.find((item) => item.id === RESTAURANT)!;
    expect(live.theme.tagline).toBe(first.tagline);
    expect(live.aboutText).toBe(first.about);
    expect(live.suburb).toBe(first.suburb);
    expect(live.hours).toEqual(first.hours);
    expect(live.address).toBe(first.address);
    const versions = pageVersionsFor(RESTAURANT);
    expect(versions).toHaveLength(1);
    expect(versions[0]!.edit).toEqual(first);

    const second = { ...first, tagline: "Slower mornings for everyone" };
    clock.advance(60000);
    publishPageEdit(RESTAURANT, second);
    expect(demoRepo.read().restaurants.find((item) => item.id === RESTAURANT)!.theme.tagline).toBe(
      second.tagline,
    );
    expect(pageVersionsFor(RESTAURANT).map((item) => item.edit.tagline)).toEqual([
      second.tagline,
      first.tagline,
    ]);
  });

  it("caps the version history at ten and keeps only this venue", () => {
    const first = goodEdit();
    for (let index = 0; index < 12; index++) {
      const result = publishPageEdit(RESTAURANT, { ...first, tagline: `Version ${index}` });
      expect(result.ok).toBe(true);
      clock.advance(60000);
    }
    const versions = pageVersionsFor(RESTAURANT);
    expect(versions).toHaveLength(10);
    expect(versions[0]!.edit.tagline).toBe("Version 11");
    // Another venue keeps its own history.
    publishPageEdit("rest-sunrise-bakes", first);
    expect(pageVersionsFor(RESTAURANT)).toHaveLength(10);
  });

  it("fails for a venue that does not exist", () => {
    const result = publishPageEdit("rest-nowhere", goodEdit());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("restorePageDraft", () => {
  it("loads an old version as a draft and leaves the live page alone", () => {
    const first = goodEdit();
    publishPageEdit(RESTAURANT, first);
    const archived = pageVersionsFor(RESTAURANT)[0]!;
    const second = { ...first, tagline: "A newer tagline" };
    clock.advance(60000);
    publishPageEdit(RESTAURANT, second);

    const draft = restorePageDraft(RESTAURANT, archived.id);
    expect(draft.ok).toBe(true);
    if (draft.ok) expect(draft.data.tagline).toBe(first.tagline);
    // Loading the draft is not publishing it.
    expect(
      demoRepo.read().restaurants.find((item) => item.id === RESTAURANT)!.theme.tagline,
    ).toBe(second.tagline);
    expect(pageVersionsFor(RESTAURANT)).toHaveLength(2);
  });

  it("never loads another venue's version", () => {
    publishPageEdit("rest-sunrise-bakes", goodEdit());
    const other = pageVersionsFor("rest-sunrise-bakes")[0]!;
    const draft = restorePageDraft(RESTAURANT, other.id);
    expect(draft.ok).toBe(false);
    if (!draft.ok) expect(draft.error.code).toBe("NOT_FOUND");
  });

  it("summarises what changed in plain words", () => {
    const venue = demoRepo.read().restaurants.find((item) => item.id === RESTAURANT)!;
    const edit = goodEdit();
    expect(summarisePageChange(venue, edit)).toContain("tagline");
    expect(summarisePageChange(venue, pageEditFor(venue))).toBe(
      "Published with no changes",
    );
  });
});
