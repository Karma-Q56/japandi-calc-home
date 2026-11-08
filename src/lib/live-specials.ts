// Live specials rules (phase D12e). Browser-safe: no database or server imports.

export type SpecialKind = "public" | "members" | "targeted";

export type LiveSpecialInput = {
  title: string;
  reward: string;
  kind: SpecialKind;
  /** Local date and time in Johannesburg, as typed: "2026-11-08T18:00". Empty means no limit. */
  startsAt: string;
  endsAt: string;
  percentOff: number | null;
  amountOffCents: number | null;
  active: boolean;
};

type Ok<T> = { ok: true; value: T };
type Bad = { ok: false; message: string };

export const SPECIAL_KIND_LABELS: Record<SpecialKind, string> = {
  public: "Public code",
  members: "Members only",
  targeted: "Targeted",
};

/** One plain line for the owner about each kind. */
export const SPECIAL_KIND_HELP: Record<SpecialKind, string> = {
  public: "One code that anyone can use. Good for a launch or a walk-in deal.",
  members: "One code shared by all loyalty members. Only members can use it.",
  targeted: "A unique code for each guest you choose. Each code works once, for that guest only.",
};

/** Letters and digits that are easy to read aloud. No 0, O, 1 or I. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 7;

const TITLE_MAX = 80;
const REWARD_MAX = 120;

const isInt = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Turns a Johannesburg local date and time into an instant. Johannesburg has no daylight
 * saving, so it is always UTC+2. Returns null when the text is not a real date and time.
 */
export function johannesburgInstant(local: string): Date | null {
  const match = LOCAL_DATETIME.exec(local.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const utc = Date.UTC(year, month - 1, day, hour - 2, minute);
  const check = new Date(utc + 2 * 60 * 60 * 1000);
  // Reject dates such as 31 February that the Date object quietly rolls over.
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) return null;
  return new Date(utc);
}

/** Checks a special before it is saved. The result is the cleaned value. */
export function validateSpecial(input: LiveSpecialInput): Ok<LiveSpecialInput> | Bad {
  const title = clean(input.title);
  if (title.length < 1 || title.length > TITLE_MAX) {
    return { ok: false, message: `Give the special a name of 1 to ${TITLE_MAX} letters.` };
  }
  const reward = clean(input.reward);
  if (reward.length < 1 || reward.length > REWARD_MAX) {
    return { ok: false, message: `Say what the guest gets, in 1 to ${REWARD_MAX} letters.` };
  }
  if (input.kind !== "public" && input.kind !== "members" && input.kind !== "targeted") {
    return { ok: false, message: "Choose public, members only or targeted." };
  }

  const hasPercent = input.percentOff !== null;
  const hasAmount = input.amountOffCents !== null;
  if (hasPercent && hasAmount) {
    return { ok: false, message: "Choose a percent off or a rand amount off, not both." };
  }
  if (hasPercent && !isInt(input.percentOff, 1, 100)) {
    return { ok: false, message: "The discount must be a whole number from 1 to 100." };
  }
  if (hasAmount && !isInt(input.amountOffCents, 1, 1000000)) {
    return { ok: false, message: "The amount off must be more than R0." };
  }

  let startsAt: string | null = null;
  let endsAt: string | null = null;
  if (input.startsAt.trim()) {
    const start = johannesburgInstant(input.startsAt);
    if (!start) return { ok: false, message: "The start date and time is not valid." };
    startsAt = start.toISOString();
  }
  if (input.endsAt.trim()) {
    const end = johannesburgInstant(input.endsAt);
    if (!end) return { ok: false, message: "The end date and time is not valid." };
    endsAt = end.toISOString();
  }
  if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
    return { ok: false, message: "The start must be before the end." };
  }

  return {
    ok: true,
    value: {
      title,
      reward,
      kind: input.kind,
      startsAt: startsAt ?? "",
      endsAt: endsAt ?? "",
      percentOff: hasPercent ? input.percentOff : null,
      amountOffCents: hasAmount ? input.amountOffCents : null,
      active: input.active,
    },
  };
}

/** Plain wording of what the special gives, for guests and the owner list. */
export function specialGivesLine(value: {
  reward: string;
  percentOff: number | null;
  amountOffCents: number | null;
}): string {
  if (value.percentOff !== null) return `${value.percentOff}% off. ${value.reward}`;
  if (value.amountOffCents !== null) {
    return `R${(value.amountOffCents / 100).toFixed(2)} off. ${value.reward}`;
  }
  return value.reward;
}

/**
 * A random code from the easy alphabet. Uses the Web Crypto API so it works in the
 * browser and on the server, and is never based on earlier codes.
 */
export function makeSpecialCode(random: (max: number) => number = secureRandom): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  return out;
}

function secureRandom(max: number): number {
  const limit = 256 - (256 % max);
  const buffer = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0]! < limit) return buffer[0]! % max;
  }
}

/** True when a code has the shape this app issues. Case is ignored. */
export function isValidCodeShape(code: string): boolean {
  const re = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
  return re.test(code.trim().toUpperCase());
}
