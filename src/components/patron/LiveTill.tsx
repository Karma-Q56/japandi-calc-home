import { useEffect, useState } from "react";
import { CardScanner } from "@/components/patron/CardScanner";
import { TillOrderStep } from "@/components/patron/live/TillOrderStep";
import { FormField, PageHeader } from "@/components/patron/dash";
import { signOut } from "@/lib/sign-out";
import { rewardGiveLine } from "@/lib/reward-copy";
import { SIGNED_OUT_MESSAGE, UNLOCK_FIRST_MESSAGE } from "@/lib/till-messages";
import {
  getTillStateFn,
  lookupGuestFn,
  pairTillFn,
  tillRecordStampFn,
  tillRedeemRewardFn,
  tillSignInFn,
  tillSignOutFn,
  tillUndoRedeemFn,
  tillUnpairFn,
} from "@/server/live";
import type { LiveLookup, TillState } from "@/server/live-till";

type Feedback = { kind: "ok" | "error"; text: string } | null;

/**
 * Live till. Pairing, PIN sign in, stamping and redemption all go through the
 * server, which checks the paired device cookie and the staff session.
 */
export function LiveTill() {
  const [state, setState] = useState<TillState | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [lookupCode, setLookupCode] = useState("");
  const [lookup, setLookup] = useState<LiveLookup | null>(null);
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [orderFor, setOrderFor] = useState<string | null>(null);
  const [lastRedeem, setLastRedeem] = useState<{ rewardId: string; canUndoUntil: number } | null>(
    null,
  );

  const load = async () => {
    setState(await getTillStateFn());
  };

  const say = (kind: "ok" | "error", text: string) => {
    setFeedback({ kind, text });
    // The server clears a dead sign in, so reloading puts the PIN screen back.
    if (kind === "error" && (text === SIGNED_OUT_MESSAGE || text === UNLOCK_FIRST_MESSAGE)) {
      void load();
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const pair = async () => {
    setBusy(true);
    const result = await pairTillFn({ data: { code: pairingCode } });
    setBusy(false);
    if (!result.ok) {
      say("error", result.message);
      return;
    }
    setPairingCode("");
    setFeedback(null);
    say("ok", "Till paired.");
    await load();
  };

  const signIn = async () => {
    setBusy(true);
    const result = await tillSignInFn({ data: { staffId, pin } });
    setBusy(false);
    setPin("");
    if (!result.ok) {
      say("error", result.message);
      return;
    }
    setFeedback(null);
    await load();
  };

  const runLookup = async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setBusy(true);
    const result = await lookupGuestFn({ data: { code } });
    setBusy(false);
    setLastRedeem(null);
    setOrderFor(null);
    if (!result.ok) {
      setLookup(null);
      say("error", result.message);
      return;
    }
    setFeedback(null);
    setLookup(result);
  };

  const addStamp = async () => {
    if (!lookup?.ok) return;
    setBusy(true);
    const result = await tillRecordStampFn({
      data: { membershipId: lookup.membershipId, key: crypto.randomUUID() },
    });
    if (!result.ok) {
      setBusy(false);
      say("error", result.message);
      return;
    }
    say(
      "ok",
      result.result === "reward"
        ? "Stamp added. That earns a reward."
        : result.result === "stamped"
          ? "Stamp added."
          : result.result === "too_soon"
            ? "That card was stamped a moment ago."
            : "That stamp was already recorded.",
    );
    setLookup({ ...lookup, stampsCurrent: result.stampsCurrent });
    setOrderFor(lookup.membershipId);
    // Reload so any new reward shows the Redeem button.
    const fresh = await lookupGuestFn({
      data: { code: lookupCode.trim() || lookup.membershipId },
    });
    setBusy(false);
    if (fresh.ok) setLookup(fresh);
  };

  const redeem = async (rewardId: string) => {
    if (!lookup?.ok) return;
    setBusy(true);
    const result = await tillRedeemRewardFn({
      data: { membershipId: lookup.membershipId, rewardId },
    });
    setBusy(false);
    if (!result.ok) {
      say("error", result.message);
      return;
    }
    say(
      "ok",
      `Redeemed: ${rewardGiveLine(result)}. Undo within 10 minutes if this was a mistake.`,
    );
    setLookup({
      ...lookup,
      rewards: lookup.rewards.filter((reward) => reward.id !== rewardId),
    });
    setLastRedeem({ rewardId, canUndoUntil: result.canUndoUntil });
  };

  const undoRedeem = async () => {
    if (!lastRedeem) return;
    setBusy(true);
    const result = await tillUndoRedeemFn({ data: { rewardId: lastRedeem.rewardId } });
    setBusy(false);
    if (!result.ok) {
      say("error", result.message);
      return;
    }
    setLastRedeem(null);
    say("ok", "Redemption undone. The reward is available again.");
    if (lookupCode.trim()) await runLookup(lookupCode);
  };

  const unpair = async () => {
    await tillUnpairFn();
    setLookup(null);
    setPin("");
    setStaffId("");
    setFeedback(null);
    await load();
  };

  const leave = async () => {
    await tillSignOutFn();
    await signOut("live");
  };

  if (!state) {
    return (
      <main className="demo-hub page-width">
        <p role="status">Loading till…</p>
      </main>
    );
  }

  if (!state.paired) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow="Till"
          title="Pair this till."
          intro="A one time code links this device to the counter. Ask the owner for the code in Team."
        />
        <section className="guest-panel">
          <FormField label="Pairing code" hint="8 characters, valid for 10 minutes.">
            <input
              value={pairingCode}
              onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
              placeholder="ABCDEFGH"
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={12}
            />
          </FormField>
          <button
            className="builder-primary"
            disabled={busy || pairingCode.trim().length < 8}
            onClick={() => void pair()}
          >
            Pair device
          </button>
          {feedback && (
            <p
              role={feedback.kind === "error" ? "alert" : "status"}
              className="till-toast is-error"
            >
              {feedback.text}
            </p>
          )}
        </section>
        <TillAccountActions
          paired={false}
          onUnpair={() => void unpair()}
          onLogOut={() => void leave()}
        />
      </main>
    );
  }

  if (!state.staff) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow={`Till · ${state.restaurant?.name ?? ""}`}
          title="Who's stamping?"
          intro="Your name goes on every stamp so the owner can see who served the guest."
        />
        <section className="guest-panel">
          <FormField label="Your name">
            <select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
              <option value="">Choose…</option>
              {state.crew.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="PIN" hint="Four digits, set by the owner.">
            <input
              type="password"
              className="pin-input"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="••••"
            />
          </FormField>
          <div className="pin-pad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key) => (
              <button
                key={key || "empty"}
                disabled={!key}
                onClick={() => {
                  if (key === "⌫") setPin((current) => current.slice(0, -1));
                  else setPin((current) => (current + key).slice(0, 4));
                }}
              >
                {key}
              </button>
            ))}
          </div>
          <button
            className="builder-primary"
            disabled={busy || !staffId || pin.length !== 4}
            onClick={() => void signIn()}
          >
            Unlock till
          </button>
          {feedback && (
            <p role={feedback.kind === "error" ? "alert" : "status"} className="field-error">
              {feedback.text}
            </p>
          )}
        </section>
        <TillAccountActions paired onUnpair={() => void unpair()} onLogOut={() => void leave()} />
      </main>
    );
  }

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={["Till", state.restaurant?.branchName, state.staff.displayName]
          .filter(Boolean)
          .join(" · ")}
        title={state.restaurant?.name ?? ""}
        intro="Look up a guest, add a stamp and send them off with their reward."
      />
      <section className="guest-panel">
        <form
          className="till-lookup"
          onSubmit={(event) => {
            event.preventDefault();
            void runLookup(lookupCode);
          }}
        >
          <FormField label="Member code or phone" hint="Or scan the card with the button below.">
            <input
              value={lookupCode}
              onChange={(event) => setLookupCode(event.target.value.toUpperCase())}
              placeholder="PT… or +27…"
              autoComplete="off"
              autoCapitalize="characters"
            />
          </FormField>
          <button className="builder-primary" type="submit" disabled={busy}>
            Look up
          </button>
          <button className="builder-secondary" type="button" onClick={() => setScanning(true)}>
            Scan card
          </button>
        </form>
        {!("mediaDevices" in navigator) && (
          <p className="demo-data-note">This device has no camera. Type the member code instead.</p>
        )}
      </section>
      {scanning && (
        <CardScanner
          onCode={(value) => {
            setScanning(false);
            setLookupCode(value.toUpperCase());
            void runLookup(value);
          }}
          onClose={() => setScanning(false)}
        />
      )}
      {feedback && (
        <p role={feedback.kind === "error" ? "alert" : "status"} className="till-toast is-error">
          {feedback.text}
        </p>
      )}
      {lookup?.ok && (
        <section className="guest-panel">
          <div className="till-member">
            <h2>
              {lookup.firstName}
              {lookup.lastInitial ? ` ${lookup.lastInitial}.` : ""}
            </h2>
            <strong>
              {lookup.stampsCurrent}
              <i> / {lookup.stampsRequired}</i>
            </strong>
          </div>
          <div className="till-bar-track" aria-hidden>
            <span
              style={{
                width: `${Math.min(
                  100,
                  Math.round((lookup.stampsCurrent / Math.max(1, lookup.stampsRequired)) * 100),
                )}%`,
              }}
            />
          </div>
          <button className="builder-primary" disabled={busy} onClick={() => void addStamp()}>
            Add stamp
          </button>
          {lookup.rewards.map((reward) => (
            <button
              key={reward.id}
              className="builder-secondary"
              disabled={busy}
              onClick={() => void redeem(reward.id)}
            >
              Redeem: {rewardGiveLine(reward)}
            </button>
          ))}
          {lastRedeem && (
            <button className="builder-secondary" disabled={busy} onClick={() => void undoRedeem()}>
              Undo redemption (10 minutes)
            </button>
          )}
        </section>
      )}
      {lookup?.ok && orderFor === lookup.membershipId && (
        <TillOrderStep membershipId={orderFor} onDone={() => setOrderFor(null)} />
      )}
      <TillAccountActions paired onUnpair={() => void unpair()} onLogOut={() => void leave()} />
    </main>
  );
}

function TillAccountActions({
  paired,
  onUnpair,
  onLogOut,
}: {
  paired: boolean;
  onUnpair: () => void;
  onLogOut: () => void;
}) {
  return (
    <div className="till-account-actions">
      {paired && (
        <button type="button" className="guest-back" data-testid="unpair-till" onClick={onUnpair}>
          Unpair this till
        </button>
      )}
      <button type="button" className="guest-back" data-testid="staff-logout" onClick={onLogOut}>
        Log out
      </button>
    </div>
  );
}
