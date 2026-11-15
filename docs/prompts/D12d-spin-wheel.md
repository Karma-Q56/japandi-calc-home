# D12d: Spin wheel (live)

Wave 2 (start after D12a is merged) | Branch: `freebuff/spin-wheel` | Migration: 0019 | Depends on: D12a

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
The spin wheel works for real. The server decides every result (the browser only animates it), prizes can be bonus stamps, a free item, a percentage off or a rand amount off, and no guest can spin more than they have earned.

## You own these files (touch nothing else)
- `db/migrations/0019_spin_wheel_dev.sql`
- `src/server/live-wheel.ts`, `src/server/live-wheel-fns.ts`, `src/lib/live-wheel.ts` and tests
- `src/components/patron/live/LiveWheelTab.tsx` (replace the D12a placeholder)
- `src/components/patron/SpinWheel.tsx`, `SpinWheelSvg.tsx` (only to connect the live result, keep the look)
- `src/components/patron/GuestSpin.tsx` (new) and `src/routes/me.restaurants.$slug.tsx` (only: mount it)
- `src/server/live-after-visit.ts` (add one line to `visitHooks` for earned spins)
- `src/test/db/spin-wheel.db.test.ts`

## Read first (the specification)
`src/domain/spins.ts` (modes `join`, `earned`, `reward_decider`, up to 8 prizes, how a spin is chosen), `src/lib/wheel.ts`, the `spin_result` table in migration 0003, the reward model from D12a.

## Build
1. **Storage.** Wheel settings per restaurant (enabled, mode, earn every N visits) and up to 8 prizes each with a label, a weight, and a reward (stamps, free item, percent off, rand amount off). A table check keeps prizes at 8 or fewer. Spin credits per member (earned, used).
2. **`spin_wheel(p_membership_id uuid)`** SECURITY DEFINER. Refuses when the member has no unused spin. Picks the prize with a weighted random choice done in SQL, writes the result and uses up one spin in the same transaction, and gives the prize through `grant_reward` or as bonus stamps. A repeated request with the same spin id returns the same result and never pays twice.
3. **Credits.** Join mode gives one spin when a guest joins. Earned mode gives one spin every N recorded visits through a hook. Reward decider mode follows the demo.
4. **Owner screen (live mode):** the Spin tab: enable switch, mode, prize editor (add, remove, weight, reward type and value), a plain probability preview ("About 1 spin in 5 wins a free coffee"), and a "Test the wheel" button that never uses a guest's spin or creates a reward.
5. **Guest side:** a Spin button on the guest's restaurant page when they have a spin; the wheel animates to the result the server returned.

## Tests
- Real database: a member with no spin is refused; the same spin id twice pays once; weights respected over many draws (use a seeded or very large sample with a loose tolerance); all four prize types create the right thing; more than 8 prizes refused; restaurant B cannot read or change A's wheel; a guest of A cannot spin B's wheel.
- Unit: probability sentence, form validation, error mapping.
- Text test of the migration as AGENTS.md requires.
