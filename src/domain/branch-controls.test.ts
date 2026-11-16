import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { createPairingCode, redeemPairingCode } from "@/domain/team";
import { branchesFor, setStaffBranch } from "@/domain/locations";

const RESTAURANT = "rest-daily-grind";
const MAIN = "loc-daily-grind-main";
const SANDTON = branchesFor(RESTAURANT).find((l) => !l.isMain)!.id;
const owner = { role: "owner" as const, restaurantId: RESTAURANT };
const staff = { role: "staff" as const, restaurantId: RESTAURANT };
const MIA = "staff-1";

function setSession(session: { role: string; restaurantId: string }) {
  updateDemo((current) => ({ ...current, session: { ...current.session, ...session } as typeof current.session }));
}

beforeEach(() => {
  demoRepo.reset();
  setSession(owner);
});

describe("demo team: branch picker per member", () => {
  it("moves a team member to another branch", () => {
    const result = setStaffBranch(RESTAURANT, MIA, SANDTON, false, "owner-1");
    expect(result.ok).toBe(true);
    const member = demoRepo.read().staff.find((s) => s.id === MIA)!;
    expect(member.locationId).toBe(SANDTON);
    expect(member.allBranches).toBe(false);
  });

  it("lets a member work at all branches", () => {
    const result = setStaffBranch(RESTAURANT, MIA, null, true, "owner-1");
    expect(result.ok).toBe(true);
    const member = demoRepo.read().staff.find((s) => s.id === MIA)!;
    expect(member.allBranches).toBe(true);
    expect(member.locationId).toBeNull();
  });

  it("refuses a branch choice that is missing", () => {
    const result = setStaffBranch(RESTAURANT, MIA, null, false, "owner-1");
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain("Check the branch and try again.");
  });

  it("refuses a branch that does not exist", () => {
    const result = setStaffBranch(RESTAURANT, MIA, "loc-missing", false, "owner-1");
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain("That branch could not be found.");
    expect(demoRepo.read().staff.find((s) => s.id === MIA)?.locationId).not.toBe("loc-missing");
  });

  it("refuses a staff member's branch change from a staff login", () => {
    setSession(staff);
    const before = demoRepo.read().staff.find((s) => s.id === MIA)?.locationId;
    const result = setStaffBranch(RESTAURANT, MIA, SANDTON, false, "staff-1");
    expect(result.ok).toBe(false);
    expect(demoRepo.read().staff.find((s) => s.id === MIA)?.locationId).toBe(before);
  });
});

describe("demo till: pairing to a branch", () => {
  it("stores the chosen branch on the pairing code and the till session", async () => {
    const created = await createPairingCode(RESTAURANT, "owner-1", SANDTON);
    expect(created.ok).toBe(true);
    const code = (created as { data: { code: string } }).data.code;

    const redeemed = await redeemPairingCode(code);
    expect(redeemed.ok).toBe(true);
    expect(demoRepo.read().session.tillPairedLocationId).toBe(SANDTON);
  });

  it("pairs without a branch when none is chosen, so the main branch is used", async () => {
    const created = await createPairingCode(RESTAURANT, "owner-1");
    const code = (created as { data: { code: string } }).data.code;
    await redeemPairingCode(code);
    expect(demoRepo.read().session.tillPairedLocationId ?? null).toBeNull();
  });

  it("does not accept a pairing code twice", async () => {
    const created = await createPairingCode(RESTAURANT, "owner-1", MAIN);
    const code = (created as { data: { code: string } }).data.code;
    expect((await redeemPairingCode(code)).ok).toBe(true);
    expect((await redeemPairingCode(code)).ok).toBe(false);
  });
});
