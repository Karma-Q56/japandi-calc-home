import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/session-expired")({
  component: SessionExpired,
});

function SessionExpired() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        System
      </p>
      <h1>This demo session expired.</h1>
      <p className="demo-intro">Pick your demo person again from the hub to continue.</p>
      <p>
        <a href="/">Back to Patron</a>
      </p>
    </main>
  );
}
