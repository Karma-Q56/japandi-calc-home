# Patron build prompts (Phases A to C)

One file per phase. Each is short because the shared rules live in the skill `patron-phase-builder` (`.agents/skills/patron-phase-builder/`) and in AGENTS.md. Each prompt lists the exact files that phase owns, its own migration number and its own branch, so several can be built at the same time without colliding.

## How to send a prompt to Freebuff

Send one message per prompt, in this form (change the file name):

> Load the skill patron-phase-builder first. Then read docs/prompts/D10-publish.md and do exactly what it says. Reply in the handoff format from the skill.

Then send the next prompt in a new Freebuff conversation (one conversation per prompt keeps each branch clean). When a branch is pushed, tell Claude the branch name. Claude fetches it, applies the migration to the preview database, tests as the restricted role, fixes what is left, merges it into `claude/fix-regressions` and confirms the GitHub check is green.

## Waves

A wave can start as soon as everything it depends on has been merged into `claude/fix-regressions`. Inside a wave, send all the prompts at once.

| Wave | Prompt | Branch | Migration | Needs |
|---|---|---|---|---|
| 1 | D10 Publish, unpublish, show in Find | `freebuff/live-publish` | 0014 | none |
| 1 | D11 Branch-ready data | `freebuff/locations-data` | 0015 | none |
| 1 | D12a Reward types and till wording | `freebuff/reward-types` | 0016 | none |
| 1 | D12e Specials live | `freebuff/specials-live` | 0020 | none |
| 1 | D13a Settings, Activity log, Feedback, Ideas | `freebuff/owner-admin` | 0022 | none |
| 1 | D15 New campaign, credit, lists | `freebuff/campaigns-live` | 0026 | none |
| 1 | D17 Web push | `freebuff/web-push` | 0028 | none |
| 1 | D18 Operator console | `freebuff/operator-console` | 0029 | none |
| 2 | D12b Bonus rules and tiers | `freebuff/bonus-rules` | 0017 | D12a |
| 2 | D12c Challenges and referrals | `freebuff/challenges-referrals` | 0018 | D12a |
| 2 | D12d Spin wheel | `freebuff/spin-wheel` | 0019 | D12a |
| 2 | D13b Card design, Your page, logo, logo on QR | `freebuff/card-design-logo` | 0023 | D12a |
| 2 | D13c Till order capture | `freebuff/till-orders` | 0024 | D12a, D13a |
| 3 | D12f Try-this-dish challenge | `freebuff/dish-challenge` | 0021 | D12c, D13c |
| 3 | D14 Insights live | `freebuff/insights-live` | 0025 | D13c |
| 3 | D16 Sending (SMS and push) | `freebuff/sending` | 0027 | D15, D17 |
| 3 | D19 Find directory | `freebuff/find-live` | 0030 | D10, D13b |
| 4 | D20 Branches | `freebuff/branches` | 0031 | D10, D11, D13a, D14, D19 |
| 4 | D21 Plans and payments | `freebuff/billing` | 0032 | D18 (best after D20) |
| end | D22 Launch checklist | none | none | everything |

Migration numbers are reserved per prompt. Gaps are harmless (migrations run in file name order), so a phase that ends up needing no migration just leaves its number unused.

## If Freebuff can only do a few at a time

Send in this order: D10, D12a, D13a, D15, D11, D12e, D17, D18. These are on the longest chains (D12a unlocks five phases, D15 and D17 unlock sending).

## How the parallel work stays clean

- Every prompt owns a short list of files. Nobody else edits them.
- Server function wrappers go in each phase's own new file, never in `src/server/live.ts`.
- Shared extension points are small lists that each phase appends one line to: `visitHooks` and `orderHooks` in `src/server/live-after-visit.ts`. Claude resolves any one-line conflict when merging.
- A phase that needs something in a file it does not own writes it under "Needs from another phase" in its handoff. Claude wires those pieces together after each wave (for example mounting the suburb and category pickers from D19 into Settings and Your page).
- Only one phase ever replaces `record_stamp()` (D12a). Everything else hooks in after it.
- Tests that touch the real database run on GitHub automatically for every push. Freebuff does not need a database.

## Choices already made (so prompts do not reopen them)

- Reward kinds everywhere: bonus stamps, free item, percentage off, rand amount off.
- Challenge kinds: visit N times in D days, quiet-day challenge, try this dish.
- One loyalty card per brand across branches.
- Logos are stored in the database for now (no new storage service) and appear on the guest card and in the middle of the QR code.
- Payments: PayFast first behind a provider interface; invoices for the managed plan.
- Push first, WhatsApp later through the same channel interface.
- Find lists Patron restaurants only.
