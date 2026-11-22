// @vitest-environment node
// Real database tests for migration 0031 (branches: add, edit, main, off and on, staff branch,
// and the branch a new row gets). Added in review: the migration had a text test only.
// Plan limits are starter 1, growth 3, pro 10 branches.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asApp,
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  makeRestaurant,
  newFixtures,
  token,
  type DbConnections,
  type Fixtures,
  type Tx,
} from "../db-fixture";

type Plan = "starter" | "managed" | "partner";

describe.skipIf(!dbTestsEnabled)("branches (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  /** A restaurant on a plan, with its owner login. The main branch is made by the database. */
  async function shop(plan: Plan = "partner") {
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    await db.owner`update restaurant set plan = ${plan}::plan_tier where id = ${restaurantId}`;
    const userId = await makeAppUser(db.owner, fixtures, { role: "owner", restaurantId });
    const [main] = await db.owner<{ id: string }[]>`select id from location where restaurant_id = ${restaurantId} and is_main`;
    return { restaurantId, userId, mainId: main!.id };
  }

  /** Run one call as the app role; keep the change unless it fails. Returns "ok" or the error text. */
  async function call(restaurantId: string, run: (tx: Tx) => Promise<unknown>): Promise<string> {
    try {
      await asApp(db.app, { restaurantId }, run, { rollback: false });
      return "ok";
    } catch (error) {
      return String(error);
    }
  }

  async function addBranch(restaurantId: string, userId: string, name = `Branch ${token().slice(0, 6)}`) {
    let id = "";
    const result = await call(restaurantId, async (tx) => {
      const [row] = await tx`select create_location(${userId}, ${name}, '1 Main Road', 'Rosebank', 'Johannesburg') as id`;
      id = row!["id"] as string;
    });
    return { result, id };
  }

  async function loc(id: string) {
    const [row] = await db.owner<{ name: string; address: string | null; suburb: string | null; city: string; is_main: boolean; active: boolean }[]>`
      select name, address, suburb, city, is_main, active from location where id = ${id}`;
    return row;
  }

  async function auditCount(restaurantId: string, action: string): Promise<number> {
    const [row] = await db.owner<{ n: number }[]>`select count(*)::int as n from audit_event where restaurant_id = ${restaurantId} and action = ${action}`;
    return row!.n;
  }

  it("refuses a user who does not own or manage a restaurant", async () => {
    const { restaurantId, mainId } = await shop();
    const guestLogin = await makeAppUser(db.owner, fixtures, { role: "guest" });
    for (const who of [guestLogin, "no-such-user"]) {
      expect(await call(restaurantId, (tx) => tx`select create_location(${who}, 'X', '', '', 'Johannesburg')`)).toMatch(/not_allowed/);
      expect(await call(restaurantId, (tx) => tx`select update_location(${who}, ${mainId}::uuid, 'X', '', '', 'Johannesburg')`)).toMatch(/not_allowed/);
      expect(await call(restaurantId, (tx) => tx`select set_main_location(${who}, ${mainId}::uuid)`)).toMatch(/not_allowed/);
      expect(await call(restaurantId, (tx) => tx`select deactivate_location(${who}, ${mainId}::uuid)`)).toMatch(/not_allowed/);
      expect(await call(restaurantId, (tx) => tx`select reactivate_location(${who}, ${mainId}::uuid)`)).toMatch(/not_allowed/);
      expect(await call(restaurantId, (tx) => tx`select set_staff_location(${who}, ${crypto.randomUUID()}::uuid, ${mainId}::uuid, false)`)).toMatch(/not_allowed/);
    }
  });

  it("adds a branch that is never main, trims the text, and writes an audit row", async () => {
    const { restaurantId, userId, mainId } = await shop("partner");
    const { result, id } = await addBranch(restaurantId, userId, "  Sandton City  ");
    expect(result).toBe("ok");
    expect(await loc(id)).toMatchObject({ name: "Sandton City", address: "1 Main Road", suburb: "Rosebank", city: "Johannesburg", is_main: false, active: true });
    expect((await loc(mainId))!.is_main).toBe(true);
    expect(await auditCount(restaurantId, "location_added")).toBe(1);
    // Blank address and suburb are stored as empty, not as a blank string.
    let blankId = "";
    await call(restaurantId, async (tx) => {
      const [row] = await tx`select create_location(${userId}, 'Pop up', '   ', '', 'Pretoria') as id`;
      blankId = row!["id"] as string;
    });
    expect(await loc(blankId)).toMatchObject({ address: null, suburb: null, city: "Pretoria" });
  });

  it("checks the branch text", async () => {
    const { restaurantId, userId } = await shop("partner");
    const bad: Array<[string, string, string | null]> = [
      ["", "Johannesburg", null],
      ["x".repeat(81), "Johannesburg", null],
      ["Fine", "", null],
      ["Fine", "Johannesburg", "x".repeat(201)],
    ];
    for (const [name, city, address] of bad) {
      expect(await call(restaurantId, (tx) => tx`select create_location(${userId}, ${name}, ${address}, '', ${city})`), `${name.slice(0, 10)}/${city}`).toMatch(/invalid_value/);
    }
    expect(await call(restaurantId, (tx) => tx`select create_location(${userId}, 'Fine', null, null, null)`)).toMatch(/invalid_value/);
  });

  it("enforces the plan limit when adding a branch", async () => {
    const starter = await shop("starter");
    expect((await addBranch(starter.restaurantId, starter.userId)).result).toMatch(/plan_limit_locations/);
    const growth = await shop("managed");
    expect((await addBranch(growth.restaurantId, growth.userId)).result).toBe("ok");
    expect((await addBranch(growth.restaurantId, growth.userId)).result).toBe("ok");
    expect((await addBranch(growth.restaurantId, growth.userId)).result).toMatch(/plan_limit_locations/);
  });

  it("edits only a branch of the caller's own restaurant", async () => {
    const mine = await shop("partner");
    const theirs = await shop("partner");
    const { id } = await addBranch(mine.restaurantId, mine.userId);
    expect(await call(mine.restaurantId, (tx) => tx`select update_location(${mine.userId}, ${id}::uuid, 'Renamed', '2 Side Street', 'Melville', 'Johannesburg')`)).toBe("ok");
    expect(await loc(id)).toMatchObject({ name: "Renamed", address: "2 Side Street", suburb: "Melville" });
    expect(await auditCount(mine.restaurantId, "location_changed")).toBe(1);
    expect(await call(theirs.restaurantId, (tx) => tx`select update_location(${theirs.userId}, ${id}::uuid, 'Stolen', '', '', 'Johannesburg')`)).toMatch(/not_found/);
    expect((await loc(id))!.name).toBe("Renamed");
    expect(await call(mine.restaurantId, (tx) => tx`select update_location(${mine.userId}, null, 'X', '', '', 'Johannesburg')`)).toMatch(/not_found/);
    expect(await call(mine.restaurantId, (tx) => tx`select update_location(${mine.userId}, ${id}::uuid, '', '', '', 'Johannesburg')`)).toMatch(/invalid_value/);
  });

  it("makes another active branch the main one, leaving exactly one main", async () => {
    const mine = await shop("partner");
    const theirs = await shop("partner");
    const { id } = await addBranch(mine.restaurantId, mine.userId);
    expect(await call(mine.restaurantId, (tx) => tx`select set_main_location(${mine.userId}, ${id}::uuid)`)).toBe("ok");
    const mains = await db.owner<{ id: string }[]>`select id from location where restaurant_id = ${mine.restaurantId} and is_main`;
    expect(mains.map((m) => m.id)).toEqual([id]);
    expect(await auditCount(mine.restaurantId, "location_main_changed")).toBe(1);
    // Another restaurant's branch, an unknown branch and a switched-off branch are all refused.
    expect(await call(mine.restaurantId, (tx) => tx`select set_main_location(${mine.userId}, ${theirs.mainId}::uuid)`)).toMatch(/not_found/);
    expect(await call(mine.restaurantId, (tx) => tx`select set_main_location(${mine.userId}, ${crypto.randomUUID()}::uuid)`)).toMatch(/not_found/);
    const off = await addBranch(mine.restaurantId, mine.userId);
    await call(mine.restaurantId, (tx) => tx`select deactivate_location(${mine.userId}, ${off.id}::uuid)`);
    expect(await call(mine.restaurantId, (tx) => tx`select set_main_location(${mine.userId}, ${off.id}::uuid)`)).toMatch(/not_found/);
  });

  it("switches a branch off and on, never the main one, and checks the plan limit on the way back on", async () => {
    const { restaurantId, userId, mainId } = await shop("managed"); // three branches at most
    expect(await call(restaurantId, (tx) => tx`select deactivate_location(${userId}, ${mainId}::uuid)`)).toMatch(/main_location/);
    expect((await loc(mainId))!.active).toBe(true);

    const a = await addBranch(restaurantId, userId);
    const b = await addBranch(restaurantId, userId);
    expect(await call(restaurantId, (tx) => tx`select deactivate_location(${userId}, ${a.id}::uuid)`)).toBe("ok");
    expect((await loc(a.id))!.active).toBe(false);
    expect(await auditCount(restaurantId, "location_deactivated")).toBe(1);

    // With a switched off there is room for a third active branch, which then fills the plan.
    const c = await addBranch(restaurantId, userId);
    expect(c.result).toBe("ok");
    expect(await call(restaurantId, (tx) => tx`select reactivate_location(${userId}, ${a.id}::uuid)`)).toMatch(/plan_limit_locations/);
    expect((await loc(a.id))!.active).toBe(false);
    // Switching off another one makes room again.
    await call(restaurantId, (tx) => tx`select deactivate_location(${userId}, ${b.id}::uuid)`);
    expect(await call(restaurantId, (tx) => tx`select reactivate_location(${userId}, ${a.id}::uuid)`)).toBe("ok");
    expect((await loc(a.id))!.active).toBe(true);
    expect(await auditCount(restaurantId, "location_reactivated")).toBe(1);
    // Reactivating a branch that is already on is harmless, even when the plan is full.
    expect(await call(restaurantId, (tx) => tx`select reactivate_location(${userId}, ${a.id}::uuid)`)).toBe("ok");

    const stranger = await shop("partner");
    expect(await call(restaurantId, (tx) => tx`select deactivate_location(${userId}, ${stranger.mainId}::uuid)`)).toMatch(/not_found/);
    expect(await call(restaurantId, (tx) => tx`select reactivate_location(${userId}, ${stranger.mainId}::uuid)`)).toMatch(/not_found/);
  });

  it("sets which branch a team member works at, or all branches, within the caller's restaurant", async () => {
    const mine = await shop("partner");
    const theirs = await shop("partner");
    const { id: branchId } = await addBranch(mine.restaurantId, mine.userId);
    const staff = async (restaurantId: string) => {
      const [row] = await db.owner<{ id: string }[]>`
        insert into staff_member (restaurant_id, display_name, pin_hmac) values (${restaurantId}, 'Till Tina', ${token()}) returning id`;
      return row!.id;
    };
    const mineStaff = await staff(mine.restaurantId);
    const theirStaff = await staff(theirs.restaurantId);
    const read = async (id: string) => {
      const [row] = await db.owner<{ location_id: string | null; all_branches: boolean }[]>`select location_id, all_branches from staff_member where id = ${id}`;
      return row!;
    };
    // A new team member starts at the main branch.
    expect(await read(mineStaff)).toEqual({ location_id: mine.mainId, all_branches: false });

    expect(await call(mine.restaurantId, (tx) => tx`select set_staff_location(${mine.userId}, ${mineStaff}::uuid, ${branchId}::uuid, false)`)).toBe("ok");
    expect(await read(mineStaff)).toEqual({ location_id: branchId, all_branches: false });

    // All branches keeps the last branch on record and needs no branch id.
    expect(await call(mine.restaurantId, (tx) => tx`select set_staff_location(${mine.userId}, ${mineStaff}::uuid, null, true)`)).toBe("ok");
    expect(await read(mineStaff)).toEqual({ location_id: branchId, all_branches: true });
    expect(await auditCount(mine.restaurantId, "staff_branch_changed")).toBe(2);

    expect(await call(mine.restaurantId, (tx) => tx`select set_staff_location(${mine.userId}, ${theirStaff}::uuid, ${branchId}::uuid, false)`)).toMatch(/not_found/);
    expect(await call(mine.restaurantId, (tx) => tx`select set_staff_location(${mine.userId}, ${mineStaff}::uuid, ${theirs.mainId}::uuid, false)`)).toMatch(/not_found/);
    expect(await call(mine.restaurantId, (tx) => tx`select set_staff_location(${mine.userId}, ${mineStaff}::uuid, null, false)`)).toMatch(/not_found/);
    expect(await call(mine.restaurantId, (tx) => tx`select set_staff_location(${mine.userId}, null, ${branchId}::uuid, false)`)).toMatch(/invalid_value/);
    expect(await call(mine.restaurantId, (tx) => tx`select set_staff_location(${mine.userId}, ${mineStaff}::uuid, ${branchId}::uuid, null)`)).toMatch(/invalid_value/);
    expect(await read(theirStaff)).toEqual({ location_id: theirs.mainId, all_branches: false });
  });

  it("gives a new row the branch named in the session when it is an active branch of the same restaurant, else the main branch", async () => {
    const mine = await shop("partner");
    const theirs = await shop("partner");
    const { id: branchId } = await addBranch(mine.restaurantId, mine.userId);
    const { id: offId } = await addBranch(mine.restaurantId, mine.userId);
    await db.owner`update location set active = false where id = ${offId}`;

    async function newStaffLocation(sessionValue: string | null): Promise<string | null> {
      return db.owner.begin(async (tx) => {
        await tx`select set_config('app.location_id', ${sessionValue ?? ""}, true)`;
        const [row] = await tx<{ location_id: string | null }[]>`
          insert into staff_member (restaurant_id, display_name, pin_hmac) values (${mine.restaurantId}, 'Fill test', ${token()})
          returning location_id`;
        return row!.location_id;
      });
    }
    expect(await newStaffLocation(null)).toBe(mine.mainId);
    expect(await newStaffLocation(branchId)).toBe(branchId);
    expect(await newStaffLocation(offId)).toBe(mine.mainId); // switched off
    expect(await newStaffLocation(theirs.mainId)).toBe(mine.mainId); // someone else's branch
    expect(await newStaffLocation("not-a-uuid")).toBe(mine.mainId); // bad text never raises
    expect(await newStaffLocation(crypto.randomUUID())).toBe(mine.mainId);
  });
});
