import { safely } from "@/lib/server-call";
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ConfirmDialog, DataTable, EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { formatRandFromCents, isLowCredit } from "@/lib/live-ops-restaurants";
import { addCreditFn } from "@/server/live-ops-fns";
import { confirmTopupFn, rejectTopupFn } from "@/server/live-ops-restaurants-fns";

type Pending = { id: string; restaurant_id: string; restaurant_name: string; amount_cents: number; reference: string | null; created_at: string };

const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium" }).format(new Date(iso));

/** Live credit screen: top ups waiting, plus adding credit by hand. Live data only. */
export function LiveOpsCredit(props: { pending: Pending[]; restaurants: Array<{ id: string; name: string; credit_cents: number }> }) {
  const router = useRouter({ warn: false });
  const [onlyLow, setOnlyLow] = useState(false);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [restaurantId, setRestaurantId] = useState(props.restaurants[0]?.id ?? "");
  const [kind, setKind] = useState<"topup" | "adjustment">("topup");
  const [rands, setRands] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addCredit() {
    const amount = Math.round(Number(rands) * 100);
    if (!Number.isFinite(amount) || amount === 0) return setMessage("Enter an amount in rands.");
    if (reason.trim().length < 3) return setMessage("Write a short reason (at least 3 characters).");
    setBusy(true);
    setMessage(null);
    const result = await safely(addCreditFn({
      data: { restaurantId, entryType: kind, amountCents: amount, reference: reference.trim(), reason: reason.trim() },
    }));
    setMessage(result.ok ? "Credit added." : result.message);
    setBusy(false);
    if (result.ok) await router?.invalidate();
  }

  async function decide(action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setMessage(null);
    const result: { ok: boolean; message?: string } = await safely(action());
    setMessage(result.message ?? (result.ok ? "Done." : "Nothing changed."));
    setBusy(false);
    if (result.ok) await router?.invalidate();
  }

  const shownBalances = props.restaurants.filter((item) => !onlyLow || isLowCredit(item.credit_cents));

  return (
    <main className="demo-hub page-width">
      <PageHeader eyebrow="Operator workspace" title="Credit" intro="Top ups waiting for a bank check, and credit you add by hand. Every change is logged." />
      {message ? <p role="status">{message}</p> : null}

      <h2>Top ups waiting</h2>
      {props.pending.length === 0 ? (
        <EmptyState title="No top ups waiting" hint="Manual EFT top ups show here until they are checked." />
      ) : (
        <DataTable
          caption="Top ups waiting for a bank check"
          rows={props.pending}
          columns={[
            { key: "restaurant", header: "Restaurant", cell: (row) => <a href={`/ops/restaurants/${row.restaurant_id}`}>{row.restaurant_name}</a> },
            { key: "amount", header: "Amount", cell: (row) => formatRandFromCents(row.amount_cents) },
            { key: "ref", header: "Reference", cell: (row) => row.reference ?? "" },
            { key: "when", header: "Sent", cell: (row) => dateLabel(row.created_at) },
            {
              key: "actions",
              header: "Check",
              cell: (row) => (
                <span>
                  <button
                    className="builder-primary"
                    disabled={busy}
                    onClick={() => void decide(() => confirmTopupFn({ data: { paymentId: row.id } }))}
                  >
                    Money received, add credit
                  </button>{" "}
                  <input
                    aria-label={`Reason if not received (${row.restaurant_name})`}
                    placeholder="Reason if not received"
                    value={rejectReasons[row.id] ?? ""}
                    onChange={(e) => setRejectReasons({ ...rejectReasons, [row.id]: e.target.value })}
                  />{" "}
                  <ConfirmDialog
                    label="Not received, reject"
                    question="Reject this top up? No credit is added."
                    confirmLabel="Yes, reject it"
                    buttonClass="builder-secondary"
                    disabled={busy || (rejectReasons[row.id] ?? "").trim().length < 3}
                    onConfirm={() =>
                      void decide(() => rejectTopupFn({ data: { paymentId: row.id, reason: (rejectReasons[row.id] ?? "").trim() } }))
                    }
                  />
                </span>
              ),
            },
          ]}
        />
      )}

      <h2>Credit balances</h2>
      <label>
        <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Only restaurants with low credit (under R100)
      </label>
      {shownBalances.length === 0 ? (
        <EmptyState title={onlyLow ? "No restaurant has low credit." : "No restaurants yet."} />
      ) : (
        <DataTable
          caption="SMS credit balance for each restaurant"
          rows={shownBalances}
          columns={[
            { key: "restaurant", header: "Restaurant", cell: (row) => <a href={`/ops/restaurants/${row.id}`}>{row.name}</a> },
            {
              key: "credit",
              header: "Balance",
              cell: (row) => (
                <>
                  {formatRandFromCents(row.credit_cents)}
                  {isLowCredit(row.credit_cents) ? <small> Low</small> : null}
                </>
              ),
            },
          ]}
        />
      )}

      <h2>Add credit by hand</h2>
      <FormField label="Restaurant">
        <select value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)}>
          {props.restaurants.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Kind">
        <select value={kind} onChange={(e) => setKind(e.target.value as "topup" | "adjustment")}>
          <option value="topup">Top up (money received)</option>
          <option value="adjustment">Adjustment (use a minus sign to take off)</option>
        </select>
      </FormField>
      <FormField label="Amount in rand">
        <input inputMode="numeric" value={rands} onChange={(e) => setRands(e.target.value)} />
      </FormField>
      <FormField label="Reference (8 to 80 characters)" hint="For example the bank reference or the ticket number.">
        <input value={reference} onChange={(e) => setReference(e.target.value)} />
      </FormField>
      <FormField label="Reason">
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
      <button className="builder-primary" onClick={addCredit} disabled={busy}>
        Add credit
      </button>
    </main>
  );
}
