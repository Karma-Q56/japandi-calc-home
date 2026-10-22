import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { ArrowRight, Stamp, Smartphone, MapPin, Sparkles } from "lucide-react";
import { createSeed } from "@/data/seed";
import { PatronBrand } from "@/lib/patron-brand";

export const Route = createFileRoute("/for-diners")({
  head: () => ({
    meta: [
      { title: "For diners — Patron loyalty cards in your browser" },
      {
        name: "description",
        content:
          "Join your favourite local restaurants with a phone number. Collect stamps, spin for prizes and see offers, with no app to download.",
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
    "How do I collect stamps?",
    "Show your card at the till after a qualifying purchase. Staff scan the code or type your member number. You cannot stamp your own card.",
  ],
  [
    "Do I have to receive messages?",
    "Only if you keep them on. Every restaurant you join has its own SMS switch under Me → Messages. Turning one off does not affect your card.",
  ],
  [
    "What are spins and challenges?",
    "Some restaurants award spins for visits and set challenges, like three visits in 14 days for a bonus stamp. Spins are earned by visiting, never by paying.",
  ],
  [
    "How do I find a restaurant?",
    "Open Restaurants in your card. In this demo you can browse three venues, and any live venue appears there after you scan its QR code.",
  ],
];

function ForDiners() {
  const venues = createSeed().restaurants.filter((restaurant) => restaurant.status === "active");
  return (
    <MarketingShell current="diners">
      <section className="diners-hero page-width">
        <div className="diners-hero-copy">
          <PatronBrand />
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
            see the offers that are meant for you — all from your phone&apos;s browser.
          </p>
          <div className="diners-actions">
            <a className="builder-primary" href="/demo">
              Try the demo card <ArrowRight size={16} />
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
              text: "Staff confirm a stamp after your purchase. Your card updates instantly, with your welcome stamps already on it.",
            },
            {
              icon: Sparkles,
              title: "Get the good stuff",
              text: "Rewards, personal offers, spins and challenges show up in your card. Show the code at the till.",
            },
          ].map((step) => (
            <article key={step.title} className="diners-step">
              <step.icon />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="diners-find">
        <div className="page-width">
          <span className="eyebrow">
            <span className="eyebrow-line" /> Find a restaurant
          </span>
          <h2>Start with a demo venue.</h2>
          <p className="diners-lede">
            Every venue has its own card. In the demo you can open any of these, join and see the
            card, menu and offers.
          </p>
          <div className="diners-venue-grid">
            {venues.map((restaurant) => (
              <a
                key={restaurant.id}
                className="diners-venue"
                href={`/r/${restaurant.slug}`}
              >
                <span className="diners-venue-mark" aria-hidden>
                  {restaurant.name.slice(0, 1)}
                </span>
                <strong>{restaurant.name}</strong>
                <small>
                  <MapPin size={13} /> {restaurant.suburb}
                </small>
                <span>
                  {restaurant.stampsRequired} stamps to {restaurant.rewardDescription}
                </span>
              </a>
            ))}
          </div>
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
      </section>

      <section className="diners-cta page-width">
        <div>
          <h2>Ready when you are.</h2>
          <p>Join a demo restaurant, or scan the code at any Patron venue.</p>
        </div>
        <a className="builder-primary" href="/demo">
          Open the demo <ArrowRight size={16} />
        </a>
      </section>
    </MarketingShell>
  );
}
