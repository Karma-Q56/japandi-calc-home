import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import { clock } from "@/lib/clock";
import { overview } from "@/domain/dash";
import { exportCsv, listCustomers, matchingCustomerMembershipIds, removeFromList, revealPhone } from "@/domain/customers";

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
    // A campaign name is never rendered as a stat value; the stat counts sends.
    expect(result.data.stats.find((s) => s.key === "campaign")!.display).toBeUndefined();
    expect(get("campaign")).toBe(1);
    expect(result.data.weeklyVisits).toHaveLength(8);
    expect(result.data.nextCampaign?.name).toBe("Weekend family lunch");
    expect(result.data.lastCampaign?.name).toBe("A little Tuesday treat");
  });

  it("reports the next campaign and the last sent campaign separately", () => {
    const result = overview("rest-daily-grind", owner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nextCampaign).toEqual({
      id: "campaign-draft-weekend",
      name: "Weekend family lunch",
      status: "draft",
      statusLabel: "Draft",
      when: null,
      href: "/app/campaigns/campaign-draft-weekend",
    });
    expect(result.data.lastCampaign?.name).toBe("A little Tuesday treat");
    expect(result.data.lastCampaign?.delivered).toBe(11);
    expect(result.data.lastCampaign?.failed).toBe(1);
    expect(result.data.lastCampaign?.sentLabel).toBeTruthy();

    // With no draft or scheduled campaign left, nothing is planned.
    updateDemo((current) => ({
      ...current,
      campaigns: current.campaigns.filter(
        (campaign) => campaign.restaurantId !== "rest-daily-grind" || campaign.sentAt,
      ),
    }));
    const sentOnly = overview("rest-daily-grind", owner);
    expect(sentOnly.ok).toBe(true);
    if (!sentOnly.ok) return;
    expect(sentOnly.data.nextCampaign).toBeNull();
    expect(sentOnly.data.lastCampaign?.id).toBe("campaign-1");
  });

  it("picks the earliest scheduled campaign over a later one", () => {
    const now = demoRepo.read().now;
    const base = {
      restaurantId: "rest-daily-grind",
      body: "Bring a friend.",
      channel: "sms" as const,
      audience: { type: "everyone" as const },
      code: "NEXT",
      requiresApproval: false,
      sentAt: null,
      recipients: 0,
      delivered: 0,
      failed: 0,
      createdBy: "owner-test",
      createdAt: new Date(now).toISOString(),
      actualCostCents: 0,
    };
    const scheduled = (id: string, name: string, daysAhead: number) => ({
      ...base,
      id,
      name,
      status: "scheduled" as const,
      scheduledAt: new Date(now + daysAhead * 86400000).toISOString(),
    });
    updateDemo((current) => ({
      ...current,
      campaigns: [
        ...current.campaigns.filter(
          (campaign) => campaign.restaurantId !== "rest-daily-grind" || campaign.sentAt,
        ),
        scheduled("campaign-later", "Later send", 6),
        scheduled("campaign-sooner", "Sooner send", 2),
      ],
    }));
    const result = overview("rest-daily-grind", owner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nextCampaign?.id).toBe("campaign-sooner");
    expect(result.data.nextCampaign?.statusLabel).toBe("Scheduled");
    expect(result.data.nextCampaign?.when).toBeTruthy();
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

  it("selects every matching guest across pages and preserves search/filter behavior", () => {
    const matches = matchingCustomerMembershipIds({
      restaurantId: "rest-daily-grind",
      search: "Thandi",
      session: owner,
    });
    expect(matches.ok).toBe(true);
    if (!matches.ok) return;
    expect(matches.data.length).toBeGreaterThan(1);
    expect(new Set(matches.data).size).toBe(matches.data.length);

    const smsMatches = matchingCustomerMembershipIds({
      restaurantId: "rest-daily-grind",
      filter: "sms",
      session: owner,
    });
    expect(smsMatches.ok).toBe(true);
    if (!smsMatches.ok) return;
    expect(smsMatches.data.length).toBe(
      demoRepo.read().memberships.filter((item) => item.restaurantId === "rest-daily-grind" && item.marketingSms).length,
    );
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
