// Pure rules for the live spin wheel (D12d): what an owner may save, how the odds are explained in plain words,
// and the messages a refusal turns into. The database repeats the checks in db/migrations/0019.

import type { SpinSegment } from "@/data/types";

export const MAX_PRIZES = 8;
export const LABEL_LIMIT = 40;
export const WEIGHT_MAX = 1000;
export const EARN_EVERY_MIN = 1;
export const EARN_EVERY_MAX = 50;
export const MAX_RAND_CENTS = 1_000_000;
export const WEEKLY_CAP_MAX = 10_000;

export type WheelMode = "join" | "earned" | "reward_decider";
export type PrizeType = "nothing" | "stamps" | "free_item" | "percent_off" | "amount_off";

export type WheelPrizeInput = {
  label: string;
  weight: number;
  type: PrizeType;
  stamps: number | null;
  percentOff: number | null;
  amountOffCents: number | null;
  /** What the prize is worth to the restaurant, in cents. The reward decider never draws one worth less than the floor. */
  valueCents: number;
  validDays: number | null;
  /** The most times this prize can be won in any 7 days. Empty means no limit. A try again slot never has one. */
  weeklyCap: number | null;
  /** Read only, for the owner screen: how many times it was won in the last 7 days. The server ignores it on save. */
  wonThisWeek?: number;
};

export type WheelSettingsInput = {
  enabled: boolean;
  mode: WheelMode;
  earnEvery: number;
  floorCents: number;
  prizes: WheelPrizeInput[];
};

export const WHEEL_MODES: Array<{ mode: WheelMode; title: string; description: string }> = [
  {
    mode: "join",
    title: "Welcome spin",
    description: "One spin when a guest joins. It always gives something.",
  },
  {
    mode: "earned",
    title: "Earned spins",
    description: "Guests earn one spin every few visits, and may land on a try again.",
  },
  {
    mode: "reward_decider",
    title: "Reward decider",
    description:
      "When a guest earns their card reward, the wheel picks which reward they get. It never picks one worth less than the amount you set.",
  },
];

export const PRIZE_TYPES: Array<{ type: PrizeType; label: string }> = [
  { type: "free_item", label: "Free item" },
  { type: "percent_off", label: "Percent off" },
  { type: "amount_off", label: "Rand off" },
  { type: "stamps", label: "Bonus stamps" },
  { type: "nothing", label: "Try again (no prize)" },
];

export function modeTitle(mode: WheelMode): string {
  return WHEEL_MODES.find((item) => item.mode === mode)?.title ?? mode;
}

export function blankPrize(): WheelPrizeInput {
  return {
    label: "",
    weight: 1,
    type: "free_item",
    stamps: null,
    percentOff: null,
    amountOffCents: null,
    valueCents: 0,
    validDays: null,
    weeklyCap: null,
  };
}

/** What the guest gets, in words: "2 bonus stamps", "10% off", "R20 off", "A free item". */
export function prizeSummary(prize: WheelPrizeInput): string {
  switch (prize.type) {
    case "stamps":
      return `${prize.stamps ?? 1} bonus stamp${prize.stamps === 1 ? "" : "s"}`;
    case "percent_off":
      return `${prize.percentOff ?? 0}% off`;
    case "amount_off":
      return `R${((prize.amountOffCents ?? 0) / 100).toFixed(2).replace(/\.00$/, "")} off`;
    case "free_item":
      return "A free item";
    default:
      return "Nothing, try again";
  }
}

/** Can this prize be drawn on a wheel of this kind? Same rule as spin_prize_eligible in the database. */
export function prizeEligible(prize: WheelPrizeInput, mode: WheelMode, floorCents: number): boolean {
  if (prize.weight <= 0) return false;
  if (mode === "join") return prize.type !== "nothing";
  if (mode === "reward_decider") {
    return (
      (prize.type === "free_item" || prize.type === "percent_off" || prize.type === "amount_off") &&
      prize.valueCents >= floorCents
    );
  }
  return true;
}

const isWhole = (value: number) => Number.isInteger(value);

/** A plain-words problem with the wheel, or null when it can be saved. */
export function validateWheel(input: WheelSettingsInput): string | null {
  if (input.prizes.length > MAX_PRIZES) return `A wheel can have up to ${MAX_PRIZES} prizes.`;
  if (!isWhole(input.earnEvery) || input.earnEvery < EARN_EVERY_MIN || input.earnEvery > EARN_EVERY_MAX) {
    return `Guests can earn a spin every ${EARN_EVERY_MIN} to ${EARN_EVERY_MAX} visits.`;
  }
  if (!isWhole(input.floorCents) || input.floorCents < 0 || input.floorCents > MAX_RAND_CENTS) {
    return "The smallest reward value must be between R0 and R10 000.";
  }
  for (const [index, prize] of input.prizes.entries()) {
    const name = `Prize ${index + 1}`;
    const label = prize.label.trim();
    if (label.length < 1 || label.length > LABEL_LIMIT) {
      return `${name} needs a name of up to ${LABEL_LIMIT} characters.`;
    }
    if (!isWhole(prize.weight) || prize.weight < 0 || prize.weight > WEIGHT_MAX) {
      return `${name} needs a chance between 0 and ${WEIGHT_MAX}.`;
    }
    if (prize.type === "stamps" && !(isWhole(prize.stamps ?? 0) && (prize.stamps ?? 0) >= 1 && (prize.stamps ?? 0) <= 5)) {
      return `${name} can give 1 to 5 bonus stamps.`;
    }
    if (prize.type === "percent_off") {
      const percent = prize.percentOff ?? 0;
      if (!isWhole(percent) || percent < 1 || percent > 100) return `${name} needs a percentage from 1 to 100.`;
    }
    if (prize.type === "amount_off") {
      const amount = prize.amountOffCents ?? 0;
      if (!isWhole(amount) || amount < 1 || amount > MAX_RAND_CENTS) return `${name} needs a rand amount above R0.`;
    }
    if (!isWhole(prize.valueCents) || prize.valueCents < 0 || prize.valueCents > MAX_RAND_CENTS) {
      return `${name} needs a worth between R0 and R10 000.`;
    }
    if (prize.validDays !== null && (!isWhole(prize.validDays) || prize.validDays < 1 || prize.validDays > 365)) {
      return `${name} can be valid for 1 to 365 days, or leave it empty for no expiry.`;
    }
    if (
      prize.type !== "nothing" &&
      prize.weeklyCap !== null &&
      (!isWhole(prize.weeklyCap) || prize.weeklyCap < 1 || prize.weeklyCap > WEEKLY_CAP_MAX)
    ) {
      return `${name} can be won 1 to ${WEEKLY_CAP_MAX} times a week, or leave it empty for no limit.`;
    }
  }
  // Same rule as save_spin_wheel: a switched-on wheel needs a real prize (not a try again) that can be won.
  if (
    input.enabled &&
    !input.prizes.some((prize) => prize.type !== "nothing" && prizeEligible(prize, input.mode, input.floorCents))
  ) {
    return input.mode === "reward_decider"
      ? "Add a real reward worth at least the smallest value you set, with a chance above 0."
      : "Add at least one real prize with a chance above 0 before you switch the wheel on.";
  }
  return null;
}

/** Odds in plain words for the owner: "About 1 spin in 5 wins Free coffee." */
export function oddsLines(input: WheelSettingsInput): string[] {
  const eligible = input.prizes.filter((prize) => prizeEligible(prize, input.mode, input.floorCents));
  const total = eligible.reduce((sum, prize) => sum + prize.weight, 0);
  if (total <= 0) return [];
  return eligible.map((prize) => {
    const name = prize.label.trim() || prizeSummary(prize);
    const lands = prize.type === "nothing";
    const share = prize.weight / total;
    if (share >= 1) return lands ? `Every spin lands on "${name}".` : `Every spin wins ${name}.`;
    if (share > 0.5) {
      const percent = Math.min(99, Math.round(share * 100));
      return lands
        ? `About ${percent} in 100 spins land on "${name}".`
        : `About ${percent} in 100 spins win ${name}.`;
    }
    const n = Math.max(2, Math.round(1 / share));
    return lands ? `About 1 spin in ${n} lands on "${name}".` : `About 1 spin in ${n} wins ${name}.`;
  });
}

/** The weekly limit in words, with how many wins count against it right now. Empty when there is no limit. */
export function limitLine(prize: WheelPrizeInput): string {
  if (prize.type === "nothing" || prize.weeklyCap === null) return "";
  const won = prize.wonThisWeek ?? 0;
  const left = Math.max(0, prize.weeklyCap - won);
  const week = `${prize.weeklyCap} a week`;
  if (left === 0) return `Limit ${week}. All ${prize.weeklyCap} are taken, so this prize is off the wheel until a win is 7 days old.`;
  return `Limit ${week}. Won ${won} in the last 7 days, ${left} left.`;
}

/** The share of spins that win something real, such as "About 3 spins in 4 win a prize." */
export function winChanceLine(input: WheelSettingsInput): string | null {
  const eligible = input.prizes.filter((prize) => prizeEligible(prize, input.mode, input.floorCents));
  const total = eligible.reduce((sum, prize) => sum + prize.weight, 0);
  if (total <= 0) return null;
  const winning = eligible.filter((prize) => prize.type !== "nothing").reduce((sum, prize) => sum + prize.weight, 0);
  if (winning >= total) return "Every spin wins a prize.";
  const percent = Math.round((winning / total) * 100);
  return `About ${percent} in 100 spins win a prize.`;
}

/** The wheel picture needs ids, labels and weights. Guests do not see weights, so their wheel has equal slices. */
export function wheelSegments(
  prizes: ReadonlyArray<{ id: string; label: string; weight?: number }>,
): SpinSegment[] {
  return prizes.map((prize) => ({
    id: prize.id,
    label: prize.label,
    weight: prize.weight ?? 1,
    valueCents: 0,
  }));
}

const REFUSALS: Record<string, string> = {
  not_allowed: "You can't change this wheel.",
  wheel_off: "The wheel is switched off right now.",
  no_spin: "You have no spin to use right now.",
  no_prizes: "This wheel has no prize to give yet. Add a real prize with a chance above 0.",
  too_many_prizes: `A wheel can have up to ${MAX_PRIZES} prizes.`,
  invalid_value: "One of the values is not allowed. Check the prizes and try again.",
  prizes_gone:
    "Every prize has reached its weekly limit, so the wheel is resting. Raise a limit, or wait until a win is 7 days old.",
};

export const WHEEL_REFUSAL_CODES = Object.keys(REFUSALS);

export function wheelErrorMessage(code: string | null): string {
  return (code && REFUSALS[code]) || "Something went wrong. Please try again.";
}

/** What a guest is told about the prize they just won. */
export function winLine(result: {
  label: string;
  prizeType: PrizeType | null;
  bonusStamps: number | null;
  keptAdvertised: boolean;
}): string {
  if (result.keptAdvertised) return "You keep the reward you earned. Nothing on the wheel was better today.";
  if (result.prizeType === "nothing") return "No prize this time. Visit again for another spin.";
  if (result.prizeType === "stamps") {
    const count = result.bonusStamps ?? 0;
    return `${count} bonus stamp${count === 1 ? "" : "s"} added to your card.`;
  }
  return "Your prize is on your card. Show it at the till.";
}
