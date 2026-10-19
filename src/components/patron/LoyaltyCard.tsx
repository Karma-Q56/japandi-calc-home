import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Theme } from "@/data/types";
import cafePhoto from "@/assets/cafe-hero.jpg";
import { GiftGlyph, StampGlyph } from "./StampIcon";

export interface LoyaltyCardProps {
  theme: Theme;
  name: string;
  filled: number;
  total: number;
  memberName?: string;
  /** Stamps collected since the guest last looked: they get a stronger "stamped" animation. */
  newlyGained?: number;
  /** Line under the grid, e.g. "3 more for a free coffee". */
  footnote?: string;
  /** Smaller card for lists (My cards). */
  compact?: boolean;
  /** Fill stamps one by one when the card scrolls into view. Default true. */
  animate?: boolean;
}

function columnsFor(total: number) {
  if (total <= 6) return 3;
  if (total === 8) return 4;
  if (total <= 10) return 5;
  return 6;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((word) => !/^(the|a|an)$/i.test(word))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function LoyaltyCard({
  theme,
  name,
  filled,
  total,
  memberName,
  newlyGained = 0,
  footnote,
  compact = false,
  animate = true,
}: LoyaltyCardProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [animate]);

  const cols = columnsFor(total);
  const style = {
    "--c-ink": theme.ink,
    "--c-paper": theme.paper,
    "--c-accent": theme.accent,
    "--c-soft": theme.accentSoft,
    "--c-on": theme.stampFilled,
    "--c-off": theme.stampEmpty,
    "--c-radius": `${theme.radius}px`,
    "--c-heading": `"${theme.headingFont}", system-ui, sans-serif`,
    "--c-body": `"${theme.bodyFont}", system-ui, sans-serif`,
    "--c-cols": cols,
    ...(theme.cardBackground === "photo" ? { "--c-photo": `url(${cafePhoto})` } : {}),
  } as CSSProperties;

  const percent = total ? Math.round((Math.min(filled, total) / total) * 100) : 0;

  return (
    <article
      ref={ref}
      className={`lcard lcard--${theme.cardBackground}${compact ? " lcard--compact" : ""}${
        visible ? " is-visible" : ""
      }`}
      style={style}
      aria-label={`${name} loyalty card, ${filled} of ${total} stamps`}
    >
      <header className="lcard-head">
        <span className="lcard-mark" aria-hidden>
          {theme.logo ? <img src={theme.logo} alt="" /> : initials(name)}
        </span>
        <span className="lcard-title">
          <strong>{name}</strong>
          {!compact && <small>{theme.tagline}</small>}
        </span>
        {compact && (
          <span className="lcard-count">
            {filled}
            <i>/{total}</i>
          </span>
        )}
      </header>

      {!compact && memberName && <p className="lcard-member">{memberName}</p>}

      <div className="lcard-grid" role="img" aria-label={`${filled} of ${total} stamps`}>
        {Array.from({ length: total }, (_, index) => {
          const on = index < filled;
          const last = index === total - 1;
          const fresh = newlyGained > 0 && index >= filled - newlyGained && on;
          return (
            <span
              key={index}
              className={`lcard-slot lcard-slot--${theme.stampShape}${on ? " on" : ""}${
                fresh ? " fresh" : ""
              }${last ? " reward" : ""}`}
              style={{ "--i": index } as CSSProperties}
            >
              {on ? (
                <StampGlyph shape={theme.stampShape} size={compact ? 18 : 24} />
              ) : last ? (
                <GiftGlyph size={compact ? 16 : 22} />
              ) : (
                <>
                  <span className="lcard-ghost" aria-hidden>
                    <StampGlyph shape={theme.stampShape} size={compact ? 16 : 22} />
                  </span>
                  {!compact && <em className="lcard-num">{index + 1}</em>}
                </>
              )}
            </span>
          );
        })}
      </div>

      {compact ? (
        <div className="lcard-bar" aria-hidden>
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : (
        <footer className="lcard-foot">
          <b>
            {filled} of {total}
          </b>
          {footnote && <span>{footnote}</span>}
        </footer>
      )}
    </article>
  );
}
