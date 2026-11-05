import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { api } from "@/api";

export const Route = createFileRoute("/suggest")({
  head: () => ({
    meta: [
      { title: "Ask for a place | Patron" },
      {
        name: "description",
        content:
          "Tell us which cafe, bakery or restaurant should join Patron next. No sign in, no contact details, just the ask.",
      },
    ],
  }),
  component: Suggest,
});

function Suggest() {
  const [place, setPlace] = useState("");
  const [suburb, setSuburb] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [honey, setHoney] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [result, setResult] = useState<{ asks: number } | null>(null);
  const [error, setError] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (honey) {
      setStatus("done");
      return;
    }
    setStatus("sending");
    setError("");
    const saved = api.ideas.submit({ place, suburb, note: note || undefined, name: name || undefined });
    if (!saved.ok) {
      setError(saved.error.message);
      setStatus("error");
      return;
    }
    setResult({ asks: saved.data.asks });
    setStatus("done");
  };

  if (status === "done") {
    return (
      <MarketingShell back={{ to: "/", label: "Back" }}>
        <main className="marketing-page-hero page-width" aria-live="polite">
          <span className="eyebrow">
            <span className="eyebrow-line" /> Ask received
          </span>
          <h1>
            Thank <span className="editorial">you.</span>
          </h1>
          <p>
            {result?.asks === 1
              ? "You are the first guest to ask for this place."
              : `This place now has ${result?.asks} asks from guests.`}{" "}
            We count every ask and talk to the places guests mention most. We will contact the restaurant,
            not you.
          </p>
          <p className="demo-data-note">Demo mode: the ask stays in this browser and nothing was sent.</p>
          <p className="demo-data-note">
            This page keeps the place, the suburb and an optional note. You gave no phone number or email, so
            Patron cannot message you about it.
          </p>
          <a className="builder-secondary" href="/find">
            Browse places already on Patron
          </a>
        </main>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell back={{ to: "/", label: "Back" }}>
      <section className="marketing-page-hero page-width">
        <span className="eyebrow">
          <span className="eyebrow-line" /> Ask for a place
        </span>
        <h1>
          Which place should join <span className="editorial">Patron next?</span>
        </h1>
        <p>
          One ask, fifteen seconds. We count asks per place and approach the ones guests want most. You can
          skip every optional field.
        </p>
      </section>
      <form onSubmit={submit} className="page-width form-inner lead-form" noValidate>
        <label>
          Which place would you like on Patron?
          <input
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            required
            maxLength={120}
            placeholder="The cafe, bakery or restaurant"
          />
        </label>
        <label>
          Suburb
          <input
            value={suburb}
            onChange={(event) => setSuburb(event.target.value)}
            required
            maxLength={120}
            placeholder="Melville"
          />
        </label>
        <label>
          Why is it worth it? <small className="demo-data-note">Optional</small>
          <textarea
            rows={3}
            maxLength={400}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="A short note, for example their Saturday pastries"
          />
        </label>
        <label>
          Your first name <small className="demo-data-note">Optional, never published</small>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            autoComplete="given-name"
          />
        </label>
        <div className="honeypot" aria-hidden="true">
          <label>
            Website
            <input value={honey} onChange={(event) => setHoney(event.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <p className="demo-data-note">
          We keep the place, the suburb and an optional note. No phone number, no email, no marketing messages.
        </p>
        <button className="builder-primary" type="submit" disabled={status === "sending"}>
          Send my ask
        </button>
        {status === "error" && (
          <p className="lead-error" role="alert">
            <strong>We could not send it</strong>
            {error}
          </p>
        )}
      </form>
    </MarketingShell>
  );
}
