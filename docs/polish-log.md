# Polish log

Branch: `claude/fix-regressions`. Scope: alignment, spacing, consistency, small usability fixes.
Nothing here changes data, logic, database, sign in, SMS, server code, tests or legal wording.
No feature, route or label was added, removed or renamed. Loyalty and stamp card designs were left alone.

How it was checked: every screen below was opened at phone (375), tablet (768) and desktop (1280) widths by a script that flags sideways scrolling, text running off the screen, tap targets that are too small, repeated words, wrong plurals and developer words, then the worst screens were looked at by eye.

## Pass 1: shared problems (fixed once, in the shared stylesheet)

- Phone tap targets: buttons, nav links and footer links were 29 to 31px tall. Now at least 40px on phones.
- Demo pill: sat on top of the Help bubble. It now stays bottom right, and on phones shrinks to a small dot above the tab bar.
- Help bubble: sat on top of the owner tab bar on phones. It now floats above it.
- Legal pages (Terms, Privacy): headings were plain bold text, lines ran too long, the "more" links were not aligned with the page. Now real headings, 68 character lines, aligned.
- Pricing: price ranges written with a dash now read "R299 to R499" (no dash characters in copy). The feature table scrolls inside its own box on phones. A hidden label inside the table was widening the whole page, so the pricing page zoomed out on real phones. Fixed.
- Owner Settings and Loyalty: tab buttons were different heights. Now one height.
- "What happens when" bullets on Loyalty were unstyled. Fixed.
- Staff list on Team: action buttons now sit in a tidy row.
- Operator bar wraps instead of spilling off the screen.
- Step bar on campaigns and publish flows: columns now follow the number of steps, so five steps fit on a phone.

## Pass 2: owner screens

- Insights: Visits over time is now a line chart with numbers on the side and dates along the bottom, readable on a phone. New vs returning shows a bar. Reward funnel shows bars. The first panel takes the full width.
- Loyalty: "Wait between stamps" now says the unit (minutes) and gives an example (240 minutes is 4 hours).
- Your page, opening hours: each day was squashed on phones (times cut off). Now the day sits on top, times side by side, button full width.
- Guests list: rows are cards, text aligned to the left, chevron on the right.
- Stat cards: smaller numbers so four fit across without crowding.

## Pass 3: public screens

- Feedback: the form was spread over two columns and the checkbox floated away from its words. Now one column, checkbox next to its words, "Optional" on the same line as its question.
- Home: the example card in the diners section now fills its stamps one by one when it scrolls into view. People who ask their phone for less motion see the finished card straight away.

## Found, not changed (needs a decision)

1. Demo dot on phones: even small, it can sit over the right edge of a number on a screen. Option: move the demo controls into the account menu on phones.
2. Demo data is thin: The Daily Grind shows about 5 visits a week and "Regulars 0". Charts look sparse. Needs a richer seed, which is a data change, so it was left.
3. Some inline text links (for example "Browse all places", blog titles) are under 32px tall. They are in running text, so a bigger tap area would need a layout change.
4. For-business "screens" strip scrolls sideways on purpose. Left as is.
5. Contact and feedback pages have a hidden spam trap field positioned off screen on purpose. Left as is.
6. Back links: some owner pages have a "Back to the dashboard" link at the bottom as well as the Back button at the top. Harmless, could be removed later.
7. Pre-existing formatting: a few files were already not Prettier formatted before this pass (feedback, Your page, Loyalty, For business). Not touched to keep the change small.

## Screens covered

Home, For diners, For businesses, How it works, Case studies, Pricing, Contact, FAQ, Blog, Feedback, Privacy, Terms, Find, Log in, Sign up, Forgot password, Suggest, venue page, join, card, diner cards, diner restaurants, diner restaurant page, diner settings, owner Home, Guests, Guest, Lists, Loyalty (all tabs), Challenges, Referrals, Campaigns, New campaign, Credit, Your page, Menu, Card design, QR, Insights, Reports, Team, Feedback, Activity log, Settings, till, and the seven operator screens.

## Not started

- Screens that only appear after a real send or real sign in (live mode).
- A full screen reader pass.
