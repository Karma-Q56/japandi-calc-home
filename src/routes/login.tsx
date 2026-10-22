import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { updateDemo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { PatronBrand } from "@/lib/patron-brand";
import {
  CreditCard,
  Store,
  ScanLine,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — Patron" },
      {
        name: "description",
        content: "Choose how you use Patron: diner, restaurant owner, staff till or Patron admin.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const state = useDemoState();
  const navigate = useNavigate();
  const restaurant = state.restaurants[0]!;
  const customer = state.customers[0]!;

  const portals = [
    {
      id: "diner",
      icon: CreditCard,
      title: "Diner",
      text: "Your cards, stamps, offers and rewards.",
      action: () => {
        updateDemo((current) => ({
          ...current,
          session: { role: "guest", customerId: customer.id },
        }));
        void navigate({ to: "/me" });
      },
    },
    {
      id: "owner",
      icon: Store,
      title: "Restaurant owner",
      text: "Dashboard, guests, loyalty rules, specials and campaigns.",
      action: () => {
        updateDemo((current) => ({
          ...current,
          session: { role: "owner", restaurantId: restaurant.id },
        }));
        void navigate({ to: "/app" });
      },
    },
    {
      id: "staff",
      icon: ScanLine,
      title: "Staff till",
      text: "Scan cards, add stamps, redeem rewards and offers.",
      action: () => {
        updateDemo((current) => {
          const staffId = current.staff.find(
            (item) => item.restaurantId === restaurant.id,
          )?.id;
          return {
            ...current,
            session: {
              role: "staff",
              restaurantId: restaurant.id,
              tillPairedRestaurantId: restaurant.id,
              ...(staffId ? { staffId } : {}),
            },
          };
        });
        void navigate({ to: "/stamp" });
      },
    },
    {
      id: "operator",
      icon: ShieldCheck,
      title: "Patron admin",
      text: "Set up venues, looks, credit and campaigns.",
      action: () => {
        updateDemo((current) => ({ ...current, session: { role: "operator" } }));
        void navigate({ to: "/ops/restaurants" });
      },
    },
  ];

  return (
    <MarketingShell current="login">
      <section className="login-page page-width">
        <PatronBrand />
        <span className="eyebrow">
          <span className="eyebrow-line" /> Log in
        </span>
        <h1>Who are you here as?</h1>
        <p className="login-note" role="note">
          <strong>Demo preview.</strong> These buttons switch the local demo role — no password and
          no real account yet. Real sign-in is coming.
        </p>
        <div className="login-grid">
          {portals.map((portal) => (
            <button
              key={portal.id}
              type="button"
              className="login-portal"
              onClick={portal.action}
            >
              <portal.icon />
              <strong>{portal.title}</strong>
              <span>{portal.text}</span>
              <span className="login-portal-go">
                Enter demo <ArrowRight size={15} />
              </span>
            </button>
          ))}
        </div>
        <p className="login-help">
          New here?{" "}
          <a href="/for-diners">See what diners get</a> or{" "}
          <a href="/#visit">book a 15-minute visit</a> for your restaurant.
        </p>
      </section>
    </MarketingShell>
  );
}
