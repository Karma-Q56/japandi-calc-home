import { createFileRoute, Link } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import { demoRepo } from '@/data/repo';
import { setDemoSession } from '@/data/session';
import type { DemoSession } from '@/data/types';
import { APP_NAME } from '@/config/app';

export const Route = createFileRoute('/demo')({ component: DemoHub });

function DemoHub() {
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const cafe = state.restaurants[0]!;
  const testCases: { label: string; description: string; to: string; session: DemoSession }[] = [
    { label: 'Join as a new guest', description: 'Open the demo join flow for The Daily Grind.', to: '/r/daily-grind/join', session: { role: 'guest', restaurantId: cafe.id } },
    { label: 'My cards as Thandi', description: 'See loyalty cards linked to one guest.', to: '/me', session: { role: 'guest', customerId: state.customers[0]!.id } },
    { label: 'Staff till · The Daily Grind', description: 'Open a staff workspace for stamp actions.', to: '/stamp', session: { role: 'staff', restaurantId: cafe.id, staffId: state.staff[0]!.id } },
    { label: 'Owner dashboard · The Daily Grind', description: 'View the venue dashboard.', to: '/app', session: { role: 'owner', restaurantId: cafe.id } },
    { label: 'Operator console', description: 'Manage demo restaurants, themes and menus.', to: '/ops/restaurants', session: { role: 'operator' } },
    { label: 'SMS outbox', description: 'Inspect demo messages and simulate delivery.', to: '/demo/outbox', session: { role: 'operator' } },
  ];
  return <main className="demo-hub page-width"><p className="eyebrow"><span className="eyebrow-line"/>Product preview · Demo data</p><h1>Try {APP_NAME}.</h1><p className="demo-intro">Choose a demo tunnel. There’s no login, database or real SMS in this preview.</p><div className="demo-tunnel-grid">{testCases.map(item=><Link key={item.label} to={item.to} onClick={()=>setDemoSession(item.session)} className="demo-tunnel"><strong>{item.label}</strong><span>{item.description}</span><small>Open preview →</small></Link>)}</div><p className="demo-data-note">Everything here is fictional demo data stored in this browser.</p></main>;
}
