import { useEffect, useState } from 'react';
import { Check, Coffee, Heart, Star } from 'lucide-react';
import dish from '@/assets/dish.jpg';
import { commercial } from '@/lib/patron';
import { prefersReducedMotion, useCountUp, useInViewOnce } from './motion';

const menu = [
  ['Your guest list', 'Everyone who joined, when they last visited, and who you haven’t seen in a while.'],
  ['Stamp cards', 'A digital card on their phone. Staff confirm every stamp.'],
  ['Messages that fill tables', 'Thoughtful SMS specials, only to guests who opted in.'],
  ['Quiet-day offers', 'Ready-made ideas for your slowest day of the week.'],
  ['Simple results', 'Who came back and which specials worked, in plain numbers.'],
  ['Menu and specials page', 'One QR code for your menu, specials and sign-up.'],
];

export function MenuSection() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  return <section className="section page-width menu-section" id="menu">
    <div className="menu-layout">
      <div>
        <div data-reveal><div className="eyebrow"><span className="eyebrow-line" />On the menu</div>
        <h2 className="section-heading">What you <span className="editorial">get.</span></h2></div>
        <div ref={ref} className={`menu-list ${seen ? 'is-drawn' : ''}`}>
          {menu.map(([name, desc], i) => <div className="menu-item" key={name} style={{ '--i': i } as React.CSSProperties}>
            <div className="menu-item-top"><span className="menu-name">{name}</span><span className="menu-leader" aria-hidden="true" /><Star className="menu-star" aria-hidden="true" /></div>
            <p>{desc}</p>
          </div>)}
        </div>
      </div>
      <div className="menu-photo" data-reveal><img src={dish} alt="Shakshuka with fresh bread and a coffee on a wooden cafe table" width={896} height={1120} loading="lazy" /></div>
    </div>
  </section>;
}

function useSteps(active: boolean, count: number, interval: number) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) { setStep(count); return; }
    let i = 0;
    const id = window.setInterval(() => { i += 1; setStep(i); if (i >= count) window.clearInterval(id); }, interval);
    return () => window.clearInterval(id);
  }, [active, count, interval]);
  return step;
}

function GuestScreen() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  const filled = useSteps(seen, 5, 320);
  return <div ref={ref} className="screen"><div className="screen-label">Guest card</div><div className="screen-body">
    <div className="demo-cafe">the daily grind.</div><div className="demo-subtitle">Thandi’s stamp card</div>
    <div className="demo-stamps">{Array.from({ length: 8 }, (_, i) => <span key={i} className={`demo-stamp ${i < filled ? 'filled' : ''}`}>{i < filled ? <Coffee /> : i === 7 ? <Heart /> : null}</span>)}</div>
    <div className="demo-reward">{filled} of 8 · 8th coffee on us</div></div></div>;
}

function StaffScreen() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  const step = useSteps(seen, 2, 700);
  return <div ref={ref} className="screen"><div className="screen-label">Staff stamp page</div><div className="screen-body screen-staff">
    <span className="demo-label">Thandi M. · 4 of 8</span>
    <span className={`staff-button ${step >= 1 ? 'is-pressed' : ''}`}>Add stamp</span>
    <span className={`staff-toast ${step >= 2 ? 'is-shown' : ''}`}><Check /> Stamp added · 5 of 8</span></div></div>;
}

function OwnerScreen() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  const step = useSteps(seen, 2, 900);
  const delivered = useCountUp(step >= 2 ? 84 : 0, 900);
  const redeemed = useCountUp(step >= 2 ? 12 : 0, 900);
  return <div ref={ref} className="screen"><div className="screen-label">Owner campaign</div><div className="screen-body screen-owner">
    <span className="owner-audience">No visit in 30 days · 84 guests</span>
    <div className="owner-message">We miss you! Pop in this Tuesday for a coffee on us with any breakfast.</div>
    <span className="owner-cost">Estimated cost R{(84 * commercial.smsEstimate).toFixed(2)} (84 × R0.35, illustrative)</span>
    <span className={`staff-button small ${step >= 1 ? 'is-pressed' : ''}`}>Send</span>
    <div className="owner-results"><span>Delivered <strong>{Math.round(delivered)}</strong></span><span>Redeemed <strong>{Math.round(redeemed)}</strong></span></div></div></div>;
}

export function SeeItWorking() {
  return <section className="section see-section" id="see-it-working"><div className="page-width">
    <div data-reveal><div className="eyebrow"><span className="eyebrow-line" />See it working</div>
    <h2 className="section-heading">Three screens.<br /><span className="editorial">One happy regular.</span></h2></div>
    <div className="screens">{[<GuestScreen key="g" />, <StaffScreen key="s" />, <OwnerScreen key="o" />]}</div>
    <p className="demo-disclaimer">Demo data — example screens, not real customers or results.</p>
  </div></section>;
}
