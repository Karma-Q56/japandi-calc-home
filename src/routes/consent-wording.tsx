import { createFileRoute } from "@tanstack/react-router";
import { CONSENT_WORDING } from "@/config/consent";

export const Route = createFileRoute("/consent-wording")({
  component: ConsentWordingPage,
});

function ConsentWordingPage() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Legal · Draft
      </p>
      <h1>Consent wording.</h1>
      <p className="demo-intro">Draft wording, needs lawyer review before any pilot.</p>
      {Object.entries(CONSENT_WORDING).map(([key, wording]) => (
        <section className="builder-panel" key={key}>
          <h2>
            {wording.purpose} · {wording.version}
          </h2>
          <p>{wording.text}</p>
        </section>
      ))}
      <p>
        <a href="/">Back to Patron</a>
      </p>
    </main>
  );
}
