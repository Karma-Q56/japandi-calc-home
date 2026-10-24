// Plan configuration and pricing
export interface Plan {
  name: string;
  min: number;
  max: number;
  description: string;
  features: string[];
}

export const plans: Plan[] = [
  {
    name: 'Starter',
    min: 299,
    max: 499,
    description: 'A little loyalty. A lot of possibility.',
    features: [
      'Your own digital stamp card',
      'QR sign-up, menu & specials',
      'Your regulars list & results',
      'Send your own SMS specials'
    ],
  },
  {
    name: 'Growth',
    min: 999,
    max: 1800,
    description: 'You run the restaurant. We run the specials.',
    features: [
      'Everything in Starter',
      '4 campaigns a month, done for you',
      'Bring back customers you miss',
      'A monthly results report'
    ],
  },
  {
    name: 'Pro',
    min: 2500,
    max: 4000,
    description: 'Your very own extra pair of hands.',
    features: [
      'Everything in Growth',
      'Weekly campaigns & birthday offers',
      'Multiple rewards & staff coaching',
      'Priority, hands-on support'
    ],
  },
];

// Single illustrative monthly fees used by the repeat-visit planner
export const plannerPlans = [
  { name: 'Starter', fee: 399 },
  { name: 'Growth', fee: 1200 },
  { name: 'Pro', fee: 3000 },
] as const;

export const plannerDefaults = {
  spend: 160,
  visits: 250,
  lift: 3,
  margin: 35,
  plan: 'Growth' as const,
};

export const commercial = {
  setupMin: 1000,
  setupMax: 2000,
  smsEstimate: 0.35,
  foundingSpots: 3,
  discountMonths: 3,
};
