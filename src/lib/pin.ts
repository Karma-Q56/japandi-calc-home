export const DEMO_PEPPER = "patron-demo-pepper-v1";

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256(demoPepper, restaurantId:staffId:pin), never store the PIN. */
export async function hashPin(restaurantId: string, staffId: string, pin: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(DEMO_PEPPER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${restaurantId}:${staffId}:${pin}`),
  );
  return toHex(sig);
}

export async function verifyPin(
  restaurantId: string,
  staffId: string,
  pin: string,
  pinHash: string | null,
): Promise<boolean> {
  if (!pinHash) return false;
  const computed = await hashPin(restaurantId, staffId, pin);
  if (computed.length !== pinHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ pinHash.charCodeAt(i);
  }
  return diff === 0;
}

export function randomPin(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => String(b % 10)).join("");
}

const PAIR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomPairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => PAIR_ALPHABET[b % PAIR_ALPHABET.length]).join("");
}

export async function hashPairingCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`pair:${code}`));
  return toHex(digest);
}
