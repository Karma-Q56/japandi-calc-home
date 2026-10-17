import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/maintenance")({
  component: Maintenance,
});

function Maintenance() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        System
      </p>
      <h1>Quick maintenance.</h1>
      <p className="demo-intro">We’ll be back shortly. Demo data on this device is safe.</p>
      <p>
        <a href="/demo">Back to demo hub</a>
      </p>
    </main>
  );
}
