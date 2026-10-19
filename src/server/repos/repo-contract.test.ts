import { describe, expect, it } from "vitest";
import { createDemoRepos } from "./demo";
import { createPgRepos } from "./pg";
import type { PatronRepos } from "./contracts";

function suite(name: string, make: () => PatronRepos) {
  describe(`${name} contract`, () => {
    it("public page returns the three demo venues shape", async () => {
      const repos = make();
      const page = await repos.getPublicPage("daily-grind");
      expect(page).not.toBeNull();
      expect(page!.slug).toBe("daily-grind");
      expect(Array.isArray(page!.menu)).toBe(true);
      expect(Array.isArray(page!.specials)).toBe(true);
      expect(await repos.getPublicPage("no-such-venue")).toBeNull();
    });

    it("lead submit rejects honeypot and requires consent", async () => {
      const repos = make();
      await expect(
        repos.submitLead({
          restaurantName: "R",
          contactName: "C",
          phone: "+27821234567",
          consent: true,
          website: "bot",
        }),
      ).rejects.toThrow();
      await expect(
        repos.submitLead({ restaurantName: "R", contactName: "C", phone: "+27821234567", consent: false }),
      ).rejects.toThrow();
      const ok = await repos.submitLead({
        restaurantName: "Test Cafe",
        contactName: "Owner",
        phone: "+27821234567",
        consent: true,
      });
      expect(ok.id).toBeTruthy();
    });

    it("guest join + card + my cards round-trip", async () => {
      const repos = make();
      const phone = `+2782${String(Math.floor(1000000 + Math.random() * 8999999))}`;
      const joined = await repos.joinGuest({
        slug: "daily-grind",
        name: "Test Guest",
        phone,
        marketingSms: true,
        source: "qr",
        otpVerified: true,
      });
      expect(joined.membershipId).toBeTruthy();
      expect(joined.alreadyMember).toBe(false);
      const again = await repos.joinGuest({
        slug: "daily-grind",
        name: "Test Guest",
        phone,
        marketingSms: true,
        source: "qr",
        otpVerified: true,
      });
      expect(again.alreadyMember).toBe(true);
      const card = await repos.getCard("daily-grind", joined.customerId);
      expect(card).not.toBeNull();
      expect(card!.consents.length).toBeGreaterThanOrEqual(1);
      expect(card!.consents[0]!.wordingText.length).toBeGreaterThan(0);
      const cards = await repos.listCards(joined.customerId);
      expect(cards.some((c) => c.membershipId === joined.membershipId)).toBe(true);
    });

    it("guest join rejects bad phone", async () => {
      const repos = make();
      await expect(
        repos.joinGuest({ slug: "daily-grind", name: "X", phone: "123", marketingSms: false, source: "qr" }),
      ).rejects.toThrow();
    });
  });
}

suite("demo", () => createDemoRepos());

const liveUrl = process.env["DATABASE_URL"];
if (liveUrl) {
  suite("postgres", () =>
    createPgRepos({ databaseUrl: liveUrl, restaurantId: null, customerId: null, isOperator: false }),
  );
} else {
  it.skip("postgres contract (needs DATABASE_URL)", () => {});
}
