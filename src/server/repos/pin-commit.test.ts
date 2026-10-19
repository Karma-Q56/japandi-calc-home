import { beforeEach, describe, expect, it, vi } from "vitest";

// Proves the wrong-PIN failure insert is COMMITTED even though the call
// rejects: the mock rolls back inserts when a transaction callback throws,
// exactly like a real rolled-back transaction.
const mockDb = {
  calls: 0,
  committedInserts: [] as string[],
  storedHmac: "",
  fails: "0",
  lastFail: null as string | null,
};

vi.mock("@/server/db", () => ({
  withContext: async (_ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => {
    mockDb.calls++;
    const base = mockDb.committedInserts.length;
    const tx = {
      execute: async (query: unknown) => {
        const text = JSON.stringify(query);
        if (text.includes("from staff_member")) {
          return {
            rows: [
              { id: "staff-1", pin_hmac: mockDb.storedHmac, fails: mockDb.fails, last_fail: mockDb.lastFail },
            ],
          };
        }
        if (text.includes("insert into rate_limit_hit")) {
          mockDb.committedInserts.push(text);
          return { rows: [] };
        }
        throw new Error(`unexpected query in mock: ${text.slice(0, 160)}`);
      },
    };
    try {
      return await cb(tx);
    } catch (error) {
      // Roll back this transaction's inserts.
      mockDb.committedInserts.length = base;
      throw error;
    }
  },
}));

describe("wrong-PIN failure insert commits", () => {
  beforeEach(() => {
    mockDb.calls = 0;
    mockDb.committedInserts = [];
    mockDb.fails = "0";
    mockDb.lastFail = null;
    process.env["PIN_PEPPER"] = "test-pepper-commit";
  });

  it("wrong PIN rejects but the failure insert survives, and record_stamp never runs", async () => {
    const { createPgRepos, pinHmacHex } = await import("./pg");
    mockDb.storedHmac = pinHmacHex("test-pepper-commit", "rest-1", "staff-1", "1234");
    const repos = createPgRepos({ databaseUrl: "postgres://mock:5432/db" });

    await expect(
      repos.recordStamp({
        restaurantId: "rest-1",
        membershipId: "mem-1",
        staffId: "staff-1",
        key: "k-wrong",
        pin: "0000",
      }),
    ).rejects.toThrow("Wrong PIN.");

    // The failure insert committed (not rolled back with the throw) ...
    expect(mockDb.committedInserts.length).toBe(1);
    expect(mockDb.committedInserts[0]).toContain("rate_limit_hit");
    // ... and the stamp transaction never ran (only the PIN transaction).
    expect(mockDb.calls).toBe(1);
  });

  it("locked staff rejects even the correct PIN without recording another failure", async () => {
    const { createPgRepos, pinHmacHex, PIN_MAX_FAILS } = await import("./pg");
    mockDb.storedHmac = pinHmacHex("test-pepper-commit", "rest-1", "staff-1", "1234");
    mockDb.fails = String(PIN_MAX_FAILS);
    mockDb.lastFail = new Date().toISOString();
    const repos = createPgRepos({ databaseUrl: "postgres://mock:5432/db" });

    await expect(
      repos.recordStamp({
        restaurantId: "rest-1",
        membershipId: "mem-1",
        staffId: "staff-1",
        key: "k-locked",
        pin: "1234",
      }),
    ).rejects.toThrow("Wrong PIN.");

    // Locked attempts are not recorded, so the lockout can expire.
    expect(mockDb.committedInserts.length).toBe(0);
    expect(mockDb.calls).toBe(1);
  });
});
