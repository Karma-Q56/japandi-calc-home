import { createFileRoute } from "@tanstack/react-router";

const FAQS: Array<[string, string]> = [
  ["Do customers need an app?", "No. The card opens in their phone browser from a QR scan."],
  ["Who can staff stamp?", "Only members of their own restaurant — cross-venue lists stay hidden."],
  ["What does SMS cost?", "Credits are prepaid, about R0.35 per segment, shown before sending."],
];

export const Route = createFileRoute("/faq")({
  component: Faq,
});

function Faq() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        FAQ
      </p>
      <h1>Good questions.</h1>
      {FAQS.map(([question, answer]) => (
        <details key={question}>
          <summary>{question}</summary>
          <p>{answer}</p>
        </details>
      ))}
      <p>
        <a href="/contact">Book a demo</a> · <a href="/">Home</a>
      </p>
    </main>
  );
}
