import { useState } from "react";
import { saveChallengeFn } from "@/server/live-challenges-fns";
import type { LiveChallenge } from "@/server/live-challenges";
import type { LiveChallengeInput, RewardType, ChallengeKind } from "@/lib/live-challenges";
import { challengeRuleLine, rewardLine } from "@/lib/live-challenges";
import { Badge, EmptyState, FormField } from "@/components/patron/dash";

const blank: LiveChallengeInput = {
  title: "",
  kind: "visits",
  visits: 3,
  windowDays: 14,
  weekdays: [],
  startHour: null,
  endHour: null,
  rewardType: "stamps",
  bonusStamps: 1,
  rewardItem: "",
  percentOff: null,
  amountOffCents: null,
  validDays: null,
  active: true,
};

const rewardValue = (c: LiveChallenge) => ({
  bonusStamps: c.bonusStamps,
  item: c.rewardItem,
  percent: c.percentOff,
  amountCents: c.amountOffCents,
});

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Owner challenges on the live database: list, write and pause. Uses the shared kit. */
export function LiveChallengesTab({ challenges }: { challenges: LiveChallenge[] | null }) {
  const [draft, setDraft] = useState<LiveChallengeInput>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!challenges) {
    return <EmptyState title="Sign in as the owner or a manager to see challenges." />;
  }

  const update = <K extends keyof LiveChallengeInput>(key: K, value: LiveChallengeInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const toggleDay = (day: number) =>
    update(
      "weekdays",
      draft.weekdays.includes(day) ? draft.weekdays.filter((d) => d !== day) : [...draft.weekdays, day].sort(),
    );

  const save = async () => {
    setBusy(true);
    setNotice("");
    const result = await saveChallengeFn({ data: { id: editingId, input: draft } });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setNotice("Saved. Guests see it straight away if it is showing.");
    setEditingId(null);
    setDraft(blank);
  };

  const edit = (challenge: LiveChallenge) => {
    setEditingId(challenge.id);
    const { id: _id, claimedByMe: _claimed, ...input } = challenge;
    setDraft(input);
    setNotice("");
  };

  const pauseOrShow = async (challenge: LiveChallenge) => {
    setBusy(true);
    const { claimedByMe: _ignored, id: _id, ...input } = challenge;
    const result = await saveChallengeFn({
      data: { id: challenge.id, input: { ...input, active: !challenge.active } },
    });
    setBusy(false);
    setNotice(result.ok ? "" : result.message);
  };

  return (
    <>
      <section className="builder-panel">
        <h2>Challenges guests can see</h2>
        {challenges.length === 0 ? (
          <EmptyState title="No challenges yet." hint="Write one below and save it." />
        ) : (
          <div className="challenge-owner-list">
            {challenges.map((challenge) => (
              <div className="challenge-owner-row" key={challenge.id}>
                <div>
                  <strong>{challenge.title}</strong>
                  <small>
                    {challengeRuleLine(challenge)} · {rewardLine(challenge.rewardType, rewardValue(challenge))}
                  </small>
                </div>
                <Badge tone={challenge.active ? "active" : undefined}>{challenge.active ? "Showing" : "Paused"}</Badge>
                <button className="builder-secondary" disabled={busy} onClick={() => edit(challenge)}>
                  Edit
                </button>
                <button className="builder-secondary" disabled={busy} onClick={() => pauseOrShow(challenge)}>
                  {challenge.active ? "Pause" : "Show"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="builder-panel">
        <h2>{editingId ? "Edit challenge" : "Write a challenge"}</h2>
        <div className="builder-fields">
          <FormField label="Challenge name" hint="What the guest reads.">
            <input value={draft.title} maxLength={70} onChange={(e) => update("title", e.target.value)} />
          </FormField>
          <FormField label="Kind">
            <select value={draft.kind} onChange={(e) => update("kind", e.target.value as ChallengeKind)}>
              <option value="visits">Visit N times in D days</option>
              <option value="quiet_days">Quiet-day challenge</option>
            </select>
          </FormField>
          <FormField label="Visits needed" hint="Between 2 and 50.">
            <input type="number" min={2} max={50} value={draft.visits} onChange={(e) => update("visits", Number(e.target.value))} />
          </FormField>
          <FormField label="Within how many days" hint="Between 1 and 365.">
            <input type="number" min={1} max={365} value={draft.windowDays} onChange={(e) => update("windowDays", Number(e.target.value))} />
          </FormField>
          {draft.kind === "quiet_days" && (
            <>
              <FormField label="Days" hint="Only visits on these days count.">
                <div role="group" aria-label="Days">
                  {DAY_NAMES.map((name, day) => (
                    <label key={name} style={{ marginRight: 8 }}>
                      <input type="checkbox" checked={draft.weekdays.includes(day)} onChange={() => toggleDay(day)} /> {name}
                    </label>
                  ))}
                </div>
              </FormField>
              <FormField label="From hour, 0 to 23 (optional)" hint="South African time. Leave blank for all day.">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={draft.startHour ?? ""}
                  onChange={(e) => update("startHour", e.target.value === "" ? null : Number(e.target.value))}
                />
              </FormField>
              <FormField label="Until hour, 1 to 24 (optional)">
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={draft.endHour ?? ""}
                  onChange={(e) => update("endHour", e.target.value === "" ? null : Number(e.target.value))}
                />
              </FormField>
            </>
          )}
          <FormField label="Reward">
            <select value={draft.rewardType} onChange={(e) => update("rewardType", e.target.value as RewardType)}>
              <option value="stamps">Bonus stamps</option>
              <option value="free_item">A free item</option>
              <option value="percent_off">Percent off</option>
              <option value="amount_off">Rand off</option>
            </select>
          </FormField>
          {draft.rewardType === "stamps" && (
            <FormField label="Bonus stamps" hint="Between 1 and 5.">
              <input type="number" min={1} max={5} value={draft.bonusStamps} onChange={(e) => update("bonusStamps", Number(e.target.value))} />
            </FormField>
          )}
          {draft.rewardType === "free_item" && (
            <FormField label="Free item">
              <input value={draft.rewardItem} maxLength={120} onChange={(e) => update("rewardItem", e.target.value)} />
            </FormField>
          )}
          {draft.rewardType === "percent_off" && (
            <FormField label="Percent off" hint="Whole number, 1 to 100.">
              <input type="number" min={1} max={100} value={draft.percentOff ?? ""} onChange={(e) => update("percentOff", Number(e.target.value))} />
            </FormField>
          )}
          {draft.rewardType === "amount_off" && (
            <FormField label="Rand off">
              <input
                type="number"
                min={1}
                value={draft.amountOffCents === null ? "" : draft.amountOffCents / 100}
                onChange={(e) => update("amountOffCents", Math.round(Number(e.target.value) * 100))}
              />
            </FormField>
          )}
          {draft.rewardType !== "stamps" && (
            <FormField label="Valid for how many days (optional)" hint="Blank means no end date.">
              <input
                type="number"
                min={1}
                max={365}
                value={draft.validDays ?? ""}
                onChange={(e) => update("validDays", e.target.value === "" ? null : Number(e.target.value))}
              />
            </FormField>
          )}
        </div>
        {notice && <p role="status" className="demo-data-note">{notice}</p>}
        <div className="page-actions">
          <button className="builder-primary" disabled={busy} onClick={save}>
            {editingId ? "Save changes" : "Save challenge"}
          </button>
          {editingId && (
            <button
              className="guest-back"
              onClick={() => {
                setEditingId(null);
                setDraft(blank);
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </section>
    </>
  );
}
