import { withChildren } from "@/lib/nested";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { LEDGER_LABELS } from "@/domain/credit";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { useDemoState } from "@/data/useDemoState";
import { Badge, EmptyState, FormField, PageHeader } from "@/components/patron/dash";

const OpsCreditPage = withChildren(OpsCredit);

export const Route = createFileRoute("/ops/credit")({
  beforeLoad: () => {
    if (!requireRole("operator")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  component: OpsCreditPage,
});

const zar = (cents: number) => `R${(cents / 100).toFixed(2)}`;

function OpsCredit() {
  const state = useDemoState();
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
      <PageHeader
        eyebrow="Operator workspace"
        title="Credit operations"
        intro={`Balance: ${ledger ? zar(ledger.balanceCents) : zar(0)}. ${pending.length} pending EFT${
          pending.length === 1 ? "" : "s"
        }.`}
      />
      <FormField label="Restaurant" hint="Credit is kept separately for each restaurant.">
        <select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>
          {state.restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </FormField>

      <section className="guest-panel">
        <h2>Pending EFTs</h2>
        {pending.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            hint="No EFT top-up is waiting for an operator right now."
          />
        ) : (
          pending.map((payment) => (
            <div className="outbox-meta" key={payment.id}>
              <span>
                <strong>{payment.reference}</strong> · {zar(payment.amountCents)}
              </span>
              <span className="row-actions">
                <Badge tone="active">Pending</Badge>
                <button className="builder-primary" onClick={() => confirm(payment.id)}>
                  Confirm EFT
                </button>
              </span>
            </div>
          ))
        )}
      </section>

      <section className="guest-panel">
        <h2>Manual adjustment</h2>
        <FormField label="Amount in rand" hint="A negative amount takes credit away.">
          <input
            value={adjustAmount}
            onChange={(event) => setAdjustAmount(event.target.value)}
            inputMode="decimal"
          />
        </FormField>
        <FormField label="Note" hint="Required, so the reason is clear on the ledger.">
          <input value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} />
        </FormField>
        <div className="page-actions">
          <button className="builder-primary" onClick={adjust}>
            Record adjustment
          </button>
        </div>
      </section>

      <section className="guest-panel">
        <h2>Ledger</h2>
        {(ledger?.entries ?? []).length === 0 ? (
          <EmptyState
            title="No ledger entries yet"
            hint="Credit added, spent and adjusted shows here as soon as it happens."
          />
        ) : (
          (ledger?.entries ?? []).slice(0, 20).map((entry) => (
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
          ))
        )}
      </section>

      <section className="guest-panel">
        <h2>Recent credit audit</h2>
        {audit.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            hint="Operator credit actions are written here as they happen."
          />
        ) : (
          audit.map((event) => (
            <div className="outbox-meta" key={event.id}>
              <span>{event.action}</span>
              <span>{event.object ?? ""}</span>
            </div>
          ))
        )}
      </section>

      {notice && (
        <p className="demo-data-note" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}
