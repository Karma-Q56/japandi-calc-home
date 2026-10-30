import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesColumnIncreasing,
  Check,
  Heart,
  MapPin,
  MessageCircle,
  MessageSquare,
  Smartphone,
  Sprout,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { LeadForm } from "@/components/patron/LeadForm";
import { MenuSection, SeeItWorking } from "@/components/patron/MenuAndScreens";
import { QuietDay } from "@/components/patron/QuietDay";
import { Planner } from "@/components/patron/Planner";
import { brand, commercial, plans, rand, whatsappLink } from "@/lib/patron";
import cafeHero from "@/assets/cafe-hero.jpg";

export const Route = createFileRoute("/for-business")({
  head: () => ({
    meta: [
      { title: "For restaurants: loyalty, your list and thoughtful SMS | Patron" },
      {
        name: "description",
        content:
          "Digital stamp cards, your own guest list and targeted SMS offers for independent South African restaurants. We help you set it up and keep it working.",
      },
    ],
  }),
  component: ForBusiness,
});

const visitMessage = "Hi Patron! I’d like to book a 15-minute visit for my restaurant.";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="eyebrow">
      <span className="eyebrow-line" />
      {children}
    </div>
  );
}

function ForBusiness() {
  const wa = whatsappLink(visitMessage);
  return (
    <MarketingShell>
      <section className="hero hero-business">
        <img
          src={cafeHero}
          alt="A cappuccino, fresh croissant and digital loyalty card on a sunlit cafe table"
          width={1920}
          height={1024}
          className="hero-photo"
          fetchPriority="high"
        />
        <div className="page-width hero-inner">
          <Eyebrow>For restaurants</Eyebrow>
          <h1>
            Give more customers a reason to <span className="editorial">come back.</span>
          </h1>
          <p className="hero-description">
            Simple loyalty cards and targeted offers for independent restaurants. We help you set
            it up and keep it working.
          </p>
          <div className="hero-actions">
            <Button variant="patron" className="primary-cta" asChild>
              <a href="#visit">
                Book a 15-minute visit <ArrowUpRight />
              </a>
            </Button>
            <a href="#pricing" className="text-link">
              See what it costs <ArrowRight size={14} />
            </a>
          </div>
          <p className="hero-note">
            <MapPin />
            Made for independent spots. Starting in {brand.location}.
          </p>
        </div>
      </section>

      <div className="benefits-strip">
        <div className="page-width benefits-inner">
          {[
            [Smartphone, "No app for your guests"],
            [Heart, "Your customers. Your list."],
            [MessageSquare, "SMS, not another inbox"],
            [Sprout, "Local & hands-on"],
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
        <div className="section-head-row" data-reveal>
          <div>
            <Eyebrow>Less admin. More regulars.</Eyebrow>
            <h2 className="section-heading">
              They came for the coffee.
              <br />
              Give them a reason to <span className="editorial">stay.</span>
            </h2>
          </div>
          <p className="section-description">
            Paper cards get lost. Slow Tuesdays stay slow. Keeping in touch shouldn't be another
            full-time job.
          </p>
        </div>
        <div className="steps-grid">
          {[
            {
              title: "Scan. Join. Sorted.",
              text: "A QR code on your counter or table. A phone number. And just like that, they're on your regulars list.",
            },
            {
              title: "A little stamp. A little love.",
              text: "Your staff confirm a stamp after a purchase. Your customer collects them towards a reward worth coming back for.",
            },
            {
              title: "Make Tuesday their day.",
              text: "Haven't seen someone in a while? Send a thoughtful SMS special and give them a reason to pop in.",
            },
          ].map((step, index) => (
            <div className="step" key={step.title} data-reveal>
              <div className="step-top">
                <span className="step-number">0{index + 1}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section features-section" id="what-you-get">
        <div className="page-width">
          <div className="section-head-row" data-reveal>
            <div>
              <Eyebrow>The good stuff, all together</Eyebrow>
              <h2 className="section-heading">
                Small tools.
                <br />
                <span className="editorial">More reasons to return.</span>
              </h2>
            </div>
            <p className="section-description">
              Everything you need to keep your customers close. Nothing you need a manual for.
            </p>
          </div>
          <div className="bento-grid" data-reveal>
            <article className="bento bento-loyalty">
              <div className="bento-copy">
                <Smartphone className="bento-icon" />
                <h3>
                  A stamp card.
                  <br />
                  Minus the paper.
                </h3>
                <p>
                  Your brand, your reward, on their phone. Always in their pocket. Never in the
                  wash.
                </p>
              </div>
              <div className="loyalty-demo" aria-label="Example cafe loyalty card">
                <div className="demo-cafe">the daily grind.</div>
                <div className="demo-subtitle">A little perk for your daily ritual</div>
                <div className="demo-stamps">
                  {Array.from({ length: 8 }, (_, index) => (
                    <span key={index} className={`demo-stamp ${index < 5 ? "filled" : ""}`}>
                      {index < 5 ? <Check /> : null}
                    </span>
                  ))}
                </div>
                <div className="demo-reward">Your 8th coffee is on us.</div>
                <span className="demo-progress">5 of 8 stamps collected</span>
              </div>
            </article>
            <article className="bento bento-list">
              <Users className="bento-icon" />
              <h3>
                Your regulars.
                <br />
                Your list.
              </h3>
              <p>Know who's been in, who's been away, and who might fancy a visit.</p>
              <div className="list-demo">
                {[
                  ["TM", "Thandi M.", "Visited today"],
                  ["JN", "James N.", "Away 30 days"],
                  ["SP", "Sipho P.", "Visited yesterday"],
                ].map(([initials, name, visit]) => (
                  <div className="list-demo-row" key={name}>
                    <span className="demo-avatar">{initials}</span>
                    <span>{name}</span>
                    <span>{visit}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="bento bento-message">
              <MessageSquare className="bento-icon" />
              <h3>
                A special.
                <br />
                Not spam.
              </h3>
              <p>Reach the right people with prepaid SMS offers they've opted into.</p>
              <div className="sms-demo">
                Hey Thandi, we miss your face! Pop into The Daily Grind this Tuesday for a coffee on
                us with any breakfast. Just say TUESDAY.
                <span>The Daily Grind · Reply STOP to opt out</span>
              </div>
            </article>
            <article className="bento bento-results">
              <div className="bento-copy">
                <ChartNoAxesColumnIncreasing className="bento-icon" />
                <h3>
                  Less guessing.
                  <br />
                  More “that worked”.
                </h3>
                <p>
                  See who joined, who came back, and which specials brought people through your
                  door. Simple numbers that mean something.
                </p>
              </div>
              <div className="results-demo">
                <div className="demo-label">Tuesday breakfast special</div>
                <strong>
                  12 <span className="text-sm font-normal">came back</span>
                </strong>
                <div className="demo-bars">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </article>
          </div>
          <p className="demo-disclaimer">
            Demo data, example cards, customers and campaign, not real results.
          </p>
        </div>
      </section>

      <MenuSection />
      <SeeItWorking />
      <QuietDay />
      <Planner />

      <section className="section pricing-section" id="pricing">
        <div className="page-width">
          <div className="center-heading" data-reveal>
            <Eyebrow>A plan for your kind of place</Eyebrow>
            <h2 className="section-heading">
              Keep it simple.
              <br />
              Make it <span className="editorial">worth it.</span>
            </h2>
            <p className="section-description">
              Do it yourself, or let us lend a hand.
              <br />
              Month to month. No long contracts.
            </p>
          </div>
          <div className="pricing-grid">
            {plans.map((plan, index) => (
              <article
                data-reveal
                className={`price-card ${index === 1 ? "featured" : ""}`}
                key={plan.name}
              >
                {index === 1 && <span className="price-tag">An extra pair of hands</span>}
                <h3>{plan.name}</h3>
                <p className="price-description">{plan.description}</p>
                <div className="price-amount">
                  {rand(plan.min)}–{rand(plan.max)}
                </div>
                <span className="price-period">per month · proposed pricing</span>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check />
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="pricing-notes">
            <p>
              Once-off setup: {rand(commercial.setupMin)}–{rand(commercial.setupMax)}. Includes your
              page, QR cards, staff training and your first campaign.
            </p>
            <p>
              SMS credits sold separately, estimated at R{commercial.smsEstimate.toFixed(2)} per
              message. All prices are proposals for the pilot.
            </p>
          </div>
          <p className="pricing-more">
            <a className="text-link" href="/pricing">
              Compare the plans in full <ArrowRight size={14} />
            </a>
          </p>
        </div>
      </section>

      <section className="section page-width case-teaser" id="case-studies">
        <div className="section-head-row" data-reveal>
          <div>
            <Eyebrow>Proof, honestly</Eyebrow>
            <h2 className="section-heading">
              Your neighbourhood.
              <br />
              Our first <span className="editorial">{commercial.foundingSpots}.</span>
            </h2>
          </div>
          <p className="section-description">
            We're looking for {commercial.foundingSpots} founding restaurants in {brand.location}.
            Pilot stories land on the case-studies page once those restaurants have a few months
            behind them, we would rather show real numbers than invented ones.
          </p>
        </div>
        <ul className="case-measures">
          <li>
            <strong>Return visits</strong>
            <span>How many guests come back a second and third time.</span>
          </li>
          <li>
            <strong>Quiet-day covers</strong>
            <span>Whether a Tuesday special actually fills Tuesday.</span>
          </li>
          <li>
            <strong>Opt-in rate</strong>
            <span>How many guests choose to hear from you.</span>
          </li>
        </ul>
        <p className="case-more">
          <a className="text-link" href="/case-studies">
            What we will publish <ArrowRight size={14} />
          </a>
        </p>
      </section>

      <section className="founding-section" id="founding">
        <div className="page-width founding-inner" data-reveal>
          <div className="founding-copy">
            <Eyebrow>Built together, right here</Eyebrow>
            <h2 className="section-heading">
              Be one of the first.
              <br />
              <span className="editorial">Help us shape it.</span>
            </h2>
            <p>
              Founding partners get hands-on setup, a reduced setup fee and a discounted monthly
              plan for the first {commercial.discountMonths} months. In return we ask for honest
              feedback and, only if you're happy, an approved testimonial.
            </p>
          </div>
          <div className="founding-cta">
            <Button variant="patron" className="primary-cta" asChild>
              <a href="#visit">
                Book a 15-minute visit <ArrowUpRight />
              </a>
            </Button>
            <p>Independent cafes, bakeries &amp; restaurants welcome.</p>
          </div>
        </div>
      </section>

      <LeadForm />

      <a
        className="wa-float"
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Message us on WhatsApp"
      >
        <MessageCircle />
      </a>
    </MarketingShell>
  );
}
