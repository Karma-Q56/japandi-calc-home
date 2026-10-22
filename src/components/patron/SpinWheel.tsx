import { useState } from "react";
import { useSyncExternalStore } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import type { SpinMode, SpinResult } from "@/data/types";
import { spinModeLabel } from "@/domain/spins";

/** Guest-facing spin control. The result is chosen by the domain layer, never here. */
export function SpinWheel({ membershipId }: { membershipId: string }) {
  useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [mode, setMode] = useState<SpinMode | null>(null);
  const state = api.spin.state(membershipId);
  if (!state.enabled) return null;
  const availableModes: SpinMode[] = [
    ...(state.joinAvailable ? (["join"] as const) : []),
    ...(state.earnedEnabled ? (["earned"] as const) : []),
    ...(state.rewardDeciderEnabled ? (["reward_decider"] as const) : []),
    ...(state.dailySurpriseEnabled ? (["daily_surprise"] as const) : []),
  ];
  if (availableModes.length === 0) return null;
  // Open on the first mode the guest can actually use (welcome spin first).
  const activeMode = (mode && availableModes.includes(mode) ? mode : availableModes[0])!;
  const blocked =
    (activeMode === "join" && !state.joinAvailable) ||
    (activeMode === "earned" && state.earned <= 0) ||
    (activeMode === "reward_decider" && !state.rewardReady) ||
    (activeMode === "daily_surprise" && state.dailyAlreadyUsed);

  const spin = () => {
    if (spinning) return;
    setError("");
    setSpinning(true);
    window.setTimeout(() => {
      const outcome = api.spin.wheel({ restaurantId: restaurantIdFor(), membershipId, mode: activeMode });
      setSpinning(false);
      if (!outcome.ok) {
        setError(outcome.error.message);
        return;
      }
      setResult(outcome.data);
      // One-shot modes fall back to the next wheel the guest can still use.
      if (activeMode !== "earned") setMode(null);
    }, 700);
  };

  function restaurantIdFor(): string {
    const membership = demoRepo.read().memberships.find((item) => item.id === membershipId);
    return membership?.restaurantId ?? "";
  }

  const prizeCode = result?.prizeSpecialId
    ? demoRepo
        .read()
        .specialCodes.find((item) => item.specialId === result.prizeSpecialId && item.membershipId === membershipId)
    : undefined;

  const buttonLabel = () => {
    if (spinning) return "Spinning…";
    if (activeMode === "join") return state.joinAvailable ? "Open my welcome spin" : "Welcome spin used";
    if (activeMode === "reward_decider") return "Reveal my reward";
    if (activeMode === "daily_surprise") {
      return state.dailyAlreadyUsed ? "Daily surprise used" : "Reveal today’s surprise";
    }
    return state.earned > 0 ? "Spin the wheel" : "No spins yet";
  };

  return (
    <section className="spin-panel">
      <div className="spin-head">
        <span className="spin-kicker">Spin &amp; win</span>          <strong>
          {activeMode === "join" && state.joinAvailable
            ? "Welcome spin ready"
            : `${state.earned} spin${state.earned === 1 ? "" : "s"} ready`}
        </strong>
      </div>
      <p className="gx-note">
        {activeMode === "join"
          ? "One spin when you joined. It lands as bonus stamps or a personal offer."
          : activeMode === "earned"
            ? `You’ve made ${state.visits} visits. Spins come from visits, never from spending.`
            : activeMode === "reward_decider"
              ? `The house draws your reward at random from the prize list — you don’t pick. It never gives less than ${
                  state.advertisedReward || "the advertised reward"
                }.`
              : "One daily surprise is available per Johannesburg day."}
      </p>
      {availableModes.length > 1 && (
        <label className="builder-field">
          Spin type
          <select value={activeMode} onChange={(event) => setMode(event.target.value as SpinMode)}>
            {availableModes.map((option) => (
              <option key={option} value={option}>
                {option === "reward_decider" ? "Reveal my reward" : spinModeLabel(option)}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className="builder-primary spin-button"
        disabled={spinning || blocked}
        onClick={spin}
      >
        {buttonLabel()}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="spin-result" role="status">
          <strong>{result.label}</strong>
          {result.bonusStamps ? (
            <p>
              {result.bonusStamps} bonus stamp{result.bonusStamps === 1 ? "" : "s"} added to your
              card.
            </p>
          ) : result.mode === "reward_decider" ? (
            result.keptAdvertisedReward ? (
              <p>Your advertised reward stands. Nothing on the wheel bettered it today.</p>
            ) : (
              <p>
                Your reward is now {result.label} — never less than the advertised reward you
                collected.
              </p>
            )
          ) : prizeCode ? (
            <>
              <p>Your personal code is in Offers. Show it at the till.</p>
              <code>{prizeCode.code}</code>
            </>
          ) : result.code ? (
            <>
              <p>Your daily surprise is ready. Show this code at the till.</p>
              <code>{result.code}</code>
            </>
          ) : (
            <p>No prize this time. Visit again for another spin.</p>
          )}
          <button type="button" className="guest-back" onClick={() => setResult(null)}>
            Close
          </button>
        </div>
      )}
      <details className="spin-rules">
        <summary>How spins and prizes work</summary>
        <pre>{state.rules}</pre>
        <p className="gx-note">No purchase is required to earn spins.</p>
      </details>
    </section>
  );
}
