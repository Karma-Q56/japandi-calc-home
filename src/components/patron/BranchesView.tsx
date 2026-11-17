import { useState } from "react";
import { api } from "@/api";
import { useDemoState } from "@/data/useDemoState";
import { EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { branchesFor, demoPlanMax } from "@/domain/locations";
import type { BranchesState } from "@/server/live-locations";
import {
  createBranchFn,
  getBranchesFn,
  setBranchStateFn,
  updateBranchFn,
} from "@/server/live-locations-fns";

type Form = { name: string; address: string; suburb: string; city: string };
const EMPTY_FORM: Form = { name: "", address: "", suburb: "", city: "" };

type Row = {
  id: string;
  name: string;
  address: string | null;
  suburb: string | null;
  city: string;
  isMain: boolean;
  active: boolean;
  staffCount: number;
};

/** The branches screen. Live mode uses the server functions; demo mode uses the demo domain. */
export function BranchesView({
  live,
  initial,
}: {
  live: boolean;
  initial: BranchesState | null;
}) {
  const demo = useDemoState();
  const [liveState, setLiveState] = useState<BranchesState | null>(initial);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const restaurantId = demo.session.restaurantId ?? demo.restaurants[0]?.id ?? "";
  const demoPlan = demo.restaurants.find((r) => r.id === restaurantId)?.plan ?? "starter";
  const demoMax = demoPlanMax(restaurantId);
  const demoRows: Row[] = branchesFor(restaurantId).map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    suburb: l.suburb,
    city: l.city,
    isMain: l.isMain,
    active: l.active,
    staffCount: demo.staff.filter((s) => s.locationId === l.id && s.active).length,
  }));

  const rows: Row[] = live ? liveState?.branches ?? [] : demoRows;
  const maxBranches = live ? liveState?.maxBranches ?? 0 : demoMax;
  const activeCount = rows.filter((r) => r.active).length;

  async function reload() {
    if (live) setLiveState(await getBranchesFn());
  }

  function report(result: { ok: boolean; message?: string }, okText: string) {
    setMessage(result.ok ? okText : (result.message ?? "Something went wrong. Try again."));
    if (result.ok) {
      setForm(EMPTY_FORM);
      setEditingId(null);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (live) {
        const result = editingId
          ? await updateBranchFn({ data: { ...form, locationId: editingId } })
          : await createBranchFn({ data: form });
        report(result, editingId ? "Branch saved." : "Branch added.");
        await reload();
      } else {
        const result = editingId
          ? api.branch.update(restaurantId, editingId, form, demo.session.staffId ?? "owner")
          : api.branch.create(restaurantId, form, demo.session.staffId ?? "owner");
        report(result, editingId ? "Branch saved." : "Branch added.");
      }
    } catch {
      setMessage("We could not save that branch. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function act(row: Row, action: "main" | "off" | "on") {
    setBusy(true);
    try {
      if (live) {
        report(await setBranchStateFn({ data: { locationId: row.id, action } }), "Branch updated.");
        await reload();
      } else {
        const actor = demo.session.staffId ?? "owner";
        const result =
          action === "main"
            ? api.branch.makeMain(restaurantId, row.id, actor)
            : action === "off"
              ? api.branch.turnOff(restaurantId, row.id, actor)
              : api.branch.turnOn(restaurantId, row.id, actor);
        report(result, "Branch updated.");
      }
    } catch {
      setMessage("We could not change that branch. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: Row) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      address: row.address ?? "",
      suburb: row.suburb ?? "",
      city: row.city,
    });
    setMessage(null);
  }

  if (live && liveState === null) {
    return (
      <main className="demo-hub page-width">
        <PageHeader eyebrow="Branches" title="Branches" intro="Your branches." />
        <EmptyState
          title="Branches are not ready yet"
          hint="This screen is not connected to your live restaurant yet, so nothing is shown here."
        />
      </main>
    );
  }

  const atLimit = activeCount >= maxBranches;

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Branches"
        title="Your branches"
        intro="One main branch is always on. Your plan sets how many branches can be on at once."
      />
      <p>
        {activeCount} of {maxBranches} branches on in your plan ({demoPlan}).
      </p>
      <form onSubmit={save} aria-label={editingId ? "Edit branch" : "Add a branch"}>
        <FormField label="Branch name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={200}
          />
        </FormField>
        <FormField label="Street address">
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            maxLength={400}
          />
        </FormField>
        <FormField label="Suburb">
          <input
            value={form.suburb}
            onChange={(e) => setForm({ ...form, suburb: e.target.value })}
            maxLength={200}
          />
        </FormField>
        <FormField label="City">
          <input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            maxLength={200}
          />
        </FormField>
        <button type="submit" disabled={busy || (!editingId && atLimit)}>
          {editingId ? "Save branch" : "Add branch"}
        </button>
        {editingId ? (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm(EMPTY_FORM);
            }}
          >
            Cancel
          </button>
        ) : null}
      </form>
      {!editingId && atLimit ? (
        <p role="note">
          Your plan includes {maxBranches} branch{maxBranches === 1 ? "" : "es"}. Turn one off first, or ask Patron to change your plan.
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {rows.length === 0 ? (
        <EmptyState
          title="No branches yet"
          hint="Add your first branch above. It becomes the main branch."
        />
      ) : (
        <table>
          <caption>Your branches</caption>
          <thead>
            <tr>
              <th scope="col">Branch</th>
              <th scope="col">Address</th>
              <th scope="col">Team</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.name}
                  {row.isMain ? <small> (main)</small> : null}
                  {row.active ? null : <small> (off)</small>}
                </td>
                <td>{[row.address, row.suburb, row.city].filter(Boolean).join(", ")}</td>
                <td>{row.staffCount} on the team</td>
                <td>
                  <button type="button" onClick={() => startEdit(row)} disabled={busy}>
                    Edit {row.name}
                  </button>
                  {row.active && !row.isMain ? (
                    <button type="button" onClick={() => act(row, "main")} disabled={busy}>
                      Make {row.name} the main branch
                    </button>
                  ) : null}
                  {row.active && !row.isMain ? (
                    <button type="button" onClick={() => act(row, "off")} disabled={busy}>
                      Turn off {row.name}
                    </button>
                  ) : null}
                  {!row.active ? (
                    <button type="button" onClick={() => act(row, "on")} disabled={busy}>
                      Turn on {row.name}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
