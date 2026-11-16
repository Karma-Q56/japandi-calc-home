# Patron: the messages to send to Freebuff, in order

This file is the whole send order. Every message is ready to copy and paste. Send them in the order below, two at a time, one Freebuff conversation per message.

## How it works (read this once)

1. Each message makes Freebuff start a new branch from the latest `claude/fix-regressions`, load the `patron-phase-builder` skill, read `AGENTS.md` and `docs/prompts/README.md`, then do one prompt from start to finish.
2. Never have more than 2 Freebuff branches open at once. Neon makes a database branch for every pushed git branch and we keep 5 at most (production, `preview/claude/fix-regressions`, the dev branch `preview/freebuff/b8bfff...`, and 2 for Freebuff). The old preview branches of finished Freebuff branches must be deleted before round 7 so the limit of 10 is never hit.
3. Freebuff does not need any Neon branch or database. GitHub runs the database tests on every push. The dev Neon branch already has every migration up to 0035 except the reserved 0031 (D20), applied by Claude. I apply each new migration to it after I merge.
4. When Freebuff finishes, send me the branch name and paste its handoff reply (use the "Message to Claude" at the end of this file). I then fetch the branch, test the database as the restricted app role, fix what is left, merge it into `claude/fix-regressions`, check that GitHub is green, and tell you the slot is free.
5. When I say a slot is free, delete the finished branch on GitHub (Branches page, trash icon). My session is not allowed to delete git branches. I will remove the matching Neon preview branch myself if I am allowed, and I will tell you if I am not.
6. If one prompt of a pair finishes early, you can send the next message as soon as I tell you its slot is free. You do not have to wait for the other one.

## The order at a glance

| Round | Messages | Why this order |
|---|---|---|
| 1 | 1A D13a Settings, Activity log, Feedback, Ideas. 1B D15 New campaign, credit, lists | Other prompts need these two first (D13c needs D13a, D16 needs D15) |
| 2 | 2A D13c Till orders. 2B D13b Card design, logo, QR logo | D13c needs D13a. D13b is on the path to Find |
| 3 | 3A D14 Insights. 3B D16 Sending | Done and merged 11 Nov |
| 4 | 4B D12d Spin wheel. 4C D13b2 Finish card design and Your page. 4D D16b Finish sending (4A D19 is done) | Done: Claude built all three on 12 to 14 Nov while Freebuff was offline. Do not send them |
| 5 and 6 | D12f Try-this-dish, D21 Plans and payments | Done (14 Nov). Do not send |
| 7 | 7A D20 Branches (live and demo). 7B D23 Operator console live, part 1 | Independent of each other. D23 unlocks rounds 8 and 9 |
| 8 | 8A D24 Operator console live, part 2. 8B D25 Billing finish | Both need D23 merged |
| 9 | 9A D26 Venue pickers and page address. 9B D27 Small fixes | D26 needs D23 merged and touches Settings after D20 |
| 10 | 10A D28 Look and feel | Alone: restyles shared CSS and components |
| 11 | 11A D29 Test everything and write the findings | Alone, last: tests the finished product |
| After | D22 launch checklist, the polish pass, production go-live | Claude and Karma, not Freebuff |

Already built, so do not send them again (D12d, D13b2 and D16b were built by Claude and wait for the merge to the main line): D10, D11, D12a, D12b, D12c, D12e, D13a, D13b, D13c, D14, D15, D16, D17, D18, D19 (rounds 1, 2 and 3 are done as of 11 Nov). D13b and D16 were merged with some items missing, so two follow-up messages (4C and 4D) finish them. Rounds 5 and 6 are also done. Start at round 7.

## Always do this first

Before round 1 and before every round after, check that the previous round is merged (I will tell you). Messages say "latest main line" so Freebuff pulls whatever is newest at that moment.


---

## Round 1

Send these two together. If you already sent the first message and it was for Settings (D13a), that was 1A, so only send 1B now.

### Message 1A: D13a: Settings, Activity log, Feedback and Ideas go live

Branch: `freebuff/owner-admin`. Prompt: `docs/prompts/D13a-owner-admin.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/owner-admin origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D13a-owner-admin.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved".
> Step 5: work only on `freebuff/owner-admin`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.

### Message 1B: D15: New campaign, credit and saved lists go live

Branch: `freebuff/campaigns-live`. Prompt: `docs/prompts/D15-new-campaign-live.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/campaigns-live origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D15-new-campaign-live.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved".
> Step 5: work only on `freebuff/campaigns-live`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.


---

## Round 2

Send after round 1 is merged (D13c needs D13a).

### Message 2A: D13c: the till records what guests order

Branch: `freebuff/till-orders`. Prompt: `docs/prompts/D13c-till-orders.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/till-orders origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D13c-till-orders.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved".
> Step 5: work only on `freebuff/till-orders`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.

### Message 2B: D13b: stamp card and design in one place, logo, logo on the QR code

Branch: `freebuff/card-design-logo`. Prompt: `docs/prompts/D13b-stamp-card-design-logo-qr.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/card-design-logo origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D13b-stamp-card-design-logo-qr.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved".
> Step 5: work only on `freebuff/card-design-logo`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.


---

## Round 3

Send after round 2 is merged (D14 needs D13c).

### Message 3A: D14: Insights goes live (Guests and Performance tabs)

Branch: `freebuff/insights-live`. Prompt: `docs/prompts/D14-insights-live.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/insights-live origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D14-insights-live.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved".
> Step 5: work only on `freebuff/insights-live`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.

### Message 3B: D16: sending SMS and push (needs D15 and D17, both done by now)

Branch: `freebuff/sending`. Prompt: `docs/prompts/D16-sending.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/sending origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D16-sending.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved".
> Step 5: work only on `freebuff/sending`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.


---

## Round 4

Round 3 is merged (11 Nov). Message 4A (D19) is already done, so skip it. Send 4B and 4C first, then 4D when I say a slot is free.

### Message 4A: D19: the Find directory goes live (DONE 11 Nov, do not send)

Branch: `freebuff/find-live`. Prompt: `docs/prompts/D19-find-directory.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/find-live origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D19-find-directory.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved".
> Step 5: work only on `freebuff/find-live`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.

### Message 4B: D12d: the spin wheel goes live

Branch: `freebuff/spin-wheel`. Prompt: `docs/prompts/D12d-spin-wheel.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/spin-wheel origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D12d-spin-wheel.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved".
> Step 5: work only on `freebuff/spin-wheel`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.



### Message Message 4C: D13b2: finish the card design, Your page and scan proof (follow-up to D13b)

Branch: `freebuff/card-design-finish`. Prompt: `docs/prompts/D13b2-page-design-scan-proof.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/card-design-finish origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D13b2-page-design-scan-proof.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved".
> Step 5: work only on `freebuff/card-design-finish`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.

### Message Message 4D: D16b: finish sending (push channel, low-credit alert, Worker cron, STOP reply, missing tests)

Branch: `freebuff/sending-finish`. Prompt: `docs/prompts/D16b-sending-finish.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/sending-finish origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D16b-sending-finish.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved".
> Step 5: work only on `freebuff/sending-finish`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.

---

## Rounds 5 and 6 (done, do not send)

D12f (try-this-dish) and D21 (plans and payments) were built by Freebuff and merged and hardened by Claude on 14 Nov. They are on `claude/fix-regressions`. Do not send them again.

## What changed on 15 and 16 Nov (read this once)

Claude walked the whole product and found work that was missing or only half there: the operator console only works in demo mode (nothing shows the "Talk to us" enquiries, feedback or ideas in live mode, and nobody can approve a campaign or confirm a credit top-up in live mode), the billing page cannot be reached from the menu, branches do not exist anywhere yet (not even in demo), owners cannot choose a venue type or a clear address, nobody can change a page address, three links lose the audience when they open the campaign composer, and several look-and-feel problems remain. Rounds 7 to 11 fix all of that and end with a test of every screen. Everything that needs your own accounts (PayFast, the SMS provider, the mail provider, the domain, the lawyer, the accountant, prices) stays with you and is not in these prompts. The marketing website redesign is yours.

## Round 7

Send after the previous work is merged (it is as of 15 Nov). Two at once.

### Message 7A: D20: branches (several locations per restaurant, live and demo)

Branch: `freebuff/branches`. Prompt: `docs/prompts/D20-branches.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/branches origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D20-branches.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved". Whatever you fix or build on a live screen, do on the demo version of that screen too.
> Step 5: work only on `freebuff/branches`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.

### Message 7B: D23: operator console, live (part 1: restaurants, credit top-ups, invoices, refund record)

Branch: `freebuff/operator-live-a`. Prompt: `docs/prompts/D23-operator-live-restaurants.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/operator-live-a origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D23-operator-live-restaurants.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved". Whatever you fix or build on a live screen, do on the demo version of that screen too.
> Step 5: work only on `freebuff/operator-live-a`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.


---

## Round 8

Send after D23 is merged (both prompts use the operator pages D23 sets up). Two at once.

### Message 8A: D24: operator console, live (part 2: campaign approvals, enquiries, feedback, ideas, SMS outbox)

Branch: `freebuff/operator-live-b`. Prompt: `docs/prompts/D24-operator-live-inbox.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/operator-live-b origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D24-operator-live-inbox.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved". Whatever you fix or build on a live screen, do on the demo version of that screen too.
> Step 5: work only on `freebuff/operator-live-b`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.

### Message 8B: D25: billing finish (monthly payment, failed payment grace, banner, reachable billing page)

Branch: `freebuff/billing-finish`. Prompt: `docs/prompts/D25-billing-finish.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/billing-finish origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D25-billing-finish.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved". Whatever you fix or build on a live screen, do on the demo version of that screen too.
> Step 5: work only on `freebuff/billing-finish`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.


---

## Round 9

Send after round 8 is merged (D26 needs D23, and both touch Settings after D20 added its tab). Two at once.

### Message 9A: D26: venue type, address and suburb pickers, page address change with redirect

Branch: `freebuff/owner-pickers`. Prompt: `docs/prompts/D26-owner-pickers-and-page-address.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/owner-pickers origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D26-owner-pickers-and-page-address.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved". Whatever you fix or build on a live screen, do on the demo version of that screen too.
> Step 5: work only on `freebuff/owner-pickers`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.

### Message 9B: D27: small fixes (campaign links, visits today, demo dot, dead code)

Branch: `freebuff/small-fixes`. Prompt: `docs/prompts/D27-small-fixes.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/small-fixes origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D27-small-fixes.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. Use the design skills only on the new screens you build and never restyle existing screens. Buttons must look like buttons and never change their label to "Saving" or "Saved". Whatever you fix or build on a live screen, do on the demo version of that screen too.
> Step 5: work only on `freebuff/small-fixes`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.


---

## Round 10

Send after round 9 is merged. This one goes ALONE, because it restyles shared CSS and shared components.

### Message 10A: D28: look and feel (buttons, one tab style, wheel labels, card colours, lint)

Branch: `freebuff/look-and-feel`. Prompt: `docs/prompts/D28-look-and-feel.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/look-and-feel origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D28-look-and-feel.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. This one prompt IS allowed to restyle existing screens, but only in the ways its list says (button looks, one tab bar style, wheel labels, card colours, the till after the PIN, lint). Do not redesign anything else and do not touch the public marketing pages. Buttons must look like buttons and never change their label to "Saving" or "Saved". Fix live and demo together.
> Step 5: work only on `freebuff/look-and-feel`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.

---

## Round 11 (the last one)

Send after round 10 is merged. This one goes ALONE. It tests the finished product and writes down everything it finds. It does not fix anything.

### Message 11A: D29: test every screen, every control and every flow (demo and live) and write the findings file

Branch: `freebuff/walkthrough-test`. Prompt: `docs/prompts/D29-full-walkthrough-test.md`.

Paste this:

> Step 1: run `git fetch origin`, then create your branch from the latest main line: `git checkout -b freebuff/walkthrough-test origin/claude/fix-regressions`. Never start from an older freebuff branch.
> Step 2: load the skill `patron-phase-builder` (it is the file `.agents/skills/patron-phase-builder/SKILL.md`; if the skill command cannot find it, open that file and follow it). Then read `AGENTS.md` and `docs/prompts/README.md`.
> Step 3: read `docs/prompts/D29-full-walkthrough-test.md` and do exactly what it says. Do the whole prompt in one run: do not stop to ask me questions you can answer yourself and do not wait for me to say "continue". If you have to choose, pick the simplest option that follows AGENTS.md and list it under "Decisions I made" in your handoff. Only stop for production, real money, real guests' data, or something that cannot be undone.
> Step 4: follow the skill for how to build and test. You are a tester in this prompt: do not fix product bugs and do not edit anything under `src/`, `db/` or the existing `tests/e2e/`. Record every bug in the findings file and keep going. Test live and demo, and leave no option, text box, radio or button untouched.
> Step 5: work only on `freebuff/walkthrough-test`. Do not create other git branches, and do not create, change or delete anything in Neon or Vercel (you do not need a database, GitHub runs the database tests).
> Step 6: when the code is done, push the branch, read the GitHub check result for it, fix any failure, and push again until the check is green. Then reply in the handoff format from the skill.


---

## Message to Claude, after each Freebuff finishes

Paste this to me (change the branch name) together with Freebuff's full handoff reply:

> Freebuff finished `freebuff/owner-admin`. Here is its handoff: (paste it here)

I will fetch the branch, review it against the prompt and the skill, and tell you what happened.

## When Freebuff does something unexpected (copy and paste the reply)

**It stopped before the end, or says it will continue later:**

> Continue where you left off. Do not start over. Finish every remaining item under "Build" and "Tests" in your prompt, push, read the GitHub check, fix any failure, and then send the handoff. If you really run out of room, push what you have and list what is left under "Not done".

**It asks a question that is not about production, money, real guests' data or something permanent:**

> Choose the simplest option that follows AGENTS.md, do it, and list the choice under "Decisions I made". Do not wait for me. Carry on with the rest of the prompt.

**It cannot find the skill:**

> Run `git fetch origin` and make sure your branch started from `origin/claude/fix-regressions`. The skill is the file `.agents/skills/patron-phase-builder/SKILL.md`. Open it and follow it, and also read `AGENTS.md` and `docs/prompts/README.md`.

**The GitHub check failed:**

> Open the failing GitHub check for your branch, read the first failing step and test, fix the cause (not by deleting or skipping the test), push, and check again. Repeat until it is green. Then send the handoff.

**It restyled an existing screen, renamed things, or hid a page:**

> Undo the changes to screens that are not listed under "You own these files" in your prompt. Keep the existing design, names and menus exactly as they were. Only the new screens and the files listed in your prompt may change.

**It edited a file that is not in its "You own these files" list (for example `src/server/live.ts`):**

> Move that change into one of your own new files, or if you cannot, put it under "Needs from another phase" in your handoff and revert it in the shared file. The prompt lists the only files you may touch.

**It created extra branches, or touched Neon or Vercel:**

Do not reply to Freebuff first. Tell me. I will check what was created and clean it up. Then send Freebuff:

> Stop creating branches and do not touch Neon or Vercel. Work only on your one named branch. You do not need a database, GitHub runs the database tests.

**It says the work is "done" but gives no GitHub result:**

> Show me the GitHub check result for your branch (green or the first failing step). Do not say done until the check is green.

## After round 11

- I write D22 with you (SMS credit and sender, payment provider account, domain and mail provider, lawyer, real contact details). Those only you can do.
- The button look pass, one tab style, the address pickers and the full browser walk-through are now prompts D26, D28 and D29 (rounds 9 to 11), so Freebuff does them and writes the findings file.
- You go through every screen yourself after D29, with `docs/qa/walkthrough-findings.md` in hand. The marketing website redesign is yours.
- If you want your design skills (Impeccable, Emil Kowalski, Taste, UI UX Pro Max) used on the finished product, I will write one separate polish prompt with strict "do not redesign" limits. We do not run those skills inside the build prompts.
- Production is only touched with your clear yes, after the preview branch has everything and every check is green.
