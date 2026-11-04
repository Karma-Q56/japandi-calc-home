# Design reference from the partner version (what to copy, what not to)

Attach her screenshots to the Freebuff chat when you send prompts 02, 03, 04 and 05. The text below is the written version so nothing depends on the images.

## One look for the whole product (decision made)
- Warm cream page, white-cream cards with a soft border and light shadow, terracotta as the one accent, dark brown text.
- One type stack: a friendly bold sans for headings and body, with the italic serif accent used once per page heading ("Find a restaurant. *Become a regular.*"). Drop the heavy all-caps display type and the [ BRACKETED MONO ] labels so marketing and product look like one thing. Keep the minimal feel by limiting content, not by dropping polish.
- Minimalism rules the kit must enforce: one primary action per page, at most 6 cards on a screen before scrolling, max two heading levels per page, one helper line under a title, no card inside a card.

## Copy from hers
1. **Find a restaurant**: location line, big title with italic accent, search box, neighbourhood dropdown, Find button, filter pills (All places, Cafes, Bakeries, Restaurants, Takeaways, Open now, Member offers), sort (Nearest), "Around the neighbourhood (9)", photo cards with category badge, suburb, name, one line tagline, reward line ("8 stamps. A free coffee."), full width "View restaurant" button. Honest label: "Sample venues, illustrative photos".
2. **Restaurant page**: full width hero photo, logo tile, name, tagline, category, suburb. Pills: Open until 17:00, category. Address with Get directions, phone with WhatsApp link. "How it works here". A sticky loyalty card on the right ("8 stamps to a free coffee", Join free button, "Joining is free."). Menu and specials on the same page: a "Today's special" callout, then menu sections with prices. Footer line "Run this place? Claim this page". Nobody is forced to join.
3. **Diner My cards**: card per restaurant with initials badge, name, suburb and category, round stamp circles (ticked when stamped, gift at the end), tier pill (Regular), small pills for "1 offer" and "1 spin", last visit line, subtle dotted pattern, "Scan a QR to join a place" button at the bottom.
4. **Owner shell**: top bar with logo, OWNER tag, restaurant switcher, user name, visible Log out button, and a demo strip above it ("Demo with sample data, Viewing as Owner, Reset demo data").
5. **Owner dashboard**: four stat cards with change versus yesterday, a trading chart with metric toggles (Visits, Estimated sales, Unique guests, New members) and 7/14/30 day range, a "Today so far" live feed, busiest hours bars with the peak highlighted and a plain caption ("Peak around 09:00. Staff for it."), guest engagement bars, "Your best regulars", "What's working" (live offers and last campaign results).
6. **Guests page**: four stat cards, search, sort, filter chips with counts (All guests, Regulars, Reward ready, One away, Gone quiet, New faces, No SMS consent), a "Message guests" button, a side drawer per guest with member number, tags, masked phone with Show, Message and Send reward buttons, stats, card progress bar.
7. **Talk to us**: first pick "I run a restaurant / I'm a diner / Something else", then the right form. Side panel "Rather just talk?" with WhatsApp, cell, email. Consent tick with a disabled Send button until valid.

## Do NOT copy
- The spin wheel: segments are blank and pale and the prizes are only listed below. Ours must have coloured, labelled segments.
- The SMS consent switch in the guest drawer. Owners can only withdraw consent, never switch it on.
- Eleven top tabs. Ours is 7.
- Pricing page (not sent, we keep ours and the calculator).
- Reports "Discount %" box sitting among the range buttons (confusing).
- A long single enquiry form shown all at once. Ours is step by step after the role choice, with an empty state that is not a big blank panel.
- The floating chat bubble over content, unless it does something real.

## Bugs visible in her screens (do not reproduce, and check ours for the same)
- "1 months ago" and "last in 5 days ago": write one `timeAgo()` helper with correct plurals and no doubled words, with tests.
- "On the The Daily Grind card": a name that already starts with "The" got "the" added again.
- Two "Regular" tags on one guest.
- Dashboard shows zeros and a flat line because the demo data ends days ago. Demo dates must be relative to today so "today so far", charts and "last visit" always look alive.
