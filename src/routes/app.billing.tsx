import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { Badge, EmptyState, FormField, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { getDataModeFn } from "@/server/live";
import { getBillingFn, startPaymentFn } from "@/server/live-billing-fns";
import type { LiveBilling } from "@/server/live-billing";
import {
  FAILED_PAYMENT_RULES,
  invoiceStatusLabel,
  paymentStatusLabel,
  randsToCentsOrNull,
} from "@/lib/live-billing";
import { formatRand } from "@/lib/live-campaigns";

export const Route = createFileRoute("/app/billing")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await getBillingFn() };
  },
  component: BillingPage,
});

function BillingPage() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveBillingPage billing={data.live} />;
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Owner"
        title="Plan and billing"
        intro="Your plan, payments and invoices. This screen is not ready in the demo yet."
      />
      <EmptyState
        title="Not ready in the demo"
        hint="Plan, payment and invoice details show here once your restaurant is live."
      />
    </main>
  );
}

function LiveBillingPage({ billing }: { billing: LiveBilling | null }) {
  const [topup, setTopup] = useState("500");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!billing) {
    return (
      <main className="demo-hub page-width">
        <PageHeader eyebrow="Owner" title="Plan and billing" intro="We could not load your billing details." />
      </main>
    );
  }

  const planLimit = billing.maxLocations;
  const monthly = billing.monthlyCents === null ? "Set by Patron" : formatRand(billing.monthlyCents);
  const onlinePlans = (["Starter", "Growth"] as const).filter((name) => name !== billing.planName);

  const send = async (request: { kind: "topup"; topupCents?: number } | { kind: "subscription"; planName: "Starter" | "Growth" }) => {
    setBusy(true);
    setNotice("");
    const result = await startPaymentFn({ data: { ...request, origin: window.location.origin } });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    const form = document.createElement("form");
    form.method = "POST";
    form.action = result.url;
    for (const [name, value] of result.fields) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  };

  const topupCents = randsToCentsOrNull(Number(topup));

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Owner"
        title="Plan and billing"
        intro="Your plan, what it includes, and your payments and invoices."
      />

      <StatGrid>
        <StatCard label="Current plan" value={billing.planName} />
        <StatCard label="Monthly price" value={monthly} />
        <StatCard label="SMS credit balance" value={formatRand(billing.creditBalanceCents)} />
        <StatCard label="Locations used" value={`${billing.activeLocations} of ${planLimit}`} />
      </StatGrid>

      <section>
        <h2>What your plan includes</h2>
        <ul>
          <li>{billing.includedSmsCredit > 0 ? `SMS credit included each month: ${formatRand(billing.includedSmsCredit * 100)}` : "No SMS credit included"}</li>
          <li>Up to {planLimit} location{planLimit === 1 ? "" : "s"}</li>
        </ul>
        <p>{FAILED_PAYMENT_RULES}</p>
      </section>

      <section>
        <h2>Top up credit</h2>
        {billing.paymentsOn ? (
          <>
            <FormField label="Amount in rand" hint="Between R100 and R100 000.">
              <input
                inputMode="numeric"
                value={topup}
                onChange={(event) => setTopup(event.target.value)}
              />
            </FormField>
            <button type="button" disabled={busy || topupCents === null} onClick={() => send(topupCents === null ? { kind: "topup" } : { kind: "topup", topupCents })}>
              Top up credit
            </button>
          </>
        ) : (
          <p>Online payments are not switched on yet. Ask Patron how to pay by bank transfer.</p>
        )}
      </section>

      {billing.paymentsOn && onlinePlans.length > 0 ? (
        <section>
          <h2>Change plan</h2>
          {onlinePlans.map((name) => (
            <button key={name} type="button" disabled={busy} onClick={() => send({ kind: "subscription", planName: name })}>
              Switch to {name}
            </button>
          ))}
        </section>
      ) : null}

      {notice ? <p role="status">{notice}</p> : null}

      <section>
        <h2>Payment history</h2>
        {billing.payments.length === 0 ? (
          <EmptyState title="No payments yet" hint="Your payments will show here." />
        ) : (
          <ul>
            {billing.payments.map((payment) => (
              <li key={payment.id}>
                {new Date(payment.createdAt).toLocaleDateString("en-ZA")} · {formatRand(payment.amountCents)} ·{" "}
                <Badge>{paymentStatusLabel(payment.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Invoices</h2>
        {billing.invoices.length === 0 ? (
          <EmptyState title="No invoices" hint="Invoices from Patron will show here." />
        ) : (
          <ul>
            {billing.invoices.map((invoice) => (
              <li key={invoice.id}>
                {invoice.description} · {formatRand(invoice.amountCents)} · due {invoice.dueDate} ·{" "}
                <Badge>{invoiceStatusLabel(invoice.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
        {billing.bankingDetails ? (
          <>
            <h3>How to pay by bank transfer</h3>
            <p>{billing.bankingDetails}</p>
          </>
        ) : null}
      </section>
    </main>
  );
}
