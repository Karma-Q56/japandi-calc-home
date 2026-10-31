import { siteDetails } from "@/config/site-details";

export const brand = { name: 'patron', location: siteDetails.location.split(',')[0] ?? 'Johannesburg' };

// Kept for older imports. The source of truth is src/config/site-details.ts.
export const contact = { whatsappNumber: siteDetails.whatsappNumber };

export const plans = [
  { name: 'Starter', min: 299, max: 499, description: 'A little loyalty. A lot of possibility.', features: ['Your own digital stamp card', 'QR sign-up, menu & specials', 'Your regulars list & results', 'Send your own SMS specials'] },
  { name: 'Growth', min: 999, max: 1800, description: 'You run the restaurant. We run the specials.', features: ['Everything in Starter', '4 campaigns a month, done for you', 'Bring back customers you miss', 'A monthly results report'] },
  { name: 'Pro', min: 2500, max: 4000, description: 'Your very own extra pair of hands.', features: ['Everything in Growth', 'Weekly campaigns & birthday offers', 'Multiple rewards & staff coaching', 'Priority, hands-on support'] },
] as const;

/** Single illustrative monthly fees used by the repeat-visit planner. */
export const plannerPlans = [
  { name: 'Starter', fee: 399 },
  { name: 'Growth', fee: 1200 },
  { name: 'Pro', fee: 3000 },
] as const;

export const plannerDefaults = { spend: 160, visits: 250, lift: 3, margin: 35, plan: 'Growth' as const };

export const commercial = { setupMin: 1000, setupMax: 2000, smsEstimate: 0.35, foundingSpots: 3, discountMonths: 3 };

export const WEEKS_PER_MONTH = 4.333;

export function estimateRegulars(spend: number, guests: number, returningPercent: number) {
  const visits = guests * (returningPercent / 100) * 4.33;
  const revenue = visits * spend;
  return { monthlyVisits: Math.round(visits), monthlyRevenue: Math.round(revenue), annualRevenue: Math.round(revenue * 12) };
}

export function planRepeatVisits(input: { spend: number; visits: number; lift: number; margin: number; fee: number }) {
  const { spend, visits, lift, margin, fee } = input;
  const extraPerWeek = visits * (lift / 100);
  const extraPerMonth = extraPerWeek * WEEKS_PER_MONTH;
  const sales = extraPerMonth * spend;
  const contribution = sales * (margin / 100);
  const afterFee = contribution - fee;
  const perVisitContribution = spend * (margin / 100);
  const breakEvenPerWeek = perVisitContribution > 0 ? fee / perVisitContribution / WEEKS_PER_MONTH : null;
  return { extraPerWeek, extraPerMonth, sales, contribution, afterFee, breakEvenPerWeek };
}

/** South African rand, comma thousands: R1,299. Negative shown as −R620. */
export function rand(value: number) {
  const rounded = Math.round(Math.abs(value));
  const text = `R${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  return value < 0 && rounded > 0 ? `−${text}` : text;
}

export function whatsappLink(message: string) {
  const base = `https://wa.me/${siteDetails.whatsappNumber}`;
  return `${base}?text=${encodeURIComponent(message)}`;
}
