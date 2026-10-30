import { describe, expect, it } from 'vitest';
import { commercial, estimateRegulars, plans } from '../lib/patron';

describe('regulars estimates', () => {
  it('matches the supplied R150, 300 guests, 8% example', () => {
    expect(estimateRegulars(150, 300, 8)).toEqual({ monthlyVisits: 104, monthlyRevenue: 15588, annualRevenue: 187056 });
  });
  it('does not project revenue without extra returning guests', () => {
    expect(estimateRegulars(150, 300, 0)).toEqual({ monthlyVisits: 0, monthlyRevenue: 0, annualRevenue: 0 });
  });
});

describe('proposed commercial terms', () => {
  it('keeps Starter at R299–R499', () => { expect([plans[0].min, plans[0].max]).toEqual([299, 499]); });
  it('keeps Growth at R999–R1800', () => { expect([plans[1].min, plans[1].max]).toEqual([999, 1800]); });
  it('keeps Pro at R2500–R4000', () => { expect([plans[2].min, plans[2].max]).toEqual([2500, 4000]); });
  it('keeps setup at R1000–R2000', () => { expect([commercial.setupMin, commercial.setupMax]).toEqual([1000, 2000]); });
  it('keeps the prepaid SMS estimate at R0.35', () => { expect(commercial.smsEstimate).toBe(0.35); });
  it('limits the founding offer to three restaurants', () => { expect(commercial.foundingSpots).toBe(3); });
  it('keeps the founding monthly discount to three months', () => { expect(commercial.discountMonths).toBe(3); });
});