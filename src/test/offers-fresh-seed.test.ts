import { describe, expect, it } from "vitest";
import { demoRepo } from "@/data/repo";

describe("fresh demo data", () => {
  it("shows the sample specials and campaigns as offers on the very first visit", () => {
    demoRepo.reset();
    const state = demoRepo.read();
    expect(state.offers.length).toBeGreaterThan(0);
    expect(state.offers.length).toBeGreaterThanOrEqual(state.specials.length);
  });
});
