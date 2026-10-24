import { clock } from "@/lib/clock";
import { demoRepo, updateDemo } from "@/data/repo";
import { hashPairingCode, hashPin, randomPairingCode, randomPin, verifyPin } from "@/lib/pin";
import { failure, success } from "./demo";
import { logAudit, requireScope } from "./audit";

export const PIN_LOCKOUT_THRESHOLD = 5;
export const PIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
export const PIN_LOCKOUT_MS = 15 * 60 * 1000;
export const STAFF_SESSION_MS = 12 * 60 * 60 * 1000;
export const PAIRING_CODE_MS = 10 * 60 * 1000;

export function addStaff(restaurantId: string, displayName: string) {
  const name = displayName.trim();
  if (name.length < 1 || name.length > 40) {
    return failure("INVALID", "Enter a name between 1 and 40 characters.");
  }
  const staffId = `staff-${crypto.randomUUID()}`;
  updateDemo((current) => ({
    ...current,
    staff: [
      ...current.staff,
      { id: staffId, restaurantId, displayName: name, active: true, pinHash: null },
    ],
  }));
  return success({ staffId });
}

export function setStaffActive(staffId: string, active: boolean) {
  updateDemo((current) => ({
    ...current,
    staff: current.staff.map((s) => (s.id === staffId ? { ...s, active } : s)),
  }));
  return success(true);
}

/** Issues a new 4-digit PIN (shown once) and stores only its HMAC. */
export async function issuePin(staffId: string, actorId: string, restaurantId: string) {
  const state = demoRepo.read();
  const staff = state.staff.find((s) => s.id === staffId);
  if (!staff || staff.restaurantId !== restaurantId) {
    return failure("NOT_FOUND", "Staff member not found.");
  }
  const pin = randomPin();
  const pinHash = await hashPin(staff.restaurantId, staff.id, pin);
  updateDemo((current) => ({
    ...current,
    staff: current.staff.map((s) => (s.id === staffId ? { ...s, pinHash } : s)),
  }));
  logAudit({ actor: actorId, action: "pin_reset", restaurantId, object: staffId });
  return success({ pin });
}

function lockoutUntil(staffId: string, now: number): number | null {
  const state = demoRepo.read();
  const lockout = state.pinLockouts.find((l) => l.staffId === staffId);
  if (lockout && lockout.until > now) return lockout.until;
  return null;
}

/** PIN sign-in. Wrong guesses never reveal how close they were. */
export async function signInWithPin(input: { staffId: string; pin: string }) {
  const state = demoRepo.read();
  const staff = state.staff.find((s) => s.id === input.staffId);
  if (!staff || !staff.active) {
    return failure("NOT_FOUND", "Pick your name and try again.");
  }
  const now = clock.now();
  const locked = lockoutUntil(staff.id, now);
  if (locked) {
    return failure("INVALID", "That sign-in is locked. Try again later.");
  }
  const ok = await verifyPin(staff.restaurantId, staff.id, input.pin, staff.pinHash);
  const attempt = { staffId: staff.id, ok, createdAt: now };
  const recentFails = [...state.pinAttempts, attempt].filter(
    (a) => a.createdAt > now - PIN_ATTEMPT_WINDOW_MS && !a.ok,
  ).length;
  if (!ok) {
    const lockout = recentFails >= PIN_LOCKOUT_THRESHOLD ? now + PIN_LOCKOUT_MS : null;
    updateDemo((current) => ({
      ...current,
      pinAttempts: [...current.pinAttempts, attempt],
      pinLockouts: lockout
        ? [
            ...current.pinLockouts.filter((l) => l.staffId !== staff.id),
            { staffId: staff.id, until: lockout },
          ]
        : current.pinLockouts,
    }));
    logAudit({
      actor: staff.id,
      action: lockout ? "lockout" : "pin_failure",
      restaurantId: staff.restaurantId,
      object: staff.id,
    });
    return failure("INVALID", "That PIN did not match. Try again.");
  }
  updateDemo((current) => ({
    ...current,
    pinAttempts: [...current.pinAttempts, attempt],
    session: {
      role: "staff",
      restaurantId: staff.restaurantId,
      staffId: staff.id,
      ...(current.session.tillPairedRestaurantId
        ? { tillPairedRestaurantId: current.session.tillPairedRestaurantId }
        : {}),
      staffExpiresAt: now + STAFF_SESSION_MS,
    },
  }));
  logAudit({
    actor: staff.id,
    action: "sign_in",
    restaurantId: staff.restaurantId,
    object: staff.id,
  });
  return success({ staffId: staff.id, restaurantId: staff.restaurantId });
}

export function staffSessionValid(now = clock.now()): boolean {
  const session = demoRepo.read().session;
  if (session.role !== "staff" || !session.staffId) return false;
  if (session.staffExpiresAt !== undefined && now > session.staffExpiresAt) {
    return false;
  }
  return true;
}

/** Owner creates an 8-char pairing code, valid 10 minutes, single use. */
export async function createPairingCode(restaurantId: string, actorId: string) {
  const code = randomPairingCode();
  const codeHash = await hashPairingCode(code);
  const now = clock.now();
  const id = `pairing-${crypto.randomUUID()}`;
  updateDemo((current) => ({
    ...current,
    pairingCodes: [
      ...current.pairingCodes,
      { id, restaurantId, codeHash, expiresAt: now + PAIRING_CODE_MS },
    ],
  }));
  logAudit({ actor: actorId, action: "pairing", restaurantId, object: id });
  return success({ code, expiresAt: now + PAIRING_CODE_MS });
}

export async function redeemPairingCode(code: string) {
  const state = demoRepo.read();
  const codeHash = await hashPairingCode(code.trim().toUpperCase());
  const entry = state.pairingCodes.find((p) => p.codeHash === codeHash);
  if (!entry || entry.usedAt || entry.expiresAt < state.now) {
    return failure("INVALID", "That pairing code did not work.");
  }
  updateDemo((current) => ({
    ...current,
    pairingCodes: current.pairingCodes.map((p) =>
      p.id === entry.id ? { ...p, usedAt: current.now } : p,
    ),
    session: {
      ...current.session,
      tillPairedRestaurantId: entry.restaurantId,
    },
  }));
  logAudit({
    actor: current_actor(),
    action: "pairing",
    restaurantId: entry.restaurantId,
    object: entry.id,
  });
  return success({ restaurantId: entry.restaurantId });
}

function current_actor(): string {
  return demoRepo.read().session.staffId ?? "owner";
}

export function pairThisDevice(restaurantId: string) {
  const scoped = requireScope(
    demoRepo.read().session.role,
    demoRepo.read().session.restaurantId,
    restaurantId,
  );
  if (!scoped.ok) return scoped;
  updateDemo((current) => ({
    ...current,
    session: { ...current.session, tillPairedRestaurantId: restaurantId },
  }));
  return success({ restaurantId });
}

export function lastStampPerStaff(restaurantId: string) {
  const state = demoRepo.read();
  const out: Record<string, string | null> = {};
  for (const staff of state.staff.filter((s) => s.restaurantId === restaurantId)) {
    const last = state.stamps
      .filter((s) => s.staffId === staff.id && s.status === "valid")
      .map((s) => s.createdAt)
      .sort()
      .pop();
    out[staff.id] = last ?? null;
  }
  return success(out);
}
