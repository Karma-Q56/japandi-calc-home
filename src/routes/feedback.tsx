import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { MarketingShell } from "@/components/patron/MarketingShell";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_MAX,
  FEEDBACK_MIN,
} from "@/domain/feedback";
import type { FeedbackCategory } from "@/data/types";

export const Route = createFileRoute("/feedback")({
  head: () => ({
    meta: [
      { title: "Send feedback | Patron" },
      {
        name: "description",
        content:
          "Tell the Patron team about a bug, a feature you want, or something that confused you. No sign in needed.",
      },
    ],
  }),
  component: PublicFeedback,
});

function PublicFeedback() {
  const [category, setCategory] = useState<FeedbackCategory>("feature");
  const [message, setMessage] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [contact, setContact] = useState("");
  const [honey, setHoney] = useState("");
  const [status, setStatus] = useState<"idle" | "done">("idle");
  const [error, setError] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (honey) {
      setStatus("done");
      return;
    }
    const result = api.feedback.submit({
      source: "public",
      category,
      message,
      contactOk,
      contact: contact || undefined,
      website: honey,
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError("");
    setStatus("done");
  };

  if (status === "done") {
    return (
      <MarketingShell back={{ to: "/", label: "Back" }}>
        <main className="marketing-page-hero page-width" aria-live="polite">
          <span className="eyebrow">
            <span className="eyebrow-line" /> Note received
          </span>
          <h1>
            Thank <span className="editorial">you.</span>
          </h1>
          <p>
            Your note is with the Patron team. If you asked us to contact you, we will reply
            to the detail you left.
          </p>
          <p className="demo-data-note">
            Demo mode: the note stays in this browser and nothing was sent.
          </p>
          <a className="builder-secondary" href="/find">
            Browse places on Patron
          </a>
        </main>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell back={{ to: "/", label: "Back" }}>
      <section className="marketing-page-hero page-width">
        <span className="eyebrow">
          <span className="eyebrow-line" /> Feedback
        </span>
        <h1>
          Tell us what to <span className="editorial">fix.</span>
        </h1>
        <p>
          A bug, a feature you want, or something that confused you. No sign in, no account.
          We keep your note for twelve months and read every one.
        </p>
      </section>
      <form onSubmit={submit} className="page-width form-inner lead-form" noValidate>
        <label>
          What is it about?
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
          >
            {FEEDBACK_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {FEEDBACK_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Your note
          <textarea
            rows={5}
            value={message}
            maxLength={FEEDBACK_MAX}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What happened, and what did you expect?"
          />
        </label>
        <label className="builder-check">
          <input
            type="checkbox"
            checked={contactOk}
            onChange={(event) => setContactOk(event.target.checked)}
          />
          You may contact me about this
        </label>
        {contactOk && (
          <label>
            How should we reach you? <small className="demo-data-note">Optional</small>
            <input
              value={contact}
              maxLength={120}
              onChange={(event) => setContact(event.target.value)}
              placeholder="Phone or email"
            />
          </label>
        )}
        <div className="honeypot" aria-hidden="true">
          <label>
            Website
            <input
              value={honey}
              onChange={(event) => setHoney(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </label>
        </div>
        <p className="demo-data-note">
          We keep the note, the category and the contact detail you choose to leave. We do not
          ask for your name or phone number unless you tick the contact box.
        </p>
        <button className="builder-primary" type="submit">
          Send my note
        </button>
        {error && (
          <p className="lead-error" role="alert">
            <strong>We could not send it</strong>
            {error}
          </p>
        )}
      </form>
    </MarketingShell>
  );
}
