import { useState } from 'react';
import { ArrowUpRight, Info, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { planRepeatVisits, plannerDefaults, plannerPlans, rand, whatsappLink } from '@/lib/patron';
import { useCountUp } from './motion';

function Money({ value }: { value: number }) { const v = useCountUp(value); return <>{rand(v)}</>; }
function Num({ value, digits = 1 }: { value: number; digits?: number }) { const v = useCountUp(value); return <>{v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits })}</>; }

type Field = { id: string; label: string; value: number; min: number; max: number; step: number; prefix?: string; suffix?: string; set: (v: number) => void };

function Control({ f }: { f: Field }) {
  const clamp = (v: number) => Math.min(f.max, Math.max(f.min, v));
  return <div className="calculator-control">
    <div className="calculator-control-top">
      <label id={`${f.id}-label`} htmlFor={`${f.id}-input`}>[ {f.label} ]</label>
      <span className="planner-field">{f.prefix}<input id={`${f.id}-input`} type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step} value={f.value} onChange={e => { const v = Number(e.target.value); if (!Number.isNaN(v)) f.set(clamp(v)); }} />{f.suffix}</span>
    </div>
    <Slider aria-labelledby={`${f.id}-label`} min={f.min} max={f.max} step={f.step} value={[f.value]} onValueChange={v => { if (v[0] !== undefined) f.set(v[0]); }} />
  </div>;
}

export function Planner() {
  const d = plannerDefaults;
  const [spend, setSpend] = useState<number>(d.spend);
  const [visits, setVisits] = useState<number>(d.visits);
  const [lift, setLift] = useState<number>(d.lift);
  const [margin, setMargin] = useState<number>(d.margin);
  const [plan, setPlan] = useState<string>(d.plan);
  const fee = plannerPlans.find(p => p.name === plan)?.fee ?? 0;
  const r = planRepeatVisits({ spend, visits, lift, margin, fee });
  const reset = () => { setSpend(d.spend); setVisits(d.visits); setLift(d.lift); setMargin(d.margin); setPlan(d.plan); };
  const message = `Hi Patron! I'd like to talk through my numbers.\nAverage spend: ${rand(spend)}\nVisits per week: ${visits}\nExtra visits to explore: ${lift}%\nMargin: ${margin}%\nPlan: ${plan} (${rand(fee)}/month)\nRestaurant: `;
  const fields: Field[] = [
    { id: 'spend', label: 'Average spend per visit', value: spend, min: 50, max: 800, step: 10, prefix: 'R', set: setSpend },
    { id: 'visits', label: 'Customer visits in a typical week', value: visits, min: 25, max: 5000, step: 25, set: setVisits },
    { id: 'lift', label: 'Extra visits to explore', value: lift, min: 0, max: 15, step: 0.5, suffix: '%', set: setLift },
  ];
  return <section className="section calculator-section page-width" id="calculator">
    <div data-reveal><div className="eyebrow"><span className="eyebrow-line" />A few more familiar faces</div>
    <h2 className="section-heading">What could a few more <span className="editorial">visits</span><br />be worth?</h2>
    <p className="section-description">Play with your own numbers. A little more loyalty can make a real difference to your month.</p></div>
    <div className="planner">
      <div className="planner-inputs">
        {fields.map(f => <Control key={f.id} f={f} />)}
        <div className="calculator-control"><span className="planner-legend" id="plan-label">[ Plan ]</span>
          <div className="plan-toggle" role="radiogroup" aria-labelledby="plan-label">{plannerPlans.map(p => <button key={p.name} type="button" role="radio" aria-checked={plan === p.name} className="plan-option" onClick={() => setPlan(p.name)}>{p.name}<span>{rand(p.fee)}</span></button>)}</div>
        </div>
        <details className="planner-adjust"><summary>Adjust the estimate</summary>
          <Control f={{ id: 'margin', label: 'Contribution margin', value: margin, min: 10, max: 70, step: 1, suffix: '%', set: setMargin }} />
        </details>
      </div>
      <div className="planner-results" aria-live="polite" aria-atomic="true">
        <div className="planner-visits"><div><strong><Num value={r.extraPerWeek} /></strong><span>extra visits a week</span></div><div><strong><Num value={r.extraPerMonth} /></strong><span>extra visits a month</span></div></div>
        <dl className="planner-money">
          <div><dt>Extra sales a month</dt><dd><Money value={r.sales} /></dd></div>
          <div><dt>Contribution ({margin}% margin)</dt><dd><Money value={r.contribution} /></dd></div>
          <div className="planner-after"><dt>After the {plan} fee ({rand(fee)})</dt><dd><Money value={r.afterFee} /></dd></div>
        </dl>
        <p className="planner-breakeven">{r.breakEvenPerWeek === null ? 'Break-even needs a margin above 0%.' : <>Break-even: about <strong>{r.breakEvenPerWeek.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}</strong> extra visits a week.</>}</p>
        <div className="planner-actions">
          <Button variant="patron" className="primary-cta" asChild><a href={whatsappLink(message)} target="_blank" rel="noopener noreferrer">Talk through your numbers <ArrowUpRight /></a></Button>
          <Button variant="quiet" type="button" onClick={reset}><RotateCcw /> Reset</Button>
        </div>
      </div>
    </div>
    <p className="estimate-note"><Info />Illustrative scenario, not a forecast or guarantee. Sales are not profit. SMS credits and discounts are not included.</p>
  </section>;
}
