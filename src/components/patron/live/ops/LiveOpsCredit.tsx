import { useState } from "react";
import { DataTable, EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { formatRandFromCents } from "@/lib/live-ops-restaurants";
import { addCreditFn } from "@/server/live-ops-fns";

type Pending = { id: string; restaurant_id: string; restaurant_name: string; amount_cents: number; reference: string | null; created_at: string };

const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(iso));

/** Live credit screen: top ups waiting, plus adding credit by hand. Live data only. */
export function LiveOpsCredit(props: { pending: Pending[]; restaurants: Array<{ id: string; name: string }> }) {
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
    const result = await addCreditFn({
      data: { restaurantId, entryType: kind, amountCents: amount, reference: reference.trim(), reason: reason.trim() },
    });
    setMessage(result.ok ? "Credit added." : result.message);
    setBusy(false);
    if (result.ok) window.location.reload();
  }

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
