import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import {
  checkCopy,
  costPreview,
  eligibleMemberships,
  fixCopy,
  messageSegments,
} from "@/domain/campaigns";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import type { CampaignAudience } from "@/data/types";

export const Route = createFileRoute("/app/campaigns/new")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/demo" });
  },
  component: ComposerPage,
});

const zar = (cents: number) => `R${(cents / 100).toFixed(2)}`;

function ComposerPage() {
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const navigate = useNavigate();
  const restaurantId = state.session.restaurantId;
  const [step, setStep] = useState(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<"all" | "lapsed">("all");
  const [body, setBody] = useState("Hi {first_name}, we miss you! Pop by this week.");
  const [code, setCode] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState("");

  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <h1>New campaign.</h1>
        <p className="demo-intro">Open this page from a restaurant tunnel.</p>
      </main>
    );
  }
  const audience: CampaignAudience =
    preset === "lapsed" ? { type: "lapsed", days: 30 } : { type: "all_opted_in" };
  const countFor = (kind: "all" | "lapsed") =>
    eligibleMemberships(
      state,
      restaurant.id,
      kind === "lapsed" ? { type: "lapsed", days: 30 } : { type: "all_opted_in" },
    ).length;
  const eligible = eligibleMemberships(state, restaurant.id, audience);
  const sampleName =
    state.customers.find((c) => c.id === eligible[0]?.customerId)?.name.split(" ")[0] ?? "friend";
  const segments = messageSegments(body || "Hi", sampleName);
  const creditResult = api.credit.list(restaurant.id);
  const balance = creditResult.ok ? creditResult.data.balanceCents : 0;
  const warnings = checkCopy(body);

  const save = (nextStep: number) => {
    const saved = api.campaign.saveDraft({
      restaurantId: restaurant.id,
      actor: "owner",
      actorRole: state.session.role,
      ...(draftId ? { draftId } : {}),
      fields: {
        name: name || "Untitled campaign",
        body,
        audience,
        ...(code ? { code } : {}),
        ...(validFrom ? { validFrom } : {}),
        ...(validTo ? { validTo } : {}),
      },
    });
    if (!saved.ok) {
      setNotice(saved.error.message);
      return;
    }
    setDraftId(saved.data.id);
    if (saved.data.code) setCode(saved.data.code);
    setStep(nextStep);
    setNotice("");
  };

  const confirm = () => {
    if (!draftId) return;
    if (eligible.length > 200 && typed.trim().toUpperCase() !== "SEND") {
      setNotice('Type SEND to confirm a send to more than 200 guests.');
      return;
    }
    const confirmed = api.campaign.confirm({
      campaignId: draftId,
      actor: "owner",
      ...(sendNow ? { sendNow: true as const } : {}),
      ...(!sendNow && scheduledAt ? { scheduledAt } : {}),
    });
    if (!confirmed.ok) {
      setNotice(confirmed.error.message);
      return;
    }
    void navigate({ to: "/app/campaigns/$campaignId", params: { campaignId: draftId } });
  };

  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        {restaurant.name} · Step {step} of 4
      </p>
      <h1>New campaign.</h1>
      {step === 1 && (
        <section className="guest-panel">
          <h2>1 · Audience</h2>
          <label className="builder-field">
            Campaign name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="builder-field">
            <input
              type="radio"
              name="audience"
              checked={preset === "all"}
              onChange={() => setPreset("all")}
            />{" "}
            All opted-in guests ({countFor("all")})
          </label>
          <label className="builder-field">
            <input
              type="radio"
              name="audience"
              checked={preset === "lapsed"}
              onChange={() => setPreset("lapsed")}
            />{" "}
            Lapsed 30+ days ({countFor("lapsed")})
          </label>
          <button className="builder-primary" onClick={() => save(2)}>
            Continue →
          </button>
        </section>
      )}
      {step === 2 && (
        <section className="guest-panel">
          <h2>2 · Message</h2>
          <label className="builder-field">
            Message (use {"{first_name}"} for a personal touch; the Stop footer is added
            automatically)
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} />
          </label>
          <p className="demo-data-note">
            {segments} segment{segments === 1 ? "" : "s"} · {eligible.length} recipients · preview:{" "}
            {body.replaceAll("{first_name}", sampleName)}
            {"\n"}Reply STOP to opt out.
          </p>
          {warnings.map((warning) => (
            <p className="demo-data-note" key={warning.kind}>
              {warning.message}{" "}
              {warning.fixable && (
                <button onClick={() => setBody(fixCopy(body))}>Fix it for me</button>
              )}
            </p>
          ))}
          <label className="builder-field">
            Offer code (auto)
            <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Auto-generated" />
          </label>
          <label className="builder-field">
            Valid from
            <input
              type="date"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </label>
          <label className="builder-field">
            Valid to
            <input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} />
          </label>
          <button className="builder-primary" onClick={() => save(3)}>
            Continue →
          </button>
        </section>
      )}
      {step === 3 && (
        <section className="guest-panel">
          <h2>3 · Cost</h2>
          <p className="demo-intro">
            {costPreview({ recipients: eligible.length, segments, creditCents: balance })}
          </p>
          <p className="demo-data-note">
            The estimate is reserved from your credit on confirm and the actual cost is settled
            after sending. Balance: {zar(balance)}.
          </p>
          <button className="builder-primary" onClick={() => save(4)}>
            Continue →
          </button>
        </section>
      )}
      {step === 4 && (
        <section className="guest-panel">
          <h2>4 · Confirm</h2>
          <label className="builder-field">
            <input type="radio" name="when" checked={sendNow} onChange={() => setSendNow(true)} /> Send
            now
          </label>
          <label className="builder-field">
            <input type="radio" name="when" checked={!sendNow} onChange={() => setSendNow(false)} />{" "}
            Schedule
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              disabled={sendNow}
            />
          </label>
          {eligible.length > 200 && (
            <label className="builder-field">
              Type SEND to confirm ({eligible.length} recipients)
              <input value={typed} onChange={(event) => setTyped(event.target.value)} />
            </label>
          )}
          <button className="builder-primary" onClick={confirm}>
            Confirm and {sendNow ? "send" : "schedule"}
          </button>
        </section>
      )}
      {notice && (
        <p className="demo-data-note" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}
