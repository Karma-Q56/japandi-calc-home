export type LoyaltyTabId = "rewards" | "tools" | "challenges" | "referrals" | "tiers" | "wheel";

/** The tabs that live on the Loyalty page itself. Challenges and Referrals are their own pages. */
export type LoyaltyPageTab = Exclude<LoyaltyTabId, "challenges" | "referrals">;

export const LOYALTY_PAGE_TABS: readonly LoyaltyPageTab[] = ["rewards", "tools", "tiers", "wheel"];

export const LOYALTY_TAB_LABELS: ReadonlyArray<{ id: LoyaltyTabId; label: string }> = [
  { id: "rewards", label: "Stamp card" },
  { id: "tools", label: "Rewards" },
  { id: "challenges", label: "Challenges" },
  { id: "referrals", label: "Referrals" },
  { id: "tiers", label: "Tiers" },
  { id: "wheel", label: "Spin" },
];
