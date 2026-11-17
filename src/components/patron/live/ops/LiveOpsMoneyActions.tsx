import { useState } from "react";
import { DataTable, EmptyState, FormField } from "@/components/patron/dash";
import {
  formatRandFromCents,
  invoiceStatusText,
  paymentKindLabel,
  refundWording,
  validateInvoiceInput,
  validateRefundInput,
} from "@/lib/live-ops-restaurants";
import {
  confirmTopupFn,
  createInvoiceFn,
  markInvoicePaidFn,
  recordRefundFn,
  rejectTopupFn,
  voidInvoiceFn,
} from "@/server/live-ops-restaurants-fns";

type Pending = { id: string; amount_cents: number; reference: string | null; created_at: string };
type Invoice = { id: string; amount_cents: number; description: string; due_date: string; status: string; created_at: string };
type Payment = { id: string; kind: string; amount_cents: number; status: string; reference: string | null; refunded_cents: number; created_at: string };

const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(iso));

type Result = { ok: boolean; message?: string };

/** Money actions for one restaurant: top ups, invoices and refunds. Live only; every write is checked again on the server. */
export function LiveOpsMoneyActions(props: {
  restaurantId: string;
  pendingTopups: Pending[];
  invoices: Invoice[];
  payments: Payment[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [invoiceRands, setInvoiceRands] = useState("");
  const [invoiceText, setInvoiceText] = useState("");
  const [invoiceDue, setInvoiceDue] = useState("");
  const [refundRands, setRefundRands] = useState<Record<string, string>>({});
  const [paidRef, setPaidRef] = useState<Record<string, string>>({});

  async function run(action: () => Promise<Result>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setMessage(result.message ?? (result.ok ? "Done." : "Nothing changed."));
    setBusy(false);
    if (result.ok && typeof window !== "undefined") window.location.reload();
  }

  const reasonOk = reason.trim().length >= 3;

  async function createInvoice() {
    const check = validateInvoiceInput(Number(invoiceRands), invoiceText, invoiceDue);
    if (!check.ok) return setMessage(check.message);
    await run(() =>
      createInvoiceFn({
        data: { restaurantId: props.restaurantId, amountCents: check.amountCents, description: check.description, dueDate: check.dueDate },
      }),
    );
  }

  return (
    <section>
      <h2>Top ups waiting for a bank check</h2>
      {message ? <p role="status">{message}</p> : null}
      <FormField label="Why are you doing this? (for the record)" hint="At least 3 characters. Shown in the activity log.">
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
      {props.pendingTopups.length === 0 ? (
        <EmptyState title="No top ups waiting" hint="Manual EFT top ups show here until they are checked." />
      ) : (
        <DataTable
          caption="Manual EFT top ups waiting to be checked"
          rows={props.pendingTopups}
          columns={[
            { key: "when", header: "Sent", cell: (row) => dateLabel(row.created_at) },
            { key: "amount", header: "Amount", cell: (row) => formatRandFromCents(row.amount_cents) },
            { key: "ref", header: "Reference", cell: (row) => row.reference ?? "" },
            {
              key: "actions",
              header: "Actions",
              cell: (row) => (
                <span>
                  <button className="builder-primary" disabled={busy || !reasonOk} onClick={() => run(() => confirmTopupFn({ data: { paymentId: row.id } }))}>
                    Money received, add credit
                  </button>{" "}
                  <button className="builder-secondary" disabled={busy || !reasonOk} onClick={() => run(() => rejectTopupFn({ data: { paymentId: row.id, reason } }))}>
                    Not received, reject
                  </button>
                </span>
              ),
            },
          ]}
        />
      )}

      <h2>Invoices</h2>
      <div>
        <FormField label="Amount in rand">
          <input inputMode="numeric" value={invoiceRands} onChange={(e) => setInvoiceRands(e.target.value)} />
        </FormField>
        <FormField label="What is it for">
          <input value={invoiceText} onChange={(e) => setInvoiceText(e.target.value)} />
        </FormField>
        <FormField label="Due date">
          <input type="date" value={invoiceDue} onChange={(e) => setInvoiceDue(e.target.value)} />
        </FormField>
        <button className="builder-secondary" disabled={busy || !reasonOk} onClick={createInvoice}>
          Create invoice
        </button>
      </div>
      {props.invoices.length === 0 ? (
        <EmptyState title="No invoices yet" />
      ) : (
        <DataTable
          caption="Invoices for this restaurant"
          rows={props.invoices}
          columns={[
            { key: "desc", header: "For", cell: (row) => row.description },
            { key: "amount", header: "Amount", cell: (row) => formatRandFromCents(row.amount_cents) },
            { key: "due", header: "Due", cell: (row) => dateLabel(row.due_date) },
            { key: "status", header: "Status", cell: (row) => invoiceStatusText(row.status) },
            {
              key: "actions",
              header: "Actions",
              cell: (row) =>
                row.status === "open" ? (
                  <span>
                    <input
                      aria-label="Payment reference"
                      value={paidRef[row.id] ?? ""}
                      onChange={(e) => setPaidRef({ ...paidRef, [row.id]: e.target.value })}
                    />{" "}
                    <button
                      className="builder-primary"
                      disabled={busy || !reasonOk || (paidRef[row.id] ?? "").trim().length < 4}
                      onClick={() =>
                        run(() => markInvoicePaidFn({ data: { invoiceId: row.id, reference: (paidRef[row.id] ?? "").trim(), reason } }))
                      }
                    >
                      Mark paid
                    </button>{" "}
                    <button className="builder-secondary" disabled={busy || !reasonOk} onClick={() => run(() => voidInvoiceFn({ data: { invoiceId: row.id, reason } }))}>
                      Cancel invoice
                    </button>
                  </span>
                ) : (
                  ""
                ),
            },
          ]}
        />
      )}

      <h2>Payments and refunds</h2>
      {props.payments.length === 0 ? (
        <EmptyState title="No payments yet" />
      ) : (
        <DataTable
          caption="Payments for this restaurant with refunds"
          rows={props.payments}
          columns={[
            { key: "kind", header: "Payment", cell: (row) => paymentKindLabel(row.kind) },
            { key: "amount", header: "Amount", cell: (row) => formatRandFromCents(row.amount_cents) },
            { key: "refunds", header: "Refunds", cell: (row) => refundWording(row.refunded_cents, row.amount_cents) },
            {
              key: "actions",
              header: "Refund",
              cell: (row) =>
                row.kind === "topup" && row.status === "confirmed" ? (
                  <span>
                    <input
                      aria-label="Refund amount in rand"
                      inputMode="numeric"
                      value={refundRands[row.id] ?? ""}
                      onChange={(e) => setRefundRands({ ...refundRands, [row.id]: e.target.value })}
                    />{" "}
                    <button
                      className="builder-secondary"
                      disabled={busy || !reasonOk}
                      onClick={() => {
                        const check = validateRefundInput(
                          Math.round(Number(refundRands[row.id]) * 100),
                          row.amount_cents - row.refunded_cents,
                          reason,
                        );
                        if (!check.ok) return setMessage(check.message);
                        run(() => recordRefundFn({ data: { paymentId: row.id, amountCents: check.amountCents, reason: check.reason } }));
                      }}
                    >
                      Record refund
                    </button>
                  </span>
                ) : (
                  "Not refundable here"
                ),
            },
          ]}
        />
      )}
    </section>
  );
}
