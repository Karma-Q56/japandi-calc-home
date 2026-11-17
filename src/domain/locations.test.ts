import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import type { Plan } from "@/data/types";
import {
  branchesFor,
  createBranch,
  demoPlanMax,
  makeMainBranch,
  setStaffBranch,
  turnOffBranch,
  turnOnBranch,
  updateBranch,
} from "@/domain/locations";

const RESTAURANT = "rest-daily-grind";
const owner = { role: "owner" as const, restaurantId: RESTAURANT };
const manager = { role: "manager" as const, restaurantId: RESTAURANT };
const staff = { role: "staff" as const, restaurantId: RESTAURANT };
const ADDRESS = { name: "Harbour Street", address: "1 Harbour Street", suburb: "Central", city: "Durban" };

function setSession(session: { role: string; restaurantId: string }) {
  updateDemo((current) => ({ ...current, session: { ...current.session, ...session } as typeof current.session }));
}

function setPlan(plan: Plan) {
  updateDemo((current) => ({
    ...current,
    restaurants: current.restaurants.map((r) => (r.id === RESTAURANT ? { ...r, plan } : r)),
  }));
}

beforeEach(() => {
  demoRepo.reset();
  setSession(owner);
});

describe("demo branches: seed", () => {
  it("starts with two branches and one main branch", () => {
    const list = branchesFor(RESTAURANT);
    expect(list.map((l) => l.name).sort()).toEqual(["Parkhurst", "Sandton"]);
    expect(list.filter((l) => l.isMain)).toHaveLength(1);
    expect(list.find((l) => l.isMain)?.id).toBe("loc-daily-grind-main");
    expect(list.every((l) => l.active)).toBe(true);
  });

  it("gives the demo restaurant the custom plan limit of 50", () => {
    expect(demoPlanMax(RESTAURANT)).toBe(50);
  });
});

describe("demo branches: add", () => {
  it("adds a branch that is not main and records an audit event", () => {
    const before = demoRepo.read().audit.length;
    const result = createBranch(RESTAURANT, { ...ADDRESS, name: "  Beachfront  " }, "owner");
    expect(result.ok).toBe(true);
    const added = branchesFor(RESTAURANT).find((l) => l.name === "Beachfront");
    expect(added).toBeDefined();
    expect(added?.isMain).toBe(false);
    expect(added?.active).toBe(true);
    expect(demoRepo.read().audit.length).toBe(before + 1);
  });

  it("refuses a blank name with a clear message and adds nothing", () => {
    const before = branchesFor(RESTAURANT).length;
    const result = createBranch(RESTAURANT, { ...ADDRESS, name: "   " }, "owner");
    expect(result.ok).toBe(false);
    expect(branchesFor(RESTAURANT)).toHaveLength(before);
  });

  it("refuses an address that is too long", () => {
    const result = createBranch(RESTAURANT, { ...ADDRESS, address: "x".repeat(201) }, "owner");
    expect(result.ok).toBe(false);
  });

  it("refuses when the plan limit is reached", () => {
    setPlan("starter" as Plan);
    const result = createBranch(RESTAURANT, ADDRESS, "owner");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("Your plan includes 1 branch. Ask Patron to change your plan.");
    expect(branchesFor(RESTAURANT).filter((l) => l.active)).toHaveLength(2);
  });

  it("refuses a staff member and a manager, who cannot change branches in the demo", () => {
    setSession(staff);
    expect(createBranch(RESTAURANT, ADDRESS, "staff").ok).toBe(false);
    setSession(manager);
    expect(createBranch(RESTAURANT, ADDRESS, "manager").ok).toBe(false);
  });

  it("refuses a branch for another restaurant", () => {
    expect(createBranch("rest-oak-table", ADDRESS, "owner").ok).toBe(false);
  });
});

describe("demo branches: edit", () => {
  it("changes the name and address of a branch", () => {
    const result = updateBranch(RESTAURANT, "loc-daily-grind-sandton", ADDRESS, "owner");
    expect(result.ok).toBe(true);
    const edited = branchesFor(RESTAURANT).find((l) => l.id === "loc-daily-grind-sandton");
    expect(edited?.name).toBe("Harbour Street");
  });

  it("refuses an unknown branch", () => {
    const result = updateBranch(RESTAURANT, "loc-missing", ADDRESS, "owner");
    expect(result.ok).toBe(false);
  });
});

describe("demo branches: main, turn off and turn on", () => {
  it("moves the main branch to another branch", () => {
    expect(makeMainBranch(RESTAURANT, "loc-daily-grind-sandton", "owner").ok).toBe(true);
    const list = branchesFor(RESTAURANT);
    expect(list.filter((l) => l.isMain).map((l) => l.id)).toEqual(["loc-daily-grind-sandton"]);
  });

  it("refuses to turn off the main branch", () => {
    const result = turnOffBranch(RESTAURANT, "loc-daily-grind-main", "owner");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(
      "The main branch cannot be turned off. Make another branch the main one first.",
    );
    expect(branchesFor(RESTAURANT).find((l) => l.id === "loc-daily-grind-main")?.active).toBe(true);
  });

  it("turns off a branch that is not main", () => {
    expect(turnOffBranch(RESTAURANT, "loc-daily-grind-sandton", "owner").ok).toBe(true);
    expect(branchesFor(RESTAURANT).find((l) => l.id === "loc-daily-grind-sandton")?.active).toBe(false);
  });

  it("turns a branch back on when the plan has room", () => {
    turnOffBranch(RESTAURANT, "loc-daily-grind-sandton", "owner");
    expect(turnOnBranch(RESTAURANT, "loc-daily-grind-sandton", "owner").ok).toBe(true);
    expect(branchesFor(RESTAURANT).find((l) => l.id === "loc-daily-grind-sandton")?.active).toBe(true);
  });

  it("refuses to turn a branch on when the plan limit is full", () => {
    turnOffBranch(RESTAURANT, "loc-daily-grind-sandton", "owner");
    setPlan("starter" as Plan);
    createBranch(RESTAURANT, { ...ADDRESS, name: "Fill" }, "owner");
    const result = turnOnBranch(RESTAURANT, "loc-daily-grind-sandton", "owner");
    expect(result.ok).toBe(false);
  });

  it("refuses to make an inactive branch the main one", () => {
    turnOffBranch(RESTAURANT, "loc-daily-grind-sandton", "owner");
    expect(makeMainBranch(RESTAURANT, "loc-daily-grind-sandton", "owner").ok).toBe(false);
  });

  it("refuses an unknown branch when making main, turning off or on", () => {
    expect(makeMainBranch(RESTAURANT, "loc-missing", "owner").ok).toBe(false);
    expect(turnOffBranch(RESTAURANT, "loc-missing", "owner").ok).toBe(false);
    expect(turnOnBranch(RESTAURANT, "loc-missing", "owner").ok).toBe(false);
  });
});

describe("demo branches: staff branch", () => {
  it("sets a team member to one branch, then to all branches", () => {
    const mia = demoRepo.read().staff.find((s) => s.restaurantId === RESTAURANT && s.displayName === "Mia")!;
    expect(setStaffBranch(RESTAURANT, mia.id, "loc-daily-grind-sandton", false, "owner").ok).toBe(true);
    const moved = demoRepo.read().staff.find((s) => s.id === mia.id)!;
    expect(moved.locationId).toBe("loc-daily-grind-sandton");
    expect(moved.allBranches).toBe(false);
    expect(setStaffBranch(RESTAURANT, mia.id, null, true, "owner").ok).toBe(true);
    const all = demoRepo.read().staff.find((s) => s.id === mia.id)!;
    expect(all.allBranches).toBe(true);
    expect(all.locationId).toBeNull();
  });

  it("refuses when no branch and not all branches are chosen", () => {
    const mia = demoRepo.read().staff.find((s) => s.restaurantId === RESTAURANT && s.displayName === "Mia")!;
    expect(setStaffBranch(RESTAURANT, mia.id, null, false, "owner").ok).toBe(false);
  });

  it("refuses a turned off branch", () => {
    const mia = demoRepo.read().staff.find((s) => s.restaurantId === RESTAURANT && s.displayName === "Mia")!;
    turnOffBranch(RESTAURANT, "loc-daily-grind-sandton", "owner");
    expect(setStaffBranch(RESTAURANT, mia.id, "loc-daily-grind-sandton", false, "owner").ok).toBe(false);
  });

  it("refuses a staff member trying to change branches", () => {
    const mia = demoRepo.read().staff.find((s) => s.restaurantId === RESTAURANT && s.displayName === "Mia")!;
    setSession(staff);
    expect(setStaffBranch(RESTAURANT, mia.id, null, true, "staff").ok).toBe(false);
  });
});
