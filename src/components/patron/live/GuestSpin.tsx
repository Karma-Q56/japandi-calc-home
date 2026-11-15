import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { SpinWheelSvg } from "@/components/patron/SpinWheelSvg";
import { guestSpinFn } from "@/server/live-wheel-fns";
import type { GuestSpinState } from "@/server/live-wheel";
import { wheelSegments, winLine, type PrizeType } from "@/lib/live-wheel";

const BUTTON_LABEL = { join: "Open my welcome spin", earned: "Spin the wheel", reward_decider: "Reveal my reward" } as const;

type Shown = { label: string; prizeType: PrizeType | null; bonusStamps: number | null; keptAdvertised: boolean };

/**
 * The guest's spin on their own card. The server draws the prize and gives it before the wheel moves; the wheel only
 * turns to land on it. The spin id is made once per spin and kept until it succeeds, so a retry never pays twice.
 */
export function GuestSpin({ slug, state }: { slug: string; state: GuestSpinState | null }) {
  const router = useRouter();
  const spinIdRef = useRef<string | null>(null);
  const [available, setAvailable] = useState(state?.available ?? 0);
  const [pending, setPending] = useState<{ prizeId: string; spinId: number; shown: Shown } | null>(null);
  const [result, setResult] = useState<Shown | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Follow the server's count after the card is refreshed (a visit earned a spin, or a spin was used elsewhere).
  const serverAvailable = state?.available ?? 0;
  useEffect(() => setAvailable(serverAvailable), [serverAvailable]);

  if (!state || !state.enabled || !state.mode || state.prizes.length === 0) return null;
  const mode = state.mode;
  const spinning = pending !== null;
  const canSpin = available > 0 && !busy && !spinning;

  const spin = async () => {
    if (!canSpin) return;
    setError("");
    setResult(null);
    setBusy(true);
    spinIdRef.current ??= crypto.randomUUID();
    try {
      const outcome = await guestSpinFn({ data: { slug, spinId: spinIdRef.current } });
      if (!outcome.ok) {
        // A refusal is final for this spin id, so the next try starts a new spin.
        if (!outcome.message.startsWith("Could not")) spinIdRef.current = null;
        setError(outcome.message);
        return;
      }
      spinIdRef.current = null;
      setAvailable((count) => Math.max(0, count - 1));
      setPending({
        prizeId: outcome.prizeId,
        spinId: Date.now(),
        shown: {
          label: outcome.label,
          prizeType: outcome.prizeType,
          bonusStamps: outcome.bonusStamps,
          keptAdvertised: outcome.keptAdvertised,
        },
      });
    } catch {
      setError("Could not reach the server. Check your connection and spin again. You will not be charged a spin twice.");
    } finally {
      setBusy(false);
    }
  };

  const settle = () => {
    if (!pending) return;
    setResult(pending.shown);
    setPending(null);
    // Refresh the card so a new reward or bonus stamps show up.
    void router.invalidate();
  };

  const headline =
    available > 0
      ? mode === "join"
        ? "Welcome spin ready"
        : `${available} spin${available === 1 ? "" : "s"} ready`
      : "Spin & win";

  return (
    <section className="spin-panel" aria-labelledby="guest-spin-heading">
      <div className="spin-head">
        <span className="spin-kicker" id="guest-spin-heading">
          Spin &amp; win
        </span>
        <strong>{headline}</strong>
      </div>
      <p className="gx-note">
        {mode === "join"
          ? "One welcome spin for joining. It always gives you something."
          : mode === "earned"
            ? available > 0 || state.visitsToNext === null
              ? "Spins come from visits, never from spending."
              : `${state.visitsToNext} more visit${state.visitsToNext === 1 ? "" : "s"} to your next spin. Spins come from visits, never from spending.`
            : `Earn your card reward and the wheel picks which reward you get. It never gives less than ${state.advertisedReward || "the reward on your card"}.`}
      </p>
      <SpinWheelSvg
        segments={wheelSegments(state.prizes)}
        winnerId={pending?.prizeId ?? null}
        spinId={pending?.spinId}
        onSettled={settle}
      />
      <button type="button" className="builder-primary spin-button" disabled={!canSpin} onClick={spin}>
        {BUTTON_LABEL[mode]}
      </button>
      {available === 0 && !result && (
        <p className="gx-note">
          {mode === "join"
            ? "Your welcome spin has been used."
            : mode === "earned"
              ? "You have no spins right now."
              : "Collect a card reward to use this wheel."}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="spin-result" role="status">
          <strong>{result.prizeType === "nothing" ? "Try again" : result.label}</strong>
          <p>{winLine(result)}</p>
          <button type="button" className="guest-back" onClick={() => setResult(null)}>
            Close
          </button>
        </div>
      )}
      <details className="spin-rules">
        <summary>How spins and prizes work</summary>
        <p className="gx-note">
          The prize is chosen by Patron when you spin, at random from the prizes on the wheel. No purchase is needed to
          earn spins.
        </p>
      </details>
    </section>
  );
}
