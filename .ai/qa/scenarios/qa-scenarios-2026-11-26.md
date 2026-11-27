# QA Scenarios — since 2026-11-22

Report window: **2026-11-22 → 2026-11-26** (routes for base `main`). Issue: [#843](https://github.com/wladku/Vereino/issues/843).

## Executive Summary

- **Start with the 5 open PRs the issue names as waiting for your `qa` label** (`risk-high` + `needs-qa`): [#837](https://github.com/wladku/Vereino/pull/837), [#830](https://github.com/wladku/Vereino/pull/830), [#831](https://github.com/wladku/Vereino/pull/831), [#835](https://github.com/wladku/Vereino/pull/835), [#809](https://github.com/wladku/Vereino/pull/809). Each has a short section below: the sandbox preview command, where to tap, what to check, and what you must see to pass it. When this report was written (2026-11-26, about 20:00 UTC) all five already carried `qa`, set the same day; the sections stay as the checklist behind that label and for a re-check after `qa-failed`.
- Reviewed **140 merged PRs**, all into `main`, none into other branches. 1 is excluded (the previous run of this report, #574). 17 are already covered by `qa-scenarios-2026-11-22` (merged on 22 November before that report, or open PRs it described), so this report only lists them. The other **122** are new here.
- The 122 new PRs make up **43 scenarios** (14 P0, 23 P1, 6 P2) covering 44 of them. The other **78 PRs** need no manual check (docs, tests, CI, merge train, tooling, dependency bumps).
- Riskiest theme: the window moves Vereino to many clubs on one instance (a club per subdomain, operator commands that create, export, delete and restore a club, shared sweep jobs, per-club limits) and changes how people sign in (Google and Facebook, a password check against breached passwords, rate limits, refusal of cross-site requests). New member-facing flows arrive too: medical certificate expiry, training outlines and their shared library, the cash handover and the Day / Week / Month calendar switch.
- 15 of the new merged PRs carried `risk-high`; 6 merged with `needs-qa` and no recorded QA sign-off, and this report is that checklist. 25 items could not be resolved against the code; they are listed under "Unresolved items".

## How to use this report

- Work in the sandbox with the example club and the interface switched to **Polish**. Every quoted label („…”) is the text the Polish catalog (`pl.json`) shows, on `main` or, for Q1–Q5, on the PR's branch.
- Q1–Q5 are open PRs: start each with its preview command, `node C:\Users\wkuc\vereino-sandbox-env\sandbox.mjs preview <PR>` (5–10 min), then http://127.0.0.1:4300. The S-scenarios are merged and run on the ordinary sandbox after `node sandbox.mjs upgrade`.
- Administrator and treasurer scenarios run on the desktop (`/backend`). Every other role runs on a phone or in a 375 px wide browser window. Operator scenarios run in a shell on a local or disposable database, never on production or on sandbox data you want to keep.
- Follow the steps, tick each "verify" bullet, and file a new issue for anything under "what can go wrong" that you see. Scenario ids (Q1 …, S01 …) are stable within this report only.

## Recommended QA Order

| Id | Priority | Role | Scenario | PRs |
|---|---|---|---|---|
| Q1 | P0 | coordinator, coach, administrator | A coordinator sees „Deklaracje w Vereino” for their own sections on the phone, and a coach gets a clear refusal (open, `qa` set 2026-11-26) | [#837](https://github.com/wladku/Vereino/pull/837) |
| Q2 | P0 | guardian, coordinator | Section sign-up: a parent applies from the public page, confirms by e-mail, the coordinator rejects or wait-lists (open, `qa` set 2026-11-26) | [#830](https://github.com/wladku/Vereino/pull/830) |
| Q3 | P0 | administrator, treasurer, member, coach | Administrators and treasurers finish signing in with a 6-digit code from an e-mail (open, `qa` set 2026-11-26) | [#831](https://github.com/wladku/Vereino/pull/831) |
| Q4 | P0 | owner (GitHub) | CI runs as before until `CI_SELF_HOSTED` is set; heavy jobs move to the factory server only after the switch (open, `qa` set 2026-11-26) | [#835](https://github.com/wladku/Vereino/pull/835) |
| Q5 | P0 | administrator, guardian | Staff are signed out after 30 idle minutes, and changing the own e-mail asks for the current password (open, `qa` set 2026-11-26) | [#809](https://github.com/wladku/Vereino/pull/809) |
| S01 | P0 | member (or administrator) | Password forms state the real rule and reject common, breached or club-name passwords | [#812](https://github.com/wladku/Vereino/pull/812) |
| S02 | P0 | guest | Repeated wrong sign-ins and reset requests are throttled with a clear message | [#751](https://github.com/wladku/Vereino/pull/751) |
| S03 | P0 | member, administrator | Sign in with Google and connect or disconnect it on the profile | [#610](https://github.com/wladku/Vereino/pull/610), [#783](https://github.com/wladku/Vereino/pull/783) |
| S04 | P0 | administrator | Cross-site requests with a session cookie are refused; normal use is unaffected | [#802](https://github.com/wladku/Vereino/pull/802) |
| S05 | P0 | guest, administrator | A club is reached at its own subdomain; bare domain shows a landing page; unknown label gives 404 | [#679](https://github.com/wladku/Vereino/pull/679) |
| S06 | P0 | operator | One operator command creates a club; an unfinished run can be completed | [#662](https://github.com/wladku/Vereino/pull/662), [#749](https://github.com/wladku/Vereino/pull/749) |
| S07 | P0 | operator | Club leaves the instance: notice, export archive, deletion and restore | [#677](https://github.com/wladku/Vereino/pull/677), [#686](https://github.com/wladku/Vereino/pull/686) |
| S08 | P0 | administrator (club), treasurer (negative check) | Administrator sees the offboarding banner and downloads the club export | [#678](https://github.com/wladku/Vereino/pull/678) |
| S09 | P0 | administrator, treasurer (negative check) | Administrator exports one person's data for an access or portability request | [#609](https://github.com/wladku/Vereino/pull/609) |
| S10 | P0 | operator | Production image runs the mercato CLI and the Redis cache works | [#733](https://github.com/wladku/Vereino/pull/733) |
| S11 | P0 | guardian, coach, administrator | Medical certificate expiry date needs consent, shows red/orange/green chips and sends reminders | [#705](https://github.com/wladku/Vereino/pull/705) |
| S12 | P0 | coach | Match squad warns about players without a valid medical certificate | [#705](https://github.com/wladku/Vereino/pull/705) |
| S13 | P0 | coach, administrator, guest | Shared outline library: publish, copy, rate, report and the public page | [#729](https://github.com/wladku/Vereino/pull/729) |
| S14 | P0 | coach, treasurer (or administrator) | Coach sends a cash handover; treasurer confirms or rejects it with a reason | [#795](https://github.com/wladku/Vereino/pull/795) |
| S15 | P1 | member, administrator | Sign in with Facebook, "no e-mail shared" and data deletion | [#829](https://github.com/wladku/Vereino/pull/829) |
| S16 | P1 | administrator, guardian | Ordinary saves and orders still work after the command scope change | [#794](https://github.com/wladku/Vereino/pull/794) |
| S17 | P1 | administrator of two clubs | One club never sees another club's records; a foreign id answers like an unknown one | [#652](https://github.com/wladku/Vereino/pull/652) |
| S18 | P1 | operator | Restoring a club archive refuses references outside the club | [#827](https://github.com/wladku/Vereino/pull/827) |
| S19 | P1 | administrator | Resending an invitation uses the person's language | [#688](https://github.com/wladku/Vereino/pull/688) |
| S20 | P1 | administrator, member | Dependency upgrade (zod 4.6.7) leaves validation and forms intact | [#573](https://github.com/wladku/Vereino/pull/573) |
| S21 | P1 | coordinator (announcement author), member (recipient) | E-mails link to the recipient's club address and are sent as "<club> via Vereino" | [#679](https://github.com/wladku/Vereino/pull/679) |
| S22 | P1 | operator | Operator reads and retires the per-club job schedules (one sweep per job type) | [#663](https://github.com/wladku/Vereino/pull/663) |
| S23 | P1 | administrator, operator | Per-club request budget, one import at a time, fair e-mail pacing | [#726](https://github.com/wladku/Vereino/pull/726) |
| S24 | P1 | administrator | People import commit shows progress and rolls back cleanly | [#625](https://github.com/wladku/Vereino/pull/625) |
| S25 | P1 | operator, administrator | Retention sweep closes open erasure requests | [#643](https://github.com/wladku/Vereino/pull/643) |
| S26 | P1 | operator | Module CLIs exit 1 after usage errors; ACL sync runs only when role defaults change | [#658](https://github.com/wladku/Vereino/pull/658), [#675](https://github.com/wladku/Vereino/pull/675) |
| S27 | P1 | operator | Enterprise licence status CLI and a rejected test key | [#723](https://github.com/wladku/Vereino/pull/723) |
| S28 | P1 | coach | Training outline: write on the phone, attach to a session, print as PDF in the PZPN layout | [#706](https://github.com/wladku/Vereino/pull/706) |
| S29 | P1 | operator | Operator sets up and moderates the outline library | [#729](https://github.com/wladku/Vereino/pull/729) |
| S30 | P1 | administrator (and coordinator/coach for the refusal) | Administrator reopens a done session with a reason | [#694](https://github.com/wladku/Vereino/pull/694) |
| S31 | P1 | administrator, coordinator, coach | Per-section report of declarations made in Vereino | [#828](https://github.com/wladku/Vereino/pull/828) |
| S32 | P1 | coach, coordinator, administrator | PZPN schedule and attendance CSV exports | [#696](https://github.com/wladku/Vereino/pull/696) |
| S33 | P1 | member, guest, coordinator, administrator | Calendars switch between Day, Week and Month with the view and day kept in the address | [#796](https://github.com/wladku/Vereino/pull/796) |
| S34 | P1 | administrator, coordinator, coach | Group places limit, sign-up switch and sign-up settings (nothing public yet) | [#813](https://github.com/wladku/Vereino/pull/813) |
| S35 | P1 | administrator, coordinator | Bulk move of children: the "Fits" filter preselects by the category's birth years | [#612](https://github.com/wladku/Vereino/pull/612) |
| S36 | P1 | coordinator, coach | Closure or maintenance notice opens "Needs a new time" for a coordinator | [#613](https://github.com/wladku/Vereino/pull/613) |
| S37 | P1 | operator, treasurer | Daily charge generation no longer records an empty month | [#669](https://github.com/wladku/Vereino/pull/669) |
| S38 | P2 | operator | Sending-subdomain DNS check | [#824](https://github.com/wladku/Vereino/pull/824) |
| S39 | P2 | operator | Key store boot guard | [#826](https://github.com/wladku/Vereino/pull/826) |
| S40 | P2 | administrator | Sessions list keeps its rows while it refetches | [#704](https://github.com/wladku/Vereino/pull/704) |
| S41 | P2 | guest | Long club name does not cover the public header links | [#680](https://github.com/wladku/Vereino/pull/680) |
| S42 | P2 | member (not a maintainer) | Maintenance refusal names the current panel path | [#668](https://github.com/wladku/Vereino/pull/668) |
| S43 | P2 | operator | `yarn dev` stops on low inotify limits (developer tooling) | [#815](https://github.com/wladku/Vereino/pull/815) |

## Waiting for your `qa` label

These PRs are still open. Each carries `risk-high` and `needs-qa`, and the merge train holds it until it gets `qa`. The labels, texts and routes come from each PR's own branch, so some are not on `main` yet. All five got `qa` on 2026-11-26 before this report was finished.

#### Q1 · P0 — A coordinator sees „Deklaracje w Vereino” for their own sections on the phone, and a coach gets a clear refusal

**PR:** [#837](https://github.com/wladku/Vereino/pull/837) (open, `risk-high`, `needs-qa`, `qa` set 2026-11-26) · **Issue:** [#819](https://github.com/wladku/Vereino/issues/819)
**Preview:** `node C:\Users\wkuc\vereino-sandbox-env\sandbox.mjs preview 837` (5–10 min), then http://127.0.0.1:4300
**Device:** phone 375 px · **Time:** ~8 min
**What changed:** The panel report „Deklaracje w Vereino” from [#828](https://github.com/wladku/Vereino/pull/828) now has a phone page at `/club/reports/declaration-share`. A section coordinator sees one card per section they coordinate; the administrator sees every section. A coach has no menu entry, and opening the address shows a refusal that says who may see the report.

**Where to click**

1. Sign in as a **section coordinator** (one who coordinates one or two sections, not all of them). Tap „Więcej” in the bottom bar, then „Deklaracje w Vereino”.
2. Leave „Okres” on „Ostatnie 28 dni”, then switch to „Miesiąc”, then „Zakres dat” with „Od” later than „Do”.
3. In the address bar, add `?sectionId=` with the id of a section this person does not coordinate, and reload.
4. Sign in as the **club administrator** on the desktop. Open the panel report „Deklaracje w Vereino” (from [#828](https://github.com/wladku/Vereino/pull/828)) for the same period and compare.
5. Sign in as a **coach** who coordinates nothing. Open „Więcej”, then type `/club/reports/declaration-share` in the address bar.

**What to verify**

- [ ] The coordinator sees one card for each section they coordinate and no other section, also with `?sectionId=` in the address
- [ ] Each card shows the same numbers and text as the panel row for that section, e.g. „{declared} z {total} ({percent}%) zadeklarowanych w Vereino”
- [ ] A reversed range shows „Wybierz zakres najwyżej 12 miesięcy, który kończy się nie wcześniej niż zaczyna.”
- [ ] The coach sees no „Deklaracje w Vereino” entry under „Więcej”, and the address shows „Ten raport widzą tylko administrator klubu i koordynatorzy sekcji — …”
- [ ] At 375 px there is no horizontal scroll, no person's name on any card, and the buttons are easy to tap

**How to pass:** add `qa` (already set on 2026-11-26) when the coordinator's cards match the panel for their sections only and the coach gets the refusal. All of it can be checked on the phone, except the panel comparison in step 4.

#### Q2 · P0 — Section sign-up: a parent applies from the public page, confirms by e-mail, the coordinator rejects or wait-lists

**PR:** [#830](https://github.com/wladku/Vereino/pull/830) (open, `risk-high`, `needs-qa`, `qa` set 2026-11-26) · **Issue:** [#799](https://github.com/wladku/Vereino/issues/799)
**Preview:** `node C:\Users\wkuc\vereino-sandbox-env\sandbox.mjs preview 830` (5–10 min), then http://127.0.0.1:4300
**Device:** phone 375 px · **Time:** ~15 min
**What changed:** A new module `enrolment`. A parent opens a public section page, taps „Zgłoś dziecko”, fills three steps (child, group, contact) and confirms the application from an e-mail within an hour. The coordinator sees new applications on „Dziś” in the tile „Zgłoszenia” and can reject one with a reason or put it on the group's waiting list. The sections settings and places come from [#813](https://github.com/wladku/Vereino/pull/813).

**Where to click**

1. The switch that opens a section to online sign-ups is still hidden (phase 3). Ask the decision session to turn it on for one public section with one public group.
2. On the phone, open `/p/<clubSlug>/sections/<sectionSlug>` and tap „Zgłoś dziecko”. Fill in the three steps and send.
3. Open the link from the e-mail „Potwierdź zgłoszenie: {section}” and tap „Potwierdź zgłoszenie”.
4. Sign in as that section's coordinator. On „Dziś”, open the tile „Zgłoszenia” and the new application. Tap „Odrzuć”, give a reason, confirm.
5. Send a second application, confirm it, and as the coordinator tap „Lista oczekujących”.

**What to verify**

- [ ] After sending, the page shows „Sprawdź skrzynkę e-mail” and says the link is valid for one hour
- [ ] After confirming, the page shows „Zgłoszenie wysłane” and the answer time in days
- [ ] The tile „Zgłoszenia” shows „Nowe: {count}” with the confirmed application only; an unconfirmed one is not listed
- [ ] After „Odrzuć”, the screen shows „Zgłoszenie zostało odrzucone. Zgłaszający dostał e-mail.” and the parent's e-mail carries „Powód: …”
- [ ] After „Lista oczekujących”, the parent gets an e-mail with their place on the list
- [ ] A coordinator of another section does not see these applications

**How to pass:** add `qa` (already set on 2026-11-26) when both e-mails arrive and the coordinator's two actions work on the phone. Admission to the group and the trial session (phases 3 and 4) are not in this PR.

#### Q3 · P0 — Administrators and treasurers finish signing in with a 6-digit code from an e-mail

**PR:** [#831](https://github.com/wladku/Vereino/pull/831) (open, `risk-high`, `needs-qa`, `security`, `qa` set 2026-11-26) · **Issue:** [#736](https://github.com/wladku/Vereino/issues/736)
**Preview:** `node C:\Users\wkuc\vereino-sandbox-env\sandbox.mjs preview 831` (5–10 min), then http://127.0.0.1:4300
**Device:** phone 375 px for the code page; desktop for the reset dialog · **Time:** ~15 min
**What changed:** A club administrator, a treasurer and the super-admin no longer reach the panel with a password alone. After the password, `/login/second-factor` asks for a code sent by e-mail (valid 10 minutes, single use, 5 attempts, 3 resends 60 s apart). Another administrator can reset a person's second factor from the person record. Coaches, coordinators and parents sign in as before.

**Where to click**

1. On the phone, sign in at `/login` as the **club administrator**. The page „Sprawdź pocztę” opens.
2. Type a wrong code once, then `12345` (five digits), then the right code from the e-mail „Twój kod logowania do Vereino: {code}”.
3. Sign out and in again. On the code page, wait for „Wyślij nowy kod za {seconds} s” to count down, tap „Wyślij nowy kod”, and sign in with the new code. Try the old code first.
4. Sign in as a **parent** and as a **coach**: no code page.
5. Desktop, as the administrator: open a **treasurer's** person record in the panel and use „Zresetuj drugi składnik”. Leave the note empty, then write a note, tick „Potwierdziłem tożsamość tej osoby” and confirm. Then open your own record.

**What to verify**

- [ ] The administrator sees no panel page before the code; opening `/backend` directly after the password returns to sign-in
- [ ] A wrong code shows „Nieprawidłowy kod. Pozostałe próby: {count}.”; five digits show „Wpisz sześć cyfr z wiadomości.”
- [ ] After a resend, the old code is refused and the new one signs in
- [ ] The parent and the coach sign in with the password alone
- [ ] The reset shows „Drugi składnik zresetowany; sesje zakończone.”; on your own record the reset is refused with „Nie możesz zresetować własnego drugiego składnika. Poproś innego administratora.”
- [ ] The code page fits 375 px and the screen reader announces the status messages

**How to pass:** add `qa` (already set on 2026-11-26) when the administrator cannot reach the panel without the code and the parent is not asked for one. Google sign-in cannot be tested in the preview (no keys), so the Google-only rule for these roles is left to TEST-2F03. After the merge, every club needs `second-factor end-sessions` once (the PR's rollout list).

#### Q4 · P0 — CI runs as before until `CI_SELF_HOSTED` is set; heavy jobs move to the factory server only after the switch

**PR:** [#835](https://github.com/wladku/Vereino/pull/835) (open, `risk-high`, `needs-qa`, `qa` set 2026-11-26) · **Issue:** [#834](https://github.com/wladku/Vereino/issues/834)
**Preview:** none. Nothing to click in the app; the check is the PR's own CI run and, after the merge, the runbook `docs/ops/ci-runners.md`
**Device:** desktop (GitHub) · **Time:** ~5 min, plus the switch-on whenever you choose
**What changed:** The workflows can send the trusted heavy jobs to self-hosted runners on the factory server, but only when the repository variable `CI_SELF_HOSTED` is `true`. Until then every job runs on GitHub's runners as today. Fork PRs never reach the self-hosted runners.

**Where to click**

1. On the PR, open the „Checks” tab, the job `gate`, and its „Set up job” step.
2. Compare the required check names with the ones on `main`.
3. After the merge, when you want to switch: follow steps 1–4 of `docs/ops/ci-runners.md` on the server and in the repository settings, then open the next CI run.
4. Step 6 of the runbook: a trial PR from a fork.

**What to verify**

- [ ] Without the variable, „Set up job” names a „GitHub Actions …” runner
- [ ] The required checks `gate`, `integration` and `browser-smoke` keep their names and are green
- [ ] After the switch, „Set up job” names a `cezar-ws-…` runner
- [ ] The fork PR's jobs all run on „GitHub Actions …”

**How to pass:** add `qa` (already set on 2026-11-26) when the PR's own run shows GitHub runners and unchanged check names. The installation script and the CI timing need your steps on the server, so they come after the merge.

#### Q5 · P0 — Staff are signed out after 30 idle minutes, and changing the own e-mail asks for the current password

**PR:** [#809](https://github.com/wladku/Vereino/pull/809) (open, `risk-high`, `needs-qa`, `security`, `qa` set 2026-11-26) · **Issue:** [#737](https://github.com/wladku/Vereino/issues/737)
**Preview:** `node C:\Users\wkuc\vereino-sandbox-env\sandbox.mjs preview 809` (5–10 min), then http://127.0.0.1:4300
**Device:** desktop or phone · **Time:** ~5 min of clicks plus two 30-minute waits (run them side by side)
**What changed:** A staff account (coach, coordinator, treasurer, administrator) is signed out after 30 minutes without activity, and „Zapamiętaj mnie” no longer extends its session. Changing the own e-mail on the profile page needs the current password. Members and parents keep the long session.

**Where to click**

1. Sign in as the **club administrator** with „Zapamiętaj mnie” ticked.
2. Open the account menu at the top right → profile. Enter a new e-mail without the current password and save.
3. Enter the current password and save again.
4. Leave the tab untouched for more than 30 minutes.
5. In a second browser, sign in as a **parent** with „Zapamiętaj mnie”, and leave it untouched for 30 minutes too.

**What to verify**

- [ ] Without the password, the save is refused with a message that the current password is needed („Potrzebne do zmiany adresu e-mail lub hasła.” under the field)
- [ ] A wrong password shows „Obecne hasło jest nieprawidłowe.”; the right one saves and the field shows the new address
- [ ] After 30 idle minutes the administrator's tab goes to the sign-in page by itself
- [ ] The parent is still signed in after 30 minutes

**How to pass:** add `qa` (already set on 2026-11-26) when the administrator is signed out after 30 idle minutes, the parent is not, and the e-mail change needs the password. Google sign-in is not testable in the preview (no keys).

## Scenarios

### P0 — Sign-in, accounts and security

#### S01 · P0 — Password forms state the real rule and reject common, breached or club-name passwords

**Role:** member (or administrator) · **Device:** phone 375 px · **Why P0:** priority-high, risk-high, security, needs-qa; every password form and the API now share one new policy
**PRs:** [#812](https://github.com/wladku/Vereino/pull/812) · **Issues:** [#779](https://github.com/wladku/Vereino/issues/779)
**Route:** `/club/profile`, `/login` — „Profil i podopieczni” → „Hasło” → „Zmień hasło”; „Nie pamiętasz hasła?” on the login page
**Before you start:** Sign in as any account holder of the example club and know its current password. For the last step you need a way to read the reset e-mail in the sandbox (it is only captured, never delivered).

**Steps**

1. On `/club/profile` open the „Hasło” section and tap „Zmień hasło”.
2. Read the hint under „Nowe hasło”.
3. Enter the current password and the new password `Qwerty123456` twice, then save.
4. Repeat with `Vereino2026!!`.
5. Repeat with a longer lowercase sentence, for example `zielony rower nad jeziorem`; save, sign out and sign in with it.
6. On `/login` tap „Nie pamiętasz hasła?”, request a reset link, open the link from the captured e-mail and look at the hint.

**What to verify**

- [ ] Hint under „Nowe hasło” → says at least 12 characters and does not demand a digit, capital letter or special character.
- [ ] `Qwerty123456` → rejected with „To hasło jest zbyt popularne albo wyciekło w znanym wycieku danych. Wybierz inne.”
- [ ] `Vereino2026!!` → rejected with „Hasło jest zbyt podobne do nazwy klubu, produktu albo Twojego imienia lub adresu e-mail. Dodaj więcej własnych słów.”
- [ ] Lowercase 12+ character sentence → saved, and the new password works at the next sign-in.
- [ ] The reset-password page shows the same 12-character rule.

**What can go wrong**

- The form still shows the old digit/capital/special-character requirements, or accepts a short password.
- The error is shown only after a full page reload, or in English although the UI is Polish.
- A password with a leading or trailing space or over 64 characters is accepted or gives a generic error.

#### S02 · P0 — Repeated wrong sign-ins and reset requests are throttled with a clear message

**Role:** guest · **Device:** desktop shell and phone 375 px · **Why P0:** priority-high, security, skip-qa; brute-force protection with risk-medium (PR labels: priority-high, risk-medium)
**PRs:** [#751](https://github.com/wladku/Vereino/pull/751) · **Issues:** [#738](https://github.com/wladku/Vereino/issues/738)
**Route:** `/login`, `/api/auth/login`, `/api/auth/reset` — „Nie pamiętasz hasła?”
**Before you start:** A local sandbox account whose password you know. The limiter may be switched off or process-local in a sandbox, so a missing 429 can be a configuration matter (see Unresolved). Use a throwaway account, because it will be throttled.

**Steps**

1. On `/login` enter the account e-mail with a wrong password 11 times in a row (limit is 10 per 15 minutes per account).
2. Note the message on the 11th attempt, then try the correct password at once.
3. On the same page request a password reset for the same e-mail 4 times.
4. In another browser or private window sign in to a different account with the correct password.
5. Wait for the retry time, then sign in with the correct password.

**What to verify**

- [ ] Early wrong attempts → „Nieprawidłowy email lub hasło…” message, no throttling yet.
- [ ] After the limit → „Zbyt wiele zapytań. Spróbuj ponownie później.” (HTTP 429) even for the correct password.
- [ ] A different account is not throttled by the first account's attempts.
- [ ] After a successful sign-in the counter for that account is cleared.
- [ ] The reset form still answers the same neutral confirmation, whether or not the e-mail exists.

**What can go wrong**

- The whole instance becomes throttled because every client shares one counter (the proxy-depth gap this PR closes).
- The throttle message appears as a blank page or raw JSON.
- The reset form reveals whether the e-mail has an account.

#### S03 · P0 — Sign in with Google and connect or disconnect it on the profile

**Role:** member, administrator · **Device:** phone 375 px (member), desktop (administrator) · **Why P0:** risk-high, needs-qa; new authentication path, plus the club-address return of #783
**PRs:** [#610](https://github.com/wladku/Vereino/pull/610), [#783](https://github.com/wladku/Vereino/pull/783) · **Issues:** [#566](https://github.com/wladku/Vereino/issues/566), [#700](https://github.com/wladku/Vereino/issues/700)
**Route:** `/login`, `/club/profile`, `/backend/people/persons` (person record) — „Połączone konta”; administrator: „Sposoby logowania”
**Before you start:** Needs Google OAuth keys (`VEREINO_OAUTH_GOOGLE_CLIENT_ID`, `VEREINO_OAUTH_GOOGLE_CLIENT_SECRET`, `VEREINO_OAUTH_REDIRECT_BASE_URL`) and a real Google account matching an invited person. Without keys only the negative path below (steps 1-3) can be tested; the full flow is covered by the automated tests TEST-S01, TEST-S02, TEST-S04 and TEST-S05.

**Steps**

1. Open `/login` without keys configured: the e-mail and password form is shown and there is no Google button.
2. Sign out, then open `/api/foundation/identity/google/handoff?token=test` in the address bar.
3. Sign in again with e-mail and password.
4. With keys: on `/club/profile` find „Połączone konta” and tap „Połącz Google”; approve at Google.
5. Sign out; on `/login` tap „Zaloguj się przez Google” and approve.
6. As an administrator open the person record, find „Sposoby logowania” and unlink the identity; as the member, try to unlink the only remaining sign-in method.
7. With a club domain set (`VEREINO_CLUB_DOMAIN`), start step 5 from the club's own address.

**What to verify**

- [ ] No keys → no Google button; the e-mail and password form works as before.
- [ ] The handoff URL with a bogus token → back on login with „Nie udało się zalogować tym kontem. Zaloguj się adresem e-mail albo połącz konto w swoim profilu.” and nobody signed in.
- [ ] With keys: after connecting → „Połączono Google.” and the identity listed; one-click sign-in lands in the member's own club.
- [ ] Unlinking → confirmation „Odłączyć Google?”, then „Odłączono Google.”; the sole method is refused with „Nie można odłączyć, dopóki to jedyny sposób logowania.”
- [ ] With a club domain: sign-in ends on the same club address, not on the main app address.
- [ ] A Google account that is not linked never creates an account; the same generic message appears whether or not the identity exists.

**What can go wrong**

- An unlinked or unknown Google identity creates an account or reveals that it exists.
- After Google sign-in the member lands on the main address or another club instead of their own club address.
- Unlinking works for the last remaining method and locks the person out.

#### S04 · P0 — Cross-site requests with a session cookie are refused; normal use is unaffected

**Role:** administrator · **Device:** desktop shell · **Why P0:** priority-high, security, skip-qa; changes every API mutation path (risk-medium)
**PRs:** [#802](https://github.com/wladku/Vereino/pull/802) · **Issues:** [#744](https://github.com/wladku/Vereino/issues/744)
**Route:** `/api/**` (POST/PUT/PATCH/DELETE) — any backend save, plus a command-line probe
**Before you start:** A signed-in administrator session in the sandbox browser, and permission to run `curl` against the local app with that session cookie (do not paste the cookie anywhere).

**Steps**

1. In the browser, save a change on any person record and create something new (for example „Dodaj” a person).
2. In a shell send a mutating API request with the session cookie and header `Origin: https://evil.example`.
3. Repeat with `Sec-Fetch-Site: cross-site` and no `Origin`.
4. Repeat with the cookie and the app's own origin.
5. Repeat with a bearer token and the foreign origin.

**What to verify**

- [ ] Normal saves in the admin panel and on `/club` pages still succeed.
- [ ] Foreign origin plus cookie → 403 with code `cross_site_request_refused`, with `no-store`.
- [ ] `Sec-Fetch-Site: cross-site` plus cookie → 403 with the same code.
- [ ] Same origin plus cookie → request is processed normally.
- [ ] A bearer-token request with a foreign origin is not refused by this check.

**What can go wrong**

- Legitimate saves from a club's custom domain or the bare club domain return 403.
- `Origin: null` or a deeper subdomain is accepted.
- Webhook routes (`/api/webhooks/...`) get blocked.

### P0 — Many clubs, operator and privacy

#### S05 · P0 — A club is reached at its own subdomain; bare domain shows a landing page; unknown label gives 404

**Role:** guest, administrator · **Device:** phone 375 px (browser) plus desktop shell for the env variable · **Why P0:** priority-high, risk-high, needs-qa; the request `Host` header now selects the club and its sign-in tenant
**PRs:** [#679](https://github.com/wladku/Vereino/pull/679) · **Issues:** [#631](https://github.com/wladku/Vereino/issues/631)
**Route:** `/` on `<slug>.<club domain>`, the bare club domain, an unknown label, `/p/<slug>`, `/login` — no menu path
**Before you start:** Local setup, taken from `docs/ops/deploy.md` (*Club addresses*) and `club_core/lib/club-host.ts`. Start the app with `VEREINO_CLUB_DOMAIN=localhost:3000` (use your real port; a domain written with a port matches with that port) and `APP_URL=http://app.localhost:3000`. Browsers resolve `*.localhost` to loopback, so `http://<slug>.localhost:3000` needs no hosts-file entry. If your browser or OS does not, add `127.0.0.1 <slug>.localhost app.localhost` to the hosts file. You need the example club (published public page) and, for step 5, a second club (see S06). Do not set `VEREINO_HOME_CLUB_SLUG` (it is ignored once the domain is set).

**Steps**

1. Open `http://<example slug>.localhost:3000/` on the phone width. A published club shows its public page; an unpublished one shows its sign-in page.
2. Open `http://localhost:3000/` and `http://app.localhost:3000/` (the bare domain and the `APP_URL` host).
3. Open `http://nosuchclub.localhost:3000/`, then `http://admin.localhost:3000/` (a reserved label).
4. Open `http://localhost:3000/p/<example slug>` (the old public-page path on a non-club host).
5. Open the sign-in page on club A's address, and try to sign in with an account of club B. Then sign in with club A's account and, in the same browser, open club B's address.
6. Switch the UI to Polish and repeat step 2 in light and dark mode.

**What to verify**

- [ ] Step 1 → the example club's page opens at its own address with no console errors.
- [ ] Step 2 → a neutral landing page with „Znajdź swój klub” and the link „Zaloguj się, aby zarządzać usługą”; no club content.
- [ ] Step 3 → both answer 404 (the platform's default not-found page).
- [ ] Step 4 → redirected to the club's own address, keeping path and query.
- [ ] Step 5 → club B's account is refused on club A's form; a club A session opened on club B's address is sent back to club A's address.
- [ ] Step 6 → no horizontal scroll at 375 px, text readable in both themes.

**What can go wrong**

- A club page opens on the wrong host, or a `Host` that is a reserved label (`www`, `app`, `api`, `admin`, `mail`, `status`, `demo`, `blog`) resolves to a club.
- Club A's session is accepted on club B's address and shows club B's data.
- With the variable unset, `/` no longer opens the one club (single-club behaviour regressed).

#### S06 · P0 — One operator command creates a club; an unfinished run can be completed

**Role:** operator · **Device:** desktop shell (local or disposable database only, never production) · **Why P0:** priority-high, risk-medium; creates a tenant and the first administrator
**PRs:** [#662](https://github.com/wladku/Vereino/pull/662), [#749](https://github.com/wladku/Vereino/pull/749) · **Issues:** [#630](https://github.com/wladku/Vereino/issues/630)
**Route:** shell — `yarn mercato club_core create-club`; then `/login` and `/backend` of the new club; runbook `docs/ops/clubs.md`
**Before you start:** A local database with the example club and a working local mail log. Use a throwaway slug such as `qa-test-club` and an address of a mailbox you can read locally.

**Steps**

1. Run `yarn mercato club_core create-club --dry-run --slug qa-test-club --name "QA Test Club" --admin-email <your test address> --admin-first-name Anna --admin-last-name Nowak`. Read the JSON line.
2. Run it again without `--dry-run`, with `--locale pl`.
3. Run the same command a third time.
4. Try `--slug www`, `--slug demo`, `--slug blog` and the example club's slug; also try the admin e-mail of an existing account.
5. Open the invitation in the mail log, set a password, sign in, and open `/backend`. Open the club's public page and try to save the club settings with slug `www`.
6. Run any club module command with a wrong option (for example `yarn mercato club_core create-club` without arguments) and check `echo $?`.

**What to verify**

- [ ] Step 1 → `status` is `dry-run` and nothing is created.
- [ ] Step 2 → `status` is `created`, exit 0; the invitation is in Polish and carries one link for about 48 hours.
- [ ] Step 3 → `status` is `exists`, nothing changes.
- [ ] Step 4 → each is refused (`refused`/`invalid`, exit 1) before any write; reserved labels include `demo` and `blog`.
- [ ] Step 5 → the new administrator signs in and sees only the new club; saving slug `www` in the settings answers 400 `slug_reserved`.
- [ ] Step 6 → usage text on stderr and exit code 1 (see S26).

**What can go wrong**

- The new administrator lands in an existing club's tenant, or sees another club's data.
- A half-created club re-runs as `exists`, or a second invitation leaves the first link working.
- A password is printed in the output.

#### S07 · P0 — Club leaves the instance: notice, export archive, deletion and restore

**Role:** operator · **Device:** desktop shell (local or disposable database only, never production) · **Why P0:** risk-high, needs-qa; irreversible deletion of a tenant's data
**PRs:** [#677](https://github.com/wladku/Vereino/pull/677), [#686](https://github.com/wladku/Vereino/pull/686) · **Issues:** [#632](https://github.com/wladku/Vereino/issues/632), [#681](https://github.com/wladku/Vereino/issues/681)
**Route:** shell — `club_core offboard-club | export-club | delete-club | restore-club`; runbook `docs/ops/clubs.md`
**Before you start:** Create a throwaway second club as in S06 (`qa-leaving-club`) and add a person, an activity and one uploaded attachment in it. Leave the example club untouched as the control. Local database only.

**Steps**

1. `yarn mercato club_core offboard-club --slug qa-leaving-club`, then run it again.
2. `yarn mercato club_core export-club --slug qa-leaving-club --out /tmp/qa-leaving-club.zip`. List the ZIP, check the `.sha256` file and the file mode (`ls -l`). Run the export again to the same path.
3. `yarn mercato club_core delete-club --slug qa-leaving-club --confirm qa-leaving-club --dry-run`, then without `--dry-run` while the notice period is still running.
4. Shorten the wait as the runbook describes for a sandbox (or set the stored `offboarding_delete_after` in the past on the throwaway database), then run `delete-club` for real. Check the example club still works.
5. `yarn mercato club_core restore-club --in /tmp/qa-leaving-club.zip --dry-run`, then for real. Try restoring a second time.
6. Sign in to the restored club and open the person, the activity and the attachment.

**What to verify**

- [ ] Step 1 → the deletion date is 30 days ahead and does not move on the second run (`--cancel` withdraws the notice).
- [ ] Step 2 → the ZIP holds `manifest.json`, `data/<module>.json` files and `files/…`; the file is mode 0600; a second export is refused because the files already exist.
- [ ] Step 3 → refused with `offboarding_not_due` before the notice period ends; the dry run changes nothing.
- [ ] Step 4 → the club is gone (sign-in impossible, only a tombstone of the slug remains) and the example club is unaffected.
- [ ] Step 5 → the restore succeeds into an empty slot and refuses when the club already exists.
- [ ] Step 6 → people, activities and attachment files are back; data was decrypted in the export and re-encrypted on restore.

**What can go wrong**

- Delete or export touches rows of another club, or the export contains sign-in tokens, API keys or credentials.
- A failed delete leaves the club half-deleted or without its schedules; a file uploaded during deletion is orphaned.
- A tenant-less sidebar preference of the club's administrator blocks the user deletion.

#### S08 · P0 — Administrator sees the offboarding banner and downloads the club export

**Role:** administrator (club), treasurer (negative check) · **Device:** phone 375 px and desktop · **Why P0:** risk-high, needs-qa; the archive contains all members' personal data
**PRs:** [#678](https://github.com/wladku/Vereino/pull/678) · **Issues:** [#676](https://github.com/wladku/Vereino/issues/676)
**Route:** banner on every `/backend` page; `GET`/`POST /api/club_core/offboarding`, `/api/club_core/offboarding/export`
**Before you start:** Run `offboard-club` (S07 step 1) for the club you sign in to, local database only. Have an administrator and a treasurer of that club, with the UI in Polish.

**Steps**

1. Before the notice is recorded, sign in as administrator and browse a few `/backend` pages.
2. Run `offboard-club --slug <club>` and reload any `/backend` page at 375 px.
3. Press „Eksportuj dane klubu”. Leave the page and come back while it runs.
4. When it finishes press „Pobierz eksport” and unzip the file. Press „Eksportuj ponownie” once.
5. As the treasurer, open the same pages and try the three offboarding API calls.
6. Run `offboard-club --slug <club> --cancel` and reload.

**What to verify**

- [ ] Step 1 → no banner.
- [ ] Step 2 → banner „Klub kończy korzystanie z Vereino” with the deletion date, the privacy note about personal data, no horizontal scroll.
- [ ] Step 3 → „Przygotowujemy eksport…” status, one export at a time (a second start is refused with 409 `export_running`).
- [ ] Step 4 → „Eksport gotowy: {date}, {size}.”; the archive belongs to this club only; a newer export replaces the older one.
- [ ] Step 5 → the treasurer sees no banner action and gets 403 on the API calls.
- [ ] Step 6 → the banner disappears.

**What can go wrong**

- The banner shows for a club with no notice, or the export contains another club's rows.
- The download works for a non-administrator role.
- The export stays "preparing" forever (worker not picking the job up).

#### S09 · P0 — Administrator exports one person's data for an access or portability request

**Role:** administrator, treasurer (negative check) · **Device:** desktop · **Why P0:** risk-high, needs-qa, screenshots; personal data and an audit trail
**PRs:** [#609](https://github.com/wladku/Vereino/pull/609) · **Issues:** [#527](https://github.com/wladku/Vereino/issues/527)
**Route:** `/backend/people/persons/<id>` › tab „Dane” — panel „Zgłoszenia dotyczące danych”; `GET /api/people/persons/{id}/data-export`
**Before you start:** A person with groups, activities, charges and a guardian in the example club; a person in club B (S06) for the isolation check.

**Steps**

1. As the administrator open Ludzie › Osoby, pick the person, tab „Dane”.
2. Press „Eksportuj dane osobowe”. Open the downloaded `person-data-<date>.json`.
3. Check the flash message, then repeat once more.
4. As the treasurer open the same person record.
5. Call the export route with club B's person id while signed in as the club A administrator.

**What to verify**

- [ ] Step 2 → the file holds the person's data by section, `actorCounts`, `reviewRequired` and `omitted`; other people appear only as relations; the PESEL is present only if you hold the PESEL permission.
- [ ] Step 3 → „Eksport został pobrany i zapisany w rejestrze. Pola do sprawdzenia pod kątem danych innych osób przed wysłaniem: {count}.”; the button is disabled while running.
- [ ] Each export leaves one audit-log row (actor, role, person, purpose; no values).
- [ ] Step 4 → no „Eksportuj dane osobowe” button for the treasurer.
- [ ] Step 5 → 404 `person_not_found`, not 403.

**What can go wrong**

- Another club's person is exportable, or the file is cached (`no-store` missing).
- An export succeeds without the audit row.

#### S10 · P0 — Production image runs the mercato CLI and the Redis cache works

**Role:** operator · **Device:** desktop shell (Docker; local only) · **Why P0:** priority-high; before the fix staging and production pre-deploy and start were failing
**PRs:** [#733](https://github.com/wladku/Vereino/pull/733) · **Issues:** [#727](https://github.com/wladku/Vereino/issues/727)
**Route:** `scripts/image-smoke.sh`; `/api/healthz` of the container
**Before you start:** Docker is running. The script builds the `runner` stage and starts throwaway PostgreSQL and Redis containers.

**Steps**

1. From the repository root run `scripts/image-smoke.sh` (it builds the image; allow several minutes).
2. Read the output, then run the image by hand with `CACHE_STRATEGY=redis` and open `/api/healthz` and `/login`.
3. After the real staging deploy, check the deploy log for the pre-deploy step.

**What to verify**

- [ ] The script ends with `PASS: pre-deploy, initialize, app (Redis cache) and worker run from the runner image`.
- [ ] `/api/healthz` answers 200 and `/login` renders.
- [ ] No `Cannot find package 'react'` and no `Class constructor Redis cannot be invoked without 'new'` in the logs.

**What can go wrong**

- Pre-deploy fails in the runner image on a missing React or MikroORM package.
- `/api/healthz` answers 503 with the Redis cache on.

### P0 — Activities, training and medical certificates

#### S11 · P0 — Medical certificate expiry date needs consent, shows red/orange/green chips and sends reminders

**Role:** guardian, coach, administrator · **Device:** phone 375 px (guardian, coach), desktop (administrator) · **Why P0:** risk-high, needs-qa; health-related personal data stored behind explicit consent
**PRs:** [#705](https://github.com/wladku/Vereino/pull/705) · **Issues:** [#682](https://github.com/wladku/Vereino/issues/682)
**Route:** `/club/wards/[personId]` and `/club/profile` (member), `/club/groups/[id]` and `/club/occurrences/[id]/attendance` (coach), `/backend/people/persons/[id]` (admin) — „Profil i podopieczni”, „Grupy”
**Before you start:** A guardian with one minor ward in a group, a coach of that group with a session, and the administrator. The ward has no medical consent yet.

**Steps**

1. As the guardian open the ward page and find the section „Orzeczenie lekarskie (sport)”. Before consenting, check the date field and the hint „Datę można wpisać po udzieleniu zgody powyżej.”
2. Tick the consent („Zgadzam się, aby klub przechowywał datę ważności…”), enter a date within the next 30 days in „Ważne do” and tap „Zapisz datę”.
3. As the coach open the group page: the ward shows a chip like „Orzeczenie do {date} (wkrótce wygasa)”. Use the filter „Orzeczenie: nieważne” and open the session attendance page to see the same chips.
4. As the guardian change the date to a past day: the chip becomes „Orzeczenie wygasło {date}”. Then clear it with „Usuń datę”: the chip reads „Orzeczenie: brak”.
5. Set a valid date again, then withdraw the consent and confirm „Wycofaj i usuń datę” in the dialog „Wycofać zgodę?”.
6. As the administrator open the person record in `/backend/people/persons` and try to change the consent: it must be refused; the date field itself can be edited only while consent is in force.

**What to verify**

- [ ] Date field without consent → saving is refused (message „Datę można zapisać tylko wtedy, gdy osoba…”)
- [ ] Date within a month → orange chip, past date → red chip, no date → „Orzeczenie: brak”, far-future date → „Orzeczenie do {date}”
- [ ] Filter „Orzeczenie: nieważne” lists only red/missing players; empty list shows „Wszyscy tutaj mają ważne orzeczenie lekarskie.”
- [ ] Withdrawing consent → flash „Zgoda wycofana; data została usunięta.” and coaches see „brak”
- [ ] A coach cannot edit the date; the administrator cannot give or withdraw the ward's consent (403 message about „tylko sama osoba albo opiekun”)
- [ ] Reminder (in-app notification „Orzeczenie lekarskie wkrótce traci ważność”) reaches the guardian once a month before expiry and once on the expiry day

**What can go wrong**

- A date is stored or still visible to coaches after consent is withdrawn
- Chips missing or wrong colour on the attendance page or in the group list for wards of other guardians
- Reminders sent twice per threshold, or sent to the ward instead of the guardian

#### S12 · P0 — Match squad warns about players without a valid medical certificate

**Role:** coach · **Device:** phone 375 px · **Why P0:** risk-high (same PR #705); a warning that must never hide a player or block confirmation
**PRs:** [#705](https://github.com/wladku/Vereino/pull/705) · **Issues:** [#682](https://github.com/wladku/Vereino/issues/682)
**Route:** `/club/occurrences/[id]/attendance` — session of a match
**Before you start:** A match (event type match) with three players: one with a valid certificate, one expired, one with no date.

**Steps**

1. As the coach open the match session and its attendance/squad page.
2. Look at the „Skład meczowy” block.
3. Check the banner and each player's chip.
4. As the guardian of the expired player still confirm the player's participation.

**What to verify**

- [ ] Banner „Zawodnicy bez ważnego orzeczenia lekarskiego ({count}): {names}” names exactly the red and missing players
- [ ] Players who declared „no” are not counted in the banner
- [ ] The guardian can still confirm the red player (the warning is not a block)

**What can go wrong**

- Banner shows for an all-valid squad, or lists players outside the squad
- The banner is cut off or overflows at 375 px

#### S13 · P0 — Shared outline library: publish, copy, rate, report and the public page

**Role:** coach, administrator, guest · **Device:** phone 375 px, desktop for settings · **Why P0:** risk-high; cross-club data sharing, public page and a licence the lawyer has not confirmed
**PRs:** [#729](https://github.com/wladku/Vereino/pull/729) · **Issues:** [#685](https://github.com/wladku/Vereino/issues/685)
**Route:** `/club/training/library`, `/club/training/library/[entryId]`, `/club/training/outlines/[id]`, public `/library/o/[entryId]`, `/backend/club/settings` — „Ustawienia klubu”
**Before you start:** Library must be configured by the operator (see S29). Two clubs are ideal; with one club you can still publish and copy. A coach with a finished session using a copied outline.

**Steps**

1. As the administrator open „Ustawienia klubu” and set „Najszerszy poziom biblioteki konspektów” to „Publicznie”.
2. As a coach open an own outline; in „Udostępnianie” choose „Publicznie”, tick the terms („Akceptuję zasady biblioteki… CC BY-SA 4.0…”) and tap „Udostępnij”.
3. Open „Biblioteka konspektów”; search, sort („Najlepiej oceniane”, „Najnowsze”) and open the entry; check author credit and licence line.
4. Tap „Kopiuj do mojego klubu”, then on a session „Użyj w tym terminie”. Try to rate before the session is closed, then close the session and rate with the stars.
5. Tap „Strona publiczna” and open the public page logged out.
6. Tap „Zgłoś”, pick a reason and „Wyślij zgłoszenie”. Finally lower the club level to „Tylko w klubie” and check the entry disappears.

**What to verify**

- [ ] Publishing above the club level or without terms is refused („Twój klub nie pozwala udostępniać tak szeroko.”, „Zaakceptuj zasady biblioteki…”)
- [ ] Rating before use shows „Ocenisz go po zamknięciu terminu, w którym był użyty.”; after closing the session the rating saves („Ocena została zapisana.”)
- [ ] The public page shows no session, group, person names; the author name only when name consent exists, else only the club
- [ ] Copied image has no location or camera metadata
- [ ] Withdrawing or lowering the level removes the entry from library and public page („Ten konspekt jest niedostępny.”)
- [ ] Reports from three different clubs hide the entry

**What can go wrong**

- Public page leaks the source club's internal ids, children's names or exercise images with EXIF
- Without library configuration the pages show a generic error instead of „Biblioteka konspektów nie jest dostępna w tej instancji.”
- One club can rate repeatedly or rate without a use

### P0 — Groups, calendar, facilities and payments

#### S14 · P0 — Coach sends a cash handover; treasurer confirms or rejects it with a reason

**Role:** coach, treasurer (or administrator) · **Device:** phone 375 px (coach), desktop (treasurer) · **Why P0:** risk-high, priority-high, needs-qa; moves cash custody between people and changes who may confirm
**PRs:** [#795](https://github.com/wladku/Vereino/pull/795) · **Issues:** [#791](https://github.com/wladku/Vereino/issues/791)
**Route:** `/club/coach/payments`, `/club/cash-handovers`, `/backend/payments/cash-custody` — „Płatności moich grup”, „Przekazania do potwierdzenia”, „Finanse › Gotówka do rozliczenia”
**Before you start:** A coach of a group with a child who owes a fee, and a treasurer or club administrator account. Cash receipt numbers (KP) are needed, so accept cash from a parent as the coach first.

**Steps**

1. Sign in as the coach on a phone, open „Płatności moich grup” and tap „Przyjmij gotówkę” next to a child; accept a cash payment.
2. In the section „Gotówka u Ciebie” tap „Przekaż gotówkę”, tick the payments under „Wpłaty do przekazania” and tap „Wyślij przekazanie”. Confirm that „Czeka na potwierdzenie” appears with a handover number.
3. Sign in as the treasurer, open „Dziś” and find the row „Przekazania do potwierdzenia” (also at `/club/cash-handovers`). Open the handover.
4. Tap „Odrzuć”, enter a reason in „Co się nie zgadza?” and tap „Odrzuć przekazanie”. Switch back to the coach and read the reason.
5. As the coach send the handover again (or use „Wycofaj” once to test withdrawal, then send a new one). As the treasurer tap „Potwierdź”.
6. As the coach check that the amount under „Gotówka u Ciebie” dropped. As the treasurer or administrator open „Finanse › Gotówka do rozliczenia” and check the handover state.

**What to verify**

- [ ] Coach sends a handover → it shows „Czeka na potwierdzenie” and the same payments cannot be put into a second handover.
- [ ] Treasurer rejects without a reason → refused with „Opisz, co się nie zgadza.”; with a reason it is rejected.
- [ ] After rejection the coach sees „Powód: …” and the payments are again in „Wpłaty do przekazania”.
- [ ] After „Potwierdź” the coach's cash drops by the confirmed amount and the in-app notification bell shows the decision.
- [ ] A coach cannot open `/club/cash-handovers` or confirm a handover (no data, refusal).
- [ ] Opening the same handover as a treasurer in two tabs and deciding twice → the second decision is refused with „To przekazanie zostało już potwierdzone, odrzucone albo wycofane.”

**What can go wrong**

- The coach's cash amount changes at "send" instead of at "confirm", or does not return after a rejection.
- The „Dziś” tile counts or sums handovers wrongly („Czeka: {count} · {total}”).
- A confirmed handover can still be withdrawn, or a handover of another club or coach appears in the list.

### P1 — Sign-in, accounts and security

#### S15 · P1 — Sign in with Facebook, "no e-mail shared" and data deletion

**Role:** member, administrator · **Device:** phone 375 px · **Why P1:** priority-low, risk-medium, needs-qa; second provider on the new sign-in path
**PRs:** [#829](https://github.com/wladku/Vereino/pull/829) · **Issues:** [#567](https://github.com/wladku/Vereino/issues/567)
**Route:** `/login`, `/club/profile`, `/api/foundation/identity/facebook/deletion` — „Połączone konta”
**Before you start:** Needs Facebook app keys (`VEREINO_OAUTH_FACEBOOK_CLIENT_ID`, `VEREINO_OAUTH_FACEBOOK_CLIENT_SECRET`, `VEREINO_OAUTH_REDIRECT_BASE_URL`) and a Facebook test user; none of this can be exercised without them. The deletion callback needs a Facebook-signed request, so only its error page can be seen by hand (TEST-S03 covers the rest).

**Steps**

1. Without keys: open `/login` and confirm there is no Facebook button, and `/club/profile` offers no „Połącz Facebook”.
2. With keys: on `/club/profile` under „Połączone konta” tap „Połącz Facebook” and approve with a Facebook account that shares no e-mail.
3. Sign out and use „Zaloguj się przez Facebook” on `/login`.
4. Open the deletion page without a confirmation code (the page titled „Prośba o usunięcie danych”).
5. Disconnect Facebook from the profile.

**What to verify**

- [ ] No keys → no Facebook button and no connect option; Google behaviour unchanged.
- [ ] Linked identity without an e-mail shows „Nie udostępniono adresu e-mail”.
- [ ] Facebook sign-in lands in the member's account; an unlinked Facebook account gets the generic „Nie udało się zalogować tym kontem…” message.
- [ ] The deletion page without a code says „Otwórz link, który Facebook podał po złożeniu prośby, razem z kodem potwierdzenia.”
- [ ] Disconnect → „Odłączono Facebook.”

**What can go wrong**

- The Facebook connection stores or shows an e-mail it was never given.
- The token request fails against real Facebook because credentials are sent the wrong way.
- Google connections are lost or mislabelled after the provider table change.

#### S16 · P1 — Ordinary saves and orders still work after the command scope change

**Role:** administrator, guardian · **Device:** desktop and phone 375 px · **Why P1:** risk-high, needs-qa; touches every write; labels bug, priority-medium
**PRs:** [#794](https://github.com/wladku/Vereino/pull/794) · **Issues:** [#728](https://github.com/wladku/Vereino/issues/728)
**Route:** `/backend/people/persons`, messages, `/club` order link — „Osoby” → „Dodaj”; „Wiadomości”
**Before you start:** Demo data with an administrator, a guardian account and, if available, an open order campaign. Nothing visible changes; this is a smoke check of writes.

**Steps**

1. As administrator open any person, edit the note and save.
2. Add a new person via „Osoby” → „Dodaj”.
3. Open a message thread in „Wiadomości” and send a reply.
4. As the guardian, place an order in an open order campaign, if one exists.
5. Do two saves in different browser tabs at about the same time.

**What to verify**

- [ ] Person note save succeeds without an error banner.
- [ ] The new person appears on the list.
- [ ] The reply appears in the thread.
- [ ] The guardian's order is accepted.
- [ ] Concurrent saves both finish, with no hang or timeout.

**What can go wrong**

- A save hangs for a long time or ends with a 500 under several simultaneous writes (connection pool deadlock).
- A write is refused with a scope or permission error for a legitimate role.
- A foreign-club or unlinked account gets through (a cross-club regression).

#### S17 · P1 — One club never sees another club's records; a foreign id answers like an unknown one

**Role:** administrator of two clubs · **Device:** desktop shell · **Why P1:** priority-high, security, skip-qa (risk-medium); tenant isolation, found two real leaks
**PRs:** [#652](https://github.com/wladku/Vereino/pull/652) · **Issues:** [#628](https://github.com/wladku/Vereino/issues/628)
**Route:** `/api/<module>/…/{id}` of every module — no single screen
**Before you start:** Two clubs in one sandbox (a second club created by the operator command) with similar data, and an administrator token for club A. The automated `ISSUE-628-cross-club-isolation` test does the full route sweep; a manual check is only a spot check.

**Steps**

1. As club A's administrator, open a person from club A in `/backend/people/persons` and note its id.
2. Via the API with club A's token, request a club B record id (for example a person or activity id from club B).
3. Try an update and a delete on the same foreign id.
4. In the admin lists, look for any record that belongs to club B.

**What to verify**

- [ ] Reading a club B id as club A → 404 (not 403) with the same body as an unknown id.
- [ ] Update or delete of a club B id → 404 and nothing changes in club B.
- [ ] Club A lists contain only club A records, even when both clubs share a tenant.
- [ ] Club A's own records open and save normally.

**What can go wrong**

- A 403 or a different body on a foreign id, which confirms that the record exists.
- A list or export includes lookalike club B records.

#### S18 · P1 — Restoring a club archive refuses references outside the club

**Role:** operator · **Device:** desktop shell · **Why P1:** priority-high, security, needs-qa; fix of internal review finding U5-1 (risk-medium)
**PRs:** [#827](https://github.com/wladku/Vereino/pull/827) · **Issues:** [#806](https://github.com/wladku/Vereino/issues/806)
**Route:** shell: `yarn mercato club_core export-club` / `restore-club` — on a local or disposable database only, never production
**Before you start:** A disposable database with a club that was exported to a ZIP archive. A tampered archive is hard to craft by hand, so the refusal itself is covered by TEST-M07.

**Steps**

1. Export the example club with `yarn mercato club_core export-club` (flags as in `docs/ops/backups.md`, "Restoring one club").
2. Delete the club, or point at a scratch database.
3. Run `yarn mercato club_core restore-club --in <archive>.zip --dry-run`, then without `--dry-run`.
4. Open the restored club in the browser and sign in as its administrator.

**What to verify**

- [ ] The dry run reports what it would write and changes nothing.
- [ ] A genuine, untouched archive restores completely.
- [ ] Roles and people in the restored club have the same access as before, no extra grants.
- [ ] The administrator can sign in and sees the club's data.

**What can go wrong**

- A legitimate archive from before this change is refused.
- The restore writes grants or links that point at another club.

#### S19 · P1 — Resending an invitation uses the person's language

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium, risk-medium, skip-qa; visible in the e-mail text
**PRs:** [#688](https://github.com/wladku/Vereino/pull/688) · **Issues:** [#584](https://github.com/wladku/Vereino/issues/584)
**Route:** `/backend/people/persons` (person record) — „Osoby” → person → „Wyślij zaproszenie ponownie”
**Before you start:** Two invited people whose accounts are not yet activated, one with the Polish locale and one with English, and a way to read captured e-mails. The first invitation still follows the request language (accepted platform limit).

**Steps**

1. Set the administrator's UI to Polish.
2. Open the English-speaking invited person and choose „Wyślij zaproszenie ponownie”.
3. Open the captured e-mail.
4. Repeat for the Polish-speaking person.

**What to verify**

- [ ] E-mail for the English person is in English although the administrator works in Polish.
- [ ] E-mail for the Polish person is in Polish.
- [ ] The invitation link in each e-mail opens the password-setting page.
- [ ] A person without a locale gets the club's default language.

**What can go wrong**

- The e-mail follows the administrator's language instead of the person's.
- The resend fails with „Nie udało się wysłać e-maila z zaproszeniem. Spróbuj później.”

#### S20 · P1 — Dependency upgrade (zod 4.6.7) leaves validation and forms intact

**Role:** administrator, member · **Device:** desktop and phone 375 px · **Why P1:** priority-high, risk-high, security, needs-qa; every form and API validator uses zod
**PRs:** [#573](https://github.com/wladku/Vereino/pull/573) · **Issues:** [#454](https://github.com/wladku/Vereino/issues/454)
**Route:** forms in `/backend/**` and `/club/**` — for example „Osoby” → „Dodaj” and `/club/profile`
**Before you start:** Any signed-in sandbox account. This is a regression smoke of validation across forms.

**Steps**

1. Open „Osoby” → „Dodaj” and submit the empty form.
2. Fill it with an invalid e-mail and submit.
3. Fill it correctly and save.
4. Repeat an empty-field and valid submit on another form, for example the profile form on `/club/profile`.
5. Check the browser console during these steps.

**What to verify**

- [ ] Empty required fields → inline Polish validation messages, no crash.
- [ ] Invalid e-mail → field error, not a generic 500.
- [ ] Valid input saves normally.
- [ ] The console shows no schema or validation exceptions.

**What can go wrong**

- A validation message appears in English or as raw `Invalid input`.
- A previously valid payload is now rejected because of a changed zod behaviour.

### P1 — Many clubs, operator and privacy

#### S21 · P1 — E-mails link to the recipient's club address and are sent as "<club> via Vereino"

**Role:** coordinator (announcement author), member (recipient) · **Device:** desktop · **Why P1:** needs-qa, risk-high host change; same flow as S05
**PRs:** [#679](https://github.com/wladku/Vereino/pull/679) · **Issues:** [#631](https://github.com/wladku/Vereino/issues/631)
**Route:** the announcement composer of `communication` and the local mail outbox/log — menu path not confirmed (see Unresolved)
**Before you start:** The app runs as in S05 with `NOTIFICATIONS_EMAIL_FROM` set to any address; a way to read outgoing mail locally is needed (dev mail log or catcher).

**Steps**

1. As the example club's coordinator send a test announcement to one member with an e-mail address.
2. Open the delivered message in the local mail log.
3. Share a thread or a session from the app (the share link / share text).
4. Repeat with the club B account and compare.
5. Unset `VEREINO_CLUB_DOMAIN`, restart and send another announcement.

**What to verify**

- [ ] The message link starts with the recipient's club address (`<slug>.localhost:3000`), not `APP_URL`.
- [ ] The sender display name is "<club name> via Vereino" in front of the configured address, in the club's language.
- [ ] The thread share link and session share text use the club address.
- [ ] With the variable unset, links fall back to `APP_URL`.
- [ ] Password reset and account invitations still link to `APP_URL` (known gap, owner decision of option (c)).

**What can go wrong**

- A link points at another club's address or at the wrong host.
- A club name with quotes or line breaks breaks the `From` header.

#### S22 · P1 — Operator reads and retires the per-club job schedules (one sweep per job type)

**Role:** operator · **Device:** desktop shell (local or disposable database only, never production) · **Why P1:** risk-high, needs-qa; changes how every club's daily jobs are scheduled
**PRs:** [#663](https://github.com/wladku/Vereino/pull/663) · **Issues:** [#629](https://github.com/wladku/Vereino/issues/629)
**Route:** shell — `foundation club-jobs status|sweep`, `retire-club-schedules`, `restore-club-schedules`; runbook `docs/ops/deploy.md` (per-club jobs)
**Before you start:** Two clubs (the example club and one from S06) and a running worker.

**Steps**

1. `yarn mercato foundation club-jobs status`.
2. `yarn mercato foundation retire-club-schedules --dry-run`, then without `--dry-run`.
3. `yarn mercato foundation club-jobs status` again, then `club-jobs sweep` and wait one 5-minute tick.
4. Change the example club's time zone in the club settings and check `status`.
5. `yarn mercato foundation restore-club-schedules --job <one key from status>`.

**What to verify**

- [ ] Step 2 → the dry run lists what would change and writes nothing.
- [ ] Step 3 → job state exists for every club and job type; `scheduled_jobs` holds one system-scope row per job type and none per club.
- [ ] A due job runs for each club once per local day and records the next due time; a failing club does not stop the other.
- [ ] Step 4 → the daily jobs of that club move to the new local time.
- [ ] Step 5 → the per-club schedule of that job type returns (rollback).

**What can go wrong**

- A job runs twice for one club in a day or never runs after retirement.
- The command output exposes more than ids, scope and counts.

#### S23 · P1 — Per-club request budget, one import at a time, fair e-mail pacing

**Role:** administrator, operator · **Device:** desktop + shell (local or disposable database only, never production) · **Why P1:** priority-medium, risk-medium; found a deadlock in attendance declaration
**PRs:** [#726](https://github.com/wladku/Vereino/pull/726) · **Issues:** [#633](https://github.com/wladku/Vereino/issues/633)
**Route:** `/backend/people/imports`; attendance declaration and marking; `docs/ops/capacity.md`
**Before you start:** Two clubs. Optionally set `VEREINO_CLUB_RATE_LIMIT_POINTS=5` and `VEREINO_CLUB_RATE_LIMIT_DURATION=60` to see the budget quickly.

**Steps**

1. With the low budget, make more than 5 authenticated API calls from club A within a minute, then one from club B.
2. In club A start a people import commit (Ludzie › Importy) and, from a second window, start another import commit.
3. Send an announcement to many recipients in club A and then a small one in club B.
4. Declare and mark attendance on a session in quick succession.

**What to verify**

- [ ] Step 1 → club A gets 429 after the budget; club B is unaffected.
- [ ] Step 2 → the second concurrent import answers 409 `import_running`.
- [ ] Step 3 → club B's mail goes out without waiting for club A's large announcement.
- [ ] Step 4 → declaring and marking attendance never hangs or times out.

**What can go wrong**

- One club's burst blocks another club's requests.
- Public routes count all clubs together; attendance calls hang for 60 s.

#### S24 · P1 — People import commit shows progress and rolls back cleanly

**Role:** administrator · **Device:** phone 375 px · **Why P1:** needs-qa, risk-medium; the commit now runs inside a progress job
**PRs:** [#625](https://github.com/wladku/Vereino/pull/625) · **Issues:** [#585](https://github.com/wladku/Vereino/issues/585)
**Route:** `/backend/people/imports/<id>` — Ludzie › Importy
**Before you start:** A CSV with about 6 rows (new, matched, one error, one needing review); the review row decided.

**Steps**

1. Upload the file in Ludzie › Importy and open the import.
2. Press „Zatwierdź import” and confirm.
3. Watch the page during the commit at 375 px.
4. Press commit on the same import again.

**What to verify**

- [ ] Step 3 → a progress bar with „Zatwierdzanie importu: {processed} z {total} wierszy” (a small file may finish too fast to see; a larger file helps).
- [ ] After completion → „Import został zatwierdzony.” and the created persons exist.
- [ ] Step 4 → refused: „Ten import został już zatwierdzony.”
- [ ] No cell value appears in the progress job's error text.

**What can go wrong**

- Progress stays at 0 or the bar never disappears.
- Import stays half-committed when the progress service is down (it should answer „Import nie mógł raportować postępu, więc niczego nie zatwierdzono. Spróbuj ponownie za chwilę.”).

#### S25 · P1 — Retention sweep closes open erasure requests

**Role:** operator, administrator · **Device:** desktop shell (local or disposable database only, never production) · **Why P1:** risk-medium; changes who is anonymised and what a queue shows
**PRs:** [#643](https://github.com/wladku/Vereino/pull/643) · **Issues:** [#564](https://github.com/wladku/Vereino/issues/564)
**Route:** shell — `yarn mercato people retention-sweep --tenant <id> --org <id> [--dry-run [--today YYYY-MM-DD]]`; the erasure request queue in the person record
**Before you start:** A former participant past the retention period who also has an open erasure request. Ids of the example club's tenant and organization.

**Steps**

1. Run `retention-sweep --dry-run --today <future date>` for the club.
2. Run it with `--today <date>` but without `--dry-run`.
3. Run the real sweep (no `--today`), twice in parallel in two terminals.
4. Open the person's erasure request in the admin panel.

**What to verify**

- [ ] Step 2 → exit 1 with usage text (`--today` needs `--dry-run`).
- [ ] Step 3 → both runs print `failed: 0`; together the person is anonymised once.
- [ ] Step 4 → the request is closed as done, not left open; processing it again returns 409.

**What can go wrong**

- A request stays open in the queue after the person is anonymised.
- An overlapping run reports a failure for a person the other run already anonymised.

#### S26 · P1 — Module CLIs exit 1 after usage errors; ACL sync runs only when role defaults change

**Role:** operator · **Device:** desktop shell (local or disposable database only, never production) · **Why P1:** risk-low (#658) and risk-medium (#675); deploy scripts rely on exit codes
**PRs:** [#658](https://github.com/wladku/Vereino/pull/658), [#675](https://github.com/wladku/Vereino/pull/675) · **Issues:** [#642](https://github.com/wladku/Vereino/issues/642), [#673](https://github.com/wladku/Vereino/issues/673)
**Route:** shell — module CLIs of `activities`, `club_core`, `facilities`, `groups`, `payments`, `people`; `foundation sync-role-acls-if-changed`; `scripts/railway-predeploy.sh`
**Before you start:** Local database with the example club.

**Steps**

1. Run `yarn mercato groups` and `yarn mercato people retention-sweep` (no required options); after each, run `echo $?`.
2. Run `yarn mercato foundation sync-role-acls-if-changed --force`.
3. Run it again without `--force`.
4. Run it with an unknown option and check `echo $?`.

**What to verify**

- [ ] Step 1 → usage text on stderr and exit code 1 (never 0).
- [ ] Step 2 → JSON `status: synced` and a stored hash.
- [ ] Step 3 → `status: skipped`, `reason: unchanged`; no tenant is visited.
- [ ] Step 4 → usage error and exit 1.

**What can go wrong**

- A usage error still exits 0 and a deploy script treats it as success.
- The sync is skipped after a change of role defaults, so a club misses a new feature.

#### S27 · P1 — Enterprise licence status CLI and a rejected test key

**Role:** operator · **Device:** desktop shell (local or disposable database only, never production) · **Why P1:** priority-medium, risk-medium; licence gate, nothing loads yet
**PRs:** [#723](https://github.com/wladku/Vereino/pull/723) · **Issues:** [#649](https://github.com/wladku/Vereino/issues/649)
**Route:** shell — `yarn mercato foundation licence-status [--now <ISO>]`; `docs/ops/deploy.md` (*Enterprise licence keys*)
**Before you start:** None; the test key pair is a CI fixture under `packages/app/.ai/qa/fixtures/`.

**Steps**

1. Run `yarn mercato foundation licence-status` with no variables set.
2. Set `VEREINO_LICENCE_KEYS` to a made-up string and rerun.
3. Set it to a key signed with the test key pair (`test-2026-1`) with `VEREINO_CI` unset, then rerun.

**What to verify**

- [ ] Step 1 → one JSON line, every feature `off`, read-only exit 0.
- [ ] Step 2 → the key is rejected with a reason (`wrong_prefix` or `malformed`) and is never printed.
- [ ] Step 3 → the test-signed key shows `unknown_kid` and features stay `off`.

**What can go wrong**

- The key text appears in the output or logs.
- A test-signed key switches a feature on outside CI.

### P1 — Activities, training and medical certificates

#### S28 · P1 — Training outline: write on the phone, attach to a session, print as PDF in the PZPN layout

**Role:** coach · **Device:** phone 375 px (editor, session card), desktop (print preview) · **Why P1:** needs-qa, risk-medium; new module with a new menu entry
**PRs:** [#706](https://github.com/wladku/Vereino/pull/706) · **Issues:** [#683](https://github.com/wladku/Vereino/issues/683)
**Route:** `/club/training/outlines`, `/club/training/outlines/new`, `/club/training/outlines/[id]`, `/club/training/outlines/[id]/print`, `/club/occurrences/[id]` — „Więcej” → „Konspekty treningów”
**Before you start:** A coach linked to a person, with an upcoming session of a group they coach and, ideally, a recurring activity.

**Steps**

1. In the member menu open „Więcej” → „Konspekty treningów” and tap „Nowy konspekt”.
2. Fill „Temat”, „Cel główny”, add an exercise in „Część wstępna” and one in „Część główna” (name, „Minuty”, „Organizacja”, „Uwagi metodyczne”), upload a JPEG as „Obraz”, then „Zapisz”.
3. Open an upcoming session page: in the card „Konspekt” tap „Wybierz konspekt” → „Skopiuj do tego terminu”.
4. Edit the original outline and save; reopen the session card and confirm the session copy did not change.
5. Open the outline's print page, tap „Drukuj / zapisz jako PDF” and inspect the preview („Konspekt zajęć treningowych”). Switch „Język wydruku” to Angielski and print again.
6. As another coach open the first coach's outline URL.

**What to verify**

- [ ] The saved outline appears in the list under „Moje konspekty” with the kind „Mój konspekt”
- [ ] Session card shows the copy; editing the source does not change it (series outline note „To konspekt cyklu…”)
- [ ] Print preview shows PZPN-style sheet with „Klub”, „Drużyna”, „Trener”, „Data i godzina”, part tables; nothing else in print media
- [ ] A stale save from a second tab ends in a conflict message, not a silent overwrite
- [ ] Another coach is refused; the card is hidden from members who are not session staff

**What can go wrong**

- Image upload larger than 5 MB or non-JPEG/PNG/WebP not rejected with the message
- Session older than 72 h still editable instead of „tylko do odczytu”
- The phone editor overflows horizontally at 375 px

#### S29 · P1 — Operator sets up and moderates the outline library

**Role:** operator · **Device:** desktop shell · **Why P1:** risk-high PR, but shell-only setup; local or disposable database only, never production
**PRs:** [#729](https://github.com/wladku/Vereino/pull/729) · **Issues:** [#685](https://github.com/wladku/Vereino/issues/685)
**Route:** shell: `yarn mercato training library-init`, `yarn mercato training library-moderate`
**Before you start:** A local sandbox database and the `VEREINO_LIBRARY_TENANT_ID`, `VEREINO_LIBRARY_ORGANIZATION_ID`, `VEREINO_LIBRARY_RATER_SECRET` variables set (see `packages/app/.env.example`).

**Steps**

1. With the variables unset open `/club/training/library`: expect the „niedostępna” message.
2. Set the variables and run `yarn mercato training library-init` once; run it a second time.
3. Reload the library page; it now opens empty („Nikt jeszcze nie udostępnił konspektu.”).
4. After a reported entry, run `yarn mercato training library-moderate` (check `--help` for arguments).

**What to verify**

- [ ] Second `library-init` is harmless (idempotent)
- [ ] The library tenant has no users or roles and cannot be signed in to
- [ ] Moderation restores or hides an entry as the command reports

**What can go wrong**

- Init creates a second library tenant or fails on rerun
- Moderate command changes entries of a real club

#### S30 · P1 — Administrator reopens a done session with a reason

**Role:** administrator (and coordinator/coach for the refusal) · **Device:** desktop · **Why P1:** needs-qa, risk-medium; reverses a closed session
**PRs:** [#694](https://github.com/wladku/Vereino/pull/694) · **Issues:** [#588](https://github.com/wladku/Vereino/issues/588)
**Route:** `/backend/activities/occurrences/[id]` — „Zajęcia” → „Terminy”
**Before you start:** A session with status „Odbyty” that has recorded attendance and a score.

**Steps**

1. As the administrator open the done session record and find the button „Otwórz ponownie”.
2. In the dialog „Otworzyć ponownie ten termin?” enter a 2-character „Powód” and confirm: expect „Podaj powód (co najmniej 3 znaki).”
3. Enter a proper reason and tap „Otwórz ponownie”; expect the flash „Termin ponownie otwarty.”
4. Open the coach attendance page, check that attendance and score are kept, change one status and close the session again.
5. Sign in as a coordinator and as a coach and open the same session.

**What to verify**

- [ ] Session returns to „Zaplanowany” with attendance and score intact; the reason appears in the history („Ponowne otwarcie terminu”)
- [ ] Only done sessions offer the button; coordinator and coach never see it
- [ ] Undo from the history returns the session to „Odbyty” only while it is still planned
- [ ] While reopened the session is left out of coach-units and place reports
- [ ] Existing „Przywróć termin” dialog for cancelled sessions still works

**What can go wrong**

- Reopen creates a conflict with another session of the same coach/place without a 409 list
- Members get a change notification for the reopen

#### S31 · P1 — Per-section report of declarations made in Vereino

**Role:** administrator, coordinator, coach · **Device:** desktop · **Why P1:** needs-qa, risk-medium; the product's primary metric
**PRs:** [#828](https://github.com/wladku/Vereino/pull/828) · **Issues:** [#818](https://github.com/wladku/Vereino/issues/818)
**Route:** `/backend/activities/reports/declaration-share` — „Zajęcia” → „Deklaracje w Vereino”
**Before you start:** Several sections with done sessions, some declarations made by members/links and some entered by staff, and one section with no done session.

**Steps**

1. As the administrator open „Deklaracje w Vereino”; the default period is „Ostatnie 28 dni”.
2. Switch „Okres” to „Miesiąc” and to „Zakres dat”, set „Od” later than „Do” and then a range over a year.
3. Compare the numbers of one section with the attendance data of its done sessions.
4. Sign in as a coordinator; then as a coach.

**What to verify**

- [ ] Each section shows „{declared} z {total} ({percent}%) zadeklarowanych w Vereino”, the absences column and the total „Łącznie w Vereino”
- [ ] Staff entries do not count; a personal-link declaration before start counts
- [ ] A section without done sessions reads „Brak odbytych terminów”, not 0 %
- [ ] Invalid range shows „Wybierz zakres najwyżej 12 miesięcy…”
- [ ] Coordinator sees only own sections; coach/guardian is refused (403 / no menu entry)

**What can go wrong**

- Cancelled or not yet done sessions inflate the denominator
- Percentages wrong at the month boundary because of the club time zone

#### S32 · P1 — PZPN schedule and attendance CSV exports

**Role:** coach, coordinator, administrator · **Device:** phone 375 px, desktop to open the CSV · **Why P1:** needs-qa; files copied into an external academy system
**PRs:** [#696](https://github.com/wladku/Vereino/pull/696) · **Issues:** [#684](https://github.com/wladku/Vereino/issues/684)
**Route:** `/club/reports/pzpn`, linked as „Eksport do PZPN” from the club group page — „Grupy”
**Before you start:** A team with sessions (training, a cancelled one, a match) and attendance recorded in the chosen month.

**Steps**

1. As a coach open a coached group and tap „Eksport do PZPN”; the team is preselected.
2. Keep the period at the current month and tap „Harmonogram (CSV)”, then „Lista obecności (CSV)”.
3. Open both files in a spreadsheet; check encoding, separator and columns.
4. Set „Od” after „Do”, then a period over a year.
5. Sign in as a coach of another group and as an administrator.

**What to verify**

- [ ] Files open with Polish characters and `;` separator in the Polish UI; columns match („Rodzaj wydarzenia”, „Nazwa / cel ogólny”, „Nazwisko”, „Data urodzenia”)
- [ ] Event types and statuses are Polish („Trening”, „Zaplanowane”/„Odwołane”, „Obecny”/„Usprawiedliwiony”/„Nieobecny”)
- [ ] Invalid period shows „Wybierz okres nie dłuższy niż rok…” and no file is produced
- [ ] A team you do not coach answers like an unknown team; administrator sees any team
- [ ] A session moved to another day appears on its new date

**What can go wrong**

- Garbled Polish letters (missing BOM) or wrong separator in Excel
- Birth dates or names of players of another team appear in the file

### P1 — Groups, calendar, facilities and payments

#### S33 · P1 — Calendars switch between Day, Week and Month with the view and day kept in the address

**Role:** member, guest, coordinator, administrator · **Device:** phone 375 px and desktop · **Why P1:** needs-qa, risk-medium; one shared switch on every calendar view, changed defaults and an additive public API
**PRs:** [#796](https://github.com/wladku/Vereino/pull/796) · **Issues:** [#784](https://github.com/wladku/Vereino/issues/784)
**Route:** `/club/calendar`, `/club/calendar?as=coordinator`, `/club/places/<place>`, `/p/<club slug>/places/<place slug>`, `/backend/facilities/calendar` — „Kalendarz”, „Obiekt › Kalendarz”
**Before you start:** The example club with sessions and facility bookings in the current and the next month; a place with the public calendar switched on.

**Steps**

1. On a phone open the public calendar of a place (`/p/<club slug>/places/<place slug>`). It should open on „Dzień”. Tap „Tydzień” and „Miesiąc”, then „‹ Wcześniej”, „Dziś”, „Później ›”.
2. On a desktop open the same page: it should open on „Tydzień” (seven cells). Reload and check the address keeps the range and day; open an old `?month=YYYY-MM` link and check it opens that month.
3. As a member open `/club/calendar`: check „Najbliższe”, „Dzień”, „Tydzień”, „Miesiąc”. On an empty day look for „Następny dzień”.
4. As the coordinator open `/club/calendar?as=coordinator`: switch Day, Week, Month and Agenda. Check that the week starts on Monday in Polish and English and that a section filter survives the switch.
5. As an administrator open „Obiekt › Kalendarz” (`/backend/facilities/calendar`) on a desktop: Week shows seven day axes on one hour scale; click a day heading (opens that day) and a free hour (opens the slot dialog). Shrink the window below the `lg` breakpoint and check a list of days replaces the axes.

**What to verify**

- [ ] Phone opens on „Dzień”, a wide screen on „Tydzień”, unless the address names a `range`.
- [ ] The active range button is marked and the buttons are easy to tap (44 px) on 375 px.
- [ ] Earlier / Today / Later move by one day, week (Monday to Sunday) or calendar month.
- [ ] Month in the facility calendars is a list of days, not a grid.
- [ ] Month of October (clock change) and a 31-day month load fully, without an error.

**What can go wrong**

- Weeks start on Sunday in English, or a drill-down from Month or Week lands on a wrong day.
- The public calendar shows the wrong window when the browser's date differs from the club's date.
- Old links with `?month=` or `?from=&to=` open an empty page or the wrong range.

#### S34 · P1 — Group places limit, sign-up switch and sign-up settings (nothing public yet)

**Role:** administrator, coordinator, coach · **Device:** desktop (settings, group tab), phone 375 px (member group page) · **Why P1:** needs-qa, risk-medium; new fields, three additive migrations, new settings
**PRs:** [#813](https://github.com/wladku/Vereino/pull/813) · **Issues:** [#798](https://github.com/wladku/Vereino/issues/798)
**Route:** `/backend/groups/groups`, `/backend/club/settings` — „Zajęcia › Grupy”, „Ustawienia klubu”
**Before you start:** A group with several active participants and a coach; the group has a „Strona publiczna” tab.

**Steps**

1. Open „Zajęcia › Grupy”, open a group and its tab „Strona publiczna”. Set „Limit miejsc” to a number below the participant count, check „Przyjmuje zgłoszenia”, save.
2. Check the group record header, the groups list and (on a phone) the member group page show „Miejsca: {places}” (shown as x / limit); coaches are not counted.
3. Try „Limit miejsc” `0`, `501` and `abc` → expect „Wpisz pełną liczbę od 1 do {max} albo zostaw puste.”; clear the field to remove the limit.
4. Add one more participant by hand above the limit; the add is allowed and the count reads like `19 / 18`.
5. Open „Ustawienia klubu”. Change „Dzień ustalania wieku” (try 29 February), „Czas na odpowiedź (dni)” (try 0 and 61) and „Informacja dla kandydatów” (end of the „Treść zgód” group); save and reload.
6. Roll a season over (copy groups) and check the limit and „Przyjmuje zgłoszenia” are copied.

**What to verify**

- [ ] Limit 1–500 saves; an invalid value is refused and nothing is saved.
- [ ] „Miejsca: {places}” (shown as x / limit) matches the number of distinct active participants in every place it shows.
- [ ] 29 February is refused with „Ten miesiąc nie ma takiego dnia. Wybierz dzień, który jest w każdym roku.”; defaults are 1 September and 7 days.
- [ ] An empty „Informacja dla kandydatów” keeps the built-in text; a long text over 6000 characters is refused.
- [ ] The section field „Przyjmuje zgłoszenia online” is not visible yet and no public page shows a sign-up button.

**What can go wrong**

- The group count includes coaches or ended memberships, or a participant in two roles is counted twice.
- Saving the group tab or settings form drops the new fields or returns a 409 for no visible reason.
- Undoing a group edit does not restore the previous limit.

#### S35 · P1 — Bulk move of children: the "Fits" filter preselects by the category's birth years

**Role:** administrator, coordinator · **Device:** desktop · **Why P1:** needs-qa, risk-medium; changes who is preselected in a bulk move
**PRs:** [#612](https://github.com/wladku/Vereino/pull/612) · **Issues:** [#601](https://github.com/wladku/Vereino/issues/601)
**Route:** `/backend/groups/groups` — „Zajęcia › Grupy”, group „Skład”, action „Przenieś do innej grupy”
**Before you start:** A team with an age category that has a "U" range (e.g. U8–U9), a season, and a source group with children born in and just outside those birth years; one non-team target group with an age range.

**Steps**

1. Open the source group, tab „Skład”, select several children and choose „Przenieś do innej grupy” („Przenieś dzieci do innej grupy”).
2. Pick the target team with the U category. Look at the chip „Pasuje do {group} (rocznik {years})” and the „Pasuje” tags.
3. Use the filter to preselect the children that fit; check the selection against the birth years.
4. Pick the non-team target group with an age range; check the chip reads „Pasuje do {group} ({from}–{to} lat)” and the fit follows age on the move date.
5. Change the move date across the season boundary and observe the birth years change.

**What to verify**

- [ ] For a U-team the preselected children are exactly those born in the listed birth years, not by age in years.
- [ ] For a normal group the fit follows age on the move date.
- [ ] A group with no rule shows no chip and no preselection.
- [ ] The move itself still works for children outside the rule (a warning at most).

**What can go wrong**

- A child born one year off is preselected (age used instead of birth year).
- The reference season is wrong, so the birth years are shifted by one.

#### S36 · P1 — Closure or maintenance notice opens "Needs a new time" for a coordinator

**Role:** coordinator, coach · **Device:** desktop shell and phone 375 px (e-mail link) · **Why P1:** bug fix, skip-qa, priority-medium; the e-mail button goes to the right view per role
**PRs:** [#613](https://github.com/wladku/Vereino/pull/613) · **Issues:** [#597](https://github.com/wladku/Vereino/issues/597)
**Route:** `/club/calendar?as=coordinator&view=reschedule` and the place's day filtered „Do przeniesienia”
**Before you start:** A section with a coordinator and a coach who both have sessions in one place; the sandbox shows e-mails in a preview (no real e-mail is sent).

**Steps**

1. As an administrator, create a closure of that place covering the sessions' dates („Obiekt › Zamknięcia” area).
2. Open the e-mail preview of the notice sent to the section coordinator.
3. Click the button „Otwórz terminy do przełożenia”.
4. Open the notice sent to a coach (not a coordinator) and click its link.

**What to verify**

- [ ] The coordinator's link opens the section calendar's reschedule view („Do przełożenia”) narrowed to the section named in the notice.
- [ ] The coach's link opens the place's day filtered „Do przeniesienia”, not the coordinator view.
- [ ] A notice queued before the update still opens the fallback view and does not error.

**What can go wrong**

- The coordinator gets "forbidden" or an empty calendar from the link.
- The link carries a wrong section, or more than two sections break the URL.

#### S37 · P1 — Daily charge generation no longer records an empty month

**Role:** operator, treasurer · **Device:** desktop shell and desktop · **Why P1:** bug fix, skip-qa, priority-medium; a club without fee data was never generated later
**PRs:** [#669](https://github.com/wladku/Vereino/pull/669) · **Issues:** [#666](https://github.com/wladku/Vereino/issues/666)
**Route:** `/backend/payments/generations` — „Finanse › Generowania”, „Generuj okres”
**Before you start:** On a local or disposable database only, never production. A freshly created club with no fee schedules or rosters, and a way to trigger the scheduled job `payments.charges.generate_due` (see the payments README, `docs/ops/clubs.md` step 6).

**Steps**

1. In the empty club run the daily job `payments.charges.generate_due` once. Open „Finanse › Generowania”.
2. Add a fee schedule and put a child in a group, then run the daily job again for the same month.
3. In another club run a manual „Generuj okres” on an empty month and open „Generowania”.

**What to verify**

- [ ] Step 1 adds no row to „Generowania” (list still shows „Nie wygenerowano jeszcze żadnych należności.”).
- [ ] Step 2 generates charges for the month and adds one row.
- [ ] A manual run on an empty month is still recorded.
- [ ] Undoing a generated month still counts it as generated (no second automatic run).

**What can go wrong**

- A row with 0 charges appears after the daily run and blocks the month.
- The daily run generates a month twice.

### P2 — Many clubs, operator and privacy

#### S38 · P2 — Sending-subdomain DNS check

**Role:** operator · **Device:** desktop shell · **Why P2:** priority-high label, but a check script and runbook only; no data touched
**PRs:** [#824](https://github.com/wladku/Vereino/pull/824) · **Issues:** [#821](https://github.com/wladku/Vereino/issues/821)
**Route:** shell — `yarn ops:mail-dns <subdomain> [--from <address>] [--policy quarantine]`; runbook `docs/ops/email.md`
**Before you start:** Network access for DNS lookups.

**Steps**

1. Run `yarn ops:mail-dns` without arguments.
2. Run `yarn ops:mail-dns mail.vereino.org`.
3. Add `--from <an address outside mail.vereino.org>` and `--policy quarantine`.

**What to verify**

- [ ] Step 1 → usage text and exit 2.
- [ ] Step 2 → every missing or wrong record is named (DKIM, SPF, Return-Path MX, DMARC `rua=`) and exit 1 until the owner has set DNS; exit 0 once all are right.
- [ ] Step 3 → the foreign from-address is reported as outside the verified domain.

**What can go wrong**

- A DNS failure is reported as a pass.
- The output names no record to fix.

#### S39 · P2 — Key store boot guard

**Role:** operator · **Device:** desktop shell · **Why P2:** priority-high, risk-medium, security; no behaviour change while `VEREINO_KEY_STORE` is unset
**PRs:** [#826](https://github.com/wladku/Vereino/pull/826) · **Issues:** none
**Route:** shell — app boot check (`packages/app/scripts/vereino-boot-env.mjs`); `docs/ops/key-store.md`
**Before you start:** A local start command that runs the boot check, as the production start does.

**Steps**

1. Start the app with no key store variables.
2. Start with `VEREINO_KEY_STORE=derived` and `VAULT_ADDR=http://x`.
3. Start with `VEREINO_KEY_STORE=vault` and none of the Vault variables.
4. Start with `VEREINO_KEY_STORE=vault`, all Vault variables and `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` set.

**What to verify**

- [ ] Step 1 → boots as before.
- [ ] Step 2 → refused (mixed state).
- [ ] Steps 3 and 4 → refused, naming the missing or forbidden variable without printing values.

**What can go wrong**

- The guard lets a mixed or incomplete Vault configuration start.
- A secret value appears in the refusal message.

### P2 — Activities, training and medical certificates

#### S40 · P2 — Sessions list keeps its rows while it refetches

**Role:** administrator · **Device:** desktop · **Why P2:** skip-qa, risk-low; flake fix visible only as a steadier list
**PRs:** [#704](https://github.com/wladku/Vereino/pull/704) · **Issues:** [#653](https://github.com/wladku/Vereino/issues/653)
**Route:** `/backend/activities/occurrences?perspective=unassigned` — „Zajęcia” → „Terminy” → „Do obsadzenia”
**Before you start:** At least one session without a coach and a started session in the list.

**Steps**

1. Open the „Do obsadzenia” view and open a row menu immediately after the page loads.
2. Switch views („Najbliższe”, „Nierozliczone”), change a filter and a page.
3. Open the row menu of a session that has already started.

**What to verify**

- [ ] Rows stay on screen while a new filter or page loads; the open menu does not disappear
- [ ] „Przypisz zastępstwo” (the substitute action) remains reachable in the row menu
- [ ] Started sessions offer the row actions for started sessions

**What can go wrong**

- Rows flash empty on scope change
- Every session is treated as not started, so wrong row actions appear

#### S41 · P2 — Long club name does not cover the public header links

**Role:** guest · **Device:** phone 375 px and desktop (768 px and wider) · **Why P2:** needs-qa, priority-low; cosmetic layout fix
**PRs:** [#680](https://github.com/wladku/Vereino/pull/680) · **Issues:** [#488](https://github.com/wladku/Vereino/issues/488)
**Route:** public club page (P-01), e.g. the club home page — header with menu and language switcher
**Before you start:** A club with a very long name (60 characters or more) in club settings; try Polish and English.

**Steps**

1. Open the public club page at 1440 px and at 768 px.
2. Hover the shortened club name.
3. Narrow to 375 px and scroll the header links.
4. Switch language and the dark theme.

**What to verify**

- [ ] From 768 px the header is one row; the name is cut with an ellipsis and every link is fully visible
- [ ] Full name appears as the tooltip; clicking logo or name goes home, empty space does not
- [ ] At 375 px the links sit in a second, horizontally scrollable row and all can be reached

**What can go wrong**

- A link is hidden under the name or pushed out of the scroll area
- Header wraps to two rows at 768-1000 px

### P2 — Groups, calendar, facilities and payments

#### S42 · P2 — Maintenance refusal names the current panel path

**Role:** member (not a maintainer) · **Device:** phone 375 px · **Why P2:** bug fix, skip-qa, priority-low; wording only
**PRs:** [#668](https://github.com/wladku/Vereino/pull/668) · **Issues:** [#667](https://github.com/wladku/Vereino/issues/667)
**Route:** `/club/places/maintenance` — member page „Konserwacja”
**Before you start:** A signed-in member who is not a maintainer of any place; test with the UI in Polish and then English.

**Steps**

1. Open `/club/places/maintenance` on a phone.
2. Read the refusal text. Switch the language to English and read it again.

**What to verify**

- [ ] Polish text contains the path „Obiekt › Dziennik i incydenty › Konserwacja › Opiekunowie”.
- [ ] English text contains „Facility › Log and incidents › Maintenance › Maintainers”.
- [ ] As administrator the path exists in the menu exactly as written.

**What can go wrong**

- A literal `{path}` placeholder is shown in the text.
- The path still names the removed „Obiekty → Konserwacja” menu.

#### S43 · P2 — `yarn dev` stops on low inotify limits (developer tooling)

**Role:** operator · **Device:** desktop shell · **Why P2:** bug fix, skip-qa; developer workflow only, Linux/WSL2
**PRs:** [#815](https://github.com/wladku/Vereino/pull/815) · **Issues:** [#808](https://github.com/wladku/Vereino/issues/808)
**Route:** shell: `yarn dev`
**Before you start:** A Linux or WSL2 machine whose inotify limits are low and cannot be raised without a password (on a local or disposable setup only).

**Steps**

1. Run `yarn dev` with the low inotify limits.
2. Read the message, run `yarn dev:fix-wsl-watchers` as it advises, then run `yarn dev` again.

**What to verify**

- [ ] `yarn dev` stops at the preflight and names `yarn dev:fix-wsl-watchers` instead of starting with webpack.
- [ ] After the fix command, `yarn dev` starts on Turbopack.
- [ ] With sufficient limits `yarn dev` starts as before.

**What can go wrong**

- `yarn dev` silently falls back to webpack and the app answers HTTP 500.
- The failure message does not tell you to start `yarn dev` again.

## No manual check needed

Merged PRs without a user-visible change. The automated gate covers them, so they get no scenario.

- [#559](https://github.com/wladku/Vereino/pull/559) test(platform): ENG-TEST-11 asserts a public club route keeps public s-maxage=60 (#557) — test only, no product change
- [#571](https://github.com/wladku/Vereino/pull/571) test(groups): TEST-L22 runs again, its axe scans wait for the buttons' fade (#433) — test-only change
- [#572](https://github.com/wladku/Vereino/pull/572) fix(groups): age range editors keep typed values when the list reloads; TEST-L23 runs again (#545) — race fix, covered by TEST-L23 integration test
- [#608](https://github.com/wladku/Vereino/pull/608) docs(specs): close-out III — open acceptance criteria ticked from evidence or linked to gap issues (#568) — documentation only
- [#611](https://github.com/wladku/Vereino/pull/611) test(activities): the coach saves attendance and records a score on his club event part (#606) — test-only change
- [#614](https://github.com/wladku/Vereino/pull/614) test(activities): TEST-T01 counts the cancellation notices per part (#605) — test-only change
- [#615](https://github.com/wladku/Vereino/pull/615) test(facilities): TEST-R09 proves the renter's expiry e-mail and the partly paid rental on the unpaid list (#596) — test-only change
- [#616](https://github.com/wladku/Vereino/pull/616) test(people): anonymised history reads Former member on attendance, units, threads and charges (#599) — test-only change
- [#617](https://github.com/wladku/Vereino/pull/617) test(groups): a class group goes through substitution and attendance like a team (#592) — test-only change
- [#618](https://github.com/wladku/Vereino/pull/618) test(activities): a failing occupancy provider warns in the preview and blocks the save with an uncoded 500 (#590) — test-only change
- [#619](https://github.com/wladku/Vereino/pull/619) test(activities): the expiry job reports skipped for a declaration a guardian decided first (#589) — test-only change
- [#620](https://github.com/wladku/Vereino/pull/620) test(foundation): an administrator who is a guardian declares her ward's absence as guardian (#583) — test-only change
- [#621](https://github.com/wladku/Vereino/pull/621) test(foundation): TEST-F11 drives the member shell switchers by keyboard and proves their absence (#586) — test-only change
- [#622](https://github.com/wladku/Vereino/pull/622) test(specs): record ENG-TEST-01, one seeded violation per yarn verify step (#575) — test-only change
- [#623](https://github.com/wladku/Vereino/pull/623) docs(specs): amend ENG-AC-09 and ENG-TEST-09 to the no-PITR decision (#580) — documentation only
- [#624](https://github.com/wladku/Vereino/pull/624) docs(contributing): audit the E1 diff against the local patches to platform files (#577) — documentation only
- [#636](https://github.com/wladku/Vereino/pull/636) test(club_core): TEST-N01 checks the sidebar in pl and en, Dashboard first, and no Finanse for a coordinator (#602) — test-only change
- [#637](https://github.com/wladku/Vereino/pull/637) test(people): the 18th-birthday notices on the ward card and own card at 375 px (#600) — test-only change
- [#638](https://github.com/wladku/Vereino/pull/638) test(people): TEST-L06 follows the coach departure cash blocker link to cash custody (#598) — test-only change
- [#639](https://github.com/wladku/Vereino/pull/639) test(activities): the club event views, a part edit and an undeclared part removal in the panel (#607) — test-only change
- [#640](https://github.com/wladku/Vereino/pull/640) test(payments): TEST-C11 and TEST-C13 run the payer and cash pages in both locales (#595) — test-only change
- [#644](https://github.com/wladku/Vereino/pull/644) docs(specs): many clubs on one instance — tenant per club, club addresses, sweep jobs (E22-S01, #627) — documentation only
- [#645](https://github.com/wladku/Vereino/pull/645) docs(ops): release process for one production serving every club (E22-S08, #634) — documentation only
- [#651](https://github.com/wladku/Vereino/pull/651) docs(specs): record D-035 — AGPLv3 core, commercial Vereino Enterprise, CLA and partners (E23, #646) — documentation only
- [#654](https://github.com/wladku/Vereino/pull/654) test(activities): quarantine E06-S13, it fails in CI runs that share no PR (#653) — test-only change
- [#655](https://github.com/wladku/Vereino/pull/655) test(activities): quarantine E06-S13, its Assign substitute click times out on a detached menu in CI (#653) — test-only change
- [#656](https://github.com/wladku/Vereino/pull/656) chore(monorepo): relicense the core from MIT to AGPL-3.0-only (D-035, #647) — documentation only
- [#657](https://github.com/wladku/Vereino/pull/657) docs(specs): record D-036 — domain vereino.org, clubs on subdomains, vereino.pl redirects — documentation only
- [#659](https://github.com/wladku/Vereino/pull/659) test(payments): TEST-C12 switches the locale through the club default and checks html lang (#641) — test-only change
- [#660](https://github.com/wladku/Vereino/pull/660) docs(specs): Vereino Enterprise package with per-tenant licence keys (E23-S03, #649) — documentation only
- [#661](https://github.com/wladku/Vereino/pull/661) docs(specs): D-037 releases the treasurer role; menu lists Club events (AC-N16, #604) — documentation only
- [#664](https://github.com/wladku/Vereino/pull/664) docs(specs): record the ENG-TEST-17 Lighthouse baseline and close ENG-AC-14 (#582) — documentation only
- [#665](https://github.com/wladku/Vereino/pull/665) docs(partners): draft the partner programme — tiers, certification, trademark use (E23-S04, #650) — documentation only
- [#670](https://github.com/wladku/Vereino/pull/670) docs(specs): record D-038 — training outlines, a shared outline library and the medical expiry date — documentation only
- [#674](https://github.com/wladku/Vereino/pull/674) docs(specs): training outlines, outline library and medical expiry (E24-S01, D-038) — documentation only
- [#687](https://github.com/wladku/Vereino/pull/687) docs(specs): record the E24 owner decisions and mark training outlines ready (#671) — documentation only
- [#690](https://github.com/wladku/Vereino/pull/690) docs(specs): record the owner's "keep" decision at the ADR-001 checkpoint and close ENG-AC-07 (#579) — documentation only
- [#691](https://github.com/wladku/Vereino/pull/691) docs(specs): amend AC-F14 and P-19 to the module-owned import wizards and public frames (#587) — documentation only
- [#692](https://github.com/wladku/Vereino/pull/692) fix(foundation): scheduled workers refuse a scope without the job's registration (AC-G05, #591) — background worker guard, covered by TEST-G06
- [#693](https://github.com/wladku/Vereino/pull/693) docs(qa): Polish wording review sheet for the owner (AC-N11, #603) — documentation only
- [#695](https://github.com/wladku/Vereino/pull/695) docs(specs): ENG-AC-02 requires gate, integration and browser-smoke; record ENG-TEST-02 (#576) — documentation only
- [#697](https://github.com/wladku/Vereino/pull/697) docs(specs): Cezar stall prevention, QA request e-mail, phase-level story start — documentation only
- [#699](https://github.com/wladku/Vereino/pull/699) fix(merge-train): never judge merge-train/verified and prepare the batch switch-on (#698) — merge train only; you see it as the hold on risk-high PRs
- [#702](https://github.com/wladku/Vereino/pull/702) test(club_core): give TEST-M03's hooks their own timeout (#701) — test-only change
- [#716](https://github.com/wladku/Vereino/pull/716) chore(dx): add .vscode/extensions.json with the recommended extensions — editor recommendations only
- [#717](https://github.com/wladku/Vereino/pull/717) docs(specs): complete the social sign-in spec's approval references (#714) — documentation only
- [#718](https://github.com/wladku/Vereino/pull/718) docs(specs): record the owner's answers to Q-053, Q-054 and Q-055 (#715) — documentation only
- [#721](https://github.com/wladku/Vereino/pull/721) test(payments): poll the status-tag count in E20-S03 (#707) — test-only change
- [#722](https://github.com/wladku/Vereino/pull/722) feat(ci): the merge train retargets a stacked PR once its base PR merged (#708) — merge train only (stacked PR retargeting)
- [#724](https://github.com/wladku/Vereino/pull/724) docs(specs): close-out IV — Status lines and criteria of built specs from evidence on main (#719) — documentation only
- [#725](https://github.com/wladku/Vereino/pull/725) docs(decisions): D-039 production starts on Railway Pro, Google Cloud on triggers — documentation only
- [#730](https://github.com/wladku/Vereino/pull/730) chore(deps): update dependency fast-xml-parser to v5.12.0 [security] — transitive dependency bump, covered by the gate and the audit
- [#745](https://github.com/wladku/Vereino/pull/745) docs(ops): production lock-down checklist for Railway (E25-S01, #735) — documentation only
- [#746](https://github.com/wladku/Vereino/pull/746) docs(privacy): take interview and business notes out of the public repo; fictional example club everywhere — documentation only
- [#748](https://github.com/wladku/Vereino/pull/748) docs(compliance): refresh the ASVS 5.0 level 2 checklist and map every requirement (#742) — documentation only
- [#750](https://github.com/wladku/Vereino/pull/750) docs(ux): the mockup follows main as of 2026-11-25 — UX mockup only, no app change
- [#772](https://github.com/wladku/Vereino/pull/772) fix(qa): staff fixture folds the first name to ASCII for the account email (#754) — test fixture only
- [#773](https://github.com/wladku/Vereino/pull/773) docs(lessons): ledger runs on a PR that merged another PR's branch share one cause (#756) — documentation only
- [#775](https://github.com/wladku/Vereino/pull/775) docs(runs): TEST-036 needs no quarantine, #746 caused and fixes it (#760) — documentation only
- [#776](https://github.com/wladku/Vereino/pull/776) fix(ci): ledger counts runs sharing a commit off main as one source and files one issue per storm (#774) — CI ledger only
- [#778](https://github.com/wladku/Vereino/pull/778) ci: docs-only PRs skip the integration shards, browser and image smoke (#777) — CI only (docs-only PRs skip heavy jobs)
- [#780](https://github.com/wladku/Vereino/pull/780) feat(ci): QA instruction block in PR bodies and the train's "QA instruction missing" hold (#709) — CI and merge train only; you see it as the „Jak przetestować (QA)” block in PR descriptions
- [#781](https://github.com/wladku/Vereino/pull/781) fix(ops): first deploy without default accounts; production password policy (#747) — deploy docs and env example only
- [#782](https://github.com/wladku/Vereino/pull/782) test(people): assert the consent audit entries carry the grant and withdrawal dates (#720) — test-only change
- [#785](https://github.com/wladku/Vereino/pull/785) docs(specs): Day / Week / Month range switch on calendar views — documentation only
- [#786](https://github.com/wladku/Vereino/pull/786) docs(specs): record D-041 — a sign-up form for a section — documentation only
- [#789](https://github.com/wladku/Vereino/pull/789) docs(specs): sign-up form for a section — age check, places, waiting list, trial session (E26-S01, D-041) — documentation only
- [#790](https://github.com/wladku/Vereino/pull/790) docs(specs): record D-042 — the coach starts a cash handover, the treasurer confirms — documentation only
- [#792](https://github.com/wladku/Vereino/pull/792) docs(sdlc): phase-ready label rules and Blocking? phase values (#710) — documentation only
- [#793](https://github.com/wladku/Vereino/pull/793) docs(ops): QA request e-mail on cezar-ws, phase 2 of the QA request spec (#712) — documentation only
- [#797](https://github.com/wladku/Vereino/pull/797) docs(ops): record D-043 — edge proxy on a trigger, with its runbook (#739) — documentation only
- [#803](https://github.com/wladku/Vereino/pull/803) docs(specs): key store with per-club keys and a key inventory (#740) — documentation only
- [#804](https://github.com/wladku/Vereino/pull/804) docs(specs): section sign-up spec Ready for implementation — owner decision recorded (#788) — documentation only
- [#805](https://github.com/wladku/Vereino/pull/805) docs(specs): staff second factor for administrators and treasurers (#736) — documentation only
- [#807](https://github.com/wladku/Vereino/pull/807) docs(analysis): add security report for the whole codebase before the first real club data (#743) — documentation only
- [#810](https://github.com/wladku/Vereino/pull/810) docs(ops): record the ENG-TEST-19 clean-clone run on Linux (#578) — documentation only
- [#822](https://github.com/wladku/Vereino/pull/822) docs(backlog): record E27 and E28 from the product brief — documentation only
- [#825](https://github.com/wladku/Vereino/pull/825) feat(ci): agents act only on maintainers' work and skip fork PRs (#823) — agent and CI rules only (maintainers, fork PRs)

## Unresolved items

Labels, routes or setup steps the research could not confirm from the code. Follow the scenario without them and report what the screen shows.

- Q1–Q3, Q5: where the preview (`sandbox.mjs preview`) delivers e-mail was not found in the repository; read the code and links from wherever the preview's mail goes (`docs/ops/deploy.md` names the sandbox but not its mail)
- Q2: the switch „Przyjmuje zgłoszenia online” is hidden until phase 3, so a section must be opened to sign-ups by the decision session (PR description)
- S01: Exact Polish wording of the hint „Co najmniej 12 znaków” is not in the app catalogs (platform-provided via the password policy), so quote it as seen in the browser (`packages/app/src/modules/foundation/lib`, password policy files).
- S02: Whether the sandbox runs with the limiter on (a process-local limiter is only enabled for integration requests with a test header); manual 429 may not reproduce (`packages/app/src/modules/foundation/services/sessionless-limits.ts`).
- S02: The exact Polish UI text on `/login` for a 429 response was not confirmed; the catalog text is `api.errors.rateLimit` (`packages/app/src/i18n/pl.json`).
- S03: The exact "Połącz Google" button path on `/club/profile` is a widget (`packages/app/src/modules/foundation/widgets/injection/profile-identities/widget.client.tsx`).
- S04: Exact `curl` flags and cookie name are not given; the session cookie names are `auth_token` and `session_token` (`packages/app/src/proxy.ts`).
- S17: How to create the second club in the sandbox is not confirmed (`packages/app/src/modules/club_core`, operator commands).
- S18: The exact `export-club` flags were not confirmed (`docs/ops/backups.md`).
- S19: The menu path from „Osoby” to the person record and its tabs was not verified (`packages/app/src/modules/people/backend/people/persons`).
- S21: the composer page route and Polish menu path of the `communication` announcement flow, and the local mail log to use (`packages/app/src/modules/communication/`).
- S07: the sandbox way to bring the notice period forward for `delete-club` (the runbook's drill; confirm in `docs/ops/clubs.md` and `docs/ops/backups.md`).
- S22/S23: the exact option names beyond those in the PR bodies, `club-jobs sweep` and the job key list (`packages/app/src/modules/foundation/cli.ts`).
- S24: whether a six-row import is slow enough to see the progress bar; use a larger file (`packages/app/src/modules/people/backend/people/imports/[id]/page.tsx`).
- S25: the retention period and how to create a person past it (`packages/app/src/modules/people/lib/retention-rules.ts`).
- S10: exact `scripts/image-smoke.sh` environment variables (`scripts/image-smoke.sh`).
- S11: exact placement of the medical section on `/club/profile` for an adult member and the backend person form layout (`packages/app/src/modules/people/components/MedicalPanel.tsx`)
- S28: the exact label of the session card button when no outline exists is „Dodaj konspekt” or „Wybierz konspekt”, depends on own outlines (`packages/app/src/modules/training/i18n/pl.json`)
- S29: CLI arguments of `library-moderate` and `library-init` not read (`packages/app/src/modules/training/cli.ts`)
- S13: whether `/backend/club/settings` is the final URL of „Ustawienia klubu” (`packages/app/src/modules/club_core/backend/club/settings/page.meta.ts`)
- S41: the public page URL that shows the header (`packages/ui/src/public/public-header.tsx`)
- S33: the Polish label of the coordinator calendar's "Agenda" button and the exact route of the member facility calendar (M-11) were not confirmed (`packages/app/src/modules/activities/components/CoordinatorCalendar.tsx`, `packages/app/src/modules/facilities/components/club-places/ClubPlacePage.tsx`)
- S34: the exact route of the group detail page and the Polish label of the groups list column showing "x / limit" were not confirmed (`packages/app/src/modules/groups/backend/groups/groups/`)
- S36: the Polish label of the closure creation menu entry was not confirmed; the closure page has no sidebar entry (`packages/app/src/modules/facilities/backend/facilities/closures/page.meta.ts`)
- S37: how a tester triggers `payments.charges.generate_due` locally was not confirmed (`packages/app/src/modules/payments/README.md`)

## Appendix: Full PR Inventory

One line per merged PR in the window, grouped by merge date (UTC, newest first).

### 2026-11-26

- [#829](https://github.com/wladku/Vereino/pull/829) feat(foundation): social sign-in with Facebook for account holders (#567) — base `main` · QA: qa, needs-qa · Issue refs: [#567](https://github.com/wladku/Vereino/issues/567) · Scenarios: S15
- [#828](https://github.com/wladku/Vereino/pull/828) feat(activities): declarations in Vereino per section report (#818) — base `main` · QA: qa, needs-qa · Issue refs: [#818](https://github.com/wladku/Vereino/issues/818) · Scenarios: S31
- [#794](https://github.com/wladku/Vereino/pull/794) fix(foundation): read the command scope on the write transaction's connection (#728) — base `main` · QA: qa, needs-qa · Issue refs: [#728](https://github.com/wladku/Vereino/issues/728) · Scenarios: S16
- [#783](https://github.com/wladku/Vereino/pull/783) feat(foundation): social sign-in returns to the club's address through one central callback host (DD-S07) — base `main` · QA: qa, needs-qa · Issue refs: [#700](https://github.com/wladku/Vereino/issues/700) · Scenarios: S03
- [#827](https://github.com/wladku/Vereino/pull/827) fix(club_core): fix internal review finding U5-1 (#806) — base `main` · QA: qa, needs-qa · Issue refs: [#806](https://github.com/wladku/Vereino/issues/806) · Scenarios: S18
- [#826](https://github.com/wladku/Vereino/pull/826) feat(ops): key store service, boot guard and key inventory (#740 phase 1) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: S39
- [#825](https://github.com/wladku/Vereino/pull/825) feat(ci): agents act only on maintainers' work and skip fork PRs (#823) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#812](https://github.com/wladku/Vereino/pull/812) feat(foundation): app-owned password check — one policy for forms and API, common and breached passwords (#779) — base `main` · QA: qa, needs-qa · Issue refs: [#779](https://github.com/wladku/Vereino/issues/779) · Scenarios: S01
- [#802](https://github.com/wladku/Vereino/pull/802) feat(security): refuse cross-site cookie-authenticated API mutations (#744) — base `main` · QA: skip-qa · Issue refs: [#744](https://github.com/wladku/Vereino/issues/744) · Scenarios: S04
- [#795](https://github.com/wladku/Vereino/pull/795) feat(payments): the coach starts a cash handover, the treasurer or administrator confirms it (D-042) — base `main` · QA: qa, needs-qa · Issue refs: [#791](https://github.com/wladku/Vereino/issues/791) · Scenarios: S14
- [#824](https://github.com/wladku/Vereino/pull/824) feat(ops): sending-subdomain runbook and yarn ops:mail-dns check (#821) — base `main` · QA: skip-qa · Issue refs: [#821](https://github.com/wladku/Vereino/issues/821) · Scenarios: S38
- [#822](https://github.com/wladku/Vereino/pull/822) docs(backlog): record E27 and E28 from the product brief — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#815](https://github.com/wladku/Vereino/pull/815) fix(dev): stop yarn dev on low inotify limits instead of falling back to webpack (#808) — base `main` · QA: skip-qa · Issue refs: [#808](https://github.com/wladku/Vereino/issues/808) · Scenarios: S43
- [#813](https://github.com/wladku/Vereino/pull/813) feat(groups): places and settings for section sign-ups (#798) — base `main` · QA: needs-qa · Issue refs: [#798](https://github.com/wladku/Vereino/issues/798) · Scenarios: S34
- [#807](https://github.com/wladku/Vereino/pull/807) docs(analysis): add security report for the whole codebase before the first real club data (#743) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#810](https://github.com/wladku/Vereino/pull/810) docs(ops): record the ENG-TEST-19 clean-clone run on Linux (#578) — base `main` · QA: skip-qa · Issue refs: [#578](https://github.com/wladku/Vereino/issues/578) · Scenarios: no manual check
- [#804](https://github.com/wladku/Vereino/pull/804) docs(specs): section sign-up spec Ready for implementation — owner decision recorded (#788) — base `main` · QA: skip-qa · Issue refs: [#788](https://github.com/wladku/Vereino/issues/788) · Scenarios: no manual check
- [#805](https://github.com/wladku/Vereino/pull/805) docs(specs): staff second factor for administrators and treasurers (#736) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#803](https://github.com/wladku/Vereino/pull/803) docs(specs): key store with per-club keys and a key inventory (#740) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#797](https://github.com/wladku/Vereino/pull/797) docs(ops): record D-043 — edge proxy on a trigger, with its runbook (#739) — base `main` · QA: skip-qa · Issue refs: [#739](https://github.com/wladku/Vereino/issues/739) · Scenarios: no manual check
- [#796](https://github.com/wladku/Vereino/pull/796) feat(calendar): Day / Week / Month range switch on every calendar view (#784) — base `main` · QA: needs-qa · Issue refs: [#784](https://github.com/wladku/Vereino/issues/784) · Scenarios: S33
- [#790](https://github.com/wladku/Vereino/pull/790) docs(specs): record D-042 — the coach starts a cash handover, the treasurer confirms — base `main` · QA: none · Issue refs: none · Scenarios: no manual check
- [#792](https://github.com/wladku/Vereino/pull/792) docs(sdlc): phase-ready label rules and Blocking? phase values (#710) — base `main` · QA: skip-qa · Issue refs: [#710](https://github.com/wladku/Vereino/issues/710) · Scenarios: no manual check
- [#785](https://github.com/wladku/Vereino/pull/785) docs(specs): Day / Week / Month range switch on calendar views — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#793](https://github.com/wladku/Vereino/pull/793) docs(ops): QA request e-mail on cezar-ws, phase 2 of the QA request spec (#712) — base `main` · QA: skip-qa · Issue refs: [#712](https://github.com/wladku/Vereino/issues/712) · Scenarios: no manual check
- [#789](https://github.com/wladku/Vereino/pull/789) docs(specs): sign-up form for a section — age check, places, waiting list, trial session (E26-S01, D-041) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check

### 2026-11-25

- [#786](https://github.com/wladku/Vereino/pull/786) docs(specs): record D-041 — a sign-up form for a section — base `main` · QA: none · Issue refs: none · Scenarios: no manual check
- [#782](https://github.com/wladku/Vereino/pull/782) test(people): assert the consent audit entries carry the grant and withdrawal dates (#720) — base `main` · QA: skip-qa · Issue refs: [#720](https://github.com/wladku/Vereino/issues/720) · Scenarios: no manual check
- [#775](https://github.com/wladku/Vereino/pull/775) docs(runs): TEST-036 needs no quarantine, #746 caused and fixes it (#760) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#773](https://github.com/wladku/Vereino/pull/773) docs(lessons): ledger runs on a PR that merged another PR's branch share one cause (#756) — base `main` · QA: skip-qa · Issue refs: [#756](https://github.com/wladku/Vereino/issues/756) · Scenarios: no manual check
- [#750](https://github.com/wladku/Vereino/pull/750) docs(ux): the mockup follows main as of 2026-11-25 — base `main` · QA: none · Issue refs: none · Scenarios: no manual check
- [#781](https://github.com/wladku/Vereino/pull/781) fix(ops): first deploy without default accounts; production password policy (#747) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#780](https://github.com/wladku/Vereino/pull/780) feat(ci): QA instruction block in PR bodies and the train's "QA instruction missing" hold (#709) — base `main` · QA: skip-qa · Issue refs: [#709](https://github.com/wladku/Vereino/issues/709) · Scenarios: no manual check
- [#749](https://github.com/wladku/Vereino/pull/749) fix(club_core): reserve the demo and blog club slugs — base `main` · QA: none · Issue refs: none · Scenarios: S06
- [#730](https://github.com/wladku/Vereino/pull/730) chore(deps): update dependency fast-xml-parser to v5.12.0 [security] — base `main` · QA: none · Issue refs: none · Scenarios: no manual check
- [#729](https://github.com/wladku/Vereino/pull/729) feat(training): shared outline library with ratings and a public page (E24-S05, #685) — base `main` · QA: qa, needs-qa · Issue refs: [#685](https://github.com/wladku/Vereino/issues/685) · Scenarios: S13, S29
- [#726](https://github.com/wladku/Vereino/pull/726) feat(foundation): per-club limits and the capacity report of the shared instance (E22-S07, #633) — base `main` · QA: skip-qa · Issue refs: [#633](https://github.com/wladku/Vereino/issues/633) · Scenarios: S23
- [#778](https://github.com/wladku/Vereino/pull/778) ci: docs-only PRs skip the integration shards, browser and image smoke (#777) — base `main` · QA: skip-qa · Issue refs: [#777](https://github.com/wladku/Vereino/issues/777) · Scenarios: no manual check
- [#746](https://github.com/wladku/Vereino/pull/746) docs(privacy): take interview and business notes out of the public repo; fictional example club everywhere — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#725](https://github.com/wladku/Vereino/pull/725) docs(decisions): D-039 production starts on Railway Pro, Google Cloud on triggers — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#721](https://github.com/wladku/Vereino/pull/721) test(payments): poll the status-tag count in E20-S03 (#707) — base `main` · QA: skip-qa · Issue refs: [#707](https://github.com/wladku/Vereino/issues/707) · Scenarios: no manual check
- [#718](https://github.com/wladku/Vereino/pull/718) docs(specs): record the owner's answers to Q-053, Q-054 and Q-055 (#715) — base `main` · QA: skip-qa · Issue refs: [#715](https://github.com/wladku/Vereino/issues/715) · Scenarios: no manual check
- [#716](https://github.com/wladku/Vereino/pull/716) chore(dx): add .vscode/extensions.json with the recommended extensions — base `main` · QA: skip-qa · Issue refs: [#456](https://github.com/wladku/Vereino/issues/456) · Scenarios: no manual check
- [#643](https://github.com/wladku/Vereino/pull/643) fix(people): the retention sweep closes open erasure requests and counts refusals as kept (#564) — base `main` · QA: skip-qa · Issue refs: [#564](https://github.com/wladku/Vereino/issues/564) · Scenarios: S25
- [#748](https://github.com/wladku/Vereino/pull/748) docs(compliance): refresh the ASVS 5.0 level 2 checklist and map every requirement (#742) — base `main` · QA: skip-qa · Issue refs: [#742](https://github.com/wladku/Vereino/issues/742) · Scenarios: no manual check
- [#724](https://github.com/wladku/Vereino/pull/724) docs(specs): close-out IV — Status lines and criteria of built specs from evidence on main (#719) — base `main` · QA: skip-qa · Issue refs: [#719](https://github.com/wladku/Vereino/issues/719) · Scenarios: no manual check
- [#772](https://github.com/wladku/Vereino/pull/772) fix(qa): staff fixture folds the first name to ASCII for the account email (#754) — base `main` · QA: skip-qa · Issue refs: [#754](https://github.com/wladku/Vereino/issues/754) · Scenarios: no manual check
- [#776](https://github.com/wladku/Vereino/pull/776) fix(ci): ledger counts runs sharing a commit off main as one source and files one issue per storm (#774) — base `main` · QA: skip-qa · Issue refs: [#774](https://github.com/wladku/Vereino/issues/774) · Scenarios: no manual check
- [#751](https://github.com/wladku/Vereino/pull/751) feat(foundation): rate limits on sign-in, password reset and every sessionless route (#738) — base `main` · QA: skip-qa · Issue refs: [#738](https://github.com/wladku/Vereino/issues/738) · Scenarios: S02
- [#745](https://github.com/wladku/Vereino/pull/745) docs(ops): production lock-down checklist for Railway (E25-S01, #735) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#733](https://github.com/wladku/Vereino/pull/733) fix(platform): the runner image runs the mercato CLI and the Redis cache works in the Next bundle (#727) — base `main` · QA: skip-qa · Issue refs: [#727](https://github.com/wladku/Vereino/issues/727) · Scenarios: S10
- [#723](https://github.com/wladku/Vereino/pull/723) feat(foundation): Enterprise licence gate, key format and status CLI (#649) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: S27
- [#705](https://github.com/wladku/Vereino/pull/705) feat(people): medical certificate expiry date with status and reminders (E24-S02, #682) — base `main` · QA: qa, needs-qa · Issue refs: [#682](https://github.com/wladku/Vereino/issues/682) · Scenarios: S11, S12
- [#717](https://github.com/wladku/Vereino/pull/717) docs(specs): complete the social sign-in spec's approval references (#714) — base `main` · QA: skip-qa · Issue refs: [#714](https://github.com/wladku/Vereino/issues/714) · Scenarios: no manual check
- [#722](https://github.com/wladku/Vereino/pull/722) feat(ci): the merge train retargets a stacked PR once its base PR merged (#708) — base `main` · QA: skip-qa · Issue refs: [#708](https://github.com/wladku/Vereino/issues/708) · Scenarios: no manual check
- [#706](https://github.com/wladku/Vereino/pull/706) feat(training): training outlines on sessions with a PDF in the PZPN layout (E24-S03, #683) — base `main` · QA: needs-qa · Issue refs: [#683](https://github.com/wladku/Vereino/issues/683) · Scenarios: S28
- [#610](https://github.com/wladku/Vereino/pull/610) feat(foundation): social sign-in with Google for account holders (#566) — base `main` · QA: qa, needs-qa · Issue refs: [#566](https://github.com/wladku/Vereino/issues/566) · Scenarios: S03
- [#704](https://github.com/wladku/Vereino/pull/704) fix(activities): keep the sessions list rows while it refetches, un-quarantine E06-S13 (#653) — base `main` · QA: skip-qa · Issue refs: [#653](https://github.com/wladku/Vereino/issues/653) · Scenarios: S40
- [#686](https://github.com/wladku/Vereino/pull/686) fix(club_core): harden club deletion, restore and export (#681) — base `main` · QA: qa, skip-qa · Issue refs: [#681](https://github.com/wladku/Vereino/issues/681) · Scenarios: S07

### 2026-11-24

- [#694](https://github.com/wladku/Vereino/pull/694) feat(activities): the club administrator reopens a done session with a reason (#588) — base `main` · QA: qa, needs-qa · Issue refs: [#588](https://github.com/wladku/Vereino/issues/588) · Scenarios: S30
- [#691](https://github.com/wladku/Vereino/pull/691) docs(specs): amend AC-F14 and P-19 to the module-owned import wizards and public frames (#587) — base `main` · QA: skip-qa · Issue refs: [#587](https://github.com/wladku/Vereino/issues/587) · Scenarios: no manual check
- [#696](https://github.com/wladku/Vereino/pull/696) feat(activities): PZPN schedule and attendance exports as CSV (E24-S04, #684) — base `main` · QA: qa, needs-qa · Issue refs: [#684](https://github.com/wladku/Vereino/issues/684) · Scenarios: S32
- [#695](https://github.com/wladku/Vereino/pull/695) docs(specs): ENG-AC-02 requires gate, integration and browser-smoke; record ENG-TEST-02 (#576) — base `main` · QA: qa, skip-qa · Issue refs: [#576](https://github.com/wladku/Vereino/issues/576) · Scenarios: no manual check
- [#693](https://github.com/wladku/Vereino/pull/693) docs(qa): Polish wording review sheet for the owner (AC-N11, #603) — base `main` · QA: qa, skip-qa · Issue refs: none · Scenarios: no manual check
- [#692](https://github.com/wladku/Vereino/pull/692) fix(foundation): scheduled workers refuse a scope without the job's registration (AC-G05, #591) — base `main` · QA: skip-qa · Issue refs: [#591](https://github.com/wladku/Vereino/issues/591) · Scenarios: no manual check
- [#690](https://github.com/wladku/Vereino/pull/690) docs(specs): record the owner's "keep" decision at the ADR-001 checkpoint and close ENG-AC-07 (#579) — base `main` · QA: skip-qa · Issue refs: [#579](https://github.com/wladku/Vereino/issues/579) · Scenarios: no manual check
- [#663](https://github.com/wladku/Vereino/pull/663) refactor(foundation): one sweep job per job type instead of schedules per club (#629) — base `main` · QA: qa, needs-qa · Issue refs: [#629](https://github.com/wladku/Vereino/issues/629) · Scenarios: S22
- [#699](https://github.com/wladku/Vereino/pull/699) fix(merge-train): never judge merge-train/verified and prepare the batch switch-on (#698) — base `main` · QA: qa, needs-qa · Issue refs: [#698](https://github.com/wladku/Vereino/issues/698) · Scenarios: no manual check
- [#678](https://github.com/wladku/Vereino/pull/678) feat(club_core): offboarding banner and the administrator's club export (E22-S06b, #676) — base `main` · QA: qa, needs-qa · Issue refs: [#676](https://github.com/wladku/Vereino/issues/676) · Scenarios: S08
- [#702](https://github.com/wladku/Vereino/pull/702) test(club_core): give TEST-M03's hooks their own timeout (#701) — base `main` · QA: skip-qa · Issue refs: [#701](https://github.com/wladku/Vereino/issues/701) · Scenarios: no manual check
- [#677](https://github.com/wladku/Vereino/pull/677) feat(club_core): per-club export, deletion and single-club restore (E22-S06, #632) — base `main` · QA: qa, needs-qa · Issue refs: [#632](https://github.com/wladku/Vereino/issues/632) · Scenarios: S07
- [#563](https://github.com/wladku/Vereino/pull/563) feat(people,club_core): former participants are anonymised after the club's retention period (E19-S05, #471) — base `main` · QA: qa, needs-qa · Issue refs: [#471](https://github.com/wladku/Vereino/issues/471) · Scenarios: covered in qa-scenarios-2026-11-22
- [#697](https://github.com/wladku/Vereino/pull/697) docs(specs): Cezar stall prevention, QA request e-mail, phase-level story start — base `main` · QA: none · Issue refs: none · Scenarios: no manual check
- [#679](https://github.com/wladku/Vereino/pull/679) feat(club_core): resolve the club from the request hostname (E22-S05, #631) — base `main` · QA: qa, needs-qa · Issue refs: [#631](https://github.com/wladku/Vereino/issues/631) · Scenarios: S05, S21
- [#688](https://github.com/wladku/Vereino/pull/688) fix(foundation): the invitation sent again follows the person's locale (#584) — base `main` · QA: skip-qa · Issue refs: [#584](https://github.com/wladku/Vereino/issues/584) · Scenarios: S19
- [#687](https://github.com/wladku/Vereino/pull/687) docs(specs): record the E24 owner decisions and mark training outlines ready (#671) — base `main` · QA: none · Issue refs: none · Scenarios: no manual check
- [#559](https://github.com/wladku/Vereino/pull/559) test(platform): ENG-TEST-11 asserts a public club route keeps public s-maxage=60 (#557) — base `main` · QA: none · Issue refs: [#557](https://github.com/wladku/Vereino/issues/557) · Scenarios: no manual check

### 2026-11-23

- [#674](https://github.com/wladku/Vereino/pull/674) docs(specs): training outlines, outline library and medical expiry (E24-S01, D-038) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#609](https://github.com/wladku/Vereino/pull/609) feat(people): a club administrator exports one person's data for access and portability requests (#527) — base `main` · QA: qa, needs-qa · Issue refs: [#527](https://github.com/wladku/Vereino/issues/527) · Scenarios: S09
- [#680](https://github.com/wladku/Vereino/pull/680) fix(ui): a long club name no longer covers the public header links (E20-S09, #488) — base `main` · QA: needs-qa · Issue refs: [#488](https://github.com/wladku/Vereino/issues/488) · Scenarios: S41
- [#670](https://github.com/wladku/Vereino/pull/670) docs(specs): record D-038 — training outlines, a shared outline library and the medical expiry date — base `main` · QA: none · Issue refs: none · Scenarios: no manual check
- [#506](https://github.com/wladku/Vereino/pull/506) feat(club_core): each club has its own colour on the member header, public hero and fallback logo (E20-S07, #486) — base `main` · QA: qa, needs-qa · Issue refs: [#486](https://github.com/wladku/Vereino/issues/486) · Scenarios: covered in qa-scenarios-2026-11-22
- [#573](https://github.com/wladku/Vereino/pull/573) fix(deps): raise zod to 4.6.7 for GHSA-mrhx-c7xc-m3w5 (#454) — base `main` · QA: qa, needs-qa · Issue refs: [#454](https://github.com/wladku/Vereino/issues/454) · Scenarios: S20
- [#570](https://github.com/wladku/Vereino/pull/570) fix(deps): raise next and eslint-config-next to 16.4.6 for the critical advisories (#454) — base `main` · QA: qa, needs-qa · Issue refs: none · Scenarios: covered in qa-scenarios-2026-11-22
- [#668](https://github.com/wladku/Vereino/pull/668) fix(facilities): maintenance refusal names the current panel path (#667) — base `main` · QA: skip-qa · Issue refs: [#667](https://github.com/wladku/Vereino/issues/667) · Scenarios: S42
- [#665](https://github.com/wladku/Vereino/pull/665) docs(partners): draft the partner programme — tiers, certification, trademark use (E23-S04, #650) — base `main` · QA: skip-qa · Issue refs: [#650](https://github.com/wladku/Vereino/issues/650) · Scenarios: no manual check
- [#664](https://github.com/wladku/Vereino/pull/664) docs(specs): record the ENG-TEST-17 Lighthouse baseline and close ENG-AC-14 (#582) — base `main` · QA: skip-qa · Issue refs: [#582](https://github.com/wladku/Vereino/issues/582) · Scenarios: no manual check
- [#675](https://github.com/wladku/Vereino/pull/675) feat(foundation): pre-deploy ACL sync runs only when role defaults change (#673) — base `main` · QA: skip-qa · Issue refs: [#673](https://github.com/wladku/Vereino/issues/673) · Scenarios: S26
- [#530](https://github.com/wladku/Vereino/pull/530) fix(ops): security headers, API no-store, pinned non-root image (#463) — base `main` · QA: qa, needs-qa · Issue refs: [#463](https://github.com/wladku/Vereino/issues/463) · Scenarios: covered in qa-scenarios-2026-11-22
- [#660](https://github.com/wladku/Vereino/pull/660) docs(specs): Vereino Enterprise package with per-tenant licence keys (E23-S03, #649) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#661](https://github.com/wladku/Vereino/pull/661) docs(specs): D-037 releases the treasurer role; menu lists Club events (AC-N16, #604) — base `main` · QA: skip-qa · Issue refs: [#604](https://github.com/wladku/Vereino/issues/604) · Scenarios: no manual check
- [#669](https://github.com/wladku/Vereino/pull/669) fix(payments): the daily generation records no empty month (#666) — base `main` · QA: skip-qa · Issue refs: [#666](https://github.com/wladku/Vereino/issues/666) · Scenarios: S37
- [#659](https://github.com/wladku/Vereino/pull/659) test(payments): TEST-C12 switches the locale through the club default and checks html lang (#641) — base `main` · QA: skip-qa · Issue refs: [#641](https://github.com/wladku/Vereino/issues/641) · Scenarios: no manual check
- [#658](https://github.com/wladku/Vereino/pull/658) fix(platform): Vereino module CLIs exit 1 after usage errors (#642) — base `main` · QA: skip-qa · Issue refs: [#642](https://github.com/wladku/Vereino/issues/642) · Scenarios: S26
- [#662](https://github.com/wladku/Vereino/pull/662) feat(club_core): one operator command creates a club, with a runbook (E22-S04, #630) — base `main` · QA: skip-qa · Issue refs: [#630](https://github.com/wladku/Vereino/issues/630) · Scenarios: S06
- [#657](https://github.com/wladku/Vereino/pull/657) docs(specs): record D-036 — domain vereino.org, clubs on subdomains, vereino.pl redirects — base `main` · QA: none · Issue refs: none · Scenarios: no manual check
- [#644](https://github.com/wladku/Vereino/pull/644) docs(specs): many clubs on one instance — tenant per club, club addresses, sweep jobs (E22-S01, #627) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#640](https://github.com/wladku/Vereino/pull/640) test(payments): TEST-C11 and TEST-C13 run the payer and cash pages in both locales (#595) — base `main` · QA: skip-qa · Issue refs: [#595](https://github.com/wladku/Vereino/issues/595) · Scenarios: no manual check
- [#639](https://github.com/wladku/Vereino/pull/639) test(activities): the club event views, a part edit and an undeclared part removal in the panel (#607) — base `main` · QA: skip-qa · Issue refs: [#607](https://github.com/wladku/Vereino/issues/607) · Scenarios: no manual check
- [#638](https://github.com/wladku/Vereino/pull/638) test(people): TEST-L06 follows the coach departure cash blocker link to cash custody (#598) — base `main` · QA: skip-qa · Issue refs: [#598](https://github.com/wladku/Vereino/issues/598) · Scenarios: no manual check
- [#637](https://github.com/wladku/Vereino/pull/637) test(people): the 18th-birthday notices on the ward card and own card at 375 px (#600) — base `main` · QA: skip-qa · Issue refs: [#600](https://github.com/wladku/Vereino/issues/600) · Scenarios: no manual check
- [#636](https://github.com/wladku/Vereino/pull/636) test(club_core): TEST-N01 checks the sidebar in pl and en, Dashboard first, and no Finanse for a coordinator (#602) — base `main` · QA: skip-qa · Issue refs: [#602](https://github.com/wladku/Vereino/issues/602) · Scenarios: no manual check
- [#625](https://github.com/wladku/Vereino/pull/625) feat(people): the import commit runs as a ProgressService job (#585) — base `main` · QA: needs-qa · Issue refs: [#585](https://github.com/wladku/Vereino/issues/585) · Scenarios: S24
- [#624](https://github.com/wladku/Vereino/pull/624) docs(contributing): audit the E1 diff against the local patches to platform files (#577) — base `main` · QA: skip-qa · Issue refs: [#577](https://github.com/wladku/Vereino/issues/577) · Scenarios: no manual check
- [#623](https://github.com/wladku/Vereino/pull/623) docs(specs): amend ENG-AC-09 and ENG-TEST-09 to the no-PITR decision (#580) — base `main` · QA: skip-qa · Issue refs: [#580](https://github.com/wladku/Vereino/issues/580) · Scenarios: no manual check
- [#655](https://github.com/wladku/Vereino/pull/655) test(activities): quarantine E06-S13, its Assign substitute click times out on a detached menu in CI (#653) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#656](https://github.com/wladku/Vereino/pull/656) chore(monorepo): relicense the core from MIT to AGPL-3.0-only (D-035, #647) — base `main` · QA: skip-qa · Issue refs: [#647](https://github.com/wladku/Vereino/issues/647) · Scenarios: no manual check
- [#654](https://github.com/wladku/Vereino/pull/654) test(activities): quarantine E06-S13, it fails in CI runs that share no PR (#653) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check

### 2026-11-22

- [#652](https://github.com/wladku/Vereino/pull/652) fix(foundation): cross-club isolation guard over every Vereino route and the leaks it found (#628) — base `main` · QA: skip-qa · Issue refs: [#628](https://github.com/wladku/Vereino/issues/628) · Scenarios: S17
- [#645](https://github.com/wladku/Vereino/pull/645) docs(ops): release process for one production serving every club (E22-S08, #634) — base `main` · QA: skip-qa · Issue refs: [#634](https://github.com/wladku/Vereino/issues/634) · Scenarios: no manual check
- [#651](https://github.com/wladku/Vereino/pull/651) docs(specs): record D-035 — AGPLv3 core, commercial Vereino Enterprise, CLA and partners (E23, #646) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#622](https://github.com/wladku/Vereino/pull/622) test(specs): record ENG-TEST-01, one seeded violation per yarn verify step (#575) — base `main` · QA: skip-qa · Issue refs: [#575](https://github.com/wladku/Vereino/issues/575) · Scenarios: no manual check
- [#621](https://github.com/wladku/Vereino/pull/621) test(foundation): TEST-F11 drives the member shell switchers by keyboard and proves their absence (#586) — base `main` · QA: skip-qa · Issue refs: [#586](https://github.com/wladku/Vereino/issues/586) · Scenarios: no manual check
- [#619](https://github.com/wladku/Vereino/pull/619) test(activities): the expiry job reports skipped for a declaration a guardian decided first (#589) — base `main` · QA: skip-qa · Issue refs: [#589](https://github.com/wladku/Vereino/issues/589) · Scenarios: no manual check
- [#620](https://github.com/wladku/Vereino/pull/620) test(foundation): an administrator who is a guardian declares her ward's absence as guardian (#583) — base `main` · QA: skip-qa · Issue refs: [#583](https://github.com/wladku/Vereino/issues/583) · Scenarios: no manual check
- [#618](https://github.com/wladku/Vereino/pull/618) test(activities): a failing occupancy provider warns in the preview and blocks the save with an uncoded 500 (#590) — base `main` · QA: skip-qa · Issue refs: [#590](https://github.com/wladku/Vereino/issues/590) · Scenarios: no manual check
- [#617](https://github.com/wladku/Vereino/pull/617) test(groups): a class group goes through substitution and attendance like a team (#592) — base `main` · QA: skip-qa · Issue refs: [#592](https://github.com/wladku/Vereino/issues/592) · Scenarios: no manual check
- [#616](https://github.com/wladku/Vereino/pull/616) test(people): anonymised history reads Former member on attendance, units, threads and charges (#599) — base `main` · QA: skip-qa · Issue refs: [#599](https://github.com/wladku/Vereino/issues/599) · Scenarios: no manual check
- [#615](https://github.com/wladku/Vereino/pull/615) test(facilities): TEST-R09 proves the renter's expiry e-mail and the partly paid rental on the unpaid list (#596) — base `main` · QA: skip-qa · Issue refs: [#596](https://github.com/wladku/Vereino/issues/596) · Scenarios: no manual check
- [#614](https://github.com/wladku/Vereino/pull/614) test(activities): TEST-T01 counts the cancellation notices per part (#605) — base `main` · QA: skip-qa · Issue refs: [#605](https://github.com/wladku/Vereino/issues/605) · Scenarios: no manual check
- [#613](https://github.com/wladku/Vereino/pull/613) fix(facilities): closure notices open "Needs a new time" for coordinators (#597) — base `main` · QA: skip-qa · Issue refs: [#597](https://github.com/wladku/Vereino/issues/597) · Scenarios: S36
- [#612](https://github.com/wladku/Vereino/pull/612) fix(groups): the "Fits" filter preselects a team's children by its category's birth years (#601) — base `main` · QA: needs-qa · Issue refs: [#601](https://github.com/wladku/Vereino/issues/601) · Scenarios: S35
- [#611](https://github.com/wladku/Vereino/pull/611) test(activities): the coach saves attendance and records a score on his club event part (#606) — base `main` · QA: skip-qa · Issue refs: [#606](https://github.com/wladku/Vereino/issues/606) · Scenarios: no manual check
- [#608](https://github.com/wladku/Vereino/pull/608) docs(specs): close-out III — open acceptance criteria ticked from evidence or linked to gap issues (#568) — base `main` · QA: skip-qa · Issue refs: [#568](https://github.com/wladku/Vereino/issues/568) · Scenarios: no manual check
- [#572](https://github.com/wladku/Vereino/pull/572) fix(groups): age range editors keep typed values when the list reloads; TEST-L23 runs again (#545) — base `main` · QA: skip-qa · Issue refs: [#545](https://github.com/wladku/Vereino/issues/545) · Scenarios: no manual check
- [#571](https://github.com/wladku/Vereino/pull/571) test(groups): TEST-L22 runs again, its axe scans wait for the buttons' fade (#433) — base `main` · QA: skip-qa · Issue refs: [#433](https://github.com/wladku/Vereino/issues/433) · Scenarios: no manual check
- [#562](https://github.com/wladku/Vereino/pull/562) feat(payments): the anonymised name hold follows the accounting retention period (#526) — base `main` · QA: skip-qa · Issue refs: [#526](https://github.com/wladku/Vereino/issues/526) · Scenarios: covered in qa-scenarios-2026-11-22
- [#542](https://github.com/wladku/Vereino/pull/542) chore(deps): remove the commercially licensed @open-mercato/enterprise package (E18-S05, #466) — base `main` · QA: skip-qa · Issue refs: [#466](https://github.com/wladku/Vereino/issues/466) · Scenarios: covered in qa-scenarios-2026-11-22
- [#561](https://github.com/wladku/Vereino/pull/561) docs(compliance): record and defer the retention rule for claims in proceedings (#475) — base `main` · QA: skip-qa · Issue refs: [#475](https://github.com/wladku/Vereino/issues/475) · Scenarios: covered in qa-scenarios-2026-11-22
- [#558](https://github.com/wladku/Vereino/pull/558) feat(ci): yarn guard blocks weakened tests, new dependencies and secrets in every PR (#520) — base `main` · QA: skip-qa · Issue refs: [#520](https://github.com/wladku/Vereino/issues/520) · Scenarios: covered in qa-scenarios-2026-11-22
- [#556](https://github.com/wladku/Vereino/pull/556) fix(payments): cash acceptances with the e-mail on no longer exhaust the DB pool (#554) — base `main` · QA: skip-qa · Issue refs: [#554](https://github.com/wladku/Vereino/issues/554) · Scenarios: covered in qa-scenarios-2026-11-22
- [#544](https://github.com/wladku/Vereino/pull/544) ci(merge-train): build a batch branch, merge it with a tree check, rehearsed in a scratch repository (E16-S03, #451) — base `main` · QA: skip-qa · Issue refs: [#451](https://github.com/wladku/Vereino/issues/451) · Scenarios: covered in qa-scenarios-2026-11-22
- [#514](https://github.com/wladku/Vereino/pull/514) ci(gate): fail yarn verify on hard-coded secrets and real e-mail addresses (#511) — base `main` · QA: skip-qa · Issue refs: [#511](https://github.com/wladku/Vereino/issues/511) · Scenarios: covered in qa-scenarios-2026-11-22
- [#555](https://github.com/wladku/Vereino/pull/555) feat(payments): nightly invariant check reports drift between charges, payments and receipt numbers (REQ-043, #531) — base `main` · QA: skip-qa · Issue refs: [#531](https://github.com/wladku/Vereino/issues/531) · Scenarios: covered in qa-scenarios-2026-11-22
- [#553](https://github.com/wladku/Vereino/pull/553) fix(payments): concurrent cash acceptances no longer exhaust the DB pool (#549) — base `main` · QA: skip-qa · Issue refs: [#549](https://github.com/wladku/Vereino/issues/549) · Scenarios: covered in qa-scenarios-2026-11-22
- [#552](https://github.com/wladku/Vereino/pull/552) fix(activities): keep the Tab-focused attendance control clear of the sticky action bar at 375 px (#547) — base `main` · QA: needs-qa · Issue refs: [#547](https://github.com/wladku/Vereino/issues/547) · Scenarios: covered in qa-scenarios-2026-11-22
- [#551](https://github.com/wladku/Vereino/pull/551) test: amendment B test cases TEST-077…TEST-085 (#532) — base `main` · QA: skip-qa · Issue refs: [#532](https://github.com/wladku/Vereino/issues/532) · Scenarios: covered in qa-scenarios-2026-11-22
- [#550](https://github.com/wladku/Vereino/pull/550) fix(payments): kit order form inputs have a 44 px hit area (#548) — base `main` · QA: needs-qa · Issue refs: [#548](https://github.com/wladku/Vereino/issues/548) · Scenarios: covered in qa-scenarios-2026-11-22
- [#539](https://github.com/wladku/Vereino/pull/539) fix(payments,facilities,people): texts promise nothing, invent no prices, messages name what to do (E20-S17, #496) — base `main` · QA: needs-qa · Issue refs: [#496](https://github.com/wladku/Vereino/issues/496) · Scenarios: covered in qa-scenarios-2026-11-22

### Not yet merged

Open PRs with a section in this report (they are not counted above).

- [#837](https://github.com/wladku/Vereino/pull/837) — QA: needs-qa, qa · Scenarios: Q1
- [#830](https://github.com/wladku/Vereino/pull/830) — QA: needs-qa, qa · Scenarios: Q2
- [#831](https://github.com/wladku/Vereino/pull/831) — QA: needs-qa, qa · Scenarios: Q3
- [#835](https://github.com/wladku/Vereino/pull/835) — QA: needs-qa, qa · Scenarios: Q4
- [#809](https://github.com/wladku/Vereino/pull/809) — QA: needs-qa, qa · Scenarios: Q5

### Excluded

- 1 excluded (the previous run of this report): [#574](https://github.com/wladku/Vereino/pull/574)
