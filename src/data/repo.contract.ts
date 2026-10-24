import type { Repo } from './types';

export function repoContract(name: string, create: () => Repo) {
  describe(`${name} Repo contract`, () => {
    it('persists writes and restores the deterministic seed on reset', () => {
      const repo = create();
      const original = repo.read();
      repo.write({ ...original, session: { role: 'staff' } });
      expect(repo.read().session.role).toBe('staff');
      const reset = repo.reset();
      expect(reset.restaurants.map(item => item.slug)).toEqual(['daily-grind', 'sunrise-bakes', 'oak-table']);
      expect(reset.session.role).toBe('operator');
    });
    it('publishes writes to subscribers', () => {
      const repo = create();
      const listener = vi.fn();
      const unsubscribe = repo.subscribe(listener);
      repo.write(repo.read());
      expect(listener).toHaveBeenCalledOnce();
      unsubscribe();
    });
  });
}
