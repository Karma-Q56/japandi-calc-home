import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "./auth-viewer";
import {
  PAIR_CODE_MINUTES,
  addStaffMember,
  createPairingCode,
  generatePairingCode,
  generatePin,
  isPairingCodeUsable,
  pairTill,
  pairingCodeHash,
  readTillValue,
  redeemRewardAs,
  resetStaffPin,
  signInTill,
  signTillValue,
} from "./live-till";
import { pinHmacHex } from "./repos/pg";

// Mirrors src/server/repos/pin-commit.test.ts: the mock answers queries by
// their SQL text and keeps just enough state to prove the security properties.

type MockStaff = {
  id: string;
  restaurant_id: string;
  display_name: string;
  pin_hmac: string;
  active: boolean;
};

type MockPair = {
  id: string;
  code_hash: string;
  expires_at: string;
  used_at: string | null;
};

type MockReward = {
  id: string;
  membership_id: string;
  restaurant_id: string;
  status: string;
  description: string;
};

const HEX64 = /[a-f0-9]{64}/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

const db = {
  queries: [] as string[],
  audits: [] as string[],
  staff: [] as MockStaff[],
  pairs: [] as MockPair[],
  rewards: [] as MockReward[],
  pinFails: 0,
  pairFails: 0,
  restaurantId: "11111111-1111-4111-8111-111111111111",
  signInStaffId: "",
  signInHmac: "",
};

const cookies: Record<string, string> = {};

vi.mock("@tanstack/react-start/server", () => ({
  getCookies: () => ({ ...cookies }),
  setCookie: (name: string, value: string) => {
    cookies[name] = value;
  },
  deleteCookie: (name: string) => {
    delete cookies[name];
  },
}));

vi.mock("./db", () => ({
  withContext: async (_ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      execute: async (query: unknown) => {
        const text = JSON.stringify(query);
        db.queries.push(text);
        const hex = text.match(HEX64)?.[0] ?? "";

        if (text.includes("insert into audit_event")) {
          db.audits.push(text);
          return { rows: [] };
        }
        if (text.includes("insert into rate_limit_hit")) {
          if (text.includes("'pin'")) db.pinFails++;
          else db.pairFails++;
          return { rows: [] };
        }
        if (text.includes("count(*)::int as n from rate_limit_hit")) {
          return { rows: [{ n: db.pairFails }] };
        }
        if (text.includes("select id, display_name from staff_member")) {
          const row = db.staff.find((member) => text.includes(member.id));
          return { rows: row ? [{ id: row.id, display_name: row.display_name }] : [] };
        }
        if (text.includes("update staff_member set pin_hmac")) {
          return { rows: [] };
        }
        if (text.includes("insert into staff_member")) {
          db.staff.push({
            id: text.match(UUID)?.[0] ?? "staff-new",
            restaurant_id: db.restaurantId,
            display_name: "",
            pin_hmac: hex,
            active: true,
          });
          return { rows: [] };
        }
        if (text.includes("from staff_member s")) {
          return {
            rows: [
              {
                id: db.signInStaffId,
                pin_hmac: db.signInHmac,
                fails: String(db.pinFails),
                last_fail: db.pinFails > 0 ? new Date().toISOString() : null,
              },
            ],
          };
        }
        if (text.includes("select id, pin_hmac from staff_member")) {
          return { rows: db.staff.map((row) => ({ id: row.id, pin_hmac: row.pin_hmac })) };
        }
        if (text.includes("insert into one_time_code")) {
          const row: MockPair = {
            id: text.match(UUID)?.[0] ?? "pair-1",
            code_hash: hex,
            expires_at: new Date(Date.now() + PAIR_CODE_MINUTES * 60_000).toISOString(),
            used_at: null,
          };
          db.pairs.push(row);
          return { rows: [{ id: row.id, expires_at: row.expires_at }] };
        }
        if (text.includes("from one_time_code")) {
          const row = db.pairs.find((pair) => text.includes(pair.code_hash));
          return { rows: row ? [row] : [] };
        }
        if (text.includes("update one_time_code set used_at")) {
          // The update matches on the row id, not on the hash.
          const row = db.pairs.find((pair) => text.includes(pair.id));
          if (!row || row.used_at !== null) return { rows: [] };
          row.used_at = new Date().toISOString();
          return { rows: [{ restaurant_id: db.restaurantId }] };
        }
        if (text.includes("update reward")) {
          const row = db.rewards.find(
            (reward) =>
              text.includes(reward.id) &&
              text.includes(reward.restaurant_id) &&
              text.includes(reward.membership_id),
          );
          if (!row || row.status !== "available") return { rows: [] };
          row.status = "redeemed";
          return { rows: [{ id: row.id, description: row.description }] };
        }
        if (text.includes("select status from reward")) {
          const row = db.rewards.find((reward) => text.includes(reward.id));
          return { rows: row ? [{ status: row.status }] : [] };
        }
        throw new Error(`unexpected query in mock: ${text.slice(0, 160)}`);
      },
    };
    return cb(tx);
  },
}));

const owner: Viewer = {
  userId: "user-owner",
  email: "owner@example.com",
  name: "Owner",
  role: "owner",
  restaurantId: db.restaurantId,
  customerId: null,
  needsPhone: false,
};

const manager: Viewer = { ...owner, userId: "user-manager", role: "manager" };

beforeEach(() => {
  db.queries = [];
  db.audits = [];
  db.staff = [];
  db.pairs = [];
  db.rewards = [];
  db.pinFails = 0;
  db.pairFails = 0;
  db.signInStaffId = "";
  db.signInHmac = "";
  for (const name of Object.keys(cookies)) delete cookies[name];
  process.env["PIN_PEPPER"] = "test-pepper-till";
  // Never dialled: withContext is mocked below.
  process.env["DATABASE_URL"] = "postgres://mock:5432/db";
});

describe("pure helpers", () => {
  it("generates 4 digit PINs", () => {
    for (let index = 0; index < 20; index++) expect(generatePin()).toMatch(/^\d{4}$/);
  });

  it("generates 8 character pairing codes without 0, O, 1 or I", () => {
    for (let index = 0; index < 20; index++) {
      const code = generatePairingCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    }
  });

  it("hashes the pairing code deterministically and never stores it in clear", () => {
    const hash = pairingCodeHash("pepper", "abcd-efgh");
    expect(hash).toBe(pairingCodeHash("pepper", "ABCDEFGH"));
    expect(hash).not.toContain("ABCDEFGH");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("treats used and expired pairing codes as unusable", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    expect(isPairingCodeUsable({ used_at: null, expires_at: "2026-01-01T00:10:00.000Z" }, now)).toBe(
      true,
    );
    expect(
      isPairingCodeUsable({ used_at: "2026-01-01T00:01:00.000Z", expires_at: "2026-01-01T00:10:00.000Z" }, now),
    ).toBe(false);
    expect(isPairingCodeUsable({ used_at: null, expires_at: "2025-12-31T23:59:00.000Z" }, now)).toBe(
      false,
    );
  });

  it("rejects a tampered signed till cookie", () => {
    const signed = signTillValue("pepper", "device", JSON.stringify({ r: "rest-1" }));
    expect(readTillValue("pepper", "device", signed)).toContain("rest-1");
    expect(readTillValue("pepper", "staff", signed)).toBeNull();
    expect(readTillValue("pepper", "device", `${signed}x`)).toBeNull();
    expect(readTillValue("other-pepper", "device", signed)).toBeNull();
  });
});

describe("team", () => {
  it("stores only the HMAC and never the clear PIN", async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const result = await addStaffMember(owner, "  Thandi  ");
    spy.mockRestore();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pin).toMatch(/^\d{4}$/);
    const stored = db.staff[0];
    expect(stored?.pin_hmac).toBe(
      pinHmacHex("test-pepper-till", db.restaurantId, result.staffId, result.pin),
    );
    expect(stored?.pin_hmac).not.toBe(result.pin);
    expect(db.audits.join(" ")).not.toContain(result.pin);
    expect(logged.join(" ")).not.toContain(result.pin);
    expect(db.queries.join(" ")).not.toContain(result.pin);
  });

  it("does not let a manager add staff or reset a PIN", async () => {
    const added = await addStaffMember(manager, "Sam");
    expect(added.ok).toBe(false);
    expect(db.queries).toHaveLength(0);

    const reset = await resetStaffPin(manager, "staff-1");
    expect(reset.ok).toBe(false);
    expect(db.queries).toHaveLength(0);
  });

  it("returns a new PIN on reset without logging it", async () => {
    const staffId = "22222222-2222-4222-8222-222222222222";
    db.staff.push({
      id: staffId,
      restaurant_id: db.restaurantId,
      display_name: "Thandi",
      pin_hmac: pinHmacHex("test-pepper-till", db.restaurantId, staffId, "1234"),
      active: true,
    });
    // resetStaffPin looks the staff row up by name first.
    db.signInStaffId = staffId;

    const result = await resetStaffPin(owner, staffId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.displayName).toBe("Thandi");
    expect(db.audits.join(" ")).not.toContain(result.pin);
  });
});

describe("till pairing", () => {
  it("pairs once, and the same code cannot be used again", async () => {
    const created = await createPairingCode(owner);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await pairTill(created.code, "ip-1");
    expect(first.ok).toBe(true);
    expect(cookies["patron_till_device"]).toBeTruthy();

    const second = await pairTill(created.code, "ip-1");
    expect(second.ok).toBe(false);
  });

  it("refuses an expired code", async () => {
    const created = await createPairingCode(owner);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const row = db.pairs[0];
    if (row) row.expires_at = new Date(Date.now() - 60_000).toISOString();

    const result = await pairTill(created.code, "ip-2");
    expect(result.ok).toBe(false);
    expect(db.pairFails).toBe(1);
  });

  it("rate limits a device after 5 wrong codes", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await pairTill("ZZZZZZZZ", "ip-3");
      expect(result.ok).toBe(false);
    }
    const blocked = await pairTill("ZZZZZZZZ", "ip-3");
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.message).toContain("Too many tries");
  });

  it("only lets the owner create a pairing code", async () => {
    const created = await createPairingCode(manager);
    expect(created.ok).toBe(false);
    expect(db.pairs).toHaveLength(0);
  });
});

describe("staff sign in", () => {
  async function pairDevice() {
    const created = await createPairingCode(owner);
    if (!created.ok) throw new Error("pairing code not created");
    const paired = await pairTill(created.code, "ip-4");
    if (!paired.ok) throw new Error("pair not paired");
  }

  it("locks a staff member after 5 wrong PINs, even for the correct PIN", async () => {
    await pairDevice();
    const staffId = "33333333-3333-4333-8333-333333333333";
    db.signInStaffId = staffId;
    db.signInHmac = pinHmacHex("test-pepper-till", db.restaurantId, staffId, "1234");

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await signInTill(staffId, "0000");
      expect(result.ok).toBe(false);
    }
    const correct = await signInTill(staffId, "1234");
    expect(correct.ok).toBe(false);
    if (correct.ok) return;
    expect(correct.message).toContain("locked");
  });

  it("signs in with the right PIN and refuses an unpaired device", async () => {
    const staffId = "44444444-4444-4444-8444-444444444444";
    db.signInStaffId = staffId;
    db.signInHmac = pinHmacHex("test-pepper-till", db.restaurantId, staffId, "1234");

    const unpaired = await signInTill(staffId, "1234");
    expect(unpaired.ok).toBe(false);

    await pairDevice();
    const result = await signInTill(staffId, "1234");
    expect(result.ok).toBe(true);
    expect(cookies["patron_till_staff"]).toBeTruthy();
  });
});

describe("redeem", () => {
  const membershipId = "55555555-5555-4555-8555-555555555555";

  it("redeems an available reward once, then reports already redeemed", async () => {
    const rewardId = "66666666-6666-4666-8666-666666666666";
    db.rewards.push({
      id: rewardId,
      membership_id: membershipId,
      restaurant_id: db.restaurantId,
      status: "available",
      description: "Free coffee",
    });

    const first = await redeemRewardAs({
      restaurantId: db.restaurantId,
      membershipId,
      rewardId,
      staffId: "staff-1",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.description).toBe("Free coffee");

    const second = await redeemRewardAs({
      restaurantId: db.restaurantId,
      membershipId,
      rewardId,
      staffId: "staff-1",
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.message).toBe("Already redeemed.");
    expect(db.audits).toHaveLength(1);
  });

  it("blocks a reward that belongs to another restaurant", async () => {
    const rewardId = "77777777-7777-4777-8777-777777777777";
    db.rewards.push({
      id: rewardId,
      membership_id: membershipId,
      restaurant_id: "99999999-9999-4999-8999-999999999999",
      status: "available",
      description: "Free coffee",
    });

    const result = await redeemRewardAs({
      restaurantId: db.restaurantId,
      membershipId,
      rewardId,
      staffId: "staff-1",
    });
    expect(result.ok).toBe(false);
    expect(db.rewards[0]?.status).toBe("available");
    expect(db.audits).toHaveLength(0);
  });
});
