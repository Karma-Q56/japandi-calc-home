import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Coffee,
  Heart,
  MapPin,
  MessageSquare,
  Smartphone,
  Sparkles,
  Stamp,
} from "lucide-react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { VenueGrid, VenueSearch } from "@/components/patron/Venues";
import { useRevealAll } from "@/components/patron/motion";
import cafeHero from "@/assets/cafe-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Patron — Collect stamps at the places you love" },
      {
        name: "description",
        content:
          "A stamp card for your favourite local cafe, bakery or restaurant, right in your phone's browser. No app, no plastic. Free to join.",
      },
      { property: "og:title", content: "Patron — Collect stamps at the places you love" },
      {
        property: "og:description",
        content:
          "Join the places you already love, collect stamps and earn real rewards. Restaurant owners get their own guest list and thoughtful SMS offers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="eyebrow">
      <span className="eyebrow-line" />
      {children}
    </div>
  );
}

const homeFaqs = [
  [
    "Do I need to download an app?",
    "No. Your card lives in your phone's browser. Scan the restaurant's QR code, add your name and number, and your card is ready.",
  ],
  [
    "How do I collect a stamp?",
    "Show your card at the till after a qualifying purchase. Staff confirm the stamp. You cannot stamp your own card.",
  ],
  [
    "What does joining cost?",
    "Nothing. Joining a restaurant's card is free, and asking for a reward costs nothing extra.",
  ],
  [
    "I run the restaurant. What do I get?",
    "Your own digital stamp card, your guest list, results in plain numbers and thoughtful SMS offers to the people who opted in.",
  ],
];

const dinerSteps = [
  ["Scan once", "Point your camera at the QR code on the counter or your table."],
  ["Collect stamps", "Staff confirm a stamp after your purchase. Your card updates instantly."],
  ["Get the good stuff", "Rewards, spins and member-only offers appear in your card."],
];

const ownerSteps = [
  ["Set it up once", "Your page, your card and your QR codes, in your colours."],
  ["Stamp at the till", "Staff confirm a stamp in a few seconds, one-handed."],
  ["Fill the quiet days", "Send a thoughtful SMS special to the regulars you miss."],
];

function HomePage() {
  useRevealAll();
  return (
    <MarketingShell
      afterMain={
        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            {Array.from({ length: 2 }, (_, k) => (
              <span key={k}>
                A little loyalty goes a long way · Good food, familiar faces · Make Tuesday their
                day · For the places that make a neighbourhood ·{" "}
              </span>
            ))}
          </div>
        </div>
      }
    >
      <section className="hero hero-diners">
        <img
          src={cafeHero}
          alt="A cappuccino, fresh croissant and digital loyalty card on a sunlit cafe table"
          width={1920}
          height={1024}
          className="hero-photo"
          fetchPriority="high"
        />
        <div className="page-width hero-inner">
          <Eyebrow>For the places you already love</Eyebrow>
          <h1>
            Collect stamps at the places you <span className="editorial">already love.</span>
          </h1>
          <p className="hero-description">
            A stamp card for your favourite cafe, bakery or restaurant — right in your phone's
            browser. No app to download. No plastic card to lose.
          </p>
          <VenueSearch />
          <p className="hero-note">
            <MapPin />
            Independent spots in Johannesburg. Joining is free.
          </p>
        </div>
      </section>

      <div className="benefits-strip">
        <div className="page-width benefits-inner">
          {[
            [Smartphone, "No app to download"],
            [Stamp, "A stamp after every visit"],
            [Sparkles, "Rewards, spins and offers"],
            [MessageSquare, "Only the messages you opted into"],
          ].map(([Icon, text], index) => {
            const BenefitIcon = Icon as typeof Smartphone;
            return (
              <div className="benefit" key={index}>
                <BenefitIcon />
                <span>{text as string}</span>
              </div>
            );
          })}
        </div>
      </div>

      <section className="section page-width" id="how-it-works">
        <div className="center-heading" data-reveal>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="section-heading">
            One card.
            <br />
            <span className="editorial">Two sides.</span>
          </h2>
          <p className="section-description">
            Diners collect stamps and earn rewards. Restaurants get a guest list and a reason for
            people to come back.
          </p>
        </div>
        <div className="split-steps" data-reveal>
          <article className="split-panel">
            <span className="split-kicker">If you eat out</span>
            <ol className="split-list">
              {dinerSteps.map(([title, text], index) => (
                <li key={title}>
                  <span className="split-number">0{index + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <a className="text-link" href="/for-diners">
              What diners get <ArrowRight size={14} />
            </a>
          </article>
          <article className="split-panel split-panel-owner">
            <span className="split-kicker">If you run the place</span>
            <ol className="split-list">
              {ownerSteps.map(([title, text], index) => (
                <li key={title}>
                  <span className="split-number">0{index + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <a className="text-link" href="/for-business">
              What owners get <ArrowRight size={14} />
            </a>
          </article>
        </div>
      </section>

      <section className="diners-find" id="featured-venues">
        <div className="page-width">
          <Eyebrow>Featured places</Eyebrow>
          <h2>A few regulars-in-waiting.</h2>
          <p className="diners-lede">
            Every venue has its own card, its own reward and its own hours. Open one to see the
            menu, the specials and the card.
          </p>
          <VenueGrid />
        </div>
      </section>

      <section className="run-restaurant">
        <div className="page-width run-restaurant-inner">
          <div>
            <Eyebrow>Run a restaurant?</Eyebrow>
            <h2 className="section-heading">
              Give your regulars a reason to <span className="editorial">come back.</span>
            </h2>
            <p>
              Patron is loyalty the way a neighbourhood place would do it — a stamp card your guests
              keep, a list that stays yours, and a quiet SMS when someone hasn't been in for a
              while.
            </p>
            <ul className="run-checks">
              <li>
                <Check /> Your own stamp card, in your colours
              </li>
              <li>
                <Check /> Your guest list. Never sold.
              </li>
              <li>
                <Check /> SMS offers only to guests who opted in
              </li>
            </ul>
            <div className="run-actions">
              <a className="builder-primary" href="/for-business">
                See what owners get <ArrowRight size={16} />
              </a>
              <a className="text-link" href="/pricing">
                See pricing
              </a>
            </div>
          </div>
          <aside className="run-card" aria-label="Example loyalty card">
            <div className="diners-stamp-card">
              <span className="diners-card-label">the daily grind.</span>
              <div className="diners-stamps">
                {Array.from({ length: 8 }, (_, index) => (
                  <span key={index} className={index < 6 ? "is-filled" : ""}>
                    {index < 6 ? <Stamp size={18} /> : null}
                  </span>
                ))}
              </div>
              <span className="diners-card-note">6 of 8 · 2 more for a free coffee</span>
            </div>
            <div className="diners-pill">
              <Coffee size={16} /> 8th coffee on us
            </div>
          </aside>
        </div>
      </section>

      <section className="section page-width faq-section" id="questions">
        <div className="center-heading" data-reveal>
          <Eyebrow>A few things you might wonder</Eyebrow>
          <h2 className="section-heading">
            Good questions.
            <br />
            <span className="editorial">Straight answers.</span>
          </h2>
        </div>
        <div className="faq-list">
          {homeFaqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        <p className="faq-more">
          <a className="text-link" href="/faq">
            All questions <ArrowRight size={14} />
          </a>
        </p>
      </section>

      <section className="diners-cta page-width">
        <div>
          <h2>Ready when you are.</h2>
          <p>Find a place near you and start collecting.</p>
        </div>
        <a className="builder-primary" href="/for-diners#find-a-restaurant">
          Find a restaurant <ArrowRight size={16} />
        </a>
      </section>

      <p className="home-love">
        Made with a little <Heart /> for the places that make a neighbourhood.
      </p>
    </MarketingShell>
  );
}
