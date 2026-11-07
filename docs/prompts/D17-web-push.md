# D17: Web push (subscriptions and a sender)

Wave 1 (start now) | Branch: `freebuff/web-push` | Migration: 0028 | Depends on: nothing

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
A guest can allow notifications from Patron, and the server can send them a push message. Sending as part of campaigns is D16, so here you build the capture and the sender, and prove them with tests. Later a third channel (WhatsApp) will plug into the same shape, so keep the sender behind a small channel interface.

## You own these files (touch nothing else)
- `db/migrations/0028_web_push_dev.sql`
- `src/server/push/*` (new), `src/server/live-push.ts`, `src/server/live-push-fns.ts` and tests
- `src/lib/web-push-client.ts` (exists) and its test
- `public/sw.js` (service worker, check the name is allowed and not a reserved page slug)
- `src/components/patron/PushOptIn.tsx` (new), `src/routes/me.settings.tsx` (only: mount it)
- `src/test/db/web-push.db.test.ts`

## Read first
`src/lib/web-push-client.ts`, `docs/decisions.md`, migrations 0001 to 0008 (a push subscription table may already exist: extend it, do not duplicate), `wrangler.jsonc` (is `nodejs_compat` on?).

## Build
1. **Table** `push_subscription`: `id`, `customer_id` (the guest, cascade), `endpoint text unique`, `p256dh`, `auth`, `user_agent` (max 200), `created_at`, `last_success_at`, `failed_at`. Policy: a guest sees and changes only their own rows; the owner role never reads keys. Server-side only function `push_reach(p_restaurant_id uuid)` SECURITY DEFINER returns how many members of that restaurant have a subscription and valid marketing consent (a number only, never the keys). Operator context save and restore as in 0013.
2. **Sender.** The common `web-push` package needs Node APIs and may not run on Cloudflare Workers. Pick a Web Push (VAPID, RFC 8030 and 8291 encryption) implementation that does run on Workers, pin the exact version, confirm the licence is MIT or Apache 2.0, and say which in the handoff. Interface: `PushChannel.send(subscription, payload) -> delivered | gone | retry | failed`. A `gone` result (404 or 410) removes the subscription. VAPID keys come from `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in the environment. If they are missing, sending refuses with a clear error and the opt-in screen explains that push is not set up yet. Also add a small script `scripts/make-vapid-keys.mjs` that prints a new key pair to the terminal only (never to a file).
3. **Server functions:** `subscribePush`, `unsubscribePush`, `getPushState` for the signed in guest (rate limit bucket `push-subscribe`, 10 per hour). Validate the endpoint is https and under 500 characters and keys are the right length.
4. **Service worker** `public/sw.js`: show the notification with title, body and a link that opens the restaurant page or claim code, handle click, no tracking.
5. **Guest screen:** `PushOptIn` in the guest settings: explains in one plain sentence what they will get, a button to turn on, and a clear way to turn off. On iPhone, when the page is not installed to the home screen, show the "Add to Home Screen first" steps instead of a button that cannot work. Per restaurant marketing consent stays separate (a guest can allow push on the device and still have consent only for the restaurants they chose).

## Tests
- Real database: a guest can add and remove only their own subscription; another guest and any owner cannot read keys; endpoint uniqueness; `push_reach` counts only members with consent and a subscription and does not leave operator power on.
- Unit with a mocked push service: success, 410 removes, 429 and 5xx return `retry`, missing VAPID refuses, payload size limit, iPhone detection wording.
- Text test of the migration as AGENTS.md requires.
