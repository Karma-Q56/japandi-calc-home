import { createFileRoute, Link } from "@tanstack/react-router";
import { withChildren } from "@/lib/nested";
import { useDemoState } from "@/data/useDemoState";
import { demoRepo } from "@/data/repo";
import { api } from "@/api";
import { APP_NAME } from "@/config/app";
import {
  CreditCard,
  Stamp,
  LayoutDashboard,
  Megaphone,
  Wallet,
  UtensilsCrossed,
  QrCode,
  Palette,
  Building2,
  MessageSquareText,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

const DemoPage = withChildren(DemoHub);
export const Route = createFileRoute("/demo")({ component: DemoPage });

type Tunnel = { label: string; description: string; href: string; icon: LucideIcon };
type Group = { person: string; blurb: string; tunnels: Tunnel[] };

function DemoHub() {
  const state = useDemoState();
  const cafe = state.restaurants[0]!;
  const guest = state.customers[0]!;
  const staff = state.staff[0]!;
  const owner = (to: string) => `/demo/as/owner?restaurant=${cafe.id}&to=${to}`;
  const groups: Group[] = [
    {
      person: "A guest",
      blurb: "Scans a QR in the restaurant and collects stamps on their phone.",
      tunnels: [
        {
          label: "Join a card",
          description: "The join flow a new guest sees after scanning.",
          href: `/demo/as/guest?restaurant=${cafe.id}&to=/r/daily-grind/join`,
          icon: UserPlus,
        },
        {
          label: "My cards",
          description: "Every card one guest holds, with progress.",
          href: `/demo/as/guest?customer=${guest.id}&to=/me`,
          icon: CreditCard,
        },
      ],
    },
    {
      person: "Staff at the till",
      blurb: "Confirms a stamp in a few seconds, one-handed.",
      tunnels: [
        {
          label: "Staff till",
          description: "Pair, PIN in, stamp, undo and redeem. PINs: 1234, 2345, 3456.",
          href: `/demo/as/staff?staff=${staff.id}&to=/stamp`,
          icon: Stamp,
        },
      ],
    },
    {
      person: "A restaurant owner",
      blurb: "Sees who comes back and sends offers to the ones who stopped.",
      tunnels: [
        { label: "Dashboard", description: "Your week at a glance.", href: owner("/app"), icon: LayoutDashboard },
        { label: "Customers", description: "Search, filters and profiles.", href: owner("/app/customers"), icon: Users },
        { label: "Send an offer", description: "Write, cost and send an SMS campaign.", href: owner("/app/campaigns/new"), icon: Megaphone },
        { label: "Credit", description: "Balance, top-ups and ledger.", href: owner("/app/credit"), icon: Wallet },
        { label: "Menu", description: "Sections, items and specials.", href: owner("/app/menu"), icon: UtensilsCrossed },
        { label: "QR codes", description: "Table cards, till sticker and poster.", href: owner("/app/qr"), icon: QrCode },
      ],
    },
    {
      person: "Us, the operator",
      blurb: "Sets restaurants up and gives each one its own look.",
      tunnels: [
        {
          label: "Restaurants",
          description: "Every venue, plan and balance.",
          href: "/demo/as/operator?to=/ops/restaurants",
          icon: Building2,
        },
        {
          label: "Design a restaurant's look",
          description: "Colours, stamps and card style with a live phone preview.",
          href: `/demo/as/operator?to=/ops/restaurants/${cafe.id}/look`,
          icon: Palette,
        },
        {
          label: "SMS outbox",
          description: "See demo messages and simulate delivery.",
          href: "/demo/as/operator?to=/demo/outbox",
          icon: MessageSquareText,
        },
      ],
    },
  ];
  return (
    <main className="dh">
      <header className="dh-head">
        <Link to="/" className="dh-brand">
          {APP_NAME.toLowerCase()}
          <span>.</span>
        </Link>
        <span className="dh-tag">Product preview · demo data</span>
      </header>
      <h1>See {APP_NAME} through everyone’s eyes.</h1>
      <p className="dh-intro">
        Pick a person and you’re signed in as them. Nothing here is real: no login, database or
        SMS, and everything lives in this browser.
      </p>
      {groups.map((group) => (
        <section key={group.person} className="dh-group">
          <div className="dh-group-head">
            <h2>{group.person}</h2>
            <p>{group.blurb}</p>
          </div>
          <div className="dh-grid">
            {group.tunnels.map((item) => (
              <a key={item.label} href={item.href} className="dh-tile">
                <item.icon />
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
      <div className="dh-actions">
        <button onClick={() => demoRepo.reset()}>Reset demo data</button>
        <button onClick={() => api.demo.loadBusyWeek()}>Load a busy week</button>
        <Link to="/demo/status">What’s built</Link>
      </div>
    </main>
  );
}
