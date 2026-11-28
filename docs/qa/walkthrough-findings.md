# Walkthrough test findings (D29), 28 November 2026

## In plain words
The main jobs work in demo and live: sign up, publish, join, pair the till, stamp, use an
offer code, and the operator screens open. The walk found real bugs. The worst ones are
fixed (list below). This was a shorter test than the D29 brief asks for, so read "Not
tested" before treating anything as proven.

## How it was run
| Mode | Screens | Button presses | Text and file boxes | Drop-down choices | Links followed |
|---|---|---|---|---|---|
| Demo (built app) | 88 | 584 | 174 | 372 | 44 |
| Live (throwaway local database) | 65 | 354 | 138 | 195 | 41 |

Each screen was opened narrow and wide. Boxes were filled with very long, strange and wrong
values. Live flows followed step by step: owner sign up and setup, menu, card rules and
design, staff, pairing code, publish, special, guest join, till pairing, wrong PIN, stamp,
second stamp too soon, offer code (wrong, right, twice), guest card after stamps, operator
sign in, operator feedback note and idea status.

## Fixed during this test
| Severity | Mode | Where | What went wrong |
|---|---|---|---|
| Blocker | Live | Operator, Feedback and Ideas | No note, status or picture could ever be saved or opened |
| Major | Demo | Loyalty | A very large or negative stamp number crashed the whole screen |
| Major | Live | Loyalty tabs, challenges, referrals, operator screens, till | A value out of range left the screen stuck with no message |
| Major | Live | Challenges | Pause and Save did not update the list until the page was reloaded |
| Major | Live | Specials | An ended special showed as Paused and still offered Restart |
| Major | Live | Specials | End had no "are you sure" step |
| Major | Demo | Demo status | Many links opened an error page |
| Minor | Demo | Branches | An empty form said only "Something went wrong" |
| Minor | Demo | Forgot password | Asked the server although the demo has no accounts |
| Minor | Both | Public page | Hours were written with dashes |
| Minor | Live | Find and till search | Very long text was not stopped in the box |

## Still open
| Severity | Mode | Where | What happens |
|---|---|---|---|
| Minor | Both | Suggest a place | If the hidden anti-robot box is filled (a robot, or some autofill tools), the thank you page says "undefined asks" |
| Minor | Both | Till, Look up | Pressing it with an empty box does nothing and says nothing |
| Minor | Live | Home and QR, Copy link | If the browser refuses to copy, nothing is said |
| Minor | Live | Menu, "Write and publish a special" | Opens the Campaigns tab, one tap away from Specials |
| Minor | Demo | Menu | "Move up" on the first item can be pressed and does nothing |
| Minor | Live | Join | There is no birthday box on the live join form |
| Cosmetic | Demo | Branches | Sample addresses repeat the suburb |

## Not tested and why
| What | Why |
|---|---|
| Real SMS, email, Google sign in, push messages, PayFast | The outside accounts are not connected |
| Camera scanning at the till | The test machine has no camera |
| Printing the QR layout | The test browser has no printer |
| Every campaign audience sent and approved live | Time and usage limit. Database tests cover the rules |
| Spin wheel, tiers, referrals and birthday reward as full guest stories in live | Time and usage limit. Screens and buttons were swept, database tests cover the rules |
| Billing plan changes and grace period in live | Needs PayFast. Database tests cover the rules |
| Log out, Sign out, Unpair and Reset PIN buttons in the live sweep | Pressing them would end the test sign in. Reset PIN was used in a followed flow |
| A repeatable GitHub job for this walk, and a row for every single control | Left out to save usage. The D29 brief still describes it if it is wanted |

## Noise that is not a product bug
Fonts from the internet could not load on the test machine. Custom switches are drawn over
their tick boxes, so the test tool could not click the hidden box (tapping the switch works).
The "Demo with sample data" pill seen in live was the developer server only: the built app
hides it.
