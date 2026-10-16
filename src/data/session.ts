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

export function requireRole(...roles: DemoRole[]) {
  return (session: DemoSession) => roles.includes(session.role);
}
