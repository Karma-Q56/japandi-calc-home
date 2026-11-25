import { useState } from "react";
import { EmptyState, FormField, Helper } from "@/components/patron/dash";
import { Switch } from "@/components/patron/Switch";
import { SpinWheelSvg } from "@/components/patron/SpinWheelSvg";
import { saveOwnerWheelFn, testOwnerWheelFn } from "@/server/live-wheel-fns";
import type { OwnerWheel } from "@/server/live-wheel";
import {
  EARN_EVERY_MAX,
  EARN_EVERY_MIN,
  LABEL_LIMIT,
  MAX_PRIZES,
  PRIZE_TYPES,
  WEEKLY_CAP_MAX,
  WHEEL_MODES,
  WEIGHT_MAX,
  blankPrize,
  limitLine,
  oddsLines,
  prizeEligible,
  prizeSummary,
  validateWheel,
  wheelSegments,
  winChanceLine,
  type PrizeType,
  type WheelMode,
  type WheelPrizeInput,
  type WheelSettingsInput,
} from "@/lib/live-wheel";

const SAVE_LABEL = "Save wheel";
const TEST_LABEL = "Test the wheel";

const rands = (cents: number | null) => (cents === null ? "" : String(cents / 100));
const toCents = (value: string): number | null => {
  const clean = value.trim();
  if (clean === "") return null;
  const number = Number(clean);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
};
const toWhole = (value: string): number | null => {
  const clean = value.trim();
  if (clean === "") return null;
  const number = Number(clean);
  return Number.isFinite(number) ? Math.round(number) : null;
};

/** The owner's spin wheel on the live database: switch it on, pick the kind, write the prizes, test it. */
export function LiveWheelTab({ wheel }: { wheel: OwnerWheel | null }) {
  if (!wheel) {
    return <EmptyState title="Sign in as the owner or a manager to set up the spin wheel." />;
  }
  return <WheelEditor initial={wheel} />;
}

function WheelEditor({ initial }: { initial: OwnerWheel }) {
  const [saved, setSaved] = useState<WheelSettingsInput>(initial);
  const [draft, setDraft] = useState<WheelSettingsInput>(initial);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ spinId: number; winnerId: string | null; label: string } | null>(null);
  const [testNotice, setTestNotice] = useState("");

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const problem = validateWheel(draft);

  const update = <K extends keyof WheelSettingsInput>(key: K, value: WheelSettingsInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const updatePrize = (index: number, patch: Partial<WheelPrizeInput>) =>
    setDraft((current) => ({
      ...current,
      prizes: current.prizes.map((prize, i) => (i === index ? { ...prize, ...patch } : prize)),
    }));

  const segments = wheelSegments(
    draft.prizes
      .map((prize, index) => ({ prize, id: `p${index}` }))
      .filter(({ prize }) => prizeEligible(prize, draft.mode, draft.floorCents))
      .map(({ prize, id }) => ({ id, label: prize.label.trim(), weight: prize.weight })),
  );

  const save = async () => {
    if (problem) {
      setNotice(problem);
      return;
    }
    setBusy(true);
    try {
      const result = await saveOwnerWheelFn({ data: draft });
      if (result.ok) {
        setSaved(draft);
        setNotice(
          draft.enabled
            ? "Saved. Guests can spin the wheel now."
            : "Saved. The wheel is switched off, so guests do not see it.",
        );
      } else {
        setNotice(result.message);
      }
    } catch {
      setNotice("Could not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTestNotice("");
    try {
      const result = await testOwnerWheelFn();
      if (!result.ok) {
        setTestNotice(result.message);
        return;
      }
      const match = segments.find((segment) => segment.label === result.prizeLabel);
      setTest({ spinId: Date.now(), winnerId: match?.id ?? null, label: result.prizeLabel });
    } catch {
      setTestNotice("Could not test the wheel. Check your connection and try again.");
    }
  };

  const odds = oddsLines(draft);
  const winLine = winChanceLine(draft);
  const mode = WHEEL_MODES.find((item) => item.mode === draft.mode);

  return (
    <>
      <section className="builder-panel" aria-label="Spin wheel">
        <h2>Spin wheel</h2>
        <Helper>
          A little game for guests who keep coming back. Spins come from visits, never from spending, and every result
          is drawn by Patron, not by the guest's phone.
        </Helper>
        <div className="builder-fields">
          <Switch
            label="Spin wheel on"
            hint="Off until you switch it on. Guests only see it on their card once it is on."
            checked={draft.enabled}
            onChange={(next) => update("enabled", next)}
          />
          <FormField label="Kind of wheel" {...(mode ? { hint: mode.description } : {})}>
            <select value={draft.mode} onChange={(event) => update("mode", event.target.value as WheelMode)}>
              {WHEEL_MODES.map((item) => (
                <option key={item.mode} value={item.mode}>
                  {item.title}
                </option>
              ))}
            </select>
          </FormField>
          {draft.mode === "earned" && (
            <FormField
              label="A spin every how many visits"
              hint={`${EARN_EVERY_MIN} to ${EARN_EVERY_MAX}. Only visits recorded from now on count.`}
            >
              <input
                type="number"
                min={EARN_EVERY_MIN}
                max={EARN_EVERY_MAX}
                value={draft.earnEvery}
                onChange={(event) => update("earnEvery", Number(event.target.value))}
              />
            </FormField>
          )}
          {draft.mode === "reward_decider" && (
            <FormField
              label="Never worth less than (R)"
              hint="Only rewards you say are worth at least this much can be drawn. If none is, the guest keeps the reward they earned."
            >
              <input
                type="number"
                min={0}
                max={10000}
                step="0.01"
                value={rands(draft.floorCents)}
                onChange={(event) => update("floorCents", toCents(event.target.value) ?? 0)}
              />
            </FormField>
          )}
        </div>
      </section>

      <section className="builder-panel" aria-label="Prizes">
        <h2>Prizes</h2>
        <Helper>
          Up to {MAX_PRIZES} prizes. The chance is a weight: a prize with 2 comes up twice as often as one with 1. A
          chance of 0 switches a prize off. You can also limit how often a prize is won in a week. When every prize
          has reached its limit, the wheel rests and guests keep their spins until a win is 7 days old.
        </Helper>
        {draft.prizes.length === 0 && <p className="demo-data-note">No prizes yet. Add your first one.</p>}
        {draft.prizes.map((prize, index) => (
          <PrizeRow
            key={index}
            index={index}
            prize={prize}
            mode={draft.mode}
            onChange={(patch) => updatePrize(index, patch)}
            onRemove={() => update("prizes", draft.prizes.filter((_, i) => i !== index))}
          />
        ))}
        <div className="page-actions">
          <button
            type="button"
            className="builder-secondary"
            disabled={draft.prizes.length >= MAX_PRIZES}
            onClick={() => update("prizes", [...draft.prizes, blankPrize()])}
          >
            Add a prize
          </button>
        </div>
      </section>

      <section className="builder-panel" aria-label="Odds and preview">
        <h2>Odds and preview</h2>
        {odds.length === 0 ? (
          <Helper>Add a real prize with a chance above 0 to see the odds.</Helper>
        ) : (
          <>
            {winLine && <p className="builder-hint">{winLine}</p>}
            <ul className="wheel-odds">
              {odds.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        )}
        <SpinWheelSvg
          segments={segments}
          winnerId={test?.winnerId ?? null}
          spinId={test?.spinId}
        />
        <div className="page-actions">
          <button type="button" className="builder-secondary" disabled={dirty || !saved.prizes.length} onClick={runTest}>
            {TEST_LABEL}
          </button>
          {dirty && <p className="te-help">Save your changes first, then test the saved wheel.</p>}
          {test && (
            <p className="builder-hint" role="status">
              Test result: {test.label}. This was only a test. It used nobody's spin and gave nobody a prize.
            </p>
          )}
          {testNotice && (
            <p className="te-help" role="status">
              {testNotice}
            </p>
          )}
        </div>
      </section>

      <div className="page-actions">
        <button className="builder-primary" type="button" disabled={busy} onClick={save}>
          {SAVE_LABEL}
        </button>
        {problem && <p className="te-help">{problem}</p>}
        {notice && (
          <p className="builder-hint" role="status">
            {notice}
          </p>
        )}
      </div>
    </>
  );
}

function PrizeRow({
  index,
  prize,
  mode,
  onChange,
  onRemove,
}: {
  index: number;
  prize: WheelPrizeInput;
  mode: WheelMode;
  onChange: (patch: Partial<WheelPrizeInput>) => void;
  onRemove: () => void;
}) {
  const worthApplies = mode === "reward_decider" && (prize.type === "free_item" || prize.type === "percent_off");
  return (
    <fieldset className="wheel-prize">
      <legend>
        Prize {index + 1}: {prizeSummary(prize)}
      </legend>
      <div className="builder-fields">
        <FormField label={`Name · up to ${LABEL_LIMIT} characters`}>
          <input
            value={prize.label}
            maxLength={LABEL_LIMIT}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </FormField>
        <FormField label="What the guest gets">
          <select
            value={prize.type}
            onChange={(event) => {
              const type = event.target.value as PrizeType;
              onChange({
                type,
                stamps: type === "stamps" ? (prize.stamps ?? 1) : null,
                percentOff: type === "percent_off" ? (prize.percentOff ?? 10) : null,
                amountOffCents: type === "amount_off" ? (prize.amountOffCents ?? 2000) : null,
                weeklyCap: type === "nothing" ? null : prize.weeklyCap,
              });
            }}
          >
            {PRIZE_TYPES.map((item) => (
              <option key={item.type} value={item.type}>
                {item.label}
              </option>
            ))}
          </select>
        </FormField>
        {prize.type === "stamps" && (
          <FormField label="How many stamps" hint="1 to 5.">
            <input
              type="number"
              min={1}
              max={5}
              value={prize.stamps ?? ""}
              onChange={(event) => onChange({ stamps: toWhole(event.target.value) })}
            />
          </FormField>
        )}
        {prize.type === "percent_off" && (
          <FormField label="Percent off" hint="1 to 100.">
            <input
              type="number"
              min={1}
              max={100}
              value={prize.percentOff ?? ""}
              onChange={(event) => onChange({ percentOff: toWhole(event.target.value) })}
            />
          </FormField>
        )}
        {prize.type === "amount_off" && (
          <FormField label="Rand off">
            <input
              type="number"
              min={1}
              step="0.01"
              value={rands(prize.amountOffCents)}
              onChange={(event) => onChange({ amountOffCents: toCents(event.target.value) })}
            />
          </FormField>
        )}
        {worthApplies && (
          <FormField label="Worth to you (R)" hint="Used for the smallest value rule above.">
            <input
              type="number"
              min={0}
              max={10000}
              step="0.01"
              value={rands(prize.valueCents)}
              onChange={(event) => onChange({ valueCents: toCents(event.target.value) ?? 0 })}
            />
          </FormField>
        )}
        {(prize.type === "free_item" || prize.type === "percent_off" || prize.type === "amount_off") && (
          <FormField label="Valid for how many days" hint="1 to 365. Leave empty for no expiry.">
            <input
              type="number"
              min={1}
              max={365}
              value={prize.validDays ?? ""}
              onChange={(event) => onChange({ validDays: toWhole(event.target.value) })}
            />
          </FormField>
        )}
        <FormField label="Chance" hint={`0 to ${WEIGHT_MAX}.`}>
          <input
            type="number"
            min={0}
            max={WEIGHT_MAX}
            value={prize.weight}
            onChange={(event) => onChange({ weight: Number(event.target.value) })}
          />
        </FormField>
        {prize.type !== "nothing" && (
          <FormField
            label="Most wins in a week"
            hint="Optional. It counts wins, not money. Leave empty for no limit."
          >
            <input
              type="number"
              min={1}
              max={WEEKLY_CAP_MAX}
              value={prize.weeklyCap ?? ""}
              onChange={(event) => onChange({ weeklyCap: toWhole(event.target.value) })}
            />
          </FormField>
        )}
        {limitLine(prize) && <p className="builder-hint">{limitLine(prize)}</p>}
      </div>
      <button type="button" className="builder-secondary is-danger" onClick={onRemove}>
        Remove prize {index + 1}
      </button>
    </fieldset>
  );
}
