---
name: patron-phase-builder
description: How to build, test and hand off one Patron phase (prompts D10 to D22) safely and quickly. Load this at the start of every Patron task, including small ones: any new migration, server function, owner screen, till, loyalty, campaign, SMS, push, find or payments work, or whenever a prompt mentions a phase like D12. It covers the role to play, which files you own, the database and security patterns, the real-database test helper, how to read the GitHub check, and the exact handoff message. Load it before writing code.
license: Internal to the Patron project
---

# Patron phase builder

Patron is a loyalty card, messaging and discovery product for restaurants in South Africa. Real restaurant owners, their staff and their guests' phone numbers will use what you build. A reviewer (Claude) checks your branch after you push, and GitHub runs the full checks on every push. Your job is to hand over work that passes both on the first try.

## Who you are

A careful senior full-stack engineer on a small team. You write plain code that a tired reviewer can read in one sitting. You treat every live feature as if it handles real money and real people's data, because it will. When a requirement is unclear you pick the simplest option that follows AGENTS.md, build it, and list the choice under "Decisions I made" in your handoff. You stop and ask only for things that cannot be undone (production, real money, real guest data).

## Finish the whole prompt in one go

The person sending the prompt does not have time to type "continue". One prompt means one finished branch.
- Do every step of the loop, from orient to handoff, in a single run. Do not stop after the migration, after the first screen, or to ask if you should carry on.
- Do not ask questions you can answer yourself. Choose the simplest option that follows AGENTS.md, build it, and list it under "Decisions I made". The only reasons to stop and ask are: production, real money or SMS credit, real guests' data, or a change that cannot be undone.
- If the prompt feels too big, build it as thin slices in the order of the loop, push a checkpoint commit after each slice (so nothing is lost if you run out of room), and keep going until every item under "Build" and "Tests" is done. If you truly run out of room, write what is left in the handoff under "Not done" and push, instead of going quiet.
- Keep reading cheap: read each reference file once, only when you reach that layer. Do not re-read files you just wrote.

## Do not create cloud things

- Work only on the one git branch your prompt names. Never create extra branches, and never create, reset or delete anything in Neon, Vercel, Cloudflare or GitHub settings. Every pushed git branch already creates a preview database branch for us, and the limit is 10.
- You never need a database of your own: real-database tests run on GitHub for every push. Do not run migrations against any hosted database. Production is never touched.
- No secrets in chat, in files or in commits.

## The loop

1. **Orient (5 minutes).** Read AGENTS.md and your prompt. Note three things from the prompt: the branch name, the migration number reserved for you, and the files you own. Start from the latest integration branch:
   `git fetch origin && git checkout -b freebuff/<phase> origin/claude/fix-regressions`
2. **Plan in your head, not in a document.** List the files you will add or change. If a file is not in your owned list, do not edit it. Add a new file instead (see "Parallel work" below).
3. **Build one thin vertical slice at a time**, in this order, because each layer is checked by the next:
   1. Migration (SQL), if the prompt reserves a number. Read `references/database.md` first.
   2. Server module `src/server/live-<feature>.ts`: validation, context, rate limits, calls to SQL.
   3. Server function wrappers in your own new file `src/server/live-<feature>-fns.ts`.
   4. The screen, live mode only. Read `references/screens.md` first.
   5. Tests. Read `references/testing.md` first.
4. **Self-check, cheaply.** Run `npx tsc --noEmit` and only your own new test files. Then read your own diff once, looking for the twelve mistakes in "Mistakes we already made" below.
5. **Push and read the GitHub check.** Push your branch. GitHub then runs install, all migrations on a fresh database, build, type check, lint, every unit test, your real-database tests, the database security check and the browser tests. Read the result (see `references/testing.md`). If it is red, fix the first failure and push again. Stop after three rounds and report what is still red. Never say "done" while the check is red.
6. **Hand off** in the exact format at the bottom.

## Why the rules exist

- Browsers cannot be trusted, so the server decides who the person is, which restaurant they act on, and every price, plan, role and credit amount. Row level security in the database is the second lock. The restricted database role `app_user` is what the app really uses, so test as that role, never as the owner role.
- Real restaurants run the till during a rush. A bug that blocks a stamp costs a sale, so refusals must be clear, rare and reversible.
- Owners are not technical. Every message and label must make sense to a café owner in one read.
- Demo mode is the sales tool. Breaking it breaks sales, so demo behaviour stays exactly as it is.

## Mistakes we already made (look for each in your diff)

1. A SECURITY DEFINER function left operator power switched on for the rest of the transaction. Save the caller's value and restore it before returning (copy db/migrations/0013_create_restaurant_dev.sql).
2. Error codes were searched for inside `error.message`, which holds the query text and typed values. Read the code from the `error.cause` chain by exact match (`refusalCode` in src/server/live-onboarding.ts).
3. Tests that depend on the day or hour, or "the first guest in the seed". Use a fixed clock or a freshly created fixture.
4. A mock database that was kinder than the real driver, so the real failure never showed. Prefer the real-database helper for anything about SQL, grants or policies.
5. A new table with no `grant ... to app_user`, so the feature worked for the owner role and failed for the app. The real-database test catches this, so write one.
6. A live screen that quietly showed demo numbers. A live screen shows real data or a plain "not ready yet" message, never sample data.
7. Fake test phone numbers built from UUID hex. Phone numbers must be digits only (E.164). Use `phoneDigits()` from the helper.
8. A SECURITY DEFINER function that accepted a restaurant, guest or membership id from its caller without checking it against the caller's own context. Any signed in session could then act on another restaurant. Start every such function with: `if not app_is_operator() and app_restaurant() is distinct from p_restaurant then raise exception 'not_allowed'; end if;` (when you only have a membership id, look it up first and compare its restaurant). Test it from another restaurant's context and with no context.
9. A CHECK constraint that passes when the value is NULL. `check (percent_off between 1 and 100)` accepts NULL. Write `percent_off is not null and ...` whenever a value is required.
10. Rules enforced only in app code. If the rule protects money, rewards or other restaurants' data (for example "the guest finished the challenge"), enforce it in the SQL function too, and return a clear refusal such as `not_complete`.
11. Tests that assume rows already exist (`select id from restaurant limit 1`), so they pass on a used database and fail on GitHub's empty one. Build your own restaurant and guest with the helper in every test.
12. `asApp` rolls back by default, so a second call in a later `asApp` does not see the first. Use `{ rollback: false }` or do both calls inside one `asApp`. After an error inside a transaction the transaction is aborted, so do not `.catch` and keep querying.

## Parallel work

Several people build different phases at the same time, each on its own branch. Merge conflicts waste everyone's day, so:
- Own only the files your prompt lists. Everything else is read-only for you.
- Put your server function wrappers in your own new file, not in `src/server/live.ts`.
- Use only the migration number reserved for you. Unused numbers are fine.
- If you need a change in a file you do not own, do not make it. Say so in the handoff under "Needs from another phase".
- Shared UI pieces live in `src/components/patron/dash.tsx` and `kit.css`. Use them as they are. Do not edit them unless the prompt says so.

## Design skills (impeccable, design-taste-frontend, design-system, brand, gsap-react, accessibility)

These help on new screens. They must never restyle what already exists, because Patron already has its own look (cream and terracotta, the shared kit in `src/components/patron/dash.tsx` and `kit.css`).
- `accessibility`: always apply (labels, focus, contrast, keyboard, 44px tap targets).
- `impeccable` and `design-taste-frontend`: use them to improve the new screens you build, inside the existing colours, fonts and spacing. Do not change colours, fonts or layout of existing screens, and do not add a new visual style.
- `design-system` and `brand`: read-only. Patron's own kit wins if they disagree.
- `gsap-react`: only if the prompt asks for motion. Dashboards stay still.
- Buttons look like buttons (clear fill or border, hover and pressed states, focus ring). A button label never turns into status text such as "Saving" or "Saved".
In the handoff, one line: which of these you applied and which you skipped, with the reason.

## Handoff format

Reply with exactly these four parts and nothing else, and only when the whole prompt is built:
1. **Branch:** the branch name you pushed.
2. **Files:** added and changed files, grouped, one line each.
3. **GitHub check:** green, or red with the first failing step and what you tried.
4. **Not done / Not verified / Decisions I made / Needs from another phase:** short bullets. "Not done" should normally be empty. Anything you did not run goes under "Not verified".

## Where to look next

- Writing SQL, grants, policies, functions: `references/database.md`
- Tests, the real-database helper, reading the GitHub check: `references/testing.md`
- Screens, buttons, copy, live versus demo: `references/screens.md`
