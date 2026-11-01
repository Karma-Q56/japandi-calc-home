export type RestaurantStatus = "draft" | "active" | "paused" | "closed";
export type Plan = "starter" | "managed" | "partner" | "custom";
export type DemoRole = "guest" | "staff" | "owner" | "manager" | "operator";
export type ConsentPurpose = "loyalty" | "marketing_sms" | "marketing_push";
export type ConsentAction = "granted" | "withdrawn";

/** Public page layouts. A venue that customises nothing gets "classic". */
export type PageTemplate = "classic" | "hero" | "menu-first" | "minimal";

/** Visit tiers unlock members-only and targeted specials. */
export type TierName = "new" | "regular" | "vip";

/** Three kinds of special, one redemption engine. */
export type SpecialKind = "public" | "members" | "targeted";

export type StampReason = "visit" | "welcome" | "campaign" | "challenge" | "mystery" | "birthday" | "bonus" | "missyou";

/** Pixelated logo stamp art produced in the browser from the uploaded logo. */
export interface LogoStamp {
  grid: number;
  filled: string;
  empty: string;
}

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
  coverPhoto?: string;
  logoStamp?: LogoStamp;
  tagline: string;
}

/** One published version of the public page words and hours, kept to undo by hand. */
export interface PageVersion {
  id: string;
  restaurantId: string;
  /** Johannesburg time as ISO, when this version was published. */
  at: string;
  edit: PageEdit;
}

/** The words and hours an owner edits on the public page. */
export interface PageEdit {
  /** Under the venue name on every template. 2 to 70 characters. */
  tagline: string;
  /** The short story on the page. Empty keeps the calm default wording. */
  about: string;
  /** Street address, optional. */
  address: string;
  /** Suburb, shown next to the venue name everywhere. */
  suburb: string;
  /** Monday to Sunday; null means closed that day. */
  hours: Restaurant["hours"];
}
export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  status: RestaurantStatus;
  plan: Plan;
  suburb: string;
  /** Shown on the find page and used for filtering. */
  venueType?: "cafe" | "bakery" | "restaurant" | "takeaway";
  address?: string;
  hours: Record<string, { open: string; close: string } | null>;
  stampsRequired: number;
  rewardDescription: string;
  visitWindowMinutes: number;
  /** Legacy boolean kept for old snapshots; derive from welcomeStamps. */
  welcomeStamp: boolean;
  /** Welcome stamps granted once at join (0 .. stampsRequired - 1). */
  welcomeStamps: number;
  theme: Theme;
  pageTemplate: PageTemplate;
  pageConfig: { type: string; enabled: boolean }[];
  menuSectionIds: string[];
  specialIds: string[];
  createdAt: string;
  creditCents: number;
  senderName: string;
  smsCapRestaurant: number;
  smsCapMember: number;
  contact: string;
  /** Visit counts (last 90 days) that unlock Regular and VIP. */
  tiers: { regular: number; vip: number };
  /** Every Nth visit earns a surprise bonus stamp. 0 turns mystery stamps off. */
  mysteryEveryVisits: number;
  /** Spoil the guest in their birthday week. */
  birthdayReward: boolean;
  /** The owner chooses a bonus stamp or a free item for birthdays. */
  birthdayRewardKind?: "stamp" | "freeItem";
  /** What the birthday guest gets for free, shown at the till. */
  birthdayRewardItem?: string;
  /** Spin wheel settings. Disabled by default so guests only see it when the owner opts in. */
  spin: SpinConfig;
  /** Track what guests order at the till. Off until the owner switches it on. */
  trackOrders?: boolean;
  /** Quick buttons show single items or simple meal categories. */
  ordersMode?: "items" | "categories";
  /** Bring a friend settings. Off until the owner switches it on. */
  referral?: ReferralConfig;
  /** Double stamp day. Off by default. One visit on that weekday earns an extra stamp. */
  doubleStamp?: { enabled: boolean; weekday: number };
  /** Visit streak. Off by default. */
  streak?: StreakConfig;
  /** Monthly cap on bonus stamps from double stamp day, streaks and the miss-you rule combined. */
  toolStampBudget?: number;
  /** Placeholder address notified of new enquiries. No real email is sent in demo. */
  enquiryNotifyEmail?: string;
  /** Operator drafts skip owner approval when this is on. Off by default. */
  campaignAutoApprove?: boolean;
  /** Prefilled discount for a new guest offer, as a percentage. */
  defaultDiscountPercent?: number;
  /** How often the owner gets an email update. Placeholder until mail is connected. */
  emailUpdates?: "weekly" | "monthly" | "off";
  /** Warn the owner when SMS credit falls below this amount, in cents. */
  lowCreditAlertCents?: number;
  /** "We miss you" rule: a guest who has not visited for N days gets a treat. Off by default. */
  missYou?: MissYouConfig;
  /** A hand-out reward the owner gives at the till. Off by default. */
  customReward?: CustomRewardConfig;
  /** The short story on the public page. Empty keeps the calm default wording. */
  aboutText?: string;
}

/** "We miss you" rule. Off by default, and once per guest per 60 days. */
export interface MissYouConfig {
  enabled: boolean;
  /** Days since the guest's last visit before the rule applies (14 to 90). */
  afterDays: number;
  /** Bonus stamp or a free item; the owner picks. */
  kind: "stamp" | "freeItem";
  /** The item given for free, for the freeItem kind. */
  item?: string;
}

/** A reward the owner hands out by hand at the till. Off by default. */
export interface CustomRewardConfig {
  enabled: boolean;
  /** The plain name shown to the guest, such as "Cookie at 20 visits". */
  name: string;
  /** How many hand-outs one guest can get each month. */
  limitPerGuestPerMonth: number;
}

/** Visit streak. Off by default. */
export interface StreakConfig {
  enabled: boolean;
  /** The run length that earns the bonus. */
  weeks: number;
  /** Visits needed inside each Johannesburg calendar week. */
  weeklyVisits: number;
  bonusStamps: number;
}

/** Owner's choices for bring a friend. Disabled by default. */
export interface ReferralConfig {
  enabled: boolean;
  /** Both guests get a bonus stamp or a free item; the owner picks. */
  rewardKind: "stamp" | "freeItem";
  /** The menu item given for free, for the freeItem kind. */
  rewardItem: string;
  /** How many referrals one guest can earn from each month. */
  limitPerMemberPerMonth: number;
}

/** A join through a friend's share code, rewarded after the friend's first stamp. */
export interface Referral {
  id: string;
  restaurantId: string;
  referrerMembershipId: string;
  friendMembershipId: string;
  /** The friend's member-side share code that was used. */
  referrerCode: string;
  status: "pending" | "rewarded" | "rejected";
  /** Why a referral was rejected, such as a duplicate phone number. */
  rejectReason?: string;
  createdAt: string;
  rewardedAt?: string;
}

export type OrderSource = "till" | "import" | "pos";

/** One bought line, kept plain so a point of sale import can fill it later. */
export interface OrderLine {
  /** The item or category name, as picked at the till. */
  label: string;
  qty: number;
  kind: "item" | "category";
}

/** What a guest ordered on one visit. Never blocks or delays the stamp. */
export interface Order {
  id: string;
  restaurantId: string;
  membershipId: string;
  /** The stamp this order was attached to, when it came in after a till stamp. */
  stampId?: string;
  /** Where the order came from. Till now; import and pos later. */
  source: OrderSource;
  items: OrderLine[];
  /** Optional bill amount the staff member typed, in cents. */
  billCents?: number;
  createdAt: string;
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
  kind: SpecialKind;
  /** Shared code for public/members specials. Targeted codes live in SpecialCode. */
  code?: string;
  /** Members specials can require a tier. */
  minTier?: TierName | null;
  createdAt?: string;
}

/** One unique, single-use code issued to a guest for a targeted special. */
export interface SpecialCode {
  id: string;
  restaurantId: string;
  specialId: string;
  membershipId: string;
  code: string;
  issuedAt: string;
  redeemedAt?: string;
  redeemedBy?: string;
}
export interface Customer {
  id: string;
  name: string;
  phoneE164: string;
  /** Day and month only, never the year. Old snapshots may still carry a full date string. */
  birthday?: { day: number; month: number } | string;
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
  /** This guest's own bring a friend share code, set the first time they share. */
  referralCode?: string;
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
  /** Why the stamp was granted. Missing means a normal visit. */
  reason?: StampReason;
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
  /** Idempotency marker for rewards granted outside the stamp count.
   */
  key?: string;
}
export type CampaignStatus =
  | "draft"
  | "pending_approval"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled"
  | "failed";
export type SegmentType =
  | "everyone"
  | "new"
  | "lapsed30"
  | "close_to_reward"
  | "weekday"
  | "birthday_month"
  | "saved_list";

export type CampaignAudience =
  | { type: "everyone" }
  | { type: "new"; days: number }
  | { type: "lapsed30"; days: number }
  | { type: "close_to_reward"; remaining: number }
  | { type: "weekday"; weekday: number }
  | { type: "birthday_month"; month?: number }
  | { type: "saved_list"; listId: string }
  // Legacy snapshots.
  | { type: "all_opted_in" }
  | { type: "lapsed"; days: number };

export interface SavedList {
  id: string;
  restaurantId: string;
  name: string;
  membershipIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SpinSegment {
  id: string;
  label: string;
  /** Relative weight; higher wins more often. */
  weight: number;
  /** Value of the prize in cents, counted against the weekly budget. */
  valueCents: number;
  /** A join-spin segment can hand over bonus stamps instead of an offer. */
  bonusStamps?: number;
  /** Optional cap, e.g. at most 3 a day. */
  cap?: { period: "day" | "week"; max: number };
}

/**
 * Wheel modes. "earned" is what early snapshots stored as "welcome"; the
 * normaliser in the domain keeps those old configurations working.
 */
export type SpinMode = "earned" | "join" | "reward_decider" | "daily_surprise";

export interface SpinConfig {
  enabled: boolean;
  /** Modes shown to guests. Older snapshots may still contain the legacy "welcome" id. */
  modes?: SpinMode[];
  dailyPool?: string[];
  segments: SpinSegment[];
  weeklyBudgetCents: number;
  /** Guests earn one spin every N visits. */
  earnEveryVisits: number;
  /** Also award a spin at every reward milestone. */
  earnAtMilestone: boolean;
  /** Reward decider never hands over a prize worth less than this (cents). */
  rewardFloorCents?: number;
  rules: string;
}

export interface SpinResult {
  id: string;
  restaurantId: string;
  membershipId: string;
  segmentId: string;
  label: string;
  valueCents: number;
  wonAt: string;
  mode?: SpinMode | "welcome" | "visit";
  code?: string;
  prizeSpecialId?: string;
  /** Bonus stamps handed over by a join spin. */
  bonusStamps?: number;
  /** Reward decider kept the advertised reward because no prize met the floor. */
  keptAdvertisedReward?: boolean;
}

export interface Challenge {
  id: string;
  restaurantId: string;
  title: string;
  visits: number;
  windowDays: number;
  bonusStamps: number;
  active: boolean;
  createdAt: string;
}
export interface Campaign {
  id: string;
  restaurantId: string;
  name: string;
  body: string;
  channel: "sms" | "push" | "push_then_sms";
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
  /** A campaign can attach one special; targeted sends issue a unique code per guest. */
  specialId?: string;
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
  channel: "sms" | "push";
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
  kind: "reward" | "campaign" | "special";
  code?: string;
  specialId?: string;
  specialCodeId?: string;
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
  membershipId?: string;
  restaurantId?: string;
  endpoint: string;
  p256dh?: string;
  auth?: string;
  createdAt?: string;
  lastUsedAt?: string;
}
export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  restaurantId?: string;
  object?: string;
  createdAt: string;
}
export type LeadKind = "owner" | "diner" | "other";
export type LeadStatus = "new" | "replied" | "closed";

/** One contact enquiry, with every answer the visitor gave. */
export interface Lead {
  id: string;
  /** ENQ-YEAR-NUMBER, shown to the visitor and used by staff. */
  reference: string;
  kind: LeadKind;
  status: LeadStatus;
  /** Restaurant name for owners, the place they want for diners, a subject for others. */
  restaurantName: string;
  contactName: string;
  phone: string;
  email?: string;
  role?: string;
  venueType?: string;
  suburb?: string;
  quietTime?: string;
  weeklyGuests?: string;
  planInterest?: string;
  visitWanted?: boolean;
  preferredDay?: string;
  message?: string;
  consent: boolean;
  /** When consent was given, recorded with the enquiry. */
  consentAt?: string;
  adminNotes?: string;
  createdAt: string;
}
export interface DataRequest {
  id: string;
  customerId: string;
  kind: "deletion";
  status: "open" | "done";
  createdAt: string;
}
export interface SmsReply {
  id: string;
  restaurantId: string | null;
  toPhoneE164: string;
  body: string;
  kind: "stop" | "stopall" | "info";
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
  specialCodes: SpecialCode[];
  spins: SpinResult[];
  challenges: Challenge[];
  savedLists: SavedList[];
  smsReplies: SmsReply[];
  ledger: LedgerEntry[];
  payments: Payment[];
  pushSubscriptions: PushSubscription[];
  audit: AuditEvent[];
  leads: Lead[];
  dataRequests: DataRequest[];
  rateLimitHits: RateLimitHit[];
  orders: Order[];
  referrals: Referral[];
  pairingCodes: PairingCode[];
  otpSendLog: OtpSendLogEntry[];
  providerEvents: ProviderEvent[];
  pinAttempts: PinAttempt[];
  pinLockouts: PinLockout[];
  onboarding: OnboardingChecklist[];
  pageVersions: PageVersion[];
}

export interface Repo {
  read(): DemoState;
  update(mutator: (state: DemoState) => DemoState): DemoState;
  write(state: DemoState): DemoState;
  reset(): DemoState;
  subscribe(listener: () => void): () => void;
}
