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

  const preview = body.replaceAll("{first_name}", sampleName);
  const short = balance < costPreviewCents(eligible.length, segments);
  const steps = ["Audience", "Message", "Cost", "Confirm"];
  const back = step > 1 ? (
    <button className="cmp-back" onClick={() => setStep(step - 1)}>
      ← Back
    </button>
  ) : null;

  return (
    <main className="demo-hub page-width cmp">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        {restaurant.name} · New campaign
      </p>
      <h1>Bring them back.</h1>
      <ol className="cmp-steps" aria-label={`Step ${step} of 4`}>
        {steps.map((label, index) => (
          <li
            key={label}
            className={index + 1 === step ? "is-now" : index + 1 < step ? "is-done" : ""}
          >
            <i>{index + 1 < step ? "✓" : index + 1}</i>
            {label}
          </li>
        ))}
      </ol>
      {step === 1 && (
        <section className="cmp-card">
          <h2>Who should hear from you?</h2>
          <label className="builder-field">
            Campaign name
            <input
              value={name}
              placeholder="e.g. We miss you"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="cmp-options" role="radiogroup" aria-label="Audience">
            {(
              [
                ["all", "All opted-in guests", "Everyone who said yes to offers by SMS."],
                ["lapsed", "Lapsed 30+ days", "Guests who have not visited in a month. Best for win-backs."],
              ] as const
            ).map(([key, title, hint]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={preset === key}
                className={`cmp-option${preset === key ? " is-on" : ""}`}
                onClick={() => setPreset(key)}
              >
                <b>{title}</b>
                <span>{hint}</span>
                <strong>{countFor(key)} guests</strong>
              </button>
            ))}
          </div>
          <button className="builder-primary" onClick={() => save(2)}>
            Continue
          </button>
        </section>
      )}
      {step === 2 && (
        <section className="cmp-card">
          {back}
          <h2>What do you want to say?</h2>
          <label className="builder-field">
            Your message
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} />
            <small>
              Use {"{first_name}"} to personalise. The Stop line is added for you.
            </small>
          </label>
          <div className="cmp-meter">
            <span>
              {segments} SMS segment{segments === 1 ? "" : "s"}
            </span>
            <span>{eligible.length} recipients</span>
          </div>
          {warnings.map((warning) => (
            <p className="cmp-warn" key={warning.kind}>
              {warning.message}{" "}
              {warning.fixable && (
                <button onClick={() => setBody(fixCopy(body))}>Fix it for me</button>
              )}
            </p>
          ))}
          <div className="cmp-phone" aria-label="Message preview">
            <small>Preview · {restaurant.name}</small>
            <p>
              {preview}
              <br />
              <span>Reply STOP to opt out.</span>
            </p>
          </div>
          <div className="cmp-row">
            <label className="builder-field">
              Offer code
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="Auto"
              />
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
              <input
                type="date"
                value={validTo}
                onChange={(event) => setValidTo(event.target.value)}
              />
            </label>
          </div>
          <button className="builder-primary" onClick={() => save(3)}>
            Continue
          </button>
        </section>
      )}
      {step === 3 && (
        <section className="cmp-card">
          {back}
          <h2>What it will cost</h2>
          <div className="cmp-tiles">
            <div>
              <small>Guests</small>
              <strong>{eligible.length}</strong>
            </div>
            <div>
              <small>Segments each</small>
              <strong>{segments}</strong>
            </div>
            <div className={short ? "is-bad" : ""}>
              <small>Your credit</small>
              <strong>{zar(balance)}</strong>
            </div>
          </div>
          <p className={short ? "cmp-warn" : "cmp-note"}>
            {costPreview({ recipients: eligible.length, segments, creditCents: balance })}
          </p>
          <p className="cmp-note">
            The estimate is held from your credit when you confirm. You are only charged for
            messages actually sent.
          </p>
          <button className="builder-primary" onClick={() => save(4)}>
            Continue
          </button>
        </section>
      )}
      {step === 4 && (
        <section className="cmp-card">
          {back}
          <h2>Ready to send?</h2>
          <div className="cmp-options" role="radiogroup" aria-label="When">
            <button
              type="button"
              role="radio"
              aria-checked={sendNow}
              className={`cmp-option${sendNow ? " is-on" : ""}`}
              onClick={() => setSendNow(true)}
            >
              <b>Send now</b>
              <span>Goes out straight away, outside quiet hours (20:00 to 08:00).</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!sendNow}
              className={`cmp-option${!sendNow ? " is-on" : ""}`}
              onClick={() => setSendNow(false)}
            >
              <b>Schedule</b>
              <span>Pick a time. Sends inside quiet hours move to 08:00.</span>
            </button>
          </div>
          {!sendNow && (
            <label className="builder-field">
              When
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
          )}
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
        <p className="cmp-warn" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}

const SEGMENT_CENTS = 35;
function costPreviewCents(recipients: number, segments: number) {
  return recipients * segments * SEGMENT_CENTS;
}
