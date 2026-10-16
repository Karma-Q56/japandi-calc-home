export type RestaurantStatus = 'draft' | 'active' | 'paused' | 'closed';
export type Plan = 'starter' | 'managed' | 'partner' | 'custom';
export type DemoRole = 'guest' | 'staff' | 'owner' | 'operator';
export type ConsentPurpose = 'loyalty' | 'marketing_sms' | 'marketing_push';
export type ConsentAction = 'granted' | 'withdrawn';

export interface Theme {
  ink: string; paper: string; accent: string; accentSoft: string;
  stampFilled: string; stampEmpty: string; headingFont: string; bodyFont: string;
  radius: number; stampShape: 'circle' | 'square' | 'pixel-star' | 'coffee-cup' | 'croissant' | 'custom-svg';
  cardBackground: 'flat' | 'paper' | 'gradient' | 'photo'; logo?: string; tagline: string;
}
export interface Restaurant {
  id: string; slug: string; name: string; status: RestaurantStatus; plan: Plan; suburb: string;
  address?: string; hours: Record<string, { open: string; close: string } | null>;
  stampsRequired: number; rewardDescription: string; visitWindowMinutes: number; welcomeStamp: boolean;
  theme: Theme; pageConfig: { type: string; enabled: boolean }[]; menuSectionIds: string[];
  specialIds: string[]; createdAt: string; creditCents: number;
}
export interface StaffMember { id: string; restaurantId: string; displayName: string; active: boolean }
export interface MenuSection { id: string; restaurantId: string; name: string; sortOrder: number }
export interface MenuItem { id: string; restaurantId: string; sectionId: string; name: string; description: string; priceCents: number; available: boolean; sortOrder: number }
export interface Special { id: string; restaurantId: string; title: string; body: string; startsAt: string; endsAt: string; active: boolean }
export interface Customer { id: string; name: string; phoneE164: string; birthday?: string; memberCode: string; qrToken: string; deleted?: boolean }
export interface Membership {
  id: string; restaurantId: string; customerId: string; joinedAt: string; source: string;
  stampsCurrent: number; stampsTotal: number; lastVisitAt: string | null; welcomeStamp: boolean;
  marketingSms: boolean; marketingPush: boolean; lastSeenStamps: number;
}
export interface ConsentEvent { id: string; membershipId: string; purpose: ConsentPurpose; action: ConsentAction; wordingVersion: string; wordingText: string; source: string; createdAt: string }
export interface StampEvent { id: string; restaurantId: string; membershipId: string; createdAt: string; status: 'valid' | 'undone' }
export interface Reward { id: string; restaurantId: string; membershipId: string; description: string; earnedAt: string; redeemedAt?: string }
export interface Campaign { id: string; restaurantId: string; name: string; body: string; code: string; sentAt: string; recipients: number; delivered: number; failed: number }
export interface Message { id: string; restaurantId: string; customerId: string; body: string; segments: number; costCents: number; status: 'queued' | 'delivered' | 'failed'; createdAt: string; campaignCode?: string; expiresAt?: string }
export interface Redemption { id: string; restaurantId: string; membershipId: string; rewardId: string; redeemedAt: string }
export interface LedgerEntry { id: string; restaurantId: string; type: string; amountCents: number; reference: string; createdAt: string }
export interface Payment { id: string; restaurantId: string; amountCents: number; status: string; reference: string }
export interface PushSubscription { id: string; customerId: string; endpoint: string }
export interface AuditEvent { id: string; actor: string; action: string; restaurantId?: string; createdAt: string }
export interface Lead { id: string; restaurantName: string; phone: string }
export interface DataRequest { id: string; customerId: string; kind: 'deletion'; status: 'open' | 'done'; createdAt: string }
export interface RateLimitHit { bucket: string; key: string; createdAt: number }
export interface DemoSession { role: DemoRole; restaurantId?: string; customerId?: string; staffId?: string }
export interface DemoState {
  version: 2; now: number; session: DemoSession; restaurants: Restaurant[]; staff: StaffMember[];
  sections: MenuSection[]; items: MenuItem[]; specials: Special[]; customers: Customer[];
  memberships: Membership[]; consents: ConsentEvent[]; stamps: StampEvent[]; rewards: Reward[];
  campaigns: Campaign[]; messages: Message[]; redemptions: Redemption[]; ledger: LedgerEntry[];
  payments: Payment[]; pushSubscriptions: PushSubscription[]; audit: AuditEvent[]; leads: Lead[]; dataRequests: DataRequest[]; rateLimitHits: RateLimitHit[];
}

export interface Repo {
  read(): DemoState;
  write(state: DemoState): void;
  reset(): DemoState;
  subscribe(listener: () => void): () => void;
}
