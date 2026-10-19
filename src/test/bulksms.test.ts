import { describe, expect, it, vi } from "vitest";
import { BulkSmsProvider, mapBulkSmsStatus, safeEqual } from "@/server/sms/BulkSmsProvider";

function provider(fetchImpl: typeof fetch) {
  return new BulkSmsProvider({
    tokenId: "id",
    tokenSecret: "secret",
    webhookSecret: "hook-secret",
    defaultFrom: "Patron",
    randPerCredit: 0.2,
    fetchImpl,
  });
}

describe("BulkSmsProvider", () => {
  it("sends with basic auth, sender and our reference, and returns the provider id", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify([{ id: "abc123", numberOfParts: 2, creditCost: 2 }]), {
        status: 201,
      }),
    );
    const result = await provider(fetchMock as unknown as typeof fetch).send({
      to: "+27 82 123 4567",
      body: "Hi",
      reference: "msg-1",
    });
    expect(result).toEqual({ providerMessageId: "abc123", segments: 2, costCents: 40 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.bulksms.com/v1/messages");
    expect((init!.headers as Record<string, string>)["Authorization"]).toBe(`Basic ${btoa("id:secret")}`);
    const sent = JSON.parse(String(init!.body));
    expect(sent).toMatchObject({ to: "+27821234567", from: "Patron", userSuppliedId: "msg-1" });
  });

  it("does not leak the response body when sending fails", async () => {
    const failing = provider((async () => new Response("secret body", { status: 401 })) as typeof fetch);
    await expect(failing.send({ to: "+27821234567", body: "x", reference: "r" })).rejects.toThrow(
      "HTTP 401",
    );
  });

  it("verifies the webhook secret in the URL", async () => {
    const p = provider(fetch);
    expect(await p.verifyWebhook(new Request("https://x.test/hook?secret=hook-secret"))).toBe(true);
    expect(await p.verifyWebhook(new Request("https://x.test/hook?secret=nope"))).toBe(false);
    expect(await p.verifyWebhook(new Request("https://x.test/hook"))).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });

  it("maps status reports and ignores non-terminal ones", async () => {
    const body = JSON.stringify([
      { id: "1", status: { id: "DELIVERED.null", type: "DELIVERED", subtype: null } },
      { id: "2", status: { id: "FAILED.9", type: "FAILED", subtype: "9" } },
      { id: "3", status: { id: "ACCEPTED.null", type: "ACCEPTED" } },
    ]);
    const events = await provider(fetch).parseDeliveryWebhook(new Request("https://x.test", { method: "POST", body }));
    expect(events.map((e) => [e.providerMessageId, e.status])).toEqual([
      ["1", "delivered"],
      ["2", "failed"],
    ]);
    expect(events[1]!.errorCode).toBe("FAILED.9");
    expect(mapBulkSmsStatus("SCHEDULED")).toBeNull();
  });

  it("accepts the empty-array registration ping and parses inbound STOP", async () => {
    const p = provider(fetch);
    expect(await p.parseInboundWebhook(new Request("https://x.test", { method: "POST", body: "[]" }))).toEqual([]);
    const inbound = JSON.stringify([
      { id: "9", type: "RECEIVED", from: "27821234567", body: "STOP", submission: { date: "2026-10-19T08:00:00Z" } },
      { id: "10", type: "SENT", from: "x", body: "ignored" },
    ]);
    const events = await p.parseInboundWebhook(new Request("https://x.test", { method: "POST", body: inbound }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ from: "+27821234567", body: "STOP" });
  });
});
