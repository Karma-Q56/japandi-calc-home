import type { Customer } from "@/data/types";

/** A birthday is a day and a month. Guests never share the year with us. */
export interface BirthdayParts {
  day: number;
  month: number;
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Read a guest's birthday. Old snapshots stored a full date string such as
 * "1994-06-12"; we keep only the day and month from it.
 */
export function birthdayOf(customer: Pick<Customer, "birthday"> | undefined): BirthdayParts | null {
  const value = customer?.birthday;
  if (!value) return null;
  if (typeof value === "string") {
    const match = /\d{4}-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;
    return { month: Number(match[1]), day: Number(match[2]) };
  }
  if (typeof value.month === "number" && typeof value.day === "number") return value;
  return null;
}

export function isValidBirthday(parts: BirthdayParts): boolean {
  if (!Number.isInteger(parts.month) || parts.month < 1 || parts.month > 12) return false;
  if (!Number.isInteger(parts.day) || parts.day < 1 || parts.day > 31) return false;
  const lengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return parts.day <= lengths[parts.month - 1]!;
}

/** The current month and day where the restaurant is (Johannesburg time). */
export function johannesburgMonthDay(nowMs: number): BirthdayParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  return {
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

/** Plain label, for example "12 June". */
export function birthdayLabel(parts: BirthdayParts): string {
  return `${parts.day} ${MONTH_NAMES[parts.month - 1]!}`;
}
