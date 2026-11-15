import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { outcomeForStatus } from "@/server/push/channel";
import {
  PUSH_PAYLOAD_LIMIT_BYTES,
  PushNotConfiguredError,
  encodePayload,
  readVapid,
} from "@/server/push/web-push";
import { subscriptionProblem } from "@/server/live-push";

const P256DH = "B".repeat(87);
const AUTH = "A".repeat(22);

describe("outcomeForStatus", () => {
  it("treats 2xx as delivered", () => {
    expect(outcomeForStatus(201)).toBe("delivered");
  });
  it("treats 404 and 410 as a gone subscription", () => {
    expect(outcomeForStatus(404)).toBe("gone");
    expect(outcomeForStatus(410)).toBe("gone");
  });
  it("retries on 429 and 5xx", () => {
    expect(outcomeForStatus(429)).toBe("retry");
    expect(outcomeForStatus(503)).toBe("retry");
  });
  it("fails other statuses", () => {
    expect(outcomeForStatus(400)).toBe("failed");
  });
});

describe("readVapid", () => {
  it("refuses clearly when a key is missing", () => {
    expect(() => readVapid({ VAPID_PUBLIC_KEY: "x", VAPID_PRIVATE_KEY: "y" })).toThrow(PushNotConfiguredError);
  });
  it("returns the keys when all three are set", () => {
    expect(
      readVapid({ VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@b.co" }),
    ).toEqual({ publicKey: "pub", privateKey: "priv", subject: "mailto:a@b.co" });
  });
});

describe("payload", () => {
  it("keeps only title, body and url", () => {
    const body = JSON.parse(encodePayload({ title: "T", body: "B", url: "/x", extra: "no" } as never));
    expect(body).toEqual({ title: "T", body: "B", url: "/x" });
  });
  it("sets a limit well under the push service maximum", () => {
    expect(PUSH_PAYLOAD_LIMIT_BYTES).toBe(3000);
  });
});

describe("subscriptionProblem", () => {
  const good = { endpoint: "https://push.example.com/abc", keys: { p256dh: P256DH, auth: AUTH } };
  it("accepts a well formed subscription", () => {
    expect(subscriptionProblem(good)).toBeNull();
  });
  it("refuses a plain http endpoint", () => {
    expect(subscriptionProblem({ ...good, endpoint: "http://push.example.com/abc" })).toBe("bad_endpoint");
  });
  it("refuses an endpoint that is not a URL", () => {
    expect(subscriptionProblem({ ...good, endpoint: "not a url" })).toBe("bad_endpoint");
  });
  it("refuses a p256dh key of the wrong length", () => {
    expect(subscriptionProblem({ ...good, keys: { p256dh: "B".repeat(10), auth: AUTH } })).toBe("bad_keys");
  });
  it("refuses keys that are not base64url", () => {
    expect(subscriptionProblem({ ...good, keys: { p256dh: P256DH, auth: "bad key!" } })).toBe("bad_keys");
  });
});

describe("0028 web push migration (text)", () => {
  const sql = readFileSync("db/migrations/0028_web_push_dev.sql", "utf8").replace(/\r/g, "");
  it("drops the operator readable policy and adds the guest one", () => {
    expect(sql).toMatch(/drop policy if exists push_own on push_subscription/);
    expect(sql).toMatch(/create policy push_guest_own on push_subscription/);
  });
  it("makes push_reach security definer with a locked search path", () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public, pg_temp/);
  });
  it("revokes public access and grants only app_user", () => {
    expect(sql).toMatch(/revoke all on function push_reach\(uuid\) from public/);
    expect(sql).toMatch(/grant execute on function push_reach\(uuid\) to app_user/);
  });
});
