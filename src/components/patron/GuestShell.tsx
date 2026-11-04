import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { CreditCard, MapPin, UserRound } from "lucide-react";
import { PatronBrand } from "@/lib/patron-brand";
import { BackLink } from "@/components/patron/BackLink";

export function GuestShell({
  children,
  back,
  title,
}: {
  children: ReactNode;
  back?: { to: string; label: string };
  title?: string;
}) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const onCards = path === "/me" || path.endsWith("/card");
  const onRestaurants = path.startsWith("/me/restaurants");
  const onMe = path === "/me/settings";
  return (
    <div className="gx">
      <header className="gx-top">
        <PatronBrand className="gx-brand-wordmark" />
        {back ? <BackLink to={back.to} label={back.label} className="gx-back" /> : <span />}
        {title && (
          <span className="gx-title" title={title}>
            {title}
          </span>
        )}
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
