import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/webhooks/sms/$provider")({
  component: SmsWebhookPlaceholder,
  server: {
    handlers: {
      POST: async () => new Response("Not implemented yet", { status: 501 }),
    },
  },
});

function SmsWebhookPlaceholder() {
  return (
    <main className="demo-hub page-width">
      <h1>Not implemented yet.</h1>
      <p>SMS delivery webhooks arrive in a later milestone.</p>
      <a href="/">Back to Patron</a>
    </main>
  );
}
