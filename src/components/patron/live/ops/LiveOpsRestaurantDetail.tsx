import { safely } from "@/lib/server-call";
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ConfirmDialog, Badge, DataTable, EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import {
  formatRandFromCents,
  isLowCredit,
  ledgerTypeLabel,
  monthlyCentsForPlan,
  planLabel,
  statusLabel,
  subscriptionStateLabel,
} from "@/lib/live-ops-restaurants";
import { LiveOpsPageAddress } from "@/components/patron/live/ops/LiveOpsPageAddress";
import { LiveOpsMoneyActions } from "@/components/patron/live/ops/LiveOpsMoneyActions";
import { setRestaurantStatusFn, setRestaurantPlanFn } from "@/server/live-ops-fns";
import { setSubscriptionStateFn } from "@/server/live-ops-restaurants-fns";

import type { RestaurantDetail as Detail } from "@/server/live-ops-restaurants";


const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium" }).format(new Date(iso));

/** Live restaurant detail. Shows no guest names or phone numbers. */
export function LiveOpsRestaurantDetail(props: { detail: Detail }) {
  const { detail } = props;
  const router = useRouter({ warn: false });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(detail.restaurant.status);
  const [plan, setPlan] = useState(detail.restaurant.plan);
  const [reason, setReason] = useState("");

  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setMessage(null);
    const result: { ok: boolean; message?: string } = await safely(action());
    setMessage(result.message ?? (result.ok ? "Saved." : "Nothing changed."));
    setBusy(false);
    if (result.ok) await router?.invalidate();
  }

  const id = detail.restaurant.id;
  const reasonOk = reason.trim().length >= 3;

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Restaurant"
        title={detail.restaurant.name}
        intro={`/${detail.restaurant.slug} in ${detail.restaurant.suburb}. Opened ${dateLabel(detail.restaurant.created_at)}.`}
      />
      {message ? <p role="status">{message}</p> : null}
      <p>
        <Badge tone={detail.restaurant.status === "active" ? "active" : undefined}>{statusLabel(detail.restaurant.status)}</Badge>{" "}
        {planLabel(detail.restaurant.plan)} plan. Guests {detail.counts.members}. Stamps in the last 30 days {detail.counts.stamps_30_days}. Active branches {detail.counts.active_locations}.
      </p>

      <h2>People</h2>
      {detail.people.length === 0 ? (
        <EmptyState title="No owner or manager yet" hint="Add an owner when you create the restaurant." />
      ) : (
        <DataTable
          caption="Owners and managers for this restaurant"
          rows={detail.people}
          columns={[
            { key: "email", header: "Email", cell: (row) => row.email },
            { key: "role", header: "Role", cell: (row) => (row.role === "owner" ? "Owner" : "Manager") },
          ]}
        />
      )}

      <LiveOpsPageAddress restaurantId={id} slug={detail.restaurant.slug} />

      <h2>SMS credit</h2>
      <p>
        Balance {formatRandFromCents(detail.credit_cents)}
        {isLowCredit(detail.credit_cents) ? " (low)" : ""}
      </p>
      <FormField label="Why are you changing this? (for the record)" hint="At least 3 characters. Shown in the activity log.">
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
      <div>
        <FormField label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {["draft", "active", "paused", "closed"].map((item) => (
              <option key={item} value={item}>
                {statusLabel(item)}
              </option>
            ))}
          </select>
        </FormField>
        <ConfirmDialog
          label="Save status"
          question={`Change the status to ${statusLabel(status)}?`}
          confirmLabel="Yes, change it"
          buttonClass="builder-secondary"
          disabled={busy || !reasonOk}
          onConfirm={() =>
            void run(() => setRestaurantStatusFn({ data: { restaurantId: id, status: status as "draft" | "active" | "paused" | "closed", reason } }))
          }
        />
        <FormField label="Plan">
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            {["starter", "managed", "partner", "custom"].map((item) => (
              <option key={item} value={item}>
                {planLabel(item)}
              </option>
            ))}
          </select>
        </FormField>
        <ConfirmDialog
          label="Save plan"
          question={`Change the plan to ${planLabel(plan)}?`}
          confirmLabel="Yes, change it"
          buttonClass="builder-secondary"
          disabled={busy || !reasonOk}
          onConfirm={() =>
            void run(() => setRestaurantPlanFn({ data: { restaurantId: id, plan: plan as "starter" | "managed" | "partner" | "custom", reason } }))
          }
        />
      </div>

      {detail.ledger.length === 0 ? (
        <EmptyState title="No credit movements yet" />
      ) : (
        <DataTable
          caption="Recent credit movements"
          rows={detail.ledger}
          columns={[
            { key: "when", header: "Date", cell: (row) => dateLabel(row.created_at) },
            { key: "type", header: "Type", cell: (row) => ledgerTypeLabel(row.entry_type) },
            { key: "amount", header: "Amount", cell: (row) => formatRandFromCents(row.amount_cents) },
            { key: "note", header: "Note", cell: (row) => row.note ?? "" },
          ]}
        />
      )}

      <h2>Monthly payment</h2>
      {detail.subscription ? (
        <>
          <p>
            {monthlyCentsForPlan(detail.subscription.plan) == null
              ? `${planLabel(detail.subscription.plan)} plan, paid by invoice.`
              : `${planLabel(detail.subscription.plan)} plan, ${formatRandFromCents(monthlyCentsForPlan(detail.subscription.plan)!)} a month.`}{" "}
            Status: {subscriptionStateLabel(detail.subscription.state)}.
            {detail.subscription.next_due_at ? ` Next payment due ${dateLabel(detail.subscription.next_due_at)}.` : ""}
            {detail.subscription.grace_ends_at ? ` Grace ends ${dateLabel(detail.subscription.grace_ends_at)}.` : ""}
            {detail.subscription.paused ? " Campaigns are paused." : ""}
          </p>
          <p>
            Use these only when the bank or PayFast says something different from the app, for example money that
            came in by EFT. Each one is recorded in the activity log. Write the reason in the box above first.
          </p>
          <ConfirmDialog
            label="Mark as paid (money received)"
            question="Mark this monthly payment as received?"
            confirmLabel="Yes, mark it paid"
            buttonClass="builder-secondary"
            disabled={busy || !reasonOk}
            onConfirm={() =>
              void run(() => setSubscriptionStateFn({ data: { restaurantId: id, state: "active", note: reason } }))
            }
          />{" "}
          <ConfirmDialog
            label="Mark as cancelled"
            question="Mark this monthly payment as cancelled?"
            confirmLabel="Yes, mark it cancelled"
            buttonClass="builder-secondary"
            disabled={busy || !reasonOk}
            onConfirm={() =>
              void run(() => setSubscriptionStateFn({ data: { restaurantId: id, state: "cancelled", note: reason } }))
            }
          />
        </>
      ) : (
        <EmptyState title="No monthly plan" hint="This restaurant does not pay monthly by card." />
      )}

      <LiveOpsMoneyActions restaurantId={id} pendingTopups={detail.pending_topups} invoices={detail.invoices} payments={detail.payments} />

      <h2>Activity</h2>
      {detail.audit.length === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        <DataTable
          caption="Recent activity for this restaurant"
          rows={detail.audit}
          columns={[
            { key: "when", header: "Date", cell: (row) => dateLabel(row.created_at) },
            { key: "action", header: "What happened", cell: (row) => row.action.replace(/_/g, " ") },
            { key: "actor", header: "By", cell: (row) => (row.actor_type === "operator" ? "Patron staff" : "Restaurant") },
          ]}
        />
      )}
    </main>
  );
}
