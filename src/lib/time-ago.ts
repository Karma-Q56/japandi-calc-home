import { plural } from "./plural";

/**
 * A plain relative date. The result never starts with "last in" and never says
 * "1 months": singular and plural are handled by plural().
 */
export function timeAgo(
  value: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  if (value == null) return "Not seen yet";
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(then)) return "Not seen yet";
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${plural(days, "day")} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${plural(months, "month")} ago`;
  return `${plural(Math.floor(months / 12), "year")} ago`;
}

/** One sentence for a last visit, never "last in 5 days ago". */
export function lastSeenLabel(
  value: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  const label = timeAgo(value, now);
  return label === "Not seen yet" ? label : `Last seen ${label.toLowerCase()}`;
}
