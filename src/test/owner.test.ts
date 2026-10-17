import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo } from "@/data/repo";
import { clock } from "@/lib/clock";
import { overview } from "@/domain/dash";
import { exportCsv, listCustomers, removeFromList, revealPhone } from "@/domain/customers";

const owner = { role: "owner", restaurantId: "rest-daily-grind" };
const manager = { role: "manager", restaurantId: "rest-daily-grind" };

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

describe("overview", () => {
  it("equals hand-computed seed values", () => {
    const result = overview("rest-daily-grind", owner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const get = (key: string) => result.data.stats.find((s) => s.key === key)!.value;
    const state = demoRepo.read();
    expect(get("members")).toBe(
      state.memberships.filter((m) => m.restaurantId === "rest-daily-grind").length,
    );
    expect(get("push")).toBe(0);
    expect(get("credit")).toBe(4200);
    expect(result.data.weeklyVisits).toHaveLength(8);
    expect(result.data.lastCampaign?.name).toBe("A little Tuesday treat");
  });

  it("lapsed count rises after 30 days and matches the filter", () => {
    const before = overview("rest-daily-grind", owner);
    expect(before.ok && before.data.stats.find((s) => s.key === "lapsed")!.value).toBeGreaterThan(
      0,
    );
    clock.advance(30 * 86400000);
    const after = overview("rest-daily-grind", owner);
    const lapsed = after.ok && after.data.stats.find((s) => s.key === "lapsed")!.value;
    const filtered = listCustomers({
      restaurantId: "rest-daily-grind",
      filter: "lapsed30",
      session: owner,
      now: clock.now(),
    });
    expect(filtered.ok && filtered.data.total).toBe(lapsed);
  });
});

describe("customers", () => {
  it("paginates at 25 and searches by name", () => {
    const all = listCustomers({ restaurantId: "rest-daily-grind", session: owner });
    expect(all.ok && all.data.rows.length).toBeLessThanOrEqual(25);
    const searched = listCustomers({
      restaurantId: "rest-daily-grind",
      search: "Thandi",
      session: owner,
    });
    expect(searched.ok && searched.data.total).toBeGreaterThan(0);
    expect(searched.ok && searched.data.rows.every((r) => r.name.includes("Thandi"))).toBe(true);
  });

  it("phone reveal and CSV export write audit events", () => {
    const state = demoRepo.read();
    const customer = state.customers[0]!;
    const before = state.audit.length;
    expect(
      revealPhone({
        customerId: customer.id,
        restaurantId: "rest-daily-grind",
        actorId: "owner",
        session: owner,
      }).ok,
    ).toBe(true);
    expect(
      exportCsv({
        restaurantId: "rest-daily-grind",
        actorId: "owner",
        session: owner,
      }).ok,
    ).toBe(true);
    const actions = demoRepo
      .read()
      .audit.slice(0, 2)
      .map((a) => a.action);
    expect(actions).toContain("phone_reveal");
    expect(actions).toContain("export");
    expect(demoRepo.read().audit.length).toBe(before + 2);
  });

  it("manager gets a clear not-allowed for export", () => {
    const result = exportCsv({
      restaurantId: "rest-daily-grind",
      actorId: "manager",
      session: manager,
    });
    expect(result.ok).toBe(false);
  });

  it("remove withdraws marketing and keeps counts", () => {
    const state = demoRepo.read();
    const membership = state.memberships.find((m) => m.restaurantId === "rest-daily-grind")!;
    const stampsBefore = membership.stampsTotal;
    const removed = removeFromList({
      membershipId: membership.id,
      actorId: "owner",
      session: owner,
    });
    expect(removed.ok).toBe(true);
    const updated = demoRepo.read().memberships.find((m) => m.id === membership.id)!;
    expect(updated.marketingSms).toBe(false);
    expect(updated.stampsTotal).toBe(stampsBefore);
  });
});
