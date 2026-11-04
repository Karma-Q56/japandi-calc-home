# Patron design system

One product, one visual language. The marketing site, diner app, till, owner tools
and operator console all use this kit.

The catalogue lives at `/dev/kit`. The code lives in `src/components/patron/kit`.
The stylesheet loads after the legacy sheets, so these tokens and components are the
last word on a shared surface.

## Colour

| Token | Use |
| --- | --- |
| `--pk-cream` | Page background. Warm paper, never white. |
| `--pk-card` | Cards, panels, menus and inputs. |
| `--pk-border` | One quiet line between things. |
| `--pk-accent` | Terracotta for the one main action, the active tab and the stamp. |
| `--pk-ink` | Dark text and dark navigation states. |
| `--pk-ink-soft` | Helper text and secondary labels. |
| `--pk-green` | Soft green for success and active status. |
| `--pk-amber` | Soft amber for waiting or attention. |
| `--pk-danger` | Destructive actions and real errors only. |

Older pages may still read the compatibility names `--background`, `--card`,
`--border`, `--primary`, `--sage` and `--line`. They point at the kit tokens.

## Type

- Body and controls: DM Sans.
- Titles and numbers: Bricolage Grotesque.
- Editorial accent: Lora italic, used once in a while, never for a control.
- Labels are sentence case. No all-caps display type and no monospace labels.
- Page titles use `--pk-page-title`. One small label, one title, one helper line.

## Spacing, shape and depth

- Spacing runs on a 4px base: 4, 8, 12, 16, 20, 24, 32 and 48.
- Radii: 10, 14, 18 and 24. Pills use 999.
- `--pk-shadow-sm` is for cards. `--pk-shadow-lg` is for a drawer or menu.
- Tap targets are at least 44px. On phones the owner navigation can scroll sideways,
  but the page itself cannot.

## Components

All components are exported from `src/components/patron/kit/index.tsx`.

| Component | What it does |
| --- | --- |
| `Button` | Primary, secondary, quiet and danger. One primary per page. |
| `Field`, `Input`, `Select` | Shared label, hint, input and select styles. |
| `FilterPills` | A filter row with optional counts. |
| `Tabs` | The same pill tabs used on cards and loyalty. |
| `Badge`, `Pill` | Small status and count markers. |
| `StatCard`, `StatGrid` | Big number, label and one change line. |
| `PageHeader` | Small label, title, one helper line, action on the right. |
| `EmptyState` | A plain explanation and one next step. |
| `LoadingState` | Quiet spinner with a status label. |
| `Toast` | Success, warning, danger or neutral feedback. |
| `Drawer` | A right-side panel with Escape and backdrop close. |
| `Avatar` | The one initials circle. |
| `StampCircles` | Read-only stamp progress. |
| `VenueMark` | Restaurant initials or the restaurant logo. |
| `KitBackLink` | The shared back control. |

The existing `src/components/patron/dash.tsx` exports remain as adapters so older
owner pages keep working. New work imports from the kit directly.

## Shells

| Shell | Responsibility |
| --- | --- |
| Marketing | The one public header, footer and help bubble. |
| Diner | Patron or venue identity, back control, guest tabs. |
| Owner | Venue mark, OWNER tag, venue switcher, account menu, desktop sidebar and a horizontal phone navigation row under the header. |
| Staff | Restaurant mark and name on the left, till state on the right. |
| Operator | Patron mark, operator navigation and log out. |

The demo strip is small, collapsed by default, sits bottom left and is hidden from
screenshots. It says "Demo with sample data" and contains `Reset demo data`.

## Rules

1. A screen answers one question and has one primary action.
2. Use the shared header, stat card, table, empty state and form pieces before
   creating another one-off pattern.
3. A label is sentence case. A title is Bricolage. A helper line is DM Sans and one
   line where possible.
4. Status colour is soft green or amber. Terracotta is for the main action, not every
   badge.
5. Marketing and product share the same type stack and tokens. Do not fork them.
6. No em dashes. No developer words on screen.
7. The catalogue at `/dev/kit` must stay complete. Add a component there before
   using it on a page.

## Verification

- `pnpm run typecheck`
- `pnpm run lint`
- `npx vitest run`
- `pnpm run build`
- `npx playwright test tests/e2e/design-kit.spec.ts`

The Playwright rule fails if a covered page shows more than one primary action.
