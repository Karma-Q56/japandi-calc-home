import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, MapPin, Search, Stamp } from "lucide-react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { useDemoState } from "@/data/useDemoState";
import type { Restaurant } from "@/data/types";
import { venueIsOpenNow } from "@/lib/johannesburg-time";
import { venueDistance, venueTypeLabel } from "@/lib/venue-details";
import { VenueCard } from "@/components/patron/VenueCard";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  FilterPills,
  Input,
  Select,
} from "@/components/patron/kit";

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

type VenueFilter = "all" | NonNullable<Restaurant["venueType"]> | "open" | "offers";
type Sort = "nearest" | "name";

const FILTERS: Array<{ value: VenueFilter; label: string }> = [
  { value: "all", label: "All places" },
  { value: "cafe", label: "Cafes" },
  { value: "bakery", label: "Bakeries" },
  { value: "restaurant", label: "Restaurants" },
  { value: "takeaway", label: "Takeaways" },
  { value: "open", label: "Open now" },
  { value: "offers", label: "Member offers" },
];

function sentenceCase(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function FindPage() {
  const state = useDemoState();
  const [query, setQuery] = useState("");
  const [suburb, setSuburb] = useState("all");
  const [filter, setFilter] = useState<VenueFilter>("all");
  const [sort, setSort] = useState<Sort>("nearest");
  const resultsRef = useRef<HTMLDivElement>(null);

  const venues = useMemo(
    () => state.restaurants.filter((venue) => venue.status === "active"),
    [state.restaurants],
  );
  const neighbourhoods = useMemo(
    () => [...new Set(venues.map((venue) => venue.suburb))].sort((a, b) => a.localeCompare(b)),
    [venues],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return venues
      .filter((venue) => {
        if (suburb !== "all" && venue.suburb !== suburb) return false;
        if (
          filter !== "all" &&
          filter !== "open" &&
          filter !== "offers" &&
          venue.venueType !== filter
        ) {
          return false;
        }
        if (filter === "open" && !venueIsOpenNow(venue.hours, state.now)) return false;
        if (
          filter === "offers" &&
          !state.specials.some(
            (special) =>
              special.restaurantId === venue.id && special.active && special.kind !== "public",
          )
        ) {
          return false;
        }
        if (!needle) return true;
        return [
          venue.name,
          venue.suburb,
          venue.theme.tagline,
          venue.rewardDescription,
          venueTypeLabel(venue),
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .slice()
      .sort((a, b) =>
        sort === "nearest"
          ? venueDistance(a) - venueDistance(b) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
      );
  }, [filter, query, sort, state.now, state.specials, suburb, venues]);

  const clearFilters = () => {
    setQuery("");
    setSuburb("all");
    setFilter("all");
    setSort("nearest");
  };

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
            Search by name or neighbourhood, then open a place to see its menu, specials and loyalty
            card. Joining takes your name and number, with no app to download.
          </p>
        </div>

        <form
          className="fd-controls"
          onSubmit={(event) => {
            event.preventDefault();
            const node = resultsRef.current;
            node?.focus({ preventScroll: true });
            node?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth",
              block: "start",
            });
          }}
        >
          <Field label="Search" className="fd-search-field">
            <span className="fd-search-box">
              <Search size={17} aria-hidden="true" />
              <Input
                type="search"
                value={query}
                placeholder="The Daily Grind or Parkhurst"
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          </Field>
          <Field label="Neighbourhood">
            <Select value={suburb} onChange={(event) => setSuburb(event.target.value)}>
              <option value="all">All neighbourhoods</option>
              {neighbourhoods.map((name) => (
                <option value={name} key={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" className="fd-find">
            <Search size={16} aria-hidden="true" />
            Find
          </Button>
        </form>

        <div className="fd-filter-row">
          <div className="fd-filters">
            <FilterPills
              options={FILTERS}
              value={filter}
              onChange={setFilter}
              label="Filter places"
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

        <div className="fd-results" ref={resultsRef} tabIndex={-1}>
          <div className="fd-results-head">
            <h2>
              Around the neighbourhood <span>({matches.length})</span>
            </h2>
            <p>Sample venues, illustrative photos</p>
          </div>

          {matches.length === 0 ? (
            <EmptyState
              title="No places match those filters."
              hint="Try a different neighbourhood, a shorter name, or clear the filters."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="fd-grid">
              {matches.map((venue) => {
                const open = venueIsOpenNow(venue.hours, state.now);
                const distance = venueDistance(venue);
                return (
                  <VenueCard
                    key={venue.id}
                    venue={venue}
                    href={`/r/${venue.slug}`}
                    open={open}
                    distanceKm={distance}
                  />
                );
              })}
            </div>
          )}
        </div>

        <p className="fd-ask">
          Don&apos;t see your favourite place? <a href="/suggest">Ask for a place</a>
        </p>
      </div>
    </MarketingShell>
  );
}
