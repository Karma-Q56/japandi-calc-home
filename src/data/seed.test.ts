import { describe, expect, it } from 'vitest';
import { createSeed } from './seed';
import { demoRepo } from './repo';
import { repoContract } from './repo.contract';
import { clock } from '@/lib/clock';
import { demo } from '@/domain/demo';
import { fakeSmsProvider } from '@/domain/sms';

describe('M0 deterministic demo seed', () => {
  it('includes three different venues and at least sixty members', () => {
    const state = createSeed();
    expect(state.restaurants.map(item => item.stampsRequired)).toEqual([8, 6, 10]);
    expect(state.customers).toHaveLength(60);
    expect(state.memberships.length).toBeGreaterThanOrEqual(60);
    expect(state.stamps.length).toBeGreaterThanOrEqual(150);
    expect(state.rewards.some(item => item.redeemedAt)).toBe(true);
    expect(state.campaigns.length).toBeGreaterThanOrEqual(2);
    expect(state.ledger.length).toBeGreaterThanOrEqual(1);
  });
  it('has a lapsed group and guests who joined multiple venues', () => {
    const state = createSeed();
    expect(state.memberships.some(item => state.now - new Date(item.lastVisitAt ?? 0).getTime() > 30 * 86400000)).toBe(true);
    expect(state.customers.some(customer => state.memberships.filter(item => item.customerId === customer.id).length > 1)).toBe(true);
  });
  it('uses obvious fictional South African mobile numbers', () => {
    expect(createSeed().customers.every(item => /^\+278255501\d{2}$/.test(item.phoneE164))).toBe(true);
  });
  it('advances and resets the shared demo clock', () => {
    const original = clock.now();
    expect(clock.advance(30 * 86400000)).toBe(original + 30 * 86400000);
    expect(demo.seedCounts().lapsedMemberships).toBeGreaterThan(0);
    expect(clock.reset()).toBe(Date.UTC(2026, 9, 1, 8));
  });
  it('limits route access to the role in the demo session', () => {
    expect(demo.roleCanAccess('staff', ['staff'])).toBe(true);
    expect(demo.roleCanAccess('staff', ['owner', 'operator'])).toBe(false);
  });
  it('records only fake SMS and can simulate delivery and STOP', () => {
    const state = demoRepo.reset();
    const queued = fakeSmsProvider.send({ restaurantId: state.restaurants[0]!.id, customerId: state.customers[0]!.id, body: 'Demo message' });
    expect(queued.status).toBe('queued');
    expect(queued.costCents).toBeGreaterThan(0);
    expect(['delivered', 'failed']).toContain(fakeSmsProvider.simulateDelivery(queued.id));
    expect(fakeSmsProvider.replyStop(state.customers[0]!.id, state.restaurants[0]!.id)).not.toBeNull();
    expect(demoRepo.read().consents.some(event => event.source === 'sms_reply')).toBe(true);
  });
});

repoContract('Demo', () => ({
  read: () => demoRepo.read(), write: state => demoRepo.write(state), reset: () => demoRepo.reset(), subscribe: listener => demoRepo.subscribe(listener),
}));
