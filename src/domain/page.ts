import { demoRepo, updateDemo } from "@/data/repo";
import type { PageEdit, PageVersion, Restaurant } from "@/data/types";import { failure, success, type ApiResult } from "./demo";

/** Days shown on the page editor, in the same order the page prints them. */
export const PAGE_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** The editor keeps at most this many published versions to undo by hand. */
const VERSION_LIMIT = 10;

export const ABOUT_LIMIT = 240;
export const TAGLINE_LIMIT = 70;

/** The words and hours this venue already has on its public page right now. */
export function pageEditFor(restaurant: Restaurant): PageEdit {
  return {
    tagline: restaurant.theme.tagline,
    about: restaurant.aboutText ?? "",
    address: restaurant.address ?? "",
    suburb: restaurant.suburb,
    hours: PAGE_DAYS.reduce((all, day) => {
      all[day] = restaurant.hours[day] ?? null;
      return all;
    }, {} as Restaurant["hours"]),
  };
}

function parseTime(value: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? `${value.trim()}` : null;
}

/** Plain problems, one line each, in page order. An empty array means ready. */
export function validatePageEdit(edit: PageEdit): string[] {
  const problems: string[] = [];
  const tagline = edit.tagline.trim();
  if (tagline.length < 2 || tagline.length > TAGLINE_LIMIT) {
    problems.push(`Add a tagline of 2 to ${TAGLINE_LIMIT} characters.`);
  }
  if (edit.about.trim().length > ABOUT_LIMIT) {
    problems.push(`Keep the story text to ${ABOUT_LIMIT} characters or fewer.`);
  }
  if (edit.address.trim().length > 120) {
    problems.push("Keep the street address to 120 characters or fewer.");
  }
  if (edit.suburb.trim().length < 2 || edit.suburb.trim().length > 60) {
    problems.push("Add a suburb of 2 to 60 characters.");
  }
  let openDays = 0;
  for (const day of PAGE_DAYS) {
    const span = edit.hours[day];
    if (!span) continue;
    const open = parseTime(span.open);
    const close = parseTime(span.close);
    if (!open || !close) {
      problems.push(`Check the ${day} hours. Use times such as 07:00.`);
      continue;
    }
    if (close <= open) {
      problems.push(`On ${day} the opening time must be earlier than the closing time.`);
      continue;
    }
    openDays += 1;
  }
  if (openDays === 0) {
    problems.push("Keep at least one opening day so the page can show when you are open.");
  }
  return problems;
}

/** A copy of the venue with the edit applied, never touching the stored one. */
export function applyPageEdit(restaurant: Restaurant, edit: PageEdit): Restaurant {
  const address = edit.address.trim() || restaurant.address || "";
  return {
    ...restaurant,
    suburb: edit.suburb.trim(),
    ...(address ? { address } : {}),
    hours: PAGE_DAYS.reduce((all, day) => {
      all[day] = edit.hours[day] ?? null;
      return all;
    }, {} as Restaurant["hours"]),
    aboutText: edit.about.trim(),
    theme: { ...restaurant.theme, tagline: edit.tagline.trim() },
  };
}

/**
 * The only place page words and hours reach guests. Validation first, then the
 * change goes live in one step and a version is kept for undo by hand.
 */
export function publishPageEdit(
  restaurantId: string,
  edit: PageEdit,
): ApiResult<PageVersion> {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === restaurantId);
  if (!restaurant) return failure("NOT_FOUND", "Restaurant not found.");
  const problems = validatePageEdit(edit);
  if (problems.length > 0) {
    return failure("INVALID", problems[0]!);
  }
  const version: PageVersion = {
    id: `pageversion-${crypto.randomUUID()}`,
    restaurantId,
    at: new Date(state.now).toISOString(),
    edit,
  };
  updateDemo((current) => ({
    ...current,
    restaurants: current.restaurants.map((item) =>
      item.id === restaurantId ? applyPageEdit(item, edit) : item,
    ),
    // Newest first for this venue, capped per venue so owners can step back.
    pageVersions: renovateVersions(current.pageVersions, version, VERSION_LIMIT),
  }));
  return success(version);
}

/** Newest first; this venue only. */
export function pageVersionsFor(restaurantId: string): PageVersion[] {
  return demoRepo
    .read()
    .pageVersions.filter((item) => item.restaurantId === restaurantId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Keep this venue's history capped, and every other venue's untouched. */
function renovateVersions(
  all: PageVersion[],
  version: PageVersion,
  limit: number,
): PageVersion[] {
  const others = all.filter((item) => item.restaurantId !== version.restaurantId);
  const mine = [version, ...all.filter((item) => item.restaurantId === version.restaurantId)];
  return [...others, ...mine.slice(0, limit)];
}

