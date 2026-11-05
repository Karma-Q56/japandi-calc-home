import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo, updateDemo } from "@/data/repo";
import { getDataModeFn, recordStampFn, verifyScanFn } from "@/server/live";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { isScanTokenShape, verifyScanToken } from "@/lib/scan";
import { CardScanner } from "@/components/patron/CardScanner";
import { StaffShell } from "@/components/patron/StaffShell";
import { Badge, FormField, PageHeader } from "@/components/patron/dash";
import type { StampResult } from "@/domain/stamps";
import { signOut } from "@/lib/sign-out";

export const Route = createFileRoute("/stamp")({
  loader: async () => {
    const { mode } = await getDataModeFn();
    return { mode };
  },
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    // Live mode has no demo session; stamping is guarded by the till PIN.
    if (mode === "live") return;
    if (!requireRole("staff")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: Till,
});

type Lookup =
  | { ok: false; message: string }
  | {
      ok: true;
      firstName: string;
      lastInitial: string;
      membershipId: string;
      stampsCurrent: number;
      stampsRequired: number;
      rewards: Array<{ id: string; description: string; key?: string }>;
      offers: Array<{ id: string; title: string; code: string }>;
      doubleStampToday: boolean;
    };

function Till() {
  const { mode } = Route.useLoaderData();
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
  const [scanning, setScanning] = useState(false);
  // Orders are asked after the stamp is safely saved, so nothing here can
  // block or delay the stamp itself.
  const [orderSheet, setOrderSheet] = useState<{
    stampId: string;
    membershipId: string;
  } | null>(null);
  const [orderPicks, setOrderPicks] = useState<
    Map<string, { label: string; kind: "item" | "category"; qty: number }>
  >(() => new Map());
  const [menuQuery, setMenuQuery] = useState("");
  const [billRand, setBillRand] = useState("");

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

  const runLookup = (value: string) => {
    if (!value.trim()) return;
    setCode(value.toUpperCase());
    const result = api.stamp.lookup({
      restaurantId: restaurant.id,
      code: value,
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
      lastInitial: result.data.lastInitial,
      membershipId: result.data.membership.id,
      stampsCurrent: membership.stampsCurrent,
      stampsRequired: restaurant.stampsRequired,
      rewards: result.data.rewards.map((reward) => ({
        id: reward.id,
        description: reward.description,
        ...(reward.key ? { key: reward.key } : {}),
      })),
      offers: result.data.offers,
      doubleStampToday: result.data.doubleStampToday,
    });
    setLastStampId(null);
  };

  const doLookup = () => runLookup(code);

  /** A scan goes through the same lookup as typing the printed member code. */
  const handleScan = async (value: string) => {
    setScanning(false);
    if (!isScanTokenShape(value)) {
      runLookup(value);
      return;
    }
    const check =
      mode === "live"
        ? await verifyScanFn({ data: { token: value } })
        : await verifyScanToken(value).then((result) =>
            result.ok
              ? { ok: true as const, memberCode: result.memberCode }
              : {
                  ok: false as const,
                  message:
                    result.reason === "expired"
                      ? "That card code has expired. Ask the guest to refresh it and scan again."
                      : "That card code is not valid.",
                },
          );
    if (!check.ok) {
      say("error", check.message);
      return;
    }
    runLookup(check.memberCode);
  };

  const addStamp = async () => {
    if (!lookup?.ok || !session.staffId) return;
    const key = `till-${crypto.randomUUID()}`;
    if (mode === "live") {
      // Live mode: the PIN field carries the per-stamp till PIN (verified by
      // HMAC + lockout on the server); staff identity is still the demo
      // session until the auth slice binds real staff sessions.
      const res = await recordStampFn({
        data: {
          restaurantId: restaurant.id,
          membershipId: lookup.membershipId,
          staffId: session.staffId,
          key,
          pin,
        },
      });
      if (!res.ok) {
        say("error", res.message);
        return;
      }
      const outcome = res.outcome;
      if (outcome.result === "too_soon") {
        say("error", "Too soon, wait a little before the next stamp.");
        return;
      }
      if (outcome.result === "not_a_member") {
        say("error", "That member is not on this list.");
        return;
      }
      if (outcome.result === "duplicate_retry") {
        say("ok", "Already stamped, showing the existing stamp.");
        return;
      }
      say(
        "ok",
        `Stamp added, ${outcome.stampsCurrent} of ${restaurant.stampsRequired}.` +
          (outcome.result === "reward" ? " Reward earned!" : ""),
      );
      return;
    }
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
        `Too soon, next stamp ${new Intl.DateTimeFormat("en-ZA", {
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
    if (data.stampId && (restaurant.trackOrders ?? false)) {
      setOrderSheet({ stampId: data.stampId, membershipId: lookup.membershipId });
      setOrderPicks(new Map());
      setMenuQuery("");
      setBillRand("");
    }
    say("ok", `Stamp added, ${data.stampsCurrent} of ${restaurant.stampsRequired}.`);
    doLookupRefresh(lookup.membershipId);
  };

  const doLookupRefresh = (membershipId: string) => {
    const fresh = demoRepo.read();
    const membership = fresh.memberships.find((m) => m.id === membershipId);
    if (membership && lookup?.ok) {
      setLookup({
        ...lookup,
        stampsCurrent: membership.stampsCurrent,
        rewards: fresh.rewards
          .filter((reward) => reward.membershipId === membershipId && !reward.redeemedAt)
          .map((reward) => ({
            id: reward.id,
            description: reward.description,
            ...(reward.key ? { key: reward.key } : {}),
          })),
      });
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
    if (result.ok && lookup?.ok) doLookupRefresh(lookup.membershipId);
  };

  const redeemItem = (title: string, itemCode: string) => {
    if (!lookup?.ok || !session.staffId) return;
    const result = api.special.redeem({
      restaurantId: restaurant.id,
      code: itemCode,
      membershipId: lookup.membershipId,
      actorId: session.staffId,
      session: { role: session.role, restaurantId: session.restaurantId },
    });
    if (!result.ok) {
      say("error", result.error.message);
      return;
    }
    say("ok", `${title} redeemed.`);
    setLookup({ ...lookup, offers: lookup.offers.filter((offer) => offer.id !== result.special.id) });
  };

  const redeemOffer = () => {
    if (!lookup?.ok || !session.staffId || !redeemCode.trim()) return;
    // Campaign codes and the three special kinds share one till field.
    const special = api.special.redeem({
      restaurantId: restaurant.id,
      code: redeemCode,
      membershipId: lookup.membershipId,
      actorId: session.staffId,
      session: { role: session.role, restaurantId: session.restaurantId },
    });
    if (special.ok) {
      say("ok", `${special.special.title} redeemed.`);
      setRedeemCode("");
      return;
    }
    const result = api.stamp.redeemCampaign({
      code: redeemCode,
      membershipId: lookup.membershipId,
      actorId: session.staffId,
      session: { role: session.role, restaurantId: session.restaurantId },
    });
    if (result.ok) {
      const used = result.data.used;
      const total = result.data.total;
      say(
        "ok",
        "Offer redeemed." + (total > 0 ? ` ${used} of ${total} used.` : ""),
      );
      setRedeemCode("");
      return;
    }
    say("error", special.error.code === "NOT_FOUND" ? result.error.message : special.error.message);
    setRedeemCode("");
  };

  const tapOrderLine = (label: string, kind: "item" | "category") => {
    setOrderPicks((picks) => {
      const next = new Map(picks);
      const id = `${kind}:${label}`;
      const entry = next.get(id);
      next.set(id, { label, kind, qty: (entry?.qty ?? 0) + 1 });
      return next;
    });
  };

  const saveOrder = () => {
    if (!orderSheet) return;
    if (orderPicks.size === 0) {
      setOrderSheet(null);
      return;
    }
    const typed = billRand.trim() === "" ? null : Number(billRand);
    if (typed !== null && (!Number.isFinite(typed) || typed < 0)) {
      say("error", "Type the bill amount in rand.");
      return;
    }
    const result = api.orders.record({
      restaurantId: restaurant.id,
      membershipId: orderSheet.membershipId,
      stampId: orderSheet.stampId,
      lines: [...orderPicks.values()].map((line) => ({
        label: line.label,
        qty: line.qty,
        kind: line.kind,
      })),
      billRand: typed,
      session: session.restaurantId
        ? { role: session.role, restaurantId: session.restaurantId }
        : { role: session.role },
    });
    if (!result.ok) {
      say("error", result.error.message);
      return;
    }
    setOrderSheet(null);
    setOrderPicks(new Map());
    setBillRand("");
    say("ok", "Order saved.");
  };

  const skipOrder = () => {
    setOrderSheet(null);
    setOrderPicks(new Map());
    setBillRand("");
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

  const unpair = () => {
    updateDemo((current) => {
      const session = { ...current.session };
      delete session.tillPairedRestaurantId;
      delete session.staffExpiresAt;
      delete session.staffId;
      return { ...current, session };
    });
    setLookup(null);
    setPin("");
    setPinName("");
    setFeedback(null);
  };

  const leave = () => void signOut(mode);

  if (!paired) {
    return (
      <StaffShell restaurant={restaurant}>
        <PageHeader
          eyebrow="Till"
          title="Pair this till."
          intro={`${restaurant.name} · a one time code links this device to the counter.`}
        />
        <section className="guest-panel">
          <FormField label="Pairing code" hint="Ask the owner for the code in Team.">
            <input
              value={pairingCode}
              onChange={(event) => setPairingCode(event.target.value)}
              placeholder="ABCDEFGH"
              autoComplete="off"
            />
          </FormField>
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
        <TillAccountActions paired={paired} onUnpair={unpair} onLogOut={leave} />
      </StaffShell>
    );
  }

  if (!sessionOk) {
    const crew = state.staff.filter((s) => s.restaurantId === restaurant.id && s.active);
    return (
      <StaffShell restaurant={restaurant}>
        <PageHeader
          eyebrow={`Till · ${restaurant.name}`}
          title="Who’s stamping?"
          intro="Your name goes on every stamp so the owner can see who served the guest."
        />
        <section className="guest-panel">
          <FormField label="Your name">
            <select value={pinName} onChange={(event) => setPinName(event.target.value)}>
              <option value="">Choose…</option>
              {crew.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
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
        <TillAccountActions paired={paired} onUnpair={unpair} onLogOut={leave} />
      </StaffShell>
    );
  }

  const recent = state.stamps
    .filter((s) => s.restaurantId === restaurant.id && s.status === "valid")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  return (
    <StaffShell restaurant={restaurant}>
      <PageHeader
        eyebrow={`Till · ${signedInStaff?.displayName ?? "Staff"}`}
        title={restaurant.name}
        intro="Look up a guest, add a stamp and send them off with their reward."
        actions={
          <button className="builder-secondary" onClick={swap}>
            Swap staff
          </button>
        }
      />
      <section className="guest-panel">
        <form
          className="till-lookup"
          onSubmit={(event) => {
            event.preventDefault();
            doLookup();
          }}
        >
          <FormField label="Member code or phone" hint="Or scan the card with the button below.">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="PT… or +27…"
              autoComplete="off"
              autoCapitalize="characters"
            />
          </FormField>
          <button className="builder-primary" type="submit">
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
          onCode={(value) => void handleScan(value)}
          onClose={() => setScanning(false)}
        />
      )}
      {lookup && !lookup.ok && (
        <p role="alert" className="till-toast is-error">
          {lookup.message}
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
                width: `${Math.min(100, Math.round((lookup.stampsCurrent / lookup.stampsRequired) * 100))}%`,
              }}
            />
          </div>
          {lookup.doubleStampToday && (
            <p className="demo-data-note">Double stamp day: this visit earns one extra stamp.</p>
          )}
          {lookup.rewards.length > 0 && (
            <p>
              <Badge tone="active">
                {lookup.rewards.length} reward
                {lookup.rewards.length === 1 ? "" : "s"} waiting
              </Badge>
            </p>
          )}
          <button className="builder-primary" onClick={addStamp}>
            Add stamp
          </button>
          {lookup.rewards.map((reward) => (
            <button key={reward.id} className="builder-secondary" onClick={() => redeem(reward.id)}>
              Redeem: {reward.key?.startsWith("birthday-item:") ? "Birthday treat, " : ""}
              {reward.description}
            </button>
          ))}
          {lookup.offers.map((offer) => (
            <button
              key={offer.id}
              className="builder-secondary"
              onClick={() => redeemItem(offer.title, offer.code)}
            >
              Redeem: {offer.title} ({offer.code})
            </button>
          ))}
          {lastStampId && (
            <button className="builder-secondary" onClick={undo}>
              Undo last stamp (10 minutes)
            </button>
          )}
          <FormField label="Offer code" hint="Campaign codes and specials use this one field.">
            <input
              value={redeemCode}
              onChange={(event) => setRedeemCode(event.target.value)}
              placeholder="TUESDAY"
              autoComplete="off"
            />
          </FormField>
          <button className="builder-secondary" onClick={redeemOffer}>
            Redeem offer
          </button>
        </section>
      )}
      {orderSheet && (
        <OrderSheet
          quickItems={api.orders.quickItems(restaurant.id)}
          menuHits={menuQuery.trim() ? api.orders.searchMenu(restaurant.id, menuQuery) : []}
          picks={orderPicks}
          billRand={billRand}
          menuQuery={menuQuery}
          onMenuQuery={setMenuQuery}
          onBillRand={setBillRand}
          onPick={tapOrderLine}
          onSave={saveOrder}
          onSkip={skipOrder}
        />
      )}
      {feedback && (
        <p role="status" className={`till-toast ${feedback.kind === "ok" ? "is-ok" : "is-error"}`}>
          {feedback.text}
        </p>
      )}
      <section className="gx-panel">
        <h2>Stamped today</h2>
        {recent.length === 0 && <p>No stamps yet this demo.</p>}
        {recent.map((stamp) => (
          <p className="visit-row" key={stamp.id}>
            <span>
              {new Intl.DateTimeFormat("en-ZA", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(stamp.createdAt))}
            </span>
            <strong>
              {state.customers.find(
                (c) =>
                  c.id === state.memberships.find((m) => m.id === stamp.membershipId)?.customerId,
              )?.name ?? "Guest"}
            </strong>
          </p>
        ))}
      </section>
      <TillAccountActions paired={paired} onUnpair={unpair} onLogOut={leave} />
    </StaffShell>
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

/** The optional after stamp step. Never opened before the stamp is saved. */
function OrderSheet({
  quickItems,
  menuHits,
  picks,
  billRand,
  menuQuery,
  onMenuQuery,
  onBillRand,
  onPick,
  onSave,
  onSkip,
}: {
  quickItems: Array<{ label: string; kind: "item" | "category" }>;
  menuHits: Array<{ id: string; name: string }>;
  picks: Map<string, { label: string; kind: "item" | "category"; qty: number }>;
  billRand: string;
  menuQuery: string;
  onMenuQuery: (value: string) => void;
  onBillRand: (value: string) => void;
  onPick: (label: string, kind: "item" | "category") => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const pickCount = [...picks.values()].reduce((sum, line) => sum + line.qty, 0);
  return (
    <section className="guest-panel order-sheet" aria-label="What did they have?">
      <h2>What did they have?</h2>
      <p className="demo-data-note">Optional. The stamp is already saved, so take your time.</p>
      <div className="order-quick-grid">
        {quickItems.map((entry) => {
          const id = `${entry.kind}:${entry.label}`;
          const qty = picks.get(id)?.qty ?? 0;
          return (
            <button
              key={id}
              className={`order-item${qty > 0 ? " is-picked" : ""}`}
              onClick={() => onPick(entry.label, entry.kind)}
            >
              {entry.label}
              {qty > 0 && <span className="order-qty">x{qty}</span>}
            </button>
          );
        })}
      </div>
      <FormField label="Search the whole menu">
        <input
          value={menuQuery}
          onChange={(event) => onMenuQuery(event.target.value)}
          placeholder="Type to search the menu"
          autoComplete="off"
        />
      </FormField>
      {menuHits.length > 0 && (
        <div className="order-quick-grid">
          {menuHits.map((item) => {
            const id = `item:${item.name}`;
            const qty = picks.get(id)?.qty ?? 0;
            return (
              <button
                key={item.id}
                className={`order-item${qty > 0 ? " is-picked" : ""}`}
                onClick={() => onPick(item.name, "item")}
              >
                {item.name}
                {qty > 0 && <span className="order-qty">x{qty}</span>}
              </button>
            );
          })}
        </div>
      )}
      <FormField label="Bill amount in rand (optional)">
        <input
          type="number"
          min={0}
          value={billRand}
          onChange={(event) => onBillRand(event.target.value.replace(/\D/g, ""))}
          placeholder="0"
          inputMode="numeric"
        />
      </FormField>
      <button className="builder-primary" disabled={pickCount === 0} onClick={onSave}>
        Save order{pickCount > 0 ? ` (${pickCount})` : ""}
      </button>
      <button className="guest-back" onClick={onSkip}>
        Skip
      </button>
    </section>
  );
}
