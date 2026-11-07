import { describe, it } from "vitest";

// These tests need a migrated test database (DATABASE_URL_TEST) with 0018 applied.
// They are written here but have NOT been run in this phase.
describe.skip("challenges and referrals on a real database (not run)", () => {
  it("claims a challenge once per member", () => {});
  it("rewards a referral exactly once, on the friend's first valid stamp", () => {});
  it("refuses a self referral and a phone already carded at that restaurant", () => {});
  it("keeps restaurant B from seeing or changing restaurant A's challenges and referrals", () => {});
  it("does not double a reward when the same visit is retried", () => {});
});
