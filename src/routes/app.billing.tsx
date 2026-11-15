import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { Badge, EmptyState, FormField, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { getDataModeFn } from "@/server/live";
import { getBillingFn, startPaymentFn } from "@/server/live-billing-fns";
import type { LiveBilling } from "@/server/live-billing";
import { planBilling } from "@/config/plans";
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
  // Only Starter and Growth are paid online, and only until a monthly payment exists.
  // Pro is invoiced. A running monthly payment is changed by Patron, never by paying twice.
  const payOnline = billing.planCode === "starter" || billing.planCode === "managed";
  const onlinePlans = ["Starter", "Growth"] as const;

  const send = async (request: { kind: "topup"; topupCents: number } | { kind: "subscription"; planName: "Starter" | "Growth" }) => {
    setBusy(true);
    setNotice("");
    const result = await startPaymentFn({ data: request });
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
            <button
              type="button"
              className="builder-primary"
              disabled={busy || topupCents === null}
              onClick={() => {
                if (topupCents !== null) void send({ kind: "topup", topupCents });
              }}
            >
              Top up credit
            </button>
          </>
        ) : (
          <p>Online payments are not switched on yet. Ask Patron how to pay by bank transfer.</p>
        )}
      </section>

      {billing.paymentsOn && payOnline ? (
        <section>
          <h2>Monthly plan</h2>
          {billing.hasMonthlyPayment ? (
            <p>Your monthly payment is set up. To change your plan or stop it, ask Patron.</p>
          ) : (
            <>
              <p>Pay for your plan by card each month. Your plan switches as soon as the first payment goes through.</p>
              {onlinePlans.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="builder-secondary"
                  disabled={busy}
                  onClick={() => void send({ kind: "subscription", planName: name })}
                >
                  Pay for {name}, {formatRand(planBilling[name]!.monthlyCents ?? 0)} a month
                </button>
              ))}
            </>
          )}
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
