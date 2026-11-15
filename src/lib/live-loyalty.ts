export type LiveRewardKind = "free_item" | "percent_off" | "amount_off";

export type LiveLoyaltyInput = {
  stampsRequired: number;
  rewardDescription: string;
  rewardKind: LiveRewardKind;
  rewardPercentOff: number | null;
  rewardAmountOffCents: number | null;
  rewardValidDays: number | null;
  visitWindowMinutes: number;
  welcomeStamp: boolean;
  marketingWeeklyCap: number;
  memberWeeklyCap: number;
};

export function validateLoyaltySettings(input: LiveLoyaltyInput) {
  if (!Number.isInteger(input.stampsRequired) || input.stampsRequired < 2 || input.stampsRequired > 30) {
    return { ok: false as const, message: "Stamps needed must be a whole number from 2 to 30." };
  }
  const reward = input.rewardDescription.trim();
  if (reward.length < 1 || reward.length > 120) {
    return { ok: false as const, message: "The reward must be 1 to 120 characters." };
  }
  if (input.rewardKind === "percent_off") {
    const percent = input.rewardPercentOff;
    if (percent === null || !Number.isInteger(percent) || percent < 1 || percent > 100) {
      return { ok: false as const, message: "The percentage off must be a whole number from 1 to 100." };
    }
    if (input.rewardAmountOffCents !== null) {
      return { ok: false as const, message: "A percentage reward cannot also have a rand amount." };
    }
  } else if (input.rewardKind === "amount_off") {
    const cents = input.rewardAmountOffCents;
    if (cents === null || !Number.isInteger(cents) || cents <= 0) {
      return { ok: false as const, message: "The rand amount off must be more than R0." };
    }
    if (input.rewardPercentOff !== null) {
      return { ok: false as const, message: "A rand reward cannot also have a percentage." };
    }
  } else if (input.rewardKind === "free_item") {
    if (input.rewardPercentOff !== null || input.rewardAmountOffCents !== null) {
      return { ok: false as const, message: "A free item reward cannot have a discount value." };
    }
  } else {
    return { ok: false as const, message: "Choose free item, percentage off or rand off." };
  }
  if (
    input.rewardValidDays !== null &&
    (!Number.isInteger(input.rewardValidDays) || input.rewardValidDays < 1 || input.rewardValidDays > 365)
  ) {
    return { ok: false as const, message: "Rewards must be valid for 1 to 365 days, or no limit." };
  }
  if (
    !Number.isInteger(input.visitWindowMinutes) ||
    input.visitWindowMinutes < 0 ||
    input.visitWindowMinutes > 1440
  ) {
    return { ok: false as const, message: "The visit window must be 0 to 1440 minutes." };
  }
  if (
    !Number.isInteger(input.marketingWeeklyCap) ||
    input.marketingWeeklyCap < 0 ||
    input.marketingWeeklyCap > 14
  ) {
    return { ok: false as const, message: "The SMS weekly cap must be 0 to 14." };
  }
  if (
    !Number.isInteger(input.memberWeeklyCap) ||
    input.memberWeeklyCap < 0 ||
    input.memberWeeklyCap > 14
  ) {
    return { ok: false as const, message: "The member message cap must be 0 to 14." };
  }
  return { ok: true as const, reward };
}
