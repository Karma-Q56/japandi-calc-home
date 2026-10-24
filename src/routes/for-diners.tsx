import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { VenueGrid } from "@/components/patron/Venues";
import { ArrowRight, BellRing, Gift, MapPin, Sparkles, Stamp, Smartphone, Tag } from "lucide-react";

export const Route = createFileRoute("/for-diners")({
  head: () => ({
    meta: [
      { title: "For diners, a loyalty card in your browser | Patron" },
      {
        name: "description",
        content:
          "Join your favourite local restaurants with a phone number. Collect stamps, spin for prizes and see member-only offers, with no app to download.",
      },
    ],
  }),
  component: ForDiners,
});

const faqs = [
  [
    "Do I need to download an app?",
    "No. Your card lives in your phone's browser. Scan the restaurant's QR code, enter your name and number, and your card is ready.",
  ],
  [
    "What does joining cost?",
    "Nothing. Joining a restaurant's card is free, and asking for a reward costs nothing extra.",
  ],
  [
    "Do I have to receive messages?",
    "Only if you keep them on. Every restaurant you join has its own SMS switch under Me → Messages. Turning one off does not affect your card.",
  ],
  [
    "How do rewards and spins work?",
    "Fill your stamp card to earn the restaurant's reward. Some places also award a spin for a visit or a milestone. Prizes are real offers from that venue.",
  ],
];

const benefits = [
  {
    icon: Stamp,
    title: "Stamps",
    text: "One card per place you love. Staff confirm a stamp after a qualifying visit, and your card updates straight away.",
  },
  {
    icon: Gift,
    title: "Rewards",
    text: "Fill the card and the reward is yours. Show the code at the till; the team confirms it in a few seconds.",
  },
  {
    icon: Sparkles,
    title: "Spins",
    text: "Where a venue runs a wheel, a visit can earn you a spin. Prizes are offers, and spins are never bought.",
  },
  {
    icon: Tag,
    title: "Member-only offers",
    text: "Specials that only regulars see, sometimes with a personal code that is yours alone.",
  },
  {
    icon: BellRing,
    title: "A gentle nudge",
    text: "Turn on a notification when a new offer lands. It is off by default and you can switch it off any time.",
  },
];

function ForDiners() {
  return (
    <MarketingShell>
      <section className="diners-hero page-width">
        <div className="diners-hero-copy">
          <span className="eyebrow">
            <span className="eyebrow-line" /> For diners
          </span>
          <h1>
            Your local regulars card.
            <br />
            <span className="editorial">No app. No plastic.</span>
          </h1>
          <p>
            Join the places you already love. Collect stamps, earn the reward you actually want and
            see the offers that are meant for you, all from your phone&apos;s browser.
          </p>
          <div className="diners-actions">
            <a className="builder-primary" href="#find-a-restaurant">
              Find a restaurant <ArrowRight size={16} />
            </a>
            <a className="text-link" href="#how-it-works">
              How it works
            </a>
          </div>
        </div>
        <div className="diners-card-stack" aria-hidden>
          <div className="diners-stamp-card">
            <span className="diners-card-label">the daily grind.</span>
            <div className="diners-stamps">
              {Array.from({ length: 8 }, (_, index) => (
                <span key={index} className={index < 5 ? "is-filled" : ""}>
                  {index < 5 ? <Stamp size={18} /> : null}
                </span>
              ))}
            </div>
            <span className="diners-card-note">5 of 8 · 3 more for a free coffee</span>
          </div>
          <div className="diners-pill">
            <Sparkles size={16} /> 2 stamps ready
          </div>
        </div>
      </section>

      <section className="diners-steps page-width" id="how-it-works">
        <span className="eyebrow">
          <span className="eyebrow-line" /> How it works for guests
        </span>
        <h2>Three taps, then just visit.</h2>
        <div className="diners-step-grid">
          {[
            {
              icon: Smartphone,
              title: "Scan once",
              text: "Point your camera at the QR code on the counter or your table. No download, no password.",
            },
            {
              icon: Stamp,
              title: "Collect stamps",
              text: "Staff confirm a stamp after your purchase. Your welcome stamps are already on the card.",
            },
            {
              icon: Sparkles,
              title: "Get the good stuff",
              text: "Rewards, personal offers and spins show up in your card. Show the code at the till.",
            },
          ].map((step) => (
            <article key={step.title} className="diners-step">
              <step.icon aria-hidden />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section page-width">
        <div className="center-heading">
          <span className="eyebrow">
            <span className="eyebrow-line" /> What you get
          </span>
          <h2 className="section-heading">
            More than a paper card.
            <br />
            <span className="editorial">Less to lose.</span>
          </h2>
        </div>
        <div className="diner-benefit-grid">
          {benefits.map((benefit) => (
            <article className="diner-benefit" key={benefit.title}>
              <benefit.icon aria-hidden />
              <h3>{benefit.title}</h3>
              <p>{benefit.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="diners-find" id="find-a-restaurant">
        <div className="page-width">
          <span className="eyebrow">
            <span className="eyebrow-line" /> Find a restaurant
          </span>
          <h2>Start with a demo venue.</h2>
          <p className="diners-lede">
            Every venue has its own card. Open any of these to join and see the card, menu and
            offers. Any live Patron venue appears here after you scan its QR code.
          </p>
          <VenueGrid />
          <p className="find-note">
            <MapPin size={14} aria-hidden /> Currently showing venues in Johannesburg.
          </p>
        </div>
      </section>

      <section className="section page-width faq-section">
        <div className="center-heading">
          <span className="eyebrow">
            <span className="eyebrow-line" /> Diner questions
          </span>
          <h2 className="section-heading">
            Good questions.
            <br />
            <span className="editorial">Plain answers.</span>
          </h2>
        </div>
        <div className="faq-list">
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        <p className="faq-more">
          <a className="text-link" href="/faq">
            More questions <ArrowRight size={14} />
          </a>
        </p>
      </section>

      <section className="diners-cta page-width">
        <div>
          <h2>Ready when you are.</h2>
          <p>Join a venue below, or scan the code at any Patron restaurant.</p>
        </div>
        <a className="builder-primary" href="#find-a-restaurant">
          Find a restaurant <ArrowRight size={16} />
        </a>
      </section>
    </MarketingShell>
  );
}
