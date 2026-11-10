import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { withContext, type DatabaseTransaction } from "@/server/db";
import { BulkSmsProvider, createBulkSmsFromEnv } from "@/server/sms";
import { isStopReply, toE164 } from "@/lib/live-dispatch";

type Env = Record<string, string | undefined>;

const STOP_WORDING = "I reply STOP to stop marketing texts from this restaurant.";

/** Records the event once. Returns false when it was already seen. */
async function claimEvent(tx: DatabaseTransaction, eventId: string): Promise<boolean> {
  // Store only the event key. The body holds phone numbers and must not be kept here.
  const result = await tx.execute<{ id: string }>(sql`
    insert into provider_event (provider, event_id, payload, processed_at)
    values ('bulksms', ${eventId}, '{}'::jsonb, now())
    on conflict (provider, event_id) do nothing
    returning id
  `);
  return result.rows.length > 0;
}

export const Route = createFileRoute("/api/webhooks/sms/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (params.provider !== "bulksms") return new Response("Not found", { status: 404 });
        const env = process.env as Env;
        const databaseUrl = env["DATABASE_URL"];
        if (!databaseUrl) return new Response("Not configured", { status: 503 });

        let provider: BulkSmsProvider;
        try {
          provider = createBulkSmsFromEnv(env);
        } catch {
          return new Response("Not configured", { status: 503 });
        }
        if (!(await provider.verifyWebhook(request))) return new Response("Forbidden", { status: 403 });

        const url = new URL(request.url);
        const kind = url.searchParams.get("kind") ?? "delivery";
        const raw = await request.text();

        try {
          if (kind === "inbound") {
            const events = await provider.parseInboundWebhook(new Request(request.url, { method: "POST", body: raw }));
            for (const event of events) {
              if (!isStopReply(event.body)) continue;
              const phone = toE164(event.from);
              if (!phone) continue;
              const eventId = `stop:${phone}:${event.at.getTime()}`;
              await withContext({ databaseUrl, isOperator: true }, async (tx) => {
                const fresh = await claimEvent(tx, eventId);
                if (fresh) await tx.execute(sql`select record_sms_stop(${phone}, 'bulksms', ${STOP_WORDING})`);
              });
            }
          } else {
            const events = await provider.parseDeliveryWebhook(new Request(request.url, { method: "POST", body: raw }));
            for (const event of events) {
              const eventId = `delivery:${event.providerMessageId}:${event.status}:${event.at.getTime()}`;
              await withContext({ databaseUrl, isOperator: true }, async (tx) => {
                const fresh = await claimEvent(tx, eventId);
                if (!fresh) return;
                await tx.execute(sql`
                  select record_delivery('bulksms', ${event.providerMessageId}, ${event.status}, ${event.errorCode ?? null}, null, null)
                `);
              });
            }
          }
          return new Response("OK", { status: 200, headers: { "Cache-Control": "no-store" } });
        } catch {
          return new Response("Webhook failed", { status: 500 });
        }
      },
    },
  },
});
