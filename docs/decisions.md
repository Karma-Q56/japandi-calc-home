# Patron decisions log

Authoritative record of the design decisions for this release. Written for
busy restaurant owners and diners with no technical background: short
sentences, plain English, no jargon.

---

## 1. Demo mode is the default - live only on the operator's box

`.dev.vars` sets `DATA_MODE=demo` until the owner flips it to `live`.
The app refuses any write that is not scoped to the restaurant the guest
joined, and it never touches production.

---

## 2. Birthdays: day and month only

- The join flow asks for day and month, both optional. No year is ever
  stored.
- The reason for asking is one line: "so we can spoil you on your
  birthday."
- Guests can edit it in `/me/settings`.
- The owner's guest profile shows it, and there is a "Birthdays this
  month" view plus a birthday segment for campaigns and a birthday reward
  trigger (bonus stamp or free item, owner's choice, with a preview).
- Only the restaurant the guest joined can see it.

---

## 3. Visit patterns run in the restaurant's own time

All stamp timestamps are in Africa/Johannesburg (SAST, UTC+2, no DST).
A guest's "usual days" and "usual time of day" are computed only from
their own stamps. The slipping flag compares the gap since their last
visit with their own average gap, so one long absence does not make a
good regular look bad.

---

## 4. Orders at the till: stamp first, ask after

- After a successful PIN stamp, the till may (optionally) ask
  "What did they have?" This step never blocks or delays the stamp. The
  stamp is saved, and the order is attached afterwards.
- It shows the restaurant's most ordered menu items as large buttons plus
  a search over the whole menu, quantity taps, and a Skip button. It
  takes at most 3 taps.
- An optional bill amount in rand. The owner can switch "Track what
  guests order" on or off and choose item mode or simple category mode
  (breakfast, coffee, lunch, dinner, drinks, dessert).
- Orders are stored in an `orders` structure with a `source` field:
  `till` now; `import` and `pos` later. This deliberately postpones POS
  integration - adding it later does not change the data model.

---

## 5. "Know your guest" is one plain sentence

On the owner's guest profile, one sentence generated from real data, for
example: "Thandi comes in on Tuesdays around 8am and usually has a flat
white. She has 5 stamps and her birthday is in March." It also shows the
favourite items (top 3), the visit pattern, the rewards history, the
birthday, and the last message together with whether it went through.

---

## 6. Insights: every block can message

The Insights page shows busiest days and times, top items, quiet days,
regulars who are slipping, birthdays coming up, and new guests this week.
Every block has a one-tap "Message them" button that opens the campaign
composer with that group already chosen.

---

## 7. Smart message suggestions, no AI

The campaign composer suggests ready-to-edit wording based on the chosen
group and the real data. No external AI service. Supported fill-ins:

- `{name}`
- `{favourite_item}`
- `{usual_day}`
- `{reward}`

Examples: a win-back message for a slipping regular, a birthday message,
a quiet-day offer. The suggestions are always editable, with SMS and push
preview, character count and cost. If a fill-in has no data, it falls
back to safe wording. Consent and STOP are respected - no message is sent
to a guest who has withdrawn consent or sent STOP.

---

## 8. Bring a friend

- Each guest gets a personal share link or code.
- A friend who joins through it and gets their first stamp triggers a
  reward for both guests.
- The owner chooses the reward and can switch it off.
- Rewards are issued as single-use personal offers only after the friend's
  first stamped visit.
- Limits: per guest per month. Abuse checks: same phone, self referral.
- The owner sees a cost estimate and a preview of what both guests see,
  then steps through Draft, Preview, Publish.

---

## 9. Privacy

- The privacy page and the terms of service mention birthdays, visit
  patterns and orders.
- Only the restaurant the guest joined can see them.
- Guests can download and delete their data. The data download and the
  delete action include birthdays and orders.

---

## 10. Seed and tests

- The demo seed gives the 60 demo guests realistic birthdays, visit
  times and orders.
- Tests are added for every item above, including the till order step
  not blocking a stamp.

---

## 11. What was deliberately postponed

- **POS integration**: the order model uses a `source` field so a point
  of sale or a sales import can be added later without changing the code.
  See `src/domain/orders.ts` and `docs/decisions.md` for the record.
- **Real authentication**: the demo session is sufficient for the
  bakery's own testing. Real sign-in can be added later.

---

## 12. Loyalty tools researched from other programs

Two new owner tools ship with this release: a double stamp day and a
visit streak. Both were chosen after checking what long running coffee
and restaurant loyalty programs actually do, so the ideas below link to
where they come from. Every tool can be switched off, and together they
share one monthly bonus stamp budget so the free give-away stays under
control.

### Stamp card with a visible gap to the reward (the base tool)

The card itself leans on the goal gradient effect: people visit faster
the closer they get to the reward. Kivetz, Urminsky and Zheng tested
this with a real cafe punch card and found the pace of visits speeds up
as the card fills (Columbia Business School, 2006:
https://www.columbia.edu/~rk566/Session4/Goal-Gradient_Illusionary_Goal_Progress.pdf).
Patron cards always show the stamps earned and the stamps still needed.

### Double stamp day (quiet weekday bonus)

Starbucks Rewards runs "Double Star Days", limited-time days when stars
earn at twice the normal rate, about six a year (Starbucks Rewards FAQ:
https://about.starbucks.com/starbucks-rewards-faq/).
Loyalty platforms describe the same rule as bonus points on specific
dates or times (Preferred Patron feature list:
https://www.preferredpatron.com/mid-market-business-loyalty-programs).
Patron's version is pinned to the restaurant's own quietest weekday and
repeats every week, so the busy Saturday crowd is never paid extra and
the quiet day gets the nudge. A visit that day earns one extra stamp,
on top of the normal stamp, and two bonus visits in a row earn two
bonus stamps.

### Visit streak (reward the habit, not one visit)

Streak rewards are a proven habit builder: a longitudinal study of
reward-driven habit formation found rewards work through repeated
behaviour, which then carries on on its own (Judah et al, 2018,
PeerJ / PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC6302524). Apps
that use streaks keep customers returning because they protect the run
they already have (a streak gamification case study:
https://trophy.so/blog/streaks-gamification-case-study).
Patron's streak works in weeks: the owner picks a target such as 2
visits a week, and after the run reaches the chosen number of weeks the
guest earns bonus stamps. A week that misses the target does not reset
the earned run, it only pauses it, so one missed week in a busy month
does not destroy a regular's progress.

### Monthly bonus stamp budget (the guardrail)

Reward costs need a ceiling. Patron already capped the bring a friend
reward per guest per month (decision 8); the new tools get the same
treatment as one number: every bonus stamp the double day and the
streak pay out, all guests combined, must together stay under the
restaurant's monthly budget. When the budget is used up for the month,
no further bonus stamps are granted until it resets on the first of the
month (Johannesburg time). This is Patron's own rule, written to keep
the tools affordable for a small cafe.

### Birthday reward (already shipped, sources for the choice)

Birthday rewards are the highest converting promotion in the
restaurant industry (RaftLabs guide:
https://www.raftlabs.com/blog/loyalty-program-for-restaurants), and
Experian's email study found birthday messages drive a 481% higher
transaction rate than ordinary promotions (summarised here:
https://business.stampix.com/blog/birthday-rewards-when-why-and-how-they-work-or-dont).
Starbucks, as reference, gives members a birthday reward and 30 days to
redeem it (Starbucks Rewards FAQ, link above). Patron's version is
decision 2: day and month only, owner chooses a bonus stamp or a free
item.

### Bring a friend referral (already shipped, source for the choice)

Referral rewards are standard across restaurant programs. The Raising
Cane's "Spread the Love" campaign gives both guests a free item when a
friend joins through the share link (summary of US programs:
https://blog.simpleloyalty.com/best-restaurant-loyalty-program-usa).
Patron's version is decision 8, with the monthly cap and the checks
against self referral and repeated phones.

---

## Before launch

These values and features are placeholders. Replace them before a real
launch, in the order below.

### Contact details

All public contact details live in `src/config/site-details.ts`. Every value
there is a placeholder and must be replaced:

- `supportEmail` is `hello@patron.example`, a demo address.
- `whatsappNumber` is `27000000000`, a demo number that cannot receive
  messages.
- `phone` is a demo switchboard number.
- `supportHours` and `location` are drafts for the real team.
- `privacyEmail` is `privacy@patron.example`, a demo address.

The help bubble, the footer WhatsApp links and the owner support card read
from that one file. Update it once and every link changes.

### Other launch blockers

- A lawyer must review the privacy policy and terms of service.
- The live operator sign-in must exist before the enquiry inbox or the
  campaign approval screens read a production database. Until then the
  admin area runs on the demo store only.
- The notification email in Settings is a placeholder. No email is sent in
  demo or live until the mail provider is connected.
- The real WhatsApp business number and a monitored support inbox must be
  in place before the public help bubble is shown.
- `db/migrations/0005_ideas_dev.sql` backs the guest ask for a place page
  (`/suggest`). It is dev branch only: run it on a dev database and test
  `/suggest` against it before anyone touches production. The ask page
  deliberately stores no phone number or email.
- The blog notes in `src/data/blog.ts` are launch copy written for the
  first sites. Re-read and refresh them, and keep the list in
  `docs/blog-plan.md` to one note every two weeks after launch. The RSS
  feed is served at `/blog/rss`.

---

## 13. Previous versions are restored as a draft (page and menu)

- The public page and the menu each keep the last **10** published versions per
  restaurant. The cap is per venue: one restaurant's history never appears in
  another's list and is never trimmed by the other venue's publishes.
- "Restore" never writes to the live page or menu. It loads the old words,
  hours or menu into the editor as a draft, and the owner still goes through
  Preview and Publish. Tests pin that the live copy does not change on restore.
- A version stores who pressed publish and one plain line about what changed
  (for example "Changed the tagline and Tuesday hours"), so the list is
  readable without opening each version.

## 14. Feedback is separate from the guest Ideas board

- **Ideas** (`/suggest`, `/app/ideas`, `/ops/ideas`) asks guests which place
  should join Patron. It stores no contact details.
- **Feedback** (`/app/feedback`, `/feedback`, `/ops/feedback`) is a bug report
  or feature request. It has three sources: owner, diner and public page. A
  note is 10 to 1000 characters, one optional picture (PNG, JPG or WebP, under
  300 KB), and an optional "You may contact me about this" tick box.
- Status is one of New, Seen, Planned, Done, Not now. The sender sees the
  status of their own notes; only a Patron operator can change it or add a
  private note. Screenshots are visible only to the operator and the sender.
- Notes are kept for twelve months. Public submissions are rate limited to
  five an hour per place, with a honeypot that silently drops bots.
- `db/migrations/0006_feedback_dev.sql` is dev branch only. It keeps row level
  security: owners read their own restaurant, operators read all, and the
  public may only insert an unassigned note.

## 15. Blog posts stay marked as drafts until reviewed

- Each post shows "Placeholder draft, not final" until the owner sets
  `reviewed: true` in `src/data/blog.ts`.
- Invented statistics, quotes and customer stories were removed. Posts keep
  only claims that link to a real source, or plain reasoning with no number.
- `docs/blog-plan.md` holds 15 one-line topics.

---

## 16. Phase D1 auth research (2 November 2026)

Checked against the current Neon Auth documentation before writing code.

### Confirmed

- Email and password, Google and Apple sign-in are supported. Apple needs a
  paid Apple developer account, so it stays later as the founder said.
- The session cookie is HttpOnly and Secure and is managed by the SDK. The
  client reads it with `getSession()`. A JWT is also available for database
  row level security.
- Auth is enabled per Neon branch, not per project. Each branch gets its own
  users, sessions and `neon_auth` schema.
- Enabling can be done from the Neon console, the Neon CLI, or the API. The
  client and server keys are returned only when auth is enabled, so they must
  be captured once and stored as secrets.
- Email and password and Google are included in all Neon plans, billed by
  monthly active users. The free plan allows up to 60,000.
- There is no documented way to add custom user fields. `updateUser()` covers
  the display name, not a preferred name or phone. Our own `customer` table
  keyed by the auth user id is the workable place for those fields.
- MFA is not supported yet.

### Not documented, therefore not assumed

- Cloudflare Workers runtime support for the Neon Auth SDK.
- A server-side session read outside the Next.js server SDK. The Next.js
  `getSession()` helper is Next-specific and cannot be used in TanStack Start.
- Numeric rate limits for the auth service. Only the shared email sender is
  described as rate limited.
- Whether a newly created branch inherits auth settings.

The missing Workers server session is the blocker. D1 requires real server
guards on `/me`, `/app`, `/ops` and `/stamp`, HttpOnly cookies and rate limits
stored in Postgres. A client-only session check would not meet that and would
leave the owner and operator areas protected by browser code alone.

### Options put to the founder

1. Self-host Better Auth on the Neon database. Users, sessions and accounts
   live in our schema, so server functions on Workers can read the session,
   custom fields are ordinary columns, and rate limits are ours. This keeps
   the Neon database choice and replaces only the managed auth service.
2. Use Supabase Auth, which is already connected and has Workers-friendly JWT
   checks, while keeping data in Neon. This adds a second platform.
3. Continue with Neon Auth as planned and accept client-only guards, or add a
   separate Node auth proxy. Neither is recommended for the owner area.
4. Pause D1 until Neon documents Workers support.

No auth package was installed and no Neon Auth branch was enabled while this
decision is open.

Sources read: https://neon.com/docs/auth/about,
https://neon.com/docs/auth/quick-start/tanstack-router,
https://neon.com/docs/auth/authentication-flow,
https://neon.com/docs/auth/reference/nextjs-server,
https://neon.com/docs/auth/guides/manage-auth-api,
https://neon.com/docs/auth/production-checklist,
https://neon.com/docs/auth/roadmap

---

## 17. Auth implementation: Better Auth self-hosted on Neon

After the Neon Auth review in section 16, the founder chose self-hosted Better
Auth on the Neon dev branch. Neon Auth is not enabled and no Neon Auth package
is installed.

- Users, sessions, accounts, verification tokens and rate limits live in the
  Neon dev branch (`0007_auth_dev.sql`). Sessions are read in TanStack Start
  server functions from the HttpOnly cookie, so `/me`, `/app` and `/ops` have
  real server guards on Workers.
- `app_user` maps an auth user to one role: guest, owner, manager or operator.
  Owners, managers and operators are linked by hand; a new sign-up is always a
  guest. Guests get a `customer` row keyed by the auth user id.
- Google is configured only when both Google secrets exist. Apple waits for a
  paid Apple developer account.
- Password reset uses an email webhook owned by the founder. No email provider
  secret lives in this repository.
- Rate limits are database-backed (Better Auth `rateLimit` table), not process
  memory. Sign-in, sign-up and password reset have their own limits.
- Audit events are written for sign-in, failed sign-in and password change.
- Demo mode remains the default. The demo role switcher is hidden and
  `/dev/roles` redirects to `/login` when `DATA_MODE=live`.

Not verified: the migration has not been run against the dev branch, Google and
the reset email have not been configured, and no live auth test has run against
Postgres. Until Phase D2, live-mode screens still read demo content even though
the guards are real.

Sources for the Better Auth setup: https://better-auth.com/docs/integrations/tanstack,
https://better-auth.com/docs/adapters/drizzle, https://better-auth.com/docs/installation,
https://better-auth.com/docs/concepts/rate-limit, https://better-auth.com/docs/concepts/hooks,
https://better-auth.com/docs/authentication/email-password

---

## 18. Phase D2: the first live screens

The owner overview and the guest's cards now read Postgres through the signed-in
viewer. No route sends a customer id or restaurant id from the browser for
these reads.

- `loadOwnerOverview` takes the restaurant from `app_user` and runs inside that
  restaurant's row level security context. It counts stamps today, returning
  guests, ready rewards, the credit ledger balance and campaign sends, and
  builds the same overview shape as demo mode.
- `loadMyCards` takes the customer from `app_user` and returns only that
  customer's memberships, with restaurant name and reward count.
- The pure `buildLiveOverview` helper owns the date maths and is covered by
  four Vitest cases.
- In live mode, owner child tools show a clear "comes next" panel instead of
  demo data. Guest restaurant and settings pages redirect to `/me` until their
  live versions exist in D3. This is deliberate: no demo rows appear behind a
  real login.

Not verified: no migration or session test has run against the Neon dev branch.
The SQL was typechecked and the route tests use demo mode, so the live branch
still needs a real sign-in and a development database.

Next in D3: owner customers, campaigns, loyalty, menu, page and settings, then
the guest restaurant and consent screens. The till and operator screens follow
after that.

---

## 19. Phase D3: live guest and campaign lists

The owner's guest list and campaign history now read Postgres through the
signed-in viewer. Both queries use the restaurant from `app_user`, never one
from the browser.

- `/app/customers` shows live memberships with name, masked phone, stamps,
  rewards waiting, last visit and SMS consent. Filtering, search and sorting run
  on the returned rows through the pure `filterLiveCustomers` helper.
- `/app/campaigns` shows live campaigns with status, recipient count and cost.
- Both screens are read only in this phase. Customer profiles, manual stamps,
  phone reveal, CSV export, the campaign composer and campaign results still
  open the "comes next" panel in live mode.
- The live query returns at most 1,000 guests for one restaurant. Server-side
  paging arrives when profiles and exports do.

Not verified: neither query has run against the Neon dev branch. Type checking,
route tests and the production build passed in demo mode.

Next in D4: customer profiles and consent actions, campaign results, then the
loyalty, menu and page builders.

---

## 20. Phase D4: live customer profile and campaign results

Both detail screens behind the D3 lists now read live rows through the signed-in
owner's restaurant. They are read only.

- A customer profile shows the card states, recent stamps, rewards and consent
  history. Phone numbers stay masked. Manual stamps, consent edits, phone reveal
  and CSV export still wait for D5.
- Campaign results show the message, status, recipient rows, delivery and failed
  counts, segments and cost. Approving, sending, settling and cancelling still
  wait for D5.
- The live campaign status counts come from the pure `campaignTotals` helper and
  are covered by Vitest.
- Both routes still scope by `app_user.restaurant_id` and run inside RLS. A
  campaign or customer id from another restaurant returns null.

Not verified: neither live query has run against the Neon dev branch.

Next in D5: customer actions and consent, campaign actions, then the loyalty,
menu and page builders.

---

## 21. Phase D5: live consent and campaign actions

The live customer profile and campaign results now have a small, audited set of
write actions. Each one takes the restaurant from the signed-in viewer and runs
inside that restaurant's RLS context.

- SMS consent could be turned on or off at the time of D5. Prompt E replaced
  this with a withdrawal-only owner action; see section 24.
- Revealing a phone number returns it once and writes a `phone_reveal` audit
  event. The number is never stored in the audit row.
- An owner can approve a draft or pending campaign. Approval records the user
  and time but does not send anything.
- A scheduled campaign can be cancelled. Queued messages become skipped, the
  estimated reservation is released through the credit ledger once, and the
  change is audited. Sending, settling and editing campaign wording remain off.
- Manual stamps, consent history export and customer deletion remain off until
  the stamp policy and deletion workflow are connected.

Not verified: none of these mutations has run against the Neon dev branch.

Next in D6: the loyalty, menu and page builders, and the remaining operator
surfaces.

---

## 22. Phase D6: live loyalty rules

The loyalty page now has a live branch for the signed-in owner. It reads and
writes the core restaurant rules that already exist in Postgres.

- Live owners can change stamps needed, the reward wording, the minutes between
  visits, the welcome stamp and both weekly message caps.
- Saving validates every range on the server, updates the restaurant row and
  writes a `loyalty_settings_updated` audit event.
- Changes apply immediately because this schema has no loyalty draft table. The
  existing Draft, Preview, Publish flow stays in demo mode only. Adding a live
  draft and version history needs its own migration and is part of D7.
- The menu and page builders also stay in demo mode. They need draft storage for
  sections, items, page words and versions before live editing is safe.
- The operator console remains on demo data.

Not verified: none of the live loyalty reads or writes has run against the Neon
dev branch.

Next in D7: loyalty draft versions, menu builder storage, page builder storage
and the operator surfaces.

---

## 23. Phase D7: live menu builder

The menu page now has a live branch for sections and items that already have
Postgres tables. The demo editor is unchanged.

- Live owners can add sections, add priced items to a section, and show or hide
  an item. Every change is scoped to the signed-in restaurant and writes an
  audit event.
- Prices are entered in rand and stored as integer cents. Names, descriptions
  and prices are validated on the server as well as the form.
- Changes apply immediately. Draft, preview, publish and version history still
  need their own tables, so they remain in demo mode.
- The page builder and operator console stay on demo data. Both need storage
  and cross-tenant views before live editing is safe.

Not verified: none of the live menu reads or writes has run against the Neon dev
branch.

Next in D8: menu drafts and versions, the page builder, then the operator
surfaces.

---

## 24. Prompt E: consent, migration and feedback safety

SMS consent is now withdrawal only. The owner action no longer accepts an
enabled value, the server only writes `opted_out`, and an owner repeating the
action does not add a second consent event when the guest is already out. The
customer screen shows "Withdraw SMS consent" only while consent is on. When it
is off, the screen says so and explains that only the guest can opt back in.

`0008_app_role_grants_dev.sql` gives the app role the tables added after
`0002_app_user.sql`. `0009_feedback_privacy_dev.sql` revokes table-level
`SELECT` and `UPDATE` on feedback, drops `feedback_owner_update`, and grants
only the safe columns. Owners can read their own message, contact and status,
but `note` is not readable or writable and status cannot be changed by the app
role. Inserts still work for the feedback form, and operators keep their own
policy.

The guarded live suite runs only when `DATABASE_URL_DEV` is set in the process.
It refuses to connect when the host equals `PROD_DB_HOST`, then uses app-role
fixtures to cover every current live read, every current live write, cross
restaurant reads and changes, consent withdrawal, and feedback column privacy.

Verified against the configured non-production Neon branch: all migrations
through `0009` are recorded; the live suite passed 5 tests; typecheck passed with 0
errors; lint passed with 0 errors and 12 existing warnings; the full Vitest run
passed 467 tests with 6 skipped across 74 files; the production build passed.
The older `.dev.vars` URLs were rejected by the server, so the run used the
configured migration branch and the app role password from the local env file.
No production database was contacted.

## 25. Phase D12d: the live spin wheel (14 November 2026)
The wheel has one kind per restaurant: a welcome spin (one when a guest joins, always gives something), earned spins
(one every N visits, may land on a try again) or the reward decider (when a guest earns their card reward, the wheel
picks which reward they get, and never one worth less than the smallest value the owner set). Up to 8 prizes, each with
a chance weight. Prizes are a free item, percent off, rand off, 1 to 5 bonus stamps, or a try again.

The server draws every result in SQL (`spin_wheel` in `0019_spin_wheel_dev.sql`) with the database's own random numbers.
The browser only animates the prize it is given. One spin uses up one earned spin in the same transaction as the prize,
and the table refuses `used > earned`. A spin id made by the browser pays once, so a retry returns the same result.
A guest can only spin their own card, and the app role cannot write the wheel tables or `spin_result` directly.

Choices made without asking:
- Earned spins count visits from the day the wheel is switched on, never earlier visits. Bonus stamps do not count.
- A stamp that is later undone does not take back a spin the guest already earned.
- The reward decider only draws real rewards whose "worth" is at least the smallest value. If none qualifies, the guest
  keeps the reward they earned. Each earned reward is decided once.
- The welcome spin is open to any member who has not used it, not only new members.
- Guests see equal slices and no weights. Owners see the odds in plain words and can test the wheel (a test uses nobody's
  spin and creates no reward).
- Weekly prize limit (migration 0035, 15 Nov): each prize can have a limit on how many times it is won in any 7 days. It counts wins, never money, because owners do not spend money on the wheel. A prize at its limit leaves the wheel. When every real prize is at its limit the wheel stops: the guest sees "The wheel is resting", keeps the spins they earned, and the welcome spin is not used up. A try again slot has no limit and never keeps the wheel going on its own. Wins are counted by the prize's position on the wheel, so editing a prize does not reset its count. Spins on one wheel run one at a time, so two guests cannot both take the last win. Karma's answer on 14 Nov: when the limit runs out, stop the spin. A money budget was left out on purpose (Freebuff's unmerged branch had one).
- Spins, wheel saves and tests are rate limited per person per hour.
- Bonus stamps can take a card past its goal. The reward is then given at the next recorded visit, the same as for
  challenge bonus stamps.

## Pricing placeholders
Starter, Growth and Pro, with placeholder monthly bands and a once-off setup band,
live only in `src/lib/patron.ts` so names and prices change in one place.
The feature table and planner read the same arrays; everything stays marked proposed.

## Help from Patron
Help mode is a time boxed session, not a role change. The demo keeps drafts and requests in browser storage; `0011_help_mode_dev.sql` adds the live tables and blocks operator writes once the window closes. Drafts carry a fixed label, and operators never see full guest numbers. The privacy wording for this feature needs a lawyer before it goes live.

## "Try this dish" challenge (D12f)

An owner can set a challenge that asks a guest to order one dish, or any dish in one section, a set number of times in a set number of days. Only orders made after the challenge starts count, and only the chosen dish or section counts. The owner picks from dishes that are on the menu now. A dish or section must belong to the same restaurant as the challenge; the database refuses anything else. The guest card shows "1 of 2 ordered". The reward is the same as the other challenges: bonus stamps, a free item, or a discount. Each guest can claim it once.

## D21: Plans, billing and payments (migration 0032, applied to the dev database only)

Plan limits and prices are data in `src/config/plans.ts` (`planBilling`). The pricing page and the owner billing screen read the same data. Money is always whole cents in rand. The server builds every amount; the browser never sends a plan or an amount that is trusted.

- **Location limit.** A new location past the plan limit is refused by a trigger (`plan_limit_locations`). Limits live in the `plan_limit` table: starter 1, managed 3, partner 10, custom 50.
- **D20 is not in this base.** D20 (branches) is not merged, so there is no `location_limit` table. The trigger and its function are created in 0032 instead. 0031 stays reserved for D20.
- **Card payments (PayFast).** Hosted checkout only, no card data on our side. Monthly plans are subscriptions; top ups are one-off payments. The ITN webhook at `/api/webhooks/payments` checks the signature, the merchant id, the amount against the stored payment, then validates with PayFast before settling. Repeats are safe.
- **One credit, one time.** A paid top up writes one `topup` ledger entry with reference `payment:<id>` in the same transaction that marks it paid. Failed and cancelled payments change nothing. Top ups are bounded R100 to R100 000.
- **Refunds** are an operator action that writes a `refund` entry with a note. They are not built into the owner screen.
- **Invoices.** The operator creates an invoice. The owner sees it with bank details. The operator marks it paid with a payment reference, once. Each step writes an audit row. Bank details come from the env variable `PATRON_BANK_DETAILS`, never from code.
- **Pro plan** has no online price; it is invoiced only.
- **Payment status** gained `paid`, `failed` and `cancelled` (the existing values stay).
- **Ops invoice buttons are not wired.** The `ops.credit` and `ops.restaurants` screens are demo-only today. Live invoice actions exist on the server (`createLiveInvoice`), but no button was added there.

Environment variables (set in the host, never in code): `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYFAST_MODE` (`sandbox` or `live`), `PATRON_BANK_DETAILS`. When the PayFast values are missing, checkout refuses with a clear message.

Claude's review fixes (14 Nov):

- **Only the webhook settles a payment.** `settle_card_payment` refuses any call made with a restaurant or guest context, so a signed-in owner or guest cannot settle a payment even if server code around it is wrong. It also refuses outcomes it does not know.
- **No double billing.** A monthly payment names its plan (`payment.plan`). The first paid notice switches the restaurant to that plan. A second monthly payment is refused (`subscription_exists`) while one is paid, so changing or stopping a running monthly payment is something Patron does by hand (cancel it in the PayFast dashboard, then change the plan). A plan with fewer locations than the restaurant has open is refused.
- **Invoices are read only for the app role.** Writes go through the operator functions only.
- **PayFast details.** Signatures encode characters the way PHP does (brackets, apostrophes, `~`), compare in constant time, and a `PENDING` notice changes nothing. The validation call sends the notice without its signature, with an 8 second timeout. The checkout address (return, cancel and notify links) is read from the request on the server, never from the browser. Starting a payment is limited to 20 a hour per person.
- **The screen only promises what exists.** Monthly SMS credit is not granted by anything, so the screen does not mention it (`includedSmsCredit` stays in the data for later).

Still not built (tell Karma before real money): recurring monthly notices after the first one are ignored (already paid), so a failed renewal does nothing, and the 7 day grace and campaign pause described on the screen are not enforced yet; the operator invoice buttons; refunds; the PayFast sandbox test. The validation call format follows PayFast's published example and has not been run against the sandbox.

Not in this phase: a real payment (tested later in PayFast sandbox), SARS tax invoices (D22).

## 15. Branches: one loyalty card, one main branch, a plan limit

- A restaurant can have several branches (locations). One branch is always the main one. The main branch cannot be turned off until another branch is made main.
- A guest keeps one card for the whole restaurant. Stamps from every branch count on the same card.
- The plan sets how many branches can be on at once: Starter 1, Managed 3, Partner 10, Custom 50 (demo restaurant is on Custom).
- A till paired for a branch stamps at that branch. Staff can work at one branch, or at all branches when the owner ticks "All branches".
- A staff member who works at another branch is refused at a till with: "This team member works at another branch." The message does not say which branch.
- Branches are turned off, never deleted. Turning off keeps the history.
- Demo mode stores branches in the demo state with seed branches Parkhurst (main) and Sandton.
- Still to do: staff branch picker on the Team screen, branch filter on Insights, and branch names on the public page.
