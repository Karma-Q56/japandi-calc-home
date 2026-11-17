import { demoRepo } from "@/data/repo";
import { balanceFor } from "@/domain/credit";
import { planBilling } from "@/config/plans";
import { FAILED_PAYMENT_RULES, plainDate } from "@/lib/live-billing";
import { formatRand } from "@/lib/money";
import { Link } from "@tanstack/react-router";
import { EmptyState, PageHeader, StatCard, StatGrid } from "./dash";

// The demo version of "Plan and billing" (D25). Fixed example values, no payments, no pausing.

const DAY_MS = 24 * 60 * 60 * 1000;

export function DemoBilling() {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === state.session.restaurantId);
  const planName = restaurant?.plan === "managed" ? "Growth" : restaurant?.plan === "partner" ? "Pro" : "Starter";
  const limits = planBilling[planName]!;
  const monthly = limits.monthlyCents === null ? "Set by Patron" : formatRand(limits.monthlyCents);
  const balance = restaurant ? balanceFor(state, restaurant.id) : 0;
  const nextDue = plainDate(new Date(state.now + 12 * DAY_MS).toISOString());

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Owner"
        title="Plan and billing"
        intro="Your plan, what it includes, and your payments and invoices."
      />

      <StatGrid>
        <StatCard label="Current plan" value={planName} />
        <StatCard label="Monthly price" value={monthly} />
        <StatCard label="SMS credit balance" value={formatRand(balance)} />
        <StatCard label="Locations used" value={`1 of ${limits.maxLocations}`} />
      </StatGrid>

      <section>
        <h2>Monthly payment</h2>
        <p>{`Active. Next payment due ${nextDue}.`}</p>
        <p>{FAILED_PAYMENT_RULES}</p>
      </section>

      <section>
        <h2>Top up credit</h2>
        <Link to="/app/credit" className="builder-primary">
          Top up credit
        </Link>
      </section>

      <section>
        <h2>Invoices</h2>
        <EmptyState title="No invoices" hint="Invoices appear here when Patron sends you one." />
      </section>
    </main>
  );
}
