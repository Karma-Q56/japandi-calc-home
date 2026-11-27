export type ViewerRole = "guest" | "owner" | "manager" | "operator";

export type Area = "me" | "app" | "ops";

/** Where a role belongs after signing in. */
export function landingForRole(role: ViewerRole): string {
  if (role === "owner" || role === "manager") return "/app";
  if (role === "operator") return "/ops/restaurants";
  return "/me";
}

/**
 * The only place a log-in or sign-up may send someone back to is a restaurant's join page.
 * Anything else is ignored, so a crafted link cannot send a person to another site.
 */
export function joinReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\/r\/[a-z0-9-]{1,60}\/join(\?[A-Za-z0-9=&_-]{0,120})?$/.test(value) ? value : null;
}

/** Server and route guards share this one rule. */
export function canOpenArea(role: ViewerRole, area: Area): boolean {
  if (area === "app") return role === "owner" || role === "manager";
  if (area === "ops") return role === "operator";
  return role === "guest";
}
