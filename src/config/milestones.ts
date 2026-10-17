export type MilestoneState = "Built" | "Placeholder" | "Planned";

export interface StatusScreen {
  path: string;
  label: string;
  state: MilestoneState;
  description: string;
  open: string;
}

export interface MilestoneStatus {
  id: string;
  title: string;
  state: MilestoneState;
  summary: string;
  screens: StatusScreen[];
}

export const MILESTONE_STATUS: MilestoneStatus[] = [
  {
    id: "M0",
    title: "M0 — Demo foundation",
    state: "Built",
    summary: "Seeded demo data, clock, roles, and fake SMS outbox.",
    screens: [
      {
        path: "/demo",
        label: "Demo hub",
        state: "Built",
        description: "Six tunnels with one-click demo sign-in.",
        open: "/demo",
      },
      {
        path: "/demo/status",
        label: "Progress and demo guide",
        state: "Built",
        description: "Every milestone and screen with open links.",
        open: "/demo/status",
      },
      {
        path: "/demo/outbox",
        label: "SMS outbox",
        state: "Built",
        description: "Fake provider, delivery simulation, STOP handling.",
        open: "/demo/as/operator?to=/demo/outbox",
      },
    ],
  },
  {
    id: "M2",
    title: "M2 — Restaurants, pages, menus, QR",
    state: "Built",
    summary: "Operator console, public pages, menu editor, QR print pack.",
    screens: [
      {
        path: "/ops/restaurants",
        label: "Operator console",
        state: "Built",
        description: "List, create, edit, themes, menus.",
        open: "/demo/as/operator?to=/ops/restaurants",
      },
      {
        path: "/r/daily-grind",
        label: "Public restaurant page",
        state: "Built",
        description: "Hero, hours, menu, specials, join CTA.",
        open: "/r/daily-grind",
      },
      {
        path: "/app/menu",
        label: "Owner menu editor",
        state: "Built",
        description: "Sections, items, specials.",
        open: "/demo/as/owner?restaurant=rest-daily-grind&to=/app/menu",
      },
      {
        path: "/app/qr",
        label: "QR print pack",
        state: "Built",
        description: "A5 table card, till sticker, poster.",
        open: "/demo/as/owner?restaurant=rest-daily-grind&to=/app/qr",
      },
    ],
  },
  {
    id: "M3",
    title: "M3 — Guest join, cards, consent",
    state: "Built",
    summary: "Join flow, loyalty cards, consent history, opt-out links.",
    screens: [
      {
        path: "/r/daily-grind/join",
        label: "Guest join",
        state: "Built",
        description: "Details, consent, verification, welcome stamp.",
        open: "/r/daily-grind/join",
      },
      {
        path: "/r/daily-grind/card",
        label: "Loyalty card",
        state: "Built",
        description: "Slots, rewards, offers, member QR.",
        open: "/demo/as/guest?customer=customer-1&to=/r/daily-grind/card",
      },
      {
        path: "/me",
        label: "My cards",
        state: "Built",
        description: "Cards sorted by rewards and recent visits.",
        open: "/demo/as/guest?customer=customer-1&to=/me",
      },
      {
        path: "/me/settings",
        label: "Settings and data",
        state: "Built",
        description: "Profile, consents, export, anonymise.",
        open: "/demo/as/guest?customer=customer-1&to=/me/settings",
      },
    ],
  },
  {
    id: "M4",
    title: "M4 — Staff till",
    state: "Built",
    summary: "Pair device, PIN, stamp, undo, redeem, audit.",
    screens: [
      {
        path: "/stamp",
        label: "Staff till",
        state: "Built",
        description: "Pairing, PIN keypad, lookup, Add stamp, undo, redeem.",
        open: "/demo/as/staff?staff=staff-1&to=/stamp",
      },
      {
        path: "/app/team",
        label: "Team and PINs",
        state: "Built",
        description: "Add staff, HMAC PIN issue, pairing codes.",
        open: "/demo/as/owner?restaurant=rest-daily-grind&to=/app/team",
      },
      {
        path: "/app/audit",
        label: "Audit log",
        state: "Built",
        description: "Filterable sign-in, stamp, undo, redeem events.",
        open: "/demo/as/owner?restaurant=rest-daily-grind&to=/app/audit",
      },
    ],
  },
  {
    id: "M5",
    title: "M5 — Owner dashboard",
    state: "Built",
    summary: "Overview, guests, loyalty, settings, team, audit.",
    screens: [
      {
        path: "/app",
        label: "Owner dashboard",
        state: "Built",
        description: "Overview stats, 8-week chart, last campaign.",
        open: "/demo/as/owner?restaurant=rest-daily-grind&to=/app",
      },
      {
        path: "/app/customers",
        label: "Customers",
        state: "Built",
        description: "Search, lapsed filters, profiles, CSV export.",
        open: "/demo/as/owner?restaurant=rest-daily-grind&to=/app/customers",
      },
      {
        path: "/app/loyalty",
        label: "Loyalty rules",
        state: "Built",
        description: "Threshold, reward text, window, live preview.",
        open: "/demo/as/owner?restaurant=rest-daily-grind&to=/app/loyalty",
      },
      {
        path: "/app/settings",
        label: "Settings",
        state: "Built",
        description: "Business, SMS sender, weekly caps, contact.",
        open: "/demo/as/owner?restaurant=rest-daily-grind&to=/app/settings",
      },
    ],
  },
  {
    id: "M6",
    title: "M6 — Credit and SMS",
    state: "Planned",
    summary: "Top-ups, cost settlement, delivery webhooks.",
    screens: [],
  },
  {
    id: "M7",
    title: "M7 — Campaigns",
    state: "Planned",
    summary: "Composer, preview, cost estimate, results.",
    screens: [],
  },
  {
    id: "M8",
    title: "M8 — PWA and push",
    state: "Planned",
    summary: "Install sheet, offline till, push notifications.",
    screens: [],
  },
  {
    id: "M9",
    title: "M9 — Real backend",
    state: "Planned",
    summary: "Real database, login, SMS, deploy.",
    screens: [],
  },
];
