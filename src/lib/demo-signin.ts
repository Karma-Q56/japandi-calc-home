import { demoRepo, updateDemo } from "@/data/repo";

/** The four accounts the marketing login and the developer role page offer. */
export type DemoAccount = "diner" | "owner" | "staff" | "admin";

export const DEMO_ACCOUNTS: Array<{
  id: DemoAccount;
  label: string;
  text: string;
}> = [
  { id: "diner", label: "Diner", text: "Cards, stamps, rewards and offers." },
  { id: "owner", label: "Owner", text: "Dashboard, guests, loyalty and campaigns." },
  { id: "staff", label: "Staff", text: "The till: scan, stamp, redeem and undo." },
  { id: "admin", label: "Admin", text: "Patron's own venue and credit console." },
];

/**
 * Switch the local demo session and return where that account belongs.
 * Real sign-in is not wired yet; every marketing sign-in button ends up here.
 */
export function signInAsDemoAccount(account: DemoAccount): string {
  const state = demoRepo.read();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0];
  if (!restaurant) return "/";

  if (account === "diner") {
    const membership =
      state.memberships.find((item) => item.restaurantId === restaurant.id) ??
      state.memberships[0];
    if (!membership) return "/for-diners";
    updateDemo((current) => ({
      ...current,
      session: { role: "guest", customerId: membership.customerId },
    }));
    return "/me";
  }

  if (account === "owner") {
    updateDemo((current) => ({
      ...current,
      session: { role: "owner", restaurantId: restaurant.id },
    }));
    return "/app";
  }

  if (account === "staff") {
    const staffId = state.staff.find((item) => item.restaurantId === restaurant.id)?.id;
    updateDemo((current) => ({
      ...current,
      session: {
        role: "staff",
        restaurantId: restaurant.id,
        tillPairedRestaurantId: restaurant.id,
        ...(staffId ? { staffId } : {}),
      },
    }));
    return "/stamp";
  }

  updateDemo((current) => ({ ...current, session: { role: "operator" } }));
  return "/ops/restaurants";
}
