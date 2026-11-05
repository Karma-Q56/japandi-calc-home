import { demoRepo, updateDemo } from "@/data/repo";
import type { Membership, Redemption, Special, SpecialCode, SpecialKind, TierName } from "@/data/types";
import { failure, success } from "./demo";
import { logAudit } from "./audit";
import { tierFor, tierMeets } from "./loyalty";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeSpecialCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 300; attempt++) {
    let code = "";
    const bytes = crypto.getRandomValues(new Uint8Array(7));
    for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]!;
    if (!taken.has(code)) return code;
  }
  return `SP${String(Date.now()).slice(-6)}`;
}

function allCodes(state: ReturnType<typeof demoRepo.read>): Set<string> {
  return new Set([
    ...state.specials.flatMap((item) => (item.code ? [item.code.toUpperCase()] : [])),
    ...state.specialCodes.map((item) => item.code.toUpperCase()),
    ...state.campaigns.map((item) => item.code.toUpperCase()),
  ]);
}

function isLive(special: Special, now: number): boolean {
  if (!special.active) return false;
  if (special.startsAt && new Date(special.startsAt).getTime() > now) return false;
  if (special.endsAt && new Date(special.endsAt).getTime() < now) return false;
  return true;
}

export interface SpecialInput {
  id?: string;
  restaurantId: string;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  active?: boolean;
  kind: SpecialKind;
  code?: string;
  minTier?: TierName | null;
  targetMembershipIds?: string[];
}

export function createSpecial(input: SpecialInput) {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === input.restaurantId);
  if (!restaurant) return failure("NOT_FOUND", "Restaurant not found.");
  const title = input.title.trim();
  if (title.length < 1 || title.length > 90) {
    return failure("INVALID", "Give the special a title of 1 to 90 characters.");
  }
  if (!input.startsAt || !input.endsAt || input.endsAt <= input.startsAt) {
    return failure("INVALID", "The end date must be after the start date.");
  }
  if (input.kind !== "public" && input.kind !== "members" && input.kind !== "targeted") {
    return failure("INVALID", "Choose public, members or targeted.");
  }
  const taken = allCodes(state);
  let code: string | undefined;
  if (input.kind !== "targeted") {
    code = input.code?.trim().toUpperCase();
    if (code && taken.has(code)) return failure("INVALID", "That code is already in use.");
    if (!code) code = makeSpecialCode(taken);
  }
  const special: Special = {
    id: input.id ?? `special-${crypto.randomUUID()}`,
    restaurantId: input.restaurantId,
    title,
    body: input.body.trim(),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    active: input.active ?? true,
    kind: input.kind,
    ...(code ? { code } : {}),
    minTier: input.kind === "members" ? (input.minTier ?? null) : null,
    createdAt: new Date(state.now).toISOString(),
  };
  updateDemo((current) => ({
    ...current,
    specials: [...current.specials, special],
    offers: [
      ...current.offers,
      {
        id: `offer-${special.id}`,
        restaurantId: special.restaurantId,
        title: special.title,
        body: special.body,
        kind: special.kind,
        ...(special.code ? { code: special.code } : {}),
        minTier: special.minTier ?? null,
        startsAt: special.startsAt,
        endsAt: special.endsAt,
        active: special.active,
        placements: { page: true, till: false, push: false, sms: false },
        status: "live",
        legacySpecialId: special.id,
        ...(special.createdAt ? { createdAt: special.createdAt } : {}),
      },
    ],
    restaurants: current.restaurants.map((item) =>
      item.id === input.restaurantId
        ? { ...item, specialIds: [...new Set([...item.specialIds, special.id])] }
        : item,
    ),
  }));
  if (input.kind === "targeted" && input.targetMembershipIds?.length) {
    issueTargetedCodes(special.id, input.targetMembershipIds);
  }
  logAudit({
    actor: "owner",
    action: "special_create",
    restaurantId: input.restaurantId,
    object: special.id,
  });
  return success(special);
}

export function updateSpecial(input: SpecialInput) {
  if (!input.id) return failure("INVALID", "Missing special.");
  const state = demoRepo.read();
  const existing = state.specials.find((item) => item.id === input.id);
  if (!existing) return failure("NOT_FOUND", "Special not found.");
  if (existing.restaurantId !== input.restaurantId) {
    return failure("FORBIDDEN", "That special belongs to another restaurant.");
  }
  if (!input.startsAt || !input.endsAt || input.endsAt <= input.startsAt) {
    return failure("INVALID", "The end date must be after the start date.");
  }
  const taken = allCodes(state);
  let code = existing.code;
  if (input.kind !== "targeted") {
    const nextCode = input.code?.trim().toUpperCase();
    if (nextCode && nextCode !== existing.code && taken.has(nextCode)) {
      return failure("INVALID", "That code is already in use.");
    }
    code = nextCode || existing.code || makeSpecialCode(taken);
  } else {
    code = undefined;
  }
  const updated: Special = {
    ...existing,
    title: input.title.trim(),
    body: input.body.trim(),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    active: input.active ?? existing.active,
    kind: input.kind,
    ...(code ? { code } : {}),
    minTier: input.kind === "members" ? (input.minTier ?? null) : null,
  };
  updateDemo((current) => ({
    ...current,
    specials: current.specials.map((item) => (item.id === updated.id ? updated : item)),
  }));
  if (input.kind === "targeted" && input.targetMembershipIds?.length) {
    issueTargetedCodes(existing.id, input.targetMembershipIds);
  }
  return success(updated);
}

/** Issue one unique single-use code per chosen membership. Idempotent. */
export function issueTargetedCodes(specialId: string, membershipIds: string[]) {
  const state = demoRepo.read();
  const special = state.specials.find((item) => item.id === specialId);
  if (!special || special.kind !== "targeted") {
    return failure("INVALID", "Only targeted specials get personal codes.");
  }
  const taken = allCodes(state);
  const issued: SpecialCode[] = [];
  const now = new Date(state.now).toISOString();
  for (const membershipId of membershipIds) {
    const membership = state.memberships.find(
      (item) => item.id === membershipId && item.restaurantId === special.restaurantId,
    );
    if (!membership) continue;
    const existing = state.specialCodes.find(
      (item) => item.specialId === specialId && item.membershipId === membershipId,
    );
    if (existing) continue;
    const code = makeSpecialCode(taken);
    taken.add(code);
    issued.push({
      id: `special-code-${crypto.randomUUID()}`,
      restaurantId: special.restaurantId,
      specialId,
      membershipId,
      code,
      issuedAt: now,
    });
  }
  if (issued.length > 0) {
    updateDemo((current) => ({
      ...current,
      specialCodes: [...current.specialCodes, ...issued],
    }));
  }
  return success(issued);
}

export function codesForMembership(membershipId: string): SpecialCode[] {
  return demoRepo.read().specialCodes.filter((item) => item.membershipId === membershipId);
}

/**
 * What a guest may see at a venue: public specials for everyone, members and
 * targeted specials only for a membership that qualifies.
 */
export function offersForMembership(membershipId: string) {
  const state = demoRepo.read();
  const membership = state.memberships.find((item) => item.id === membershipId);
  if (!membership) return failure("NOT_FOUND", "Membership not found.");
  const tier = tierFor(state, membership);
  const now = state.now;
  const specials = state.specials
    .filter((special) => special.restaurantId === membership.restaurantId && isLive(special, now))
    .map((special) => {
      const code = state.specialCodes.find(
        (item) => item.specialId === special.id && item.membershipId === membershipId,
      );
      const redeemed = state.redemptions.some(
        (item) =>
          item.kind === "special" &&
          item.specialId === special.id &&
          item.membershipId === membershipId,
      );
      return { special, code: code ?? null, redeemed };
    })
    .filter(({ special }) => {
      if (special.kind === "public") return true;
      if (special.kind === "members") return tierMeets(tier, special.minTier);
      return true; // targeted: only the holder has a code, checked below
    })
    .filter(({ special, code }) => special.kind !== "targeted" || !!code);
  return success({ tier, offers: specials });
}

export function publicSpecialsFor(restaurantId: string): Special[] {
  const state = demoRepo.read();
  return state.specials.filter(
    (special) =>
      special.restaurantId === restaurantId && special.kind === "public" && isLive(special, state.now),
  );
}

export interface SpecialOwnerRow {
  special: Special;
  status: "scheduled" | "live" | "ended" | "paused";
  issued: number;
  redeemed: number;
  revenueFree: boolean;
}

export function listOwnerSpecials(restaurantId: string): SpecialOwnerRow[] {
  const state = demoRepo.read();
  return state.specials
    .filter((special) => special.restaurantId === restaurantId)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map((special) => {
      const status: SpecialOwnerRow["status"] = !special.active
        ? "paused"
        : special.startsAt && new Date(special.startsAt).getTime() > state.now
          ? "scheduled"
          : special.endsAt && new Date(special.endsAt).getTime() < state.now
            ? "ended"
            : "live";
      return {
        special,
        status,
        issued: state.specialCodes.filter((item) => item.specialId === special.id).length,
        redeemed: state.redemptions.filter(
          (item) => item.kind === "special" && item.specialId === special.id,
        ).length,
        revenueFree: true,
      };
    });
}

export type RedeemSpecialResult =
  | { ok: true; special: Special; redemptionId: string; code: string }
  | { ok: false; error: { code: string; message: string } };

/** Till redemption for typed codes. Shared codes: once per member per special.
 *  Targeted codes: only their owner, only once. */
export function redeemSpecial(input: {
  restaurantId: string;
  membershipId: string;
  code: string;
  actorId: string;
  session: { role: string; restaurantId?: string | undefined };
}): RedeemSpecialResult {
  const state = demoRepo.read();
  if (
    input.session.role !== "operator" &&
    !["owner", "staff"].includes(input.session.role)
  ) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You cannot redeem here." } };
  }
  if (
    input.session.role !== "operator" &&
    input.session.restaurantId !== input.restaurantId
  ) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "That offer belongs to another restaurant." },
    };
  }
  const membership = state.memberships.find(
    (item) => item.id === input.membershipId && item.restaurantId === input.restaurantId,
  );
  if (!membership) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "That guest was not on this restaurant's list." },
    };
  }
  const needle = input.code.trim().toUpperCase();
  if (!needle) {
    return { ok: false, error: { code: "INVALID", message: "Enter an offer code." } };
  }

  const targeted = state.specialCodes.find(
    (item) => item.code.toUpperCase() === needle && item.restaurantId === input.restaurantId,
  );
  if (targeted) {
    const special = state.specials.find((item) => item.id === targeted.specialId);
    if (!special) {
      return { ok: false, error: { code: "NOT_FOUND", message: "That offer no longer exists." } };
    }
    if (targeted.membershipId !== input.membershipId) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "This offer is for another member." },
      };
    }
    if (targeted.redeemedAt) {
      return {
        ok: false,
        error: { code: "INVALID", message: "That code has already been used." },
      };
    }
    if (!isLive(special, state.now)) {
      return { ok: false, error: { code: "INVALID", message: "That offer is not active." } };
    }
    const now = new Date(state.now).toISOString();
    const redemptionId = `redemption-${crypto.randomUUID()}`;
    const redemption: Redemption = {
      id: redemptionId,
      restaurantId: special.restaurantId,
      membershipId: membership.id,
      rewardId: special.id,
      redeemedAt: now,
      redeemedBy: input.actorId,
      kind: "special",
      code: targeted.code,
      specialId: special.id,
      specialCodeId: targeted.id,
    };
    updateDemo((current) => ({
      ...current,
      redemptions: [...current.redemptions, redemption],
      specialCodes: current.specialCodes.map((item) =>
        item.id === targeted.id
          ? { ...item, redeemedAt: now, redeemedBy: input.actorId }
          : item,
      ),
    }));
    logAudit({
      actor: input.actorId,
      action: "redeem",
      restaurantId: special.restaurantId,
      object: `${special.id}:${membership.id}`,
    });
    return { ok: true, special, redemptionId, code: targeted.code };
  }

  const shared = state.specials.find(
    (special) =>
      special.restaurantId === input.restaurantId &&
      special.code?.toUpperCase() === needle &&
      special.kind !== "targeted",
  );
  if (!shared) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "That offer code was not found." },
    };
  }
  if (!isLive(shared, state.now)) {
    return { ok: false, error: { code: "INVALID", message: "That offer is not active." } };
  }
  if (shared.kind === "members") {
    const tier = tierFor(state, membership);
    if (!tierMeets(tier, shared.minTier)) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "This offer is for another member." },
      };
    }
  }
  const already = state.redemptions.some(
    (item) =>
      item.kind === "special" &&
      item.specialId === shared.id &&
      item.membershipId === membership.id,
  );
  if (already) {
    return {
      ok: false,
      error: { code: "INVALID", message: "That offer was already redeemed by this member." },
    };
  }
  const now = new Date(state.now).toISOString();
  const redemptionId = `redemption-${crypto.randomUUID()}`;
  updateDemo((current) => ({
    ...current,
    redemptions: [
      ...current.redemptions,
      {
        id: redemptionId,
        restaurantId: shared.restaurantId,
        membershipId: membership.id,
        rewardId: shared.id,
        redeemedAt: now,
        redeemedBy: input.actorId,
        kind: "special" as const,
        ...(shared.code ? { code: shared.code } : {}),
        specialId: shared.id,
      },
    ],
  }));
  logAudit({
    actor: input.actorId,
    action: "redeem",
    restaurantId: shared.restaurantId,
    object: shared.id,
  });
  return { ok: true, special: shared, redemptionId, code: shared.code ?? "" };
}

/** Personal single-use prize from the spin wheel. */
export function createPrizeOffer(input: {
  restaurantId: string;
  membershipId: string;
  label: string;
  valueCents: number;
}) {
  const state = demoRepo.read();
  const now = state.now;
  const taken = allCodes(state);
  const special: Special = {
    id: `special-${crypto.randomUUID()}`,
    restaurantId: input.restaurantId,
    title: input.label,
    body: "A personal prize from the Patron spin wheel. Show this code at the till.",
    startsAt: new Date(now).toISOString(),
    endsAt: new Date(now + 30 * 86400000).toISOString(),
    active: true,
    kind: "targeted",
    minTier: null,
    createdAt: new Date(now).toISOString(),
  };
  const code: SpecialCode = {
    id: `special-code-${crypto.randomUUID()}`,
    restaurantId: input.restaurantId,
    specialId: special.id,
    membershipId: input.membershipId,
    code: makeSpecialCode(taken),
    issuedAt: new Date(now).toISOString(),
  };
  updateDemo((current) => ({
    ...current,
    specials: [...current.specials, special],
    specialCodes: [...current.specialCodes, code],
  }));
  return { special, code, valueCents: input.valueCents };
}
