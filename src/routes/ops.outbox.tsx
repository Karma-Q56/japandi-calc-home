import { failureMessage } from "@/lib/live-ops-inbox";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { fakeSmsProvider } from "@/domain/sms";
import { Badge, EmptyState, FormField, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { formatRand } from "@/lib/money";
import type { Message, MessageStatus } from "@/data/types";
import { withChildren } from "@/lib/nested";
import { getDataModeFn } from "@/server/live";
import { listOutboxFn, outboxSummaryFn } from "@/server/live-ops-inbox-fns";
import { LiveOpsOutbox } from "@/components/patron/live/ops/LiveOpsOutbox";

const OpsOutboxPage = withChildren(OpsOutbox);
export const Route = createFileRoute("/ops/outbox")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("operator")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null, summary: null };
    const [live, summary] = await Promise.all([
      listOutboxFn({ data: { status: "", limit: 50, offset: 0 } }),
      outboxSummaryFn(),
    ]);
    return { mode, live, summary };
  },
  component: withChildren(LiveOrDemoOutbox),
});

function LiveOrDemoOutbox() {
  const { mode, live, summary } = Route.useLoaderData();
  if (mode === "live" && live?.ok && summary?.ok) {
    return <LiveOpsOutbox initial={live.rows} summary={summary.rows} />;
  }
  if (mode === "live") return <p className="demo-data-note">{failureMessage(live) ?? failureMessage(summary) ?? "Could not load the outbox."}</p>;
  return <OpsOutboxPage />;
}

const STATUS_LABELS: Record<MessageStatus, string> = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
  skipped: "Skipped",
};

function time(value: string | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

function OpsOutbox() {
  const state = useDemoState();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MessageStatus | "all">("all");
  const [restaurantId, setRestaurantId] = useState("all");
  const [notice, setNotice] = useState("");

  const rows = state.messages
    .filter((message) => (status === "all" ? true : message.status === status))
    .filter((message) => (restaurantId === "all" ? true : message.restaurantId === restaurantId))
    .filter((message) => {
      if (!search.trim()) return true;
      const needle = search.trim().toLowerCase();
      const customer = state.customers.find((item) => item.id === message.customerId);
      const restaurant = state.restaurants.find((item) => item.id === message.restaurantId);
      return [message.body, customer?.phoneE164, customer?.name, restaurant?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const counts = {
    queued: state.messages.filter((m) => m.status === "queued").length,
    delivered: state.messages.filter((m) => m.status === "delivered").length,
    failed: state.messages.filter((m) => m.status === "failed").length,
    stopped: state.smsReplies.filter((reply) => reply.kind === "stop" || reply.kind === "stopall").length,
  };

  const simulate = (message: Message) => {
    const result = fakeSmsProvider.simulateDelivery(message.id);
    setNotice(
      result ? `Demo receipt recorded: ${result}. No real message was touched.` : "Message not found.",
    );
  };

  const run = () => {
    const report = api.campaign.runDispatcher();
    setNotice(
      `Dispatcher: ${report.sent} sent, ${report.skipped} skipped, ${report.held} held, ${report.failed} failed.`,
    );
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Operator workspace"
        title="SMS outbox."
        intro="Every queued, sent and delivered message, with the story of what happened to it. Demo mode only: the dispatcher and receipts are simulated and no real phone is messaged."
        actions={
          <button className="builder-primary" onClick={run}>
            Run dispatcher
          </button>
        }
      />

      <StatGrid>
        <StatCard value={counts.queued} label="Queued" hint="Waiting for the dispatcher." />
        <StatCard value={counts.delivered} label="Delivered" hint="Demo receipts marked delivered." />
        <StatCard value={counts.failed} label="Failed" hint="Credit can be refunded after settle." />
        <StatCard value={counts.stopped} label="STOP replies" hint="Never message these guests again." />
      </StatGrid>

      <section className="builder-panel">
        <div className="inbox-toolbar">
          <FormField label="Search">
            <input
              type="search"
              value={search}
              placeholder="Phone, guest, restaurant or text"
              onChange={(event) => setSearch(event.target.value)}
            />
          </FormField>
          <FormField label="Status">
            <select value={status} onChange={(event) => setStatus(event.target.value as MessageStatus | "all")}>
              <option value="all">All statuses</option>
              {(Object.keys(STATUS_LABELS) as MessageStatus[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Restaurant">
            <select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>
              <option value="all">All restaurants</option>
              {state.restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </section>

      {notice && (
        <p className="demo-data-note" role="status">
          {notice}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No messages match"
          hint="Try another status, restaurant or search. Queued campaigns appear here as soon as they are confirmed."
          action={
            <a className="builder-secondary" href="/ops/campaigns">
              Write a campaign draft
            </a>
          }
        />
      ) : (
        <div className="outbox-grid">
          {rows.map((message) => {
            const customer = state.customers.find((item) => item.id === message.customerId);
            const restaurant = state.restaurants.find((item) => item.id === message.restaurantId);
            const membership = state.memberships.find(
              (item) => item.customerId === message.customerId && item.restaurantId === message.restaurantId,
            );
            const stopped = state.smsReplies.some(
              (reply) =>
                reply.toPhoneE164 === customer?.phoneE164 &&
                (reply.kind === "stop" || reply.kind === "stopall"),
            );
            return (
              <article className="builder-panel outbox-card" key={message.id}>
                <div className="outbox-meta">
                  <strong>{customer?.name ?? "Guest"}</strong>
                  <Badge
                    tone={
                      message.status === "delivered"
                        ? "sent"
                        : message.status === "failed"
                          ? undefined
                          : message.status === "sent"
                            ? "active"
                            : undefined
                    }
                  >
                    {STATUS_LABELS[message.status]}
                  </Badge>
                </div>
                <p className="demo-data-note">
                  {restaurant?.name ?? "Unknown restaurant"} · {customer?.phoneE164 ?? "Unknown phone"} ·{" "}
                  {message.channel === "sms" ? `${message.segments} segment${message.segments === 1 ? "" : "s"} · ${formatRand(message.costCents)}` : "Push, free"}
                </p>
                <p className="outbox-body">{message.body}</p>

                <h3>Timeline</h3>
                <ol className="outbox-timeline">
                  <li>
                    <span>Queued</span>
                    <small>{time(message.createdAt)}</small>
                  </li>
                  {message.sentAt && (
                    <li>
                      <span>Sent</span>
                      <small>{time(message.sentAt)}</small>
                    </li>
                  )}
                  {message.deliveredAt && (
                    <li className="is-good">
                      <span>Delivered</span>
                      <small>{time(message.deliveredAt)}</small>
                    </li>
                  )}
                  {message.status === "failed" && (
                    <li className="is-bad">
                      <span>Failed{message.errorCode ? `: ${message.errorCode}` : ""}</span>
                      <small>{time(message.sentAt ?? message.createdAt)}</small>
                    </li>
                  )}
                  {message.status === "skipped" && (
                    <li className="is-bad">
                      <span>Skipped: consent, cap or STOP</span>
                      <small>{time(message.createdAt)}</small>
                    </li>
                  )}
                  {stopped && (
                    <li className="is-bad">
                      <span>Guest replied STOP</span>
                      <small>No further messages</small>
                    </li>
                  )}
                </ol>

                <div className="page-actions">
                  {message.channel === "sms" && (
                    <button className="builder-secondary" onClick={() => simulate(message)}>
                      Simulate delivery
                    </button>
                  )}
                  {membership && message.channel === "sms" && !stopped && (
                    <button
                      className="guest-back"
                      onClick={() => {
                        fakeSmsProvider.replyStop(message.customerId, message.restaurantId);
                        setNotice(`STOP recorded for ${restaurant?.name ?? "this restaurant"}. Consent withdrawn.`);
                      }}
                    >
                      Simulate a STOP reply
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
