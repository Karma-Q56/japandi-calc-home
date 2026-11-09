import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import type { AuditAction } from "@/domain/audit";
import { DataTable, EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { getDataModeFn } from "@/server/live";
import { listOwnerActivityFn } from "@/server/live-admin-fns";
import type { OwnerActivityItem } from "@/server/live-admin";
import { ACTIVITY_PAGE_SIZE, activityActor, activityWording } from "@/lib/live-admin";

const ACTIONS: Array<AuditAction | "all"> = [
  "all",
  "sign_in",
  "pin_failure",
  "lockout",
  "stamp",
  "undo",
  "redeem",
  "pin_reset",
  "pairing",
];

const ACTION_LABELS: Partial<Record<AuditAction | "all", string>> = {
  all: "All activity",
  sign_in: "Till sign in",
  pin_failure: "Wrong PIN",
  lockout: "Locked out",
  stamp: "Stamp",
  undo: "Undo",
  redeem: "Redeem",
  pin_reset: "PIN reset",
  pairing: "Till paired",
  help_enabled: "Help from Patron on",
  help_disabled: "Help from Patron off",
  help_start: "Patron opened help mode",
  help_stop: "Patron closed help mode",
  help_draft: "Draft from Patron",
  help_draft_used: "You used a draft",
  help_draft_discarded: "You threw away a draft",
  help_request: "You asked for work",
  help_reply: "Patron answered your request",
};

export const Route = createFileRoute("/app/audit")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await listOwnerActivityFn({ data: { before: null } }) };
  },
  component: Audit,
});

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
}

/** Live activity: this restaurant only, newest first, 50 at a time with a "Show older" button. */
function LiveAudit({ initial }: { initial: OwnerActivityItem[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(initial.length < ACTIVITY_PAGE_SIZE);
  const [failed, setFailed] = useState(false);
  async function showOlder() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setBusy(true);
    setFailed(false);
    try {
      const more = await listOwnerActivityFn({ data: { before: last.createdAt } });
      setRows((current) => [...current, ...more]);
      setDone(more.length < ACTIVITY_PAGE_SIZE);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Activity log"
        title="What happened"
        intro="Changes to your restaurant, sign-ins and till activity. No PINs, phone numbers or codes are shown here."
      />
      {rows.length === 0 ? (
        <EmptyState title="Nothing recorded yet" hint="Activity appears here as soon as something changes." />
      ) : (
        <DataTable
          caption="Activity for your restaurant"
          rows={rows}
          columns={[
            { key: "action", header: "Action", cell: (event) => activityWording(event.action) },
            { key: "who", header: "Who", cell: (event) => activityActor(event.actorType) },
            { key: "when", header: "When", cell: (event) => timeLabel(event.createdAt) },
          ]}
        />
      )}
      {failed ? <p role="alert">We could not load older activity. Try again.</p> : null}
      {!done && rows.length > 0 ? (
        <button type="button" onClick={showOlder} disabled={busy}>
          {busy ? "Loading" : "Show older"}
        </button>
      ) : null}
    </main>
  );
}

function Audit() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveAudit initial={data.live ?? []} />;
  return <DemoAudit />;
}

function DemoAudit() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [filter, setFilter] = useState<(typeof ACTIONS)[number]>("all");
  const result = api.audit.list({
    restaurantId: restaurant.id,
    action: filter === "all" ? undefined : filter,
  });
  const events = result.ok ? result.data : [];
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Activity log · ${restaurant.name}`}
        title="What happened"
        intro="Sign-ins, stamps, undos, redeems, PIN resets and pairings. No PINs or phone numbers are kept here."
      />
      <FormField label="Show only">
        <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
          {ACTIONS.map((action) => (
            <option key={action} value={action}>
              {ACTION_LABELS[action]}
            </option>
          ))}
        </select>
      </FormField>
      {events.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          hint="Activity appears here the moment someone signs in at the till or stamps a card."
        />
      ) : (
        <DataTable
          caption={`Activity for ${restaurant.name}`}
          rows={events}
          columns={[
            {
              key: "action",
              header: "Action",
              cell: (event) => (
                <>
                  {ACTION_LABELS[event.action as AuditAction] ?? event.action}
                  {event.object ? <small>ref {event.object}</small> : null}
                </>
              ),
            },
            { key: "who", header: "Who", cell: (event) => event.actor },
            {
              key: "when",
              header: "When",
              cell: (event) =>
                new Intl.DateTimeFormat("en-ZA", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Africa/Johannesburg",
                }).format(new Date(event.createdAt)),
            },
          ]}
        />
      )}
    </main>
  );
}
