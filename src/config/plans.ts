// Plan configuration
export type PlanTier = 'starter' | 'managed' | 'partner' | 'custom';

export interface Plan {
  id: PlanTier;
  name: string;
  minPrice: number; // ZAR cents
  maxPrice: number; // ZAR cents
  description: string;
  features: string[];
  monthlySmsIncluded: number | null; // null = not included
  maxCampaignsPerMonth: number | null; // null = unlimited
  managed: boolean; // Operator handles campaigns
}

export const PLANS: Record<PlanTier, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    minPrice: 29900, // R299
    maxPrice: 49900, // R499
    description: 'A little loyalty. A lot of possibility.',
    features: [
      'Your own digital stamp card',
      'QR sign-up, menu & specials',
      'Your regulars list & results',
      'Send your own SMS specials',
    ],
    monthlySmsIncluded: null,
    maxCampaignsPerMonth: null,
    managed: false,
  },
  managed: {
    id: 'managed',
    name: 'Growth',
    minPrice: 99900, // R999
    maxPrice: 180000, // R1,800
    description: 'You run the restaurant. We run the specials.',
    features: [
      'Everything in Starter',
      '4 campaigns a month, done for you',
      'Bring back customers you miss',
      'A monthly results report',
    ],
    monthlySmsIncluded: null,
    maxCampaignsPerMonth: 4,
    managed: true,
  },
  partner: {
    id: 'partner',
    name: 'Pro',
    minPrice: 250000, // R2,500
    maxPrice: 400000, // R4,000
    description: 'Your very own extra pair of hands.',
    features: [
      'Everything in Growth',
      'Weekly campaigns & birthday offers',
      'Multiple rewards & staff coaching',
      'Priority, hands-on support',
    ],
    monthlySmsIncluded: null,
    maxCampaignsPerMonth: null,
    managed: true,
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    minPrice: 0,
    maxPrice: 0,
    description: 'Tailored to your needs.',
    features: [],
    monthlySmsIncluded: null,
    maxCampaignsPerMonth: null,
    managed: false,
  },
};

// Get plan by ID
export function getPlan(id: PlanTier): Plan {
  const plan = PLANS[id];
  if (!plan) {
    throw new Error(`Unknown plan: ${id}`);
  }
  return plan;
}

// Setup fees (one-time, ZAR cents)
export const SETUP_FEES = {
  min: 100000, // R1,000
  max: 200000, // R2,000
};

// SMS cost estimate (ZAR cents)
export const SMS_COST_ESTIMATE = 35; // R0.35 per message

// Founding partner program
export const FOUNDING_PROGRAM = {
  spots: 3,
  discountMonths: 3,
  location: 'Johannesburg',
};
