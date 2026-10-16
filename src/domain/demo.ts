import { createSeed } from '@/data/seed';
import { demoRepo, updateDemo } from '@/data/repo';
import type { DemoRole, DemoSession } from '@/data/types';

export const demo = {
  state: () => demoRepo.read(),
  reset: () => demoRepo.reset(),
  session: (session: DemoSession) => updateDemo(state => ({ ...state, session })),
  roleCanAccess: (role: DemoRole, allowed: DemoRole[]) => allowed.includes(role),
  seedCounts: () => { const state = demoRepo.read(); return { restaurants: state.restaurants.length, customers: state.customers.length, memberships: state.memberships.length, stamps: state.stamps.length, lapsedMemberships: state.memberships.filter(m => m.lastVisitAt && state.now - new Date(m.lastVisitAt).getTime() >= 30 * 86400000).length, multiRestaurantGuests: state.customers.filter(c => state.memberships.filter(m => m.customerId === c.id).length > 1).length }; },
  freshSeed: () => createSeed(),
};

export type ApiError = { code: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'RATE_LIMITED' | 'UNKNOWN'; message: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export const success = <T>(data: T): ApiResult<T> => ({ ok: true, data });
export const failure = <T = never>(code: ApiError['code'], message: string): ApiResult<T> => ({ ok: false, error: { code, message } });
