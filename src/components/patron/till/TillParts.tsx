import { useId, type ReactNode } from "react";
import type { TillFeedbackLine } from "@/lib/till-feedback";

/** Stays at the top of the till: who is signed in, how to sign out and what just happened. */
export function TillStaffBar({
  name,
  onSignOut,
  feedback,
}: {
  name: string;
  onSignOut: () => void;
  feedback: TillFeedbackLine | null;
}) {
  return (
    <div className="till-staffbar">
      <div className="till-staffbar-row">
        <span>
          Signed in: <strong>{name}</strong>
        </span>
        <button
          type="button"
          className="builder-secondary"
          data-testid="staff-signout"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </div>
      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`till-toast ${feedback.kind === "ok" ? "is-ok" : "is-error"}`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}

/** One of the three things staff can do for a guest: a title, one plain line and the buttons. */
export function TillAction({
  title,
  help,
  waiting,
  children,
}: {
  title: string;
  help: string;
  /** True until a guest has been found. */
  waiting: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="guest-panel till-action" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p className="till-help">{help}</p>
      {waiting && <p className="till-waiting">Find a guest first.</p>}
      {children}
    </section>
  );
}
