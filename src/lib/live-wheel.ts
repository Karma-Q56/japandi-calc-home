// Pure helpers for the live spin wheel (D12d). No database, no server code.

export type WheelMode = "join" | "earned" | "reward_decider";
export type PrizeType = "stamps" | "free_item" | "percent_off" | "amount_off";

export const MAX_PRIZES = 8;

export type PrizeInput = {
  label: string;
  weight: number;
  rewardType: PrizeType;
  bonusStamps: number | null;
  rewardItem: string;
  percentOff: number | null;
  amountOffCents: number | null;
  validDays: number | null;
};

export type WheelInput = {
  enabled: boolean;
  mode: WheelMode;
  earnEveryVisits: number;
  prizes: PrizeInput[];
};

const MODES: WheelMode[] = ["join", "earned", "reward_decider"];

/** The plain sentence the owner reads: the chance of each prize, in whole-number percentages. */
export function probabilitySentence(prizes: { label: string; weight: number }[]): string {
  const total = prizes.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  if (prizes.length === 0 || total <= 0) return "Add at least one prize to see the chances.";
  const parts = prizes.map((p) => {
    const pct = Math.round((Math.max(0, p.weight) / total) * 100);
    return `${p.label.trim() || "Untitled prize"} ${pct}%`;
  });
  return `Each spin: ${parts.join(", ")}.`;
}

/** Returns a list of plain-language problems. An empty list means the wheel can be saved. */
export function validateWheel(input: WheelInput): string[] {
  const problems: string[] = [];
  if (!MODES.includes(input.mode)) problems.push("Pick how guests get spins.");
  if (!Number.isInteger(input.earnEveryVisits) || input.earnEveryVisits < 1 || input.earnEveryVisits > 100) {
    problems.push("A spin is earned every 1 to 100 visits.");
  }
  if (input.prizes.length > MAX_PRIZES) problems.push(`Use at most ${MAX_PRIZES} prizes.`);
  if (input.enabled && input.prizes.length === 0) problems.push("Add at least one prize before you turn the wheel on.");

  input.prizes.forEach((p, i) => {
    const n = i + 1;
    if (!p.label.trim()) problems.push(`Prize ${n} needs a name guests can read.`);
    if (!Number.isInteger(p.weight) || p.weight < 1 || p.weight > 1000) {
      problems.push(`Prize ${n} needs a chance weight from 1 to 1000.`);
    }
    if (p.validDays !== null && (!Number.isInteger(p.validDays) || p.validDays < 1 || p.validDays > 365)) {
      problems.push(`Prize ${n} must stay valid for 1 to 365 days, or forever.`);
    }
    switch (p.rewardType) {
      case "stamps":
        if (p.bonusStamps === null || !Number.isInteger(p.bonusStamps) || p.bonusStamps < 1 || p.bonusStamps > 5) {
          problems.push(`Prize ${n} must add 1 to 5 stamps.`);
        }
        break;
      case "free_item":
        if (!p.rewardItem.trim()) problems.push(`Prize ${n} needs the free item's name.`);
        break;
      case "percent_off":
        if (p.percentOff === null || !Number.isInteger(p.percentOff) || p.percentOff < 1 || p.percentOff > 100) {
          problems.push(`Prize ${n} must be between 1% and 100% off.`);
        }
        break;
      case "amount_off":
        if (p.amountOffCents === null || !Number.isInteger(p.amountOffCents) || p.amountOffCents <= 0) {
          problems.push(`Prize ${n} must take a rand amount off.`);
        }
        break;
    }
  });
  return problems;
}

const ERRORS: Record<string, string> = {
  too_many_prizes: "A wheel can have at most 8 prizes.",
  not_a_member: "We could not find your membership here. Sign in again.",
  not_allowed: "You can only spin at this restaurant.",
  no_spin: "You have no spins left. Visit to earn another.",
  no_prizes: "This wheel has no prizes yet.",
  not_allowed_owner: "Only the owner or a manager can change the wheel.",
};

/** Turns a database refusal code into a message a guest or owner can read. */
export function wheelErrorMessage(code: string | null | undefined): string {
  if (code && ERRORS[code]) return ERRORS[code];
  return "Something went wrong. Please try again.";
}

export const WHEEL_MODE_LABELS: Record<WheelMode, string> = {
  join: "A spin when a guest joins",
  earned: "A spin for every set number of visits",
  reward_decider: "Spins decided by the reward rules",
};
