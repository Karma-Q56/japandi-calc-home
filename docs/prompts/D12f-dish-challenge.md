# D12f: "Try this dish" challenge

Wave 3 (start after D12c and D13c are merged) | Branch: `freebuff/dish-challenge` | Migration: 0021 | Depends on: D12c, D13c

First load the skill `patron-phase-builder` (`/skill:patron-phase-builder`) and follow it. Standing rules are in AGENTS.md.

## Goal
Add the third challenge kind. The owner picks a menu item (or a whole menu section) and a count, for example "Order the peri-peri chicken twice this month". It is counted from what staff record at the till (D13c), and its reward can be any of the four reward types (bonus stamps, free item, percent off, rand amount off) exactly like the other challenge kinds.

## You own these files (touch nothing else)
- `db/migrations/0021_dish_challenge_dev.sql`
- `src/server/live-challenges.ts`, `src/lib/live-challenges.ts` (extend; D12c created them) and their tests
- `src/routes/app.challenges.tsx` (the kind picker and form only)
- `src/components/patron/GuestChallenges.tsx` (progress wording only)
- `src/test/db/dish-challenge.db.test.ts`

## Build
1. **Migration:** allow `kind = 'try_item'` on `challenge`, add `menu_item_id` and `menu_section_id` (one of them required for this kind, both must belong to the same restaurant, enforced), and a required count. Update the table check so each kind has exactly the columns it needs.
2. **Progress:** extend `challenge_progress` to count `visit_item` rows (from D13c) for the chosen item or section within the challenge window. Items ordered before the challenge started do not count. One claim per member, idempotent, rewards through `grant_reward` or bonus stamps as in D12c.
3. **Hook:** make sure `evaluateChallenges` runs after the order is recorded, not only after the stamp. D13c exposes a second hook list for order events; add one line there.
4. **Owner form:** the kind picker gets a third choice, "Try this dish", with a menu item or section picker from the live menu (only available items), the count, the window and the reward picker. Preview sentence: "Order the Peri-peri chicken 2 times in 30 days and get R20 off."
5. **Guest card:** progress reads "1 of 2 ordered".

## Tests
- Real database: counts only the chosen item or section; ignores orders from before the start and from other restaurants; section challenges count every item in that section; a menu item from another restaurant is refused; claim once; all four reward types; restaurant B cannot see A's challenge.
- Unit: wording, validation.
- Text test of the migration as AGENTS.md requires.
