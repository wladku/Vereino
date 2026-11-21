---
number: D-033
date: 2026-11-20
owner: Władek Kuć
source: the owner's answers of 2026-11-20 to the UX audit of the same day (`origin/main` at `146858ee`; local ephemeral app, Playwright and axe-core, 50 member screens in four roles, 6 public and 14 panel screens, pl/en, light/dark, 320/375/768/1440 px), recorded from a Claude Code session in epic #479
status: confirmed
---
# D-033 Visible focus, statuses with icons, the club's own look and Open Mercato bugs worked around: seven decisions of the UX audit

After E06–E14 the application matches the mockup screen by screen, but the audit of 2026-11-20 for generic look, UX and accessibility found no visible keyboard focus anywhere, statuses without the icon `docs/ux-concept/tokens.md` requires, the Open Mercato template still served at `/`, a letter logo in Tailwind blue, no club colour, and bugs inside Open Mercato components. It also closes the four conflicts C1–C4 that `tokens.md` had left open since 2026-10-29. The owner settled them:

1. **Focus and control contrast (`tokens.md` C1, C2).** Vereino overrides the platform tokens in `globals.css` — `--focus-ring-outer`, `--input`, `--ring` and the colour of the AppShell sidebar group headings — so that field borders, rings and focus indicators reach 3:1 and text 4.5:1. One visible focus indicator is used everywhere: a 2 px outline in `--foreground` with a 2 px offset. No Open Mercato component is ejected.
2. **Statuses carry a word and an icon**, as `tokens.md` says; the mockup's `.badge` is corrected to match.
3. **The club colour (R06.2) is built.** The club settings get a colour field — **the migration it needs is approved by the owner** — and the tokens `--club-accent` / `--club-accent-foreground` live in a separate `packages/app/src/app/vereino-tokens.css` (closes C4). The text colour on the accent is computed for contrast.
4. **`/`** goes to the club's public page when it is published and to `/login` otherwise; `/start` is disabled in production.
5. **The product mark** is a neutral Vereino mark in `--primary`, as in the mockup; a real logo may replace it later.
6. **Checkbox and radio** use `--primary` instead of `--accent-indigo` (a token override, no ejection).
7. **Bugs inside Open Mercato components** — `CrudForm` labels without `htmlFor` (C3), the size of `Switch` and `Radio`, the English "Access denied" toast, AppShell accessibility — are worked around on the Vereino side (wrappers, translations, local patches listed in `CONTRIBUTING.md`) **and** reported upstream to Open Mercato.

**Why:** WCAG 2.2 AA (S7.4) is a release condition for the member and public pages and the panel; a keyboard user who cannot see the focus, or a colour-blind guardian who cannot tell "Overdue" from "Paid", cannot use the product. The owner's earlier "Open Mercato look unchanged" (2026-10-27) is kept for components and layout, but not where a platform value fails WCAG. The club colour and the product mark remove the generic template look without ejecting platform components, so Open Mercato upgrades keep diffing cleanly.

**Applied in:** `docs/ux-concept/tokens.md` (conflicts C1–C4 resolved, the focus indicator, checkbox and radio on `--primary`, the club accent tokens) and the mockup `docs/ux-concept/mockups/` (statuses with icons) — #480; the application changes are the other stories of epic #479 (#481–#497).

**To change:** a superseding record approved by the owner.
