import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { demoRepo, updateDemo } from "@/data/repo";
import type { DemoRole } from "@/data/types";

const searchSchema = z.object({
  customer: z.string().optional(),
  restaurant: z.string().optional(),
  staff: z.string().optional(),
  to: z.string().default("/demo"),
});

export const Route = createFileRoute("/demo/as/$role")({
  validateSearch: (search) => searchSchema.parse(search),
  component: DeepLinkLanding,
});

function DeepLinkLanding() {
  const { role } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    const state = demoRepo.read();
    if (!["guest", "staff", "owner", "operator"].includes(role)) {
      void navigate({ to: "/demo", replace: true });
      return;
    }
    const session: typeof state.session = { role: role as DemoRole };
    if (search.customer && state.customers.some((c) => c.id === search.customer)) {
      session.customerId = search.customer;
    }
    if (search.restaurant) {
      const r =
        state.restaurants.find((x) => x.id === search.restaurant) ??
        state.restaurants.find((x) => x.slug === search.restaurant);
      if (r) session.restaurantId = r.id;
    }
    if (search.staff) {
      const s = state.staff.find((x) => x.id === search.staff);
      if (s) {
        session.staffId = s.id;
        session.restaurantId = s.restaurantId;
      }
    }
    updateDemo((current) => ({ ...current, session }));
    void navigate({ to: search.to, replace: true });
  }, [role, search.customer, search.restaurant, search.staff, search.to, navigate]);
  return (
    <main className="demo-hub page-width">
      <h1>Opening the demo…</h1>
      <p>
        <a href="/demo">Back to demo hub</a>
      </p>
    </main>
  );
}
