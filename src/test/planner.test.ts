import { describe, expect, it } from 'vitest';
import { planRepeatVisits, rand } from '../lib/patron';

describe('repeat-visit planner', () => {
  const r = planRepeatVisits({ spend: 160, visits: 250, lift: 3, margin: 35, fee: 1200 });
  it('gives 7.5 extra visits a week', () => { expect(r.extraPerWeek).toBeCloseTo(7.5, 5); });
  it('gives about 32.5 extra visits a month', () => { expect(r.extraPerMonth.toFixed(1)).toBe('32.5'); });
  it('gives R5,200 extra sales', () => { expect(rand(r.sales)).toBe('R5,200'); });
  it('gives R1,820 contribution', () => { expect(rand(r.contribution)).toBe('R1,820'); });
  it('gives R620 after the Growth fee', () => { expect(rand(r.afterFee)).toBe('R620'); });
  it('breaks even at about 4.9 visits a week', () => { expect(r.breakEvenPerWeek!.toFixed(1)).toBe('4.9'); });
  it('does not divide by zero at 0% margin', () => { expect(planRepeatVisits({ spend: 160, visits: 250, lift: 3, margin: 0, fee: 1200 }).breakEvenPerWeek).toBeNull(); });
});
