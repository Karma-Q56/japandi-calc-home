import { type ComponentType, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  List,
  ChartNoAxesColumn,
  TrendingUp,
  Gift,
  Megaphone,
  Tag,
  Wallet,
  UserCog,
  UtensilsCrossed,
  QrCode,
  ScrollText,
  Settings,
  UsersRound,
  Palette,
  Target,
  Globe,
  MessageSquareText,
} from "lucide-react";

type Item = { to: string; label: string; icon: ComponentType; end?: boolean };

export const OWNER_NAV: Item[] = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/insights", label: "Insights", icon: ChartNoAxesColumn },
  { to: "/app/reports", label: "Reports", icon: TrendingUp },
  { to: "/app/customers", label: "Customers", icon: Users },
  { to: "/app/referrals", label: "Bring a friend", icon: UsersRound },
  { to: "/app/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/app/specials", label: "Specials", icon: Tag },
  { to: "/app/credit", label: "Credit", icon: Wallet },
  { to: "/app/loyalty", label: "Loyalty card", icon: Gift },
  { to: "/app/challenges", label: "Challenges", icon: Target },
  { to: "/app/design", label: "Card design", icon: Palette },
  { to: "/app/page", label: "Public page", icon: Globe },
  { to: "/app/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/app/qr", label: "QR codes", icon: QrCode },
  { to: "/app/team", label: "Team", icon: UserCog },
  { to: "/app/feedback", label: "Feedback", icon: MessageSquareText },
  { to: "/app/audit", label: "Activity log", icon: ScrollText },
  { to: "/app/settings", label: "Settings", icon: Settings },
  { to: "/app/lists", label: "Lists", icon: List },
];

function useActive() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (item: Item) => (item.end ? path === item.to : path.startsWith(item.to));
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
