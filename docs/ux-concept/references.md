# Vereino — design references and decisions

**Version:** 0.1 · **Date:** 2026-10-29 · **Status:** decisions R01–R07 accepted by the product owner on 2026-10-29; conflicts C1–C4 open

**What this file is:** the references the Vereino interface learns from, and for each observed pattern what Vereino takes, what it does instead, and where the decision lands (its layer). The design tokens (`docs/ux-concept/tokens.md`, next step) are built only from rows marked `accepted` and from conflicts marked `resolved`.

**Fixed inputs, not re-decided here:**
- **Open Mercato look (owner's decision, 2026-10-27, applied in PR #46):** colours and tokens stay on the Open Mercato defaults in `packages/app/src/app/globals.css`; structure, icons and content may change. Any row that would change an existing Open Mercato token value is listed under *Conflicts*, never accepted silently.
- **S7.1 of the engineering standards:** "Vereino keeps no separate copy" of the design-system rules.
- **S7.4 and S7.9** (WCAG 2.2 AA numbers, UX laws and heuristics) — rows below apply them; they do not restate them.

**Columns:**
- **Interface:** `member` (phone, `/club`, 375 px baseline), `public` (`/p/…`), `panel` (desktop, `/backend`).
- **Layer:** where the decision lands —
  `OM as is` (Open Mercato component or token, unchanged) ·
  `Vereino rule` (when to use what; no new value) ·
  `Vereino token` (a new token value) ·
  `Vereino component` (new component in `packages/ui`) ·
  `OM component change` (changing an Open Mercato component: an eject or an upstream fix — **costly**, never becomes a token).
- **Status:** `proposed` · `accepted` · `rejected`. Only the owner changes it.

## Sources

| ID | Reference | Kind | Evidence | Checked |
|---|---|---|---|---|
| R01 | SportBM, as used by LKS Lotnik 1949 (guardian's phone account) | competing club app | `.ai/specs/research/2026-10-23-benchmark-sportbm.md` (four screenshots, not stored) | 2026-10-23 |
| R02 | Guardian and coordinator interviews (another club's app, Messenger, WhatsApp) | user evidence | `.ai/specs/research/interviews/2026-10-23-interview-guardian-founder.md`, `…-guardian-multi-club.md`, `…-coordinator-2.md`; summary in `.ai/specs/product-brief.md` → Problems | 2026-10-23 |
| R03 | Open Mercato 0.9.0 installed UI (AppShell, `CrudForm`, `DataTable`, tokens, Lucide icons) | platform Vereino builds on | `packages/app/src/app/globals.css`; `node_modules/@open-mercato/ui`; ENG-TEST-25 axe scan (PR #50); lesson `platform-crudform-labels-axe-baseline` | 2026-10-29 |
| R04 | GOV.UK Design System — error message, error summary, button | public design system | https://design-system.service.gov.uk/components/error-message/ · https://design-system.service.gov.uk/components/button/ | 2026-10-29 |
| R05 | Platform guidelines — Apple HIG accessibility, Android accessibility help, Material navigation bar | platform design guidelines | https://developer.apple.com/design/human-interface-guidelines/accessibility · https://support.google.com/accessibility/android/answer/7101858 · https://github.com/material-components/material-components-android/blob/master/docs/components/BottomNavigation.md | 2026-10-29 |
| R06 | Club brand: club and section logos (REQ-028), a possible club accent colour later | product requirement | `.ai/specs/2026-10-20-vereino-club-management.md` → REQ-028 | 2026-10-29 |
| R07 | Vereino clickable mockup and its generic-look audit | own artefact | `docs/ux-concept/mockups/`; PR #46 | 2026-10-27 |

## Decisions

### R01 — SportBM

| ID | Observed | Take / do instead | Interface | Layer | Status |
|---|---|---|---|---|---|
| R01.1 | One calendar holds all of a guardian's children; each entry names the child. | **Take.** One calendar across children and sections (already in the club spec and UX concept). **Instead of** repeating the same event once per child (the tournament appeared three times), show it once with one chip per child, each chip with its own time if they differ. | member | Vereino component (calendar list item) | accepted |
| R01.2 | Event detail opens with a green banner "call-up accepted". | **Take** the status at the top of the detail. **Instead of** colour alone, the status always carries a word and an icon (S7.4, WCAG 1.4.1), e.g. check icon + "Attending", clock + "Waiting for your answer", cross + "Not attending". | member | OM as is (`StatusBadge`, `Alert`) | accepted |
| R01.3 | Venue shown with street address and a map-pin button. | **Take.** The address and the map link come from the place record, never from free text (R02.2). | member, public | Vereino component (venue line) | accepted |
| R01.4 | Gathering time and kit only in a free-text "event details" field. | **Do instead:** gathering time is its own field, shown above the start time when it differs; kit notes stay free text below. | member | Vereino rule (session detail layout) | accepted |
| R01.5 | Dashboard of nine tiles incl. insurance, offers and an ad banner; 135 unread notifications. | **Do instead:** "Today" shows only what needs the guardian now — today's sessions, open confirmations, amount due — at most three tiles; no ads or offers; unread counts only for items that need an action (S7.9 Hick, minimalism). | member | Vereino rule | accepted |
| R01.6 | Bottom navigation: dashboard, calendar, payments, more, profile. | **Take** a five-item bottom bar: Today · Calendar · Messages · Payments · More (UX concept 3.1); profile goes under More. | member | Vereino component (member tab bar) | accepted |
| R01.7 | Calendar has a "7 days" list tab and a month view whose week strip shows the number of events per day. | **Take** both: list of the next days as the default on phones (S7.2), month view as the second tab; a day with events shows a count with a text label for screen readers. | member | Vereino component (member calendar); panel keeps OM schedule | accepted |
| R01.8 | "To pay" tile shows a green check when nothing is due. | **Take** with a word: "Nothing to pay" plus the check icon; when something is due, the amount and the nearest due date. | member | OM as is (status + text) | accepted |

### R02 — interviews

| ID | Observed | Take / do instead | Interface | Layer | Status |
|---|---|---|---|---|---|
| R02.1 | Conflicting times in one Messenger post (gathering 8:30 vs poll 9:30); a family went to the wrong Orlik. | **Do instead:** one source for time and place — the session record; share text for group chats is generated from it (PR #46). | member, panel | Vereino component (share text) | accepted |
| R02.2 | A confirmation deadline was missed; the coach phones parents. | **Take** the deadline, and show it: "Confirm by Fri 18:00" before it; after it a plain "deadline passed" state with a hint to message the coach; the session stays visible (PR #46). | member | Vereino rule + OM as is (`StatusBadge`) | accepted |
| R02.3 | The guardian cannot see who else is called up (needed for lifts). | **Take** a "Who's coming" list on the session, limited to what the club's privacy settings allow. | member | Vereino component | accepted |
| R02.4 | A ~PLN 2 commission per payment annoys the parent; a visible "unpaid" status prompts payment. | **Take** a payment summary before paying: charges, online fee (or "covered by the club"), total (PR #46, R13); keep the overdue status visible on Today. | member | Vereino component (payment summary) | accepted |
| R02.5 | Guardian mutes all messengers and checks time and place the day before. | **Take:** the session detail answers "when, where, what to bring" without opening messages; no reliance on push alone. | member | Vereino rule | accepted |

### R03 — Open Mercato 0.9.0

| ID | Observed | Take / do instead | Interface | Layer | Status |
|---|---|---|---|---|---|
| R03.1 | Complete token set in `globals.css` (`:root`, `.dark`, `@theme inline`), semantic names plus colour-named raw groups (`--brand-lime`, `--badge-sky-*`, `--chart-*`). | **Take as is** (owner's decision 2026-10-27). Vereino adds semantic names over colour-named tokens only where it uses them. | member, public, panel | OM as is | accepted |
| R03.2 | Panel components: AppShell, `DataTable`, `CrudForm`, `useConfirmDialog`, `StatusBadge`, flash messages; panel density as shipped. | **Take as is** for the panel, including its density (S7.1). | panel | OM as is | accepted |
| R03.3 | Lucide line icons. | **Take** everywhere, also on member and public pages; no emoji or Unicode glyphs as icons (PR #46). | member, public, panel | OM as is | accepted |
| R03.4 | `CrudForm` renders the field `<label>` without `htmlFor`; controls have no accessible name (axe `label`, `button-name`, critical). | **Do instead:** fix at the source — report upstream; until then the node-level axe baseline (ENG-TEST-25). Member and public forms built by Vereino associate every label. | panel | OM component change (**costly**) — see C3 | accepted |
| R03.5 | AppShell sidebar group headings fail text contrast; the back link's `aria-label` differs from its text. | **Do instead:** report upstream; no Vereino override. | panel | OM component change (**costly**) — see C2 | accepted |
| R03.6 | Focus ring and form-field border on the mockup were measured near or below 3:1 by the audit (≈ 2.6:1 and ≈ 1.3:1); muted text on a muted background ≈ 4.5:1. | **Measure** on the real `globals.css` values in both themes in the tokens step; any fix to an existing token is a conflict (C1). | member, public, panel | Vereino token or OM token change — see C1 | accepted |

### R04 — GOV.UK Design System

| ID | Observed | Take / do instead | Interface | Layer | Status |
|---|---|---|---|---|---|
| R04.1 | An error message explains what went wrong and how to fix it, next to the field, linked to it. | **Take** for every Vereino-built form (S7.9 error recovery); panel forms keep `CrudForm`'s field errors. | member, public | Vereino rule | accepted |
| R04.2 | On submit, an error summary at the top lists every error with the same wording, linking to the fields. | **Take** for member and public forms with more than one field; focus moves to the summary. | member, public | Vereino component (error summary) | accepted |
| R04.3 | Avoid disabled buttons where possible: poor contrast, confusing. | **Take** together with S7.9: prefer an enabled button plus validation; when a button must be disabled, visible text next to it says what is missing. | member, public, panel | Vereino rule | accepted |

### R05 — platform guidelines

| ID | Observed | Take / do instead | Interface | Layer | Status |
|---|---|---|---|---|---|
| R05.1 | Apple HIG: default control size 44 × 44 pt (minimum 28 × 28 pt); Android: touch targets at least 48 × 48 dp. | **Take** S7.4: 44 × 44 CSS px for primary actions on phones, 48 × 48 where the component allows (attendance and declaration toggles). | member, public | Vereino rule (Tailwind `h-11` / `h-12`, no new token) | accepted |
| R05.2 | Material: a navigation bar has three to five destinations. | **Take** — consistent with R01.6 (five items, the rest under More). | member | Vereino rule | accepted |

### R06 — club brand

| ID | Observed | Take / do instead | Interface | Layer | Status |
|---|---|---|---|---|---|
| R06.1 | REQ-028: club logo, optional section logo, section falls back to the club logo. | **Take:** the logo in the member header and on public pages; never as the only identification (club name next to it as text). | member, public | Vereino component (club header) | accepted |
| R06.2 | A club may later supply an accent colour; its value is set at runtime from club settings. | **Take as a new token** `--club-accent` with its foreground chosen automatically for contrast; when neither black nor white reaches 4.5:1 on it, the UI falls back to the neutral `--primary`. Used only for brand moments (header strip, public hero), never for status or the primary action. | member, public | Vereino token — see C4 | accepted |

### R07 — Vereino mockup and audit

| ID | Observed | Take / do instead | Interface | Layer | Status |
|---|---|---|---|---|---|
| R07.1 | Mockup uses Open Mercato colours with Vereino structure; audit fixed layout at 768 px and 320 px, inward focus rings in segmented controls, line length ≤ 75 characters. | **Take** these fixes as the reference for implementation (S7.4 reflow, S7.9 line length). | member, public, panel | Vereino rule | accepted |
| R07.2 | Attendance as a two-option segmented control ("Attending" / "Not attending") on the session card. | **Take** with R05.1 sizes and a visible focus ring that is not clipped. | member | Vereino component (attendance toggle) | accepted |
| R07.3 | Member spacing: cards separated more widely than fields inside a card. | **Take** the proximity rule (S7.9) with Tailwind steps: inside a group 8 px, between groups 16 px, between sections 24–32 px on member and public pages; panel keeps Open Mercato spacing. | member, public | Vereino rule (semantic spacing names decided in the tokens step) | accepted |

## Conflicts

Each conflict needs the owner's decision. The rows are accepted; where a row points to an open conflict, only the conflict-free part applies until the conflict is resolved.

| ID | Rows | Conflict with | Options | Status |
|---|---|---|---|---|
| C1 | R03.6 | "Open Mercato look unchanged" (2026-10-27) | (a) keep the values and accept a known S7.4 gap; (b) override the failing tokens in a marked Vereino block; (c) report upstream and wait. The real contrast is measured in the tokens step first. | open |
| C2 | R03.5 | "Open Mercato look unchanged"; S7.4 | (a) report upstream and keep the axe baseline; (b) override the sidebar heading colour in Vereino CSS. | open |
| C3 | R03.4 | Cost of an `OM component change` | (a) report upstream and keep the node-level axe baseline (current state); (b) eject `CrudForm` to fix labels in Vereino. | open |
| C4 | R06.2, R07.3 | S7.1 "Vereino keeps no separate copy" | (a) a marked Vereino block in `globals.css`; (b) a separate file imported by `globals.css`; either way only new tokens, no copies of Open Mercato tokens. | open |
