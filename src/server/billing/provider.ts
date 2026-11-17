// The payment provider interface (phase D21). PayFast is the first implementation.
// The server builds every checkout from plan data and the restaurant row. The browser
// never supplies an amount or a plan.

export type CheckoutRequest = {
  paymentId: string;
  kind: "subscription" | "topup";
  amountCents: number;
  itemName: string;
  restaurantId: string;
  ownerEmail: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
};

export type CheckoutResult = { url: string; fields: Array<[string, string]> };

export type ItnEvent = {
  /** Null when m_payment_id is missing or not a payment id. The webhook then looks up by token. */
  paymentId: string | null;
  amountCents: number;
  providerRef: string;
  /** PayFast subscription token (the `token` field). Empty for a one-off payment. */
  token: string | null;
  /** "pending" means PayFast has not decided yet. The webhook changes nothing for it. */
  outcome: "paid" | "failed" | "cancelled" | "pending";
};

export interface PaymentProvider {
  createCheckout(request: CheckoutRequest): CheckoutResult;
  verifyWebhook(body: string): { ok: true } | { ok: false; reason: string };
  parseEvent(body: string): ItnEvent | null;
}
