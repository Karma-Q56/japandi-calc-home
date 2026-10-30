import { useSyncExternalStore } from 'react';
import { demoRepo, updateDemo } from './repo';
import type { DemoRole, DemoSession } from './types';

export function useDemoSession() {
  const session = useSyncExternalStore(demoRepo.subscribe, () => demoRepo.read().session, () => demoRepo.read().session);
  return session;
}

export function setDemoSession(session: DemoSession) {
  updateDemo(state => ({ ...state, session }));
}

/**
 * Demo sessions live in the browser (localStorage), so the server cannot know the role.
 * Guards therefore only run in the browser; on the server they let the request through
 * and the client decides after hydration. M9 replaces this with real session checks.
 */
export function requireRole(...roles: DemoRole[]) {
  return (session: DemoSession) => typeof window === 'undefined' || roles.includes(session.role);
}
