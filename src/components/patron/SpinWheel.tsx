import { useState } from "react";
import { useSyncExternalStore } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import type { SpinResult } from "@/data/types";

/** Guest-facing spin control. The result is chosen by the domain layer, never here. */
export function SpinWheel({ membershipId }: { membershipId: string }) {
  useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [mode, setMode] = useState<"welcome" | "reward_decider" | "daily_surprise">("welcome");
  const state = api.spin.state(membershipId);
  if (!state.enabled) return null;
  const availableModes = [
    ...(state.welcomeEnabled ? (["welcome"] as const) : []),
    ...(state.rewardDeciderEnabled && state.rewardReady ? (["reward_decider"] as const) : []),
    ...(state.dailySurpriseEnabled && !state.dailyAlreadyUsed ? (["daily_surprise"] as const) : []),
  ];
  const activeMode = availableModes.includes(mode) ? mode : availableModes[0] ?? mode;

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

  return (
    <section className="spin-panel">
      <div className="spin-head">
        <span className="spin-kicker">Spin &amp; win</span>
        <strong>
          {state.earned} spin{state.earned === 1 ? "" : "s"} ready
        </strong>
      </div>
      <p className="gx-note">
        {activeMode === "welcome"
          ? `You’ve made ${state.visits} visits. Spins come from visits, never from spending.`
          : activeMode === "reward_decider"
            ? "Choose the prize for a reward you’ve already earned."
            : "One daily surprise is available per Johannesburg day."}
      </p>
      {availableModes.length > 1 && (
        <label className="builder-field">
          Spin type
          <select value={activeMode} onChange={(event) => setMode(event.target.value as typeof mode)}>
            {availableModes.map((option) => (
              <option key={option} value={option}>
                {option === "welcome" ? "Earned spin" : option === "reward_decider" ? "Choose my reward" : "Daily surprise"}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className="builder-primary spin-button"
        disabled={
          spinning ||
          availableModes.length === 0 ||
          (activeMode === "welcome" && state.earned <= 0) ||
          (activeMode === "reward_decider" && !state.rewardReady) ||
          (activeMode === "daily_surprise" && state.dailyAlreadyUsed)
        }
        onClick={spin}
      >
        {spinning
          ? "Spinning…"
          : activeMode === "reward_decider"
            ? "Choose a reward"
            : activeMode === "daily_surprise"
              ? state.dailyAlreadyUsed ? "Daily surprise used" : "Reveal today’s surprise"
              : state.earned > 0 ? "Spin the wheel" : "No spins yet"}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="spin-result" role="status">
          <strong>{result.label}</strong>
          {result.mode === "reward_decider" ? (
            <p>Your earned reward is now {result.label}.</p>
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
