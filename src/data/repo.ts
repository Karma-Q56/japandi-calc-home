import { createSeed } from './seed';
import type { DemoState, Repo } from './types';

// Bump the key when the demo seed changes shape, so browsers that still hold
// an older demo snapshot start from the current seed instead of stale data.
const STORAGE_KEY = 'patron-demo-v3';
function load(): DemoState {
  try {
    if (typeof window === 'undefined') return createSeed();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeed();
    const parsed = JSON.parse(raw) as DemoState;
    return parsed.version === 2
      ? { ...createSeed(parsed.now), ...parsed, rateLimitHits: parsed.rateLimitHits ?? [], pairingCodes: parsed.pairingCodes ?? [], otpSendLog: parsed.otpSendLog ?? [], pinAttempts: parsed.pinAttempts ?? [], pinLockouts: parsed.pinLockouts ?? [] }
      : createSeed();
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
  update: mutator => {
    current = mutator(current);
    try { if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* Keep the in-memory demo usable when storage is blocked or full. */ }
    notify();
    return current;
  },
  write: state => {
    current = state;
    try { if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Keep the in-memory demo usable when storage is blocked or full. */ }
    notify();
    return current;
  },
  subscribe: listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset: () => {
    current = createSeed();
    notify();
    return current;
  },
};
