import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/offline")({
  component: Offline,
});

function Offline() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        System
      </p>
      <h1>You’re offline.</h1>
      <p className="demo-intro">The till keeps working offline; stamps sync when you reconnect.</p>
      <p>
        <a href="/demo">Back to demo hub</a>
      </p>
    </main>
  );
}
