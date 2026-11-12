import {
  PAYFAST_HOSTS,
  type PayFastConfig,
  parseItnBody,
  payfastSignature,
  verifyItnSignature,
} from "./payfast";
import type { CheckoutRequest, CheckoutResult, ItnEvent, PaymentProvider } from "./provider";

// PayFast implementation of PaymentProvider (phase D21).
// Checks: signature, merchant id, and amount (the amount is compared by the caller
// against the payment row). Server-to-server validation is injected as `validate`.

const toRands = (cents: number) => (cents / 100).toFixed(2);

export function createPayFastProvider(config: PayFastConfig): PaymentProvider {
  return {
    createCheckout(request: CheckoutRequest): CheckoutResult {
      const fields: Array<[string, string]> = [
        ["merchant_id", config.merchantId],
        ["merchant_key", config.merchantKey],
        ["return_url", request.returnUrl],
        ["cancel_url", request.cancelUrl],
        ["notify_url", request.notifyUrl],
        ["email_address", request.ownerEmail],
        ["m_payment_id", request.paymentId],
        ["amount", toRands(request.amountCents)],
        ["item_name", request.itemName],
        ["custom_str1", request.restaurantId],
      ];
      if (request.kind === "subscription") {
        fields.push(["subscription_type", "1"], ["recurring_amount", toRands(request.amountCents)]);
        fields.push(["frequency", "3"], ["cycles", "0"]);
      }
      const signature = payfastSignature(fields, config.passphrase);
      return {
        url: `${PAYFAST_HOSTS[config.mode]}/eng/process`,
        fields: [...fields, ["signature", signature]],
      };
    },

    verifyWebhook(body: string) {
      const pairs = parseItnBody(body);
      if (!verifyItnSignature(pairs, config.passphrase)) {
        return { ok: false as const, reason: "bad_signature" };
      }
      const merchant = pairs.find(([key]) => key === "merchant_id")?.[1];
      if (merchant !== config.merchantId) {
        return { ok: false as const, reason: "wrong_merchant" };
      }
      return { ok: true as const };
    },

    parseEvent(body: string): ItnEvent | null {
      const map = new Map(parseItnBody(body));
      const paymentId = map.get("m_payment_id") ?? "";
      const providerRef = map.get("pf_payment_id") ?? "";
      const gross = Number(map.get("amount_gross"));
      if (!paymentId || !providerRef || !Number.isFinite(gross)) return null;
      const status = map.get("payment_status");
      const outcome =
        status === "COMPLETE" ? "paid" : status === "CANCELLED" ? "cancelled" : "failed";
      return {
        paymentId,
        providerRef,
        amountCents: Math.round(gross * 100),
        outcome,
      };
    },
  };
}

/** Server-to-server check: PayFast must confirm the ITN came from it. */
export async function validateWithPayFast(
  config: PayFastConfig,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetchImpl(`${PAYFAST_HOSTS[config.mode]}/eng/query/validate`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) return false;
  return (await response.text()).trim() === "VALID";
}
