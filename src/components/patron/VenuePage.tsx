import type { Membership, Restaurant, Special } from "@/data/types";
import { johannesburgTime } from "@/lib/johannesburg-time";
import { formatRand } from "@/lib/money";
import {
  formatVenuePhone,
  venuePhone,
  venueTypeLabel,
  whatsappHref,
} from "@/lib/venue-details";
import { BackLink } from "@/components/patron/BackLink";
import { VenueMedia } from "@/components/patron/VenueMedia";
import { Button, StampCircles, VenueMark } from "@/components/patron/kit";
import type { VenueSection } from "@/components/patron/PublicTemplates";
import {
  ArrowUpRight,
  Gift,
  MapPin,
  MessageCircle,
  Phone,
  ScanLine,
  Stamp,
} from "lucide-react";

/**
 * Public restaurant page. The menu, specials and contact details are visible
 * without joining; the loyalty card only comes into the layout as a choice.
 */
export function VenuePage({
  restaurant,
  sections,
  special,
  open,
  now,
  membership,
  joinHref,
}: {
  restaurant: Restaurant;
  sections: VenueSection[];
  special: Special | null;
  open: boolean;
  now: number;
  membership?: Membership;
  joinHref: string;
}) {
  const today = restaurant.hours[johannesburgTime(now).weekday];
  const openLabel = open && today ? `Open until ${today.close}` : "Closed now";
  const phone = venuePhone(restaurant);
  const phoneLabel = formatVenuePhone(phone);
  const address = restaurant.address?.trim() || `${restaurant.suburb}, Johannesburg`;
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${address}, ${restaurant.suburb}, Johannesburg`,
  )}`;
  const stampCount = membership?.stampsCurrent ?? 0;
  const hasMenu = sections.some((section) => section.items.length > 0);

  return (
    <main className="vn-page">
      <div className="page-width vn-topbar">
        <BackLink to="/find" label="Find a restaurant" className="vn-back" />
        <a href="/" className="vn-home-link">
          Patron
        </a>
      </div>

      <div className="page-width vn-shell">
        <section className="vn-hero" aria-label={`${restaurant.name} venue`}>
          <VenueMedia restaurant={restaurant} hero />
        </section>

        <header className="vn-head">
          <VenueMark name={restaurant.name} theme={restaurant.theme} />
          <div className="vn-head-copy">
            <p className="vn-eyebrow">
              {venueTypeLabel(restaurant)} · {restaurant.suburb}
            </p>
            <h1>{restaurant.name}</h1>
            <p className="vn-tagline">{restaurant.theme.tagline}</p>
            <div className="vn-badges">
              <span className={`vn-status${open ? " is-open" : ""}`}>{openLabel}</span>
              <span className="vn-type">{venueTypeLabel(restaurant)}</span>
            </div>
          </div>
        </header>

        <div className="vn-layout">
          <div className="vn-main">
            <section className="vn-contact" aria-label="Visit and contact">
              <div className="vn-contact-item">
                <MapPin size={19} aria-hidden="true" />
                <div>
                  <span className="vn-contact-label">Find us</span>
                  <p>{address}</p>
                  <a href={directions} target="_blank" rel="noreferrer">
                    Get directions
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </div>
              </div>
              {phone && (
                <div className="vn-contact-item">
                  <Phone size={19} aria-hidden="true" />
                  <div>
                    <span className="vn-contact-label">Call or message</span>
                    <a href={`tel:${phone}`} className="vn-phone">
                      {phoneLabel}
                    </a>
                    <a
                      href={whatsappHref(phone, restaurant.name)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle size={14} aria-hidden="true" />
                      WhatsApp
                    </a>
                  </div>
                </div>
              )}
            </section>

            <section className="vn-how">
              <p className="vn-eyebrow">How it works here</p>
              <h2>Collect stamps. Enjoy the good stuff.</h2>
              <ol className="vn-steps">
                <li>
                  <span>1</span>
                  <div>
                    <strong>Join free</strong>
                    <p>Use your name and mobile number. No app, no card to carry.</p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Scan at the till</strong>
                    <p>
                      Staff scan your card each visit and add {restaurant.stampsRequired} stamps to
                      the card.
                    </p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Claim your reward</strong>
                    <p>
                      When the card is full, you get {restaurant.rewardDescription}.
                    </p>
                  </div>
                </li>
              </ol>
            </section>

            <section className="vn-menu" id="menu">
              <p className="vn-eyebrow">Menu and specials</p>
              {special && (
                <div className="vn-special">
                  <span className="vn-special-mark">
                    <Stamp size={17} aria-hidden="true" />
                    Today&apos;s special
                  </span>
                  <strong>{special.title}</strong>
                  {special.body && <p>{special.body}</p>}
                </div>
              )}
              {hasMenu ? (
                sections
                  .filter((section) => section.items.length > 0)
                  .map((section) => (
                    <div className="vn-menu-section" key={section.id}>
                      <div className="vn-menu-heading">
                        <h2>{section.name}</h2>
                        <span>
                          {section.items.length} item{section.items.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <ul>
                        {section.items.map((item) => (
                          <li key={item.id}>
                            <span>
                              <strong>{item.name}</strong>
                              {item.description && <small>{item.description}</small>}
                            </span>
                            {item.priceCents > 0 && <b>{formatRand(item.priceCents)}</b>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
              ) : (
                <p className="vn-empty-menu">The menu is being updated. Ask the team what is good today.</p>
              )}
            </section>

            <footer className="vn-claim">
              <p>
                Run this place? <a href="/contact?kind=owner">Claim this page</a>
              </p>
            </footer>
          </div>

          <aside className="vn-aside" aria-label="Loyalty card" data-shot-keep>
            <div className="vn-card">
              <div className="vn-card-head">
                <span className="vn-card-icon">
                  <Gift size={20} aria-hidden="true" />
                </span>
                <p className="vn-eyebrow">Loyalty card</p>
              </div>
              <h2>
                {restaurant.stampsRequired} stamps to {restaurant.rewardDescription}
              </h2>
              <p>One card, every visit. Your stamps stay in your phone.</p>
              <StampCircles
                total={restaurant.stampsRequired}
                filled={stampCount}
                label={`${stampCount} of ${restaurant.stampsRequired} stamps collected`}
              />
              {membership ? (
                <Button href={`/r/${restaurant.slug}/card`} className="vn-join">
                  Open my card
                </Button>
              ) : (
                <Button href={joinHref} className="vn-join">
                  <ScanLine size={17} aria-hidden="true" />
                  Join free
                </Button>
              )}
              <p className="vn-free">Joining is free. No app to download.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
