import { createHash, timingSafeEqual } from "node:crypto";

// PayFast hosted checkout (phase D21). Pure helpers: no network, no database.
// The signature is an MD5 of the parameters, in the order PayFast sends them,
// with the passphrase appended when one is set.

export type PayFastMode = "sandbox" | "live";

export type PayFastConfig = {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  mode: PayFastMode;
};

export const PAYFAST_HOSTS: Record<PayFastMode, string> = {
  sandbox: "https://sandbox.payfast.co.za",
  live: "https://www.payfast.co.za",
};

// PayFast signs values the way PHP urlencode does: spaces become "+", and every character except
// letters, digits and "-_." is written as %XX in capitals. encodeURIComponent leaves "!'()*~"
// alone, so those are written out here (a dish or plan name with a bracket or apostrophe would
// otherwise fail the signature check).
const encode = (value: string) =>
  encodeURIComponent(value)
    .replace(/[!'()*~]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");

/** The form-encoded body PayFast expects back on its validation call: the ITN fields without the signature. */
export function validationBody(pairs: Array<[string, string]>): string {
  return pairs
    .filter(([key]) => key !== "signature")
    .map(([key, value]) => `${key}=${encode(value)}`)
    .join("&");
}

/** Builds the signature string from the fields in the order given (empty values skipped). */
export function payfastSignature(
  fields: Array<[string, string]>,
  passphrase: string,
): string {
  const parts = fields
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${encode(value)}`);
  if (passphrase) parts.push(`passphrase=${encode(passphrase)}`);
  return createHash("md5").update(parts.join("&")).digest("hex");
}

/** Reads the PayFast settings from the environment. Returns null when not switched on. */
export function readPayFastConfig(env: NodeJS.ProcessEnv = process.env): PayFastConfig | null {
  const merchantId = env["PAYFAST_MERCHANT_ID"] ?? "";
  const merchantKey = env["PAYFAST_MERCHANT_KEY"] ?? "";
  if (!merchantId || !merchantKey) return null;
  const mode: PayFastMode = env["PAYFAST_MODE"] === "live" ? "live" : "sandbox";
  return { merchantId, merchantKey, passphrase: env["PAYFAST_PASSPHRASE"] ?? "", mode };
}

/** Parses a form-encoded ITN body into a plain object (keys in arrival order). */
export function parseItnBody(body: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const piece of body.split("&")) {
    if (!piece) continue;
    const index = piece.indexOf("=");
    const rawKey = index === -1 ? piece : piece.slice(0, index);
    const rawValue = index === -1 ? "" : piece.slice(index + 1);
    pairs.push([
      decodeURIComponent(rawKey.replace(/\+/g, " ")),
      decodeURIComponent(rawValue.replace(/\+/g, " ")),
    ]);
  }
  return pairs;
}

/** Checks the signature on an ITN. The signature field itself is excluded and must be last. */
export function verifyItnSignature(pairs: Array<[string, string]>, passphrase: string): boolean {
  const signedPairs = pairs.filter(([key]) => key !== "signature");
  const given = pairs.find(([key]) => key === "signature")?.[1] ?? "";
  if (!given) return false;
  const expected = Buffer.from(payfastSignature(signedPairs, passphrase));
  const received = Buffer.from(given.toLowerCase());
  return expected.length === received.length && timingSafeEqual(expected, received);
}
