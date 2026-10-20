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
  it("equals hand-computed seed values and keeps at most five stats", () => {
    const result = overview("rest-daily-grind", owner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stats).toHaveLength(5);
    expect(result.data.stats.map((s) => s.key)).toEqual([
      "today",
      "returning",
      "ready",
      "credit",
      "campaign",
    ]);
    const get = (key: string) => result.data.stats.find((s) => s.key === key)!.value;
    const state = demoRepo.read();
    const valid = state.stamps.filter(
      (s) => s.restaurantId === "rest-daily-grind" && s.status === "valid",
    );
    const dayStart = Math.floor((state.now + 2 * 3600000) / 86400000) * 86400000 - 2 * 3600000;
    expect(get("today")).toBe(
      valid.filter((stamp) => new Date(stamp.createdAt).getTime() >= dayStart).length,
    );
    const visits = new Map<string, number>();
    for (const stamp of valid) visits.set(stamp.membershipId, (visits.get(stamp.membershipId) ?? 0) + 1);
    expect(get("returning")).toBe(
      state.memberships.filter(
        (m) => m.restaurantId === "rest-daily-grind" && (visits.get(m.id) ?? 0) >= 2,
      ).length,
    );
    expect(get("ready")).toBe(
      state.rewards.filter((r) => r.restaurantId === "rest-daily-grind" && !r.redeemedAt).length,
    );
    expect(get("credit")).toBe(4200);
    expect(result.data.stats.find((s) => s.key === "campaign")!.display).toBe(
      "Weekend family lunch",
    );
    expect(result.data.weeklyVisits).toHaveLength(8);
    expect(result.data.lastCampaign?.name).toBe("A little Tuesday treat");
  });

  it("lapsed count rises after 30 days and matches the filter", () => {
    const countLapsed = () => {
      const filtered = listCustomers({
        restaurantId: "rest-daily-grind",
        filter: "lapsed30",
        session: owner,
        now: clock.now(),
      });
      return filtered.ok ? filtered.data.total : 0;
    };
    const state = demoRepo.read();
    const lapsed = state.memberships.filter(
      (m) =>
        m.restaurantId === "rest-daily-grind" &&
        m.lastVisitAt !== null &&
        state.now - new Date(m.lastVisitAt).getTime() >= 30 * 86400000,
    ).length;
    expect(lapsed).toBeGreaterThan(0);
    expect(countLapsed()).toBeGreaterThanOrEqual(lapsed);
    clock.advance(30 * 86400000);
    expect(countLapsed()).toBeGreaterThan(lapsed);
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
