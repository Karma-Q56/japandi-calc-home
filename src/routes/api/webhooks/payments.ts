import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { withContext } from "@/server/db";
import { getDataMode, requireDatabaseUrl } from "@/server/db/mode";
import { readPayFastConfig } from "@/server/billing/payfast";
import { createPayFastProvider, validateWithPayFast } from "@/server/billing/payfast-provider";

// PayFast ITN (phase D21). Checks the signature and merchant, validates with PayFast,
// then settles the payment once. A repeat delivery changes nothing.

export const Route = createFileRoute("/api/webhooks/payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (getDataMode() !== "live") return new Response("Not found", { status: 404 });
        const config = readPayFastConfig();
        if (!config) return new Response("Payments are not switched on", { status: 503 });

        const body = await request.text();
        const provider = createPayFastProvider(config);
        const check = provider.verifyWebhook(body);
        if (!check.ok) return new Response(check.reason, { status: 400 });

        const event = provider.parseEvent(body);
        if (!event) return new Response("bad_event", { status: 400 });

        const valid = await validateWithPayFast(config, body);
        if (!valid) return new Response("not_validated", { status: 400 });

        try {
          const result = await withContext(
            { databaseUrl: requireDatabaseUrl(), restaurantId: null, isOperator: false },
            async (transaction) => {
              const rowRes = await transaction.execute<{ result: string }>(sql`
                select settle_card_payment(
                  ${event.paymentId}::uuid, ${event.amountCents}::int,
                  ${event.providerRef}, ${event.outcome}
                ) as result
              `);
              return rowRes.rows[0]?.result ?? "ignored";
            },
          );
          return new Response(result, { status: 200 });
        } catch (error) {
          const message = error instanceof Error ? error.cause : null;
          const text = message instanceof Error ? message.message : "";
          if (text.includes("amount_mismatch")) return new Response("amount_mismatch", { status: 400 });
          if (text.includes("payment_not_found")) return new Response("payment_not_found", { status: 404 });
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
