import { SectionTabs, type SectionTab } from "@/components/patron/kit/SectionTabs";
import { LOYALTY_TAB_LABELS, type LoyaltyPageTab, type LoyaltyTabId } from "@/lib/loyalty-tabs";

/**
 * One tab bar for the whole Loyalty area. It is shown on the Loyalty page and on the
 * Challenges and Referrals pages, so moving between them looks like switching a tab
 * and not like leaving the section. On the Loyalty page pass onSelect so the page tabs
 * switch in place; on the other pages leave it out and they link back to Loyalty.
 */
export function LoyaltyTabs({
  active,
  onSelect,
}: {
  active: LoyaltyTabId;
  onSelect?: (tab: LoyaltyPageTab) => void;
}) {
  const tabs: Array<SectionTab<LoyaltyTabId>> = LOYALTY_TAB_LABELS.map((item) => {
    if (item.id === "challenges") return { ...item, href: "/app/challenges" };
    if (item.id === "referrals") return { ...item, href: "/app/referrals" };
    if (onSelect) return { ...item };
    return { ...item, href: "/app/loyalty", search: { tab: item.id } };
  });
  return (
    <SectionTabs
      tabs={tabs}
      active={active}
      label="Loyalty sections"
      className="section-tabs--inline"
      onSelect={(id) => onSelect?.(id as LoyaltyPageTab)}
    />
  );
}
