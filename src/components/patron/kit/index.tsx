import {
  useEffect,
  type InputHTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronLeft, Gift, Stamp, X } from "lucide-react";
import type { Theme } from "@/data/types";
import { BackLink } from "../BackLink";
import { readableOnAccent } from "@/theme/contrast";
import { SectionTabs } from "./SectionTabs";

export { BackLink };

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ button */

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  className?: string;
  href?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  title?: string;
  target?: string;
  rel?: string;
  "aria-label"?: string;
  onClick?: MouseEventHandler<HTMLElement>;
};

export function Button({
  children,
  variant = "primary",
  className,
  href,
  disabled,
  type = "button",
  title,
  target,
  rel,
  onClick,
  "aria-label": ariaLabel,
}: ButtonProps) {
  const classes = cx("pk-button", `pk-button--${variant}`, className);
  const marker = variant === "primary" ? "" : undefined;
  if (href) {
    return (
      <a
        className={classes}
        href={href}
        title={title}
        target={target}
        rel={rel}
        aria-label={ariaLabel}
        data-primary={marker}
        onClick={onClick as MouseEventHandler<HTMLAnchorElement> | undefined}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      className={classes}
      type={type}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      data-primary={marker}
      onClick={onClick as MouseEventHandler<HTMLButtonElement> | undefined}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ fields */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("pk-field", className)}>
      {label}
      {children}
      {hint ? <span className="pk-helper">{hint}</span> : null}
    </label>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("pk-input", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("pk-select", className)} {...props}>
      {children}
    </select>
  );
}

/* ------------------------------------------------------------ filter pills */

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="pk-filter-row" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="pk-filter"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {typeof option.count === "number" ? (
            <span className="pk-filter-count">{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- tabs */

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <SectionTabs
      tabs={options.map((option) => ({ id: option.value, label: option.label }))}
      active={value}
      onSelect={onChange}
      label={label}
      className="section-tabs--inline"
    />
  );
}

/* ---------------------------------------------------------- badge and pill */

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cx("pk-badge", `pk-badge--${tone}`, className)}>{children}</span>;
}

export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cx("pk-pill", className)}>{children}</span>;
}

/* ---------------------------------------------------------------- stat card */

export function StatCard({
  value,
  label,
  change,
  changeTone = "neutral",
  href,
  hint,
}: {
  value: ReactNode;
  label: string;
  change?: ReactNode;
  changeTone?: "good" | "bad" | "neutral";
  href?: string;
  hint?: string;
}) {
  const body = (
    <>
      <span className="pk-stat-value">{value}</span>
      <span className="pk-stat-label">{label}</span>
      {change ? (
        <span className={cx("pk-stat-change", changeTone !== "neutral" && `pk-stat-change--${changeTone}`)}>
          {change}
        </span>
      ) : null}
    </>
  );
  return href ? (
    <a className="pk-stat" href={href} title={hint}>
      {body}
    </a>
  ) : (
    <div className="pk-stat" title={hint}>
      {body}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="pk-stat-grid">{children}</div>;
}

/* --------------------------------------------------------------- page header */

export function PageHeader({
  label,
  title,
  helper,
  actions,
}: {
  label: ReactNode;
  title: string;
  helper?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pk-page-header">
      <p className="pk-label">{label}</p>
      <h1>{title}</h1>
      {helper ? <p className="pk-helper">{helper}</p> : null}
      {actions ? <div className="pk-actions">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- empty/loading */

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="pk-empty">
      <strong>{title}</strong>
      {hint ? <p>{hint}</p> : null}
      {action ? <div className="pk-actions">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="pk-loading" role="status" aria-live="polite">
      <span className="pk-spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

/* ------------------------------------------------------------------- toast */

export function Toast({
  tone = "neutral",
  children,
}: {
  tone?: "success" | "warning" | "danger" | "neutral";
  children: ReactNode;
}) {
  return (
    <p className={cx("pk-toast", tone !== "neutral" && `pk-toast--${tone}`)} role="status">
      {tone === "success" ? <Check size={16} aria-hidden="true" /> : null}
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ drawer */

export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="pk-drawer-layer" onClick={onClose}>
      <aside
        className="pk-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pk-drawer-head">
          <h2>{title}</h2>
          <Button variant="quiet" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </Button>
        </div>
        {children}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ avatar */

export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const label =
    parts.length > 1
      ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase()
      : (parts[0]?.[0]?.toUpperCase() ?? "P");
  return (
    <span className={cx("pk-avatar", large && "pk-avatar--lg")} aria-hidden="true">
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ stamps */

export function StampCircles({
  total,
  filled,
  label,
  tick = false,
}: {
  total: number;
  filled: number;
  label?: string;
  tick?: boolean;
}) {
  // A half typed number in a settings box (999999999, -5) must not break the screen.
  const count = Number.isFinite(total) ? Math.min(60, Math.max(0, Math.floor(total))) : 0;
  return (
    <div className="pk-stamps" role="img" aria-label={label ?? `${filled} of ${total} stamps`}>
      {Array.from({ length: count }, (_, index) => {
        const on = index < filled;
        const reward = index === count - 1;
        return (
          <span
            key={index}
            className={cx("pk-stamp", on && "is-filled", reward && "is-reward")}
            aria-hidden="true"
          >
            {on ? (
              tick ? <Check size={15} aria-hidden="true" /> : <Stamp size={16} />
            ) : reward ? (
              <Gift size={15} />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- venue mark */

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((word) => !/^(the|a|an)$/i.test(word))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function VenueMark({
  name,
  theme,
  size = "md",
}: {
  name: string;
  theme?: Pick<Theme, "accent" | "ink" | "paper" | "logo">;
  size?: "sm" | "md";
}) {
  const style = theme
    ? {
        background: theme.accent,
        color: readableOnAccent(theme.accent, theme.ink, theme.paper),
      }
    : undefined;
  return (
    <span
      className={cx("pk-venue-mark", size === "sm" && "pk-venue-mark--sm")}
      style={style}
      aria-hidden="true"
    >
      {theme?.logo ? <img src={theme.logo} alt="" /> : initials(name) || "P"}
    </span>
  );
}

/* ------------------------------------------------------------------- back */

export function KitBackLink({
  to,
  onClick,
  label = "Back",
}: {
  to?: string;
  onClick?: () => void;
  label?: string;
}) {
  return (
    <span className="pk-back-wrap">
      {to ? (
        <a href={to} className="pk-back" data-back-link>
          <ChevronLeft size={17} aria-hidden="true" />
          {label}
        </a>
      ) : (
        <button type="button" className="pk-back" data-back-link onClick={onClick}>
          <ChevronLeft size={17} aria-hidden="true" />
          {label}
        </button>
      )}
    </span>
  );
}
