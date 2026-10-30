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
