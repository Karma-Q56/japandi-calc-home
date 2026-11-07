# D12b: Bonus rules and tiers (live)

Wave 2 (start after D12a is merged) | Branch: `freebuff/bonus-rules` | Migration: 0017 | Depends on: D12a

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
Make the loyalty tools that exist only in the demo real: double stamp days, visit streaks, the shared monthly bonus budget, the birthday reward, the mystery reward and guest tiers. The demo code is the specification. Live mode must give the same answers as demo for the same situations.

## You own these files (touch nothing else)
- `db/migrations/0017_bonus_rules_dev.sql`
- `src/server/live-tools.ts`, `src/server/live-tools-fns.ts`, `src/lib/live-tools.ts` and tests
- `src/components/patron/live/LiveToolsTab.tsx`, `LiveTiersTab.tsx` (replace the D12a placeholders)
- `src/server/live-after-visit.ts` (add exactly one line to `visitHooks`)
- `src/test/db/bonus-rules.db.test.ts`

## Read first (the specification)
`src/domain/tools.ts` (double stamp day, streak, budget), `src/domain/loyalty.ts` (tiers, birthday reward, mystery reward), `src/domain/grants.ts` (how bonus stamps are recorded and kept from double counting). Do not invent rules that are not there. All weekday and "this month" logic uses Africa/Johannesburg time (see `src/lib/johannesburg-time.ts`).

## Build
1. **Settings storage.** Add the columns or one small settings table the rules need (weekdays and multiplier for double stamp days, streak length and window and bonus, monthly bonus budget, birthday reward and mystery reward each with a reward kind and value from D12a, tier thresholds with defaults Regular at 3 visits and VIP at 8 visits in the last 90 days). Check constraints on every number.
2. **`apply_visit_bonuses(p_membership_id uuid, p_stamp_event_id uuid) returns integer`** SECURITY DEFINER, called from the visit hook after each stamp. It never double pays: one bonus per rule per visit or period, enforced by a unique key on the bonus stamp event or reward, so retries are harmless. Double stamp days never stack with another multiplier. The shared monthly budget stops all bonus stamps once spent. Birthday and mystery rewards are created with `grant_reward` from D12a.
3. **`member_tier(p_membership_id uuid)`** returning New face, Regular or VIP from visits in the last 90 days using the restaurant's thresholds.
4. **Server:** `getTools`, `saveTools` (owner or manager only, validated, rate limited bucket `tools-save` 20 per hour), `getTiers`, `saveTiers`.
5. **Screens (live mode):** fill the Rewards (tools) tab and the Tiers tab using the same fields and wording as the demo tabs. Each tool has a switch, plain numbers, and a one-line preview of what a guest will see. Show the budget used so far this month.
6. Add the hook line to `visitHooks` and nothing else in `live-after-visit.ts`.

## Tests
- Real database, each rule with explicit timestamps and no dependence on today's date: double stamp on a chosen weekday and not on others; no stacking; streak pays once per run; budget cap stops bonuses; birthday reward once per year; mystery reward once; tier boundaries at 2, 3, 7, 8 visits and the 90 day edge; retry of the same visit pays nothing extra; restaurant B cannot read or change A's settings.
- Parity: for each demo case in `src/test/tools.test.ts` and `src/test/loyalty-rules.test.ts`, add a live case that expects the same numbers.
- Text test of the migration as AGENTS.md requires.

## Not in this phase
Challenges, referrals (D12c), the wheel (D12d), specials (D12e).
