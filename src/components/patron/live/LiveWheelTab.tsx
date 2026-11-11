import { useEffect, useState } from "react";
import { getWheelFn, saveWheelFn } from "@/server/live-wheel-fns";
import type { OwnerWheel, WheelPrize } from "@/server/live-wheel";
import {
  MAX_PRIZES,
  WHEEL_MODE_LABELS,
  probabilitySentence,
  type PrizeInput,
  type PrizeType,
  type WheelMode,
} from "@/lib/live-wheel";
import { EmptyState, FormField, Helper } from "@/components/patron/dash";

const blankPrize = (): PrizeInput => ({
  label: "",
  weight: 10,
  rewardType: "stamps",
  bonusStamps: 1,
  rewardItem: "",
  percentOff: null,
  amountOffCents: null,
  validDays: null,
});

const toInput = (p: WheelPrize): PrizeInput => ({
  label: p.label,
  weight: p.weight,
  rewardType: p.rewardType,
  bonusStamps: p.bonusStamps,
  rewardItem: p.rewardItem,
  percentOff: p.percentOff,
  amountOffCents: p.amountOffCents,
  validDays: p.validDays,
});

const PRIZE_TYPE_LABELS: Record<PrizeType, string> = {
  stamps: "Bonus stamps",
  free_item: "A free item",
  percent_off: "Percent off",
  amount_off: "Rand off",
};

/** Owner wheel settings and prizes on the live database. Loads its own data. Uses the shared kit. */
export function LiveWheelTab() {
  const [wheel, setWheel] = useState<OwnerWheel | null | undefined>(undefined);
  useEffect(() => {
    getWheelFn().then(setWheel).catch(() => setWheel(null));
  }, []);
  if (wheel === undefined) return <Helper>Loading the wheel.</Helper>;
  if (!wheel) {
    return <EmptyState title="Sign in as the owner or a manager to set up the wheel." />;
  }
  return <WheelForm initial={wheel} />;
}

function WheelForm({ initial }: { initial: OwnerWheel }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [mode, setMode] = useState<WheelMode>(initial.mode);
  const [every, setEvery] = useState(initial.earnEveryVisits);
  const [prizes, setPrizes] = useState<PrizeInput[]>(initial.prizes.map(toInput));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState("");

  const setPrize = (index: number, patch: Partial<PrizeInput>) =>
    setPrizes((current) => current.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const save = async () => {
    setBusy(true);
    setNotice("");
    const result = await saveWheelFn({
      data: {
        enabled,
        mode,
        earnEveryVisits: every,
        prizes: prizes.map((p) => ({
          ...p,
          bonusStamps: p.rewardType === "stamps" ? p.bonusStamps : null,
          rewardItem: p.rewardType === "free_item" ? p.rewardItem : "",
          percentOff: p.rewardType === "percent_off" ? p.percentOff : null,
          amountOffCents: p.rewardType === "amount_off" ? p.amountOffCents : null,
        })),
      },
    });
    setBusy(false);
    setNotice(result.ok ? "Saved. Guests see the new wheel from now on." : result.message);
  };

  return (
    <section className="builder-panel" aria-label="Spin">
      <FormField label="Spin wheel">
        <label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Guests can spin
        </label>
      </FormField>

      <FormField label="How guests get spins">
        <select value={mode} onChange={(e) => setMode(e.target.value as WheelMode)}>
          {(Object.keys(WHEEL_MODE_LABELS) as WheelMode[]).map((m) => (
            <option key={m} value={m}>
              {WHEEL_MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </FormField>

      {mode === "earned" && (
        <FormField label="One spin for every this many visits">
          <input
            type="number"
            min={1}
            max={100}
            value={every}
            onChange={(e) => setEvery(Number(e.target.value))}
          />
        </FormField>
      )}

      <h3>Prizes ({prizes.length} of {MAX_PRIZES})</h3>
      {prizes.map((p, index) => (
        <div key={index} className="builder-panel">
          <FormField label="Name on the wheel">
            <input value={p.label} maxLength={80} onChange={(e) => setPrize(index, { label: e.target.value })} />
          </FormField>
          <FormField label="Chance weight (1 to 1000)">
            <input
              type="number"
              min={1}
              max={1000}
              value={p.weight}
              onChange={(e) => setPrize(index, { weight: Number(e.target.value) })}
            />
          </FormField>
          <FormField label="What the guest wins">
            <select
              value={p.rewardType}
              onChange={(e) => setPrize(index, { rewardType: e.target.value as PrizeType })}
            >
              {(Object.keys(PRIZE_TYPE_LABELS) as PrizeType[]).map((t) => (
                <option key={t} value={t}>
                  {PRIZE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>
          {p.rewardType === "stamps" && (
            <FormField label="Stamps added (1 to 5)">
              <input
                type="number"
                min={1}
                max={5}
                value={p.bonusStamps ?? 1}
                onChange={(e) => setPrize(index, { bonusStamps: Number(e.target.value) })}
              />
            </FormField>
          )}
          {p.rewardType === "free_item" && (
            <FormField label="Free item">
              <input value={p.rewardItem} maxLength={80} onChange={(e) => setPrize(index, { rewardItem: e.target.value })} />
            </FormField>
          )}
          {p.rewardType === "percent_off" && (
            <FormField label="Percent off (1 to 100)">
              <input
                type="number"
                min={1}
                max={100}
                value={p.percentOff ?? 10}
                onChange={(e) => setPrize(index, { percentOff: Number(e.target.value) })}
              />
            </FormField>
          )}
          {p.rewardType === "amount_off" && (
            <FormField label="Rand off (in cents, for example 5000 is R50)">
              <input
                type="number"
                min={1}
                value={p.amountOffCents ?? 5000}
                onChange={(e) => setPrize(index, { amountOffCents: Number(e.target.value) })}
              />
            </FormField>
          )}
          <button type="button" onClick={() => setPrizes((current) => current.filter((_, i) => i !== index))}>
            Remove prize
          </button>
        </div>
      ))}
      {prizes.length < MAX_PRIZES && (
        <button type="button" onClick={() => setPrizes((current) => [...current, blankPrize()])}>
          Add prize
        </button>
      )}

      <Helper>{probabilitySentence(prizes)}</Helper>

      <button type="button" onClick={() => setTested(probabilitySentence(prizes))}>
        Test the wheel
      </button>
      {tested && <Helper>{`Test only, no spin used and no reward made. ${tested}`}</Helper>}

      <button type="button" onClick={save} disabled={busy}>
        Save wheel
      </button>
      {notice && <Helper>{notice}</Helper>}
    </section>
  );
}
