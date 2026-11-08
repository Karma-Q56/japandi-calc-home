# D12a: Reward types, and the till says exactly what to give

Wave 1 (start now) | Branch: `freebuff/reward-types` | Migration: 0016 | Depends on: nothing

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
Every reward in Patron has a kind: a free item, a percentage off, or a rand amount off. The owner chooses it for the main stamp card, and the till and the guest card both show exactly what staff must give. This is the foundation that challenges, referrals, the wheel and bonus rules all reuse (D12b to D12f), so keep it small, clean and well tested.

## You own these files (touch nothing else)
- `db/migrations/0016_reward_types_dev.sql`
- `src/server/live-loyalty.ts`, `src/lib/live-loyalty.ts`, `src/server/live-till.ts` (only `lookupGuest` and `redeemRewardAs`, plus the one hook described in step 6), `src/lib/till-messages.ts`
- `src/server/live-after-visit.ts` (new), `src/lib/reward-copy.ts`
- `src/components/patron/LiveTill.tsx`
- `src/routes/app.loyalty.tsx`, `src/routes/r.$slug.card.tsx` (only the "Rewards waiting" text)
- `src/components/patron/live/LiveStampCardTab.tsx`, `LiveToolsTab.tsx`, `LiveTiersTab.tsx`, `LiveWheelTab.tsx` (new)
- `src/test/db/reward-types.db.test.ts` and the unit tests for the above

## Build
1. **Migration, restaurant:** `reward_kind text not null default 'free_item'` (check: free_item, percent_off, amount_off), `reward_percent_off smallint` (1 to 100), `reward_amount_off_cents integer` (above 0), `reward_valid_days smallint` (1 to 365, null means no expiry). A table check ties kind to the value that must be present.
2. **Migration, reward:** the same `kind`, `percent_off`, `amount_off_cents`, plus `source text not null default 'stamp_card'` (stamp_card, challenge, referral, spin, birthday, tier, mystery, special), `source_id uuid`, `expires_at timestamptz`.
3. **`grant_reward(...)`**: a SECURITY DEFINER function other functions use to create any reward (restaurant, membership, kind, description, percent, amount cents, source, source id, valid days). `revoke all from public` and do NOT grant it to app_user: only other SECURITY DEFINER functions call it. Test that app_user cannot execute it.
4. **`record_stamp`**: `create or replace` it in your migration. It is defined only in `db/migrations/0001_patron_schema.sql` (line 370, mirrored in `db/schema.sql`), so copy that definition and never edit 0001. Change only the reward creation so it uses the restaurant's reward kind and value and sets `expires_at` from `reward_valid_days`. Signature, checks and idempotency stay identical. Redeeming an expired reward is refused with `reward_expired`.
5. **Owner screen:** the Stamp card tab (`LiveStampCardTab`) lets the owner pick Free item, Percent off or Rand amount off, enter the value, optionally "valid for N days", and see the exact sentence the guest will read. Save through the existing loyalty settings path. In `app.loyalty.tsx` wire all four live tabs (Stamp card, Rewards, Tiers, Spin) to separate component files. Create `LiveToolsTab`, `LiveTiersTab` and `LiveWheelTab` as plain "This part of Loyalty is being built" empty states in live mode; other phases fill them. Demo mode is untouched.
6. **Hook for later phases:** create `src/server/live-after-visit.ts` exporting `visitHooks: VisitHook[] = []` (a hook is `(tx, membershipId, stampEventId) => Promise<void>`) and call every hook, in order, inside the same transaction right after a successful stamp in `recordStampAtTill`. Later phases each add one line to this list.
7. **Till:** `lookupGuest` returns each available reward with its kind, value and expiry. The redeem screen shows one large line from `reward-copy.ts` above the Redeem button: "Give: a free coffee", "Take 10% off the bill", "Take R20 off the bill". Expired rewards show as expired with no Redeem button.
8. **Guest card:** "Rewards waiting" shows the same wording and "Use by 30 Nov" when there is an expiry.

## Tests
- Real database: kind and value checks (percent 0 and 101 refused, negative amount refused, mismatched kind and value refused); a completed card creates a reward of the owner's chosen kind; expiry is set; expired reward refused at redeem; restaurant B cannot redeem A's reward; app_user cannot execute `grant_reward`; operator power not left on.
- Unit: `reward-copy.ts` sentences for all three kinds including singular and plural and rand formatting; the visit hook list runs in order and a failing hook rolls back the stamp.
- Text test of the migration as AGENTS.md requires.

## Not in this phase
Bonus rules and tiers (D12b), challenges and referrals (D12c), the wheel (D12d), specials (D12e).
