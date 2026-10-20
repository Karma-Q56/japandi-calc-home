import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { CreditCard, MapPin, UserRound, ChevronLeft } from "lucide-react";

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
        {back ? (
          <Link to={back.to} className="gx-back">
            <ChevronLeft size={18} style={{ verticalAlign: "-4px" }} />
            {back.label}
          </Link>
        ) : (
          <span />
        )}
        {title && <span>{title}</span>}
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
