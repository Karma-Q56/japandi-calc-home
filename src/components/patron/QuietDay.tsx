import { useRef } from 'react';
import { commercial, rand } from '@/lib/patron';
import { QUIET_DAYS, setQuietDay, useQuietDay, type QuietDay as QuietDayName } from '@/lib/quiet-day';

const ideas = [
  { day: 'Mon', title: 'Double-stamp Monday', idea: 'A double stamp for anyone who visited last week.', sms: 'Hi Thandi! Double stamps at The Daily Grind today for our regulars. See you soon?' },
  { day: 'Tue', title: '2-for-1 coffee Tuesday', idea: '2-for-1 coffee for guests who have not visited in 30 days.', sms: 'We miss you, Thandi! Bring a friend this Tuesday: 2 coffees for the price of 1. Just say TUESDAY.' },
  { day: 'Wed', title: 'Midweek set lunch', idea: 'A midweek set lunch for guests within 5 km.', sms: 'Lunch sorted, Thandi: our R95 midweek set lunch is on this Wednesday, 12 to 3pm.' },
  { day: 'Thu', title: 'Bring a friend Thursday', idea: 'Bring a friend and you both get a free dessert.', sms: 'Thursday treat, Thandi: bring a friend and you both get a free dessert with any main.' },
  { day: 'Fri', title: 'Early-bird Friday', idea: 'An early-bird offer for the slow hour before the dinner rush.', sms: 'Beat the rush, Thandi! 15% off the bill this Friday between 5 and 6pm.' },
  { day: 'Sat', title: 'Saturday tea & cake', idea: 'A late-afternoon tea-and-cake special.', sms: 'Saturday slow-down, Thandi: tea and a slice of cake for R65, from 3pm.' },
  { day: 'Sun', title: 'Sunday family evening', idea: 'A Sunday-evening family special for guests with birthdays this week.', sms: 'Happy birthday week, Thandi! Bring the family this Sunday evening, dessert is on us.' },
];
const audience = 120;

export function QuietDay() {
  const chosen = useQuietDay();
  const selected = Math.max(0, ideas.findIndex((idea) => chosen.startsWith(idea.day)));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const fullDay = (i: number): QuietDayName =>
    QUIET_DAYS.find((day) => day.startsWith(ideas[i]!.day)) ?? 'Tuesday';
  const pick = (i: number) => { setQuietDay(fullDay(i)); refs.current[i]?.focus(); };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = ideas.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pick((i + 1) % n); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pick((i - 1 + n) % n); }
    if (e.key === 'Home') { e.preventDefault(); pick(0); }
    if (e.key === 'End') { e.preventDefault(); pick(n - 1); }
  };
  const current = ideas[selected]!;
  const cost = audience * commercial.smsEstimate;
  return <section className="section page-width quiet-section" id="quiet-day">
    <div data-reveal><div className="eyebrow"><span className="eyebrow-line" />Slow days, sorted</div>
    <h2 className="section-heading">Which day is your <span className="editorial">quietest?</span></h2></div>
    <div className="day-chips" role="radiogroup" aria-label="Quietest day of the week" data-reveal>
      {ideas.map((d, i) => <button key={d.day} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={selected === i} tabIndex={selected === i ? 0 : -1} className="day-chip" onClick={() => pick(i)} onKeyDown={e => onKey(e, i)}>{d.day}</button>)}
    </div>
    <div className="quiet-result" key={current.day} aria-live="polite">
      <div className="quiet-copy">
        <span className="demo-label">An offer idea</span>
        <h3>{current.title}</h3>
        <p>{current.idea}</p>
        <p className="quiet-cost">{audience} guests × R{commercial.smsEstimate.toFixed(2)} ≈ {rand(cost)} <span>(illustrative)</span></p>
        <p className="quiet-note">An idea only, not a promised result.</p>
        <a className="text-link" href={`/contact?kind=owner&quietDay=${fullDay(selected)}#visit`}>
          Plan a {fullDay(selected)} visit
        </a>
      </div>
      <div className="sms-phone" aria-label="Example SMS a guest would receive">
        <div className="sms-phone-top">The Daily Grind</div>
        <div className="sms-bubble">{current.sms}<span>Reply STOP to opt out</span></div>
      </div>
    </div>
  </section>;
}
