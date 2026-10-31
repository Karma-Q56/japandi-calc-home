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
