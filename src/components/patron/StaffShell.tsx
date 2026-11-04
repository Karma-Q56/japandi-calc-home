import type { ReactNode } from "react";
import type { Restaurant } from "@/data/types";
import { Badge, VenueMark } from "@/components/patron/kit";
import { venueName } from "@/lib/venue-name";

/** Staff shell: restaurant identity on the left, till status on the right. */
export function StaffShell({
  restaurant,
  children,
  actions,
}: {
  restaurant: Restaurant;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="staff-shell">
      <header className="staff-top">
        <div className="staff-identity">
          <VenueMark name={venueName(restaurant.name)} theme={restaurant.theme} size="sm" />
          <span>
            <strong>{venueName(restaurant.name)}</strong>
            <small>Staff till</small>
          </span>
        </div>
        <div className="staff-actions">
          {actions}
          <Badge tone="accent">Staff</Badge>
        </div>
      </header>
      <main className="guest-page staff-page">{children}</main>
    </div>
  );
}
