import { useMemo, useState } from "react";
import { ArrowRight, MapPin, Search, Stamp } from "lucide-react";
import { createSeed } from "@/data/seed";
import type { Restaurant } from "@/data/types";

/** The venues this preview can show. Live venues appear after a QR scan. */
const DEMO_VENUES: Restaurant[] = createSeed().restaurants.filter(
  (restaurant) => restaurant.status === "active",
);

function searchVenues(venues: Restaurant[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return venues.filter(
    (venue) =>
      venue.name.toLowerCase().includes(needle) || venue.suburb.toLowerCase().includes(needle),
  );
}

/** A row of venue cards, shared by the home page and /for-diners. */
export function VenueGrid({ venues = DEMO_VENUES }: { venues?: Restaurant[] }) {
  return (
    <div className="diners-venue-grid">
      {venues.map((venue) => (
        <a key={venue.id} className="diners-venue" href={`/r/${venue.slug}`}>
          <span className="diners-venue-mark" aria-hidden>
            {venue.name.slice(0, 1)}
          </span>
          <strong>{venue.name}</strong>
          <small>
            <MapPin size={13} aria-hidden /> {venue.suburb}
          </small>
          <span>
            <Stamp size={13} aria-hidden /> {venue.stampsRequired} stamps to{" "}
            {venue.rewardDescription}
          </span>
        </a>
      ))}
    </div>
  );
}

/** The diner search in the home hero: type a venue name or suburb, open its card. */
export function VenueSearch({ venues = DEMO_VENUES }: { venues?: Restaurant[] }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => searchVenues(venues, query), [venues, query]);
  const typed = query.trim().length > 0;

  return (
    <form
      className="venue-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const first = matches[0];
        if (first) window.location.assign(`/r/${first.slug}`);
      }}
    >
      <div className="venue-search-field">
        <Search aria-hidden="true" size={18} />
        <input
          type="search"
          name="venue"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a cafe, bakery or restaurant"
          aria-label="Find a restaurant by name or suburb"
          autoComplete="off"
        />
        <button type="submit" className="venue-search-go" disabled={!typed}>
          Find
        </button>
      </div>
      {typed && (
        <div className="venue-search-results" aria-live="polite">
          {matches.length > 0 ? (
            matches.map((venue) => (
              <a key={venue.id} href={`/r/${venue.slug}`} className="venue-search-result">
                <span>
                  <strong>{venue.name}</strong>
                  <small>{venue.suburb}</small>
                </span>
                <ArrowRight size={16} aria-hidden />
              </a>
            ))
          ) : (
            <p className="venue-search-empty">
              No venues match “{query.trim()}” yet. <a href="/for-diners">See the places we have</a>
              .
            </p>
          )}
        </div>
      )}
      <p className="venue-search-hint">
        Try “The Daily Grind” or “Parkhurst”.{" "}
        <a href="/for-diners#find-a-restaurant">Browse all places</a>
      </p>
    </form>
  );
}
