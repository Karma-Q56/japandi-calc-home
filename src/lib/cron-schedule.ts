// Which cron route each Cloudflare schedule calls. The schedule strings here must match
// `triggers.crons` in wrangler.jsonc exactly: a test checks that they do.

export const CRON_ROUTES: Readonly<Record<string, string>> = {
  // Every minute: claim due campaigns, queue their messages, send one batch.
  "* * * * *": "/api/cron/dispatch",
  // Every 10 minutes: settle campaigns whose messages are all final.
  "*/10 * * * *": "/api/cron/settle",
  // Once a day at 06:00 UTC (08:00 in South Africa): low-credit notes and upkeep.
  "0 6 * * *": "/api/cron/nightly",
};

/** The route for a schedule string, or null for one we do not know (nothing is called). */
export function cronRouteFor(cron: string): string | null {
  return CRON_ROUTES[cron] ?? null;
}
