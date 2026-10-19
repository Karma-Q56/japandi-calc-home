// Async repository contract for the Neon slices (C/D/E).
// Demo implementation must conform; Postgres implementation must pass the same tests.
// Money = integer cents, times = ISO timestamptz strings. No auth/OTP sending here.

export interface PublicMenuItem {
  id: string;
  sectionId: string | null;
  sectionName: string | null;
  name: string;
  description: string | null;
  priceCents: number | null;
  available: boolean;
  sortOrder: number;
}

export interface PublicSpecial {
  id: string;
  title: string;
  body: string | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface PublicPage {
  id: string;
  slug: string;
  name: string;
  suburb: string | null;
  theme: Record<string, JsonValue>;
  hours: Record<string, JsonValue>;
  stampsRequired: number;
  rewardDescription: string;
  visitWindowMinutes: number;
  welcomeStamp: boolean;
  menu: PublicMenuItem[];
  specials: PublicSpecial[];
}

export interface LeadInput {
  kind?: string | undefined;
  restaurantName: string;
  contactName: string;
  phone: string;
  email?: string | undefined;
  role?: string | undefined;
  venueType?: string | undefined;
  suburb?: string | undefined;
  quietTime?: string | undefined;
  weeklyGuests?: string | undefined;
  planInterest?: string | undefined;
  consent: boolean;
  consentVersion?: string | undefined;
  calculator?: Record<string, unknown> | undefined;
  notes?: string | undefined;
  website?: string | undefined; // honeypot — must be empty
  ipHash?: string | undefined;
}

export interface JoinInput {
  slug: string;
  name: string;
  phone: string; // any SA format; normalised with the shared normaliser
  marketingSms: boolean;
  source: string;
  // Demo OTP seam: verified in demo, NOT real auth. Live keeps the same seam.
  otpVerified?: boolean;
}

export interface JoinResult {
  customerId: string;
  membershipId: string;
  alreadyMember: boolean;
}

export interface CardView {
  restaurant: { id: string; slug: string; name: string; stampsRequired: number; rewardDescription: string };
  customer: { id: string; name: string; qrToken: string };
  membership: {
    id: string;
    stampsCurrent: number;
    stampsTotal: number;
    lastVisitAt: string | null;
    marketingSms: string | boolean;
  };
  stamps: { id: string; createdAt: string; status: string }[];
  rewards: { id: string; description: string; status: string }[];
  consents: { id: string; purpose: string; action: string; wordingVersion: string; wordingText: string }[];
}

export type StampOutcome =
  | { result: "stamped"; stampId: string; stampsCurrent: number; rewardId: string | null }
  | { result: "too_soon"; stampsCurrent: number; nextAllowedAt?: string }
  | { result: "not_a_member" }
  | { result: "duplicate_retry"; stampId: string; stampsCurrent: number }
  | { result: "reward"; stampId: string; stampsCurrent: number; rewardId: string }
  | { result: "undo"; undoneStampId: string; stampsCurrent: number };

export interface PatronRepos {
  getPublicPage(slug: string): Promise<PublicPage | null>;
  submitLead(input: LeadInput): Promise<{ id: string }>;
  joinGuest(input: JoinInput): Promise<JoinResult>;
  getCard(slug: string, customerId: string): Promise<CardView | null>;
  listCards(customerId: string): Promise<{ membershipId: string; restaurantSlug: string }[]>;
  recordStamp(input: {
    restaurantId: string;
    membershipId: string;
    staffId: string;
    key: string;
    pin: string;
  }): Promise<StampOutcome>;
}
