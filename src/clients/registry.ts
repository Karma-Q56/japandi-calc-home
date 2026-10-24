import type { Theme } from '@/data/types';

export interface ClientOverrides { theme?: Theme; publicPage?: 'daily-grind'; card?: 'daily-grind'; stampAnimation?: 'daily-grind' }
export const clientRegistry: Record<string, ClientOverrides> = {
  'daily-grind': { publicPage: 'daily-grind', card: 'daily-grind', stampAnimation: 'daily-grind' },
};

export function can(plan: string, feature: 'blockEditor' | 'codeOverrides') {
  if (feature === 'blockEditor') return ['managed', 'partner', 'custom'].includes(plan);
  return plan === 'custom';
}
