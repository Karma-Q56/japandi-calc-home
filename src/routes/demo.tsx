import { createFileRoute } from "@tanstack/react-router";
import { useDemoState } from "@/data/useDemoState";
import { APP_NAME } from "@/config/app";

export const Route = createFileRoute("/demo")({ component: DemoHub });

function DemoHub() {
  const state = useDemoState();
  const cafe = state.restaurants[0]!;
  const guest = state.customers[0]!;
  const staff = state.staff[0]!;
  const tunnels = [
    {
      label: "Join as a new guest",
      description: "Open the demo join flow for The Daily Grind.",
      href: `/demo/as/guest?restaurant=${cafe.id}&to=/r/daily-grind/join`,
    },
    {
      label: "My cards as Thandi",
      description: "See loyalty cards linked to one guest.",
      href: `/demo/as/guest?customer=${guest.id}&to=/me`,
    },
    {
      label: "Staff till · The Daily Grind",
      description: "Open a staff workspace for stamp actions.",
      href: `/demo/as/staff?staff=${staff.id}&to=/stamp`,
    },
    {
      label: "Owner dashboard · The Daily Grind",
      description: "View the venue dashboard.",
      href: `/demo/as/owner?restaurant=${cafe.id}&to=/app`,
    },
    {
      label: "Operator console",
      description: "Manage demo restaurants, themes and menus.",
      href: "/demo/as/operator?to=/ops/restaurants",
    },
    {
      label: "SMS outbox",
      description: "Inspect demo messages and simulate delivery.",
      href: "/demo/as/operator?to=/demo/outbox",
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
        Choose a demo tunnel. There’s no login, database or real SMS in this preview.
      </p>
      <div className="demo-tunnel-grid">
        {tunnels.map((item) => (
          <a key={item.label} href={item.href} className="demo-tunnel">
            <strong>{item.label}</strong>
            <span>{item.description}</span>
            <small>Open preview →</small>
          </a>
        ))}
      </div>
      <p className="demo-data-note">
        Everything here is fictional demo data stored in this browser.
      </p>
    </main>
  );
}
