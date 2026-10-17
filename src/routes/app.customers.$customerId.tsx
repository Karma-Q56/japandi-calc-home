import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";

export const Route = createFileRoute("/app/customers/$customerId")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/demo" });
    }
  },
  component: CustomerProfile,
});

function CustomerProfile() {
  const { customerId } = Route.useParams();
  const state = useDemoState();
  const session = state.session;
  const restaurant =
    state.restaurants.find((item) => item.id === session.restaurantId) ?? state.restaurants[0]!;
  const [notice, setNotice] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const scope = { role: session.role, restaurantId: session.restaurantId };
  const actor = session.staffId ?? session.role;
  const result = api.customers.profile({
    customerId,
    restaurantId: restaurant.id,
    session: scope,
  });
  if (!result.ok) {
    return (
      <main className="demo-hub page-width">
        <h1>We couldn’t find that guest.</h1>
        <p>{result.error.message}</p>
        <a href="/app/customers">Back to customers</a>
      </main>
    );
  }
  const profile = result.data;
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Customer · {restaurant.name}
      </p>
      <h1>{profile.customer.name || "(removed)"}</h1>
      <p>
        {profile.customer.phoneE164}{" "}
        <button
          className="builder-secondary"
          onClick={() => {
            const revealed = api.customers.reveal({
              customerId,
              restaurantId: restaurant.id,
              actorId: actor,
              session: scope,
            });
            if (revealed.ok) setPhone(revealed.data.phone);
            else setNotice(revealed.error.message);
          }}
        >
          Reveal phone
        </button>
        {phone && <strong> {phone}</strong>}
      </p>
      <section className="builder-panel">
        <h2>Visit timeline</h2>
        {profile.visits.length === 0 && <p>No visits yet.</p>}
        {profile.visits.map((visit) => (
          <p className="visit-row" key={visit.id}>
            <span>
              {new Intl.DateTimeFormat("en-ZA", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(visit.createdAt))}
            </span>
            <strong>{visit.status === "valid" ? "Stamp collected" : "Stamp adjusted"}</strong>
          </p>
        ))}
      </section>
      <section className="builder-panel">
        <h2>Rewards</h2>
        {profile.rewards.length === 0 && <p>No rewards yet.</p>}
        {profile.rewards.map((reward) => (
          <p className="guest-list-item" key={reward.id}>
            <span>
              <strong>{reward.description}</strong>
              <small>{reward.redeemedAt ? "Redeemed" : "Waiting"}</small>
            </span>
          </p>
        ))}
      </section>
      <section className="builder-panel">
        <h2>Consent history</h2>
        {profile.consents.map((event) => (
          <p className="consent-history-row" key={event.id}>
            <strong>
              {event.purpose} · {event.action}
            </strong>
            <small>
              {event.source} ·{" "}
              {new Intl.DateTimeFormat("en-ZA", {
                dateStyle: "medium",
              }).format(new Date(event.createdAt))}
            </small>
          </p>
        ))}
      </section>
      <div className="demo-control-actions">
        <button
          onClick={() => {
            const stamped = api.customers.manualStamp({
              membershipId: profile.membership.id,
              actorId: actor,
              session: scope,
            });
            setNotice(stamped.ok ? "Manual stamp added." : stamped.error.message);
          }}
        >
          Add manual stamp
        </button>
        <button
          onClick={() => {
            const removed = api.customers.remove({
              membershipId: profile.membership.id,
              actorId: actor,
              session: scope,
            });
            setNotice(removed.ok ? "Removed from marketing; counts kept." : removed.error.message);
          }}
        >
          Remove from my list
        </button>
      </div>
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}
      <p>
        <a href="/app/customers">Back to customers</a>
      </p>
    </main>
  );
}
