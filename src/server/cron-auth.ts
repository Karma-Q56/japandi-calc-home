import { safeEqual } from "./sms/BulkSmsProvider";

type Env = Record<string, string | undefined>;

/** Refuses when CRON_SECRET is missing or the header does not match (constant-time compare). */
export function cronAuthorized(request: Request, env: Env): boolean {
  const expected = env["CRON_SECRET"];
  if (!expected) return false;
  return safeEqual(request.headers.get("x-cron-secret") ?? "", expected);
}
