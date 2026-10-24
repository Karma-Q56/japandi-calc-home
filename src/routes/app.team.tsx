import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";

export const Route = createFileRoute("/app/team")({
  beforeLoad: () => {
    if (!requireRole("owner")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: Team,
});

function Team() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [shownPin, setShownPin] = useState<{ staff: string; pin: string } | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const staff = state.staff.filter((s) => s.restaurantId === restaurant.id);
  const lastResult = api.team.lastStamps(restaurant.id);
  const lastStamps: Record<string, string | null> = lastResult.ok ? lastResult.data : {};

  const add = () => {
    const result = api.team.add(restaurant.id, name);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setName("");
    setNotice("Staff member added. Issue them a PIN below.");
  };

  const issue = async (staffId: string, displayName: string) => {
    const actor = state.session.staffId ?? "owner";
    const result = await api.team.issuePin(staffId, actor, restaurant.id);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setShownPin({ staff: displayName, pin: result.data.pin });
    setNotice("");
  };

  const createCode = async () => {
    const actor = state.session.staffId ?? "owner";
    const result = await api.team.createPairingCode(restaurant.id, actor);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setPairing(result.data.code);
  };

  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Team · {restaurant.name}
      </p>
      <h1>Who works the till.</h1>
      <p className="demo-intro">
        A 4-digit PIN is a convenience, not a lock. The real protections are till pairing, lockout
        after 5 wrong tries, restaurant scope, and the audit trail.
      </p>
      {staff.map((member) => (
        <article className="guest-list-item" key={member.id}>
          <span>
            <strong>{member.displayName}</strong>
            <small>
              {member.active ? "Active" : "Deactivated"} · Last stamp:{" "}
              {lastStamps[member.id]
                ? new Intl.DateTimeFormat("en-ZA", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(lastStamps[member.id]!))
                : "never"}
            </small>
          </span>
          <span className="status-open">
            <button
              className="builder-secondary"
              onClick={() => void issue(member.id, member.displayName)}
            >
              {member.pinHash ? "Reset PIN" : "Set PIN"}
            </button>{" "}
            <button
              className="builder-secondary"
              onClick={() => {
                api.team.setActive(member.id, !member.active);
              }}
            >
              {member.active ? "Deactivate" : "Activate"}
            </button>
          </span>
        </article>
      ))}
      {shownPin && (
        <section className="builder-panel" role="status">
          <h2>PIN for {shownPin.staff}</h2>
          <p>
            <strong className="member-code">{shownPin.pin}</strong>
          </p>
          <p>Shown once, write it down for them now.</p>
          <button className="builder-secondary" onClick={() => setShownPin(null)}>
            Done
          </button>
        </section>
      )}
      <section className="builder-panel">
        <h2>Add someone</h2>
        <label className="builder-field">
          First name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
        </label>
        <button className="builder-primary" onClick={add}>
          Add staff
        </button>
      </section>
      <section className="builder-panel">
        <h2>Pair a till</h2>
        <p>Codes are 8 characters, valid 10 minutes, single use.</p>
        <button className="builder-secondary" onClick={() => void createCode()}>
          Generate pairing code
        </button>
        {pairing && (
          <p role="status">
            <strong className="member-code">{pairing}</strong>, enter it on the till device.
          </p>
        )}
      </section>
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}
      <p>
        <a href="/">Back to Patron</a>
      </p>
    </main>
  );
}
