export const brand = { name: 'patron', location: 'Johannesburg' };

export const plans = [
  { name: 'Starter', min: 299, max: 499, description: 'A little loyalty. A lot of possibility.', features: ['Your own digital stamp card', 'QR sign-up, menu & specials', 'Your regulars list & results', 'Send your own SMS specials'] },
  { name: 'Growth', min: 999, max: 1800, description: 'You run the restaurant. We run the specials.', features: ['Everything in Starter', '4 campaigns a month, done for you', 'Bring back customers you miss', 'A monthly results report'] },
  { name: 'Pro', min: 2500, max: 4000, description: 'Your very own extra pair of hands.', features: ['Everything in Growth', 'Weekly campaigns & birthday offers', 'Multiple rewards & staff coaching', 'Priority, hands-on support'] },
] as const;

export const commercial = { setupMin: 1000, setupMax: 2000, smsEstimate: 0.35, foundingSpots: 3, discountMonths: 3 };

export function estimateRegulars(spend: number, guests: number, returningPercent: number) {
  const visits = guests * (returningPercent / 100) * 4.33;
  const revenue = visits * spend;
  return { monthlyVisits: Math.round(visits), monthlyRevenue: Math.round(revenue), annualRevenue: Math.round(revenue * 12) };
}

export function rand(value: number) {
  return `R${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
}