import { type ComponentType, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Gift,
  Tag,
  Globe,
  ChartNoAxesColumn,
  Settings,
} from "lucide-react";

type Item = { to: string; label: string; icon: ComponentType; end?: boolean };

/** The seven owner sections. Older tools keep their URLs and light up their section here. */
export const OWNER_NAV: Item[] = [
  { to: "/app", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/app/customers", label: "Guests", icon: Users },
  { to: "/app/loyalty", label: "Loyalty", icon: Gift },
  { to: "/app/specials", label: "Offers", icon: Tag },
  { to: "/app/page", label: "Your page", icon: Globe },
  { to: "/app/insights", label: "Insights", icon: ChartNoAxesColumn },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

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
export function OwnerMobileNav({ venueSwitcher }: { venueSwitcher?: ReactNode } = {}) {
  const active = useActive();
  return (
    <div className="ox-mobile-wrap">
      <nav className="ox-mobile-nav" aria-label="Owner sections">
        {OWNER_NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`ox-mobile-link${active(item) ? " is-active" : ""}`}
            aria-current={active(item) ? "page" : undefined}
          >
            <item.icon />
            {item.label}
          </Link>
        ))}
      </nav>
      {venueSwitcher ? <div className="ox-mobile-venue">{venueSwitcher}</div> : null}
    </div>
  );
}
