import type { ReactNode } from "react";
import { ArrowRight, MapPin, Stamp } from "lucide-react";
import type { Restaurant } from "@/data/types";
import { venueTypeLabel } from "@/lib/venue-details";
import { VenueMedia } from "@/components/patron/VenueMedia";
import { Badge, Button } from "@/components/patron/kit";

function sentenceCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * The one restaurant card used on Find a restaurant and on the diner
 * Restaurants tab, so every restaurant looks the same everywhere.
 */
export function VenueCard({
  venue,
  href,
  open,
  distanceKm,
  buttonLabel = "View restaurant",
  children,
}: {
  venue: Restaurant;
  href: string;
  open?: boolean;
  distanceKm?: number;
  buttonLabel?: string;
  children?: ReactNode;
}) {
  return (
    <article className="fd-card">
      <div className="fd-card-media">
        <VenueMedia restaurant={venue} />
        <Badge className="fd-card-category">{venueTypeLabel(venue)}</Badge>
        {open && <span className="fd-card-open">Open now</span>}
      </div>
      <div className="fd-card-body">
        <p className="fd-card-meta">
          <MapPin size={13} aria-hidden="true" />
          {venue.suburb}
          {distanceKm !== undefined ? ` · ${distanceKm.toFixed(1)} km` : ""}
        </p>
        <strong className="fd-card-name">{venue.name}</strong>
        <p className="fd-card-tagline">{venue.theme.tagline}</p>
        <p className="fd-reward">
          <Stamp size={15} aria-hidden="true" />
          {venue.stampsRequired} stamps. {sentenceCase(venue.rewardDescription)}.
        </p>
        {children}
        <Button variant="secondary" href={href} className="fd-card-button">
          {buttonLabel}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
