export interface LoggedError {
  message: string;
  path?: string | undefined;
  createdAt: string;
}

const errors: LoggedError[] = [];

/** Friendly error boundary hook; M9 forwards these to observability. */
export function logError(message: string, path?: string) {
  errors.push({ message, path, createdAt: new Date().toISOString() });
  if (errors.length > 200) errors.splice(0, errors.length - 200);
  console.error(`[patron] ${message}`, path ?? "");
}

export function getLoggedErrors(): LoggedError[] {
  return [...errors];
}
