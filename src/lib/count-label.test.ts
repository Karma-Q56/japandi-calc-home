import { describe, expect, it } from "vitest";
import { countLabel } from "./count-label";

describe("countLabel", () => {
  it("uses the singular only for one", () => {
    expect(countLabel(1, "stamp")).toBe("1 stamp");
    expect(countLabel(2, "stamp")).toBe("2 stamps");
    expect(countLabel(1, "guest")).toBe("1 guest");
    expect(countLabel(1, "reward")).toBe("1 reward");
  });
});
