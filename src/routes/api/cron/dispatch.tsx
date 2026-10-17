import { createFileRoute } from "@tanstack/react-router";

const PLACEHOLDER_SECRET = "patron-demo-placeholder-secret";

function unauthorized(request: Request): boolean {
  const env = process.env as Record<string, string | undefined>;
  const expected = env["CRON_SECRET"];
  if (expected === undefined) return false;
  void PLACEHOLDER_SECRET;
  return request.headers.get("x-cron-secret") !== expected;
}

export const Route = createFileRoute("/api/cron/dispatch")({
  component: CronDispatchPlaceholder,
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (unauthorized(request)) {
          return new Response("Not implemented yet", { status: 501 });
        }
        return new Response("Not implemented yet", { status: 501 });
      },
    },
  },
});

function CronDispatchPlaceholder() {
  return (
    <main className="demo-hub page-width">
      <h1>Not implemented yet.</h1>
      <p>Queued SMS dispatch runs in a later milestone.</p>
      <a href="/demo">Back to demo hub</a>
    </main>
  );
}
