import { createFileRoute, redirect } from "@tanstack/react-router";
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
  beforeLoad: ({ params, search }) => {
    if (typeof window === "undefined") return;
    const state = demoRepo.read();
    const role = params.role as DemoRole;
    if (!["guest", "staff", "owner", "operator"].includes(role)) return;
    const session: DemoRole extends never ? never : typeof state.session = {
      role,
    };
    if (search.customer) {
      const customer = state.customers.find((item) => item.id === search.customer);
      if (customer) (session as { customerId?: string }).customerId = customer.id;
    }
    if (search.restaurant) {
      const restaurant =
        state.restaurants.find((item) => item.id === search.restaurant) ??
        state.restaurants.find((item) => item.slug === search.restaurant);
      if (restaurant) session.restaurantId = restaurant.id;
    }
    if (search.staff) {
      const staff = state.staff.find((item) => item.id === search.staff);
      if (staff) {
        session.staffId = staff.id;
        session.restaurantId = staff.restaurantId;
      }
    }
    updateDemo((current) => ({ ...current, session }));
    throw redirect({ to: search.to });
  },
  component: DeepLinkLanding,
});

function DeepLinkLanding() {
  return (
    <main className="demo-hub page-width">
      <h1>Opening the demo…</h1>
      <p>
        <a href="/demo">Back to demo hub</a>
      </p>
    </main>
  );
}
