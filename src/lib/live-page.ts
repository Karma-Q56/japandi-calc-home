// Checks for the live "Your page" and card design saves. They run in the browser (so the owner
// sees a plain message at once) and again on the server (so nothing odd is ever stored). The
// database repeats the shape checks in db/migrations/0034.
import { validateAddress, validateSuburb, validateVenueType } from "@/lib/venue-fields";

import { STAMP_SHAPES, type Theme } from "@/data/types";
import { themeHasAccessibleContrast } from "@/theme";

export const PAGE_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const TAGLINE_LIMIT = 70;
export const ABOUT_LIMIT = 240;
export const SUBURB_LIMIT = 60;
export const ADDRESS_LIMIT = 120;

export type Span = { open: string; close: string } | null;
export type Hours = Record<string, Span>;

export type PageInput = {
  tagline: string;
  about: string;
  suburb: string;
  venueType: string;
  address: string;
  hours: Hours;
};

export const HEADING_FONTS = ["Bricolage Grotesque", "DM Sans", "Georgia"] as const;
export const BODY_FONTS = ["DM Sans", "Bricolage Grotesque", "Arial"] as const;
export const CARD_BACKGROUNDS = ["flat", "paper", "gradient"] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Every day listed, closed unless the restaurant has hours for it. */
export function fullWeek(hours: Record<string, unknown> | null | undefined): Hours {
  const week: Hours = {};
  for (const day of PAGE_DAYS) {
    const span = (hours ?? {})[day] as { open?: unknown; close?: unknown } | null | undefined;
    week[day] =
      span && typeof span.open === "string" && typeof span.close === "string"
        ? { open: span.open, close: span.close }
        : null;
  }
  return week;
}

/** A plain-words problem with the page, or null when it can be saved. */
export function validatePage(input: PageInput): string | null {
  const tagline = input.tagline.trim();
  if (tagline.length < 2) return "Add a short line under your name. It is the first thing guests read.";
  if (tagline.length > TAGLINE_LIMIT) return `Keep the line under your name to ${TAGLINE_LIMIT} characters.`;
  if (input.about.trim().length > ABOUT_LIMIT) return `Keep your story to ${ABOUT_LIMIT} characters.`;
  const suburb = input.suburb.trim();
  if (suburb.length < 2 || suburb.length > SUBURB_LIMIT) return "Add the suburb guests will find you in.";
  const suburbProblem = validateSuburb(suburb);
  if (suburbProblem) return suburbProblem;
  if (input.address.trim().length > ADDRESS_LIMIT) return `Keep the address to ${ADDRESS_LIMIT} characters.`;
  const addressProblem = validateAddress(input.address, ADDRESS_LIMIT);
  if (addressProblem) return addressProblem;
  const typeProblem = validateVenueType(input.venueType);
  if (typeProblem) return typeProblem;
  let open = 0;
  for (const day of PAGE_DAYS) {
    const span = input.hours[day] ?? null;
    if (span === null) continue;
    if (!TIME.test(span.open) || !TIME.test(span.close)) return `Fill in both times for ${day}, or mark it closed.`;
    if (span.close <= span.open) return `${day} must close after it opens.`;
    open += 1;
  }
  if (open === 0) return "Open at least one day, or guests will think you are closed for good.";
  return null;
}

/** A plain-words problem with the card design, or null when it can be saved. */
export function validateDesign(theme: Theme): string | null {
  for (const key of ["ink", "paper", "accent", "accentSoft", "stampFilled", "stampEmpty"] as const) {
    if (!HEX.test(theme[key])) return "One of the colours is not valid. Pick it again.";
  }
  if (!(HEADING_FONTS as readonly string[]).includes(theme.headingFont)) return "Pick a heading font from the list.";
  if (!(BODY_FONTS as readonly string[]).includes(theme.bodyFont)) return "Pick a body font from the list.";
  if (!(STAMP_SHAPES as readonly string[]).includes(theme.stampShape)) return "Pick a stamp shape from the list.";
  if (!(CARD_BACKGROUNDS as readonly string[]).includes(theme.cardBackground)) {
    return "Pick flat, paper or gradient for the card background.";
  }
  if (!Number.isFinite(theme.radius) || theme.radius < 0 || theme.radius > 40) return "The corner roundness is out of range.";
  const tagline = theme.tagline.trim();
  if (tagline.length < 2 || tagline.length > TAGLINE_LIMIT) {
    return `Add a short line under your name (up to ${TAGLINE_LIMIT} characters). It sits under your name on the card.`;
  }
  if (!themeHasAccessibleContrast(theme)) {
    return "Text and background are too close to read comfortably. Darken the text or lighten the background.";
  }
  return null;
}

/** What a stored theme must look like to be saved from the browser: no uploaded photo, logo link or oversized picture. */
export function themeForSave(theme: Theme): Theme {
  const { logo: _logo, coverPhoto: _cover, ...rest } = theme;
  return rest;
}

/** A theme for a restaurant that never designed its card: calm defaults the owner can change. */
export const DEFAULT_THEME: Theme = {
  ink: "#26332a",
  paper: "#faf7ef",
  accent: "#b6633f",
  accentSoft: "#ecd6c8",
  stampFilled: "#b6633f",
  stampEmpty: "#ddd7ca",
  headingFont: "Bricolage Grotesque",
  bodyFont: "DM Sans",
  radius: 16,
  stampShape: "circle",
  cardBackground: "flat",
  tagline: "A little perk, made for you",
};
