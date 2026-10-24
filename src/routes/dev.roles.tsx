import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { demoRepo, updateDemo } from "@/data/repo";
import { DEMO_ACCOUNTS, signInAsDemoAccount } from "@/lib/demo-signin";
import type { DemoRole } from "@/data/types";

const roles = ["guest", "staff", "owner", "manager", "operator"] as const;

const searchSchema = z.object({
  role: z.enum(roles).optional(),
  customer: z.string().optional(),
  restaurant: z.string().optional(),
  staff: z.string().optional(),
  to: z.string().optional(),
});

const defaultDestination: Record<(typeof roles)[number], string> = {
  guest: "/me",
  staff: "/stamp",
  owner: "/app",
  manager: "/app",
  operator: "/ops/restaurants",
};

export const Route = createFileRoute("/dev/roles")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [{ title: "Developer roles | Patron" }, { name: "robots", content: "noindex" }],
  }),
  component: DeveloperRoles,
});

/**
 * A deep link used by the milestone list: /dev/roles?role=owner&restaurant=…&to=/app/menu
 * applies that session and continues to `to`. Without `role` it shows a small chooser.
 */
function DeveloperRoles() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const role = search.role;

  useEffect(() => {
    if (!role) return;
    const state = demoRepo.read();
    const session: typeof state.session = { role: role as DemoRole };
    if (search.customer && state.customers.some((item) => item.id === search.customer)) {
      session.customerId = search.customer;
    }
    if (search.restaurant) {
      const restaurant =
        state.restaurants.find((item) => item.id === search.restaurant) ??
        state.restaurants.find((item) => item.slug === search.restaurant);
      if (restaurant) session.restaurantId = restaurant.id;
    }
    if (search.staff) {
      const member = state.staff.find((item) => item.id === search.staff);
      if (member) {
        session.staffId = member.id;
        session.restaurantId = member.restaurantId;
      }
    }
    updateDemo((current) => ({ ...current, session }));
    void navigate({ to: search.to ?? defaultDestination[role], replace: true });
  }, [role, search.customer, search.restaurant, search.staff, search.to, navigate]);

  if (role) {
    return (
      <main className="dev-roles page-width">
        <h1>Switching to the {role} view…</h1>
        <p>
          <a href="/login">Back to log in</a>
        </p>
      </main>
    );
  }

  return (
    <main className="dev-roles page-width">
      <span className="eyebrow">
        <span className="eyebrow-line" /> Developer only
      </span>
      <h1>Demo roles.</h1>
      <p>
        This page is not linked from the site. The marketing sign-in lives at{" "}
        <a href="/login">/login</a>.
      </p>
      <div className="dev-role-grid">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.id}
            type="button"
            onClick={() => {
              const to = signInAsDemoAccount(account.id);
              void navigate({ to });
            }}
          >
            <strong>{account.label}</strong>
            <span>{account.text}</span>
          </button>
        ))}
      </div>
      <p className="dev-role-note">
        Sessions live in this browser's demo storage. Use “Reset demo data” in the demo pill if a
        screen looks stale.
      </p>
    </main>
  );
}
