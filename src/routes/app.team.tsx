import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { branchLabel } from "@/lib/live-locations";
import { getDataModeFn } from "@/server/live";
import { LiveTeam } from "@/components/patron/LiveTeam";
import { ConfirmDialog, EmptyState, FormField, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";

export const Route = createFileRoute("/app/team")({
  loader: async () => {
    const { mode } = await getDataModeFn();
    return { mode };
  },
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    // Live mode is guarded by the signed-in owner on the server.
    if (mode === "live") return;
    if (!requireRole("owner")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: Team,
});

function Team() {
  const { mode } = Route.useLoaderData();
  return mode === "live" ? <LiveTeam /> : <DemoTeam />;
}

function DemoTeam() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [shownPin, setShownPin] = useState<{ staff: string; pin: string } | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [pairingBranch, setPairingBranch] = useState("");
  const staff = state.staff.filter((s) => s.restaurantId === restaurant.id);
  const branches = api.branch.list(restaurant.id).filter((b) => b.active);
  const mainBranch = branches.find((b) => b.isMain) ?? branches[0];
  const currentPairingBranch = pairingBranch || mainBranch?.id || "";
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

  const changeBranch = (staffId: string, value: string) => {
    const actor = state.session.staffId ?? "owner";
    const allBranches = value === "all";
    const result = api.branch.setStaff(
      restaurant.id,
      staffId,
      allBranches ? null : value,
      allBranches,
      actor,
    );
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice("");
  };

  const createCode = async () => {
    const actor = state.session.staffId ?? "owner";
    const result = await api.team.createPairingCode(
      restaurant.id,
      actor,
      currentPairingBranch || null,
    );
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setPairing(result.data.code);
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Team · ${restaurant.name}`}
        title="Who works the till"
        intro="A 4-digit PIN is a convenience, not a lock. The real protections are till pairing, lockout after 5 wrong tries, restaurant scope, and the audit trail."
      />
      <StatGrid>
        <StatCard
          value={staff.filter((member) => member.active).length}
          label="Active on the till"
        />
        <StatCard
          value={staff.length}
          label="People on your team"
          hint="Add someone below, then set their PIN"
        />
      </StatGrid>
      {staff.length === 0 && (
        <EmptyState
          title="No one on the team yet"
          hint="Add the first staff member below. Each person gets their own PIN for the till."
        />
      )}
      {staff.map((member) => (
        <article className="guest-list-item" key={member.id}>
          <span>
            <strong>{member.displayName}</strong>
            <small>
              {member.active ? "Active" : "Deactivated"} · Last stamp:{" "}
              {lastStamps[member.id]
                ? new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg",
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(lastStamps[member.id]!))
                : "never"}
            </small>
          </span>
          <span className="row-actions">
            <FormField label="Branch">
              <select
                value={member.allBranches ? "all" : (member.locationId ?? "")}
                disabled={branches.length === 0}
                onChange={(event) => changeBranch(member.id, event.target.value)}
              >
                <option value="all">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branchLabel(branch.name, branch.isMain)}
                  </option>
                ))}
              </select>
            </FormField>
            <button
              className="builder-secondary"
              onClick={() => void issue(member.id, member.displayName)}
            >
              {member.pinHash ? "Reset PIN" : "Set PIN"}
            </button>
            {member.active ? (
              <ConfirmDialog
                label="Deactivate"
                question={`Deactivate ${member.displayName}? Their PIN stops working on the till.`}
                confirmLabel="Yes, deactivate"
                buttonClass="builder-secondary is-danger"
                onConfirm={() => { api.team.setActive(member.id, !member.active); }}
              />
            ) : (
              <button className="builder-secondary" onClick={() => { api.team.setActive(member.id, !member.active); }}>
                Activate
              </button>
            )}
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
        <FormField label="First name">
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
        </FormField>
        <button className="builder-primary" onClick={add}>
          Add staff
        </button>
      </section>
      <section className="builder-panel">
        <h2>Pair a till</h2>
        <p>Codes are 8 letters or numbers, valid for 10 minutes and can be used once.</p>
        <FormField label="Branch for this till">
          <select
            value={currentPairingBranch}
            disabled={branches.length === 0}
            onChange={(event) => setPairingBranch(event.target.value)}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branchLabel(branch.name, branch.isMain)}
              </option>
            ))}
          </select>
        </FormField>
        <button
          className="builder-secondary"
          disabled={!currentPairingBranch}
          onClick={() => void createCode()}
        >
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
