import { useEffect, useState } from "react";
import { ArrowRight, MapPin, Search, Stamp } from "lucide-react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { CategoryPicker } from "@/components/patron/CategoryPicker";
import { SuburbPicker } from "@/components/patron/SuburbPicker";
import { Badge, Button, EmptyState, Field, FilterPills, Input } from "@/components/patron/kit";
import type { FindResult } from "@/server/live-find";
import { sortByDistance, suburbDistanceKm, type FindVenueType } from "@/lib/live-find";
import { searchFindFn } from "@/server/live-find-fns";

const TYPE_LABELS: Record<FindVenueType, string> = {
  cafe: "Cafe",
  bakery: "Bakery",
  restaurant: "Restaurant",
  takeaway: "Takeaway",
  other: "Place",
};

type Sort = "nearest" | "name";
type Availability = "all" | "open" | "offers";

/**
 * Live Find directory. Lists only restaurants the server returns (active and
 * publicly listed). Open now and member offers are filtered on the server, so
 * the browser never widens the list. Device location stays in the browser and
 * is not sent to the server; distance uses the chosen neighbourhood instead.
 */
export function LiveFindPage() {
  const [query, setQuery] = useState("");
  const [suburb, setSuburb] = useState("");
  const [type, setType] = useState<FindVenueType | "">("");
  const [sort, setSort] = useState<Sort>("nearest");
  const [availability, setAvailability] = useState<Availability>("all");
  const [page, setPage] = useState(0);
  const [venues, setVenues] = useState<FindResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reload from the first page whenever a search or filter changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchFindFn({ data: { query, suburb, type, page } })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.message);
          setVenues([]);
          setHasMore(false);
        } else {
          setError(null);
          setVenues((prev) => (page === 0 ? result.venues : [...prev, ...result.venues]));
          setHasMore(result.hasMore);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, suburb, type, page]);

  const resetPaging = (apply: () => void) => {
    apply();
    setPage(0);
  };

  // Open now and member offers are already on each row, so these filter the loaded page only.
  const matching = venues.filter((venue) => {
    if (availability === "open") return venue.open;
    if (availability === "offers") return venue.hasMemberOffer;
    return true;
  });
  const shown =
    sort === "nearest" && suburb
      ? sortByDistance(matching, suburb)
      : [...matching].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <MarketingShell>
      <div className="page-width fd-page">
        <div className="fd-head">
          <p className="fd-location">
            <MapPin size={15} aria-hidden="true" />
            Johannesburg, Gauteng
          </p>
          <h1 className="fd-title">
            Find a restaurant. <span className="pk-accent">Become a regular.</span>
          </h1>
          <p className="fd-intro">
            Search by name, neighbourhood or type. Open a place to see its loyalty card.
          </p>
        </div>

        <div className="fd-controls">
          <Field label="Search" className="fd-search-field">
            <span className="fd-search-box">
              <Search size={17} aria-hidden="true" />
              <Input
                type="search"
                value={query}
                placeholder="A name, suburb or type"
                onChange={(event) => resetPaging(() => setQuery(event.target.value))}
              />
            </span>
          </Field>
          <SuburbPicker
            value={suburb}
            onChange={(value) => resetPaging(() => setSuburb(value))}
          />
        </div>

        <div className="fd-filter-row">
          <div className="fd-filters">
            <CategoryPicker value={type} onChange={(value) => resetPaging(() => setType(value))} />
            <FilterPills
              label="Show"
              value={availability}
              onChange={(value) => setAvailability(value)}
              options={[
                { value: "all", label: "All" },
                { value: "open", label: "Open now" },
                { value: "offers", label: "Member offers" },
              ]}
            />
          </div>
          <label className="fd-sort">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value === "name" ? "name" : "nearest")}
            >
              <option value="nearest">Nearest</option>
              <option value="name">Name, A to Z</option>
            </select>
          </label>
        </div>

        <div className="fd-results">
          <div className="fd-results-head">
            <h2>
              Restaurants <span>({shown.length})</span>
            </h2>
            <p>Distances are about 1 km and use the neighbourhood you pick.</p>
          </div>

          {error ? (
            <EmptyState title="Could not load restaurants." hint={error} />
          ) : !loading && shown.length === 0 ? (
            <EmptyState
              title="No restaurants found. Try another suburb."
              hint="Nothing is listed here yet, or nothing matches. Clear the search to see more."
            />
          ) : (
            <div className="fd-grid">
              {shown.map((venue) => {
                const distance = suburb ? suburbDistanceKm(suburb, venue.suburb) : undefined;
                return (
                  <article className="fd-card" key={venue.id}>
                    <div className="fd-card-media">
                      {venue.logoUrl ? (
                        <img src={venue.logoUrl} alt={`${venue.name} logo`} loading="lazy" />
                      ) : (
                        <span className="fd-card-initial" aria-hidden="true">
                          {venue.name.slice(0, 1)}
                        </span>
                      )}
                      <Badge className="fd-card-category">{TYPE_LABELS[venue.venueType]}</Badge>
                      {venue.open ? (
                        <span className="fd-card-open">Open now</span>
                      ) : (
                        <span className="fd-card-open">Closed</span>
                      )}
                    </div>
                    <div className="fd-card-body">
                      <p className="fd-card-meta">
                        <MapPin size={13} aria-hidden="true" />
                        {venue.suburb ?? "Johannesburg"}
                        {distance !== undefined ? ` · ${distance.toFixed(1)} km` : ""}
                      </p>
                      <strong className="fd-card-name">{venue.name}</strong>
                      <p className="fd-reward">
                        <Stamp size={15} aria-hidden="true" />
                        {venue.stampsRequired} stamps for {venue.rewardDescription}
                      </p>
                      {venue.hasMemberOffer && <Badge tone="accent">Member offer</Badge>}
                      <Button variant="secondary" href={`/r/${venue.slug}`} className="fd-card-button">
                        View restaurant
                        <ArrowRight size={16} aria-hidden="true" />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {hasMore && (
            <Button variant="secondary" onClick={() => setPage((p) => p + 1)} disabled={loading}>
              Show more
            </Button>
          )}
        </div>
      </div>
    </MarketingShell>
  );
}
