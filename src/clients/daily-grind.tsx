import type { ReactNode } from 'react';

export function DailyGrindHero({ name, tagline, join }: { name: string; tagline: string; join: ReactNode }) {
  return <section className="daily-grind-hero"><span className="daily-grind-mark">the daily grind.</span><p>YOUR NEIGHBOURHOOD COFFEE RITUAL</p><h1>Good coffee.<br/><em>Familiar faces.</em></h1><p>{tagline}</p>{join}<small>{name} · Parkhurst</small></section>;
}

export function DailyGrindStamp({ filled }: { filled: boolean }) {
  return <span className={`daily-stamp ${filled?'earned':''}`} aria-label={filled?'Stamp earned':'Stamp available'}>{filled?'☕':'·'}</span>;
}
