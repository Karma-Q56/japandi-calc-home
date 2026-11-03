/**
 * One small state machine for every guest-facing thing an owner creates.
 *
 * Draft: only the owner can see it. Nothing is live.
 * Preview: the owner is looking at exactly what a guest would see. Still not live.
 * Publish: the owner pressed Publish, so the change is live.
 *
 * An edit after publishing never goes live silently. It marks the item as
 * changed and the owner sees "Preview changes" before publishing again.
 */
export type PublishStep = "draft" | "preview" | "publish";

export type LiveState = "draft" | "published";

export interface PublishFlow {
  step: PublishStep;
  live: LiveState;
  /** True when a published item has edits that are not live yet. */
  changed: boolean;
}

export function startFlow(): PublishFlow {
  return { step: "draft", live: "draft", changed: false };
}

/** Existing published items open on their current live version. */
export function startPublished(): PublishFlow {
  return { step: "publish", live: "published", changed: false };
}

/** Draft and Preview steps are always reachable. Publish needs a preview first. */
export function goTo(flow: PublishFlow, step: PublishStep): PublishFlow {
  if (step === "publish" && flow.live === "draft" && flow.step === "draft") {
    return flow;
  }
  return { ...flow, step };
}

/** Any edit to a published item asks for a preview before it goes live again. */
export function markEdited(flow: PublishFlow): PublishFlow {
  if (flow.live !== "published") return flow;
  return { ...flow, changed: true };
}

export function publish(flow: PublishFlow): PublishFlow {
  return { step: "publish", live: "published", changed: false };
}

/** True when this flow is allowed to become live right now. */
export function canPublish(flow: PublishFlow): boolean {
  if (flow.live === "published" && !flow.changed) return true;
  return flow.step === "preview";
}

/** The main button label for the current step, in plain language. */
export function primaryLabel(flow: PublishFlow): string {
  if (flow.live === "published" && flow.changed) return "Preview changes";
  if (flow.step === "draft") return "Preview";
  if (flow.step === "preview") return "Publish";
  return "Publish";
}

/** Shown on every preview surface so nobody thinks a guest already got it. */
export const PREVIEW_ONLY = "Preview only, nothing was sent.";
