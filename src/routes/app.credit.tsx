import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import { LEDGER_LABELS } from "@/domain/credit";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { useDemoState } from "@/data/useDemoState";
import { Badge, EmptyState, FormField, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";

export const Route = createFileRoute("/app/credit")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  component: CreditPage,
});

const zar = (cents: number) => `R${(cents / 100).toFixed(2)}`;

function CreditPage() {
  const state = useDemoState();
  const restaurantId = state.session.restaurantId;
  const [amount, setAmount] = useState("500");
  const [notice, setNotice] = useState("");
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <h1>Credit.</h1>
        <p className="demo-intro">Open this page from a restaurant tunnel.</p>
      </main>
    );
  }
  const result = api.credit.list(restaurant.id);
  const ledger = result.ok ? result.data : null;
  const request = () => {
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setNotice("Enter an amount in rand above zero.");
      return;
    }
    const created = api.credit.requestTopup({
      restaurantId: restaurant.id,
      amountCents: cents,
      requestedBy: "owner",
    });
    setNotice(
      created.ok
        ? `Top-up requested: pay ${zar(created.data.amountCents)} with reference ${created.data.reference}.`
        : created.error.message,
    );
  };
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`${restaurant.name} · Credit`}
        title={`${ledger ? zar(ledger.balanceCents) : zar(0)} available`}
        intro="One SMS segment costs R0.35. Campaigns reserve the estimate first and settle the actual cost after sending, so the balance never drops below zero."
      />
      <StatGrid>
        <StatCard
          value={Math.floor((ledger?.balanceCents ?? 0) / 35)}
          label="SMS segments left"
          hint="At R0.35 each, before your next top-up"
        />
        <StatCard
          value={ledger ? ledger.payments.filter((payment) => payment.status === "pending").length : 0}
          label="Top-ups waiting"
          hint="The operator confirms each one when the EFT lands"
        />
        <StatCard value={ledger ? ledger.payments.length : 0} label="Top-ups requested" hint="Every EFT request on this account" />
      </StatGrid>
      <section className="guest-panel">
        <h2>Top up by EFT</h2>
        <FormField label="Amount in rand">
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
          />
        </FormField>
        <button className="builder-primary" onClick={request}>
          Request top-up
        </button>
        <p className="demo-data-note">
          Demo EFT details (placeholder, real banking details arrive before launch): Bank: Demo
          Bank · Account: 00-000-0000 · Use your PAT reference so the operator can match the
          payment. The operator confirms it under /ops/credit.
        </p>
      </section>
      <section className="guest-panel">
        <h2>Payments</h2>
        {ledger && ledger.payments.length === 0 && (
          <EmptyState title="No top-ups yet" hint="Ask for your first top-up above and the operator will confirm it once the EFT lands." />
        )}
        {ledger &&
          ledger.payments.map((payment) => (
            <div className="outbox-meta" key={payment.id}>
              <span>
                <strong>{payment.reference}</strong> · {zar(payment.amountCents)}
              </span>
              <Badge tone={payment.status === "confirmed" ? "sent" : payment.status === "pending" ? "active" : undefined}>
                {payment.status}
              </Badge>
            </div>
          ))}
      </section>
      <section className="guest-panel">
        <h2>Ledger</h2>
        {ledger &&
          ledger.entries.map((entry) => (
            <div className="outbox-meta" key={entry.id}>
              <span>
                <strong>{LEDGER_LABELS[entry.type]}</strong> · {entry.reference}
                {entry.note ? ` · ${entry.note}` : ""}
              </span>
              <span>
                {entry.amountCents > 0 ? "+" : ""}
                {zar(entry.amountCents)}
              </span>
            </div>
          ))}
      </section>
      {notice && (
        <p className="demo-data-note" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}
