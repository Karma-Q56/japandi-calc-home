// Pure rules for the live loyalty tools (double stamp day, visit streak, monthly
// bonus budget, birthday and mystery rewards, guest tiers). Same limits as the
// demo in src/domain/tools.ts and src/domain/loyalty.ts.

export type LiveToolsInput = {
  doubleStampEnabled: boolean;
  doubleStampWeekday: number;
  streakEnabled: boolean;
  streakWeeks: number;
  streakWeeklyVisits: number;
  streakBonusStamps: number;
  toolStampBudget: number;
  birthdayReward: boolean;
  birthdayRewardKind: "stamp" | "freeItem";
  birthdayRewardItem: string;
  mysteryEveryVisits: number;
};

export type LiveTiersInput = {
  regular: number;
  vip: number;
};

export type ValidResult<T> = { ok: true; value: T } | { ok: false; message: string };

const isInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

export function validateTools(input: LiveToolsInput): ValidResult<LiveToolsInput> {
  if (!isInt(input.doubleStampWeekday) || input.doubleStampWeekday < 0 || input.doubleStampWeekday > 6) {
    return { ok: false, message: "Pick a weekday between Sunday and Saturday." };
  }
  if (!isInt(input.streakWeeks) || input.streakWeeks < 2 || input.streakWeeks > 12) {
    return { ok: false, message: "Streak runs must be between 2 and 12 weeks." };
  }
  if (!isInt(input.streakWeeklyVisits) || input.streakWeeklyVisits < 1 || input.streakWeeklyVisits > 7) {
    return { ok: false, message: "Weekly visits must be between 1 and 7." };
  }
  if (!isInt(input.streakBonusStamps) || input.streakBonusStamps < 1 || input.streakBonusStamps > 5) {
    return { ok: false, message: "Streak bonus stamps must be between 1 and 5." };
  }
  const anyBonus = input.doubleStampEnabled || input.streakEnabled;
  if (
    anyBonus &&
    (!isInt(input.toolStampBudget) || input.toolStampBudget < 1 || input.toolStampBudget > 2000)
  ) {
    return { ok: false, message: "Set the monthly bonus stamp budget between 1 and 2000." };
  }
  if (!isInt(input.toolStampBudget) || input.toolStampBudget < 0 || input.toolStampBudget > 2000) {
    return { ok: false, message: "The monthly bonus stamp budget must be between 0 and 2000." };
  }
  if (input.birthdayRewardKind !== "stamp" && input.birthdayRewardKind !== "freeItem") {
    return { ok: false, message: "Pick a birthday reward." };
  }
  const item = input.birthdayRewardItem.trim();
  if (item.length > 80) {
    return { ok: false, message: "Keep the birthday item under 80 characters." };
  }
  if (!isInt(input.mysteryEveryVisits) || input.mysteryEveryVisits < 0 || input.mysteryEveryVisits > 50) {
    return { ok: false, message: "The mystery reward must be every 0 to 50 visits." };
  }
  return { ok: true, value: { ...input, birthdayRewardItem: item } };
}

export function validateTiers(input: LiveTiersInput): ValidResult<LiveTiersInput> {
  if (!isInt(input.regular) || input.regular < 1 || input.regular > 100) {
    return { ok: false, message: "Regular needs between 1 and 100 visits." };
  }
  if (!isInt(input.vip) || input.vip < 2 || input.vip > 200) {
    return { ok: false, message: "VIP needs between 2 and 200 visits." };
  }
  if (input.vip <= input.regular) {
    return { ok: false, message: "VIP must need more visits than Regular." };
  }
  return { ok: true, value: input };
}

/** One line for the guest card, same wording as the demo. */
export function doubleDayLine(enabled: boolean, weekdayName: string): string | null {
  return enabled
    ? `Double stamp day: every ${weekdayName}. A visit that day earns one extra stamp.`
    : null;
}

/** Budget text for the owner: how much of this month's budget is spent. */
export function budgetLine(cap: number, used: number): string {
  if (cap <= 0) return "No monthly limit on bonus stamps.";
  const left = Math.max(0, cap - used);
  return `${used} of ${cap} bonus stamps used this month, ${left} left.`;
}
