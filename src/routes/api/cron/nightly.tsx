import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/nightly")({
  component: CronNightlyPlaceholder,
  server: {
    handlers: {
      POST: async () => new Response("Not implemented yet", { status: 501 }),
    },
  },
});

function CronNightlyPlaceholder() {
  return (
    <main className="demo-hub page-width">
      <h1>Not implemented yet.</h1>
      <p>Nightly maintenance runs in a later milestone.</p>
      <a href="/">Back to Patron</a>
    </main>
  );
}
