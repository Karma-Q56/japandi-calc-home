import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPayFastProvider, validateWithPayFast } from "@/server/billing/payfast-provider";
import { parseItnBody, payfastSignature, validationBody, verifyItnSignature } from "@/server/billing/payfast";

// Extra PayFast checks (D21 review): characters PayFast encodes, pending notices, bad ids,
// the validation call, and which fields a monthly checkout carries.

const config = { merchantId: "10000100", merchantKey: "key123", passphrase: "secret pass", mode: "sandbox" as const };
const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";

/** A signed ITN body written the way PayFast writes it (PHP urlencode). */
function signedBody(fields: Array<[string, string]>, passphrase = config.passphrase): string {
  const signature = payfastSignature(fields, passphrase);
  return [...fields, ["signature", signature] as [string, string]]
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%20/g, "+")}`)
    .join("&");
}

const baseFields = (overrides: Record<string, string> = {}): Array<[string, string]> =>
  Object.entries({
    merchant_id: config.merchantId,
    m_payment_id: PAYMENT_ID,
    pf_payment_id: "1234567",
    payment_status: "COMPLETE",
    amount_gross: "1200.00",
    ...overrides,
  });

describe("PayFast signature encoding", () => {
  it("writes brackets, apostrophes and exclamation marks the way PHP urlencode does", () => {
    const fields: Array<[string, string]> = [["item_name", "Patron's (Growth) plan!"]];
    const expected = createHash("md5")
      .update("item_name=Patron%27s+%28Growth%29+plan%21&passphrase=secret+pass")
      .digest("hex");
    expect(payfastSignature(fields, "secret pass")).toBe(expected);
  });

  it("writes a tilde and an asterisk as percent codes", () => {
    const expected = createHash("md5").update("item_name=a%7Eb%2A").digest("hex");
    expect(payfastSignature([["item_name", "a~b*"]], "")).toBe(expected);
  });

  it("skips empty values and leaves out the passphrase when none is set", () => {
    const expected = createHash("md5").update("a=1").digest("hex");
    expect(payfastSignature([["a", "1"], ["b", ""]], "")).toBe(expected);
  });

  it("refuses a signature in capitals only when the letters differ, not when only the case differs", () => {
    const fields = baseFields();
    const body = signedBody(fields);
    const pairs = parseItnBody(body);
    expect(verifyItnSignature(pairs, config.passphrase)).toBe(true);
    const upper = pairs.map(([k, v]) => (k === "signature" ? [k, v.toUpperCase()] : [k, v])) as Array<[string, string]>;
    expect(verifyItnSignature(upper, config.passphrase)).toBe(true);
    const wrong = pairs.map(([k, v]) => (k === "signature" ? [k, "0".repeat(32)] : [k, v])) as Array<[string, string]>;
    expect(verifyItnSignature(wrong, config.passphrase)).toBe(false);
  });

  it("refuses a body whose amount was changed after signing", () => {
    const body = signedBody(baseFields()).replace("amount_gross=1200.00", "amount_gross=1.00");
    expect(createPayFastProvider(config).verifyWebhook(body)).toEqual({ ok: false, reason: "bad_signature" });
  });
});

describe("PayFast notices", () => {
  const provider = createPayFastProvider(config);

  it("reads a cancelled payment", () => {
    expect(provider.parseEvent(signedBody(baseFields({ payment_status: "CANCELLED" })))?.outcome).toBe("cancelled");
  });

  it("reads a pending payment as pending, so nothing is settled yet", () => {
    expect(provider.parseEvent(signedBody(baseFields({ payment_status: "PENDING" })))?.outcome).toBe("pending");
  });

  it("refuses a payment id that is not an id", () => {
    expect(provider.parseEvent(signedBody(baseFields({ m_payment_id: "not-an-id" })))).toBeNull();
    expect(provider.parseEvent(signedBody(baseFields({ m_payment_id: "" })))).toBeNull();
  });

  it("refuses a notice with no amount", () => {
    expect(provider.parseEvent(signedBody(baseFields({ amount_gross: "abc" })))).toBeNull();
  });
});

describe("PayFast validation call", () => {
  const body = signedBody(baseFields());

  it("sends the notice without its signature and accepts VALID", async () => {
    let sent = "";
    let url = "";
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      sent = String(init?.body ?? "");
      return new Response("VALID", { status: 200 });
    }) as typeof fetch;
    expect(await validateWithPayFast(config, body, fetchImpl)).toBe(true);
    expect(url).toBe("https://sandbox.payfast.co.za/eng/query/validate");
    expect(sent).not.toMatch(/signature=/);
    expect(sent).toBe(validationBody(parseItnBody(body)));
    expect(sent).toMatch(/^merchant_id=10000100&m_payment_id=/);
  });

  it("refuses INVALID, a server error and a network failure", async () => {
    const invalid = (async () => new Response("INVALID", { status: 200 })) as typeof fetch;
    const broken = (async () => new Response("no", { status: 500 })) as typeof fetch;
    const down = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    expect(await validateWithPayFast(config, body, invalid)).toBe(false);
    expect(await validateWithPayFast(config, body, broken)).toBe(false);
    expect(await validateWithPayFast(config, body, down)).toBe(false);
  });
});

describe("checkout fields", () => {
  const request = {
    paymentId: PAYMENT_ID,
    amountCents: 120000,
    itemName: "Patron Growth plan",
    restaurantId: "22222222-2222-4222-8222-222222222222",
    ownerEmail: "owner@example.com",
    returnUrl: "https://x/app/billing?paid=1",
    cancelUrl: "https://x/app/billing?cancelled=1",
    notifyUrl: "https://x/api/webhooks/payments",
  };
  const provider = createPayFastProvider(config);

  it("a monthly checkout asks PayFast for a monthly subscription that does not end", () => {
    const fields = new Map(provider.createCheckout({ ...request, kind: "subscription" }).fields);
    expect(fields.get("subscription_type")).toBe("1");
    expect(fields.get("recurring_amount")).toBe("1200.00");
    expect(fields.get("frequency")).toBe("3");
    expect(fields.get("cycles")).toBe("0");
  });

  it("a top up checkout is a single payment", () => {
    const fields = new Map(provider.createCheckout({ ...request, kind: "topup", amountCents: 50000 }).fields);
    expect(fields.has("subscription_type")).toBe(false);
    expect(fields.get("amount")).toBe("500.00");
  });

  it("signs the checkout so the signature matches the fields sent", () => {
    const checkout = provider.createCheckout({ ...request, kind: "subscription" });
    const withoutSignature = checkout.fields.filter(([k]) => k !== "signature");
    const signature = checkout.fields.find(([k]) => k === "signature")?.[1];
    expect(signature).toBe(payfastSignature(withoutSignature, config.passphrase));
  });
});
