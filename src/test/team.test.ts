import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo } from "@/data/repo";
import { clock } from "@/lib/clock";
import { hashPin, verifyPin } from "@/lib/pin";
import { createPairingCode, issuePin, redeemPairingCode, signInWithPin } from "@/domain/team";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

describe("staff PINs", () => {
  it("verifies the seeded demo PIN via HMAC-SHA256", async () => {
    const hash = await hashPin("rest-daily-grind", "staff-1", "1234");
    expect(hash).toBe("d3c06b557b557cceab0d8d1bf86080c2fe52c54fcad30d2c71ecd1185f48c470");
    expect(await verifyPin("rest-daily-grind", "staff-1", "1234", hash)).toBe(true);
    expect(await verifyPin("rest-daily-grind", "staff-1", "0000", hash)).toBe(false);
  });

  it("signs in with the right PIN and rejects the wrong one", async () => {
    const ok = await signInWithPin({ staffId: "staff-1", pin: "1234" });
    expect(ok.ok).toBe(true);
    const bad = await signInWithPin({ staffId: "staff-1", pin: "0000" });
    expect(bad.ok).toBe(false);
  });

  it("locks the staff member after 5 wrong PINs; right PIN still refused", async () => {
    for (let i = 0; i < 5; i++) {
      await signInWithPin({ staffId: "staff-2", pin: "0000" });
    }
    const sixth = await signInWithPin({ staffId: "staff-2", pin: "2345" });
    expect(sixth.ok).toBe(false);
    clock.advance(16 * 60 * 1000);
    const after = await signInWithPin({ staffId: "staff-2", pin: "2345" });
    expect(after.ok).toBe(true);
  });

  it("issues a fresh PIN and the old one stops working", async () => {
    const issued = await issuePin("staff-1", "owner", "rest-daily-grind");
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.data.pin).toMatch(/^\d{4}$/);
    const oldPin = await signInWithPin({ staffId: "staff-1", pin: "1234" });
    expect(oldPin.ok).toBe(false);
    const fresh = await signInWithPin({
      staffId: "staff-1",
      pin: issued.data.pin,
    });
    expect(fresh.ok).toBe(true);
  });
});

describe("till pairing", () => {
  it("creates a single-use code that pairs the device", async () => {
    const created = await createPairingCode("rest-daily-grind", "owner");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.code).toMatch(/^[A-Z2-9]{8}$/);
    const first = await redeemPairingCode(created.data.code);
    expect(first.ok).toBe(true);
    expect(demoRepo.read().session.tillPairedRestaurantId).toBe("rest-daily-grind");
    const second = await redeemPairingCode(created.data.code);
    expect(second.ok).toBe(false);
  });
});
