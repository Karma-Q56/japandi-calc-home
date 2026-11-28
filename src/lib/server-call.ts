// A server function throws when a box fails its check or the connection drops. Screens
// would then sit there with their buttons off and say nothing. This turns that into a
// normal "not ok" answer with a plain sentence.

export const CHECK_THE_BOXES =
  "Something in the boxes is not allowed. Check the numbers and words, then try again.";
export const NO_ANSWER = "We could not reach Patron. Check your connection and try again.";

export function plainProblem(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  try {
    const issues: unknown = JSON.parse(text);
    if (Array.isArray(issues)) return CHECK_THE_BOXES;
  } catch {
    // Not a list of failed checks.
  }
  return NO_ANSWER;
}

export function safely<T>(call: Promise<T>): Promise<T | { ok: false; message: string }> {
  return Promise.resolve(call).catch((error: unknown) => ({
    ok: false as const,
    message: plainProblem(error),
  }));
}
