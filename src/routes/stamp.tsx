import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo, updateDemo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import type { StampResult } from "@/domain/stamps";

export const Route = createFileRoute("/stamp")({
  beforeLoad: () => {
    if (!requireRole("staff")(demoRepo.read().session)) {
      throw redirect({ to: "/demo" });
    }
  },
  component: Till,
});

type Lookup =
  | { ok: false; message: string }
  | {
      ok: true;
      firstName: string;
      membershipId: string;
      stampsCurrent: number;
      stampsRequired: number;
      rewards: Array<{ id: string; description: string }>;
      campaigns: Array<{ id: string; code: string; name: string }>;
    };

function Till() {
  const state = useDemoState();
  const session = state.session;
  const restaurant =
    state.restaurants.find((item) => item.id === session.restaurantId) ?? state.restaurants[0]!;
  const signedInStaff = session.staffId
    ? state.staff.find((s) => s.id === session.staffId)
    : undefined;
  const sessionOk = !!signedInStaff && api.stamp.sessionValid() && !!session.staffExpiresAt;
  const paired = session.tillPairedRestaurantId === restaurant.id;

  const [pinName, setPinName] = useState("");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [lastStampId, setLastStampId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [redeemCode, setRedeemCode] = useState("");

  const say = (kind: "ok" | "error", text: string) => {
    setFeedback({ kind, text });
    if (kind === "ok" && "vibrate" in navigator) {
      try {
        navigator.vibrate(30);
      } catch {
        /* vibration is a nicety */
      }
    }
  };

  const signIn = async (staffId: string, pinValue: string) => {
    setPinError("");
    const result = await api.team.signIn({ staffId, pin: pinValue });
    if (!result.ok) {
      setPinError(result.error.message);
      return;
    }
    setPin("");
  };

  const doLookup = () => {
    if (!code.trim()) return;
    const result = api.stamp.lookup({
      restaurantId: restaurant.id,
      code,
      session: { role: session.role, restaurantId: session.restaurantId },
    });
    if (!result.ok) {
      setLookup({ ok: false, message: result.error.message });
      return;
    }
    const membership = state.memberships.find((m) => m.id === result.data.membership.id)!;
    setLookup({
      ok: true,
      firstName: result.data.firstName,
      membershipId: result.data.membership.id,
      stampsCurrent: membership.stampsCurrent,
      stampsRequired: restaurant.stampsRequired,
      rewards: result.data.rewards,
      campaigns: result.data.campaigns,
    });
    setLastStampId(null);
  };

  const addStamp = () => {
    if (!lookup?.ok || !session.staffId) return;
    const key = `till-${crypto.randomUUID()}`;
    const result = api.stamp.record({
      restaurantId: restaurant.id,
      membershipId: lookup.membershipId,
      staffId: session.staffId,
      key,
      session: { role: session.role, restaurantId: session.restaurantId },
    });
    if (!result.ok) {
      say("error", result.error.message);
      return;
    }
    const data = result.data as StampResult;
    if (data.result === "too_soon") {
      say(
        "error",
        `Too soon — next stamp ${new Intl.DateTimeFormat("en-ZA", {
          timeStyle: "short",
        }).format(new Date(data.nextAllowedAt))}.`,
      );
      return;
    }
    if (data.result === "not_a_member") {
      say("error", "That member is not on this list.");
      return;
    }
    setLastStampId(data.stampId);
    say("ok", `Stamp added — ${data.stampsCurrent} of ${restaurant.stampsRequired}.`);
    doLookupRefresh(lookup.membershipId);
  };

  const doLookupRefresh = (membershipId: string) => {
    const membership = demoRepo.read().memberships.find((m) => m.id === membershipId);
    if (membership && lookup?.ok) {
      setLookup({ ...lookup, stampsCurrent: membership.stampsCurrent });
    }
  };

  const undo = () => {
    if (!lastStampId || !session.staffId) return;
    const result = api.stamp.undo({
      stampId: lastStampId,
      actorId: session.staffId,
      session: { role: session.role, restaurantId: session.restaurantId },
    });
    if (!result.ok) {
      say("error", result.error.message);
      return;
    }
    setLastStampId(null);
    say("ok", "Last stamp undone.");
    if (lookup?.ok) doLookupRefresh(lookup.membershipId);
  };

  const redeem = (rewardId: string) => {
    if (!session.staffId) return;
    const result = api.stamp.redeemReward({
      rewardId,
      actorId: session.staffId,
      session: { role: session.role, restaurantId: session.restaurantId },
    });
    say(result.ok ? "ok" : "error", result.ok ? "Reward redeemed." : result.error.message);
  };

  const redeemOffer = () => {
    if (!lookup?.ok || !session.staffId || !redeemCode.trim()) return;
    const result = api.stamp.redeemCampaign({
      code: redeemCode,
      membershipId: lookup.membershipId,
      actorId: session.staffId,
      session: { role: session.role, restaurantId: session.restaurantId },
    });
    say(result.ok ? "ok" : "error", result.ok ? "Offer redeemed." : result.error.message);
    setRedeemCode("");
  };

  const pair = async () => {
    const result = await api.team.redeemPairingCode(pairingCode);
    say(result.ok ? "ok" : "error", result.ok ? "Till paired." : result.error.message);
    setPairingCode("");
  };

  const swap = () => {
    updateDemo((current) => ({
      ...current,
      session: {
        role: "staff",
        restaurantId: restaurant.id,
        ...(current.session.tillPairedRestaurantId
          ? { tillPairedRestaurantId: current.session.tillPairedRestaurantId }
          : {}),
      },
    }));
    setLookup(null);
    setPin("");
  };

  if (!paired) {
    return (
      <main className="guest-page">
        <p className="eyebrow">Till · {restaurant.name}</p>
        <h1>Pair this till.</h1>
        <section className="guest-panel">
          <label className="builder-field">
            Pairing code
            <input
              value={pairingCode}
              onChange={(event) => setPairingCode(event.target.value)}
              placeholder="ABCDEFGH"
              autoComplete="off"
            />
          </label>
          <button className="builder-primary" onClick={() => void pair()}>
            Pair device
          </button>
          <button
            className="guest-back"
            onClick={() => {
              api.team.pairThisDevice(restaurant.id);
            }}
          >
            Pair this device as a till (demo shortcut)
          </button>
          {feedback && (
            <p role="status" className="demo-data-note">
              {feedback.text}
            </p>
          )}
        </section>
      </main>
    );
  }

  if (!sessionOk) {
    const crew = state.staff.filter((s) => s.restaurantId === restaurant.id && s.active);
    return (
      <main className="guest-page">
        <p className="eyebrow">Till · {restaurant.name}</p>
        <h1>Who’s stamping?</h1>
        <section className="guest-panel">
          <label className="builder-field">
            Your name
            <select value={pinName} onChange={(event) => setPinName(event.target.value)}>
              <option value="">Choose…</option>
              {crew.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="builder-field">
            PIN
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="••••"
            />
          </label>
          <div className="pin-pad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key) => (
              <button
                key={key || "empty"}
                disabled={!key}
                onClick={() => {
                  if (key === "⌫") setPin((p) => p.slice(0, -1));
                  else setPin((p) => (p + key).slice(0, 4));
                }}
              >
                {key}
              </button>
            ))}
          </div>
          <button
            className="builder-primary"
            disabled={!pinName || pin.length !== 4}
            onClick={() => void signIn(pinName, pin)}
          >
            Unlock till
          </button>
          {pinError && (
            <p role="alert" className="field-error">
              {pinError}
            </p>
          )}
        </section>
      </main>
    );
  }

  const recent = state.stamps
    .filter((s) => s.restaurantId === restaurant.id && s.status === "valid")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  return (
    <main className="guest-page">
      <header className="guest-header">
        <span>
          Till · {signedInStaff?.displayName} · {restaurant.name}
        </span>
        <button className="guest-back" onClick={swap}>
          Swap staff
        </button>
      </header>
      <section className="guest-panel">
        <label className="builder-field">
          Member code or phone
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="PT… or +27…"
            autoComplete="off"
          />
        </label>
        <button className="builder-secondary" onClick={doLookup}>
          Look up
        </button>
      </section>
      {lookup && !lookup.ok && (
        <p role="alert" className="field-error">
          {lookup.message}
        </p>
      )}
      {lookup?.ok && (
        <section className="guest-panel">
          <h2>{lookup.firstName}</h2>
          <p>
            {lookup.stampsCurrent} of {lookup.stampsRequired} stamps
          </p>
          {lookup.rewards.length > 0 && (
            <p>
              {lookup.rewards.length} reward
              {lookup.rewards.length === 1 ? "" : "s"} waiting
            </p>
          )}
          <button className="staff-button" onClick={addStamp}>
            Add stamp
          </button>
          {lookup.rewards.map((reward) => (
            <button key={reward.id} className="builder-secondary" onClick={() => redeem(reward.id)}>
              Redeem: {reward.description}
            </button>
          ))}
          {lastStampId && (
            <button className="guest-back" onClick={undo}>
              Undo last stamp
            </button>
          )}
          <label className="builder-field">
            Offer code
            <input
              value={redeemCode}
              onChange={(event) => setRedeemCode(event.target.value)}
              placeholder="TUESDAY"
              autoComplete="off"
            />
          </label>
          <button className="builder-secondary" onClick={redeemOffer}>
            Redeem offer
          </button>
        </section>
      )}
      {feedback && (
        <p role="status" className={feedback.kind === "ok" ? "new-stamps-note" : "field-error"}>
          {feedback.text}
        </p>
      )}
      <section className="guest-section">
        <h2>Recent stamps</h2>
        {recent.length === 0 && <p>No stamps yet this demo.</p>}
        {recent.map((stamp) => (
          <p className="visit-row" key={stamp.id}>
            <span>
              {new Intl.DateTimeFormat("en-ZA", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(stamp.createdAt))}
            </span>
            <strong>{stamp.id.slice(0, 13)}…</strong>
          </p>
        ))}
      </section>
    </main>
  );
}
