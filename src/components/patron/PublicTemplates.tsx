import { darkenForWhiteText } from "@/theme/contrast";
import type { MenuItem, PageTemplate, Restaurant, Special } from "@/data/types";
import { APP_NAME } from "@/config/app";
import { BackLink } from "@/components/patron/BackLink";
import { PatronBrand } from "@/lib/patron-brand";
import { johannesburgTime, venueIsOpenNow } from "@/lib/johannesburg-time";
import { LoyaltyCard } from "./LoyaltyCard";
import { formatRand } from "@/lib/money";

export interface VenueSection {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface VenueTemplateProps {
  restaurant: Restaurant;
  sections: VenueSection[];
  special: Special | null;
  open: boolean;
  now: number;
  joinHref: string;
  memberOffers?: Array<{ title: string; body: string; kind: string; code: string | null }>;
}

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));

function Hours({
  restaurant,
  compact = false,
  now,
}: {
  restaurant: Restaurant;
  compact?: boolean;
  now: number;
}) {
  const today = johannesburgTime(now).weekday;
  const todayHours = restaurant.hours[today];
  if (compact) {
    return (
      <div className="pt-hours pt-hours--compact">
        <p className="pt-hours-today">
          <strong>Today · {today.slice(0, 3)}</strong>
          <span>{todayHours ? `${todayHours.open} to ${todayHours.close}` : "Closed"}</span>
        </p>
        <details>
          <summary>Full week</summary>
          {Object.entries(restaurant.hours).map(([day, span]) => (
            <div key={day} className={day === today ? "is-today" : undefined}>
              <span>{day.slice(0, 3)}</span>
              <strong>{span ? `${span.open} to ${span.close}` : "Closed"}</strong>
            </div>
          ))}
        </details>
      </div>
    );
  }
  return (
    <div className="pt-hours">
      {Object.entries(restaurant.hours).map(([day, span]) => (
        <div key={day} className={day === today ? "is-today" : undefined}>
          <span>{day.slice(0, 3)}</span>
          <strong>{span ? `${span.open} to ${span.close}` : "Closed"}</strong>
        </div>
      ))}
    </div>
  );
}

function Menu({ sections }: { sections: VenueSection[] }) {
  if (sections.length === 0) {
    return <p className="pt-empty">The menu is being written. Ask us at the counter.</p>;
  }
  return (
    <div className="pt-menu">
      {sections.map((section) => (
        <div className="pt-menu-section" key={section.id}>
          <h3>{section.name}</h3>
          {section.items.length === 0 && <p className="pt-empty">Nothing here yet.</p>}
          {section.items.map((item) => (
            <div className="pt-menu-item" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                {item.description && <small>{item.description}</small>}
              </div>
              <b>{formatRand(item.priceCents)}</b>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SpecialCard({ special }: { special: Special | null }) {
  if (!special) return null;
  return (
    <div className="pt-special">
      <span className="pt-kicker">This week</span>
      <h3>{special.title}</h3>
      <p>{special.body}</p>
      <small>
        {dateLabel(special.startsAt)} to {dateLabel(special.endsAt)}
      </small>
    </div>
  );
}

function JoinBlock({ restaurant, href }: { restaurant: Restaurant; href: string }) {
  return (
    <div className="pt-join">
      <div>
        <span className="pt-kicker">The loyalty card</span>
        <h2>
          {restaurant.stampsRequired} stamps. {restaurant.rewardDescription}.
        </h2>
        <p>
          Join with your phone number. No app, no password, no paper card to lose.
          {restaurant.welcomeStamps > 0 &&
            ` You start with ${restaurant.welcomeStamps} stamp${restaurant.welcomeStamps === 1 ? "" : "s"}.`}
        </p>
        <a className="pt-button" href={href}>
          Join the card
        </a>
      </div>
      <LoyaltyCard
        theme={restaurant.theme}
        name={restaurant.name}
        filled={Math.min(restaurant.welcomeStamps + 1, restaurant.stampsRequired - 1)}
        total={restaurant.stampsRequired}
        footnote={`${restaurant.stampsRequired} stamps to ${restaurant.rewardDescription}`}
        animate={false}
      />
    </div>
  );
}

function MemberOffers({ offers }: { offers: NonNullable<VenueTemplateProps["memberOffers"]> }) {
  if (offers.length === 0) return null;
  return (
    <section className="pt-offers">
      <span className="pt-kicker">For members</span>
      <h2>Your offers here</h2>
      <div className="pt-offer-grid">
        {offers.map((offer) => (
          <article key={`${offer.title}-${offer.code ?? ""}`} className="pt-offer">
            <small>
              {offer.kind === "public"
                ? "Everyone"
                : offer.kind === "members"
                  ? "Members"
                  : "Just for you"}
            </small>
            <strong>{offer.title}</strong>
            <p>{offer.body}</p>
            {offer.code && <code>{offer.code}</code>}
          </article>
        ))}
      </div>
    </section>
  );
}

function Footer({ restaurant }: { restaurant: Restaurant }) {
  return (
    <footer className="pt-footer">
      <span>
        {restaurant.name}
        {restaurant.address ? ` · ${restaurant.address}` : ""}
        {restaurant.suburb ? `, ${restaurant.suburb}` : ""}
      </span>
      <span>Demo data · Powered by {APP_NAME}</span>
    </footer>
  );
}

function Masthead({ restaurant, open }: { restaurant: Restaurant; open: boolean }) {
  return (
    <header className="pt-masthead">
      <div className="pt-masthead-brands">
        <a href={`/r/${restaurant.slug}`} className="pt-venue-wordmark">
          {restaurant.name}
        </a>
        <PatronBrand className="pt-product-wordmark" />
      </div>
      <span className={`pt-open${open ? " is-open" : ""}`}>
        {open ? "Open now" : "Closed now"} · {restaurant.suburb}
      </span>
    </header>
  );
}

export function PublicTemplate({
  template,
  ...props
}: VenueTemplateProps & { template: PageTemplate }) {
  const { restaurant, sections, special, now, joinHref, memberOffers = [] } = props;
  // Derive open status from the same instant used for the highlighted weekday.
  const open = venueIsOpenNow(restaurant.hours, now);
  const today = johannesburgTime(now).weekday;
  const heroStyle = restaurant.theme.coverPhoto
    ? {
        ["--pt-photo" as string]: `url(${restaurant.theme.coverPhoto})`,
        ["--pt-hero-ink" as string]: restaurant.theme.ink,
      }
    : {
        ["--pt-hero-accent" as string]: darkenForWhiteText(restaurant.theme.accent),
        ["--pt-hero-paper" as string]: restaurant.theme.paper,
      };

  if (template === "minimal") {
    return (
      <main className="pt pt--minimal" data-template="minimal">
        <div className="pt-min-wrap">
          <BackLink to="/find" label="Find a restaurant" className="pt-back" />
          <Masthead restaurant={restaurant} open={open} />
          <section className="pt-min-hero">
            <span className="pt-kicker">{restaurant.suburb} · Johannesburg</span>
            <h1>{restaurant.name}</h1>
            <p>{restaurant.theme.tagline}</p>
            <a className="pt-link-button" href={joinHref}>
              Join the card
            </a>
          </section>
          <section className="pt-min-block">
            <h2>Menu</h2>
            <Menu sections={sections} />
          </section>
          {special && (
            <section className="pt-min-block">
              <h2>{special.title}</h2>
              <p>{special.body}</p>
              <small>
                {dateLabel(special.startsAt)} to {dateLabel(special.endsAt)}
              </small>
            </section>
          )}
          <section className="pt-min-block">
            <h2>Hours</h2>
            <Hours restaurant={restaurant} compact now={now} />
            <p className="pt-today">Today is {today}.</p>
          </section>
          <MemberOffers offers={memberOffers} />
          <section className="pt-min-block pt-min-join">
            <h2>
              {restaurant.stampsRequired} stamps to {restaurant.rewardDescription}
            </h2>
            <p>
              Join with your phone number.
              {restaurant.welcomeStamps > 0
                ? ` You start with ${restaurant.welcomeStamps} stamp${restaurant.welcomeStamps === 1 ? "" : "s"}.`
                : ""}
            </p>
            <a className="pt-button" href={joinHref}>
              Join the card
            </a>
          </section>
          <Footer restaurant={restaurant} />
        </div>
      </main>
    );
  }

  if (template === "menu-first") {
    return (
      <main className="pt pt--menu-first" data-template="menu-first">
        <BackLink to="/find" label="Find a restaurant" className="pt-back" />
        <Masthead restaurant={restaurant} open={open} />
        <section className="pt-mf-head">
          <div>
            <span className="pt-kicker">{restaurant.suburb} · Johannesburg</span>
            <h1>{restaurant.name}</h1>
            <p>{restaurant.theme.tagline}</p>
          </div>
          <div className="pt-mf-aside" aria-hidden="true">
            <span>{restaurant.suburb} · Johannesburg</span>
          </div>
        </section>
        <section className="pt-mf-menu">
          <h2>On the menu</h2>
          <Menu sections={sections} />
        </section>
        <div className="pt-mf-after-menu">
          <Hours restaurant={restaurant} compact now={now} />
          <SpecialCard special={special} />
        </div>
        <MemberOffers offers={memberOffers} />
        <JoinBlock restaurant={restaurant} href={joinHref} />
        <Footer restaurant={restaurant} />
      </main>
    );
  }

  if (template === "hero") {
    return (
      <main className="pt pt--hero" data-template="hero">
        <BackLink to="/find" label="Find a restaurant" className="pt-back" />
        <Masthead restaurant={restaurant} open={open} />
        <section
          className={`pt-hero-photo${restaurant.theme.coverPhoto ? " has-uploaded-photo" : ""}`}
          style={heroStyle}
        >
          <div className="pt-hero-photo-inner">
            <span className="pt-kicker">
              {open ? "Open now" : "Closed now"} · {restaurant.suburb}
            </span>
            <h1>{restaurant.name}</h1>
            <p>{restaurant.theme.tagline}</p>
            <div className="pt-hero-actions">
              <a className="pt-button" href={joinHref}>
                Join the card
              </a>
              <a className="pt-link-button" href="#pt-menu">
                See the menu
              </a>
            </div>
          </div>
        </section>
        <div className="pt-wrap">
          <section className="pt-about-row">
            <div>
              <span className="pt-kicker">A little about us</span>
              <h2>Made for good days and familiar faces.</h2>
              <p>
                {restaurant.aboutText?.trim()
                  ? restaurant.aboutText
                  : `Find us in ${restaurant.suburb}, Johannesburg. Come in for a favourite and stay a while.`}
              </p>
            </div>
            <div>
              <span className="pt-kicker">Opening hours</span>
              <Hours restaurant={restaurant} now={now} />
            </div>
          </section>
          <section className="pt-block" id="pt-menu">
            <span className="pt-kicker">On the menu</span>
            <h2>House favourites.</h2>
            <Menu sections={sections} />
          </section>
          <SpecialCard special={special} />
          <MemberOffers offers={memberOffers} />
          <JoinBlock restaurant={restaurant} href={joinHref} />
        </div>
        <Footer restaurant={restaurant} />
      </main>
    );
  }

  // Classic is the default: a restaurant that customises nothing still looks finished.
  return (
    <main className="pt pt--classic" data-template="classic">
      <BackLink to="/find" label="Find a restaurant" className="pt-back" />
      <Masthead restaurant={restaurant} open={open} />
      <div className="pt-wrap">
        <section className="pt-classic-hero">
          <div>
            <span className="pt-kicker">
              {open ? "Open now" : "Closed now"} · {restaurant.suburb}
            </span>
            <h1>{restaurant.name}</h1>
            <p>{restaurant.theme.tagline}</p>
            <div className="pt-hero-actions">
              <a className="pt-button" href={joinHref}>
                Join the card
              </a>
              {restaurant.address && (
                <a
                  className="pt-link-button"
                  href={`https://maps.google.com/?q=${encodeURIComponent(
                    `${restaurant.address}, ${restaurant.suburb}, Johannesburg`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Find us
                </a>
              )}
            </div>
          </div>
          <div className="pt-classic-card">
            <JoinBlock restaurant={restaurant} href={joinHref} />
            <Hours restaurant={restaurant} compact now={now} />
          </div>
        </section>
        <section className="pt-block">
          <span className="pt-kicker">On the menu</span>
          <h2>House favourites.</h2>
          <Menu sections={sections} />
        </section>
        <div className="pt-classic-row">
          <SpecialCard special={special} />
          <div className="pt-about">
            <span className="pt-kicker">A little about us</span>
            <h3>Made for good days and familiar faces.</h3>
            <p>
              {restaurant.aboutText?.trim()
                ? restaurant.aboutText
                : `Find us in ${restaurant.suburb}, Johannesburg. Come in for a favourite and stay for a while.`}
            </p>
          </div>
        </div>
        <MemberOffers offers={memberOffers} />
      </div>
      <Footer restaurant={restaurant} />
    </main>
  );
}
