import { useSyncExternalStore } from "react";

export const QUIET_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type QuietDay = (typeof QUIET_DAYS)[number];

const KEY = "patron.quiet-day";
const listeners = new Set<() => void>();
let current: QuietDay = "Tuesday";

function isQuietDay(value: unknown): value is QuietDay {
  return typeof value === "string" && (QUIET_DAYS as readonly string[]).includes(value);
}

export function getQuietDay(): QuietDay {
  if (typeof window !== "undefined") {
    try {
      const saved = window.sessionStorage.getItem(KEY);
      if (isQuietDay(saved)) return saved;
    } catch {
      // Session storage can be blocked; fall back to memory.
    }
  }
  return current;
}

export function setQuietDay(value: QuietDay): void {
  current = value;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(KEY, value);
    } catch {
      // The in-memory value still works for this page.
    }
  }
  for (const listener of listeners) listener();
}

export function subscribeQuietDay(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shared by the quiet day picker, the planner and the contact form. */
export function useQuietDay(): QuietDay {
  return useSyncExternalStore(subscribeQuietDay, getQuietDay, () => "Tuesday");
}
