import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: Terms,
});

function Terms() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Legal · Draft
      </p>
      <h1>Terms of use.</h1>
      <p className="demo-intro">Draft wording — needs lawyer review before any pilot.</p>
      <section className="builder-panel">
        <p>This demo preview carries no service guarantees.</p>
      </section>
      <p>
        <a href="/demo">Back to demo hub</a>
      </p>
    </main>
  );
}
