# Vereino — design tokens

**Version:** 0.2 · **Date:** 2026-11-20 · **Status:** proposal accepted by the product owner on 2026-10-29; conflicts C1–C4 resolved by the owner on 2026-11-20 ([D-033](../../.ai/specs/research/decisions/D-033-ux-audit-decisions.md)); C1 and C2 built in #481 (`globals.css`); the remaining overrides and new tokens are built by the stories of epic #479

**Inputs:** the accepted decisions in [`references.md`](references.md) (rows R01–R07) and engineering standards S7.1, S7.4 and S7.9 ([`.ai/specs/2026-10-21-engineering-standards-and-patterns.md`](../../.ai/specs/2026-10-21-engineering-standards-and-patterns.md)).

**Token source:** `packages/app/src/app/globals.css` holds Open Mercato's tokens and Vereino's overrides of their values (S7.1); the tokens Vereino adds live in `packages/app/src/app/vereino-tokens.css`, imported by `globals.css` and holding no copy of an Open Mercato token (C4, D-033 §3). Values live in `:root` (light) and `.dark` (dark, `@custom-variant dark`); `@theme inline` maps them to Tailwind 4 utilities (`--color-primary` → `bg-primary`); spacing is Tailwind's scale (`--spacing: 0.25rem`). All contrast values below are computed from those values (oklch converted to sRGB; transparent colours composited over the surface they sit on, worst point).

**What Vereino adds:**
- **Raw layer:** nothing. No palette; spacing tokens are multiples of `var(--spacing)`; the club accent comes from club settings at runtime.
- **Semantic layer:** nine new tokens (marked *new*), only where no existing token fits.
- **Component layer:** none needed. Touch targets use `h-11` / `h-12` (R05.1), running text `max-w-prose`.
- **Colour-named tokens** (`--brand-*`, `--badge-*`, `--chart-*`): Vereino code does not use them (checked in `club_core`, `people`, `foundation`, `packages/ui`), so no semantic names are added over them.

## Tokens

| Token | Layer | Light | Dark | Origin | Use for | Do not use for | New / existing |
|---|---|---|---|---|---|---|---|
| `--background` | semantic | `oklch(1 0 0)` #ffffff | `oklch(0.145 0 0)` #0a0a0a | R03.1 | page surface | — | existing |
| `--foreground` | semantic | `oklch(0.145 0 0)` #0a0a0a | `oklch(0.985 0 0)` #fafafa | R03.1 | body text; focused field border | — | existing |
| `--card` / `--card-foreground` | semantic | #ffffff / #0a0a0a | #171717 / #fafafa | R03.1, R01.5 | session cards, Today tiles | page background in the panel | existing |
| `--muted-foreground` | semantic | `oklch(0.545 0 0)` #707070 | `oklch(0.708 0 0)` #a1a1a1 | R03.1 | secondary text: dates, hints, counts | essential text on `--muted` (4.54:1 in light) | existing |
| `--primary` / `--primary-foreground` | semantic | #171717 / #fafafa | #e5e5e5 / #171717 | R03.1, S7.9 Hick | the one primary action per page and dialog | status, club brand | existing |
| `--destructive` | semantic | #e7000b | #ff6467 | R03.1, R04.1 | destructive actions, field error text | "Not attending" (not an error) | existing |
| `--input` | semantic | `oklch(0.64 0 0)` #8c8c8c (Vereino override; platform `oklch(0.922 0 0)`) | `oklch(0.56 0 0)` #747474 (override; platform `oklch(1 0 0 / 15%)`) | R03.1, R03.6, C1, D-033 §1 | form-field and checkbox border | — | existing, overridden in `globals.css` (C1, D-033 §1, built in #481) |
| `--ring` | semantic | `oklch(0.64 0 0)` #8c8c8c (override; platform `oklch(0.708 0 0)` #a1a1a1) | `oklch(0.556 0 0)` #737373 (platform, kept: 4.18:1) | R03.1, C1, D-033 §1 | ring of Open Mercato controls | — | existing, overridden in `globals.css` (light only; C1, D-033 §1, built in #481) |
| `--focus-ring-outer` | semantic | `var(--foreground)` (override; platform 16 % grey) | `var(--foreground)` (override; platform 18 % white) | R03.1, C1, D-033 §1 | outer ring of Open Mercato `shadow-focus` | — | existing, overridden in `globals.css` (C1, D-033 §1, built in #481) |
| `--accent-indigo` | semantic | #6366f1 | #6d74f4 | R03.1 | Open Mercato accents | checkbox and radio: they use `--primary` (`accent-color`, D-033 §6; to be built) | existing |
| `--status-success-*` | semantic | bg #f0fdf4, text #0d542b, icon #00a63e | bg #032e15, text #7bf1a8, icon #00c950 | R01.2, R01.8 | always with a word and an icon (default `CircleCheck`): `CircleCheck` + "Attending" / "Confirmed" / "Paid" / "Nothing to pay" | colour alone | existing |
| `--status-warning-*` | semantic | bg #fffbeb, text #7b3306, icon #e17100 | bg #461901, text #ffd230, icon #fe9a00 | R02.2 | `Clock` (default) + "Confirm by Fri 18:00" / "Due soon" | colour alone | existing |
| `--status-error-*` | semantic | bg #fef2f2, text #82181a, icon #e7000b | bg #460809, text #ffa2a2, icon #fb2c36 | R01.8, R02.4 | `CircleAlert` (default) + "Overdue"; `CircleX` + "Session canceled" | "Not attending" | existing |
| `--status-neutral-*` | semantic | bg #f5f5f5, text #404040, icon #737373 | bg #171717, text #d5d5d5, icon #a1a1a1 | R02.2 | `CircleDashed` (default) + "No answer"; `X` + "Not attending"; `CalendarX` + "Deadline passed" | colour alone | existing |
| `--status-info-*` | semantic | bg #eef2ff, text #312c85, icon #4f39f6 | bg #1e1a4d, text #a3b3ff, icon #615fff | R02.3 | `Info` (default) for information notes and labels; `Users` + "Called up" | colour alone | existing |
| `--club-accent` | semantic (runtime) | from club settings; default `var(--primary)` | same | R06.2, REQ-028, D-033 §3 | header strip, public hero, logo background | status, the primary action; text on the page unless ≥ 4.5:1 against the current theme's background (else `--foreground`) | **new — to be built** (club colour field, approved migration; `vereino-tokens.css`) |
| `--club-accent-foreground` | semantic (computed at runtime) | #000000 or #ffffff, whichever contrasts more with `--club-accent` | same | R06.2, S7.4, D-033 §3 | text and icons on `--club-accent` | — | **new — to be built** (`vereino-tokens.css`) |
| `--focus-indicator` | semantic | `var(--foreground)` → 19.79:1 | `var(--foreground)` → 18.96:1 | S7.4, R07.2, C1, D-033 §1 | the one visible focus indicator everywhere: 2 px outline with 2 px offset on Vereino components (`focus-visible:focus-indicator`, `focus-indicator-inset` inside clipped cells) and on any element without its own focus style | — (Open Mercato components keep `shadow-focus`, whose outer ring `--focus-ring-outer` is overridden to `var(--foreground)`) | **new** (built in #481) |
| `--spacing-related` | semantic (`@theme` → `gap-related`) | `calc(var(--spacing) * 2)` = 8 px | same | R07.3 | label ↔ field, icon ↔ text, chips in one group | between groups | **new** |
| `--spacing-group` | semantic (`gap-group`) | `calc(var(--spacing) * 4)` = 16 px | same | R07.3 | between field groups; between cards in a list | inside a group | **new** |
| `--spacing-card` | semantic (`p-card`) | `calc(var(--spacing) * 4)` = 16 px | same | R07.3 | padding inside a card or panel on member and public pages | the panel (`/backend`) | **new** |
| `--spacing-section` | semantic (`gap-section`) | `calc(var(--spacing) * 6)` = 24 px | same | R07.3 | between sections on member pages (375 px) | the panel | **new** |
| `--spacing-section-public` | semantic (`gap-section-public`) | `calc(var(--spacing) * 8)` = 32 px | same | R07.3 | between sections on public pages | member pages, the panel | **new** |

The panel keeps Open Mercato's spacing and density (R03.2); no Vereino spacing token applies there.

**Checkbox and radio** (D-033 §6): `input[type="checkbox"], input[type="radio"] { accent-color: var(--primary) }` replaces Open Mercato's `--accent-indigo`; a token override in `globals.css`, no ejection.

### Status icons

A status is always a word and a Lucide icon (R01.2, R01.8, D-033 §2), in the status's icon colour; the icon is decorative (`aria-hidden`), the word carries the meaning. Each kind has a default icon; a status listed in the table above takes its own.

| Kind | Default icon | Own icon |
|---|---|---|
| success | `CircleCheck` | — |
| warning | `Clock` | — |
| error | `CircleAlert` | `CircleX` for a cancelled session or a rejection |
| neutral | `CircleDashed` | `X` for "Not attending", `CalendarX` for "Deadline passed" |
| info | `Info` | `Users` for "Called up" |

The mockup's `.badge` (`docs/ux-concept/mockups/app.ts`, `badge()`) follows this map.

## Contrast of the pairs in use

Thresholds: 4.5:1 for text, 3:1 for icons, field borders and focus indicators (S7.4). ⚠ = passes by less than 0.1.

### Light (`:root`)

| Pair | Ratio | Result |
|---|---|---|
| `--foreground` on `--background` | 19.79 | ok |
| `--muted-foreground` on `--background` / `--card` | 4.96 | ok |
| `--muted-foreground` on `--muted` | 4.54 | ok ⚠ |
| `--primary-foreground` on `--primary` | 17.16 | ok |
| `--secondary-foreground` on `--secondary` | 16.42 | ok |
| `--destructive` on `--background` | 4.76 | ok |
| status text on status bg (error, success, warning, info, neutral) | 9.21, 8.67, 8.77, 10.26, 9.53 | ok |
| status solid label on solid (error, success, warning, info, neutral) | 4.76, 4.94, 5.05, 6.44, 7.80 | ok |
| status icon on status bg (error, success, warning, info, neutral) | 4.36, 3.07 ⚠, 3.08 ⚠, 5.76, 4.34 | ok |
| `--primary` button edge on `--background` | 17.91 | ok |
| focused field border (`--foreground`) on `--background` | 19.79 | ok |
| checkbox fill `--primary` on `--background`; tick on fill (D-033 §6, to be built; today `--accent-indigo` 4.47; 4.47) | 17.91; 17.16 | ok |
| `--input` field border on `--background` / `--card`; on `--muted` | 3.36; 3.08 | ok — overridden to `oklch(0.64 0 0)` #8c8c8c (was 1.26; C1, D-033 §1, #481) |
| `--ring` on `--background` | 3.36 | ok — overridden to `oklch(0.64 0 0)` (was 2.59; C1, D-033 §1, #481) |
| `shadow-focus` outer ring (`--focus-ring-outer`) on `--background`; inner ring equals the page | 19.79 | ok — overridden to `var(--foreground)` (was a 16 % grey, 1.14; C1, D-033 §1, #481) |
| AppShell sidebar group heading (`--muted-foreground`) on `--background` (the AppShell aside is `bg-background`) | 4.96 | ok — Vereino rule in `globals.css` (was `text-muted-foreground/70`, 2.78; C2, D-033 §1, #481) |

### Dark (`.dark`)

| Pair | Ratio | Result |
|---|---|---|
| `--foreground` on `--background` | 18.96 | ok |
| `--muted-foreground` on `--background` / `--card` / `--muted` | 7.63 / 6.91 / 5.83 | ok |
| `--primary-foreground` on `--primary` | 14.22 | ok |
| `--destructive` on `--background` | 6.84 | ok |
| status text on status bg (error, success, warning, info, neutral) | 8.40, 10.67, 10.37, 7.98, 12.17 | ok |
| status solid label on solid | 4.76–7.80 | ok |
| status icon on status bg | 4.23, 6.71, 6.99, 3.50, 6.91 | ok |
| `--primary` button edge on `--background` | 15.72 | ok |
| focused field border on `--background` | 18.96 | ok |
| `--ring` on `--background` | 4.18 | ok |
| checkbox fill `--primary` on `--background`; tick on fill (D-033 §6, to be built; today `--accent-indigo` 5.14; 3.85) | 15.72; 14.22 | ok |
| `--input` field border on `--background` / `--card` / `--muted` | 4.25 / 3.85 / 3.25 | ok — overridden to `oklch(0.56 0 0)` #747474 (was 1.47 / 1.57; C1, D-033 §1, #481) |
| `shadow-focus` outer ring on `--background` / `--card` | 18.96 / 17.16 | ok — overridden to `var(--foreground)` (was 1.64 / 1.75; C1, D-033 §1, #481) |
| AppShell sidebar group heading (`--muted-foreground`) on `--background` | 7.63 | ok — Vereino rule in `globals.css` (was `text-muted-foreground/70`, 4.20, fails 4.5:1; C2, D-033 §1, #481) |

The mockup audit's estimates are confirmed on the app values: ring 2.59 (≈ 2.6), field border 1.26 (≈ 1.3), grey on grey 4.54 (≈ 4.5). New finding: Open Mercato button focus is nearly invisible (1.14 / 1.64). The tables show the values after the overrides of D-033 §1 (built in #481), computed the same way; the platform values are in parentheses ("was …").

### Club accent (R06.2)

- Text and icons on the accent are black or white, whichever contrasts more — at least 4.58:1 for any colour.
- The accent is used as text on the page only when it reaches 4.5:1 against the current theme's background; otherwise the text uses `--foreground`.
- The accent is never an element's only edge unless it reaches 3:1 against the background.

| Club colour | Label on accent | As text on light page | As text on dark page |
|---|---|---|---|
| green #1b8f3a | black 5.04 | 4.17 → `--foreground` | 4.75 ok |
| yellow #ffd400 | black 14.67 | 1.43 → `--foreground` | 13.83 ok |
| sky #6ec6ff | black 11.18 | 1.88 → `--foreground` | 10.54 ok |
| red #e53935 | black 4.97 | 4.23 → `--foreground` | 4.68 ok |
| navy #0b2a5b | white 14.03 | 14.03 ok | 1.41 → `--foreground` |
| mid grey #767676 | black 4.62 | 4.54 ok | 4.36 → `--foreground` |

## Decisions that are not tokens

| Decision | Kind | Interface | Layer |
|---|---|---|---|
| R01.4 gathering time as its own field | rule | member | Vereino rule |
| R01.5 at most three tiles on Today | rule | member | Vereino rule |
| R02.2 confirmation deadline before and after | rule | member | Vereino rule + OM as is (`StatusBadge`) |
| R02.5 session detail answers when, where, what to bring | rule | member | Vereino rule |
| R04.1 error message says what happened and how to fix it | rule | member, public | Vereino rule |
| R04.3 avoid disabled buttons; a disabled one says what is missing | rule | member, public, panel | Vereino rule |
| R05.1 touch targets `h-11` / `h-12` | rule | member, public | Vereino rule |
| R05.2 three to five destinations in the tab bar | rule | member | Vereino rule |
| R07.1 audit fixes (reflow, focus not clipped, line length) | rule | member, public, panel | Vereino rule |
| R01.1 calendar entry with child chips | component | member | Vereino component |
| R01.3 venue line with map link | component | member, public | Vereino component |
| R01.6 member tab bar | component | member | Vereino component |
| R01.7 member calendar (list default, month tab) | component | member | Vereino component |
| R02.1 share text from the session record | component | member, panel | Vereino component |
| R02.3 "Who's coming" | component | member | Vereino component |
| R02.4 payment summary before paying | component | member | Vereino component |
| R04.2 error summary | component | member, public | Vereino component |
| R06.1 club header with logo and name | component | member, public | Vereino component |
| R07.2 attendance toggle | component | member | Vereino component |
| R01.2, R01.8 status with word and icon | component | member | OM as is (`StatusBadge`, `Alert`) |
| R03.1 tokens, R03.2 panel components and density, R03.3 Lucide icons | component | all | OM as is |
| R03.4 `CrudForm` labels without `htmlFor` | component | panel | OM as is + Vereino workaround and upstream report (C3, D-033 §7) |
| R03.5 AppShell sidebar contrast and link name | component | panel | heading contrast: Vereino CSS override (C2, D-033 §1, built in #481); link name: worked around on the Vereino side and reported upstream (D-033 §7), axe baseline until then |

Inconsistency to fix in the UX concept: M-02 in [`README.md`](README.md) describes a "grid of 4 tiles"; R01.5 allows at most three.

## Conflicts for the owner's decision

All four were decided by the owner on 2026-11-20 ([D-033](../../.ai/specs/research/decisions/D-033-ux-audit-decisions.md)); the resolution names the decision.

| ID | Conflict with | Options | Status |
|---|---|---|---|
| C1 | "Open Mercato look unchanged" (2026-10-27); S7.4 | Change `--input` (light `oklch(0.64 0 0)`, dark `oklch(0.56 0 0)`), `--ring` (light `oklch(0.64 0 0)`) and `--focus-ring-outer` (both themes `var(--foreground)`). Without them form fields and the panel's button focus fail WCAG 1.4.11. Vereino components avoid the focus problem with `--focus-indicator`, but not the field border, because fields are Open Mercato `Input`. Alternatives: keep the values and record the gap, or report upstream and wait. | **resolved — D-033 §1:** override `--input`, `--ring` and `--focus-ring-outer` in `globals.css` with the values above (3.36 / 4.25 for fields, 3.36 ring, 19.79 / 18.96 focus); one focus indicator, 2 px outline in `--foreground` with 2 px offset; no ejection. Built in #481 |
| C2 | "Open Mercato look unchanged"; S7.4 | AppShell sidebar group headings fail text contrast: report upstream and keep the axe baseline, or override in Vereino CSS. | **resolved — D-033 §1:** override the heading colour in Vereino CSS to `--muted-foreground` at full opacity (4.96 light, 7.63 dark on `--background`, the AppShell aside surface). Built in #481 |
| C3 | cost of an Open Mercato component change | `CrudForm` labels: report upstream and keep the node-level axe baseline (current state), or eject `CrudForm`. | **resolved — D-033 §7:** no ejection; a workaround on the Vereino side (wrapper or local patch listed in `CONTRIBUTING.md`) and a report upstream to Open Mercato |
| C4 | S7.1 "Vereino keeps no separate copy" | Where the nine new tokens live. **Recommended:** a separate file `packages/app/src/app/vereino-tokens.css` imported by `globals.css`, holding only the new tokens and no copy of Open Mercato tokens, so an Open Mercato upgrade diffs cleanly. Alternative: a marked Vereino block inside `globals.css`. | **resolved — D-033 §3:** the separate file `packages/app/src/app/vereino-tokens.css`, imported by `globals.css`, with the new tokens only; today `--focus-indicator` and the C1/C2 overrides of #481 sit in a marked Vereino block in `globals.css` |
