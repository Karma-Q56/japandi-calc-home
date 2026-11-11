import { useEffect, useState } from "react";
import { getGuestWheelFn, spinWheelFn } from "@/server/live-wheel-fns";
import { wheelErrorMessage } from "@/lib/live-wheel";

type Result = { label: string; bonusStamps: number | null; rewardId: string | null };

/**
 * Live guest spin. Shown only when the restaurant's wheel is on and the guest has a spin.
 * The server picks the prize. The spin key is made once per spin, so a double tap pays once.
 */
export function GuestSpin({ slug }: { slug: string }) {
  const [spinsLeft, setSpinsLeft] = useState(0);
  const [spinKey, setSpinKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    getGuestWheelFn({ data: { slug } })
      .then((state) => {
        if (state?.enabled) setSpinsLeft(state.spinsLeft);
      })
      .catch(() => setSpinsLeft(0));
  }, [slug]);

  if (spinsLeft <= 0 && !result) return null;

  const spin = async () => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    const outcome = await spinWheelFn({ data: { slug, spinKey } });
    setBusy(false);
    if (outcome.ok && (outcome.result === "won" || outcome.result === "duplicate_retry")) {
      setResult({ label: outcome.label, bonusStamps: outcome.bonusStamps, rewardId: outcome.rewardId });
      setSpinsLeft((n) => Math.max(0, n - 1));
      setSpinKey(crypto.randomUUID());
      return;
    }
    setNotice(wheelErrorMessage(outcome.ok ? null : outcome.code));
  };

  return (
    <section aria-label="Spin the wheel">
      {result ? (
        <p>
          You won: {result.label}
          {result.bonusStamps ? ` (${result.bonusStamps} stamps added)` : ""}
          {result.rewardId ? ". It is on your rewards." : "."}
        </p>
      ) : (
        <p>You have {spinsLeft} spin{spinsLeft === 1 ? "" : "s"} left.</p>
      )}
      {spinsLeft > 0 && (
        <button type="button" onClick={spin} disabled={busy}>
          Spin the wheel
        </button>
      )}
      {notice && <p role="alert">{notice}</p>}
    </section>
  );
}
