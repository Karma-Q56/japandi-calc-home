// Validation and plain wording for live challenges and referrals (D12c).
// Pure code: no database, so it can run in the browser and in tests.

export type ChallengeKind = "visits" | "quiet_days" | "try_item";
export type RewardType = "stamps" | "free_item" | "percent_off" | "amount_off";

export type LiveChallengeInput = {
  title: string;
  kind: ChallengeKind;
  visits: number;
  windowDays: number;
  weekdays: number[];
  startHour: number | null;
  endHour: number | null;
  rewardType: RewardType;
  bonusStamps: number;
  rewardItem: string;
  percentOff: number | null;
  amountOffCents: number | null;
  validDays: number | null;
  active: boolean;
  /** Try this dish only: the chosen menu item or section (one of the two). */
  menuItemId: string | null;
  menuSectionId: string | null;
  /** Try this dish only: the name shown in the wording, e.g. "Peri-peri chicken". */
  targetName: string;
};

export type LiveReferralInput = {
  enabled: boolean;
  limitPerMonth: number;
  referrerRewardType: RewardType;
  referrerRewardItem: string;
  referrerPercentOff: number | null;
  referrerAmountOffCents: number | null;
  friendRewardType: RewardType;
  friendRewardItem: string;
  friendPercentOff: number | null;
  friendAmountOffCents: number | null;
  validDays: number | null;
};

type Ok<T> = { ok: true; value: T };
type Bad = { ok: false; message: string };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const isInt = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

const cleanText = (value: string) => value.trim().replace(/\s+/g, " ");

/** Checks one reward's fields. Returns an error message or null. */
function rewardProblem(
  label: string,
  type: RewardType,
  item: string,
  percent: number | null,
  amountCents: number | null,
): string | null {
  if (type === "free_item" && !(cleanText(item).length >= 1 && cleanText(item).length <= 80)) {
    return `${label}: write the free item in 1 to 80 letters.`;
  }
  if (type === "percent_off" && !isInt(percent, 1, 100)) {
    return `${label}: the discount must be a whole number from 1 to 100.`;
  }
  if (type === "amount_off" && !isInt(amountCents, 1, 1000000)) {
    return `${label}: the amount off must be more than R0.`;
  }
  return null;
}

export function validateChallenge(input: LiveChallengeInput): Ok<LiveChallengeInput> | Bad {
  const title = cleanText(input.title);
  if (title.length < 2 || title.length > 70) return { ok: false, message: "Give the challenge a name of 2 to 70 letters." };
  if (!["visits", "quiet_days", "try_item"].includes(input.kind)) return { ok: false, message: "Pick a challenge type." };

  let weekdays: number[] = [];
  let startHour: number | null = null;
  let endHour: number | null = null;
  let menuItemId: string | null = null;
  let menuSectionId: string | null = null;
  let visits = 0;
  let windowDays = 0;
  if (input.kind === "try_item") {
    if (!isInt(input.visits, 1, 50)) return { ok: false, message: "The count must be a whole number from 1 to 50." };
    if (!isInt(input.windowDays, 1, 365)) return { ok: false, message: "The time limit must be 1 to 365 days." };
    const hasItem = typeof input.menuItemId === "string" && input.menuItemId.length > 0;
    const hasSection = typeof input.menuSectionId === "string" && input.menuSectionId.length > 0;
    if (hasItem === hasSection) return { ok: false, message: "Pick one menu item or one menu section." };
    menuItemId = hasItem ? input.menuItemId : null;
    menuSectionId = hasSection ? input.menuSectionId : null;
    visits = input.visits;
    windowDays = input.windowDays;
    if (cleanText(input.targetName).length < 1) return { ok: false, message: "Pick the dish or section for this challenge." };
  } else if (input.kind === "visits") {
    if (!isInt(input.visits, 2, 50)) return { ok: false, message: "Visits must be a whole number from 2 to 50." };
    if (!isInt(input.windowDays, 1, 365)) return { ok: false, message: "The time limit must be 1 to 365 days." };
    visits = input.visits;
    windowDays = input.windowDays;
  } else {
    weekdays = [...new Set(input.weekdays)].sort((a, b) => a - b);
    if (weekdays.length < 1 || !weekdays.every((d) => isInt(d, 0, 6))) {
      return { ok: false, message: "Pick at least one day of the week." };
    }
    if (input.startHour !== null || input.endHour !== null) {
      if (!isInt(input.startHour, 0, 23) || !isInt(input.endHour, 1, 24) || (input.endHour as number) <= (input.startHour as number)) {
        return { ok: false, message: "Set both hours, with the end hour after the start hour." };
      }
      startHour = input.startHour;
      endHour = input.endHour;
    }
  }

  const rewardType = input.rewardType;
  if (!["stamps", "free_item", "percent_off", "amount_off"].includes(rewardType)) {
    return { ok: false, message: "Pick a reward type." };
  }
  if (rewardType === "stamps" && !isInt(input.bonusStamps, 1, 5)) {
    return { ok: false, message: "Bonus stamps must be a whole number from 1 to 5." };
  }
  const problem = rewardProblem("Reward", rewardType, input.rewardItem, input.percentOff, input.amountOffCents);
  if (problem) return { ok: false, message: problem };
  if (input.validDays !== null && !isInt(input.validDays, 1, 365)) {
    return { ok: false, message: "Reward valid days must be 1 to 365, or blank for no end date." };
  }

  return {
    ok: true,
    value: {
      title,
      kind: input.kind,
      visits,
      windowDays,
      menuItemId,
      menuSectionId,
      targetName: input.kind === "try_item" ? cleanText(input.targetName) : "",
      weekdays,
      startHour,
      endHour,
      rewardType,
      bonusStamps: rewardType === "stamps" ? input.bonusStamps : 0,
      rewardItem: rewardType === "free_item" ? cleanText(input.rewardItem) : "",
      percentOff: rewardType === "percent_off" ? input.percentOff : null,
      amountOffCents: rewardType === "amount_off" ? input.amountOffCents : null,
      validDays: rewardType === "stamps" ? null : input.validDays,
      active: input.active,
    },
  };
}

export function validateReferrals(input: LiveReferralInput): Ok<LiveReferralInput> | Bad {
  if (!isInt(input.limitPerMonth, 0, 20)) return { ok: false, message: "A member can refer up to 20 friends a month. Use 0 to 20." };
  const referrer = rewardProblem("Referrer reward", input.referrerRewardType, input.referrerRewardItem, input.referrerPercentOff, input.referrerAmountOffCents);
  if (referrer) return { ok: false, message: referrer };
  const friend = rewardProblem("Friend reward", input.friendRewardType, input.friendRewardItem, input.friendPercentOff, input.friendAmountOffCents);
  if (friend) return { ok: false, message: friend };
  if (input.validDays !== null && !isInt(input.validDays, 1, 365)) {
    return { ok: false, message: "Reward valid days must be 1 to 365, or blank for no end date." };
  }
  return { ok: true, value: { ...input, limitPerMonth: input.limitPerMonth } };
}

/** Plain line for the challenge rule, e.g. "Visit 3 times in 14 days". */
export function challengeRuleLine(c: Pick<LiveChallengeInput, "kind" | "visits" | "windowDays" | "weekdays" | "startHour" | "endHour"> & { targetName?: string }): string {
  if (c.kind === "visits") return `Visit ${c.visits} times in ${c.windowDays} days`;
  if (c.kind === "try_item") return `Order the ${c.targetName ?? "dish"} ${c.visits} times in ${c.windowDays} days`;
  const days = c.weekdays.map((d) => DAY_NAMES[d]).join(", ");
  const hours = c.startHour === null || c.endHour === null ? "" : ` between ${c.startHour}:00 and ${c.endHour}:00`;
  return `Visit on ${days}${hours}`;
}

/** Guest card progress line, e.g. "1 of 2 ordered" for dish challenges, "1 of 2 in 14 days" otherwise. */
export function progressLine(c: { kind: ChallengeKind; visits: number; windowDays: number; progress: number }): string {
  if (c.kind === "try_item") return `${Math.min(c.progress, c.visits)} of ${c.visits} ordered`;
  return `${Math.min(c.progress, c.visits)} of ${c.visits} in ${c.windowDays} days`;
}

/** Plain line for a reward, e.g. "Take 10% off the bill". */
export function rewardLine(type: RewardType, value: { bonusStamps?: number; item?: string; percent?: number | null; amountCents?: number | null }): string {
  if (type === "stamps") return `${value.bonusStamps ?? 1} bonus stamp${(value.bonusStamps ?? 1) === 1 ? "" : "s"}`;
  if (type === "free_item") return `A free ${value.item ?? "item"}`;
  if (type === "percent_off") return `${value.percent ?? 0}% off the bill`;
  return `R${((value.amountCents ?? 0) / 100).toFixed(2).replace(/\.00$/, "")} off the bill`;
}
