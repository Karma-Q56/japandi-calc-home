export type LiveLoyaltyInput = {
  stampsRequired: number;
  rewardDescription: string;
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
