# Patron build prompts (Phases A to C)

One file per phase. Each is short because the shared rules live in the skill `patron-phase-builder` (`.agents/skills/patron-phase-builder/`) and in AGENTS.md. Each prompt lists the exact files that phase owns, its own migration number and its own branch, so several can be built at the same time without colliding.

## How to send a prompt to Freebuff

Send one message per prompt, in this form (change the prompt file and the branch name from the table below):

> Load the skill patron-phase-builder first. Then run `git fetch origin` and create your branch from the latest main line: `git checkout -b <branch from the table> origin/claude/fix-regressions` (never start from an older freebuff branch). Read docs/prompts/<prompt file> and do exactly what it says, in one run, without stopping to ask or waiting for "continue". Work only on that one branch: do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests). Push the branch when you are done, read the GitHub check result, fix any failure, and reply in the handoff format from the skill.

One Freebuff conversation per prompt keeps each branch clean. When a branch is pushed, tell Claude the branch name. Claude fetches it, tests the database on the dev Neon branch, fixes what is left, merges it into `claude/fix-regressions` and confirms the GitHub check is green. Claude then deletes the finished git branch and its Neon preview branch.

## Neon branch budget (limit 10, we keep at most 5)

Neon makes one database branch for every git branch that is pushed. Always kept: `production`, `preview/claude/fix-regressions` and the dev branch `preview/freebuff/b8bfff...` (it has every migration applied). That leaves room for 2 Freebuff prompt branches at the same time, so send at most 2 prompts at once until the Vercel and Neon setting that creates a database branch for every preview is turned off.

## One prompt, one run

Each prompt is meant to be built, tested and handed off in a single run without anyone typing "continue". Freebuff makes its own choices, lists them under "Decisions I made", and stops only for production, money, real guests' data or something that cannot be undone. Freebuff works only on its one named git branch and never creates Neon, Vercel or extra GitHub resources (the Neon project is limited to 10 branches and every pushed git branch already gets one).

## Waves

A wave can start as soon as everything it depends on has been merged into `claude/fix-regressions`. Inside a wave, send all the prompts at once.

| Wave | Prompt | Branch | Migration | Needs | Status |
|---|---|---|---|---|---|
| 1 | D10 Publish, unpublish, show in Find | `freebuff/live-publish` | 0014 | none | Done (merged 8 Nov) |
| 1 | D11 Branch-ready data | `freebuff/locations-data` | 0015 | none | Done (merged 8 Nov) |
| 1 | D12a Reward types and till wording | `freebuff/reward-types` | 0016 | none | Done (merged 8 Nov) |
| 1 | D12e Specials live | `freebuff/specials-live` | 0020 | none | Done (merged 8 Nov) |
| 1 | D13a Settings, Activity log, Feedback, Ideas | `freebuff/owner-admin` | 0022 | none | Done (merged 10 Nov) |
| 1 | D15 New campaign, credit, lists | `freebuff/campaigns-live` | 0026 | none | Done (merged 10 Nov) |
| 1 | D17 Web push | `freebuff/web-push` | 0028 | none | Done (merged 8 Nov) |
| 1 | D18 Operator console | `freebuff/operator-console` | 0029 | none | Done (merged 8 Nov) |
| 2 | D12b Bonus rules and tiers | `freebuff/bonus-rules` | 0017 | D12a | Done (merged 8 Nov) |
| 2 | D12c Challenges and referrals | `freebuff/challenges-referrals` | 0018 | D12a | Done (merged 8 Nov) |
| 2 | D12d Spin wheel | `freebuff/spin-wheel` | 0019 | D12a | To do |
| 2 | D13b Card design, Your page, logo, logo on QR | `freebuff/card-design-logo` | 0023 | D12a | Done (merged 10 Nov) |
| 2 | D13c Till order capture | `freebuff/till-orders` | 0024 | D12a, D13a | Done (merged 10 Nov) |
| 3 | D12f Try-this-dish challenge | `freebuff/dish-challenge` | 0021 | D12c, D13c | To do |
| 3 | D14 Insights live | `freebuff/insights-live` | 0025 | D13c | To do |
| 3 | D16 Sending (SMS and push) | `freebuff/sending` | 0027 | D15, D17 | To do |
| 3 | D19 Find directory | `freebuff/find-live` | 0030 | D10, D13b | To do |
| 4 | D20 Branches | `freebuff/branches` | 0031 | D10, D11, D13a, D14, D19 | To do |
| 4 | D21 Plans and payments | `freebuff/billing` | 0032 | D18 (best after D20) | To do |
| end | D22 Launch checklist | none | none | everything | At the end |

Migration numbers are reserved per prompt. Gaps are harmless (migrations run in file name order), so a phase that ends up needing no migration just leaves its number unused.

Status as of 10 Nov: the database changes for the done prompts are also applied to the Neon preview branch and tested as the restricted app role. Done does not mean walked through in a browser yet, and the screens for some are still to be checked.

## If Freebuff can only do a few at a time

Send the ones still to do in this order: D14 and D16 (D14 needs D13c, D16 needs D15 and D17, all done), then D19 and D12d, then D12f and D20, then D21. D12d needs only D12a. See SEND-ORDER.md for the exact messages. Never more than 2 open at once.

## How the parallel work stays clean

- Every prompt owns a short list of files. Nobody else edits them.
- Server function wrappers go in each phase's own new file, never in `src/server/live.ts`.
- Shared extension points are small lists that each phase appends one line to: `visitHooks` and `orderHooks` in `src/server/live-after-visit.ts`. Claude resolves any one-line conflict when merging.
- A phase that needs something in a file it does not own writes it under "Needs from another phase" in its handoff. Claude wires those pieces together after each wave (for example mounting the suburb and category pickers from D19 into Settings and Your page, and adding plain wording for new audit action names such as `restaurant_published`).
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
