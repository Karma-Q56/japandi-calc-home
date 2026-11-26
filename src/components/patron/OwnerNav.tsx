import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Ellipsis } from "lucide-react";
import { OWNER_NAV, type Item } from "./owner-nav-sections";
import { SectionTabs } from "./kit/SectionTabs";

/** Tool URL prefix -> the section it belongs to. Longest prefix wins. */
const SECTION_OF: Array<[prefix: string, to: string]> = [
  ["/app/lists", "/app/customers"],
  ["/app/challenges", "/app/loyalty"],
  ["/app/referrals", "/app/loyalty"],
  ["/app/design", "/app/page"],
  ["/app/menu", "/app/page"],
  ["/app/qr", "/app/page"],
  ["/app/campaigns", "/app/specials"],
  ["/app/credit", "/app/specials"],
  ["/app/reports", "/app/insights"],
  ["/app/team", "/app/settings"],
  ["/app/feedback", "/app/settings"],
  ["/app/audit", "/app/settings"],
  ["/app/locations", "/app/settings"],
  ["/app/billing", "/app/settings"],
];

function sectionFor(path: string): string | null {
  const clean = path.replace(/\/$/, "") || "/app";
  if (clean === "/app") return "/app";
  for (const [prefix, to] of SECTION_OF) {
    if (clean === prefix || clean.startsWith(`${prefix}/`)) return to;
  }
  for (const item of OWNER_NAV) {
    if (!item.end && (clean === item.to || clean.startsWith(`${item.to}/`))) return item.to;
  }
  return null;
}

function useActive() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const section = sectionFor(path);
  return (item: Item) => section === item.to;
}

export function OwnerSideNav() {
  const active = useActive();
  return (
    <nav className="ox-nav" aria-label="Owner sections">
      {OWNER_NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={`ox-link${active(item) ? " is-active" : ""}`}
          aria-current={active(item) ? "page" : undefined}
        >
          <item.icon />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
/** Phone: only the venue switcher sits at the top. The sections live in the bottom bar. */
export function OwnerMobileNav({ venueSwitcher }: { venueSwitcher?: ReactNode } = {}) {
  return venueSwitcher ? (
    <div className="ox-mobile-wrap">
      <div className="ox-mobile-venue">{venueSwitcher}</div>
    </div>
  ) : null;
}

const PRIMARY = OWNER_NAV.slice(0, 4);
const MORE = OWNER_NAV.slice(4);

/** Phone bottom bar: four main sections and a More sheet for the rest. */
export function OwnerTabs() {
  const active = useActive();
  const [open, setOpen] = useState(false);
  const moreActive = MORE.some(active);
  return (
    <>
      <nav className="ox-tabs" aria-label="Owner sections">
        {PRIMARY.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`ox-tab${active(item) ? " is-active" : ""}`}
            aria-current={active(item) ? "page" : undefined}
          >
            <item.icon />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          className={`ox-tab${moreActive ? " is-active" : ""}`}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <Ellipsis />
          More
        </button>
      </nav>
      {open && (
        <div
          className="ox-more"
          role="dialog"
          aria-label="More sections"
          onClick={() => setOpen(false)}
        >
          <div className="ox-more-sheet" onClick={(event) => event.stopPropagation()}>
            {MORE.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`ox-link${active(item) ? " is-active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <item.icon />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Pages that belong together. Shown as tabs under the header so nothing is hidden. */
const SECTION_TABS: Record<string, Array<{ to: string; label: string }>> = {
  "/app/page": [
    { to: "/app/page", label: "Page" },
    { to: "/app/menu", label: "Menu" },
    { to: "/app/design", label: "Card design" },
    { to: "/app/qr", label: "QR codes" },
  ],
  "/app/settings": [
    { to: "/app/settings", label: "Details" },
    { to: "/app/team", label: "Team" },
    { to: "/app/locations", label: "Branches" },
    { to: "/app/feedback", label: "Feedback" },
    { to: "/app/audit", label: "Activity log" },
    { to: "/app/billing", label: "Plan and billing" },
  ],
  "/app/insights": [
    { to: "/app/insights", label: "Insights" },
    { to: "/app/reports", label: "Reports" },
  ],
  // Loyalty is not listed here. Its Loyalty, Challenges and Referrals pages share one
  // tab bar (LoyaltyTabs) inside the page, so a second bar above would repeat it.
};

/** Live reports sit on the Performance tab of Insights, so live has no separate Reports page. */
const DEMO_ONLY_TABS = new Set(["/app/reports"]);

export function OwnerSectionTabs({ live = false }: { live?: boolean }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const clean = path.replace(/\/$/, "") || "/app";
  const section = sectionFor(clean);
  const all = section ? SECTION_TABS[section] : undefined;
  const tabs = live ? all?.filter((tab) => !DEMO_ONLY_TABS.has(tab.to)) : all;
  // A bar with one tab has nowhere to go.
  if (!tabs || tabs.length < 2) return null;
  return (
    <SectionTabs
      tabs={tabs.map((tab) => ({ id: tab.to, href: tab.to, label: tab.label }))}
      active={clean}
      label="In this section"
      className="section-tabs--page"
    />
  );
}
