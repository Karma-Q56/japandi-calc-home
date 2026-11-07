/**
 * Guest preview surfaces shared by every owner builder.
 *
 * These are deliberately the same shape a guest sees, so an owner never has to
 * imagine what a message, a card or a push notification will look like.
 * Nothing here sends, charges or creates anything.
 */
import { useState, type ReactNode } from "react";
import { PreviewBanner } from "@/components/patron/dash";
import {
  COST_PER_SEGMENT_CENTS,
  fullBody,
  messageSegments,
  renderBody,
  STOP_FOOTER,
} from "@/domain/campaigns";
import { PREVIEW_ONLY } from "@/domain/publish";
import { pickSegment } from "@/domain/spins";
import type { SpinSegment } from "@/data/types";
import { formatRand } from "@/lib/money";
import { SpinWheelSvg } from "@/components/patron/SpinWheelSvg";
import { arcShare, wheelArcs, type WheelArc } from "@/lib/wheel";

/* --------------------------------------------------------------- phone frame */

/** A real phone frame so a card or page preview reads as a guest screen. */
export function PhoneFrame(props: { label: string; children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <div
      className={`pv-phone${props.tone === "dark" ? " is-dark" : ""}`}
      role="group"
      aria-label={props.label}
    >
      <span className="pv-notch" aria-hidden="true" />
      <div className="pv-screen">{props.children}</div>
    </div>
  );
}

/* --------------------------------------------------------------- message view */

export function SmsPreview(props: {
  sender: string;
  body: string;
  sampleName: string;
  recipients: number;
  costPerSegmentCents?: number;
}) {
  const segments = messageSegments(props.body, props.sampleName);
  const characters = fullBody(props.body, props.sampleName).length;
  const cost = props.recipients * segments * (props.costPerSegmentCents ?? COST_PER_SEGMENT_CENTS);
  return (
    <div className="pv-sms">
      <small className="pv-sender">{props.sender}</small>
      <p className="pv-sms-bubble">
        {renderBody(props.body, props.sampleName)}
        {STOP_FOOTER.split("\n").map((line) => (
          <span key={line}>
            <br />
            {line}
          </span>
        ))}
      </p>
      <p className="pv-meta">
        {characters} letters · {segments} {segments === 1 ? "message" : "messages"} ·{" "}
        {props.recipients} {props.recipients === 1 ? "guest" : "guests"} · {formatRand(cost)}
      </p>
    </div>
  );
}

export function PushPreview(props: {
  sender: string;
  title: string;
  body: string;
  recipients: number;
}) {
  return (
    <div className="pv-push">
      <div className="pv-push-card">
        <span className="pv-push-app">{props.sender}</span>
        <strong>{props.title || "Your headline"}</strong>
        <p>{props.body || "Your message"}</p>
      </div>
      <p className="pv-meta">
        Free · {props.recipients} {props.recipients === 1 ? "guest has" : "guests have"}{" "}
        notifications on
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- publish steps */

export function PublishSteps(props: { step: number; labels: ReadonlyArray<string> }) {
  return (
    <ol
      className="cmp-steps"
      aria-label={`Step ${props.step} of ${props.labels.length}`}
      style={{ gridTemplateColumns: `repeat(${props.labels.length}, minmax(0, 1fr))` }}
    >
      {props.labels.map((label, index) => (
        <li
          key={label}
          className={index + 1 === props.step ? "is-now" : index + 1 < props.step ? "is-done" : ""}
        >
          <i>{index + 1 < props.step ? "✓" : index + 1}</i>
          {label}
        </li>
      ))}
    </ol>
  );
}

/** The one line that must appear on every preview surface. */
export function PreviewOnly(props: { children?: ReactNode }) {
  return <PreviewBanner>{props.children ?? PREVIEW_ONLY}</PreviewBanner>;
}

/* ------------------------------------------------------------- wheel preview */

/**
 * A test spin for the owner. The pick happens in the browser with the same
 * weighted helper the guest wheel uses, and goes no further: no budget is
 * touched and no prize, offer or code is created.
 */
export function WheelPreview(props: { segments: ReadonlyArray<SpinSegment> }) {
  const arcs = wheelArcs(props.segments);
  const [picked, setPicked] = useState<WheelArc | null>(null);
  const [spinId, setSpinId] = useState(0);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [tests, setTests] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const spin = () => {
    if (spinning) return;
    const segment = pickSegment(
      arcs.map((arc) => arc.segment),
      Math.random,
    );
    if (!segment) return;
    setPicked(null);
    setSpinning(true);
    setWinnerId(segment.id);
    setSpinId((count) => count + 1);
    setTests((count) => count + 1);
  };

  if (arcs.length === 0) {
    return (
      <p className="pv-meta">
        Add at least one prize with a name and a weight above zero to test the wheel.
      </p>
    );
  }

  return (
    <div className="pv-wheel">
      <SpinWheelSvg
        segments={props.segments}
        winnerId={winnerId}
        spinId={spinId}
        onSettled={() => {
          setPicked(arcs.find((item) => item.segment.id === winnerId) ?? null);
          setSpinning(false);
        }}
      />
      <button
        type="button"
        className="builder-primary pv-wheel-button"
        onClick={spin}
        disabled={spinning}
      >
        {tests === 0 ? "Test spin" : "Test spin again"}
      </button>
      <p className="pv-meta" role="status">
        {picked
          ? `Test spin lands on ${picked.segment.label}. Nothing was sent, no budget was used and no offer was created.`
          : "A test spin picks from this list only. It never uses your budget and never creates an offer."}
      </p>
      <ul className="pv-wheel-legend">
        {arcs.map((arc) => (
          <li
            key={arc.segment.id}
            className={picked?.segment.id === arc.segment.id ? "is-picked" : undefined}
          >
            <i style={{ background: arc.color }} aria-hidden="true" />
            <span>{arc.segment.label}</span>
            <small>
              {formatRand(arc.segment.valueCents)} · {arcShare(arc, arcs)}% chance
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}
