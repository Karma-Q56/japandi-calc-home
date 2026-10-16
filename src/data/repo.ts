import { createSeed } from './seed';
import type { DemoState, Repo } from './types';

const STORAGE_KEY = 'patron-demo-v2';
function load(): DemoState {
  try {
    if (typeof window === 'undefined') return createSeed();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeed();
    const parsed = JSON.parse(raw) as DemoState;
    return parsed.version === 2 ? { ...createSeed(parsed.now), ...parsed, rateLimitHits: parsed.rateLimitHits ?? [] } : createSeed();
  } catch { return createSeed(); }
}

let current = load();
const listeners = new Set<() => void>();
function notify() { listeners.forEach(listener => listener()); }
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    current = load();
    notify();
  });
}

export const demoRepo: Repo = {
  read: () => current,
  write: state => {
    current = state;
    try { if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Keep the in-memory demo usable when storage is blocked or full. */ }
    notify();
  },
  reset: () => { current = createSeed(); try { if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* Memory remains the fallback. */ } notify(); return current; },
  subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
};

export function updateDemo(mutator: (state: DemoState) => DemoState) {
  demoRepo.write(mutator(demoRepo.read()));
  return demoRepo.read();
}
