/** Reward copy is stored as a noun phrase ("a free coffee"). */
export function rewardProgress(stampsLeft: number, reward: string): string {
  return `${stampsLeft} more stamp${stampsLeft === 1 ? "" : "s"} to ${reward}`;
}

export function rewardEarned(reward: string): string {
  return `You've earned ${reward}`;
}

export function rewardJoinPitch(reward: string): string {
  return `Collect stamps and get ${reward}`;
}

export function rewardPosterLine(restaurantName: string, reward: string): string {
  return `Join the regulars at ${restaurantName}, collect stamps and get ${reward}.`;
}

export type RewardKind = "free_item" | "percent_off" | "amount_off";

export type RewardValue = {
  kind: RewardKind;
  description: string;
  percentOff?: number | null;
  amountOffCents?: number | null;
};

/** Rand amount, as South African shops write it: R20, R20.50. Cents are shown only when needed. */
export function formatRand(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const rest = Math.abs(cents % 100);
  return rest === 0 ? `R${whole}` : `R${whole}.${String(rest).padStart(2, "0")}`;
}

/** The exact sentence staff must act on. Free items use the owner's own description. */
export function rewardGiveLine(reward: RewardValue): string {
  if (reward.kind === "percent_off") {
    return `Take ${reward.percentOff ?? 0}% off the bill`;
  }
  if (reward.kind === "amount_off") {
    return `Take ${formatRand(reward.amountOffCents ?? 0)} off the bill`;
  }
  return `Give: ${reward.description}`;
}

/** Guest card wording for an available reward, with an optional expiry date label. */
export function rewardGuestLine(reward: RewardValue, useBy?: string | null): string {
  const base =
    reward.kind === "percent_off"
      ? `${reward.percentOff ?? 0}% off your bill`
      : reward.kind === "amount_off"
        ? `${formatRand(reward.amountOffCents ?? 0)} off your bill`
        : reward.description;
  return useBy ? `${base}. Use by ${useBy}` : base;
}

/** Count label for reward wording, e.g. "1 reward" or "2 rewards". */
export function rewardCountLabel(count: number): string {
  return count === 1 ? "1 reward" : `${count} rewards`;
}
