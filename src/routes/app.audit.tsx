import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import type { AuditAction } from "@/domain/audit";

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

export const Route = createFileRoute("/app/audit")({
  beforeLoad: () => {
    if (!requireRole("owner")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: Audit,
});

function Audit() {
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
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Audit · {restaurant.name}
      </p>
      <h1>What happened.</h1>
      <p className="demo-intro">
        Sign-ins, stamps, undos, redeems, PIN resets, pairings. No PINs or phone numbers are stored
        here.
      </p>
      <label className="builder-field">
        Filter by action
        <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
          {ACTIONS.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
      </label>
      {events.length === 0 && <p className="demo-data-note">Nothing recorded yet.</p>}
      {events.map((event) => (
        <p className="consent-history-row" key={event.id}>
          <strong>
            {event.action} · {event.actor}
          </strong>
          <small>
            {event.object ? `ref ${event.object} · ` : ""}
            {new Intl.DateTimeFormat("en-ZA", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(event.createdAt))}
          </small>
        </p>
      ))}
      <p>
        <a href="/">Back to Patron</a>
      </p>
    </main>
  );
}
