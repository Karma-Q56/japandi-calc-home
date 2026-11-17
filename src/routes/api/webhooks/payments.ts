import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { withContext } from "@/server/db";
import { getDataMode, requireDatabaseUrl } from "@/server/db/mode";
import { readPayFastConfig } from "@/server/billing/payfast";
import { createPayFastProvider, validateWithPayFast } from "@/server/billing/payfast-provider";
import { refusalCode } from "@/server/live-ops";

// PayFast ITN (phase D21). Checks the signature and merchant, validates with PayFast,
// then settles the payment once. A repeat delivery changes nothing.
// The database function refuses any call that carries a restaurant or guest context, so this
// route runs with none.

export const Route = createFileRoute("/api/webhooks/payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (getDataMode() !== "live") return new Response("Not found", { status: 404 });
        const config = readPayFastConfig();
        if (!config) return new Response("Payments are not switched on", { status: 503 });

        const body = await request.text();
        if (body.length > 8192) return new Response("too_large", { status: 413 });
        const provider = createPayFastProvider(config);
        const check = provider.verifyWebhook(body);
        if (!check.ok) return new Response(check.reason, { status: 400 });

        const event = provider.parseEvent(body);
        if (!event) return new Response("bad_event", { status: 400 });

        const valid = await validateWithPayFast(config, body);
        if (!valid) return new Response("not_validated", { status: 400 });

        // PayFast has not decided yet. A later notice will carry the final answer.
        if (event.outcome === "pending") return new Response("pending", { status: 200 });

        try {
          const result = await withContext(
            { databaseUrl: requireDatabaseUrl(), restaurantId: null, isOperator: false },
            async (transaction) => {
              // Look up by m_payment_id first. If it is missing or unknown and the notice has a
              // PayFast token, find the monthly payment by that token instead. This fallback stays
              // until the sandbox check shows what a renewal notice really carries.
              const settle = (paymentId: string) =>
                transaction.execute<{ result: string }>(sql`
                  select settle_card_payment(
                    ${paymentId}::uuid, ${event.amountCents}::int,
                    ${event.providerRef}, ${event.outcome}, ${event.token}
                  ) as result
                `);
              const findByToken = async () => {
                const found = await transaction.execute<{ id: string | null }>(sql`
                  select find_subscription_payment(${event.token}) as id
                `);
                return found.rows[0]?.id ?? null;
              };

              // A failed statement aborts the transaction, so the token lookup runs first and
              // settle runs once. An id we cannot find is used only when the token finds nothing.
              let paymentId = event.paymentId;
              if (event.token) {
                const byToken = await findByToken();
                if (byToken) paymentId = byToken;
              }
              if (!paymentId) return "unknown_notice";
              const rowRes = await settle(paymentId);
              return rowRes.rows[0]?.result ?? "ignored";
            },
          );
          return new Response(result, { status: 200 });
        } catch (error) {
          const code = refusalCode(error);
          if (code === "amount_mismatch") return new Response("amount_mismatch", { status: 400 });
          if (code === "payment_not_found") return new Response("payment_not_found", { status: 404 });
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
