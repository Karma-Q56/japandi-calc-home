import { useEffect, useRef, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";

export type SectionTab<T extends string = string> = {
  id: T;
  label: string;
  /** Give an address to open another page. Leave it out for a tab that switches in place. */
  href?: string;
  search?: Record<string, string>;
};

/**
 * The one tab bar used across Patron.
 *
 * - When every tab has an address it is a list of links, and the open one has aria-current="page".
 * - When no tab has an address it is a tab list of buttons with aria-selected, and the arrow,
 *   Home and End keys move between them.
 * - A mix (the Loyalty page: some tabs switch in place, some open a page) is a navigation bar
 *   that marks the open one with aria-current="page".
 */
export function SectionTabs<T extends string>({
  tabs,
  active,
  onSelect,
  label,
  className,
}: {
  tabs: ReadonlyArray<SectionTab<T>>;
  active: string | null;
  onSelect?: (id: T) => void;
  label: string;
  className?: string;
}) {
  const barRef = useRef<HTMLElement | null>(null);
  const asTabList = tabs.every((tab) => !tab.href);

  // On a narrow screen the bar scrolls sideways. Bring the open tab into view by moving
  // the bar only, so the page itself never jumps.
  useEffect(() => {
    const bar = barRef.current;
    const current = bar?.querySelector<HTMLElement>(".section-tab.is-active");
    if (!bar || !current) return;
    const barBox = bar.getBoundingClientRect();
    const box = current.getBoundingClientRect();
    if (box.left < barBox.left) bar.scrollLeft -= barBox.left - box.left + 8;
    else if (box.right > barBox.right) bar.scrollLeft += box.right - barBox.right + 8;
  }, [active]);

  const move = (event: KeyboardEvent<HTMLElement>) => {
    const buttons = Array.from(
      barRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
    );
    const from = buttons.indexOf(event.target as HTMLElement);
    if (from < 0) return;
    const last = buttons.length - 1;
    const to =
      event.key === "ArrowRight"
        ? from === last
          ? 0
          : from + 1
        : event.key === "ArrowLeft"
          ? from === 0
            ? last
            : from - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (to === null) return;
    event.preventDefault();
    buttons[to]?.focus();
  };

  const classes = `section-tabs${className ? ` ${className}` : ""}`;
  const tabClass = (on: boolean) => `section-tab${on ? " is-active" : ""}`;

  if (asTabList) {
    const hasActive = tabs.some((tab) => tab.id === active);
    return (
      <div
        ref={(node) => {
          barRef.current = node;
        }}
        className={classes}
        role="tablist"
        aria-label={label}
        onKeyDown={move}
      >
        {tabs.map((tab, index) => {
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={tabClass(on)}
              aria-selected={on}
              tabIndex={on || (!hasActive && index === 0) ? 0 : -1}
              onClick={() => onSelect?.(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <nav
      ref={(node) => {
        barRef.current = node;
      }}
      className={classes}
      aria-label={label}
    >
      {tabs.map((tab) => {
        const on = tab.id === active;
        const current = on ? ("page" as const) : undefined;
        return tab.href ? (
          <Link
            key={tab.id}
            to={tab.href}
            {...(tab.search ? { search: tab.search as never } : {})}
            className={tabClass(on)}
            aria-current={current}
          >
            {tab.label}
          </Link>
        ) : (
          <button
            key={tab.id}
            type="button"
            className={tabClass(on)}
            aria-current={current}
            onClick={() => onSelect?.(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
