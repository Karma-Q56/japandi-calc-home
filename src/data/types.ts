export type RestaurantStatus = "draft" | "active" | "paused" | "closed";
export type Plan = "starter" | "managed" | "partner" | "custom";
export type DemoRole = "guest" | "staff" | "owner" | "manager" | "operator";
export type ConsentPurpose = "loyalty" | "marketing_sms" | "marketing_push";
export type ConsentAction = "granted" | "withdrawn";

export interface Theme {
  ink: string;
  paper: string;
  accent: string;
  accentSoft: string;
  stampFilled: string;
  stampEmpty: string;
  headingFont: string;
  bodyFont: string;
  radius: number;
  stampShape: "circle" | "square" | "pixel-star" | "coffee-cup" | "croissant" | "custom-svg";
  cardBackground: "flat" | "paper" | "gradient" | "photo";
  logo?: string;
  tagline: string;
}
export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  status: RestaurantStatus;
  plan: Plan;
  suburb: string;
  address?: string;
  hours: Record<string, { open: string; close: string } | null>;
  stampsRequired: number;
  rewardDescription: string;
  visitWindowMinutes: number;
  welcomeStamp: boolean;
  theme: Theme;
  pageConfig: { type: string; enabled: boolean }[];
  menuSectionIds: string[];
  specialIds: string[];
  createdAt: string;
  creditCents: number;
  senderName: string;
  smsCapRestaurant: number;
  smsCapMember: number;
  contact: string;
}
export interface StaffMember {
  id: string;
  restaurantId: string;
  displayName: string;
  active: boolean;
  pinHash: string | null;
}
export interface MenuSection {
  id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
}
export interface MenuItem {
  id: string;
  restaurantId: string;
  sectionId: string;
  name: string;
  description: string;
  priceCents: number;
  available: boolean;
  sortOrder: number;
}
export interface Special {
  id: string;
  restaurantId: string;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
}
export interface Customer {
  id: string;
  name: string;
  phoneE164: string;
  birthday?: string;
  memberCode: string;
  qrToken: string;
  deleted?: boolean;
}
export interface Membership {
  id: string;
  restaurantId: string;
  customerId: string;
  joinedAt: string;
  source: string;
  stampsCurrent: number;
  stampsTotal: number;
  lastVisitAt: string | null;
  welcomeStamp: boolean;
  marketingSms: boolean;
  marketingPush: boolean;
  lastSeenStamps: number;
}
export interface ConsentEvent {
  id: string;
  membershipId: string;
  purpose: ConsentPurpose;
  action: ConsentAction;
  wordingVersion: string;
  wordingText: string;
  source: string;
  createdAt: string;
}
export interface StampEvent {
  id: string;
  restaurantId: string;
  membershipId: string;
  staffId: string | null;
  key: string | null;
  createdAt: string;
  status: "valid" | "undone";
  undoneAt?: string;
  undoneBy?: string;
}
export interface Reward {
  id: string;
  restaurantId: string;
  membershipId: string;
  description: string;
  earnedAt: string;
  redeemedAt?: string;
  redeemedBy?: string;
  stampId?: string;
}
export type CampaignStatus =
  | "draft"
  | "pending_approval"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled"
  | "failed";
export type CampaignAudience = { type: "all_opted_in" } | { type: "lapsed"; days: number };
export interface Campaign {
  id: string;
  restaurantId: string;
  name: string;
  body: string;
  channel: "sms";
  audience: CampaignAudience;
  code: string;
  validFrom?: string;
  validTo?: string;
  status: CampaignStatus;
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: string;
  scheduledAt?: string;
  sentAt: string | null;
  recipients: number;
  delivered: number;
  failed: number;
  awardStamp?: boolean;
  createdBy: string;
  createdAt: string;
  estRecipients?: number;
  estSegments?: number;
  estCostCents?: number;
  actualCostCents: number;
}
export type MessageStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "skipped";
export interface Message {
  id: string;
  restaurantId: string;
  customerId: string;
  membershipId?: string;
  campaignId?: string;
  channel: "sms";
  body: string;
  segments: number;
  costCents: number;
  status: MessageStatus;
  attempts: number;
  provider?: string;
  providerMessageId?: string;
  errorCode?: string;
  notBefore?: string;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  campaignCode?: string;
  expiresAt?: string;
}
export interface Redemption {
  id: string;
  restaurantId: string;
  membershipId: string;
  rewardId: string;
  redeemedAt: string;
  redeemedBy?: string;
  kind: "reward" | "campaign";
  code?: string;
}
export type LedgerEntryType =
  | "topup"
  | "reserve"
  | "release"
  | "charge"
  | "refund"
  | "adjustment";
export interface LedgerEntry {
  id: string;
  restaurantId: string;
  type: LedgerEntryType;
  amountCents: number;
  reference: string;
  campaignId?: string;
  messageId?: string;
  paymentId?: string;
  note?: string;
  createdBy?: string;
  createdAt: string;
}
export type PaymentStatus = "pending" | "confirmed" | "rejected";
export interface Payment {
  id: string;
  restaurantId: string;
  kind: "topup";
  amountCents: number;
  status: PaymentStatus;
  reference: string;
  provider: string;
  providerRef?: string;
  requestedBy?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  createdAt: string;
}
export interface PushSubscription {
  id: string;
  customerId: string;
  endpoint: string;
}
export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  restaurantId?: string;
  object?: string;
  createdAt: string;
}
export interface Lead {
  id: string;
  restaurantName: string;
  phone: string;
}
export interface DataRequest {
  id: string;
  customerId: string;
  kind: "deletion";
  status: "open" | "done";
  createdAt: string;
}
export interface ProviderEvent {
  id: string;
  provider: string;
  eventId: string;
  receivedAt: string;
  processedAt?: string;
}
export interface RateLimitHit {
  bucket: string;
  key: string;
  createdAt: number;
}
export interface PairingCode {
  id: string;
  restaurantId: string;
  codeHash: string;
  expiresAt: number;
  usedAt?: number;
}
export interface OtpSendLogEntry {
  id: string;
  phoneHash: string;
  restaurantId?: string;
  costCents: number;
  createdAt: number;
}
export interface PinAttempt {
  staffId: string;
  ok: boolean;
  createdAt: number;
}
export interface PinLockout {
  staffId: string;
  until: number;
}
export type OnboardingStep =
  | "logo"
  | "hours"
  | "menu"
  | "reward_rule"
  | "page"
  | "qr_pack"
  | "staff_training"
  | "go_live"
  | "day_7_checkin";
export interface OnboardingChecklist {
  restaurantId: string;
  done: Partial<Record<OnboardingStep, string>>;
}
export interface DemoSession {
  role: DemoRole;
  restaurantId?: string;
  customerId?: string;
  staffId?: string;
  tillPairedRestaurantId?: string;
  staffExpiresAt?: number;
}
export interface DemoState {
  version: 2;
  now: number;
  session: DemoSession;
  restaurants: Restaurant[];
  staff: StaffMember[];
  sections: MenuSection[];
  items: MenuItem[];
  specials: Special[];
  customers: Customer[];
  memberships: Membership[];
  consents: ConsentEvent[];
  stamps: StampEvent[];
  rewards: Reward[];
  campaigns: Campaign[];
  messages: Message[];
  redemptions: Redemption[];
  ledger: LedgerEntry[];
  payments: Payment[];
  pushSubscriptions: PushSubscription[];
  audit: AuditEvent[];
  leads: Lead[];
  dataRequests: DataRequest[];
  rateLimitHits: RateLimitHit[];
  pairingCodes: PairingCode[];
  otpSendLog: OtpSendLogEntry[];
  providerEvents: ProviderEvent[];
  pinAttempts: PinAttempt[];
  pinLockouts: PinLockout[];
  onboarding: OnboardingChecklist[];
}

export interface Repo {
  read(): DemoState;
  update(mutator: (state: DemoState) => DemoState): DemoState;
  write(state: DemoState): DemoState;
  reset(): DemoState;
  subscribe(listener: () => void): () => void;
}
