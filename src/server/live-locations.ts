import { sql } from "drizzle-orm";
import type { Viewer } from "./auth-viewer";
import { withContext } from "./db";
import {
  LOCATION_REFUSAL_CODES,
  validateLocation,
  locationErrorMessage,
  type LocationInput,
} from "@/lib/live-locations";

// Branches for live owners (D20). The restaurant comes from the signed-in owner or manager, never from the browser.
// Every write is a SECURITY DEFINER function in migration 0031 that checks the caller's restaurant again.

const databaseUrl = () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
};

const canManage = (viewer: Viewer | null): viewer is Viewer & { restaurantId: string } =>
  !!viewer &&
  (viewer.role === "owner" || viewer.role === "manager") &&
  typeof viewer.restaurantId === "string";

/** Read the refusal code the database raised, by exact match on the error chain. */
export function locationRefusalCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const message: string = current.message;
    const match = LOCATION_REFUSAL_CODES.find((code) => code === message);
    if (match) return match;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return null;
}

export type BranchRow = {
  id: string;
  name: string;
  address: string | null;
  suburb: string | null;
  city: string;
  isMain: boolean;
  active: boolean;
  staffCount: number;
};

export type BranchesState = {
  plan: string;
  maxBranches: number;
  activeCount: number;
  branches: BranchRow[];
};

export type BranchResult = { ok: true } | { ok: false; message: string };

type ListRow = {
  id: string;
  name: string;
  address: string | null;
  suburb: string | null;
  city: string;
  is_main: boolean;
  active: boolean;
  staff_count: number;
};

/** The branches of the signed-in restaurant and the plan's limit. Null when the viewer cannot manage branches. */
export async function loadBranches(viewer: Viewer | null): Promise<BranchesState | null> {
  if (!canManage(viewer)) return null;
  return withContext(
    { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
    async (transaction) => {
      const planRow = await transaction.execute<{ plan: string; max_locations: number | null }>(sql`
        select r.plan, pl.max_locations
        from restaurant r join plan_limit pl on pl.plan = r.plan
        where r.id = ${viewer.restaurantId} limit 1
      `);
      const rows = await transaction.execute<ListRow>(sql`
        select l.id, l.name, l.address, l.suburb, l.city, l.is_main, l.active,
               (select count(*)::int from staff_member s
                 where s.location_id = l.id and s.active) as staff_count
        from location l
        where l.restaurant_id = ${viewer.restaurantId}
        order by l.is_main desc, l.active desc, l.name
      `);
      const plan = planRow.rows[0];
      const branches: BranchRow[] = rows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        suburb: row.suburb,
        city: row.city,
        isMain: row.is_main,
        active: row.active,
        staffCount: Number(row.staff_count),
      }));
      return {
        plan: plan?.plan ?? "starter",
        maxBranches: Number(plan?.max_locations ?? 1),
        activeCount: branches.filter((branch) => branch.active).length,
        branches,
      };
    },
  );
}

async function runWrite(
  viewer: Viewer | null,
  statement: (userId: string, transaction: Parameters<Parameters<typeof withContext>[1]>[0]) => Promise<unknown>,
): Promise<BranchResult> {
  if (!canManage(viewer)) return { ok: false, message: locationErrorMessage("not_found") };
  try {
    await withContext(
      { databaseUrl: databaseUrl(), restaurantId: viewer.restaurantId, isOperator: false },
      (transaction) => statement(viewer.userId, transaction),
    );
    return { ok: true };
  } catch (error) {
    const code = locationRefusalCode(error);
    if (code === "plan_limit_locations") {
      const state = await loadBranches(viewer);
      return { ok: false, message: locationErrorMessage(code, state?.maxBranches) };
    }
    return { ok: false, message: locationErrorMessage(code) };
  }
}

export async function createBranch(viewer: Viewer | null, input: LocationInput): Promise<BranchResult> {
  const check = validateLocation(input);
  if (!check.ok) return check;
  return runWrite(viewer, (userId, transaction) =>
    transaction.execute(sql`
      select create_location(${userId}, ${input.name.trim()}, ${input.address.trim()},
                             ${input.suburb.trim()}, ${input.city.trim()})
    `),
  );
}

export async function updateBranch(
  viewer: Viewer | null,
  locationId: string,
  input: LocationInput,
): Promise<BranchResult> {
  const check = validateLocation(input);
  if (!check.ok) return check;
  return runWrite(viewer, (userId, transaction) =>
    transaction.execute(sql`
      select update_location(${userId}, ${locationId}::uuid, ${input.name.trim()}, ${input.address.trim()},
                             ${input.suburb.trim()}, ${input.city.trim()})
    `),
  );
}

export async function makeMainBranch(viewer: Viewer | null, locationId: string): Promise<BranchResult> {
  return runWrite(viewer, (userId, transaction) =>
    transaction.execute(sql`select set_main_location(${userId}, ${locationId}::uuid)`),
  );
}

export async function turnOffBranch(viewer: Viewer | null, locationId: string): Promise<BranchResult> {
  return runWrite(viewer, (userId, transaction) =>
    transaction.execute(sql`select deactivate_location(${userId}, ${locationId}::uuid)`),
  );
}

export async function turnOnBranch(viewer: Viewer | null, locationId: string): Promise<BranchResult> {
  return runWrite(viewer, (userId, transaction) =>
    transaction.execute(sql`select reactivate_location(${userId}, ${locationId}::uuid)`),
  );
}

/** Pick the branch a team member works at, or all branches. */
export async function setStaffBranch(
  viewer: Viewer | null,
  staffId: string,
  locationId: string | null,
  allBranches: boolean,
): Promise<BranchResult> {
  if (!allBranches && !locationId) return { ok: false, message: locationErrorMessage("invalid_value") };
  return runWrite(viewer, (userId, transaction) =>
    transaction.execute(sql`
      select set_staff_location(${userId}, ${staffId}::uuid, ${locationId}::uuid, ${allBranches})
    `),
  );
}
