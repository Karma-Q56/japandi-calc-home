import { describe, expect, it } from "vitest";
import { createPayFastProvider } from "@/server/billing/payfast-provider";
import { payfastSignature, parseItnBody, verifyItnSignature } from "@/server/billing/payfast";
import { randsToCentsOrNull, isValidTopupRands } from "./live-billing";

const config = { merchantId: "10000100", merchantKey: "key123", passphrase: "secret pass", mode: "sandbox" as const };

function itnBody(overrides: Record<string, string> = {}, passphrase = config.passphrase) {
  const base: Record<string, string> = {
    merchant_id: config.merchantId,
    m_payment_id: "11111111-1111-4111-8111-111111111111",
    pf_payment_id: "1234567",
    payment_status: "COMPLETE",
    amount_gross: "1500.00",
    ...overrides,
  };
  const fields: Array<[string, string]> = Object.entries(base).map(([k, v]) => [k, v ?? ""]);
  const signature = payfastSignature(fields, passphrase);
  const all: Array<[string, string]> = [...fields, ["signature", signature]];
  return all
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%20/g, "+")}`)
    .join("&");
}

describe("PayFast signature", () => {
  it("accepts a correctly signed ITN", () => {
    const provider = createPayFastProvider(config);
    expect(provider.verifyWebhook(itnBody())).toEqual({ ok: true });
  });

  it("refuses a bad signature", () => {
    const provider = createPayFastProvider(config);
    const body = itnBody({}, "wrong");
    expect(provider.verifyWebhook(body)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a wrong merchant id", () => {
    const provider = createPayFastProvider({ ...config, merchantId: "99999" });
    expect(provider.verifyWebhook(itnBody())).toEqual({ ok: false, reason: "wrong_merchant" });
  });

  it("reads the amount and outcome from a recorded ITN", () => {
    const provider = createPayFastProvider(config);
    expect(provider.parseEvent(itnBody())).toEqual({
      paymentId: "11111111-1111-4111-8111-111111111111",
      providerRef: "1234567",
      amountCents: 150000,
      outcome: "paid",
      token: null,
    });
  });

  it("maps a failed payment to failed", () => {
    const provider = createPayFastProvider(config);
    expect(provider.parseEvent(itnBody({ payment_status: "FAILED" }))?.outcome).toBe("failed");
  });

  it("parses form encoding with plus signs", () => {
    expect(parseItnBody("item_name=Patron+Growth")).toEqual([["item_name", "Patron Growth"]]);
  });

  it("refuses an ITN with no signature", () => {
    expect(verifyItnSignature([["merchant_id", "10000100"]], "")).toBe(false);
  });
});

describe("checkout", () => {
  it("builds the amount from the plan price and signs the fields", () => {
    const provider = createPayFastProvider(config);
    const checkout = provider.createCheckout({
      paymentId: "p1",
      kind: "subscription",
      amountCents: 120000,
      itemName: "Patron Growth plan",
      restaurantId: "r1",
      ownerEmail: "owner@example.com",
      returnUrl: "https://x/app/billing?paid=1",
      cancelUrl: "https://x/app/billing?cancelled=1",
      notifyUrl: "https://x/api/webhooks/payments",
    });
    const amount = checkout.fields.find(([k]) => k === "amount")?.[1];
    expect(amount).toBe("1200.00");
    expect(checkout.url).toBe("https://sandbox.payfast.co.za/eng/process");
    expect(checkout.fields.at(-1)?.[0]).toBe("signature");
  });
});

describe("top up amounts", () => {
  it("turns rands into cents and refuses out of range", () => {
    expect(randsToCentsOrNull(250)).toBe(25000);
    expect(randsToCentsOrNull(50)).toBeNull();
    expect(randsToCentsOrNull(100001)).toBeNull();
    expect(isValidTopupRands(Number.NaN)).toBe(false);
  });
});
