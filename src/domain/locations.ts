import { demoRepo, updateDemo } from "@/data/repo";
import type { Location } from "@/data/types";
import { failure, success } from "./demo";
import { logAudit, requireScope } from "./audit";
import { canAddBranch, locationErrorMessage, validateLocation } from "@/lib/live-locations";

// Demo branches (D20). Same rules as the live database: one main branch, the main branch cannot be turned off,
// and a plan has a limit on active branches.

const DEMO_PLAN_LIMIT: Record<string, number> = { starter: 1, managed: 3, partner: 10, custom: 50 };

export function demoPlanMax(restaurantId: string): number {
  const restaurant = demoRepo.read().restaurants.find((r) => r.id === restaurantId);
  return DEMO_PLAN_LIMIT[restaurant?.plan ?? "starter"] ?? 1;
}

export function branchesFor(restaurantId: string): Location[] {
  return (demoRepo.read().locations ?? []).filter((l) => l.restaurantId === restaurantId);
}

function scoped(restaurantId: string) {
  const session = demoRepo.read().session;
  const scope = requireScope(session.role, session.restaurantId, restaurantId);
  if (!scope.ok) return scope;
  if (session.role !== "owner" && session.role !== "manager") {
    return failure("FORBIDDEN", "Only the owner or a manager can change branches.");
  }
  return scope;
}

function refuse(code: string) {
  return failure("INVALID", locationErrorMessage(code, undefined));
}

export function createBranch(
  restaurantId: string,
  input: { name: string; address: string; suburb: string; city: string },
  actorId: string,
) {
  const scope = scoped(restaurantId);
  if (!scope.ok) return scope;
  const check = validateLocation(input);
  if (!check.ok) return failure("INVALID", check.message);
  const active = branchesFor(restaurantId).filter((l) => l.active).length;
  const max = demoPlanMax(restaurantId);
  if (!canAddBranch(active, max)) {
    return failure("INVALID", locationErrorMessage("plan_limit_locations", max));
  }
  const id = `loc-${crypto.randomUUID()}`;
  const isMain = branchesFor(restaurantId).length === 0;
  updateDemo((current) => ({
    ...current,
    locations: [
      ...(current.locations ?? []),
      {
        id,
        restaurantId,
        name: input.name.trim(),
        address: input.address.trim(),
        suburb: input.suburb.trim(),
        city: input.city.trim(),
        isMain,
        active: true,
      },
    ],
  }));
  logAudit({ actor: actorId, action: "branch_add", restaurantId, object: id });
  return success({ locationId: id });
}

export function updateBranch(
  restaurantId: string,
  locationId: string,
  input: { name: string; address: string; suburb: string; city: string },
  actorId: string,
) {
  const scope = scoped(restaurantId);
  if (!scope.ok) return scope;
  const check = validateLocation(input);
  if (!check.ok) return failure("INVALID", check.message);
  const target = branchesFor(restaurantId).find((l) => l.id === locationId);
  if (!target) return failure("NOT_FOUND", locationErrorMessage("not_found"));
  updateDemo((current) => ({
    ...current,
    locations: (current.locations ?? []).map((l) =>
      l.id === locationId
        ? {
            ...l,
            name: input.name.trim(),
            address: input.address.trim(),
            suburb: input.suburb.trim(),
            city: input.city.trim(),
          }
        : l,
    ),
  }));
  logAudit({ actor: actorId, action: "branch_edit", restaurantId, object: locationId });
  return success({ locationId });
}

export function makeMainBranch(restaurantId: string, locationId: string, actorId: string) {
  const scope = scoped(restaurantId);
  if (!scope.ok) return scope;
  const target = branchesFor(restaurantId).find((l) => l.id === locationId);
  if (!target) return failure("NOT_FOUND", locationErrorMessage("not_found"));
  if (!target.active) return refuse("invalid_value");
  updateDemo((current) => ({
    ...current,
    locations: (current.locations ?? []).map((l) =>
      l.restaurantId === restaurantId ? { ...l, isMain: l.id === locationId } : l,
    ),
  }));
  logAudit({ actor: actorId, action: "branch_main", restaurantId, object: locationId });
  return success({ locationId });
}

export function turnOffBranch(restaurantId: string, locationId: string, actorId: string) {
  const scope = scoped(restaurantId);
  if (!scope.ok) return scope;
  const target = branchesFor(restaurantId).find((l) => l.id === locationId);
  if (!target) return failure("NOT_FOUND", locationErrorMessage("not_found"));
  if (target.isMain) return refuse("main_location");
  updateDemo((current) => ({
    ...current,
    locations: (current.locations ?? []).map((l) =>
      l.id === locationId ? { ...l, active: false } : l,
    ),
  }));
  logAudit({ actor: actorId, action: "branch_off", restaurantId, object: locationId });
  return success({ locationId });
}

export function turnOnBranch(restaurantId: string, locationId: string, actorId: string) {
  const scope = scoped(restaurantId);
  if (!scope.ok) return scope;
  const target = branchesFor(restaurantId).find((l) => l.id === locationId);
  if (!target) return failure("NOT_FOUND", locationErrorMessage("not_found"));
  if (!target.active) {
    const active = branchesFor(restaurantId).filter((l) => l.active).length;
    const max = demoPlanMax(restaurantId);
    if (!canAddBranch(active, max)) {
      return failure("INVALID", locationErrorMessage("plan_limit_locations", max));
    }
  }
  updateDemo((current) => ({
    ...current,
    locations: (current.locations ?? []).map((l) =>
      l.id === locationId ? { ...l, active: true } : l,
    ),
  }));
  logAudit({ actor: actorId, action: "branch_on", restaurantId, object: locationId });
  return success({ locationId });
}

/** Set which branch a team member works at, or all branches. */
export function setStaffBranch(
  restaurantId: string,
  staffId: string,
  locationId: string | null,
  allBranches: boolean,
  actorId: string,
) {
  const scope = scoped(restaurantId);
  if (!scope.ok) return scope;
  if (!allBranches && !locationId) return refuse("invalid_value");
  const staff = demoRepo.read().staff.find((s) => s.id === staffId && s.restaurantId === restaurantId);
  if (!staff) return failure("NOT_FOUND", "Team member not found.");
  if (!allBranches) {
    const branch = branchesFor(restaurantId).find((l) => l.id === locationId);
    if (!branch || !branch.active) return refuse("not_found");
  }
  updateDemo((current) => ({
    ...current,
    staff: current.staff.map((s) =>
      s.id === staffId
        ? { ...s, allBranches, locationId: allBranches ? null : locationId }
        : s,
    ),
  }));
  logAudit({ actor: actorId, action: "staff_branch", restaurantId, object: staffId });
  return success({ staffId });
}
