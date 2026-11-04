import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MapPin, Search, Stamp } from "lucide-react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { createSeed } from "@/data/seed";
import type { Restaurant } from "@/data/types";

export const Route = createFileRoute("/find")({
  head: () => ({
    meta: [
      { title: "Find a restaurant | Patron" },
      {
        name: "description",
        content:
          "Find a cafe, bakery, restaurant or takeaway on Patron near you. Open its card or join with your phone number.",
      },
    ],
  }),
  component: FindPage,
});

const TYPE_LABELS: Record<NonNullable<Restaurant["venueType"]>, string> = {
  cafe: "Cafe",
  bakery: "Bakery",
  restaurant: "Restaurant",
  takeaway: "Takeaway",
};

const VENUES = createSeed().restaurants.filter((venue) => venue.status === "active");

type Sort = "name" | "suburb";

function FindPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<Restaurant["venueType"] | "all">("all");
  const [sort, setSort] = useState<Sort>("name");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return VENUES.filter((venue) => (type === "all" ? true : venue.venueType === type))
      .filter((venue) =>
        needle
          ? venue.name.toLowerCase().includes(needle) || venue.suburb.toLowerCase().includes(needle)
          : true,
      )
      .slice()
      .sort((a, b) =>
        sort === "suburb"
          ? a.suburb.localeCompare(b.suburb) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
      );
  }, [query, type, sort]);

  return (
    <MarketingShell>
      <section className="marketing-page-hero page-width find-hero">
        <span className="eyebrow">
          <span className="eyebrow-line" /> Find a restaurant
        </span>
        <h1>
          Your favourites, <span className="editorial">all in one place.</span>
        </h1>
        <p>
          Search by name or suburb, filter by the kind of place, and open its card. Joining takes
          your name and number, with no app to download.
        </p>
      </section>

      <section className="page-width find-body" aria-label="Restaurants on Patron">
        <div className="find-controls">
          <label className="find-search">
            <span>Search by name or suburb</span>
            <span className="find-search-field">
              <Search size={17} aria-hidden />
              <input
                type="search"
                value={query}
                placeholder="The Daily Grind or Melville"
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          </label>
          <label>
            Type of place
            <select
              value={type ?? "all"}
              onChange={(event) =>
                setType(
                  event.target.value === "all"
                    ? "all"
                    : (event.target.value as NonNullable<Restaurant["venueType"]>),
                )
              }
            >
              <option value="all">Every kind of place</option>
              <option value="cafe">Cafes</option>
              <option value="bakery">Bakeries</option>
              <option value="restaurant">Restaurants</option>
              <option value="takeaway">Takeaways</option>
            </select>
          </label>
          <label>
            Sort by
            <select value={sort} onChange={(event) => setSort(event.target.value === "suburb" ? "suburb" : "name")}>
              <option value="name">Name, A to Z</option>
              <option value="suburb">Suburb, A to Z</option>
            </select>
          </label>
        </div>

        <p className="find-count" role="status">
          {matches.length} place{matches.length === 1 ? "" : "s"} found
          {query.trim() ? ` for “${query.trim()}”` : ""}. Demo venues only in this preview.
        </p>

        {matches.length === 0 ? (
          <div className="find-empty">
            <h2>Nothing matches that yet.</h2>
            <p>Try a shorter name or the suburb. Or ask us to add your favourite place below.</p>
            <button className="builder-secondary" onClick={() => { setQuery(""); setType("all"); }}>
              Clear the filters
            </button>
          </div>
        ) : (
          <div className="find-grid">
            {matches.map((venue) => (
              <article className="find-card" key={venue.id}>
                <div className="find-card-head">
                  <span className="find-mark" aria-hidden>
                    {venue.name.slice(0, 1)}
                  </span>
                  <div>
                    <h2>{venue.name}</h2>
                    <p>
                      {venue.venueType ? TYPE_LABELS[venue.venueType] : "Place"} ·{" "}
                      <MapPin size={13} aria-hidden /> {venue.suburb}
                    </p>
                  </div>
                </div>
                <p className="find-reward">
                  <Stamp size={14} aria-hidden /> {venue.stampsRequired} stamps for{" "}
                  {venue.rewardDescription}
                </p>
                <div className="find-actions">
                  <a className="builder-secondary" href={`/r/${venue.slug}`}>
                    See the card
                  </a>
                  <a className="builder-secondary" href={`/r/${venue.slug}/join?src=find`}>
                    Join this place
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}

        <aside className="find-ask">
          <h2>Don’t see your favourite place?</h2>
          <p>
            Tell us which cafe, bakery or restaurant deserves a loyalty card. We count every ask and
            talk to the places guests mention most.
          </p>
          <a className="builder-primary" href="/suggest">
            Ask for a place
          </a>
        </aside>
      </section>
    </MarketingShell>
  );
}
