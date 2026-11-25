import { useCallback, useRef, useState } from "react";

export type TillFeedbackLine = { kind: "ok" | "error"; text: string };

/** A result line stays on the screen at least this long. */
export const TILL_FEEDBACK_MS = 5000;

/**
 * The line that says what just happened at the till. A new result replaces it at once.
 * Looking up the next guest only clears it after it has been readable for five seconds.
 */
export function useTillFeedback() {
  const [feedback, setFeedback] = useState<TillFeedbackLine | null>(null);
  const shownAt = useRef(0);
  const show = useCallback((kind: TillFeedbackLine["kind"], text: string) => {
    shownAt.current = Date.now();
    setFeedback({ kind, text });
  }, []);
  const clear = useCallback(() => setFeedback(null), []);
  const clearIfRead = useCallback(() => {
    if (Date.now() - shownAt.current >= TILL_FEEDBACK_MS) setFeedback(null);
  }, []);
  return { feedback, show, clear, clearIfRead };
}
