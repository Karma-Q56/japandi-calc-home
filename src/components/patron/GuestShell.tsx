import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { CreditCard, MapPin, UserRound } from "lucide-react";
import { PatronBrand } from "@/lib/patron-brand";
import type { Theme } from "@/data/types";
import { BackLink } from "@/components/patron/BackLink";
import { VenueMark } from "@/components/patron/kit";
import { venueName } from "@/lib/venue-name";

export function GuestShell({
  children,
  back,
  title,
  venue,
}: {
  children: ReactNode;
  back?: { to: string; label: string };
  title?: string;
  venue?: { name: string; theme?: Theme };
}) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const onCards = path === "/me" || path.endsWith("/card");
  const onRestaurants = path.startsWith("/me/restaurants");
  const onMe = path === "/me/settings";
  return (
    <div className="gx">
      <header className="gx-top">
        <div className="gx-identity">
          {venue ? (
            <>
              <VenueMark
                name={venueName(venue.name)}
                size="sm"
                {...(venue.theme ? { theme: venue.theme } : {})}
              />
              <span className="gx-identity-copy">
                <strong>{venueName(venue.name)}</strong>
                <small>Loyalty card</small>
              </span>
            </>
          ) : (
            <PatronBrand className="gx-brand-wordmark" />
          )}
        </div>
        <div className="gx-header-actions">
          {back ? <BackLink to={back.to} label={back.label} className="gx-back" /> : null}
          {title && (
            <span className="gx-title" title={title}>
              {title}
            </span>
          )}
        </div>
      </header>
      <main className="gx-body">{children}</main>
      <nav className="gx-tabs" aria-label="Guest sections">
        <Link to="/me" className={`gx-tab${onCards ? " is-active" : ""}`}>
          <CreditCard /> Cards
        </Link>
        <Link to="/me/restaurants" className={`gx-tab${onRestaurants ? " is-active" : ""}`}>
          <MapPin /> Restaurants
        </Link>
        <Link to="/me/settings" className={`gx-tab${onMe ? " is-active" : ""}`}>
          <UserRound /> Me
        </Link>
      </nav>
    </div>
  );
}
