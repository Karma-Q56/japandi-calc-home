# D13c: Record what guests order at the till

Wave 2 (start after D12a is merged) | Branch: `freebuff/till-orders` | Migration: 0024 | Depends on: D12a (and D13a for the setting)

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
After staff stamp a guest, they can tap what the guest had, in about two seconds. This is what lets owners know what guests like to eat, and it powers Insights (D14) and the "Try this dish" challenge (D12f). It only appears when the owner turned on "Orders at the till" in Settings.

## You own these files (touch nothing else)
- `db/migrations/0024_till_orders_dev.sql`
- `src/server/live-till-orders.ts`, `src/server/live-till-orders-fns.ts`, `src/lib/live-till-orders.ts` and tests
- `src/components/patron/live/TillOrderStep.tsx` (new)
- `src/components/patron/LiveTill.tsx` (only: mount the step after a successful stamp)
- `src/server/live-after-visit.ts` (only: add the order hook list `orderHooks`, empty, used by D12f)
- `src/test/db/till-orders.db.test.ts`

## Read first
`src/domain/orders.ts` (demo behaviour), the "Orders at the till" section of the demo Settings and the demo till screen, `src/server/live-till.ts` (how a stamp returns its id), migration 0022 (D13a adds `restaurant.orders_at_till`; if it is not merged yet, read the column name from the D13a prompt and assume it exists).

## Build
1. **Table `visit_item`**: `id`, `restaurant_id` (cascade), `stamp_event_id` (references the visit stamp), `menu_item_id`, `quantity smallint` (1 to 20), `created_at`, unique `(stamp_event_id, menu_item_id)`. Tenant policy, grants select and insert only. A trigger or function check makes sure the stamp event and menu item belong to the same restaurant.
2. **`record_visit_items(p_stamp_event_id uuid, p_items jsonb)`** SECURITY DEFINER: the caller's restaurant must own the stamp, the stamp must be recent (within 15 minutes) and valid, at most 12 distinct items, every item must belong to the restaurant and be available. Calling it again for the same stamp replaces the earlier list (so a staff mistake can be fixed inside the window). Write nothing when the list is empty.
3. **Server:** same staff checks as the other till actions (valid till device and staff cookies, staff still active, rate limit bucket `till-order` per device), then call the function. Run `orderHooks` after it succeeds.
4. **Till screen:** after a successful stamp, if the restaurant has orders at the till on, show "What did they have?" with the restaurant's available menu items as large tap targets (sections as simple headings), a count stepper per chosen item, one primary "Save" and a plain "Skip". Skip must be as easy as Save: the queue at the till is moving. When the setting is off nothing changes at the till.
5. Guest profile (owner side) shows the most ordered items for that guest, read from `visit_item`, only when data exists. Do not edit the customers route: expose a server function `getGuestFavourites(customerId)` and say in your handoff where it should be shown.

## Tests
- Real database: items accepted for a recent stamp of the same restaurant; refused for another restaurant's stamp, an old stamp, an unavailable or foreign item, more than 12 items; replace works; B cannot read A's orders; staff of A cannot write for B.
- Unit: order list validation, till screen shows nothing when setting off, Skip never blocks.
- Text test of the migration as AGENTS.md requires.
