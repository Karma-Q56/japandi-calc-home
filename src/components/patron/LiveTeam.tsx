import { useEffect, useState } from "react";
import {
  addStaffFn,
  createTillPairingFn,
  getTeamFn,
  resetStaffPinFn,
  setStaffActiveFn,
} from "@/server/live";
import { getBranchesFn, setStaffBranchFn } from "@/server/live-locations-fns";
import type { BranchRow } from "@/server/live-locations";
import type { LiveStaffRow } from "@/server/live-till";
import { branchLabel } from "@/lib/live-locations";
import { EmptyState, FormField, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";

/**
 * Live team screen. Same shape as the demo screen, but every read and write
 * goes through the server, which enforces owner-only access.
 */
export function LiveTeam() {
  const [staff, setStaff] = useState<LiveStaffRow[] | null>(null);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [shownPin, setShownPin] = useState<{ staff: string; pin: string } | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const [tick, setTick] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [pairingBranch, setPairingBranch] = useState("");

  const load = async () => {
    const result = await getTeamFn();
    if (!result) {
      setStaff([]);
      setNotice("Sign in again.");
      return;
    }
    setStaff(result.staff);
  };

  useEffect(() => {
    void load();
    void getBranchesFn().then((state) => {
      const active = (state?.branches ?? []).filter((branch) => branch.active);
      setBranches(active);
      setPairingBranch((current) => current || active.find((b) => b.isMain)?.id || active[0]?.id || "");
    });
  }, []);

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  const add = async () => {
    const result = await addStaffFn({ data: { name } });
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setName("");
    setNotice("");
    setShownPin({ staff: name.trim(), pin: result.pin });
    await load();
  };

  const reset = async (staffId: string, displayName: string) => {
    setBusy(true);
    const result = await resetStaffPinFn({ data: { staffId } });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setNotice("");
    setShownPin({ staff: displayName, pin: result.pin });
  };

  const toggle = async (member: LiveStaffRow) => {
    const result = await setStaffActiveFn({ data: { staffId: member.id, active: !member.active } });
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setNotice("");
    await load();
  };

  const changeBranch = async (member: LiveStaffRow, value: string) => {
    const allBranches = value === "all";
    setBusy(true);
    const result = await setStaffBranchFn({
      data: {
        staffId: member.id,
        locationId: allBranches ? null : value,
        allBranches,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setNotice("");
    await load();
  };

  const createCode = async () => {
    const result = await createTillPairingFn({
      data: { locationId: pairingBranch || null },
    });
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setNotice("");
    setPairing({ code: result.code, expiresAt: Date.parse(result.expiresAt) });
  };

  const secondsLeft = pairing ? Math.max(0, Math.round((pairing.expiresAt - tick) / 1000)) : 0;
  const liveStaff = staff ?? [];
  const active = liveStaff.filter((member) => member.active).length;

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Team"
        title="Who works the till"
        intro="A 4-digit PIN is a convenience, not a lock. The real protections are till pairing, lockout after 5 wrong tries, restaurant scope, and the audit trail."
      />
      <StatGrid>
        <StatCard value={active} label="Active on the till" />
        <StatCard
          value={liveStaff.length}
          label="People on your team"
          hint="Add someone below, then set their PIN"
        />
      </StatGrid>
      {staff !== null && liveStaff.length === 0 && (
        <EmptyState
          title="No one on the team yet"
          hint="Add the first staff member below. Each person gets their own PIN for the till."
        />
      )}
      {liveStaff.map((member) => (
        <article className="guest-list-item" key={member.id}>
          <span>
            <strong>{member.displayName}</strong>
            <small>
              {member.active ? "Active" : "Deactivated"} · Last stamp:{" "}
              {member.lastStampAt
                ? new Intl.DateTimeFormat("en-ZA", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(member.lastStampAt))
                : "never"}
            </small>
          </span>
          <span className="row-actions">
            <FormField label="Branch">
              <select
                value={member.allBranches ? "all" : (member.locationId ?? "")}
                disabled={busy || branches.length === 0}
                onChange={(event) => void changeBranch(member, event.target.value)}
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
              disabled={busy}
              onClick={() => void reset(member.id, member.displayName)}
            >
              Reset PIN
            </button>
            <button className="builder-secondary" disabled={busy} onClick={() => void toggle(member)}>
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
          <p>Show this PIN to your team member now. We cannot show it again.</p>
          <p className="demo-data-note">
            A 4-digit PIN is only part of the protection. The till is paired to this restaurant,
            locks after 5 wrong tries, and every stamp is recorded and can be undone.
          </p>
          <button className="builder-secondary" onClick={() => setShownPin(null)}>
            Done
          </button>
        </section>
      )}
      <section className="builder-panel">
        <h2>Add someone</h2>
        <FormField label="First name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            disabled={busy}
          />
        </FormField>
        <button className="builder-primary" disabled={busy || !name.trim()} onClick={() => void add()}>
          Add staff
        </button>
      </section>
      <section className="builder-panel">
        <h2>Pair a till</h2>
        <p>Codes are 8 letters or numbers, valid for 10 minutes and can be used once.</p>
        <FormField label="Branch for this till">
          <select
            value={pairingBranch}
            disabled={busy || branches.length === 0}
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
          disabled={busy || !pairingBranch}
          onClick={() => void createCode()}
        >
          Generate pairing code
        </button>
        {pairing && (
          <p role="status">
            <strong className="member-code">{pairing.code}</strong>, enter it on the till device.{" "}
            {secondsLeft > 0
              ? `Valid for ${Math.floor(secondsLeft / 60)} minutes ${secondsLeft % 60} seconds.`
              : "That code has expired. Generate a new one."}
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
