import { Link } from "@tanstack/react-router";
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
  return (
    <nav className="loyalty-tabs" aria-label="Loyalty sections">
      {LOYALTY_TAB_LABELS.map((item) => {
        const className = `loyalty-tab${active === item.id ? " is-active" : ""}`;
        const current = active === item.id ? ("page" as const) : undefined;
        if (item.id === "challenges") {
          return (
            <Link key={item.id} to="/app/challenges" className={className} aria-current={current}>
              {item.label}
            </Link>
          );
        }
        if (item.id === "referrals") {
          return (
            <Link key={item.id} to="/app/referrals" className={className} aria-current={current}>
              {item.label}
            </Link>
          );
        }
        const pageTab = item.id;
        if (onSelect) {
          return (
            <button
              key={item.id}
              type="button"
              className={className}
              aria-current={current}
              onClick={() => onSelect(pageTab)}
            >
              {item.label}
            </button>
          );
        }
        return (
          <Link
            key={item.id}
            to="/app/loyalty"
            search={{ tab: pageTab }}
            className={className}
            aria-current={current}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
