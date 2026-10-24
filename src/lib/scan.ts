// Signed, short-lived membership tokens for the QR on a guest card.
//
// A token is `SCAN.<memberCode>.<expSeconds>.<signature>`. The signature is a
// truncated HMAC-SHA256 so the QR stays inside a small, readable QR version.
// Tokens live 60 seconds and the card refreshes them before they expire. In
// live mode the server verifies with SCAN_TOKEN_SECRET; the demo uses a fixed
// demo secret because there is no server session yet.

export const SCAN_TOKEN_TTL_SECONDS = 60;
const DEMO_SECRET = "patron-demo-scan-secret-v1";
const PREFIX = "SCAN";

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function keyFor(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function payloadFor(memberCode: string, expiresAtSeconds: number): string {
  return `${PREFIX}.${memberCode}.${expiresAtSeconds}`;
}

export function isScanTokenShape(value: string): boolean {
  return /^SCAN\.[A-Z0-9]{4,20}\.\d{9,12}\.[A-Za-z0-9_-]{16,}$/.test(value.trim());
}

export async function createScanToken(
  memberCode: string,
  options: { now?: number; secret?: string; ttlSeconds?: number } = {},
): Promise<string> {
  const now = options.now ?? Date.now();
  const ttl = options.ttlSeconds ?? SCAN_TOKEN_TTL_SECONDS;
  const expires = Math.floor(now / 1000) + ttl;
  const payload = payloadFor(memberCode, expires);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await keyFor(options.secret ?? DEMO_SECRET),
    encoder.encode(payload),
  );
  // 16 bytes = 128 bits; plenty for a 60-second card token and short enough
  // to keep the QR at version 4 or below.
  return `${payload}.${base64Url(new Uint8Array(signature).slice(0, 16))}`;
}

export type ScanTokenCheck =
  | { ok: true; memberCode: string; expiresAt: number }
  | { ok: false; reason: "malformed" | "expired" | "bad-signature" };

export async function verifyScanToken(
  token: string,
  options: { now?: number; secret?: string } = {},
): Promise<ScanTokenCheck> {
  const value = token.trim();
  if (!isScanTokenShape(value)) return { ok: false, reason: "malformed" };
  const parts = value.split(".");
  const prefix = parts[0];
  const memberCode = parts[1];
  const expires = Number(parts[2]);
  const signature = parts[3];
  if (prefix !== PREFIX || !memberCode || !signature || !Number.isFinite(expires)) {
    return { ok: false, reason: "malformed" };
  }
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (expires < nowSeconds) return { ok: false, reason: "expired" };
  if (expires > nowSeconds + 600) return { ok: false, reason: "bad-signature" };
  try {
    const expected = await crypto.subtle.sign(
      "HMAC",
      await keyFor(options.secret ?? DEMO_SECRET),
      encoder.encode(payloadFor(memberCode, expires)),
    );
    const expectedBytes = new Uint8Array(expected).slice(0, 16);
    const given = fromBase64Url(signature);
    if (given.length !== expectedBytes.length) return { ok: false, reason: "bad-signature" };
    let diff = 0;
    for (let index = 0; index < expectedBytes.length; index++) {
      diff |= expectedBytes[index]! ^ given[index]!;
    }
    return diff === 0
      ? { ok: true, memberCode, expiresAt: expires }
      : { ok: false, reason: "bad-signature" };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/** Verify then map a token to the member code the till would type. */
export async function memberCodeFromScan(
  token: string,
  options: { now?: number; secret?: string } = {},
): Promise<string | null> {
  const check = await verifyScanToken(token, options);
  return check.ok ? check.memberCode : null;
}
