import { ChevronLeft } from "lucide-react";

type BackLinkProps = {
  to?: string;
  onClick?: () => void;
  label?: string;
  className?: string;
};

/**
 * One back control for every screen outside a tab bar.
 * Use `to` for a known parent, or `onClick` when the step lives in page state.
 */
export function BackLink({ to, onClick, label = "Back", className }: BackLinkProps) {
  const classes = `back-link${className ? ` ${className}` : ""}`;
  const content = (
    <>
      <ChevronLeft size={17} aria-hidden="true" />
      <span>{label}</span>
    </>
  );

  if (to) {
    return (
      <a href={to} className={classes} data-back-link>
        {content}
      </a>
    );
  }

  return (
    <button type="button" className={classes} onClick={onClick} data-back-link>
      {content}
    </button>
  );
}
