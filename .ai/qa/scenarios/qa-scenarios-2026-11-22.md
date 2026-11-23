# QA Scenarios — since 2026-11-20

Report window: **2026-11-20 → 2026-11-22** (routes for base `main`). Issue: [#569](https://github.com/wladku/Vereino/issues/569).

## Executive Summary

- **Start with the 4 open PRs waiting for your `qa` label** (`risk-high` + `needs-qa`): [#530](https://github.com/wladku/Vereino/pull/530), [#506](https://github.com/wladku/Vereino/pull/506), [#563](https://github.com/wladku/Vereino/pull/563) and [#570](https://github.com/wladku/Vereino/pull/570), which was opened after the issue was written. The merge train holds each one until it gets `qa`. Each has a short section below: where to tap, what to check, and what you must see to pass it.
- Reviewed **64 merged PRs**, all into `main`, none into other branches. 1 is excluded (the previous run of this report, #473). 12 merged on 20 November and are already covered by `qa-scenarios-2026-11-20`, so this report only lists them. The other **51** are new here.
- The 51 new PRs make up **22 scenarios** (3 P0, 16 P1, 3 P2) covering 28 of them. The other **23 PRs** need no manual check (docs, tests, CI, tooling, dependency bumps).
- Riskiest theme: the E20 UI pass touches every screen (focus rings, status icons, touch targets, menu groups, refusals). The privacy changes erase personal data next to accounting records (anonymisation, link purge). The operator side is new too (nightly backups, alerts, start-up checks).
- 19 of the 51 PRs merged with `needs-qa` and no recorded QA sign-off; this report is that checklist. 14 items could not be resolved against the code; they are listed under "Unresolved items".

## How to use this report

- Work in the sandbox with the example club and the interface switched to **Polish**. Every quoted label („…”) is the text the Polish catalog (`pl.json`) shows.
- Administrator and treasurer scenarios run on the desktop (`/backend`). Every other role runs on a phone or in a 375 px wide browser window. Operator scenarios run in a server shell on staging or a disposable database, never on production.
- Follow the steps, tick each "verify" bullet, and file a new issue for anything under "what can go wrong" that you see. Scenario ids (Q1 …, S01 …) are stable within this report only.

## Recommended QA Order

| Id | Priority | Role | Scenario | PRs |
|---|---|---|---|---|
| Q1 | P0 | administrator, operator | Security headers, no caching of signed-in API answers, stricter CSP (open, waits for `qa`) | [#530](https://github.com/wladku/Vereino/pull/530) |
| Q2 | P0 | administrator, member | Each club has its own colour on the member header, public page and fallback logo (open, waits for `qa`) | [#506](https://github.com/wladku/Vereino/pull/506) |
| Q3 | P0 | administrator, operator | Former participants are anonymised after the club's retention period (open, waits for `qa`) | [#563](https://github.com/wladku/Vereino/pull/563) |
| Q4 | P0 | administrator, member | The app still works after the Next.js security upgrade (open, waits for `qa`) | [#570](https://github.com/wladku/Vereino/pull/570) |
| S01 | P0 | administrator, coach | A keyboard user always sees the focus; closing a dialog returns focus to its button | [#502](https://github.com/wladku/Vereino/pull/502) |
| S02 | P0 | guardian, coach, coordinator | „Dziś” and the session page open without "Access denied" errors; a real refusal is in Polish | [#501](https://github.com/wladku/Vereino/pull/501) |
| S03 | P0 | guest, administrator | Nothing from the Open Mercato template is left: "/" leads to the club page or sign-in | [#503](https://github.com/wladku/Vereino/pull/503) |
| S04 | P1 | guardian, coach, coordinator | „Dziś” shows the club header and at most three tiles; the calendar opens on the upcoming list | [#537](https://github.com/wladku/Vereino/pull/537) |
| S05 | P1 | coach, coordinator, attendant | Staff on the phone are offered only what they may do; each refusal says why | [#508](https://github.com/wladku/Vereino/pull/508) |
| S06 | P1 | guardian, member, coach | Every control on the member pages is 44 px; Tab focus is never hidden under the attendance bar | [#512](https://github.com/wladku/Vereino/pull/512), [#550](https://github.com/wladku/Vereino/pull/550), [#552](https://github.com/wladku/Vereino/pull/552) |
| S07 | P1 | guardian | An empty message or leave request says what is missing instead of a greyed-out button | [#507](https://github.com/wladku/Vereino/pull/507) |
| S08 | P1 | guest | Public club pages show content and the club's name in the tab title even without JavaScript | [#509](https://github.com/wladku/Vereino/pull/509) |
| S09 | P1 | guest, administrator | The club's privacy notice is in every public footer and follows the language | [#536](https://github.com/wladku/Vereino/pull/536) |
| S10 | P1 | treasurer, guardian | Every status pill shows a word and an icon; cancelled sessions and events read as an error | [#500](https://github.com/wladku/Vereino/pull/500) |
| S11 | P1 | administrator | The dashboard shows every tile title in Polish under one greeting heading | [#505](https://github.com/wladku/Vereino/pull/505) |
| S12 | P1 | administrator | The panel menu has six groups in the mockup's order, short labels and the new terms | [#513](https://github.com/wladku/Vereino/pull/513) |
| S13 | P1 | administrator | Admin lists offer „Spróbuj ponownie” when loading fails; access-denied pages offer a way out | [#515](https://github.com/wladku/Vereino/pull/515) |
| S14 | P1 | administrator | Anonymisation clears order contacts and payer labels and keeps the name until the sixth year | [#535](https://github.com/wladku/Vereino/pull/535), [#562](https://github.com/wladku/Vereino/pull/562) |
| S15 | P1 | administrator, coach | Two people accepting cash at the same moment, e-mail on, both get a receipt | [#553](https://github.com/wladku/Vereino/pull/553), [#556](https://github.com/wladku/Vereino/pull/556) |
| S16 | P1 | operator, guardian | Used and expired links are deleted 30 days later; valid links keep working | [#541](https://github.com/wladku/Vereino/pull/541) |
| S17 | P1 | operator | The nightly payments check reports drift between charges, payments and receipt numbers | [#555](https://github.com/wladku/Vereino/pull/555) |
| S18 | P1 | operator | The app refuses to start without required variables; deploys never set up a new database | [#478](https://github.com/wladku/Vereino/pull/478) |
| S19 | P1 | operator | The nightly encrypted backup reaches the bucket, a failure alerts, the restore drill works | [#474](https://github.com/wladku/Vereino/pull/474), [#476](https://github.com/wladku/Vereino/pull/476), [#524](https://github.com/wladku/Vereino/pull/524) |
| S20 | P2 | administrator, coach | The day axis uses the mockup's colours; the place page fits a 768 px tablet | [#510](https://github.com/wladku/Vereino/pull/510) |
| S21 | P2 | administrator, coach, guardian | Information notices are pale blue; checkboxes and radios use the primary colour | [#538](https://github.com/wladku/Vereino/pull/538) |
| S22 | P2 | administrator, guardian, attendant | Texts promise nothing, invent no prices and say what to do next | [#539](https://github.com/wladku/Vereino/pull/539) |

## Waiting for your `qa` label

These PRs are still open. Each carries `risk-high` and `needs-qa`, and the merge train holds it until you add `qa`. The labels and routes come from each PR's own diff, so some labels are not on `main` yet.

#### Q1 · P0 — Security headers, no caching of signed-in API answers, stricter CSP

**PR:** [#530](https://github.com/wladku/Vereino/pull/530) (open, `risk-high`, `needs-qa`) · **Issue:** [#463](https://github.com/wladku/Vereino/issues/463)
**Device:** desktop. You need the browser devtools console and `curl -I`; a phone shows neither · **Time:** ~10 min
**What changed:** Every response now carries `Permissions-Policy`, and in production `Strict-Transport-Security`. Signed-in API answers are marked `private, no-store`. The production security policy (CSP) no longer allows `'unsafe-eval'`, so form validation could break if any code still relies on it.

**Where to click**

1. Use a **production build** (not `yarn dev`): HSTS and the CSP change apply only in production. Run `curl -I <host>/login`.
2. In the browser, with the devtools console open, sign in at `/login`. Then open `/backend`, `/backend/people/persons/create` and `/backend/activities/occurrences`.
3. On `/backend/people/persons/create`, submit the empty form, then fill in the required fields and save.
4. In the devtools Network tab, open any `/api/...` request made while signed in and read its response headers.

**What to verify**

- [ ] `curl -I` → `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()` and `Strict-Transport-Security: max-age=63072000; includeSubDomains`. The `Content-Security-Policy` contains no `unsafe-eval`
- [ ] No "Refused to evaluate…" or `script-src` CSP error appears in the console on any of the four pages
- [ ] The form shows validation errors when empty and saves when filled in
- [ ] A signed-in `/api/…` response has `Cache-Control: private, no-store`. An anonymous public JSON route keeps `public, s-maxage=60`

**What can go wrong**

- Form validation silently does nothing because eval is blocked
- The online payment page breaks. Stripe is allowed by the CSP, but that page was not among the PR's checks

**How to pass:** add `qa` when `curl -I` shows the headers above and the console shows no CSP violation on the four pages. This is not testable on a phone. If no production build is at hand, take the ENG-TEST-11 CI run as the evidence.

#### Q2 · P0 — Each club has its own colour on the member header, public page and fallback logo

**PR:** [#506](https://github.com/wladku/Vereino/pull/506) (open, `risk-high`, `needs-qa`) · **Issue:** [#486](https://github.com/wladku/Vereino/issues/486)
**Device:** phone 375 px (visual, mobile-first) · **Time:** ~10 min
**What changed:** The club settings get the field „Kolor klubu” (hex; empty means the default colour). It colours the member header bar on `/club`, a thin strip and the hero on the public page, and the logo box when there is no logo. The text on it switches to black or white automatically. A section without its own logo now shows its own initial instead of the club's.

**Where to click**

1. „Klub” → „Ustawienia” (`/backend/club/settings`), group „Klub”, field „Kolor klubu”.
2. Enter `red` and tap „Zapisz ustawienia”. Then enter `#0b2a5b` (navy) and save.
3. „Klub” → „Publikacja” → „Podgląd” opens `/p/<clubSlug>`. Then open a section page `/p/<clubSlug>/sections/<sectionSlug>`.
4. Sign in as a member and open `/club`.
5. Back in the settings, enter a light colour such as `#ffd400`, save, and recheck `/p/<clubSlug>`. Then clear the field and save.
6. „Klub” → „Sekcje” (`/backend/club/sections`).

**What to verify**

- [ ] `red` → „Podaj kolor jako # i sześć cyfr szesnastkowych, np. #1b8f3a”. Navy saves with „Ustawienia klubu zapisane”
- [ ] Navy: the hero, the 4 px header strip and the `/club` header bar are navy with white text. Yellow gives black text
- [ ] Text stays readable with the phone in light and dark mode
- [ ] With the field empty, the colours fall back to the theme's primary colour, not grey
- [ ] A section with no logo of its own and no club logo shows its own initial, not the club's

**What can go wrong**

- Text on the colour is unreadable (white on yellow)
- The colour is missing on `/club` or on the facilities, activities, payments or messages pages
- Clearing the field leaves the old colour

**How to pass:** add `qa` when navy and yellow both render with readable text on `/p/…` and `/club` at 375 px, and the empty field falls back to the default. All of it can be checked on the phone.

#### Q3 · P0 — Former participants are anonymised after the club's retention period

**PR:** [#563](https://github.com/wladku/Vereino/pull/563) (open, `risk-high`, `needs-qa`) · **Issue:** [#471](https://github.com/wladku/Vereino/issues/471)
**Device:** phone 375 px for the setting; desktop terminal for the job, which runs only from the command line · **Time:** ~12 min
**What changed:** The club settings get the group „Przechowywanie danych” with „Anonimizuj byłych uczestników po (miesiącach)” (default 12, range 1–120). A daily job anonymises people who left at least that long ago and have no role, no guardianship and no unpaid charge. Their payments stay.

**Where to click**

1. Phone: „Klub” → „Ustawienia” (`/backend/club/settings`), scroll to „Przechowywanie danych”.
2. Enter `0` and tap „Zapisz ustawienia”. Then try `121`, then `24`, and finally set it back to `12`.
3. Desktop, on a **local or disposable database only**: `yarn mercato people retention-sweep --tenant <id> --org <id> --dry-run`. Add `--today <a future date>` to simulate a later day.
4. Run the same command without `--dry-run`, then check `/backend/people/persons` and the audit log.

**What to verify**

- [ ] `0` and `121` → „Podaj liczbę miesięcy od 1 do 120.” on the field. `24` saves with „Ustawienia klubu zapisane”
- [ ] At 375 px the page has no horizontal scroll and the group description is readable
- [ ] The dry run prints counts only (`candidates`, `anonymized`, `kept`, `failed`), no names, and changes nobody
- [ ] The real run anonymises only people who left before the cutoff with everything paid. Each shows „Zanonimizowano {date}”, gets one audit entry, and keeps their payments
- [ ] A person with an unpaid charge, or one who is still a guardian, is left unchanged. A second run anonymises nobody

**What can go wrong**

- Someone with an open charge or an active guardianship is anonymised (irreversible)
- The job prints personal data, or a second run anonymises people again

**How to pass:** on the phone, the setting must validate and save. Add `qa` once the dry run and the real run behave as above on a throwaway database. If you cannot run the job, accept TEST-086 as the evidence and test only the setting.

#### Q4 · P0 — The app still works after the Next.js security upgrade

**PR:** [#570](https://github.com/wladku/Vereino/pull/570) (open, `risk-high`, `needs-qa`) · **Issue:** [#454](https://github.com/wladku/Vereino/issues/454) (mentioned)
**Device:** phone 375 px. A smoke run through the pages; nothing visual changed · **Time:** ~8 min
**What changed:** The page engine (Next.js) goes from 16.3.6 to 16.4.6 to close two critical and two high advisories, one of them in image optimisation. No screen or text changed. The risk is that a page fails to render or a logo stops loading.

**Where to click**

1. `/login`: sign in as the administrator.
2. `/backend`: wait for the dashboard and the menu.
3. „Klub” → „Ustawienia” (`/backend/club/settings`): check the club logo, change nothing, and tap „Zapisz ustawienia”.
4. „Klub” → „Sekcje” (`/backend/club/sections`): check the section logos or initials.
5. „Klub” → „Publikacja” → „Podgląd” opens `/p/<clubSlug>`. Open one section from there.
6. Sign in as a member and open `/club`.

**What to verify**

- [ ] Each page loads, with no blank screen and no "Application error"
- [ ] Logos load in `/backend`, on `/p/…` and on `/club`, with no broken-image icon
- [ ] Saving the settings shows „Ustawienia klubu zapisane”

**What can go wrong**

- Logos are broken or never finish loading (image optimisation changed in 16.4.x)
- A white screen after sign-in, or a save that hangs (a Server Actions or router change)

**How to pass:** add `qa` when every step renders, logos included, and the save works. Nothing here needs a desktop. The dependency audit and the build are already CI evidence (`yarn verify`, `browser-smoke`).

## Scenarios

### P0 — every screen

#### S01 · P0 — A keyboard user always sees the focus; closing a dialog returns focus to its button

**Role:** administrator (panel) and coach (member area) · **Device:** desktop; member area also in a 375 px window · **Why P0:** priority-high, risk-medium; the focus tokens and the dialog wrapper changed on every screen
**PRs:** [#502](https://github.com/wladku/Vereino/pull/502) · **Issues:** [#481](https://github.com/wladku/Vereino/issues/481)
**Route:** /backend/club/sections/create — Klub → Sekcje → „Nowa sekcja”; /club and /club/occurrences/{id} — Strefa członka → „Dziś” → a session
**Before you start:** An administrator. A coach with one planned session they lead, today or later. Test with the light theme, then the dark theme. Use only the keyboard.

**Steps**

1. As the administrator open „Nowa sekcja”. Press Tab through the sidebar, the group headings, the fields and the buttons.
2. Switch to the dark theme and Tab through the same page again.
3. As the coach, in a 375 px window, open „Dziś” and Tab to the profile tile and the cards.
4. Open the session, Tab to „Odwołaj termin” and press Enter. Then Tab into „Powód”.
5. Press Esc, then Tab once. Open the dialog again and close it with the browser's Back button.
6. Open and close (Esc) two or three other dialogs, e.g. „Dodaj opiekuna” in Obiekty → Konserwacja → Opiekunowie.

**What to verify**

- [ ] Every focused element (link, card, button, field, tab, switch) shows a clear ring about 2 px wide with a small gap: dark in light theme, light in dark theme
- [ ] No element is focused without a visible ring, and no ring is cut off at a card or list edge
- [ ] Field borders and sidebar group headings („Klub”, „Finanse”) are clearly readable in both themes
- [ ] After Esc and after Back, the focus is on „Odwołaj termin”, and the next Tab moves to the element after it
- [ ] The same focus return works in the other dialogs. At 375 px nothing overflows sideways

**What can go wrong**

- After Esc, the focus jumps to the start of the page
- The ring is invisible on a dark card
- One module's dialog still loses the focus on close

#### S02 · P0 — „Dziś” and the session page open without "Access denied" errors; a real refusal is in Polish

**Role:** guardian, coach, coordinator, facility attendant · **Device:** phone 375 px · **Why P0:** priority-high, risk-medium; the first screen every member sees
**PRs:** [#501](https://github.com/wladku/Vereino/pull/501) · **Issues:** [#483](https://github.com/wladku/Vereino/issues/483)
**Route:** /club, /club/occurrences/{id}, /club/occurrences/{id}/edit — Strefa członka → „Dziś” → a session → „Edytuj”
**Before you start:** A guardian with a child in a group. A coach who leads a group with sessions. A section coordinator who does not coach. A facility attendant. If you can, open the browser's Network tab.

**Steps**

1. As the guardian (Polish), open „Dziś” and wait until every tile has loaded. Repeat as the facility attendant, and as the treasurer if there is one.
2. As the coach, open „Dziś”, then a session of their group, then „Edytuj”.
3. As the coordinator, open a session of their section from the calendar, then „Edytuj”.
4. As the guardian, open a panel-only address, e.g. /backend/payments/charges, and read the message.
5. Switch the profile language to English and repeat step 4.

**What to verify**

- [ ] Guardian, attendant and treasurer: no error toast on „Dziś” and no „Płatności moich grup” tile
- [ ] Coach: the „Płatności moich grup” tile is still there
- [ ] Coach and coordinator: the session page and its edit form open without an error toast
- [ ] No red 403/404 requests in the Network tab on these pages
- [ ] A real refusal in Polish reads „Brak dostępu: nie masz uprawnień do tej czynności. Jeśli ich potrzebujesz, poproś administratora klubu.”, never English or "admin" on a Polish page

**What can go wrong**

- An English toast naming the role "admin" appears for a guardian
- The coach loses their own payments tile
- The coordinator's edit form refuses with 403

#### S03 · P0 — Nothing from the Open Mercato template is left: "/" leads to the club page or sign-in

**Role:** guest, then administrator · **Device:** phone 375 px (guest), desktop (administrator) · **Why P0:** priority-high, risk-medium; the instance's entry point, a new operator setting `VEREINO_HOME_CLUB_SLUG`, demo mode now off by default
**PRs:** [#503](https://github.com/wladku/Vereino/pull/503) · **Issues:** [#485](https://github.com/wladku/Vereino/issues/485)
**Route:** /, /start, /login, /p/{clubSlug}, /backend, /backend/club/publication — Klub → „Publikacja”
**Before you start:** Ask the operator whether `VEREINO_HOME_CLUB_SLUG` is set on the sandbox to the example club's slug. Use an administrator who may publish the club page, and a private window for the guest steps.

**Steps**

1. As a guest, open `/`, then `/start`.
2. Sign in as the administrator and open `/`, then Klub → „Publikacja”. Read the tab title and the sidebar mark.
3. Publish the club page if needed, sign out, and open `/` as a guest.
4. Switch the club page off in „Publikacja” and open `/` again as a guest.
5. Check the sign-in page and the panel in light and dark themes.

**What to verify**

- [ ] With the club page unpublished (or the variable unset), guest `/` → `/login`, tab title „Vereino”
- [ ] With the page published and the variable set, guest `/` → `/p/{clubSlug}`, tab title „{club} — Strona klubu”
- [ ] `/start` is a 404: no demo password hint, no counters, no role cards
- [ ] A signed-in administrator at `/` lands on `/backend`. Panel tab titles read „{page} — Vereino”
- [ ] A neutral "V" mark shows where the club has no logo. No Open Mercato logo or text and no demo banner anywhere

**What can go wrong**

- Guest `/` still lands on the old template start page
- After the club page is switched off, `/` still sends guests to it
- The variable is unset on the sandbox, so `/` always goes to `/login`. That is a configuration note, not a defect

### P1 — member and public pages

#### S04 · P1 — „Dziś” shows the club header and at most three tiles; the calendar opens on the upcoming list

**Role:** guardian (also coach and section coordinator) · **Device:** phone 375 px · **Why P1:** priority-medium, risk-medium; the member home page for every role and a new calendar view
**PRs:** [#537](https://github.com/wladku/Vereino/pull/537) · **Issues:** [#493](https://github.com/wladku/Vereino/issues/493)
**Route:** /club — Strefa członka → „Dziś”; /club/calendar — „Kalendarz”
**Before you start:** A club with a logo and one without. A guardian with two wards, sessions today and tomorrow, a pending declaration, an unread message, an open charge and an open kit order. A coach with sessions today, and a coordinator.

**Steps**

1. As the guardian open „Dziś”. Read the tiles and the rows under them, then tap each shortcut row.
2. Repeat as the coach, then as the coordinator, then as a guardian of the club without a logo.
3. Open „Kalendarz” and check the default view. Switch to „Tydzień” and „Miesiąc” and use the arrows. Tab through the toolbar.

**What to verify**

- [ ] The logo (if any) and the club name sit above „Dzień dobry, {name}”. Without a logo the name still shows
- [ ] At most three tiles, in this order: „Kalendarz”, „Obecność”, „Wiadomości”. Sessions show as rows, not nested cards. With nothing pending, „Nic nie czeka na Twoją decyzję.”
- [ ] „Na skróty” lists „Płatności”, „Zamówienie”, „Płatności moich grup” (coach) and „Profil i zgody”, then „Twoi podopieczni”. Each row works and is at least 44 px tall
- [ ] The calendar opens on „Najbliższe” (14 days) with no arrows. When empty: „Brak terminów w najbliższych dwóch tygodniach.”
- [ ] In „Tydzień” and „Miesiąc” there is one row with ← „Ten tydzień” →. The 44 px arrows are announced as „Poprzedni tydzień” / „Następny tydzień”
- [ ] No horizontal scroll at 375 px, in Polish or English

**What can go wrong**

- A staff user sees more than three tiles
- The kit order or group payments disappear instead of moving into the shortcut rows
- A calendar link with a date range opens on „Najbliższe” and loses the range

#### S05 · P1 — Staff on the phone are offered only what they may do; each refusal says why

**Role:** coach, section coordinator, facility attendant · **Device:** phone 375 px · **Why P1:** priority-medium, risk-medium; page guards relaxed to member level (the API guards are unchanged), so check that no action becomes reachable
**PRs:** [#508](https://github.com/wladku/Vereino/pull/508) · **Issues:** [#489](https://github.com/wladku/Vereino/issues/489)
**Route:** /club/occurrences/{id}/edit, /club/events/new, /club/messages/new, /club/places/maintenance — Strefa członka → „Dziś” / „Kalendarz” / „Wiadomości”
**Before you start:** A coach who leads a group with a series session and an own one-off event. A coordinator who coaches no group. A facility attendant who is not a place maintainer. Sessions: one in another group, one cancelled, one part of a club event.

**Steps**

1. As the coach, check that „Kalendarz” and „Dziś” offer „Nowe wydarzenie”. Open the own one-off event → „Edytuj”.
2. As the coach, open `/club/occurrences/{id}/edit` by URL for: a series session, a session of another group, a cancelled session, and a club-event session.
3. As the coordinator, look for „Nowe wydarzenie”, then open `/club/events/new` by URL.
4. As the coach, open `/club/messages/new`. As the attendant, open `/club/places/maintenance`.

**What to verify**

- [ ] „Nowe wydarzenie” shows only to staff who coach a group. „Edytuj” shows only when saving is allowed
- [ ] Each refusal names its reason: another group (with „Otwórz kalendarz”), not planned („Ten termin nie jest już zaplanowany…”), club event, series session („Trener przesuwa tylko terminy własnych jednorazowych wydarzeń…”)
- [ ] `/club/events/new` explains the refusal to the coordinator and links to „Nowa impreza klubowa”. `/club/messages/new` sends staff to „Przejdź do Wiadomości”
- [ ] `/club/places/maintenance` names Obiekty → Konserwacja → Opiekunowie, never a bare "Access denied"
- [ ] No refusal page lets anyone save, create or see more than before. The pages fit at 375 px

**What can go wrong**

- A coordinator who opens the page by URL gets a form that then fails on save
- A member with no staff role gets an editable form

#### S06 · P1 — Every control on the member pages is 44 px; Tab focus is never hidden under the attendance bar

**Role:** guardian, 16-year-old member, coach · **Device:** phone 375 px · **Why P1:** priority-medium; accessibility (WCAG 2.5.8, 2.4.11) on the main member pages and the kit order form
**PRs:** [#512](https://github.com/wladku/Vereino/pull/512), [#550](https://github.com/wladku/Vereino/pull/550), [#552](https://github.com/wladku/Vereino/pull/552) · **Issues:** [#491](https://github.com/wladku/Vereino/issues/491), [#548](https://github.com/wladku/Vereino/issues/548), [#547](https://github.com/wladku/Vereino/issues/547)
**Route:** /club/profile („Profil”), /club/wards/{id}, /club/calendar, /club/places and /club/places/{placeId} („Obiekty”), /club/messages, /club/orders/{campaignId}, /club/occurrences/{id}/attendance
**Before you start:** A guardian with a ward and an open kit order campaign. A coach with a session of at least 11 participants and an open attendance list.

**Steps**

1. On „Profil”, tap a consent switch's label, its description, and the empty space beside it.
2. Tap the „E-mail” and „Telefon” fields near their top and bottom edges.
3. On the calendar and places pages, tap „Moje terminy” / „Sekcja”, the view tabs, a place name, the day chips, „Inny dzień” and „Tylko do przeniesienia”. Close a toast with its ×.
4. In the kit order form, tap near the edges of „Imię do nadruku”, „Numer (1–99)”, „E-mail” and „Telefon”.
5. As the coach, open the attendance list, mark all rows, then Tab through every radio and every „Wyczyść”.

**What to verify**

- [ ] A tap anywhere on a consent row toggles the switch. A screen reader reads the label as the name and the description separately
- [ ] Every input focuses from a tap anywhere inside its box. Every control is at least 44 px
- [ ] On the attendance page, each focused radio and „Wyczyść” scrolls fully above the sticky bar with „Zapisz”, even when the bar wraps
- [ ] No horizontal scroll at 375 px

**What can go wrong**

- The box is larger but the real input inside is still small, so an edge tap does nothing
- Focus lands under the sticky bar on the last rows. Other sticky-bar pages (payments, session edit) are out of scope: report them as a known gap

#### S07 · P1 — An empty message or leave request says what is missing instead of a greyed-out button

**Role:** guardian · **Device:** phone 375 px · **Why P1:** priority-medium; form feedback and accessibility on member forms
**PRs:** [#507](https://github.com/wladku/Vereino/pull/507) · **Issues:** [#490](https://github.com/wladku/Vereino/issues/490)
**Route:** /club/messages/new — „Wiadomości” → „Napisz do trenera”; a thread; /club/profile/leave — „Profil” → „Odejście z klubu”
**Before you start:** A guardian whose child's group has a coach, with one thread holding their own message.

**Steps**

1. Open „Napisz do trenera” and tap „Wyślij” with both fields empty. Tap the second line in the error summary.
2. Type a subject only, then fill in the message and send.
3. In the thread, tap „Wyślij odpowiedź” with an empty reply. Empty one of your own messages while editing and tap „Zapisz”.
4. On „Odejście z klubu”, choose nobody and tap „Wyślij prośbę”. Then choose a person and a past „Ostatni dzień”.

**What to verify**

- [ ] „Wyślij” is never disabled because of empty fields
- [ ] An empty send shows „Sprawdź wiadomość” with the links „Wpisz temat.” and „Wpisz treść wiadomości.”, focuses „Temat”, and a summary link moves the focus to its field
- [ ] A field you fill drops out of the summary as you type. Empty reply → „Wpisz treść odpowiedzi.”; emptied edit → „Wiadomość nie może być pusta.”
- [ ] Leave form → „Sprawdź prośbę” with „Wybierz co najmniej jedną osobę.”. A past date is flagged
- [ ] No English browser bubbles on a Polish page. A complete form still sends

**What can go wrong**

- An empty message is sent anyway
- The summary stays after the field is filled, or is re-read on every keystroke

#### S08 · P1 — Public club pages show content and the club's name in the tab title even without JavaScript

**Role:** guest · **Device:** phone 375 px (also desktop) · **Why P1:** priority-medium, risk-medium; server rendering and caching across clubs
**PRs:** [#509](https://github.com/wladku/Vereino/pull/509) · **Issues:** [#487](https://github.com/wladku/Vereino/issues/487)
**Route:** /p/{clubSlug}, /p/{clubSlug}/sections/{sectionSlug}, /p/{clubSlug}/places, /p/{clubSlug}/events (also `?section=`), /p/{clubSlug}/events/{eventSlug}
**Before you start:** The published example club with a section, a place, an event and a club event. An administrator for Klub → „Publikacja”. A browser where you can turn JavaScript off.

**Steps**

1. Open each public page with JavaScript on and note the content and the tab title.
2. Turn JavaScript off and reload each page, in Polish and English. Apply a `?section=` filter on the events page.
3. Open `/p/does-not-exist`.
4. As the administrator, switch the club page off. Reload the club page and the tournament page as a guest.

**What to verify**

- [ ] Without JavaScript, the club name, sections, places, events and tournament parts show at once, with no grey skeleton
- [ ] Tab titles: „{club} — Strona klubu”, „{club} — {section name}”, „{club} — Obiekty”, „{club} — Wydarzenia”, „{club} — {event name}”
- [ ] The `?section=` filter works without JavaScript. An unknown slug shows „Nie znaleziono strony” with no club name
- [ ] After unpublishing, „Brak strony publicznej” shows with no club or event name, already on the next reload

**What can go wrong**

- An unpublished club is still served from a cached copy
- One club's page appears under another club's slug

#### S09 · P1 — The club's privacy notice is in every public footer and follows the language

**Role:** guest and administrator · **Device:** phone 375 px · **Why P1:** priority-medium, risk-medium
**PRs:** [#536](https://github.com/wladku/Vereino/pull/536) · **Issues:** [#469](https://github.com/wladku/Vereino/issues/469)
**Route:** /p/{clubSlug}/privacy; footer of /p/{clubSlug}, /p/{clubSlug}/sections/{sectionSlug}, /p/{clubSlug}/s/{occurrenceId}, /p/{clubSlug}/places; /backend/club/publication — „Klub” → „Publikacja”, field „Polityka prywatności (link)”
**Before you start:** A published club with a public section, session and place. The field „Polityka prywatności (link)” is empty.

**Steps**

1. Signed out, open /p/{clubSlug} and tap „Polityka prywatności” in the footer. Tap „Krótka wersja dla dzieci i młodzieży”.
2. Switch the page language to English and back. Check the footer on the other three page types.
3. As the administrator, enter `https://example.org/privacy` in „Polityka prywatności (link)” and save. Recheck the footers and /p/{clubSlug}/privacy.
4. Clear the field, save, and check the footer once more.

**What to verify**

- [ ] With the field empty, every footer leads to /p/{clubSlug}/privacy. The notice names the club and ends with the children's version, which mentions the UODO complaint
- [ ] English shows no Polish leftovers and no raw keys
- [ ] With the club's own address, every footer leads to it. /p/{clubSlug}/privacy then shows only „{club} publikuje własną politykę prywatności.” and „Przeczytaj politykę prywatności klubu”
- [ ] After clearing the field, the default notice is back. Nothing scrolls sideways at 375 px

**What can go wrong**

- A facilities or session page footer hides the link
- The default text shows next to the club's own policy

### P1 — panel

#### S10 · P1 — Every status pill shows a word and an icon; cancelled sessions and events read as an error

**Role:** treasurer (panel), guardian (member area) · **Device:** desktop; phone 375 px · **Why P1:** priority-medium; status is no longer shown by colour alone, across 77 files
**PRs:** [#500](https://github.com/wladku/Vereino/pull/500) · **Issues:** [#482](https://github.com/wladku/Vereino/issues/482)
**Route:** /backend/payments/charges — Finanse → „Należności”; /club — „Dziś”; /p/{clubSlug}/events
**Before you start:** One open, one overdue and one cancelled charge. A guardian whose ward has incomplete consents. A cancelled session and a cancelled public club event.

**Steps**

1. As the treasurer open „Należności”, view „Wszystkie”. Look at the pills in light theme, dark theme and at 375 px.
2. As the guardian, find the consents pill on „Dziś”. Open a cancelled session and the public events page.

**What to verify**

- [ ] Every pill has an icon and a word (e.g. „Otwarta”, „Zaległa”, „Odwołane”). No colour dot appears without a word
- [ ] Cancelled sessions and events, public ones included, show the red error style with a crossed circle. A cancelled charge stays neutral
- [ ] A screen reader reads only the word. Nothing overflows at 375 px

**What can go wrong**

- One screen's pill has no icon, or shows both a dot and an icon
- Public "cancelled" pills are still grey

#### S11 · P1 — The dashboard shows every tile title in Polish under one greeting heading

**Role:** administrator · **Device:** desktop (also a 375 px window) · **Why P1:** priority-medium; the first screen of the panel
**PRs:** [#505](https://github.com/wladku/Vereino/pull/505) · **Issues:** [#484](https://github.com/wladku/Vereino/issues/484)
**Route:** /backend — panel home
**Before you start:** An administrator with the default dashboard layout, profile language Polish.

**Steps**

1. Open /backend and read every tile title and description, then the top of the page.
2. Switch to English and repeat. Check the dark theme and a 375 px window.

**What to verify**

- [ ] Polish titles include „Prośby o odejście”, „Osoby wymagające uwagi”, „Wyciągi bankowe i gotówka”, „Zbiórki zamówień”, „Zaległe”, „Należności bez płatnika” and „Zgłoszenia do akceptacji”
- [ ] No tile stays in English on the Polish page, or in Polish on the English page
- [ ] „Dzień dobry, {name}” is the only main heading, and the customise button still works

**What can go wrong**

- Two headings show, or the customise button disappears with the hidden platform heading

#### S12 · P1 — The panel menu has six groups in the mockup's order, short labels and the new terms

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium; menu groups, labels, page titles and terms (a UI contract)
**PRs:** [#513](https://github.com/wladku/Vereino/pull/513) · **Issues:** [#494](https://github.com/wladku/Vereino/issues/494)
**Route:** /backend sidebar; /backend/club/settings, /backend/club/publication, /backend/facilities/calendar, /backend/facilities/requests, /backend/payments/fees, /backend/activities/occurrences/{id}, /backend/activities/reports/coach-units
**Before you start:** An administrator in the example club with sessions, an order campaign and cash to settle.

**Steps**

1. Read the sidebar groups from top to bottom, in Polish and then English. Expand „Zajęcia”.
2. Open „Klub” → „Ustawienia” / „Publikacja” and „Obiekt” → „Kalendarz” / „Zgłoszenia”. Compare each breadcrumb and heading.
3. In „Finanse”, check the order of the entries and open the fees page. Open a session, its change-coach action and the units report.

**What to verify**

- [ ] Six groups in this order: „Klub”, „Ludzie”, „Zajęcia”, „Komunikacja”, „Finanse”, „Obiekt”. No separate „Grupy” or „Harmonogram” group
- [ ] Short menu labels („Ustawienia”, „Publikacja”, „Kalendarz”, „Zgłoszenia”). The headings keep their long titles („Ustawienia klubu”, „Publikacja strony klubu”, „Kalendarz obiektu”, „Zgłoszenia do akceptacji”)
- [ ] „Gotówka do rozliczenia” comes after „Zbiórki zamówień”. The fees page reads „Cenniki i zniżki”
- [ ] Session pages say „Zmień prowadzącego”, „Prowadzący” and „Zostaw bez prowadzącego”. English shows "Friendly", never "Sparring"

**What can go wrong**

- A page sits under an old group or loses the active-group highlight
- A short menu label replaced the long page heading too

#### S13 · P1 — Admin lists offer „Spróbuj ponownie” when loading fails; access-denied pages offer a way out

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium, risk-medium; 42 list error states, both access-denied pages, screen-reader names across the panel
**PRs:** [#515](https://github.com/wladku/Vereino/pull/515) · **Issues:** [#497](https://github.com/wladku/Vereino/issues/497)
**Route:** /backend/people/persons, /backend/people/persons/create, /backend/payments/fees/create, /backend/club/sections, /backend/payments/charges; a /backend or /club URL the account may not open
**Before you start:** An administrator, a second account without one /backend page permission, devtools for offline mode, and a screen reader or the accessibility tree.

**Steps**

1. Open „Osoby”, go offline and reload or page. Go back online and click „Spróbuj ponownie”. Repeat on „Sekcje” and on a wide charges table scrolled sideways.
2. With a screen reader, Tab through „Dodaj osobę” and „Nowy cennik składki”, including a select that has a value. Focus the „Osoby” search box.
3. As the second account, open a /backend URL it may not use. As a guardian, open /club/facility.

**What to verify**

- [ ] A failed list shows its own message (e.g. „Nie udało się wczytać sekcji.”), never "Internal error". „Spróbuj ponownie” reloads the rows and stays visible in a scrolled table
- [ ] Every field is announced by its label, a select with a value as label + value, and the search box as „Szukaj po imieniu lub nazwisku”
- [ ] Backend „Brak dostępu” offers „Przejdź do panelu” and „Wyloguj się i użyj innego konta”. The member version offers „Przejdź do interfejsu członkowskiego”. Signing out works and both buttons are keyboard-reachable

**What can go wrong**

- One of the 42 lists still shows the raw server error
- The sign-out on the access-denied page leaves the session active

#### S14 · P1 — Anonymisation clears order contacts and payer labels and keeps the name until the sixth year

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium, risk-medium; erasing personal data next to accounting records
**PRs:** [#535](https://github.com/wladku/Vereino/pull/535), [#562](https://github.com/wladku/Vereino/pull/562) · **Issues:** [#528](https://github.com/wladku/Vereino/issues/528), [#526](https://github.com/wladku/Vereino/issues/526)
**Route:** /backend/people/persons/{id} → tab „Odejście”, section „Prośby”, „Zanonimizuj” — „Ludzie” → „Osoby”, view „Byli członkowie”; /backend/payments/orders/{id}; /backend/payments/charges; /backend/facilities/rentals/{id}
**Before you start:** Person A placed an order with a contact e-mail, phone and notes, has a charge with a booked payment (e.g. cash in 2026), and is the contact of a rental. Person B has the same history without a booked payment. Both have left, with nothing open and a recorded erasure request.

**Steps**

1. On person A, tab „Odejście”, click „Zanonimizuj” and read the dialog. Confirm with a wrong last name, then with the right one.
2. Open A's order, A's charge and the rental.
3. Repeat for person B. Try „Zanonimizuj” on a former person with no recorded request.

**What to verify**

- [ ] The dialog says the name stays until 31 December of the **sixth** year after the last payment. A wrong last name → „Nazwisko się nie zgadza.”
- [ ] A shows 31 December of (last payment year + 6), e.g. 31.12.2032 for a 2026 payment. B shows „Imię i nazwisko usunięto. Ekrany pokazują „Były członek”.”
- [ ] A's order loses the contact e-mail, phone and notes; amounts, payments and KP numbers stay. The charge's „Płatnik” no longer shows A's name. The rental shows no contact data
- [ ] Without a recorded request: „Nie zapisano prośby o usunięcie danych. Najpierw zapisz ją w sekcji Prośby.”

**What can go wrong**

- Partial erasure: the order is cleared but the rental is not
- An e-mail queued before anonymisation still arrives
- People anonymised before #562 still show year + 5. That is expected (no data migration)

#### S15 · P1 — Two people accepting cash at the same moment, e-mail on, both get a receipt

**Role:** administrator and coach · **Device:** desktop and phone 375 px · **Why P1:** priority-medium, risk-medium; money and KP numbering under load
**PRs:** [#553](https://github.com/wladku/Vereino/pull/553), [#556](https://github.com/wladku/Vereino/pull/556) · **Issues:** [#549](https://github.com/wladku/Vereino/issues/549), [#554](https://github.com/wladku/Vereino/issues/554)
**Route:** /backend/payments/charges — „Należności” → „Przyjmij gotówkę”; /club/cash; /club/coach/payments — „Płatności moich grup” → „Przyjmij gotówkę”
**Before you start:** At least 4 payers with open charges and real inboxes. An administrator and a coach who may collect cash. Two or three devices signed in at once.

**Steps**

1. On each device, open the cash dialog for a different payer and tick „Wyślij płatnikowi potwierdzenie e-mailem”.
2. Click „Przyjmij {amount} zł” on all of them within about one second. Repeat with the coach and the administrator together.
3. Repeat once with the e-mail box unticked and once with a partial amount.

**What to verify**

- [ ] Each acceptance ends with „Przyjęto {amount} gotówką od {payer} — dowód wpłaty {receipt}”. None fails
- [ ] KP numbers are distinct and have no gaps. Each payer gets exactly one e-mail with the right amount and number
- [ ] Other users can sign in and browse during the burst. Each charge shows the right remaining amount

**What can go wrong**

- A request hangs for about 6 s and fails (the database pool ran out)
- An e-mail is lost or sent twice

### P1 — operator

#### S16 · P1 — Used and expired links are deleted 30 days later; valid links keep working

**Role:** operator and guardian · **Device:** server shell and phone 375 px · **Why P1:** priority-medium, risk-medium; personal-data retention
**PRs:** [#541](https://github.com/wladku/Vereino/pull/541) · **Issues:** [#525](https://github.com/wladku/Vereino/issues/525)
**Route:** `yarn mercato activities purge-declaration-links --tenant <id> --org <id> [--now <ISO>]`; `yarn mercato payments run-job --job purge-order-links …`; `yarn mercato facilities purge-rental-links …`; links /club/d/{token}, /club/o/{token}, /p/{clubSlug}/rentals/cancel/{token}
**Before you start:** A test club (never production with a future `--now`) and a second club. A declaration link, an order link and a rental cancellation link with known expiry dates, plus one still-valid link.

**Steps**

1. Run `set-up-club` for activities, payments and facilities and read the schedules.
2. Run each purge with the real time, then with `--now` 31 days after a link's expiry, then once more.
3. Run the same purge for the second club. Open the purged links and the valid link on a phone.

**What to verify**

- [ ] Every `schedules` entry is `true`, including the three daily purges
- [ ] With the real time, `deleted` is 0 for links that are valid or dead for less than 30 days. With the future `--now`, the expected count is deleted, and the second run deletes 0
- [ ] The second club is untouched. A purged declaration link shows „Nieprawidłowy link”, and the valid link still opens

**What can go wrong**

- Reusable links are deleted before they expire
- The online-request verification link (/p/{clubSlug}/requests/verify/{token}) breaks

#### S17 · P1 — The nightly payments check reports drift between charges, payments and receipt numbers

**Role:** operator · **Device:** server shell · **Why P1:** priority-medium, risk-medium; money invariants and an alert path
**PRs:** [#555](https://github.com/wladku/Vereino/pull/555) · **Issues:** [#531](https://github.com/wladku/Vereino/issues/531)
**Route:** `yarn mercato payments run-job --job verify-invariants --tenant <id> --org <id>`; `yarn mercato payments set-up-club --tenant <id> --org <id>`; worker logs (docs/ops/monitoring.md)
**Before you start:** A disposable environment with charges, cash receipts (KP), a reversal, a partial payment and a cash handover. `VEREINO_OPS_PAYMENTS_INVARIANTS_HEARTBEAT_URL` points to a test heartbeat check.

**Steps**

1. Run `set-up-club`, then `run-job --job verify-invariants` on the realistic data.
2. On the disposable database only, create a drift (set a paid charge back to open, or remove a KP number mid-month) and run the job again.
3. Restore the data and run the job with a heartbeat URL that refuses the request.

**What to verify**

- [ ] The clean run logs `Payments invariants verified` and pings the heartbeat
- [ ] The drift run logs `Payments invariants drift` with ids and counts only, no names or amounts, and the check gets `/fail` within a minute
- [ ] The job changes no data. A refused ping is logged and does not crash it

**What can go wrong**

- False drift on normal data: free rentals, overpayments, reversals, one KP shared by several charges

#### S18 · P1 — The app refuses to start without required variables; deploys never set up a new database

**Role:** operator · **Device:** server shell · **Why P1:** priority-medium, risk-high; start-up, migration and rollback behaviour
**PRs:** [#478](https://github.com/wladku/Vereino/pull/478) · **Issues:** [#462](https://github.com/wladku/Vereino/issues/462)
**Route:** docs/ops/deploy.md; `node scripts/smoke.mjs https://<environment-host>`; Railway services (`scripts/railway-predeploy.sh`, `scripts/railway-start.sh`, `scripts/railway-worker.sh`)
**Before you start:** A staging Railway project. Staging is still pending, so run this once it exists. A smoke account in `VEREINO_SMOKE_EMAIL` / `VEREINO_SMOKE_PASSWORD`.

**Steps**

1. Deploy a normal commit and run the smoke check, with and without the smoke account.
2. Remove `JWT_SECRET` (or make `APP_URL` invalid) and deploy. Restore it.
3. Point `DATABASE_URL` at an empty database and deploy. Restore it.
4. Set `QUEUE_STRATEGY=async` without a Redis URL on the worker and deploy. Run the smoke check against a wrong host.

**What to verify**

- [ ] The smoke check reports `health`, `sign-in page`, `security headers` and `no-store` and exits 0. Without the account, `no-store` is skipped
- [ ] A missing or malformed variable fails the deploy and names the variable without its value, and the previous release keeps serving
- [ ] With an empty database, the pre-deploy step fails and no new schema or superadmin is created
- [ ] The worker refuses to start and names the Redis variable. Against a wrong host, the smoke check exits 1

**What can go wrong**

- A secret value appears in the deploy log
- The start falls back to `.env` values or initialises a fresh database

#### S19 · P1 — The nightly encrypted backup reaches the bucket, a failure alerts, the restore drill works

**Role:** operator (owner) · **Device:** server shell · **Why P1:** priority-medium, risk-high; the only way back after data loss
**PRs:** [#474](https://github.com/wladku/Vereino/pull/474), [#476](https://github.com/wladku/Vereino/pull/476), [#524](https://github.com/wladku/Vereino/pull/524) · **Issues:** [#464](https://github.com/wladku/Vereino/issues/464), [#465](https://github.com/wladku/Vereino/issues/465), [#519](https://github.com/wladku/Vereino/issues/519)
**Route:** docs/ops/backups.md (owner setup, restore drill), docs/ops/monitoring.md, docs/ops/incident.md; backup service from `railway.backup.toml`; `node packages/app/scripts/vereino-ops-signal.mjs backup.failed step=drill`; `node scripts/backup-restore.mjs`
**Before you start:** The bucket and access key, the age private key, the backup service and its variables, the uptime checks with both maintainers as recipients, and Docker on a trusted machine.

**Steps**

1. Start the backup service with Railway's "Run now" button. Read the log and look in the bucket under `daily/` and `monthly/`.
2. Send `backup.failed step=drill`, then `backup.succeeded`.
3. Remove `BACKUP_S3_BUCKET`, run the job, and restore the variable.
4. Run the restore drill from backups.md into an empty local PostgreSQL 17 and compare the counts. Run it once more with a wrong identity file.

**What to verify**

- [ ] The log ends with `backup.dump.succeeded`, the heartbeat gets its ping, and `daily/vereino-YYYY-MM-DD.dump.age` exists encrypted, with no plaintext left anywhere
- [ ] The drill alert reaches both maintainers within a minute, and `backup.succeeded` closes it
- [ ] The missing variable gives `backup.dump.failed` with `missing-variable`, a `/fail` ping and exit 1, and only variable names are logged
- [ ] The restore prints row counts that match. The RTO is at most 60 min and is recorded in `docs/ops/restore-drills.md`. A wrong key fails before any database is touched

**What can go wrong**

- A missed run raises no alert (check the 26 h heartbeat window)
- A connection string or credential appears in the job log

### P2 — look and wording

#### S20 · P2 — The day axis uses the mockup's colours; the place page fits a 768 px tablet

**Role:** administrator and coach · **Device:** desktop; 768 / 375 / 320 px · **Why P2:** priority-low, risk-low; colour, contrast and layout
**PRs:** [#510](https://github.com/wladku/Vereino/pull/510) · **Issues:** [#495](https://github.com/wladku/Vereino/issues/495)
**Route:** /backend/facilities/calendar?place={id} — Obiekt → „Kalendarz”; /club/places/{placeId}
**Before you start:** A place with all four zone types and a day with a session, a club booking, a rental, a pending request, a closure and maintenance.

**Steps**

1. Open „Kalendarz” for that day and compare the blocks with the legend, in light and dark mode.
2. As the coach, open /club/places/{placeId} at 768, 375 and 320 px. Tap the day chips and „Inny dzień”.

**What to verify**

- [ ] Sessions are green, club bookings blue, rentals amber. Requests, closures and maintenance are grey, with dashed, double and dotted borders
- [ ] Zone colours: public blue, club training green, bookable amber, closed grey. Nothing is pink
- [ ] Every legend swatch has a visible edge in both themes. No horizontal scroll at any width

**What can go wrong**

- The admin calendar and the member preview show different zone colours
- The „Inny dzień” field sticks out at 768 px

#### S21 · P2 — Information notices are pale blue; checkboxes and radios use the primary colour

**Role:** administrator, coach, guardian · **Device:** desktop and phone 375 px · **Why P2:** priority-low, risk-low; visual change across 127 notices
**PRs:** [#538](https://github.com/wladku/Vereino/pull/538) · **Issues:** [#492](https://github.com/wladku/Vereino/issues/492)
**Route:** /backend/facilities/calendar?place={id}; /club/occurrences/{id}/attendance; /club/payments
**Before you start:** A place without zone rules. A coach with a session that starts in more than 30 minutes. A guardian with an open charge.

**Steps**

1. Open „Kalendarz” for the place without zones, in light and dark mode.
2. As the coach, open the attendance list of the future session. As the guardian, tick and untick a charge on „Płatności”.

**What to verify**

- [ ] „Brak reguł stref — dodaj strefy, aby umożliwić rezerwacje.” sits on a light blue background in both themes and is readable
- [ ] The „Lista otworzy się o {time}…” notice uses the same style
- [ ] A ticked checkbox fills with the primary colour and shows a visible tick. Radios show a visible dot in dark mode. Error, warning and success alerts are unchanged

**What can go wrong**

- The radio dot disappears in dark mode

#### S22 · P2 — Texts promise nothing, invent no prices and say what to do next

**Role:** administrator, guardian, facility attendant · **Device:** desktop and phone 375 px · **Why P2:** priority-low, risk-low; wording and one template
**PRs:** [#539](https://github.com/wladku/Vereino/pull/539) · **Issues:** [#496](https://github.com/wladku/Vereino/issues/496)
**Route:** /backend/payments/orders and /backend/payments/orders/create (Finanse → „Zbiórki zamówień”); /login; /club; /club/payments; /club/orders; /club/facility
**Before you start:** A club with no order campaigns. A guardian with no open kit order. A facility attendant on an empty day.

**Steps**

1. Open „Zbiórki zamówień” with no campaigns. Create a form from „Szablon stroju akademii” and try to save it without prices.
2. Sign out and enter a wrong password on /login.
3. As the guardian, open „Płatności” and the orders list offline, then the orders list online. As the attendant, open the facility day page.

**What to verify**

- [ ] Empty list: „Nie ma jeszcze formularzy zamówień”. The template has no prices, says „Szablon nie ma cen: wpisz ceny swojego klubu przy każdym produkcie.”, and saving without prices is refused
- [ ] Login error: „Nieprawidłowy email lub hasło. Jeśli nie pamiętasz hasła, wybierz „Nie pamiętasz hasła?” pod przyciskiem logowania.”
- [ ] Offline: „Nie udało się wczytać płatności.” / „Nie udało się wczytać zamówień.” with „Spróbuj ponownie”
- [ ] Attendant empty day: „Na obiekcie nic dziś nie zaplanowano. Wynajem przyjęty przez telefon wpiszesz w zakładce Wynajmy.”

**What can go wrong**

- The template still shows old prices

## No manual check needed

Merged PRs without a user-visible change. The automated gate covers them, so they get no scenario.

- [#455](https://github.com/wladku/Vereino/pull/455) docs: contribution guide, code of conduct, security policy and issue templates — documentation only
- [#457](https://github.com/wladku/Vereino/pull/457) feat(ci): check licences and vulnerabilities weekly and configure Renovate — CI workflow and Renovate config, no app change
- [#458](https://github.com/wladku/Vereino/pull/458) ci(merge-train): hold a risk-high PR that needs QA until qa — merge train only; you see it as the hold on Q1–Q4
- [#459](https://github.com/wladku/Vereino/pull/459) docs(specs): record the E3 platform spike and the ADR-001 checkpoint — documentation only
- [#472](https://github.com/wladku/Vereino/pull/472) docs(specs): finished specs show what was built — documentation only
- [#477](https://github.com/wladku/Vereino/pull/477) docs(compliance): legal claims checked against primary texts — documentation only
- [#499](https://github.com/wladku/Vereino/pull/499) docs(ux): record the owner's UX decisions D-033 — documentation and mockup only
- [#504](https://github.com/wladku/Vereino/pull/504) build: tooling scripts fall under the 100 % rule by their name — tooling only
- [#514](https://github.com/wladku/Vereino/pull/514) ci(gate): fail yarn verify on hard-coded secrets and real e-mail addresses — gate step only
- [#517](https://github.com/wladku/Vereino/pull/517) docs(lessons): TEST-046 needs no quarantine — documentation only
- [#518](https://github.com/wladku/Vereino/pull/518) ci(merge-train): plan and judge batches of PRs, dark — merge train only
- [#523](https://github.com/wladku/Vereino/pull/523) test(groups): quarantine TEST-L21 — test-only change
- [#529](https://github.com/wladku/Vereino/pull/529) docs(compliance): records of processing, DPIA, registers, retention — documentation only
- [#533](https://github.com/wladku/Vereino/pull/533) ci(release): a merge to main produces a release pull request — CI only
- [#534](https://github.com/wladku/Vereino/pull/534) docs(specs): club spec amendment B — documentation only
- [#540](https://github.com/wladku/Vereino/pull/540) docs(specs): person data export for access and portability requests — documentation only
- [#542](https://github.com/wladku/Vereino/pull/542) chore(deps): remove the commercially licensed @open-mercato/enterprise package — a never-enabled module removed, guarded by `forbidden-packages:check`; smoke: sign in, open /backend and /club
- [#543](https://github.com/wladku/Vereino/pull/543) fix(deps): force patched happy-dom, node-forge, re2js and body-parser — transitive overrides, covered by the gate and the audit; smoke: sign in, open /club
- [#544](https://github.com/wladku/Vereino/pull/544) ci(merge-train): build a batch branch, merge it with a tree check — merge train only
- [#546](https://github.com/wladku/Vereino/pull/546) test(groups): quarantine TEST-L23 — test-only change
- [#551](https://github.com/wladku/Vereino/pull/551) test: amendment B test cases TEST-077…TEST-085 — test-only change
- [#558](https://github.com/wladku/Vereino/pull/558) feat(ci): yarn guard blocks weakened tests, new dependencies and secrets — CI only
- [#561](https://github.com/wladku/Vereino/pull/561) docs(compliance): record and defer the retention rule for claims in proceedings — documentation only

## Unresolved items

Labels, routes or setup steps the research could not confirm from the code. Follow the scenario without them and report what the screen shows.

- Q1–Q4, S03, S08, S09: `<clubSlug>` and `<sectionSlug>` depend on the sandbox data. Take them from „Podgląd” in Klub → „Publikacja” or from a section's public settings
- Q1, S18: there is no staging host yet, so `<host>` must be a local production build until staging exists
- Q1: the online payment page was not among the PR's CSP checks, and its route was not resolved (`packages/app/src/modules/payments/frontend/club/`)
- Q3: no UI action was found to record a departure with a past date. Use `--today <future date>` to create candidates (`packages/app/src/modules/people/cli.ts`)
- S03: whether the sandbox sets `VEREINO_HOME_CLUB_SLUG` (`packages/app/.env.example` leaves it empty)
- S11: the platform heading „Pulpit” comes from the PR description, not a Vereino catalog
- S13: no example-club role is confirmed to lack a given /backend permission, so pick one from the role's ACL
- S06: the toast close button's Polish name comes from the platform (default "Dismiss"), and no Vereino key was found
- S21: the PR's test describes the calendar notice as "no entries on this day", while the screen key is „Brak reguł stref…”. Confirm which empty state you see
- S14: where the audit entry's touched tables and kept data show in the admin UI was not found (only TEST-L07 checks them)
- S16: no documented way for an operator to look up a club's tenant and organization ids for the CLI commands (`docs/ops/deploy.md`)
- S18: the local variant of the start-up checks needs the integration runner, and no single manual command is documented
- S19: the restore drill needs the age private key from the password manager, so it cannot run without the owner
- S17: the drift step needs a hand-edited disposable database; there is no seed for it

## Appendix: Full PR Inventory

One line per merged PR in the window, grouped by merge date (UTC, newest first).

### 2026-11-22

- [#562](https://github.com/wladku/Vereino/pull/562) feat(payments): the anonymised name hold follows the accounting retention period (#526) — base `main` · QA: skip-qa · Issue refs: [#526](https://github.com/wladku/Vereino/issues/526) · Scenarios: S14
- [#542](https://github.com/wladku/Vereino/pull/542) chore(deps): remove the commercially licensed @open-mercato/enterprise package (E18-S05, #466) — base `main` · QA: skip-qa · Issue refs: [#466](https://github.com/wladku/Vereino/issues/466) · Scenarios: no manual check
- [#561](https://github.com/wladku/Vereino/pull/561) docs(compliance): record and defer the retention rule for claims in proceedings (#475) — base `main` · QA: skip-qa · Issue refs: [#475](https://github.com/wladku/Vereino/issues/475) · Scenarios: no manual check
- [#558](https://github.com/wladku/Vereino/pull/558) feat(ci): yarn guard blocks weakened tests, new dependencies and secrets in every PR (#520) — base `main` · QA: skip-qa · Issue refs: [#520](https://github.com/wladku/Vereino/issues/520) · Scenarios: no manual check
- [#556](https://github.com/wladku/Vereino/pull/556) fix(payments): cash acceptances with the e-mail on no longer exhaust the DB pool (#554) — base `main` · QA: skip-qa · Issue refs: [#554](https://github.com/wladku/Vereino/issues/554) · Scenarios: S15
- [#544](https://github.com/wladku/Vereino/pull/544) ci(merge-train): build a batch branch, merge it with a tree check, rehearsed in a scratch repository (E16-S03, #451) — base `main` · QA: skip-qa · Issue refs: [#451](https://github.com/wladku/Vereino/issues/451) · Scenarios: no manual check
- [#514](https://github.com/wladku/Vereino/pull/514) ci(gate): fail yarn verify on hard-coded secrets and real e-mail addresses (#511) — base `main` · QA: skip-qa · Issue refs: [#511](https://github.com/wladku/Vereino/issues/511) · Scenarios: no manual check
- [#555](https://github.com/wladku/Vereino/pull/555) feat(payments): nightly invariant check reports drift between charges, payments and receipt numbers (REQ-043, #531) — base `main` · QA: skip-qa · Issue refs: [#531](https://github.com/wladku/Vereino/issues/531) · Scenarios: S17
- [#553](https://github.com/wladku/Vereino/pull/553) fix(payments): concurrent cash acceptances no longer exhaust the DB pool (#549) — base `main` · QA: skip-qa · Issue refs: [#549](https://github.com/wladku/Vereino/issues/549) · Scenarios: S15
- [#552](https://github.com/wladku/Vereino/pull/552) fix(activities): keep the Tab-focused attendance control clear of the sticky action bar at 375 px (#547) — base `main` · QA: needs-qa · Issue refs: [#547](https://github.com/wladku/Vereino/issues/547) · Scenarios: S06
- [#551](https://github.com/wladku/Vereino/pull/551) test: amendment B test cases TEST-077…TEST-085 (#532) — base `main` · QA: skip-qa · Issue refs: [#532](https://github.com/wladku/Vereino/issues/532) · Scenarios: no manual check
- [#550](https://github.com/wladku/Vereino/pull/550) fix(payments): kit order form inputs have a 44 px hit area (#548) — base `main` · QA: needs-qa · Issue refs: [#548](https://github.com/wladku/Vereino/issues/548) · Scenarios: S06
- [#539](https://github.com/wladku/Vereino/pull/539) fix(payments,facilities,people): texts promise nothing, invent no prices, messages name what to do (E20-S17, #496) — base `main` · QA: needs-qa · Issue refs: [#496](https://github.com/wladku/Vereino/issues/496) · Scenarios: S22

### 2026-11-21

- [#541](https://github.com/wladku/Vereino/pull/541) feat(foundation): delete link tokens 30 days after use or expiry (S9.5, #525) — base `main` · QA: needs-qa · Issue refs: [#525](https://github.com/wladku/Vereino/issues/525) · Scenarios: S16
- [#540](https://github.com/wladku/Vereino/pull/540) docs(specs): person data export for access and portability requests (#527) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#546](https://github.com/wladku/Vereino/pull/546) test(groups): quarantine TEST-L23, its Save click times out after an editor remount in CI (#545) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#512](https://github.com/wladku/Vereino/pull/512) fix(ui): every touch target on the member pages is at least 44 × 44 px (E20-S12, #491) — base `main` · QA: needs-qa · Issue refs: [#491](https://github.com/wladku/Vereino/issues/491) · Scenarios: S06
- [#537](https://github.com/wladku/Vereino/pull/537) feat(club): Today holds three tiles under the club header, calendar opens on the upcoming list (E20-S14, #493) — base `main` · QA: needs-qa · Issue refs: [#493](https://github.com/wladku/Vereino/issues/493) · Scenarios: S04
- [#536](https://github.com/wladku/Vereino/pull/536) feat(club_core): default privacy notice in Polish and English with a children's version (E19-S03, #469) — base `main` · QA: needs-qa · Issue refs: [#469](https://github.com/wladku/Vereino/issues/469) · Scenarios: S09
- [#535](https://github.com/wladku/Vereino/pull/535) fix(people): anonymisation clears order contacts, payer labels, deliveries and audits tables and kept basis (S9.6, #528) — base `main` · QA: skip-qa · Issue refs: [#528](https://github.com/wladku/Vereino/issues/528) · Scenarios: S14
- [#543](https://github.com/wladku/Vereino/pull/543) fix(deps): force patched happy-dom, node-forge, re2js and body-parser (#454) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#534](https://github.com/wladku/Vereino/pull/534) docs(specs): club spec amendment B takes over the domain hand-over of research C (E19-S04, #470) — base `main` · QA: skip-qa · Issue refs: [#470](https://github.com/wladku/Vereino/issues/470) · Scenarios: no manual check
- [#538](https://github.com/wladku/Vereino/pull/538) feat(ui): information notices use the light info style, checkboxes and radios the primary colour (E20-S13, #492) — base `main` · QA: needs-qa · Issue refs: [#492](https://github.com/wladku/Vereino/issues/492) · Scenarios: S21
- [#517](https://github.com/wladku/Vereino/pull/517) docs(lessons): TEST-046 needs no quarantine, each ledger failure belongs to its own PR (#516) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#533](https://github.com/wladku/Vereino/pull/533) ci(release): a merge to main produces a release pull request with a changelog (E15-S03, #447) — base `main` · QA: skip-qa · Issue refs: [#447](https://github.com/wladku/Vereino/issues/447) · Scenarios: no manual check
- [#529](https://github.com/wladku/Vereino/pull/529) docs(compliance): records of processing, DPIA, registers, retention, data-subject procedure and ASVS map (E19-S02, #468) — base `main` · QA: skip-qa · Issue refs: [#468](https://github.com/wladku/Vereino/issues/468) · Scenarios: no manual check
- [#524](https://github.com/wladku/Vereino/pull/524) feat(ops): nightly backup pings the E18-S04 heartbeat and writes the alert token (#519) — base `main` · QA: skip-qa · Issue refs: [#519](https://github.com/wladku/Vereino/issues/519) · Scenarios: S19
- [#472](https://github.com/wladku/Vereino/pull/472) docs(specs): finished specs show what was built, acceptance criteria ticked from evidence (E17-S01, #452) — base `main` · QA: skip-qa · Issue refs: [#452](https://github.com/wladku/Vereino/issues/452) · Scenarios: no manual check
- [#510](https://github.com/wladku/Vereino/pull/510) fix(facilities): day axis in the mockup's colours, place page fits at 768 px (E20-S16, #495) — base `main` · QA: needs-qa · Issue refs: [#495](https://github.com/wladku/Vereino/issues/495) · Scenarios: S20
- [#513](https://github.com/wladku/Vereino/pull/513) fix(navigation): menu groups, titles and terms follow the mockup and glossary D-031 (E20-S15, #494) — base `main` · QA: needs-qa · Issue refs: [#494](https://github.com/wladku/Vereino/issues/494) · Scenarios: S12
- [#515](https://github.com/wladku/Vereino/pull/515) fix(ui): work around platform accessibility gaps and report them upstream (E20-S18, #497) — base `main` · QA: needs-qa · Issue refs: [#497](https://github.com/wladku/Vereino/issues/497) · Scenarios: S13
- [#478](https://github.com/wladku/Vereino/pull/478) feat(ops): refuse to start without required variables, migrate in pre-deploy, never initialise on start (E18-S01, #462) — base `main` · QA: skip-qa · Issue refs: [#462](https://github.com/wladku/Vereino/issues/462) · Scenarios: S18
- [#508](https://github.com/wladku/Vereino/pull/508) fix(activities): staff on the phone are offered only what they may do, and refusals name the way forward (E20-S10, #489) — base `main` · QA: needs-qa · Issue refs: [#489](https://github.com/wladku/Vereino/issues/489) · Scenarios: S05
- [#509](https://github.com/wladku/Vereino/pull/509) feat(club_core): public club pages render on the server and carry the club's name in the title (E20-S08, #487) — base `main` · QA: needs-qa · Issue refs: [#487](https://github.com/wladku/Vereino/issues/487) · Scenarios: S08
- [#507](https://github.com/wladku/Vereino/pull/507) fix(communication,people): an empty message or request shows what is missing instead of a disabled button (E20-S11, #490) — base `main` · QA: needs-qa · Issue refs: [#490](https://github.com/wladku/Vereino/issues/490) · Scenarios: S07

### 2026-11-20

- [#505](https://github.com/wladku/Vereino/pull/505) fix(i18n): translate dashboard tile titles and check for a missing key (E20-S05, #484) — base `main` · QA: needs-qa · Issue refs: [#484](https://github.com/wladku/Vereino/issues/484) · Scenarios: S11
- [#523](https://github.com/wladku/Vereino/pull/523) test(groups): quarantine TEST-L21, its history check fails after 23:00 across a DST change (#521) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#504](https://github.com/wladku/Vereino/pull/504) build: tooling scripts fall under the 100 % rule by their name, so their PRs stop conflicting — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#500](https://github.com/wladku/Vereino/pull/500) feat(ui): every status shows its word and its icon through StatusTag (E20-S03, #482) — base `main` · QA: needs-qa · Issue refs: [#482](https://github.com/wladku/Vereino/issues/482) · Scenarios: S10
- [#499](https://github.com/wladku/Vereino/pull/499) docs(ux): record the owner's UX decisions D-033, close tokens.md C1–C4, statuses with icons in the mockup (E20-S01, #480) — base `main` · QA: skip-qa · Issue refs: [#480](https://github.com/wladku/Vereino/issues/480) · Scenarios: no manual check
- [#477](https://github.com/wladku/Vereino/pull/477) docs(compliance): legal claims B1, B2, B3, B10, B12 checked against primary texts (E19-S01, #467) — base `main` · QA: skip-qa · Issue refs: [#467](https://github.com/wladku/Vereino/issues/467) · Scenarios: no manual check
- [#476](https://github.com/wladku/Vereino/pull/476) feat(foundation): outage and failed-backup alerts, monitoring and incident runbooks (E18-S04, #465) — base `main` · QA: skip-qa · Issue refs: [#465](https://github.com/wladku/Vereino/issues/465) · Scenarios: S19
- [#474](https://github.com/wladku/Vereino/pull/474) feat(ops): nightly encrypted off-site dump and restore drill (#464) — base `main` · QA: skip-qa · Issue refs: [#464](https://github.com/wladku/Vereino/issues/464) · Scenarios: S19
- [#518](https://github.com/wladku/Vereino/pull/518) ci(merge-train): plan and judge batches of PRs, dark (E16-S02, #450) — base `main` · QA: skip-qa · Issue refs: [#450](https://github.com/wladku/Vereino/issues/450) · Scenarios: no manual check
- [#503](https://github.com/wladku/Vereino/pull/503) fix(app): no Open Mercato template is left — "/" leads to the club, titles say Vereino, token mark (E20-S06, #485) — base `main` · QA: needs-qa · Issue refs: [#485](https://github.com/wladku/Vereino/issues/485) · Scenarios: S03
- [#501](https://github.com/wladku/Vereino/pull/501) fix(activities,payments): Today and the session page without 403/404 calls or an English toast (E20-S04, #483) — base `main` · QA: needs-qa · Issue refs: [#483](https://github.com/wladku/Vereino/issues/483) · Scenarios: S02
- [#502](https://github.com/wladku/Vereino/pull/502) feat(ui): visible focus on every interactive element, dialogs return focus to their opener (E20-S02, #481) — base `main` · QA: needs-qa · Issue refs: [#481](https://github.com/wladku/Vereino/issues/481) · Scenarios: S01
- [#458](https://github.com/wladku/Vereino/pull/458) ci(merge-train): hold a risk-high PR that needs QA until qa and mirror train labels onto the linked issue (E16-S01, #449) — base `main` · QA: skip-qa · Issue refs: [#449](https://github.com/wladku/Vereino/issues/449) · Scenarios: no manual check
- [#457](https://github.com/wladku/Vereino/pull/457) feat(ci): check licences and vulnerabilities weekly and configure Renovate (E15-S02) — base `main` · QA: skip-qa · Issue refs: [#446](https://github.com/wladku/Vereino/issues/446) · Scenarios: no manual check
- [#459](https://github.com/wladku/Vereino/pull/459) docs(specs): record the E3 platform spike and the ADR-001 checkpoint (E15-S04, #448) — base `main` · QA: skip-qa · Issue refs: [#448](https://github.com/wladku/Vereino/issues/448) · Scenarios: no manual check
- [#455](https://github.com/wladku/Vereino/pull/455) docs: contribution guide, code of conduct, security policy and issue templates (E15-S01, #445) — base `main` · QA: skip-qa · Issue refs: [#445](https://github.com/wladku/Vereino/issues/445) · Scenarios: no manual check
- [#441](https://github.com/wladku/Vereino/pull/441) feat(activities): club events on the phone — options error state, full Past list, lighter form imports (#440) — base `main` · QA: needs-qa · Issue refs: [#440](https://github.com/wladku/Vereino/issues/440) · Scenarios: covered in qa-scenarios-2026-11-20
- [#438](https://github.com/wladku/Vereino/pull/438) feat(activities): club events on the phone — list, forms, event page with parts and files (E14-S05, #380) — base `main` · QA: needs-qa · Issue refs: [#380](https://github.com/wladku/Vereino/issues/380) · Scenarios: covered in qa-scenarios-2026-11-20
- [#432](https://github.com/wladku/Vereino/pull/432) feat(payments): the treasurer works with a finance-only role, menu and dashboard (E07-S11b, #245) — base `main` · QA: needs-qa · Issue refs: [#245](https://github.com/wladku/Vereino/issues/245) · Scenarios: covered in qa-scenarios-2026-11-20
- [#437](https://github.com/wladku/Vereino/pull/437) feat(people,facilities): an administrator anonymises a former person on a recorded request, with a retention hold, and deletes a person created by mistake (E13-S06, #308) — base `main` · QA: needs-qa · Issue refs: [#308](https://github.com/wladku/Vereino/issues/308) · Scenarios: covered in qa-scenarios-2026-11-20
- [#439](https://github.com/wladku/Vereino/pull/439) feat(club_core,activities): public tournament page and one P-06 card per club event (E14-S06, #381) — base `main` · QA: needs-qa · Issue refs: [#381](https://github.com/wladku/Vereino/issues/381) · Scenarios: covered in qa-scenarios-2026-11-20
- [#422](https://github.com/wladku/Vereino/pull/422) docs(lessons): browser tests run locally on the cezar host under sg docker — base `main` · QA: none · Issue refs: none · Scenarios: covered in qa-scenarios-2026-11-20
- [#436](https://github.com/wladku/Vereino/pull/436) feat(activities): club event poster and funder logos — Files tab, undoable uploads (E14-S04, #379) — base `main` · QA: needs-qa · Issue refs: [#379](https://github.com/wladku/Vereino/issues/379) · Scenarios: covered in qa-scenarios-2026-11-20
- [#431](https://github.com/wladku/Vereino/pull/431) feat(people,activities,payments,club_core,facilities): a leaving coach's sessions are handed over or freed, contracts end, cash held blocks (E13-S05, #307) — base `main` · QA: needs-qa · Issue refs: [#307](https://github.com/wladku/Vereino/issues/307) · Scenarios: covered in qa-scenarios-2026-11-20
- [#430](https://github.com/wladku/Vereino/pull/430) feat(activities): club events in the panel — list, form with Add place, record with parts by day (E14-S03, #378) — base `main` · QA: needs-qa · Issue refs: [#378](https://github.com/wladku/Vereino/issues/378) · Scenarios: covered in qa-scenarios-2026-11-20
- [#434](https://github.com/wladku/Vereino/pull/434) test(groups): quarantine TEST-L22, its dialog axe scan fails intermittently in CI (#433) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: covered in qa-scenarios-2026-11-20
- [#419](https://github.com/wladku/Vereino/pull/419) fix(payments): an overdue reminder counts only the charges due one, so each keeps its own cadence (#404) — base `main` · QA: skip-qa · Issue refs: [#404](https://github.com/wladku/Vereino/issues/404) · Scenarios: covered in qa-scenarios-2026-11-20
- [#429](https://github.com/wladku/Vereino/pull/429) feat(groups): move several children from a roster to another group in one previewed, undoable step (E13-S11, #383) — base `main` · QA: needs-qa · Issue refs: [#383](https://github.com/wladku/Vereino/issues/383) · Scenarios: covered in qa-scenarios-2026-11-20

### Excluded

- 1 excluded (a previous run of this report): [#473](https://github.com/wladku/Vereino/pull/473)
