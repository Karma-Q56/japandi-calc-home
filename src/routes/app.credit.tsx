import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import { LEDGER_LABELS } from "@/domain/credit";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";

export const Route = createFileRoute("/app/credit")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/demo" });
  },
  component: CreditPage,
});

const zar = (cents: number) => `R${(cents / 100).toFixed(2)}`;

function CreditPage() {
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
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
      <p className="eyebrow">
        <span className="eyebrow-line" />
        {restaurant.name} · Credit
      </p>
      <h1>{ledger ? zar(ledger.balanceCents) : zar(0)} available.</h1>
      <p className="demo-intro">
        One SMS segment costs R0.35. Campaigns reserve the estimate first and settle the actual
        cost after sending, so the balance never drops below zero.
      </p>
      <section className="guest-panel">
        <h2>Top up by EFT</h2>
        <label className="builder-field">
          Amount in rand
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <button className="builder-primary" onClick={request}>
          Request top-up
        </button>
        <p className="demo-data-note">
          Demo EFT details (placeholder — real banking details arrive before launch): Bank: Demo
          Bank · Account: 00-000-0000 · Use your PAT reference so the operator can match the
          payment. The operator confirms it under /ops/credit.
        </p>
      </section>
      <section className="guest-panel">
        <h2>Payments</h2>
        {ledger && ledger.payments.length === 0 && <p className="demo-data-note">No top-ups yet.</p>}
        {ledger &&
          ledger.payments.map((payment) => (
            <div className="outbox-meta" key={payment.id}>
              <span>
                <strong>{payment.reference}</strong> · {zar(payment.amountCents)}
              </span>
              <span className={`status-pill ${payment.status}`}>{payment.status}</span>
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
