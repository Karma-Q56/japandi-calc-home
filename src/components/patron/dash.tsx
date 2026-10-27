/**
 * Shared dashboard building blocks for the owner dashboard, diner app,
 * staff till and Patron admin. Everything sits on the same global tokens
 * (cream, terracotta) and the builder-*, stat-*, restaurant-table and
 * status-pill styles in src/ui.css, so pages stay consistent.
 */
import { useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ header */

export function PageHeader(props: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // A div, not <header>: dashboard shells already own the one page header.
    <div className="dash-header">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        {props.eyebrow}
      </p>
      <h1>{props.title}</h1>
      {props.intro != null && props.intro !== "" ? (
        <p className="demo-intro">{props.intro}</p>
      ) : null}
      {props.actions ? <div className="page-actions">{props.actions}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- stat card */

export function StatCard(props: {
  value: ReactNode;
  label: string;
  hint?: string | undefined;
  href?: string | undefined;
  tone?: "good" | "bad" | undefined;
}) {
  const className = `stat-card${props.tone ? ` is-${props.tone}` : ""}`;
  const body = (
    <>
      <strong>{props.value}</strong>
      <span>{props.label}</span>
      {props.hint ? <small>{props.hint}</small> : null}
    </>
  );
  return props.href ? (
    <a className={className} href={props.href} title={props.hint}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}

/* ------------------------------------------------------------------- badge */

/** Status badge on the shared .status-pill pill. data-s picks the colour. */
export function Badge(props: { tone?: "sent" | "active" | undefined; children: ReactNode }) {
  return (
    <span className="status-pill" {...(props.tone ? { "data-s": props.tone } : {})}>
      {props.children}
    </span>
  );
}

/** Campaign status mapped to a plain label and a badge colour. */
export function campaignBadge(status: string): { label: string; tone?: "sent" | "active" } {
  switch (status) {
    case "sent":
      return { label: "Sent", tone: "sent" };
    case "scheduled":
    case "sending":
      return { label: status === "sending" ? "Sending" : "Scheduled", tone: "active" };
    case "pending_approval":
      return { label: "Needs approval" };
    case "cancelled":
      return { label: "Cancelled" };
    case "failed":
      return { label: "Failed" };
    default:
      return { label: "Draft" };
  }
}

/* -------------------------------------------------------------- data table */

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
}

/**
 * Responsive data table on the shared .restaurant-table styles. On phones
 * the rows stack into cards, so the first column should carry the name.
 */
export function DataTable<Row>(props: {
  columns: Array<DataTableColumn<Row>>;
  rows: Row[];
  caption: string;
}) {
  return (
    <div className="restaurant-table-wrap">
      <table className="restaurant-table">
        <caption className="sr-only">{props.caption}</caption>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={index}>
              {props.columns.map((column) => (
                <td key={column.key}>{column.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- empty state */

export function EmptyState(props: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="dash-empty">
      <strong>{props.title}</strong>
      {props.hint ? <p>{props.hint}</p> : null}
      {props.action ? <div className="page-actions">{props.action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- form field */

/** Label plus optional helper line, on the shared .builder-field styles. */
export function FormField(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="builder-field">
      {props.label}
      {props.children}
      {props.hint ? <small>{props.hint}</small> : null}
    </label>
  );
}

/* ---------------------------------------------------------- confirm dialog */

/** Destructive or expensive actions confirm in place. No changes until Yes. */
export function ConfirmDialog(props: {
  label: string;
  question: string;
  confirmLabel?: string;
  buttonClass?: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className={props.buttonClass ?? "guest-back"} onClick={() => setOpen(true)}>
        {props.label}
      </button>
    );
  }
  return (
    <span className="dash-confirm" role="alertdialog" aria-label={props.question}>
      <span>{props.question}</span>
      <button
        className="builder-primary"
        onClick={() => {
          setOpen(false);
          props.onConfirm();
        }}
      >
        {props.confirmLabel ?? "Yes"}
      </button>
      <button className="guest-back" onClick={() => setOpen(false)}>
        No
      </button>
    </span>
  );
}

/* ----------------------------------------------------------- preview banner */

/** Shown wherever a guest-facing thing is only being looked at, not sent. */
export function PreviewBanner(props: { children?: ReactNode }) {
  return <p className="preview-banner" role="status">{props.children ?? "Preview only. Nothing was sent."}</p>;
}
