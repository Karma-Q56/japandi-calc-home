import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ChartNoAxesColumnIncreasing, QrCode, ScanLine, Send } from "lucide-react";
import { MarketingShell } from "@/components/patron/MarketingShell";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works: from QR to regular | Patron" },
      {
        name: "description",
        content:
          "How Patron works for diners and restaurants: scan a QR, collect stamps, earn rewards, and send thoughtful SMS offers to guests who opted in.",
      },
    ],
  }),
  component: HowItWorks,
});

const dinerSteps = [
  {
    title: "Scan the code",
    text: "A QR code on the counter or the table. Your card opens in your phone's browser, no app and no password.",
  },
  {
    title: "Collect stamps",
    text: "Staff confirm a stamp after a qualifying purchase. Welcome stamps land the moment you join.",
  },
  {
    title: "Earn and return",
    text: "Fill the card for the restaurant's reward. Spins, challenges and member-only offers show up as you go.",
  },
];

const ownerSteps = [
  {
    title: "Set up your place",
    text: "We load your hours, menu and reward, and design the card in your colours. You get a QR pack for tables and the till.",
  },
  {
    title: "Stamp at the till",
    text: "Staff pair the till, enter a PIN and tap Add stamp. A too-soon guard stops double stamping; undo is available for mistakes.",
  },
  {
    title: "Fill the quiet days",
    text: "Pick the guests you miss or your slowest weekday, write the offer and see the cost before sending. Only opted-in guests receive it.",
  },
];

function StepList({ steps }: { steps: Array<{ title: string; text: string }> }) {
  return (
    <ol className="split-list">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="split-number">0{index + 1}</span>
          <div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function HowItWorks() {
  return (
    <MarketingShell>
      <section className="marketing-page-hero page-width">
        <span className="eyebrow">
          <span className="eyebrow-line" /> How it works
        </span>
        <h1>
          Scan. Stamp. <span className="editorial">Return.</span>
        </h1>
        <p>
          One system, two experiences. Diners get a card that lives in their phone. Restaurants get
          a guest list and a reason to use it.
        </p>
      </section>

      <section className="section page-width">
        <div className="split-steps">
          <article className="split-panel">
            <span className="split-kicker">For diners</span>
            <StepList steps={dinerSteps} />
            <a className="text-link" href="/for-diners">
              The diner page <ArrowRight size={14} />
            </a>
          </article>
          <article className="split-panel split-panel-owner">
            <span className="split-kicker">For restaurants</span>
            <StepList steps={ownerSteps} />
            <a className="text-link" href="/for-business">
              The owner page <ArrowRight size={14} />
            </a>
          </article>
        </div>
      </section>

      <section className="section page-width">
        <div className="center-heading">
          <span className="eyebrow">
            <span className="eyebrow-line" /> The parts that do the work
          </span>
          <h2 className="section-heading">
            Four small tools.
            <br />
            <span className="editorial">One guest list.</span>
          </h2>
        </div>
        <div className="diner-benefit-grid">
          {[
            {
              icon: QrCode,
              title: "A QR page",
              text: "Your hours, menu, specials and sign-up on one code that never has to be reprinted.",
            },
            {
              icon: ScanLine,
              title: "A till that keeps up",
              text: "Big buttons, a per-staff PIN, a too-soon guard and an undo window.",
            },
            {
              icon: Send,
              title: "Thoughtful SMS",
              text: "Audiences by recency, weekday or saved list, with the cost shown before you send.",
            },
            {
              icon: ChartNoAxesColumnIncreasing,
              title: "Plain results",
              text: "New guests, returning guests and which campaign brought people in.",
            },
          ].map((item) => (
            <article className="diner-benefit" key={item.title}>
              <item.icon aria-hidden />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
        <div className="page-cta-row">
          <a className="builder-primary" href="/contact">
            Book a 15-minute visit <ArrowRight size={16} />
          </a>
          <a className="text-link" href="/pricing">
            See pricing
          </a>
        </div>
      </section>
    </MarketingShell>
  );
}
