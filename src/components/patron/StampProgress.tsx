import { useEffect, useState } from 'react';
import { Coffee, Heart } from 'lucide-react';

export function StampProgress() {
  const [filled, setFilled] = useState(0);
  const [formVisible, setFormVisible] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      setFilled(Math.round(progress * 8));
      const form = document.getElementById('visit');
      if (form) { const r = form.getBoundingClientRect(); setFormVisible(r.top < window.innerHeight && r.bottom > 0); }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);
  const label = `Stamp card, ${filled} of 8. Go to the form.`;
  const stamps = Array.from({ length: 8 }, (_, i) => i < filled);
  return <>
    <a href="#visit" className={`stamp-bar ${formVisible ? 'is-hidden' : ''}`} aria-label={label}>
      <span className="stamp-bar-label">Stamp card</span>
      <span className="stamp-bar-dots" aria-hidden="true">{stamps.map((on, i) => <i key={i} className={on ? 'filled' : ''} />)}</span>
      <span className="stamp-bar-count" aria-hidden="true">{filled}/8</span>
    </a>
    <a href="#visit" className="stamp-float" aria-label={label}>
      <span className="stamp-float-grid" aria-hidden="true">{stamps.map((on, i) => <i key={i} className={on ? 'filled' : ''}>{on ? (i === 7 ? <Heart /> : <Coffee />) : null}</i>)}</span>
      <span className="stamp-float-caption" aria-hidden="true">{filled === 8 ? 'Last stamp: book your visit →' : 'Scroll to collect stamps'}</span>
    </a>
  </>;
}
