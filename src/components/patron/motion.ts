import { useEffect, useRef, useState } from 'react';

type Callback = () => void;
let observer: IntersectionObserver | null = null;
const callbacks = new Map<Element, Callback>();

/** One shared IntersectionObserver; each element fires once, then is unobserved. */
export function observeOnce(el: Element, cb: Callback) {
  if (typeof IntersectionObserver === 'undefined') { cb(); return () => {}; }
  if (!observer) {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const fn = callbacks.get(entry.target);
        callbacks.delete(entry.target);
        observer?.unobserve(entry.target);
        fn?.();
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  }
  callbacks.set(el, cb);
  observer.observe(el);
  return () => { callbacks.delete(el); observer?.unobserve(el); };
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Marks [data-reveal] elements visible once they scroll into view. */
export function useRevealAll() {
  useEffect(() => {
    document.documentElement.classList.add('js');
    const cleanups = Array.from(document.querySelectorAll('[data-reveal]')).map(el => observeOnce(el, () => el.classList.add('is-visible')));
    return () => cleanups.forEach(c => c());
  }, []);
}

export function useInViewOnce<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => { if (!ref.current) return undefined; return observeOnce(ref.current, () => setSeen(true)); }, []);
  return [ref, seen] as const;
}

/** Counts from the previous value to target over 400 ms. */
export function useCountUp(target: number, duration = 400) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (prefersReducedMotion()) { setValue(target); from.current = target; return; }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (target - origin) * eased;
      setValue(next);
      from.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
