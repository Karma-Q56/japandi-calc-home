import { withChildren } from "@/lib/nested";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import { LEDGER_LABELS } from "@/domain/credit";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";

const OpsCreditPage = withChildren(OpsCredit);
export const Route = createFileRoute("/ops/credit")({
  beforeLoad: () => {
    if (!requireRole("operator")(demoRepo.read().session)) throw redirect({ to: "/demo" });
  },
  component: OpsCreditPage,
});

const zar = (cents: number) => `R${(cents / 100).toFixed(2)}`;

function OpsCredit() {
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const [restaurantId, setRestaurantId] = useState(state.restaurants[0]?.id ?? "");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [notice, setNotice] = useState("");
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  const result = restaurant ? api.credit.list(restaurant.id) : null;
  const ledger = result && result.ok ? result.data : null;
  const pending = (ledger?.payments ?? []).filter((payment) => payment.status === "pending");
  const auditResult = api.audit.list({ restaurantId, limit: 20 });
  const audit = auditResult.ok ? auditResult.data : [];
  const confirm = (paymentId: string) => {
    const confirmed = api.credit.confirmTopup({ paymentId, confirmedBy: "operator" });
    setNotice(confirmed.ok ? "EFT confirmed and credit added." : confirmed.error.message);
  };
  const adjust = () => {
    const cents = Math.round(Number(adjustAmount) * 100);
    const adjusted = api.credit.adjust({
      restaurantId,
      amountCents: cents,
      note: adjustNote,
      actor: "operator",
    });
    setNotice(adjusted.ok ? "Adjustment recorded." : adjusted.error.message);
  };
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Operator workspace
      </p>
      <h1>Credit operations.</h1>
      <label className="builder-field">
        Restaurant
        <select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>
          {state.restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <p className="demo-intro">
        Balance: {ledger ? zar(ledger.balanceCents) : zar(0)} · {pending.length} pending EFTs.
      </p>
      <section className="guest-panel">
        <h2>Pending EFTs</h2>
        {pending.length === 0 && <p className="demo-data-note">Nothing waiting.</p>}
        {pending.map((payment) => (
          <div className="outbox-meta" key={payment.id}>
            <span>
              <strong>{payment.reference}</strong> · {zar(payment.amountCents)}
            </span>
            <button className="builder-primary" onClick={() => confirm(payment.id)}>
              Confirm EFT
            </button>
          </div>
        ))}
      </section>
      <section className="guest-panel">
        <h2>Manual adjustment</h2>
        <label className="builder-field">
          Amount in rand (negative takes credit away)
          <input
            value={adjustAmount}
            onChange={(event) => setAdjustAmount(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="builder-field">
          Note (required)
          <input value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} />
        </label>
        <button className="builder-primary" onClick={adjust}>
          Record adjustment
        </button>
      </section>
      <section className="guest-panel">
        <h2>Ledger</h2>
        {(ledger?.entries ?? []).slice(0, 20).map((entry) => (
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
      <section className="guest-panel">
        <h2>Recent credit audit</h2>
        {audit.map((event) => (
          <div className="outbox-meta" key={event.id}>
            <span>{event.action}</span>
            <span>{event.object ?? ""}</span>
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
