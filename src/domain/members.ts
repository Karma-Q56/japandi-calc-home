import { SMS } from "@/config/app";
import { getConsentWording } from "@/config/consent";
import { clock } from "@/lib/clock";
import { isValidSAMobile, normalizePhone } from "@/lib/phone";
import { demoRepo, updateDemo } from "@/data/repo";
import type { ConsentEvent, DemoSession, Membership } from "@/data/types";
import { failure, success } from "./demo";

const safeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function generateMemberCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `PT${Array.from(bytes, (value) => safeAlphabet[value % safeAlphabet.length]).join("")}`;
}

export function customerCards(customerId: string) {
  const state = demoRepo.read();
  const memberships = state.memberships
    .filter((m) => m.customerId === customerId)
    .map((m) => ({
      ...m,
      restaurant: state.restaurants.find((r) => r.id === m.restaurantId)!,
      rewards: state.rewards.filter((reward) => reward.membershipId === m.id),
    }));
  memberships.sort(
    (a, b) =>
      Number(b.rewards.some((item) => !item.redeemedAt)) -
        Number(a.rewards.some((item) => !item.redeemedAt)) ||
      (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? ""),
  );
  return success(memberships);
}

export function getCard(slug: string, customerId: string) {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find(
    (item) => item.slug === slug && item.status === "active",
  );
  if (!restaurant) return failure("NOT_FOUND", "We could not find that restaurant.");
  const membership = state.memberships.find(
    (item) => item.customerId === customerId && item.restaurantId === restaurant.id,
  );
  if (!membership) return failure("NOT_FOUND", "You have not joined this restaurant yet.");
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) return failure("NOT_FOUND", "Guest record not found.");
  const stampsGained = Math.max(0, membership.stampsCurrent - membership.lastSeenStamps);
  return success({
    restaurant,
    customer,
    membership,
    stampsGained,
    rewards: state.rewards.filter((item) => item.membershipId === membership.id),
    offers: state.campaigns.filter(
      (item) => item.restaurantId === restaurant.id && item.status === "sent",
    ),
    visits: state.stamps
      .filter((item) => item.membershipId === membership.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20),
    consents: state.consents
      .filter((item) => item.membershipId === membership.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
}

export function markCardSeen(membershipId: string) {
  updateDemo((current) => ({
    ...current,
    memberships: current.memberships.map((item) =>
      item.id === membershipId ? { ...item, lastSeenStamps: item.stampsCurrent } : item,
    ),
  }));
}

export function listRestaurantMembers(restaurantId: string, session: DemoSession) {
  if (
    session.role !== "operator" &&
    (!["owner", "staff"].includes(session.role) || session.restaurantId !== restaurantId)
  )
    return failure("FORBIDDEN", "You do not have access to this restaurant’s guests.");
  const state = demoRepo.read();
  return success(
    state.memberships
      .filter((item) => item.restaurantId === restaurantId)
      .map((membership) => ({
        membership,
        customer: state.customers.find((item) => item.id === membership.customerId),
      })),
  );
}

export function joinRestaurant(input: {
  slug: string;
  name: string;
  phone: string;
  marketingSms: boolean;
  source: string;
  loyaltyConsent?: boolean;
}) {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find(
    (item) => item.slug === input.slug && item.status === "active",
  );
  if (!restaurant) return failure("NOT_FOUND", "We could not find that restaurant.");
  const name = input.name.trim();
  const phoneE164 = normalizePhone(input.phone);
  if (input.loyaltyConsent === false)
    return failure("INVALID", "Agree to the loyalty card terms to continue.");
  if (name.length < 1 || name.length > 40 || !phoneE164 || !isValidSAMobile(phoneE164))
    return failure("INVALID", "Enter your first name and a valid South African mobile number.");
  const customer = state.customers.find((item) => item.phoneE164 === phoneE164);
  const customerId = customer?.id ?? `customer-${crypto.randomUUID()}`;
  const existing = state.memberships.find(
    (item) => item.restaurantId === restaurant.id && item.customerId === customerId,
  );
  if (existing) {
    updateDemo((current) => ({ ...current, session: { role: "guest", customerId } }));
    return success({ customerId, membershipId: existing.id, alreadyMember: true });
  }
  const now = new Date(state.now).toISOString();
  const membershipId = `membership-${crypto.randomUUID()}`;
  const newCustomer = customer ?? {
    id: customerId,
    name,
    phoneE164,
    memberCode: generateMemberCode(),
    qrToken: crypto.randomUUID(),
  };
  // Welcome stamps: granted once at join, bounded below the reward threshold.
  const initialStamps = Math.max(
    0,
    Math.min(restaurant.stampsRequired - 1, restaurant.welcomeStamps ?? (restaurant.welcomeStamp ? 1 : 0)),
  );
  const loyaltyWording = getConsentWording("loyalty", restaurant.name);
  const marketingWording = getConsentWording("marketing_sms", restaurant.name);
  const membership: Membership = {
    id: membershipId,
    restaurantId: restaurant.id,
    customerId,
    joinedAt: now,
    source: input.source,
    stampsCurrent: initialStamps,
    stampsTotal: initialStamps,
    lastVisitAt: null,
    welcomeStamp: initialStamps > 0,
    marketingSms: input.marketingSms,
    marketingPush: false,
    lastSeenStamps: 0,
  };
  const consent: ConsentEvent[] = [
    {
      id: crypto.randomUUID(),
      membershipId,
      purpose: "loyalty",
      action: "granted",
      wordingVersion: loyaltyWording.version,
      wordingText: loyaltyWording.text,
      source: "join_form",
      createdAt: now,
    },
  ];
  if (input.marketingSms)
    consent.push({
      id: crypto.randomUUID(),
      membershipId,
      purpose: "marketing_sms",
      action: "granted",
      wordingVersion: marketingWording.version,
      wordingText: marketingWording.text,
      source: "join_form",
      createdAt: now,
    });
  const otpEntry = {
    id: `otp-${crypto.randomUUID()}`,
    phoneHash: hashPhone(phoneE164),
    restaurantId: restaurant.id,
    costCents: SMS.otpCostCents,
    createdAt: Date.parse(now),
  };
  updateDemo((current) => ({
    ...current,
    customers: customer ? current.customers : [...current.customers, newCustomer],
    memberships: [...current.memberships, membership],
    consents: [...current.consents, ...consent],
    otpSendLog: [...current.otpSendLog, otpEntry],
    stamps: initialStamps
      ? [
          ...current.stamps,
          ...Array.from({ length: initialStamps }, (_, index) => ({
            id: crypto.randomUUID(),
            restaurantId: restaurant.id,
            membershipId,
            staffId: null,
            key: `welcome:${membershipId}:${index}`,
            createdAt: now,
            status: "valid" as const,
            reason: "welcome" as const,
          })),
        ]
      : current.stamps,
    session: { role: "guest", customerId },
  }));
  return success({ customerId, membershipId, alreadyMember: false });
}

/** Demo-only caller-safe hash for the OTP cost log (never store raw phones there). */
export function hashPhone(phoneE164: string): string {
  let hash = 5381;
  for (const char of `patron-otp:${phoneE164}`) {
    hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function setMarketingConsent(membershipId: string, enabled: boolean) {
  return changeConsent(membershipId, enabled ? "granted" : "withdrawn", "card_settings");
}
export function withdrawMarketingConsent(membershipId: string, source = "sms_link") {
  return changeConsent(membershipId, "withdrawn", source);
}
function changeConsent(membershipId: string, action: "granted" | "withdrawn", source: string) {
  const state = demoRepo.read();
  const membership = state.memberships.find((item) => item.id === membershipId);
  const restaurant =
    membership && state.restaurants.find((item) => item.id === membership.restaurantId);
  if (!membership || !restaurant) return failure("NOT_FOUND", "Membership not found.");
  const wording = getConsentWording("marketing_sms", restaurant.name);
  const event: ConsentEvent = {
    id: crypto.randomUUID(),
    membershipId,
    purpose: "marketing_sms",
    action,
    wordingVersion: wording.version,
    wordingText: wording.text,
    source,
    createdAt: new Date(state.now).toISOString(),
  };
  updateDemo((current) => ({
    ...current,
    memberships: current.memberships.map((item) =>
      item.id === membershipId ? { ...item, marketingSms: action === "granted" } : item,
    ),
    consents: [...current.consents, event],
  }));
  return success(event);
}

export function optOutAllForCustomer(customerId: string, source = "inbound_stopall") {
  const state = demoRepo.read();
  const memberships = state.memberships.filter((item) => item.customerId === customerId);
  if (memberships.length === 0) return failure("NOT_FOUND", "Membership not found.");
  const wording = getConsentWording("marketing_sms", "Patron");
  const now = new Date(state.now).toISOString();
  const events: ConsentEvent[] = memberships.map((membership) => ({
    id: crypto.randomUUID(),
    membershipId: membership.id,
    purpose: "marketing_sms" as const,
    action: "withdrawn" as const,
    wordingVersion: wording.version,
    wordingText: wording.text,
    source,
    createdAt: now,
  }));
  updateDemo((current) => ({
    ...current,
    memberships: current.memberships.map((item) =>
      item.customerId === customerId ? { ...item, marketingSms: false, marketingPush: false } : item,
    ),
    consents: [...current.consents, ...events],
  }));
  return success({ membershipIds: memberships.map((item) => item.id) });
}

export function rateLimit(
  bucket: string,
  key: string,
  max: number,
  windowMs: number,
  now = clock.now(),
) {
  const state = demoRepo.read();
  const fresh = state.rateLimitHits.filter((hit) => hit.createdAt > now - windowMs);
  const count = fresh.filter((hit) => hit.bucket === bucket && hit.key === key).length;
  if (count >= max) {
    if (fresh.length !== state.rateLimitHits.length)
      updateDemo((current) => ({ ...current, rateLimitHits: fresh }));
    return false;
  }
  updateDemo((current) => ({
    ...current,
    rateLimitHits: [...fresh, { bucket, key, createdAt: now }],
  }));
  return true;
}
export function checkJoinRateLimit(phone: string) {
  const key = normalizePhone(phone);
  if (!key) return failure("INVALID", "Enter a valid mobile number.");
  if (
    !rateLimit("join-phone-15m", key, 3, 15 * 60000) ||
    !rateLimit("join-phone-day", key, 10, 24 * 60 * 60000)
  )
    return failure("RATE_LIMITED", "Too many tries. Please try again later.");
  return success(true);
}

const TOKEN_SECRET = "patron-demo-opt-out-secret-v1";
const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const fromBase64Url = (value: string) =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
    char.charCodeAt(0),
  );
async function tokenKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function createOptOutToken(membershipId: string) {
  const membership = demoRepo.read().memberships.find((item) => item.id === membershipId);
  if (!membership) return failure("NOT_FOUND", "Membership not found.");
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        membershipId,
        purpose: "marketing_sms",
        expiresAt: clock.now() + 180 * 86400000,
      }),
    ),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await tokenKey(),
    new TextEncoder().encode(payload),
  );
  return success(`${payload}.${toBase64Url(new Uint8Array(signature))}`);
}
export async function optOutByToken(token: string) {
  try {
    const [payload, signature, ...rest] = token.split(".");
    if (!payload || !signature || rest.length)
      return failure("INVALID", "This opt-out link is invalid or has expired.");
    const valid = await crypto.subtle.verify(
      "HMAC",
      await tokenKey(),
      fromBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return failure("INVALID", "This opt-out link is invalid or has expired.");
    const details = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      membershipId: string;
      purpose: string;
      expiresAt: number;
    };
    if (details.purpose !== "marketing_sms" || details.expiresAt < clock.now())
      return failure("INVALID", "This opt-out link is invalid or has expired.");
    return withdrawMarketingConsent(details.membershipId, "sms_link");
  } catch {
    return failure("INVALID", "This opt-out link is invalid or has expired.");
  }
}

export function updateGuestProfile(customerId: string, input: { name: string; birthday?: string }) {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 40)
    return failure("INVALID", "Enter a name between 1 and 40 characters.");
  const found = demoRepo.read().customers.some((item) => item.id === customerId);
  if (!found) return failure("NOT_FOUND", "Guest record not found.");
  updateDemo((state) => ({
    ...state,
    customers: state.customers.map((item) => {
      if (item.id !== customerId) return item;
      const updated = { ...item, name };
      if (input.birthday) return { ...updated, birthday: input.birthday };
      const { birthday: _birthday, ...withoutBirthday } = updated;
      return withoutBirthday;
    }),
  }));
  return success(true);
}
export function rotateMemberCode(customerId: string) {
  if (!demoRepo.read().customers.some((item) => item.id === customerId))
    return failure("NOT_FOUND", "Guest record not found.");
  const memberCode = generateMemberCode();
  updateDemo((state) => ({
    ...state,
    customers: state.customers.map((item) =>
      item.id === customerId ? { ...item, memberCode } : item,
    ),
  }));
  return success(memberCode);
}
export function requestAccountDeletion(customerId: string) {
  const state = demoRepo.read();
  if (!state.customers.some((item) => item.id === customerId))
    return failure("NOT_FOUND", "Guest record not found.");
  const request = {
    id: `request-${crypto.randomUUID()}`,
    customerId,
    kind: "deletion" as const,
    status: "open" as const,
    createdAt: new Date(state.now).toISOString(),
  };
  updateDemo((current) => ({
    ...current,
    customers: current.customers.map((item) =>
      item.id === customerId ? { ...item, name: "", phoneE164: "", deleted: true } : item,
    ),
    dataRequests: [...current.dataRequests, request],
  }));
  return success(request);
}
export function getCustomerData(customerId: string) {
  const state = demoRepo.read();
  const customer = state.customers.find((item) => item.id === customerId);
  return customer
    ? success({
        customer,
        memberships: state.memberships
          .filter((item) => item.customerId === customerId)
          .map((membership) => ({
            membership,
            restaurant: state.restaurants.find((item) => item.id === membership.restaurantId),
            consents: state.consents.filter((item) => item.membershipId === membership.id),
          })),
      })
    : failure("NOT_FOUND", "Guest record not found.");
}
