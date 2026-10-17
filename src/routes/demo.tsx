import { createFileRoute } from "@tanstack/react-router";
import { withChildren } from "@/lib/nested";
import { useDemoState } from "@/data/useDemoState";
import { demoRepo } from "@/data/repo";
import { api } from "@/api";
import { APP_NAME } from "@/config/app";

const DemoPage = withChildren(DemoHub);
export const Route = createFileRoute("/demo")({ component: DemoPage });

function DemoHub() {
  const state = useDemoState();
  const cafe = state.restaurants[0]!;
  const guest = state.customers[0]!;
  const staff = state.staff[0]!;
  const groups = [
    {
      person: "Guest",
      tunnels: [
        {
          label: "Join as a new guest",
          description: "Open the demo join flow for The Daily Grind.",
          href: `/demo/as/guest?restaurant=${cafe.id}&to=/r/daily-grind/join`,
          badge: null as string | null,
        },
        {
          label: "My cards as Thandi",
          description: "See loyalty cards linked to one guest.",
          href: `/demo/as/guest?customer=${guest.id}&to=/me`,
          badge: null,
        },
      ],
    },
    {
      person: "Staff",
      tunnels: [
        {
          label: "Staff till · The Daily Grind",
          description: "Pair, PIN, stamp, undo, redeem (M4).",
          href: `/demo/as/staff?staff=${staff.id}&to=/stamp`,
          badge: "Coming in a later milestone",
        },
      ],
    },
    {
      person: "Owner",
      tunnels: [
        {
          label: "Owner dashboard · The Daily Grind",
          description: "Overview, guests, loyalty, team, settings.",
          href: `/demo/as/owner?restaurant=${cafe.id}&to=/app`,
          badge: null,
        },
        {
          label: "Menu editor",
          description: "Sections, items, specials.",
          href: `/demo/as/owner?restaurant=${cafe.id}&to=/app/menu`,
          badge: null,
        },
        {
          label: "QR print pack",
          description: "Table card, till sticker, poster.",
          href: `/demo/as/owner?restaurant=${cafe.id}&to=/app/qr`,
          badge: null,
        },
      ],
    },
    {
      person: "Operator",
      tunnels: [
        {
          label: "Operator console",
          description: "Manage demo restaurants, themes and menus.",
          href: "/demo/as/operator?to=/ops/restaurants",
          badge: null,
        },
        {
          label: "SMS outbox",
          description: "Inspect demo messages and simulate delivery.",
          href: "/demo/as/operator?to=/demo/outbox",
          badge: null,
        },
      ],
    },
  ];
  const accounts = [
    {
      name: "Thandi (guest)",
      role: "Guest",
      can: "Join, collect stamps, manage consents.",
      href: `/demo/as/guest?customer=${guest.id}&to=/me`,
    },
    {
      name: `${staff.displayName} (staff)`,
      role: "Staff",
      can: "Stamp, undo, redeem once M4 lands.",
      href: `/demo/as/staff?staff=${staff.id}&to=/stamp`,
    },
    {
      name: "Owner · The Daily Grind",
      role: "Owner",
      can: "Dashboard, menu, QR, loyalty, team.",
      href: `/demo/as/owner?restaurant=${cafe.id}&to=/app`,
    },
    {
      name: "Operator (Patron)",
      role: "Operator",
      can: "Restaurants, themes, credit, audit.",
      href: "/demo/as/operator?to=/ops/restaurants",
    },
  ];
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Product preview · Demo data
      </p>
      <h1>Try {APP_NAME}.</h1>
      <p className="demo-intro">
        This is a clickable demo of loyalty cards and SMS specials for independent restaurants. Pick
        a person below — there’s no login, database or real SMS here.
      </p>
      {groups.map((group) => (
        <section key={group.person}>
          <h2>{group.person}</h2>
          <div className="demo-tunnel-grid">
            {group.tunnels.map((item) => (
              <a key={item.label} href={item.href} className="demo-tunnel">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
                {item.badge ? (
                  <small className="tunnel-badge">{item.badge}</small>
                ) : (
                  <small>Open preview →</small>
                )}
              </a>
            ))}
          </div>
        </section>
      ))}
      <section className="builder-panel">
        <h2>Demo accounts</h2>
        {accounts.map((account) => (
          <article className="guest-list-item" key={account.name}>
            <span>
              <strong>
                {account.name} · {account.role}
              </strong>
              <small>{account.can}</small>
            </span>
            <a className="builder-secondary" href={account.href}>
              Sign in
            </a>
          </article>
        ))}
      </section>
      <div className="demo-control-actions">
        <button onClick={() => demoRepo.reset()}>Reset demo data</button>
        <button onClick={() => api.demo.loadBusyWeek()}>Load a busy week</button>
        <a href="/demo/status">Open progress and demo guide</a>
      </div>
      <p className="demo-data-note">
        Everything here is fictional demo data stored in this browser.
      </p>
    </main>
  );
}
