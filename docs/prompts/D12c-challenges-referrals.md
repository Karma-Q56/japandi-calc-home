# D12c: Challenges (two kinds) and referrals, with all reward types (live)

Wave 2 (start after D12a is merged) | Branch: `freebuff/challenges-referrals` | Migration: 0018 | Depends on: D12a

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
Challenges and referrals work for real, and their rewards are not limited to stamps. Every challenge and every referral can reward: bonus stamps, a free item, a percentage off, or a rand amount off. Challenges come in two kinds in this phase: "Visit N times in D days" (exists in demo) and "Quiet-day challenge" (visit N times in D days but only on the weekdays, and optionally the hours, the owner picks, to fill slow times). A third kind, "Try this dish", comes later in D12f.

## You own these files (touch nothing else)
- `db/migrations/0018_challenges_referrals_dev.sql`
- `src/server/live-challenges.ts`, `src/server/live-referrals.ts`, their `-fns.ts` wrappers, `src/lib/live-challenges.ts`, and tests
- `src/routes/app.challenges.tsx`, `src/routes/app.referrals.tsx`
- `src/components/patron/ChallengeRow.tsx`, `src/components/patron/GuestChallenges.tsx` (new), `src/components/patron/ReferralShare.tsx` (new)
- `src/routes/r.$slug.card.tsx` (only: mount `GuestChallenges` and `ReferralShare`)
- `src/routes/r.$slug.join.tsx` (only: read `?ref=CODE` and record it)
- `src/server/live-after-visit.ts` (add your lines to `visitHooks`, one per hook)
- `src/test/db/challenges-referrals.db.test.ts`

## Read first (the specification)
`src/domain/loyalty.ts` (`challengeProgress`, `evaluateChallenges`, `saveChallenge`), `src/domain/referrals.ts` (all of it), the `challenge` table in migration 0003, `src/lib/reward-copy.ts` and the reward model from D12a. Weekday logic uses Africa/Johannesburg time.

## Build
1. **Challenges.** Extend the `challenge` table: `kind` ('visits' or 'quiet_days'), `weekdays smallint[]`, `start_hour` and `end_hour` (nullable, for quiet days), and a reward: `reward_type` ('stamps', 'free_item', 'percent_off', 'amount_off') with the matching value columns and optional `valid_days`. Constraints so a row cannot be half filled. Progress is computed from stamp events by `challenge_progress(p_membership_id)`. A challenge is claimed once per member (as in demo), the claim is idempotent and uses `grant_reward` for non-stamp rewards.
2. **Referrals.** Tables for a member's share code and each referral (referrer, new member, status, rewarded at). Restaurant settings: enabled, monthly limit per member, and one reward for the referrer and one for the new guest, each using the four reward types. A referral is rewarded when the new guest's first valid stamp is recorded, exactly once. A member cannot refer themselves or a phone number that already has a card at that restaurant.
3. **Hooks.** Add `evaluateChallenges` and `awardReferralOnFirstStamp` to `visitHooks`.
4. **Owner screens (live mode):** Challenges list with create, edit, pause; the form has a kind picker (two kinds), the rule fields, and a reward picker (four types) with a one-line preview of what the guest reads. Referrals settings page with enabled switch, limit, and the two reward pickers, plus the overview numbers the demo page shows. Both pages keep `LoyaltyTabs`.
5. **Guest card:** `GuestChallenges` shows active challenges with progress and the reward wording; `ReferralShare` shows the guest's link and code with a Copy button. Join reads `?ref=CODE`.

## Tests
- Real database: both challenge kinds with explicit timestamps (quiet-day visits on the wrong weekday or hour do not count); one claim per member; each of the four reward types creates the right thing; referral rewards exactly once, on the first stamp only; self referral and existing member refused; monthly limit; restaurant B cannot see or change A's challenges or referrals; a retry never doubles a reward.
- Unit: wording of every reward type, form validation, code to message mapping.
- Text test of the migration as AGENTS.md requires.

## Not in this phase
The wheel (D12d), specials (D12e), the dish challenge (D12f).
