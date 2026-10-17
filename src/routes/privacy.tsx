import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
});

function Privacy() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Legal · Draft
      </p>
      <h1>Privacy notice.</h1>
      <p className="demo-intro">Draft wording — needs lawyer review before any pilot.</p>
      <section className="builder-panel">
        <p>
          Demo guests, memberships, and consent events live in this browser only. No real personal
          data leaves the device in this preview.
        </p>
      </section>
      <p>
        <a href="/demo">Back to demo hub</a>
      </p>
    </main>
  );
}
