import type { CSSProperties } from "react";
import { Coffee, ShoppingBag, UtensilsCrossed, Wheat } from "lucide-react";
import type { Restaurant } from "@/data/types";

const VENUE_ICONS = {
  cafe: Coffee,
  bakery: Wheat,
  restaurant: UtensilsCrossed,
  takeaway: ShoppingBag,
} as const;

/**
 * The restaurant's own uploaded cover wins. Demo venues intentionally fall
 * back to quiet geometric art instead of borrowed stock photography.
 */
export function VenueMedia({
  restaurant,
  hero = false,
  className = "",
}: {
  restaurant: Restaurant;
  hero?: boolean;
  className?: string;
}) {
  const kind = restaurant.venueType ?? "restaurant";
  const Icon = VENUE_ICONS[kind];
  const classes = [
    "venue-media",
    hero ? "venue-media--hero" : "venue-media--card",
    restaurant.theme.coverPhoto ? "venue-media--photo" : "venue-media--art",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (restaurant.theme.coverPhoto) {
    return (
      <div className={classes}>
        <img
          src={restaurant.theme.coverPhoto}
          alt={`${restaurant.name} cover photo`}
          loading={hero ? "eager" : "lazy"}
        />
      </div>
    );
  }

  const style = {
    "--vm-ink": restaurant.theme.ink,
    "--vm-paper": restaurant.theme.paper,
    "--vm-accent": restaurant.theme.accent,
    "--vm-soft": restaurant.theme.accentSoft,
  } as CSSProperties;

  return (
    <div
      className={classes}
      style={style}
      role="img"
      aria-label={`Illustrative artwork for ${restaurant.name}`}
    >
      <span className="venue-media-orb" aria-hidden="true" />
      <span className="venue-media-arch" aria-hidden="true" />
      <span className="venue-media-lines" aria-hidden="true" />
      <span className="venue-media-icon" aria-hidden="true">
        <Icon size={hero ? 46 : 32} strokeWidth={1.35} />
      </span>
    </div>
  );
}
