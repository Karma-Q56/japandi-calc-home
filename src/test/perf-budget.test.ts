import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const GUEST_BUDGET_BYTES = 150 * 1024;

function guestBundles(): string[] {
  const dir = join(process.cwd(), "dist", "client", "assets");
  try {
    return readdirSync(dir)
      .filter(
        (file) =>
          file.endsWith(".js") &&
          (file.includes("card") || file.includes("join") || file.includes("guest")),
      )
      .map((file) => join(dir, file));
  } catch {
    return [];
  }
}

describe("guest performance budget", () => {
  it("keeps guest JS under 150 KB per bundle (skips when not built)", () => {
    const bundles = guestBundles();
    if (bundles.length === 0) return;
    for (const bundle of bundles) {
      expect(statSync(bundle).size, `${bundle} exceeds the guest JS budget`).toBeLessThanOrEqual(
        GUEST_BUDGET_BYTES,
      );
    }
  });
});
