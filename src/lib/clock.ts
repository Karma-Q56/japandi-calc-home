import { demoRepo } from '@/data/repo';
import { updateDemo } from '@/data/repo';

export const clock = {
  now: () => demoRepo.read().now,
  advance: (milliseconds: number) => updateDemo(state => ({ ...state, now: state.now + milliseconds })).now,
  reset: () => updateDemo(state => ({ ...state, now: Date.now() })).now,
};
