# D22: Launch checklist (not a Freebuff prompt)

This is for Karma and Claude. It starts when Phases A to C are merged, the GitHub check is green on `claude/fix-regressions`, and the whole product has been walked through in demo and in live mode on the preview database.

## Karma does (needs your accounts, money or approval)
1. Approve the production database migrations (0010 to the last one). Claude prepares them and runs them only after your yes.
2. Add the production secrets in Cloudflare and Neon settings, never in chat: database addresses, `CRON_SECRET`, `VAPID_*`, `BULKSMS_*`, `PAYFAST_*`, the email provider key, `BETTER_AUTH_SECRET`. Claude generates the push keys with the script and tells you how.
3. Load a small BulkSMS credit and confirm the sender name, then run the one real test campaign to your own phone with Claude watching.
4. Create the payment provider account and run one sandbox payment.
5. Domain, the email provider account (so password reset and notices work), real contact details and WhatsApp number on the site.
6. Lawyer: privacy policy and terms for POPIA, the consent wording, and the opt-out line. Accountant: invoices and VAT.
7. Create your own operator login row in production (two lines of SQL from `docs/auth-setup.md`).

## Claude does
1. Production readiness review: every migration applied in order on a fresh copy of production's shape, the database security check, rollback notes, backups on and tested, error monitoring on, rate limits on.
2. Walk every owner, till, guest and operator screen in live mode at phone and desktop size with screenshots, and fix what is left.
3. Load check: a rush at the till (100 stamps in a minute) against the preview database.
4. Final consistency pass: tab styles, button looks, copy, empty states.
5. The first real restaurant is onboarded together, with Claude watching the database and the logs.

## Done when
A real restaurant has joined, published, stamped a real guest, redeemed a reward, and sent one real campaign, and nothing needed a developer to fix it.
