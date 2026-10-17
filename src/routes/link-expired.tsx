import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/link-expired")({
  component: LinkExpired,
});

function LinkExpired() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        System
      </p>
      <h1>This link has expired.</h1>
      <p className="demo-intro">Ask the restaurant for a fresh link or opt-out code.</p>
      <p>
        <a href="/demo">Back to demo hub</a>
      </p>
    </main>
  );
}
