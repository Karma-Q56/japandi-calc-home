import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  endSpecialFn,
  saveSpecialFn,
  setSpecialActiveFn,
} from "@/server/live-specials-fns";
import type { LiveSpecial } from "@/server/live-specials";
import {
  SPECIAL_KIND_HELP,
  SPECIAL_KIND_LABELS,
  specialGivesLine,
  type LiveSpecialInput,
  type SpecialKind,
} from "@/lib/live-specials";
import { Badge, DataTable, EmptyState, FormField } from "@/components/patron/dash";

const blank: LiveSpecialInput = {
  title: "",
  reward: "",
  kind: "public",
  startsAt: "",
  endsAt: "",
  percentOff: null,
  amountOffCents: null,
  active: true,
};

const STATUS_LABEL: Record<LiveSpecial["status"], string> = {
  scheduled: "Starts later",
  running: "Running",
  paused: "Paused",
  ended: "Ended",
};

/** Owner specials on the live database: list, write, pause and end. Uses the shared kit. */
export function LiveSpecialsTab({ specials }: { specials: LiveSpecial[] | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<LiveSpecialInput>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!specials) {
    return <EmptyState title="Specials are not ready" hint="Ask the Patron team to switch this restaurant to live." />;
  }

  const update = <K extends keyof LiveSpecialInput>(key: K, value: LiveSpecialInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const edit = (special: LiveSpecial) => {
    setEditingId(special.id);
    setDraft({
      title: special.title,
      reward: special.reward,
      kind: special.kind,
      startsAt: special.startsAt,
      endsAt: special.endsAt,
      percentOff: special.percentOff,
      amountOffCents: special.amountOffCents,
      active: special.active,
    });
    setNotice("");
  };

  const reset = () => {
    setEditingId(null);
    setDraft(blank);
  };

  const save = async () => {
    setBusy(true);
    setNotice("");
    const result = await saveSpecialFn({ data: { id: editingId, input: draft } });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setNotice(editingId ? "Special saved." : "Special added. Guests can see it now if it has started.");
    reset();
    await router.invalidate();
  };

  const toggle = async (special: LiveSpecial) => {
    setBusy(true);
    const result = await setSpecialActiveFn({ data: { id: special.id, active: !special.active } });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    await router.invalidate();
  };

  const end = async (special: LiveSpecial) => {
    setBusy(true);
    const result = await endSpecialFn({ data: { id: special.id } });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    await router.invalidate();
  };

  return (
    <section aria-label="Specials">
      {specials.length === 0 ? (
        <EmptyState
          title="No specials yet"
          hint="A special is a deal a guest can use at the till. Add the first one below."
        />
      ) : (
        <DataTable
          caption={`Specials for this restaurant`}
          rows={specials}
          columns={[
            {
              key: "special",
              header: "Special",
              cell: (special) => (
                <>
                  <strong>{special.title}</strong>
                  <small>
                    {SPECIAL_KIND_LABELS[special.kind]}
                    {special.code ? ` · Code ${special.code}` : ""} · {specialGivesLine(special)}
                  </small>
                </>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (special) => (
                <Badge tone={special.status === "running" ? "active" : undefined}>
                  {STATUS_LABEL[special.status]}
                </Badge>
              ),
            },
            { key: "uses", header: "Used", cell: (special) => special.uses },
            {
              key: "actions",
              header: "Change",
              cell: (special) => (
                <>
                  <button type="button" disabled={busy} onClick={() => edit(special)}>
                    Edit {special.title}
                  </button>{" "}
                  {special.status !== "ended" && (
                    <button type="button" disabled={busy} onClick={() => toggle(special)}>
                      {special.active ? `Pause ${special.title}` : `Restart ${special.title}`}
                    </button>
                  )}{" "}
                  {special.status !== "ended" && (
                    <button type="button" disabled={busy} onClick={() => end(special)}>
                      End {special.title}
                    </button>
                  )}
                </>
              ),
            },
          ]}
        />
      )}

      <form
        className="builder-panel"
        aria-labelledby="special-form-title"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h2 id="special-form-title">{editingId ? "Edit special" : "Add a special"}</h2>

        <FormField label="Name of the special" hint="Guests see this name. Up to 80 letters.">
          <input value={draft.title} onChange={(e) => update("title", e.target.value)} maxLength={80} />
        </FormField>

        <FormField label="What the guest gets" hint="For example: a free coffee with any meal. Up to 120 letters.">
          <input value={draft.reward} onChange={(e) => update("reward", e.target.value)} maxLength={120} />
        </FormField>

        <FormField label="Who can use it">
          <select
            value={draft.kind}
            onChange={(e) => update("kind", e.target.value as SpecialKind)}
            aria-describedby="special-kind-help"
          >
            {(Object.keys(SPECIAL_KIND_LABELS) as SpecialKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {SPECIAL_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
          <small id="special-kind-help">{SPECIAL_KIND_HELP[draft.kind]}</small>
        </FormField>

        <FormField label="Percent off" hint="Leave empty if the deal is not a percentage. Use this or the rand amount, not both.">
          <input
            type="number"
            min={1}
            max={100}
            value={draft.percentOff ?? ""}
            onChange={(e) => update("percentOff", e.target.value === "" ? null : Number(e.target.value))}
          />
        </FormField>

        <FormField label="Rand off" hint="Leave empty if the deal is not a fixed amount. Enter whole rand, for example 20.">
          <input
            type="number"
            min={1}
            value={draft.amountOffCents === null ? "" : draft.amountOffCents / 100}
            onChange={(e) =>
              update("amountOffCents", e.target.value === "" ? null : Math.round(Number(e.target.value) * 100))
            }
          />
        </FormField>

        <FormField label="Starts (South Africa time)" hint="Leave empty to start now.">
          <input
            type="datetime-local"
            value={draft.startsAt}
            onChange={(e) => update("startsAt", e.target.value)}
          />
        </FormField>

        <FormField label="Ends (South Africa time)" hint="Leave empty to keep it going until you end it.">
          <input type="datetime-local" value={draft.endsAt} onChange={(e) => update("endsAt", e.target.value)} />
        </FormField>

        <label>
          <input type="checkbox" checked={draft.active} onChange={(e) => update("active", e.target.checked)} />{" "}
          Turn this special on
        </label>

        <div className="page-actions">
          <button type="submit" className="builder-primary" disabled={busy}>
            {editingId ? "Save special" : "Add special"}
          </button>
          {editingId && (
            <button type="button" className="builder-secondary" onClick={reset} disabled={busy}>
              Cancel edit
            </button>
          )}
        </div>
        {notice && (
          <p role="status" className="demo-data-note">
            {notice}
          </p>
        )}
      </form>
    </section>
  );
}
