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
  const state = api.spin.state(membershipId);
  if (!state.enabled) return null;

  const spin = () => {
    setError("");
    setSpinning(true);
    window.setTimeout(() => {
      const outcome = api.spin.wheel({ restaurantId: restaurantIdFor(), membershipId });
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
        You&apos;ve made {state.visits} visits. Spins come from visits, never from spending.
      </p>
      <button
        type="button"
        className="builder-primary spin-button"
        disabled={state.earned <= 0 || spinning}
        onClick={spin}
      >
        {spinning ? "Spinning…" : state.earned > 0 ? "Spin the wheel" : "No spins yet"}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="spin-result" role="status">
          <strong>{result.label}</strong>
          {prizeCode ? (
            <>
              <p>Your personal code is in Offers. Show it at the till.</p>
              <code>{prizeCode.code}</code>
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
