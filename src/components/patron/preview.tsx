/**
 * Guest preview surfaces shared by every owner builder.
 *
 * These are deliberately the same shape a guest sees, so an owner never has to
 * imagine what a message, a card or a push notification will look like.
 * Nothing here sends, charges or creates anything.
 */
import type { ReactNode } from "react";
import { PreviewBanner } from "@/components/patron/dash";
import { COST_PER_SEGMENT_CENTS, fullBody, messageSegments, renderBody, STOP_FOOTER } from "@/domain/campaigns";
import { PREVIEW_ONLY } from "@/domain/publish";
import { formatRand } from "@/lib/money";

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
        {characters} characters · {segments} {segments === 1 ? "message" : "messages"} ·{" "}
        {props.recipients} {props.recipients === 1 ? "guest" : "guests"} · {formatRand(cost)}
      </p>
    </div>
  );
}

export function PushPreview(props: { sender: string; title: string; body: string; recipients: number }) {
  return (
    <div className="pv-push">
      <div className="pv-push-card">
        <span className="pv-push-app">{props.sender}</span>
        <strong>{props.title || "Your headline"}</strong>
        <p>{props.body || "Your message"}</p>
      </div>
      <p className="pv-meta">
        Free · {props.recipients} {props.recipients === 1 ? "guest has" : "guests have"} notifications
        on
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- publish steps */

export function PublishSteps(props: { step: number; labels: ReadonlyArray<string> }) {
  return (
    <ol className="cmp-steps" aria-label={`Step ${props.step} of ${props.labels.length}`}>
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
