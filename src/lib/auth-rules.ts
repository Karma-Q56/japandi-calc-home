export type ViewerRole = "guest" | "owner" | "manager" | "operator";

export type Area = "me" | "app" | "ops";

/** Where a role belongs after signing in. */
export function landingForRole(role: ViewerRole): string {
  if (role === "owner" || role === "manager") return "/app";
  if (role === "operator") return "/ops/restaurants";
  return "/me";
}

/** Server and route guards share this one rule. */
export function canOpenArea(role: ViewerRole, area: Area): boolean {
  if (area === "app") return role === "owner" || role === "manager";
  if (area === "ops") return role === "operator";
  return role === "guest";
}
