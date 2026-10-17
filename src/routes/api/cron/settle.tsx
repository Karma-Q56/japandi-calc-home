import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/settle")({
  component: CronSettlePlaceholder,
  server: {
    handlers: {
      POST: async () => new Response("Not implemented yet", { status: 501 }),
    },
  },
});

function CronSettlePlaceholder() {
  return (
    <main className="demo-hub page-width">
      <h1>Not implemented yet.</h1>
      <p>SMS cost settlement runs in a later milestone.</p>
      <a href="/demo">Back to demo hub</a>
    </main>
  );
}
