import { contrastRatio } from "@/theme/contrast";

/** Text on the card must reach WCAG AA contrast (4.5:1) against its background. */
export const MIN_CARD_TEXT_CONTRAST = 4.5;

export interface CardPalette {
  id: string;
  name: string;
  ink: string;
  paper: string;
  accent: string;
}

/** Twelve preset palettes. Each one is checked for readable text by the tests. */
export const CARD_PALETTES: readonly CardPalette[] = [
  { id: "espresso", name: "Espresso", ink: "#2b1d14", paper: "#f6efe4", accent: "#8c4a2f" },
  { id: "terracotta", name: "Terracotta", ink: "#3a2a22", paper: "#faf5ec", accent: "#b6633f" },
  { id: "sage", name: "Sage", ink: "#263a2d", paper: "#f3f1e8", accent: "#55705a" },
  { id: "olive", name: "Olive", ink: "#2f3424", paper: "#f2efe2", accent: "#6b6b2f" },
  { id: "honey", name: "Honey", ink: "#3d2e12", paper: "#fbf3dc", accent: "#a87419" },
  { id: "clay", name: "Clay", ink: "#422a24", paper: "#f5e9e2", accent: "#9b4b3c" },
  { id: "dusk", name: "Dusk", ink: "#2a2b40", paper: "#eeeaf4", accent: "#5b5b8f" },
  { id: "ocean", name: "Ocean", ink: "#1f3440", paper: "#eaf2f3", accent: "#2f6f7a" },
  { id: "forest", name: "Forest", ink: "#17301f", paper: "#e9f0e6", accent: "#2f6b43" },
  { id: "rose", name: "Rose", ink: "#41262e", paper: "#fbeef0", accent: "#a84a62" },
  { id: "slate", name: "Slate", ink: "#23292f", paper: "#eef0f2", accent: "#4f5d6b" },
  { id: "ink", name: "Ink", ink: "#1b1b1f", paper: "#f7f6f2", accent: "#3f3f46" },
];

export function isHexColour(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** True when the card text is readable on its background. */
export function cardTextIsReadable(ink: string, paper: string): boolean {
  return contrastRatio(ink, paper) >= MIN_CARD_TEXT_CONTRAST;
}

/** Only readable colour pairs may be saved. Returns a reason when a pick is refused. */
export function refuseUnreadableColours(ink: string, paper: string): string | null {
  if (!isHexColour(ink) || !isHexColour(paper)) return "One of the colours is not valid. Pick it again.";
  return cardTextIsReadable(ink, paper)
    ? null
    : "That text colour is too close to the background to read. Pick a darker text or a lighter background.";
}

const DARKS = [...CARD_PALETTES.map((palette) => palette.ink), "#000000"];
const LIGHTS = [...CARD_PALETTES.map((palette) => palette.paper), "#ffffff"];

/**
 * The palette colour furthest from the given one: the darkest dark on a light colour,
 * the lightest light on a dark one. Pure black or white backs it up, and one of those
 * two reaches 4.5:1 against any colour.
 */
function readablePartner(colour: string, candidates: string[]): string {
  const base = isHexColour(colour) ? colour : "#ffffff";
  const byContrast = (list: string[]) =>
    [...list].sort((a, b) => contrastRatio(b, base) - contrastRatio(a, base));
  const fromPalette = byContrast(candidates.filter((item) => item !== "#000000" && item !== "#ffffff"))[0]!;
  if (cardTextIsReadable(fromPalette, base)) return fromPalette;
  return byContrast(["#000000", "#ffffff"])[0]!;
}

/** A text colour that can be read on this background. */
export function suggestReadableInk(paper: string): string {
  return readablePartner(paper, [...DARKS, ...LIGHTS]);
}

/** A background colour on which this text colour can be read. */
export function suggestReadablePaper(ink: string): string {
  return readablePartner(ink, [...LIGHTS, ...DARKS]);
}
