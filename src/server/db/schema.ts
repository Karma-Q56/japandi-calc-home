// Database schema definitions for Drizzle ORM
// This file contains the Drizzle schema that mirrors db/schema.sql

import {
  pgTable,
  pgSchema,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  date,
  pgEnum,
  primaryKey,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';

// Custom type for UUID generation
const uuidWithDefault = customType<{ data: string; driverData: string; notNull: true }>({
  dataType() {
    return 'uuid';
  },
  toDriver(value: string): string {
    return value;
  },
  fromDriver(value: string): string {
    return value;
  },
});

// ============================================================================
// Enums
// ============================================================================

export const restaurantStatus = pgEnum('restaurant_status', ['draft', 'active', 'paused', 'closed']);
export const planTier = pgEnum('plan_tier', ['starter', 'managed', 'partner', 'custom']);
export const marketingStatus = pgEnum('marketing_status', ['not_opted_in', 'opted_in', 'opted_out']);
export const consentPurpose = pgEnum('consent_purpose', ['loyalty', 'marketing_sms', 'marketing_push']);
export const consentAction = pgEnum('consent_action', ['granted', 'withdrawn']);
export const stampStatus = pgEnum('stamp_status', ['valid', 'undone']);
export const rewardStatus = pgEnum('reward_status', ['available', 'redeemed', 'void']);
export const campaignStatus = pgEnum('campaign_status', ['draft', 'pending_approval', 'scheduled', 'sending', 'sent', 'cancelled', 'failed']);
export const campaignChannel = pgEnum('campaign_channel', ['sms', 'push', 'both']);
export const messageChannel = pgEnum('message_channel', ['sms', 'push']);
export const messageStatus = pgEnum('message_status', ['queued', 'sending', 'sent', 'delivered', 'failed', 'skipped']);
export const ledgerEntryType = pgEnum('ledger_entry_type', ['topup', 'reserve', 'release', 'charge', 'refund', 'adjustment']);
export const paymentKind = pgEnum('payment_kind', ['setup', 'subscription', 'topup']);
export const paymentStatus = pgEnum('payment_status', ['pending', 'confirmed', 'rejected']);
export const leadStatus = pgEnum('lead_status', [
  'new',
  'contacted',
  'demo_booked',
  'won',
  'lost',
  'replied',
  'closed',
]);

// ============================================================================
// Tables
// ============================================================================

// Restaurant
export const restaurant = pgTable('restaurant', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: text('organization_id').unique(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  status: restaurantStatus('status').notNull().default('draft'),
  plan: planTier('plan').notNull().default('starter'),
  suburb: text('suburb'),
  city: text('city').notNull().default('Johannesburg'),
  publicListed: boolean('public_listed').notNull().default(false),
  logoUrl: text('logo_url'),
  theme: jsonb('theme').notNull().default({}),
  contact: jsonb('contact').notNull().default({}),
  hours: jsonb('hours').notNull().default({}),
  visitWindowMinutes: integer('visit_window_minutes').notNull().default(240),
  stampsRequired: integer('stamps_required').notNull().default(8),
  welcomeStamp: boolean('welcome_stamp').notNull().default(false),
  welcomeStamps: integer('welcome_stamps').notNull().default(0),
  pageTemplate: text('page_template').notNull().default('classic'),
  tiers: jsonb('tiers').notNull().default({ regular: 3, vip: 8 }),
  mysteryEveryVisits: integer('mystery_every_visits').notNull().default(0),
  birthdayReward: boolean('birthday_reward').notNull().default(false),
  spin: jsonb('spin').notNull().default({}),
  rewardDescription: text('reward_description').notNull().default('A free item on us'),
  marketingWeeklyCap: integer('marketing_weekly_cap').notNull().default(3),
  memberWeeklyCap: integer('member_weekly_cap').notNull().default(2),
  smsSenderName: text('sms_sender_name'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

// Staff Member
export const staffMember = pgTable('staff_member', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  pinHmac: text('pin_hmac').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    restaurantPinUnique: uniqueIndex('staff_member_restaurant_pin_unique').on(table.restaurantId, table.pinHmac),
  };
});

// Menu Section
export const menuSection = pgTable('menu_section', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// Menu Item
export const menuItem = pgTable('menu_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  sectionId: uuid('section_id').references(() => menuSection.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  priceCents: integer('price_cents'),
  available: boolean('available').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

// Special
export const special = pgTable('special', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body'),
  startsAt: timestamp('starts_at', { mode: 'date' }),
  endsAt: timestamp('ends_at', { mode: 'date' }),
  active: boolean('active').notNull().default(true),
  kind: text('kind').notNull().default('public'),
  code: text('code'),
  minTier: text('min_tier'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// Offer: merged Specials and Campaigns. Old special and campaign rows stay as read-only history.
export const offer = pgTable('offer', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  kind: text('kind').notNull().default('public'),
  code: text('code'),
  minTier: text('min_tier'),
  validFrom: timestamp('valid_from', { mode: 'date' }),
  validTo: timestamp('valid_to', { mode: 'date' }),
  active: boolean('active').notNull().default(true),
  placementPage: boolean('placement_page').notNull().default(true),
  placementTill: boolean('placement_till').notNull().default(false),
  placementPush: boolean('placement_push').notNull().default(false),
  placementSms: boolean('placement_sms').notNull().default(false),
  audience: jsonb('audience'),
  status: text('status').notNull().default('live'),
  legacySpecialId: uuid('legacy_special_id'),
  legacyCampaignId: uuid('legacy_campaign_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// Customer
export const customer = pgTable('customer', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique(),
  phoneE164: text('phone_e164').notNull().unique(),
  name: text('name').notNull(),
  birthday: date('birthday'),
  qrToken: text('qr_token').notNull().unique(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  erasedAt: timestamp('erased_at', { mode: 'date' }),
});

// Membership
export const membership = pgTable('membership', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customer.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { mode: 'date' }).notNull().defaultNow(),
  source: text('source').notNull().default('qr'),
  stampsCurrent: integer('stamps_current').notNull().default(0),
  stampsTotal: integer('stamps_total').notNull().default(0),
  rewardsEarned: integer('rewards_earned').notNull().default(0),
  lastVisitAt: timestamp('last_visit_at', { mode: 'date' }),
  marketingSms: marketingStatus('marketing_sms').notNull().default('not_opted_in'),
  marketingPush: marketingStatus('marketing_push').notNull().default('not_opted_in'),
}, (table) => {
  return {
    restaurantCustomerUnique: uniqueIndex('membership_restaurant_customer_unique').on(table.restaurantId, table.customerId),
  };
});

// Consent Event
export const consentEvent = pgTable('consent_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  membershipId: uuid('membership_id').notNull().references(() => membership.id, { onDelete: 'cascade' }),
  purpose: consentPurpose('purpose').notNull(),
  action: consentAction('action').notNull(),
  wordingVersion: text('wording_version').notNull(),
  wordingText: text('wording_text').notNull(),
  source: text('source').notNull(),
  ipHash: text('ip_hash'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// Stamp Event
export const stampEvent = pgTable('stamp_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  membershipId: uuid('membership_id').notNull().references(() => membership.id, { onDelete: 'cascade' }),
  staffId: uuid('staff_id').references(() => staffMember.id),
  status: stampStatus('status').notNull().default('valid'),
  reason: text('reason').notNull().default('visit'),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  undoneAt: timestamp('undone_at', { mode: 'date' }),
  undoneBy: text('undone_by'),
  undoReason: text('undo_reason'),
}, (table) => {
  return {
    restaurantIdempotencyUnique: uniqueIndex('stamp_event_restaurant_idempotency_unique').on(table.restaurantId, table.idempotencyKey),
  };
});

// Reward
export const reward = pgTable('reward', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  membershipId: uuid('membership_id').notNull().references(() => membership.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  status: rewardStatus('status').notNull().default('available'),
  earnedAt: timestamp('earned_at', { mode: 'date' }).notNull().defaultNow(),
  redeemedAt: timestamp('redeemed_at', { mode: 'date' }),
  redeemedByStaff: uuid('redeemed_by_staff').references(() => staffMember.id),
});

// Payment
export const payment = pgTable('payment', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  kind: paymentKind('kind').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: paymentStatus('status').notNull().default('pending'),
  reference: text('reference').notNull().unique(),
  provider: text('provider').notNull().default('manual_eft'),
  providerRef: text('provider_ref'),
  requestedBy: text('requested_by'),
  confirmedBy: text('confirmed_by'),
  confirmedAt: timestamp('confirmed_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// Campaign
export const campaign = pgTable('campaign', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  messageBody: text('message_body').notNull(),
  channel: campaignChannel('channel').notNull().default('sms'),
  audience: jsonb('audience').notNull(),
  code: text('code').notNull(),
  validFrom: timestamp('valid_from', { mode: 'date' }),
  validTo: timestamp('valid_to', { mode: 'date' }),
  status: campaignStatus('status').notNull().default('draft'),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { mode: 'date' }),
  scheduledAt: timestamp('scheduled_at', { mode: 'date' }),
  estRecipients: integer('est_recipients'),
  estSegments: integer('est_segments'),
  estCostCents: integer('est_cost_cents'),
  actualCostCents: integer('actual_cost_cents').notNull().default(0),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { mode: 'date' }),
}, (table) => {
  return {
    restaurantCodeUnique: uniqueIndex('campaign_restaurant_code_unique').on(table.restaurantId, table.code),
  };
});

// Message
export const message = pgTable('message', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaign.id, { onDelete: 'cascade' }),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  membershipId: uuid('membership_id').notNull().references(() => membership.id, { onDelete: 'cascade' }),
  channel: messageChannel('channel').notNull(),
  status: messageStatus('status').notNull().default('queued'),
  segments: integer('segments').notNull().default(1),
  costCents: integer('cost_cents').notNull().default(0),
  provider: text('provider'),
  providerMessageId: text('provider_message_id'),
  errorCode: text('error_code'),
  attempts: integer('attempts').notNull().default(0),
  queuedAt: timestamp('queued_at', { mode: 'date' }).notNull().defaultNow(),
  lastAttemptAt: timestamp('last_attempt_at', { mode: 'date' }),
  sentAt: timestamp('sent_at', { mode: 'date' }),
  deliveredAt: timestamp('delivered_at', { mode: 'date' }),
}, (table) => {
  return {
    campaignMembershipChannelUnique: uniqueIndex('message_campaign_membership_channel_unique').on(
      table.campaignId,
      table.membershipId,
      table.channel,
    ),
  };
});

// Redemption
export const redemption = pgTable('redemption', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').references(() => campaign.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('campaign'),
  specialId: uuid('special_id').references(() => special.id, { onDelete: 'set null' }),
  specialCodeId: uuid('special_code_id'),
  code: text('code'),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  membershipId: uuid('membership_id').notNull().references(() => membership.id, { onDelete: 'cascade' }),
  staffId: uuid('staff_id').references(() => staffMember.id),
  stampEventId: uuid('stamp_event_id').references(() => stampEvent.id),
  redeemedAt: timestamp('redeemed_at', { mode: 'date' }).notNull().defaultNow(),
  reversedAt: timestamp('reversed_at', { mode: 'date' }),
}, (table) => {
  return {
    campaignMembershipUnique: uniqueIndex('redemption_campaign_membership_unique').on(
      table.campaignId,
      table.membershipId,
    ),
  };
});

// Personal single-use codes for targeted specials
export const specialCode = pgTable('special_code', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  specialId: uuid('special_id').notNull().references(() => special.id, { onDelete: 'cascade' }),
  membershipId: uuid('membership_id').notNull().references(() => membership.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  issuedAt: timestamp('issued_at', { mode: 'date' }).notNull().defaultNow(),
  redeemedAt: timestamp('redeemed_at', { mode: 'date' }),
  redeemedBy: text('redeemed_by'),
}, (table) => {
  return {
    membershipSpecialUnique: uniqueIndex('special_code_special_membership_unique').on(table.specialId, table.membershipId),
    restaurantCodeUnique: uniqueIndex('special_code_restaurant_code_unique').on(table.restaurantId, table.code),
  };
});

// Saved guest lists for campaigns
export const savedList = pgTable('saved_list', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  membershipIds: jsonb('membership_ids').notNull().default([]),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

// Spin results (server-chosen)
export const spinResult = pgTable('spin_result', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  membershipId: uuid('membership_id').notNull().references(() => membership.id, { onDelete: 'cascade' }),
  segmentId: text('segment_id').notNull(),
  label: text('label').notNull(),
  valueCents: integer('value_cents').notNull().default(0),
  wonAt: timestamp('won_at', { mode: 'date' }).notNull().defaultNow(),
  prizeSpecialId: uuid('prize_special_id').references(() => special.id, { onDelete: 'set null' }),
});

// Visit challenges
export const challenge = pgTable('challenge', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  visits: integer('visits').notNull(),
  windowDays: integer('window_days').notNull(),
  bonusStamps: integer('bonus_stamps').notNull().default(1),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// Credit Ledger
export const creditLedger = pgTable('credit_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurant.id, { onDelete: 'cascade' }),
  entryType: ledgerEntryType('entry_type').notNull(),
  amountCents: integer('amount_cents').notNull(),
  reference: text('reference').notNull().unique(),
  campaignId: uuid('campaign_id').references(() => campaign.id),
  messageId: uuid('message_id').references(() => message.id),
  paymentId: uuid('payment_id').references(() => payment.id),
  note: text('note'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// Push Subscription
export const pushSubscription = pgTable('push_subscription', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customer.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  lastSuccessAt: timestamp('last_success_at', { mode: 'date' }),
  disabledAt: timestamp('disabled_at', { mode: 'date' }),
});

// Lead
export const lead = pgTable('lead', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull(),
  kind: text('kind').notNull(),
  restaurantName: text('restaurant_name').notNull(),
  contactName: text('contact_name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  role: text('role'),
  venueType: text('venue_type'),
  suburb: text('suburb'),
  quietTime: text('quiet_time'),
  weeklyGuests: text('weekly_guests'),
  planInterest: text('plan_interest'),
  consent: boolean('consent').notNull(),
  consentVersion: text('consent_version').notNull(),
  calculator: jsonb('calculator'),
  status: leadStatus('status').notNull().default('new'),
  notes: text('notes'),
  visitWanted: boolean('visit_wanted'),
  preferredDay: text('preferred_day'),
  consentAt: timestamp('consent_at', { mode: 'date' }),
  adminNotes: text('admin_notes'),
  repliedAt: timestamp('replied_at', { mode: 'date' }),
  closedAt: timestamp('closed_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// Data Request
export const dataRequest = pgTable('data_request', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').references(() => customer.id, { onDelete: 'set null' }),
  restaurantId: uuid('restaurant_id').references(() => restaurant.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { mode: 'date' }),
  resolvedBy: text('resolved_by'),
  notes: text('notes'),
});

// Provider Event
export const providerEvent = pgTable('provider_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { mode: 'date' }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { mode: 'date' }),
}, (table) => {
  return {
    providerEventUnique: uniqueIndex('provider_event_provider_event_unique').on(
      table.provider,
      table.eventId,
    ),
  };
});

// OTP Send Log
export const otpSendLog = pgTable('otp_send_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  phoneHash: text('phone_hash').notNull(),
  ipHash: text('ip_hash'),
  provider: text('provider'),
  providerMessageId: text('provider_message_id'),
  costCents: integer('cost_cents'),
  status: text('status'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// Rate Limit Hit

export const rateLimitHit = pgTable('rate_limit_hit', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  bucket: text('bucket').notNull(),
  key: text('key').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// Audit Event
export const auditEvent = pgTable('audit_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id'),
  restaurantId: uuid('restaurant_id').references(() => restaurant.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  objectType: text('object_type'),
  objectId: text('object_id'),
  meta: jsonb('meta').notNull().default({}),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// One Time Code
export const oneTimeCode = pgTable('one_time_code', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  restaurantId: uuid('restaurant_id').references(() => restaurant.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customer.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// ============================================================================
// Schema Export
// ============================================================================

export const schema = {
  restaurant,
  staffMember,
  menuSection,
  menuItem,
  special,
  customer,
  membership,
  consentEvent,
  stampEvent,
  reward,
  payment,
  campaign,
  message,
  redemption,
  specialCode,
  savedList,
  spinResult,
  challenge,
  creditLedger,
  pushSubscription,
  lead,
  dataRequest,
  providerEvent,
  otpSendLog,
  rateLimitHit,
  auditEvent,
  oneTimeCode,
};

export type Database = typeof schema;
