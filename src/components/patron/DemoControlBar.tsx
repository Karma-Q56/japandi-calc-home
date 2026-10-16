import { useState, useSyncExternalStore } from 'react';
import { Link } from '@tanstack/react-router';
import { demoRepo, updateDemo } from '@/data/repo';
import { clock } from '@/lib/clock';
import type { DemoRole } from '@/data/types';

export function DemoControlBar() {
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const [open, setOpen] = useState(false);
  if (import.meta.env.PROD && new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('demo') !== '1') return null;
  return <aside className="demo-control" aria-label="Demo controls">
    <button className="demo-control-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open}>Demo · {state.session.role} · {state.restaurants.find(item => item.id === state.session.restaurantId)?.name ?? 'Choose a venue'}</button>
    {open && <div className="demo-control-panel">
      <label>Role<select value={state.session.role} onChange={event => updateDemo(current => ({ ...current, session: { ...current.session, role: event.target.value as DemoRole } }))}>{(['guest','staff','owner','operator'] as DemoRole[]).map(role => <option key={role}>{role}</option>)}</select></label>
      <label>Restaurant<select value={state.session.restaurantId ?? ''} onChange={event => updateDemo(current => { const { restaurantId: _old, ...session } = current.session; return { ...current, session: event.target.value ? { ...session, restaurantId: event.target.value } : session }; })}><option value="">Choose…</option>{state.restaurants.map(restaurant => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select></label>
      <label>Guest<select value={state.session.customerId ?? ''} onChange={event => updateDemo(current => { const { customerId: _old, ...session } = current.session; return { ...current, session: event.target.value ? { ...session, customerId: event.target.value } : session }; })}><option value="">Choose…</option>{state.customers.slice(0,12).map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <div className="demo-clock-buttons">{[[3600000,'+1 hour'],[86400000,'+1 day'],[604800000,'+7 days'],[2592000000,'+30 days']].map(([ms,label])=><button key={label} onClick={()=>clock.advance(Number(ms))}>{label}</button>)}<button onClick={()=>clock.reset()}>Reset clock</button></div>
      <div className="demo-control-actions"><button onClick={()=>demoRepo.reset()}>Reset demo data</button><Link to="/demo/outbox">Open outbox</Link><Link to="/demo">Demo hub</Link></div>
    </div>}
  </aside>;
}
