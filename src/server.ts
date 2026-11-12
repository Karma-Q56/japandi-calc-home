import "./lib/error-capture";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { cronRouteFor } from "./lib/cron-schedule";

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`TanStack Start swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const entry = createServerEntry({
  async fetch(request, options) {
    try {
      return await normalizeCatastrophicSsrResponse(await handler.fetch(request, options));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
});

type ScheduledControllerLike = { cron: string };
type ExecutionContextLike = { waitUntil(promise: Promise<unknown>): void };

/**
 * Cloudflare calls this on each schedule in wrangler.jsonc (`triggers.crons`). It calls our own cron
 * route in-process with the shared secret, so the routes stay the single place the work lives and
 * keep refusing any other caller.
 */
async function scheduled(
  controller: ScheduledControllerLike,
  env: Record<string, unknown>,
  ctx: ExecutionContextLike,
): Promise<void> {
  const route = cronRouteFor(controller.cron);
  if (!route) return;
  const secret = typeof env["CRON_SECRET"] === "string" ? (env["CRON_SECRET"] as string) : process.env["CRON_SECRET"];
  if (!secret) {
    console.error("CRON_SECRET is not set, so the scheduled run was skipped.");
    return;
  }
  const request = new Request(`https://patron.internal${route}`, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
  const run = async () => {
    const response = await entry.fetch(request);
    if (!response.ok) console.error(`Scheduled call to ${route} answered ${response.status}.`);
  };
  ctx.waitUntil(run());
}

export default { ...entry, scheduled };
