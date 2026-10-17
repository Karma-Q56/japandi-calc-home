import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/how-it-works")({
  component: HowItWorks,
});

function HowItWorks() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        How it works
      </p>
      <h1>Scan. Stamp. Return.</h1>
      <section className="builder-panel">
        <h2>1 · Guests join by QR</h2>
        <p>No app, no password — phone number and loyalty consent.</p>
      </section>
      <section className="builder-panel">
        <h2>2 · Staff confirm stamps</h2>
        <p>Big Add-stamp button, too-soon guard, undo within minutes.</p>
      </section>
      <section className="builder-panel">
        <h2>3 · Thoughtful SMS specials</h2>
        <p>Only opted-in guests, cost shown before sending.</p>
      </section>
      <p>
        <a href="/faq">FAQ</a> · <a href="/contact">Book a demo</a>
      </p>
    </main>
  );
}
