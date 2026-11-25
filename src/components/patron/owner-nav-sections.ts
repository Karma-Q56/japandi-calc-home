import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Users,
  Gift,
  Megaphone,
  Globe,
  ChartNoAxesColumn,
  Settings,
} from "lucide-react";

export type Item = { to: string; label: string; icon: ComponentType; end?: boolean };

/** The seven owner sections. Older tools keep their URLs and light up their section here. */
export const OWNER_NAV: Item[] = [
  { to: "/app", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/app/customers", label: "Guests", icon: Users },
  { to: "/app/loyalty", label: "Loyalty", icon: Gift },
  { to: "/app/specials", label: "Campaigns", icon: Megaphone },
  { to: "/app/page", label: "Your page", icon: Globe },
  { to: "/app/insights", label: "Insights", icon: ChartNoAxesColumn },
  { to: "/app/settings", label: "Settings", icon: Settings },
];
