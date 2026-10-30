import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/patron/MarketingShell";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ: questions from diners and restaurants | Patron" },
      {
        name: "description",
        content:
          "Answers about loyalty cards, stamps, rewards, spins, SMS consent, pricing and how Patron works for independent restaurants.",
      },
    ],
  }),
  component: Faq,
});

const dinerFaqs: Array<[string, string]> = [
  [
    "Do I need to download an app?",
    "No. The card opens in your phone's browser from a QR scan, or from a link the restaurant shares. No password, no app store.",
  ],
  [
    "How do I collect stamps?",
    "Show your card at the till after a qualifying purchase. Staff scan the code or type your member number. You cannot stamp your own card.",
  ],
  [
    "How do rewards work?",
    "Each restaurant sets its own stamp target and reward. When the card is full, the reward is waiting in your card. Show it to staff to redeem.",
  ],
  [
    "Do I have to receive SMS offers?",
    "No. Consent is per restaurant and can be switched off under Me → Messages without affecting your card, stamps or rewards.",
  ],
  [
    "What are spins and challenges?",
    "Some restaurants award a spin for a visit or a milestone, and set visit challenges for bonus stamps. Spins are earned by visiting, never bought.",
  ],
];

const ownerFaqs: Array<[string, string]> = [
  [
    "Who can stamp a card?",
    "Only staff at your restaurant, signed in at your till with their own PIN. Cross-venue guest lists stay hidden.",
  ],
  [
    "What does SMS cost?",
    "Credits are prepaid and separate from your plan, estimated at R0.35 per message. The composer shows the recipient count and cost before you send.",
  ],
  [
    "Do you message everyone on my list?",
    "Only guests who agreed to hear from your restaurant. Every message identifies you and includes an opt-out line.",
  ],
  [
    "Can I use my own colours and logo?",
    "Yes. The card and page use your palette, your logo and your reward wording, with a sensible fallback if you have no photos yet.",
  ],
  [
    "What does being a founding partner mean?",
    "Our first three restaurants get a reduced setup fee and a discounted monthly plan for three months, in exchange for honest feedback and, only if they are happy, an approved testimonial.",
  ],
];

function FaqGroup({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <section className="section page-width">
      <div className="center-heading">
        <span className="eyebrow">
          <span className="eyebrow-line" /> FAQ
        </span>
        <h2 className="section-heading">{title}</h2>
      </div>
      <div className="faq-list">
        {items.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  return (
    <MarketingShell>
      <section className="marketing-page-hero page-width">
        <span className="eyebrow">
          <span className="eyebrow-line" /> FAQ
        </span>
        <h1>
          Good questions. <span className="editorial">Straight answers.</span>
        </h1>
        <p>
          The things diners and restaurant owners ask us most. If yours is not here, message us and
          we will answer it plainly.
        </p>
      </section>

      <FaqGroup title="For diners" items={dinerFaqs} />
      <FaqGroup title="For restaurants" items={ownerFaqs} />

      <section className="diners-cta page-width">
        <div>
          <h2>Still wondering?</h2>
          <p>Book a short visit and we will walk you through it on your counter.</p>
        </div>
        <a className="builder-primary" href="/contact">
          Book a visit <ArrowRight size={16} />
        </a>
      </section>
    </MarketingShell>
  );
}
