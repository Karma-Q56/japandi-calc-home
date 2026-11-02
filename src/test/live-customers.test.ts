import { describe, expect, it } from "vitest";
import { filterLiveCustomers, maskLivePhone, type LiveCustomerRow } from "@/lib/live-customers";

const NOW = new Date("2026-11-02T10:00:00+02:00").getTime();

const rows: LiveCustomerRow[] = [
  {
    membershipId: "m1",
    customerId: "c1",
    name: "Thandi Mokoena",
    phoneE164: "+27821234567",
    stampsCurrent: 7,
    stampsTotal: 12,
    stampsRequired: 8,
    rewardsWaiting: 0,
    lastVisitAt: "2026-11-01T10:00:00+02:00",
    joinedAt: "2026-10-20T10:00:00+02:00",
    smsOptedIn: true,
    birthdayMonth: 10,
  },
  {
    membershipId: "m2",
    customerId: "c2",
    name: "Sipho Dlamini",
    phoneE164: "+27835551234",
    stampsCurrent: 2,
    stampsTotal: 2,
    stampsRequired: 8,
    rewardsWaiting: 1,
    lastVisitAt: "2026-09-01T10:00:00+02:00",
    joinedAt: "2026-08-01T10:00:00+02:00",
    smsOptedIn: false,
    birthdayMonth: 2,
  },
];

const base = { search: "", filter: "all" as const, sort: "recent" as const };

describe("live guest list", () => {
  it("finds a guest by name or phone digits", () => {
    expect(filterLiveCustomers(rows, { ...base, search: "thandi" }, NOW)).toHaveLength(1);
    expect(filterLiveCustomers(rows, { ...base, search: "555" }, NOW)[0]?.name).toBe(
      "Sipho Dlamini",
    );
  });

  it("applies the reward and lapsed filters", () => {
    expect(
      filterLiveCustomers(rows, { ...base, filter: "reward_ready" }, NOW).map((row) => row.name),
    ).toEqual(["Sipho Dlamini"]);
    expect(
      filterLiveCustomers(rows, { ...base, filter: "lapsed30" }, NOW).map((row) => row.name),
    ).toEqual(["Sipho Dlamini"]);
    expect(filterLiveCustomers(rows, { ...base, filter: "recent30" }, NOW)).toHaveLength(1);
  });

  it("sorts by stamps and by last visit", () => {
    expect(
      filterLiveCustomers(rows, { ...base, sort: "stamps" }, NOW).map((row) => row.name),
    ).toEqual(["Thandi Mokoena", "Sipho Dlamini"]);
    expect(filterLiveCustomers(rows, { ...base, sort: "recent" }, NOW)[0]?.name).toBe(
      "Thandi Mokoena",
    );
  });

  it("masks all but the last four digits", () => {
    expect(maskLivePhone("+27821234567")).toBe("•••• 4567");
  });
});
