# QA Scenarios — since 2026-11-14

Report window: **2026-11-14 → 2026-11-20** (routes for base `main`). Issue: [#453](https://github.com/wladku/Vereino/issues/453).

## Executive Summary

- Reviewed **107 PRs**, all merged into `main`; none into other branches, none excluded.
- **75 scenarios** grouped by role (50 P0, 22 P1, 3 P2); **28 PRs** need no manual check (tests, CI, docs, pure refactors).
- **93 issues** closed since 2026-11-14; the story coverage table maps each one to its scenarios.
- Riskiest theme: money (cash, refunds, rental charges, scheduled charge runs) and personal data (anonymisation, leaving the club, the 18th birthday) — start with the P0 scenarios of the administrator and the treasurer.
- 77 PRs merged with `needs-qa` and no recorded QA sign-off; this report is that sign-off checklist. 28 items could not be resolved against the code and are listed at the end.

## How to use this report

- Work in the sandbox with the example club, the interface switched to **Polish**: every quoted label („…”) is the text the Polish catalog (`pl.json`) shows.
- Administrator and treasurer scenarios run on the desktop (`/backend`); every other role on a phone or a 375 px wide browser window.
- Follow the steps, tick each "verify" bullet, and file a new issue for anything under "what can go wrong" that you see. Scenario ids (S01 …) are stable within this report only.

## Recommended QA Order

| Id | Priority | Role | Scenario | PRs |
|---|---|---|---|---|
| S01 | P0 | administrator | A child moved to another group pays one fee for the month | [#415](https://github.com/wladku/Vereino/pull/415) |
| S02 | P0 | administrator | A leaving coach's sessions are handed over or freed, contracts end and held cash blocks the departure | [#431](https://github.com/wladku/Vereino/pull/431) |
| S03 | P0 | administrator | A new club is set up in the panel: first administrator page and empty pickers that say what is missing | [#346](https://github.com/wladku/Vereino/pull/346), [#364](https://github.com/wladku/Vereino/pull/364) |
| S04 | P0 | administrator | A rental creates one charge payable to the facility owner and it shows under the rentals view | [#336](https://github.com/wladku/Vereino/pull/336), [#338](https://github.com/wladku/Vereino/pull/338) |
| S05 | P0 | administrator | Accept cash from the charges list, a charge and the bank statement page; the charges list keeps its view in the URL | [#338](https://github.com/wladku/Vereino/pull/338) |
| S06 | P0 | administrator | Accept cash on the phone cash page: the receiver is named before saving and today's receipts list what was paid | [#370](https://github.com/wladku/Vereino/pull/370) |
| S07 | P0 | administrator | Add a charge by hand, assign a payer to a charge without one, and see a person's charges on their record | [#344](https://github.com/wladku/Vereino/pull/344) |
| S08 | P0 | administrator | Administrator anonymises a former person on a recorded request and deletes a person created by mistake | [#437](https://github.com/wladku/Vereino/pull/437) |
| S09 | P0 | administrator | Administrator cancels a part and the whole club event; families are notified | [#430](https://github.com/wladku/Vereino/pull/430), [#426](https://github.com/wladku/Vereino/pull/426) |
| S10 | P0 | administrator | Administrator corrects a roster mistake in the panel: add, edit, end on a chosen day, remove | [#355](https://github.com/wladku/Vereino/pull/355), [#396](https://github.com/wladku/Vereino/pull/396) |
| S11 | P0 | administrator | Administrator creates a club event in the panel with a new external place and builds its parts by day | [#430](https://github.com/wladku/Vereino/pull/430), [#425](https://github.com/wladku/Vereino/pull/425), [#426](https://github.com/wladku/Vereino/pull/426) |
| S12 | P0 | administrator | Administrator finds the Club group, tabbed admin pages and mockup wording in the sidebar; lists load once | [#313](https://github.com/wladku/Vereino/pull/313), [#318](https://github.com/wladku/Vereino/pull/318), [#319](https://github.com/wladku/Vereino/pull/319), [#334](https://github.com/wladku/Vereino/pull/334) |
| S13 | P0 | administrator | Administrator moves a rental and its unpaid charge follows the new slot and place | [#427](https://github.com/wladku/Vereino/pull/427), [#315](https://github.com/wladku/Vereino/pull/315) |
| S14 | P0 | administrator | Administrator or coordinator starts a new season in one previewed step | [#406](https://github.com/wladku/Vereino/pull/406) |
| S15 | P0 | administrator | Administrator plans a series without collisions and works one activity's sessions | [#340](https://github.com/wladku/Vereino/pull/340), [#314](https://github.com/wladku/Vereino/pull/314) |
| S16 | P0 | administrator | Administrator re-sends an invitation, changes the login e-mail and blocks an account on the Account tab | [#339](https://github.com/wladku/Vereino/pull/339) |
| S17 | P0 | administrator | Administrator reads one place's day on the facility calendar hour axis | [#335](https://github.com/wladku/Vereino/pull/335), [#337](https://github.com/wladku/Vereino/pull/337) |
| S18 | P0 | administrator | Administrator records and confirms a family's departure with a preview, then returns a person | [#365](https://github.com/wladku/Vereino/pull/365) |
| S19 | P0 | administrator | Administrator saves a rental, a group event or a club booking from a free hour in one slot dialog | [#342](https://github.com/wladku/Vereino/pull/342), [#315](https://github.com/wladku/Vereino/pull/315), [#360](https://github.com/wladku/Vereino/pull/360) |
| S20 | P0 | administrator | Administrator sees the greeting, menu counts and the member-interface link; coordinator and attendant get their own dashboards | [#413](https://github.com/wladku/Vereino/pull/413) |
| S21 | P0 | administrator | Administrator sets payment days and automatic expiry on a facility management agreement | [#343](https://github.com/wladku/Vereino/pull/343) |
| S22 | P0 | administrator | Administrator uses the remaining panel functions on publication, sections, contracts and people | [#323](https://github.com/wladku/Vereino/pull/323) |
| S23 | P0 | administrator | Administrator works the rentals list and corrects a rental on its record page | [#341](https://github.com/wladku/Vereino/pull/341) |
| S24 | P0 | administrator | Decide each bank transfer with row buttons and delete an import from which nothing was booked | [#389](https://github.com/wladku/Vereino/pull/389), [#338](https://github.com/wladku/Vereino/pull/338) |
| S25 | P0 | administrator | Families are notified in the thread, in the app and by e-mail when a session moves or is restored | [#356](https://github.com/wladku/Vereino/pull/356) |
| S26 | P0 | administrator | Move several children from a roster to another group in one previewed, undoable step | [#429](https://github.com/wladku/Vereino/pull/429) |
| S27 | P0 | administrator | On the 18th birthday guardianships end, consents and new charges move to the adult; age notices appear | [#414](https://github.com/wladku/Vereino/pull/414) |
| S28 | P0 | administrator | Refund an online payment from the charge and find overpayments under 'To refund' | [#391](https://github.com/wladku/Vereino/pull/391) |
| S29 | P0 | administrator | Run a kit campaign from its record: who ordered, payments, cash and handover in the row | [#397](https://github.com/wladku/Vereino/pull/397) |
| S30 | P0 | administrator | See who holds the club's cash and accept a numbered handover | [#421](https://github.com/wladku/Vereino/pull/421) |
| S31 | P0 | administrator | Turn on automatic monthly charges and overdue reminders in payment settings | [#398](https://github.com/wladku/Vereino/pull/398) |
| S32 | P0 | administrator | Undo a charge generation, automatic runs included | [#420](https://github.com/wladku/Vereino/pull/420) |
| S46 | P0 | treasurer | A rental's charge is payable to the place owner and the payment confirms the rental | [#385](https://github.com/wladku/Vereino/pull/385) |
| S47 | P0 | treasurer | A treasurer works with a finance-only role, menu and dashboard | [#432](https://github.com/wladku/Vereino/pull/432), [#421](https://github.com/wladku/Vereino/pull/421) |
| S48 | P0 | section coordinator | Section coordinator assigns a substitute, moves and cancels sessions from the phone | [#367](https://github.com/wladku/Vereino/pull/367), [#356](https://github.com/wladku/Vereino/pull/356) |
| S49 | P0 | section coordinator | Section coordinator edits a roster from the phone; coach sees it read-only, guardian is refused | [#374](https://github.com/wladku/Vereino/pull/374), [#355](https://github.com/wladku/Vereino/pull/355) |
| S50 | P0 | section coordinator | Section coordinator marks a group thread as a case and deletes a message from the phone | [#374](https://github.com/wladku/Vereino/pull/374) |
| S51 | P0 | section coordinator | Section coordinator sets up a tournament entirely on the phone (event, external place sheet, parts, move, poster, cancel) | [#438](https://github.com/wladku/Vereino/pull/438), [#425](https://github.com/wladku/Vereino/pull/425), [#426](https://github.com/wladku/Vereino/pull/426), [#441](https://github.com/wladku/Vereino/pull/441) |
| S53 | P0 | coach | Coach creates a sparring or away match with a typed venue on the phone and edits the own event | [#353](https://github.com/wladku/Vereino/pull/353) |
| S54 | P0 | coach | Coach fills attendance in one tap, takes over an unstaffed session and records a match score | [#361](https://github.com/wladku/Vereino/pull/361), [#350](https://github.com/wladku/Vereino/pull/350) |
| S55 | P0 | coach | Coach opens a place's day on the phone and books a free hour in one tap | [#348](https://github.com/wladku/Vereino/pull/348), [#335](https://github.com/wladku/Vereino/pull/335), [#392](https://github.com/wladku/Vereino/pull/392), [#363](https://github.com/wladku/Vereino/pull/363) |
| S56 | P0 | coach | Coach runs a tournament part session without Edit and Cancel | [#428](https://github.com/wladku/Vereino/pull/428), [#426](https://github.com/wladku/Vereino/pull/426) |
| S57 | P0 | coach | Each role lands on its own start page; a coach-only person works in the staff context; an unlinked account sees a lasting notice | [#325](https://github.com/wladku/Vereino/pull/325), [#357](https://github.com/wladku/Vereino/pull/357) |
| S60 | P0 | guardian | A payer pays every charge on the phone in two taps, including a partly paid one; a second guardian sees who pays | [#345](https://github.com/wladku/Vereino/pull/345) |
| S61 | P0 | guardian | Guardian answers before the declaration deadline and is stopped after it | [#350](https://github.com/wladku/Vereino/pull/350) |
| S62 | P0 | guardian | Guardian has the same bottom bar and More list on every member page, skeletons while loading, unread messages on Today and the primary-payer badge | [#320](https://github.com/wladku/Vereino/pull/320), [#333](https://github.com/wladku/Vereino/pull/333), [#324](https://github.com/wladku/Vereino/pull/324) |
| S63 | P0 | guardian | Guardian or adult member asks to leave the club from the phone and withdraws the request | [#365](https://github.com/wladku/Vereino/pull/365) |
| S64 | P0 | guardian | Guardians and coaches without the coordinator role cannot manage club events | [#438](https://github.com/wladku/Vereino/pull/438), [#425](https://github.com/wladku/Vereino/pull/425), [#426](https://github.com/wladku/Vereino/pull/426) |
| S70 | P0 | facility attendant | Facility attendant runs today, takes a phone rental and requests an entry ban | [#354](https://github.com/wladku/Vereino/pull/354), [#335](https://github.com/wladku/Vereino/pull/335) |
| S72 | P0 | renter | Renter receives rental e-mails and cancels the rental through the link | [#386](https://github.com/wladku/Vereino/pull/386) |
| S33 | P1 | administrator | Administrator decides an online booking request from a card with every fact | [#351](https://github.com/wladku/Vereino/pull/351) |
| S34 | P1 | administrator | Administrator edits the club consent texts and sees own consents and the missing-consents filter | [#412](https://github.com/wladku/Vereino/pull/412) |
| S35 | P1 | administrator | Administrator enters role dates, guardianship start, external id and renames a section material | [#371](https://github.com/wladku/Vereino/pull/371) |
| S36 | P1 | administrator | Administrator filters the groups list and works from a group record | [#349](https://github.com/wladku/Vereino/pull/349) |
| S37 | P1 | administrator | Administrator manages zones, closures, rates, log, incidents and entry bans in the panel tabs | [#360](https://github.com/wladku/Vereino/pull/360) |
| S38 | P1 | administrator | Administrator sees today's facility entries in the dashboard widget | [#416](https://github.com/wladku/Vereino/pull/416) |
| S39 | P1 | administrator | Administrator sets PZPN birth-year ranges on age categories and a team's age follows its category | [#424](https://github.com/wladku/Vereino/pull/424) |
| S40 | P1 | administrator | Administrator sets up a new coach from the staff checklist and stores a person photo and a contract PDF | [#415](https://github.com/wladku/Vereino/pull/415) |
| S41 | P1 | administrator | Administrator uploads the poster and funder logos, replaces and removes them with undo | [#436](https://github.com/wladku/Vereino/pull/436) |
| S42 | P1 | administrator | Staff and renters are told when a closure or maintenance window flags their entries | [#387](https://github.com/wladku/Vereino/pull/387) |
| S43 | P1 | administrator | The dashboard shows bank statements and cash, order campaigns, overdue counts and charges without a payer | [#411](https://github.com/wladku/Vereino/pull/411) |
| S58 | P1 | coach | A coach opens group payments from the Today tile with the group and the 'to pay' filter kept in the URL | [#370](https://github.com/wladku/Vereino/pull/370) |
| S59 | P1 | coach | Author edits their own message on the phone | [#371](https://github.com/wladku/Vereino/pull/371) |
| S65 | P1 | guardian | A guardian follows a kit order on the phone: stage, deadlines, pickup and who handed it over | [#393](https://github.com/wladku/Vereino/pull/393) |
| S66 | P1 | guardian | A guardian without an account orders a kit from a personal e-mail link that names them | [#393](https://github.com/wladku/Vereino/pull/393) |
| S67 | P1 | guardian | Guardian sees 18th-birthday and own-account notices on the ward card | [#414](https://github.com/wladku/Vereino/pull/414) |
| S68 | P1 | guardian | Guardian sees only their child's tournament part, linked to the event, in Today, calendar and session page | [#428](https://github.com/wladku/Vereino/pull/428) |
| S69 | P1 | adult participant | Adult participant gives and withdraws own consents on the phone | [#412](https://github.com/wladku/Vereino/pull/412) |
| S71 | P1 | maintainer | Place maintainer sees, plans and completes maintenance tasks on the phone | [#362](https://github.com/wladku/Vereino/pull/362) |
| S73 | P1 | public visitor | Guest opens the public tournament page from the club's Events page | [#439](https://github.com/wladku/Vereino/pull/439) |
| S74 | P1 | public visitor | Public visitor browses places and confirms a booking request inside the club's frame | [#388](https://github.com/wladku/Vereino/pull/388) |
| S75 | P1 | public visitor | Public visitor uses the club menu, the Events page and a club-branded sign-in page | [#327](https://github.com/wladku/Vereino/pull/327), [#324](https://github.com/wladku/Vereino/pull/324) |
| S44 | P2 | administrator | Person record shows membership status by the club's date, not the browser clock | [#247](https://github.com/wladku/Vereino/pull/247) |
| S45 | P2 | administrator | See the online payment connection and choose the payment methods offered to payers | [#401](https://github.com/wladku/Vereino/pull/401) |
| S52 | P2 | section coordinator | Phone club event forms recover from errors and the list keeps all past events | [#441](https://github.com/wladku/Vereino/pull/441), [#438](https://github.com/wladku/Vereino/pull/438) |

## Scenarios by role

### Administrator — desktop

#### S01 · P0 — A child moved to another group pays one fee for the month

**Role:** administrator · **Device:** desktop · **Why P0:** fee generation (money)
**PRs:** [#415](https://github.com/wladku/Vereino/pull/415) · **Stories:** E13-S10 · **Issues:** [#312](https://github.com/wladku/Vereino/issues/312)
**Route:** /backend/groups/groups/{id} tab „Skład” (Grupy)
**Before you start:** Child in group A with declarations for future sessions and this month's fee generated; group B with a different fee.

**Steps**

1. Open group A, „Skład”, on the child click „Przenieś…”
2. Choose „Grupa docelowa” B and „Pierwszy dzień w nowej grupie” on the 15th
3. Generate the period again; then the next period
4. Try a move with an overlapping membership in B

**What to verify**

- [ ] A's future declarations gone; child undeclared in B
- [ ] Exactly one fee this month; next month B's fee
- [ ] Overlap refused; coordinator cannot move outside own sections

**What can go wrong**

- Two fees for the month
- Old membership not ended the day before

#### S02 · P0 — A leaving coach's sessions are handed over or freed, contracts end and held cash blocks the departure

**Role:** administrator · **Device:** desktop · **Why P0:** unsettled cash (money) blocks departure
**PRs:** [#431](https://github.com/wladku/Vereino/pull/431) · **Stories:** E13-S05 · **Issues:** [#307](https://github.com/wladku/Vereino/issues/307)
**Route:** /backend/people/persons/{id} → tab „Odejście”; /backend/payments/cash-custody
**Before you start:** Coach with cash held, 6 future sessions in two groups, an open contract and a place maintainer row; another coach of one group.

**Steps**

1. Open the coach, tab „Odejście”, preview a departure
2. Click „Otwórz Gotówkę do rozliczenia” and settle the cash
3. In „Zajęcia i aktywności” choose „Kto przejmuje” for one group and „Zostaw bez trenera” for the other
4. Click „Potwierdź odejście”

**What to verify**

- [ ] Cash blocker shows the amount and „Potwierdź odejście” is disabled
- [ ] Confirm stays disabled until each group has a choice
- [ ] From the day after the last day sessions carry the new coach or none; unassigned ones appear as needing a coach
- [ ] Contract ends on the last day, maintainer row is gone

**What can go wrong**

- Departure goes through with cash held
- A non-coach of the group can be chosen
- Contract still open

#### S03 · P0 — A new club is set up in the panel: first administrator page and empty pickers that say what is missing

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high; creates the club administrator (who can do what)
**PRs:** [#346](https://github.com/wladku/Vereino/pull/346), [#364](https://github.com/wladku/Vereino/pull/364) · **Stories:** E13-S03 · **Issues:** [#305](https://github.com/wladku/Vereino/issues/305), [#358](https://github.com/wladku/Vereino/issues/358)
**Route:** /backend/people/first-administrator (banner „Klub nie ma jeszcze administratora”), /backend/club/places/create, /backend/club/contracts, /backend/people/persons/{id}, /backend/groups/groups/create
**Before you start:** Fresh tenant with one platform user and no club administrator, no institutions, sections or persons; a coordinator without club_core.manage.

**Steps**

1. As technical administrator click „Pierwszy administrator” on the banner, search a non-existent user, then choose the user and click „Ustaw jako administratora klubu”
2. Open the first-administrator page again
3. As the new administrator open the place form, pick owner institution: „Dodaj instytucję” → „Dodaj i wybierz”
4. In a guardianship search type a name with no match and click „Dodaj „{term}””
5. As the coordinator open the group form with no sections
6. Open the place form's public calendar group while the club has no page address

**What to verify**

- [ ] Empty user search names the „Użytkownicy” page under Ustawienia › Autoryzacja
- [ ] Club administrator is created; second visit says „Klub ma już administratora” with the name
- [ ] „Nie ma jeszcze żadnej instytucji.” and the dialog creates and selects the institution; the person is created and selected
- [ ] Coordinator sees „Nie ma jeszcze żadnej sekcji.” and „Poproś administratora klubu o dodanie.” with no button
- [ ] Hint about the page address names „Publikacja strony klubu”; the unlinked-account error names „Pierwszy administrator”, not bootstrap-admin

**What can go wrong**

- Second administrator created silently
- Picker shows an 'Add' button the user cannot use
- Hints point to non-existent pages

#### S04 · P0 — A rental creates one charge payable to the facility owner and it shows under the rentals view

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high label; creates a charge (money) for a renter
**PRs:** [#336](https://github.com/wladku/Vereino/pull/336), [#338](https://github.com/wladku/Vereino/pull/338) · **Stories:** E12-S01, E12-S02 · **Issues:** [#291](https://github.com/wladku/Vereino/issues/291), [#292](https://github.com/wladku/Vereino/issues/292)
**Route:** /backend/payments/charges?perspective=rentals and /backend/payments/charges/<id> — Płatności → Należności → Wynajmy (gmina)
**Before you start:** Club with the facilities module enabled, a facility with an owner institution and a renter institution; one person-paid open charge for comparison

**Steps**

1. In Facilities, save a new rental for the renter institution (staff form)
2. Open „Płatności” → „Należności” and pick the view „Wynajmy (gmina)”
3. Filter by „Odbiorca” and open the new rental charge
4. On the charge record read the payee line and the available head actions
5. Cancel the rental in Facilities without any payment and reopen the charge

**What to verify**

- [ ] Saving the rental → exactly one rental charge appears under „Wynajmy (gmina)” with the renter as payer
- [ ] Charge record → payee reads „na konto: {owner}” (or „właściciel obiektu” when the owner is not set), never „na konto klubu”
- [ ] Rental charge record → no „Przyjmij gotówkę” button; „Zaksięguj wpłatę” is still offered
- [ ] Saving the same rental again or approving it twice → still one charge, not two
- [ ] Free cancellation without payment → charge status becomes cancelled; with a recorded payment the charge stays untouched
- [ ] Renter/payer on the phone (/club/payments) → the rental charge is not listed

**What can go wrong**

- The „Wynajmy (gmina)” view is missing in a club with facilities, or shows in a club without facilities and without rental charges
- A second charge is created when the rental is edited or the request is approved
- The rental charge appears on a member's M-08 payments page and can be paid online
- „Przyjmij gotówkę” is offered on a rental charge

#### S05 · P0 — Accept cash from the charges list, a charge and the bank statement page; the charges list keeps its view in the URL

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high label; accepts cash (money)
**PRs:** [#338](https://github.com/wladku/Vereino/pull/338) · **Stories:** E12-S02 · **Issues:** [#292](https://github.com/wladku/Vereino/issues/292)
**Route:** /backend/payments/charges, /backend/payments/charges/<id>, /backend/payments/bank — Płatności → Należności; Płatności → Wyciągi bankowe
**Before you start:** An open charge with a person as payer; one paid charge; one imported bank transfer booked to a charge

**Steps**

1. Open „Płatności” → „Należności”; check the head buttons „Przyjmij gotówkę” and „Importuj wyciąg”
2. Pick the view „Zaległe”, set „Okres (RRRR-MM)”, then reload the page from its URL
3. Open an open person-paid charge and click „Przyjmij gotówkę”; enter the amount and click „Przyjmij {amount} zł”
4. Open „Płatności” → „Wyciągi bankowe” and accept cash from the head „Przyjmij gotówkę”
5. Open a charge paid by an imported transfer and read the „Przyjął / źródło” column of „Wpłaty”

**What to verify**

- [ ] Views appear in order „Składki”, „Zaległe”, „Zamówienia”, „Bez płatnika”, (rentals when allowed), „Wpłaty gotówką”, „Wszystkie”
- [ ] Reload of the URL → the view and the period filter are restored; rows sort by period descending
- [ ] Cash dialog from a charge → the payer is preselected and focus is on the amount; saving issues one KP receipt and refreshes the charge
- [ ] Paid, cancelled or forfeited charges show „—” in „Pozostało”
- [ ] Transfer payment row → „Przyjął / źródło” reads „wyciąg bankowy”
- [ ] Under 640 px the cash form opens full screen; Escape closes it

**What can go wrong**

- The view or filter is lost after reload, or changing the view reloads the whole page
- The dialog opened from a charge asks to search the payer again
- Two cash dialogs on the same charge both save (double receipt) instead of the second failing
- „Importuj wyciąg” does not lead to the bank statement page

#### S06 · P0 — Accept cash on the phone cash page: the receiver is named before saving and today's receipts list what was paid

**Role:** administrator · **Device:** phone 375 px · **Why P0:** accepts cash (money); raised from priority-medium
**PRs:** [#370](https://github.com/wladku/Vereino/pull/370) · **Stories:** E12-S10 · **Issues:** [#300](https://github.com/wladku/Vereino/issues/300)
**Route:** /club/cash — Strefa członka → Przyjmij gotówkę (member area page, tested at 375 px per the story)
**Before you start:** A payer with two open charges; signed-in user with cash recording rights (administrator)

**Steps**

1. Open /club/cash at 375 px
2. Search the payer in „Szukaj po nazwisku płatnika lub dziecka” and tick the charges
3. Read the line under the form before saving
4. Click „Przyjmij {amount} zł”
5. Read the list „Przyjęte przeze mnie dziś”

**What to verify**

- [ ] Before saving → „Przyjmuje: {name}. Numer potwierdzenia nada system (KP/…).” shows the signed-in user
- [ ] After saving → toast with the KP receipt number
- [ ] „Przyjęte przeze mnie dziś” lists the charge description above the receipt number
- [ ] Total line „Do przekazania skarbnikowi: {amount}” matches the sum

**What can go wrong**

- The receiver line is missing or names someone else
- Today's list shows only receipt numbers without the charge description
- A reversed receipt still counts in the total to hand over

#### S07 · P0 — Add a charge by hand, assign a payer to a charge without one, and see a person's charges on their record

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high label; creates charges and decides who pays
**PRs:** [#344](https://github.com/wladku/Vereino/pull/344) · **Stories:** E12-S05 · **Issues:** [#295](https://github.com/wladku/Vereino/issues/295)
**Route:** /backend/payments/charges, /backend/payments/charges/<id>, /backend/people/persons/<id>?tab=charges — Płatności → Należności; person record → Należności tab
**Before you start:** A minor without a guardian, a minor with a guardian (not yet primary payer), an adult member; a coordinator account for the negative check

**Steps**

1. Open „Płatności” → „Należności” and click „Dodaj należność”; choose the minor without a guardian, enter „Opis”, „Kwota (zł)” and „Termin płatności”, click „Dodaj należność”
2. Open the new charge (view „Bez płatnika”) and click „Przypisz płatnika”; try a person who is not a guardian, then a guardian, and click „Przypisz”
3. On another ward's open charge without a payer, mark the ward's guardian as primary payer on the „Opieka” tab
4. Open a person record and the tab „Należności”; click „Dodaj należność” there
5. Sign in as a coordinator and open the same person record

**What to verify**

- [ ] Manual charge for the minor without guardian → toast „Dodano należność bez płatnika — przypisz go na należności”
- [ ] Assigning a non-guardian → refused as not eligible; assigning a guardian → payer set and the charge shows on that payer's /club/payments
- [ ] Marking a guardian as primary payer → the ward's open charges without payer get that payer; paid charges unchanged
- [ ] Person's „Należności” tab lists all their charges with the list columns; a row opens the charge record
- [ ] Coordinator → no „Należności” tab on the person record
- [ ] Description shorter than 3 characters or amount 0 → field errors, nothing saved

**What can go wrong**

- A second assignment on the same charge silently overwrites the first payer
- The guardianship change assigns the payer to already paid charges
- The Charges tab is visible to a coordinator or shows charges of another club
- The manual charge can be edited after creation

#### S08 · P0 — Administrator anonymises a former person on a recorded request and deletes a person created by mistake

**Role:** administrator · **Device:** desktop · **Why P0:** anonymises and deletes personal data
**PRs:** [#437](https://github.com/wladku/Vereino/pull/437) · **Stories:** E13-S06 · **Issues:** [#308](https://github.com/wladku/Vereino/issues/308)
**Route:** /backend/people/persons/{id} → tab „Odejście”
**Before you start:** Former person with closed account and a payment this year; former person with an open charge; former person without payments; a person without any history and one with an attendance.

**Steps**

1. Try „Zanonimizuj” on the person with an open charge and without a recorded request
2. „Zapisz prośbę” for data deletion, then „Zanonimizuj”, type a wrong last name, then the right one
3. Search the old name in „Osoby”
4. On the person without history click „Usuń osobę”, then undo; try on the person with attendance

**What to verify**

- [ ] Blocked with reasons (open charges, no request, account open)
- [ ] Wrong last name refused
- [ ] Contact and identity fields cleared; name kept with a hold date only for administrators; screens show „Były członek”; old name not found
- [ ] Without payments the name is cleared too
- [ ] Delete works and undo restores; person with attendance is refused with a link to „Odejście z klubu”

**What can go wrong**

- Data visible after anonymisation or in another tenant
- Delete allowed for a person with history

#### S09 · P0 — Administrator cancels a part and the whole club event; families are notified

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high #426 (cancel cascades to part sessions and notifications)
**PRs:** [#430](https://github.com/wladku/Vereino/pull/430), [#426](https://github.com/wladku/Vereino/pull/426) · **Stories:** E14-S03, E14-S01 · **Issues:** [#378](https://github.com/wladku/Vereino/issues/378), [#376](https://github.com/wladku/Vereino/issues/376)
**Route:** /backend/activities/club-events/{id} — Harmonogram → Imprezy klubowe → event record
**Before you start:** A planned club event with several future group parts (with members in the groups) and one open part without a club group at an external place.

**Steps**

1. Open the event record, tab „Części ({count})”, choose „Odwołaj część” on a part and enter a reason
2. Click „Odwołaj imprezę klubową” in the header, read the dialog, enter a reason and confirm
3. Open the „Odwołane” view of the list
4. As a guardian of a child in one of the groups, check the notification / session in the app

**What to verify**

- [ ] Cancelled part stays in the table struck through with „Odwołana: {reason}”
- [ ] Cancel dialog states how many planned parts' families will be told; the toast „Odwołano imprezę klubową. Powiadomione osoby: {count}.” names the number
- [ ] Every planned future part session is cancelled; the record shows „Ta impreza klubowa jest odwołana” with „Powód: {reason}”
- [ ] The event appears under „Odwołane” with status „Odwołana”

**What can go wrong**

- Part sessions remain planned after the event is cancelled (families still see them)
- Notification count in the toast is 0 although groups had members
- Cancelled part disappears from the table instead of staying struck through

#### S10 · P0 — Administrator corrects a roster mistake in the panel: add, edit, end on a chosen day, remove

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high; deletes membership records of children
**PRs:** [#355](https://github.com/wladku/Vereino/pull/355), [#396](https://github.com/wladku/Vereino/pull/396) · **Stories:** E10-S02 · **Issues:** [#267](https://github.com/wladku/Vereino/issues/267), [#359](https://github.com/wladku/Vereino/issues/359)
**Route:** /backend/groups/groups/<id> (tab Skład) — Grupy → Grupy → group → „Skład”
**Before you start:** A group with many memberships (ideally >100) incl. one active member with attendance, one active member without attendance and one upcoming (future-start) membership; a person named 'Jan…' not yet in the group.

**Steps**

1. Open the group and the tab „Skład”; page through „Aktywni”, „Przyszli” and „Historia”
2. Click „Dodaj do składu”, type 'Jan' in „Szukaj po imieniu lub nazwisku”, pick a person, set „Od” and save
3. On an active member without attendance use the row menu „Zakończ członkostwo”, set „Ostatni dzień” to 30.11 and confirm
4. On the member with attendance choose „Usuń” and confirm
5. On the upcoming membership open the row menu, use „Zmień” and „Usuń”, then use undo on the removal toast
6. Navigate the add/end dialogs with the keyboard and a screen reader

**What to verify**

- [ ] Each view's count in the tab label „{label} ({count})” matches the rows reachable by paging
- [ ] Search options read „Name (wiek N)” and exclude current members; the saved row appears after the coaches
- [ ] Ended membership → 'Do' shows 30.11 and the row moves to „Historia” from 1.12
- [ ] Removing a member with attendance → dialog „To członkostwo było używane” offering to end it instead; nothing deleted
- [ ] Upcoming membership row menu offers only „Zmień” and „Usuń”; a removed row comes back after undo
- [ ] Search box has an accessible name; invalid date errors are announced with their field

**What can go wrong**

- Rows beyond the first page unreachable or counts differ from the data
- Remove deletes a membership that has attendance history
- End offered on an upcoming membership, or the end date saved off by one day
- Undo does not restore the removed row

#### S11 · P0 — Administrator creates a club event in the panel with a new external place and builds its parts by day

**Role:** administrator · **Device:** desktop · **Why P0:** includes priority-high PRs #425/#426 (new place command, part-session guards)
**PRs:** [#430](https://github.com/wladku/Vereino/pull/430), [#425](https://github.com/wladku/Vereino/pull/425), [#426](https://github.com/wladku/Vereino/pull/426) · **Stories:** E14-S03, E14-S02, E14-S01 · **Issues:** [#378](https://github.com/wladku/Vereino/issues/378), [#377](https://github.com/wladku/Vereino/issues/377), [#376](https://github.com/wladku/Vereino/issues/376)
**Route:** /backend/activities/club-events, /backend/activities/club-events/create, /backend/activities/club-events/{id}?tab=parts — Harmonogram → Imprezy klubowe
**Before you start:** Example club with at least one section, two groups with a coach, one external team; the hall to be added (e.g. a sports hall in another village) is not yet on the places list.

**Steps**

1. Open „Harmonogram” → „Imprezy klubowe”, switch the views „Nadchodzące” / „Minione” / „Odwołane”, then click „Nowa impreza klubowa”
2. Fill „Nazwa”, leave „Adres publiczny” empty, pick a „Sekcja” (or „Cały klub”), click „Dodaj miejsce”, fill name and address in the „Dodaj obiekt” dialog and click „Dodaj obiekt”
3. Tick „Publiczna” and save the event
4. On the „Części ({count})” tab click „Dodaj część”, set „Tytuł”, „Dzień”, time, „Nasza grupa”, „Kategoria”, coach; add a team with „Dodaj drużynę z listy” and create a new one with „Dodaj drużynę”, then save with „Dodaj część”
5. On the new row use „Kopiuj”, save the copy with another time; then use „Przenieś” on a group part and save a new time
6. Use „Usuń” on a part with no declarations, and „Usuń” on a part that already has a declaration
7. Try the same hall again via „Dodaj miejsce” with the same name and address

**What to verify**

- [ ] Saving the place dialog → the new place is selected in „Miejsce”, marked „(zewnętrzne)”, toast „Dodano i wybrano: {name}”; the list column „Miejsce” shows the „zewnętrzne” badge
- [ ] Saving without a public address → the server proposes one from the name (e.g. gwiazda-cup-2026)
- [ ] Parts appear in one table per day heading with visiting teams, coach (or „brak trenera” badge) and status
- [ ] „Przenieś” dialog shows the place read-only (the club event's place) and the save toast names how many people were told
- [ ] „Usuń” on a part with a declaration → „Tej części nie można usunąć” offering to cancel it instead; nothing deleted
- [ ] Adding the same hall twice → the dialog offers „Wybierz ten obiekt” instead of creating a duplicate

**What can go wrong**

- Duplicate external place created when the same hall is added twice (or by two people at once)
- Part session moved to a different place than the event's, or a group part can be edited from the activity/session screen bypassing the event
- A part with declarations gets deleted silently
- New place not selected after saving the dialog, forcing a manual reload

#### S12 · P0 — Administrator finds the Club group, tabbed admin pages and mockup wording in the sidebar; lists load once

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high PRs; a tab hides itself and answers 403 for users without the feature (access)
**PRs:** [#313](https://github.com/wladku/Vereino/pull/313), [#318](https://github.com/wladku/Vereino/pull/318), [#319](https://github.com/wladku/Vereino/pull/319), [#334](https://github.com/wladku/Vereino/pull/334) · **Stories:** E09-S01, E09-S02, E09-S03 · **Issues:** [#246](https://github.com/wladku/Vereino/issues/246), [#256](https://github.com/wladku/Vereino/issues/256), [#257](https://github.com/wladku/Vereino/issues/257)
**Route:** /backend/club/sections, /backend/club/places, /backend/club/institutions, /backend/club/contracts, /backend/communication/threads, /backend/communication/cases, /backend/facilities/zones (closures, rates), /backend/facilities/logs (incidents, bans, maintenance), /backend/facilities/reports/owner (rented-hours) — sidebar Klub, Wiadomości, Obiekty
**Before you start:** Example club with sections, places, an institution with a contract, threads, facility logs; an administrator account and a user with club_core.manage but without club_core.contracts.manage.

**Steps**

1. Sign in as the administrator and open /backend; expand the sidebar group „Klub”
2. Open „Instytucje”, then click the tab „Umowy” in the strip „Instytucje i umowy”
3. Open /backend/club/institutions?tab=contracts directly
4. Open the „Obiekty” group and walk the tab strips „Strefy i cennik” („Strefy”, „Zamknięcia”, „Cennik wynajmu”), „Dziennik i incydenty” („Dziennik”, „Incydenty”, „Zakazy wstępu”, „Konserwacja”) and „Raport dla gminy” („Wynajmowane godziny”)
5. Open „Wątki i sprawy” and switch „Wszystkie” / „Sprawy”
6. Sign in as the user without contracts permission and open the institutions page and /backend/club/contracts
7. With DevTools Network open, load /backend/club/sections and /backend/club/places, then reload

**What to verify**

- [ ] Sidebar group „Klub” lists „Sekcje”, „Miejsca”, „Instytucje” and „Umowy”; /backend/club/places shows the main sidebar (not the settings sidebar) with Places active
- [ ] /backend/club/settings still shows „Ustawienia klubu” and „Publikacja strony klubu” in the settings sidebar
- [ ] Clicking „Umowy” goes to /backend/club/contracts while the title still reads „Instytucje i umowy”; ?tab=contracts redirects to /backend/club/contracts
- [ ] The facility group has six items; no separate Closures, Rates, Incidents, Bans, Maintenance or Rented hours menu items
- [ ] Without contracts permission the „Umowy” tab is absent (no strip with one tab) and the URL answers 403
- [ ] Each list sends one list request per page load (also after reload); Polish texts read „Miejsca”, „Zgłoszenia”, „Incydenty”, „Cennik wynajmu”

**What can go wrong**

- Klub group missing again or Places only reachable by URL
- Tab strip shown with a single tab, or a forbidden tab rendered that leads to 403
- Rows flicker/redraw a second after load (double fetch) and an opened row menu closes
- Retired words (Obiekt for places, Wniosek, Zdarzenie, Stawki najmu) reappear

#### S13 · P0 — Administrator moves a rental and its unpaid charge follows the new slot and place

**Role:** administrator · **Device:** desktop · **Why P0:** moves money: re-quotes the amount and re-dates the charge
**PRs:** [#427](https://github.com/wladku/Vereino/pull/427), [#315](https://github.com/wladku/Vereino/pull/315) · **Stories:** — · **Issues:** [#221](https://github.com/wladku/Vereino/issues/221)
**Route:** /backend/facilities/rentals and /backend/facilities/rentals/<id> — Obiekty → Wynajmy
**Before you start:** Payments enabled; a rental with an unpaid charge; a second place with different rates; a third place with no rate for the renter's category; a rental whose charge already has a payment; browser time zone different from the club's.

**Steps**

1. Open the unpaid rental, click „Przenieś”, pick a later date on the same place and confirm „Przenieś”
2. Move the same rental to the second place
3. Try to move it to the place with no rate
4. Move the rental whose charge holds a payment
5. Open the charge after each move

**What to verify**

- [ ] Same-place move → amount unchanged; „Wpłata do” and the charge due date and description follow the new slot
- [ ] Other-place move → amount re-quoted from that place's rates; the charge amount and payee follow
- [ ] No rate → „Brak pozycji cennika dla tego miejsca, kategorii najemcy i daty. Dodaj ją w Cenniku wynajmu.”; rental stays
- [ ] Charge with a payment → left unchanged, rental keeps amount and deadline
- [ ] Move dialog times read in the club zone even with a foreign browser zone

**What can go wrong**

- Charge keeps the old due date after a move
- Move to another place keeps the old amount
- Partly paid charge rewritten

#### S14 · P0 — Administrator or coordinator starts a new season in one previewed step

**Role:** administrator · **Device:** desktop · **Why P0:** moves fees (money) and changes section-scoped rights
**PRs:** [#406](https://github.com/wladku/Vereino/pull/406) · **Stories:** E13-S09 · **Issues:** [#311](https://github.com/wladku/Vereino/issues/311)
**Route:** /backend/groups/seasons/rollover — Grupy → Grupy → tab „Sezony” → „Rozpocznij nowy sezon”
**Before you start:** A season with four groups in two sections, each with members, a recurring activity and a monthly fee; a rental that collides with one copied activity slot; a coordinator of one section.

**Steps**

1. Open tab „Sezony” and click „Rozpocznij nowy sezon”
2. In „1. Sezon” choose „Obecny sezon” and „Utwórz nowy sezon”, click „Dalej”
3. In „2. Grupy” set „Kontynuuj”, „Zmień nazwę”, „Zamknij” and a copy name for the groups
4. In „3. Zajęcia i składki” choose „Zakończ i skopiuj” with a new „Nowa kwota (zł)”, tick „Ogłoś w wątkach grup”
5. Click „Pokaż podgląd”, then „Zastosuj”; click „Zastosuj” again with the same plan
6. Repeat as the coordinator

**What to verify**

- [ ] Applied → „Nowy sezon rozpoczęty” summary; groups, memberships and old fees end on the last day, copies start on the new dates with the new amount
- [ ] Colliding copied activity → conflict list, nothing applied
- [ ] Group changed between preview and apply → „Plan zmienił się od podglądu…”; second apply changes nothing
- [ ] Coordinator sees only their groups („Widzisz tylko grupy, którymi zarządzasz.”); the other section stays untouched
- [ ] Each continued group's thread gets exactly one announcement

**What can go wrong**

- Partial apply after a conflict
- Duplicate fees or memberships after a second apply
- Coordinator can include another section's groups

#### S15 · P0 — Administrator plans a series without collisions and works one activity's sessions

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high; restore is administrator-only (coordinator refused)
**PRs:** [#340](https://github.com/wladku/Vereino/pull/340), [#314](https://github.com/wladku/Vereino/pull/314) · **Stories:** E10-S03, E06-S12 · **Issues:** [#268](https://github.com/wladku/Vereino/issues/268), [#248](https://github.com/wladku/Vereino/issues/248)
**Route:** /backend/activities/activities/create, /backend/activities/occurrences?activityId=…&view=…, /backend/activities/reports/coach-units — Harmonogram → Aktywności / Terminy / Raport jednostek
**Before you start:** A club with at least one bookable place and an existing booking that collides with a planned slot; sessions in every state (unassigned, flagged for reschedule, cancelled future and cancelled past); a second test club without any bookable place; users with Polish and English UI.

**Steps**

1. Open „Harmonogram” → „Aktywności”, click „Nowa aktywność”, fill a weekly series that collides and click „Podgląd”
2. Change the hours so the preview shows „Brak kolizji” and click „Utwórz”
3. On the sessions list switch the views „Do obsadzenia” and „Do przełożenia”; on a flagged row use „Przenieś” into a free slot, then into a colliding slot
4. Open a cancelled future session and click „Przywróć termin” with a reason; repeat as a section coordinator and on a cancelled past session
5. Open „Kalendarz” on „Terminy” for a week without timed sessions and press Tab through the page
6. Open „Raport jednostek” and click „Eksportuj CSV” as a Polish and as an English user

**What to verify**

- [ ] Preview with collisions → „Utwórz” disabled with „Najpierw podgląd bez kolizji”; after a clean preview it is enabled and saving opens the sessions list scoped to the new activity
- [ ] Club without a bookable place → hint „Klub nie ma jeszcze własnego miejsca do rezerwacji…” with link „Przejdź do miejsc” instead of an empty select
- [ ] ?view=unassigned and ?perspective=unassigned show the same sessions; a move into a free slot clears the „Do przełożenia” flag; a colliding move lists the collisions in the dialog
- [ ] Restore as administrator → session planned again, toast „Termin przywrócony.”; coordinator cannot restore; past session → „Ten termin już się zakończył i nie można go przywrócić.”
- [ ] Empty week calendar → the hours grid („Godziny kalendarza, przewijane”) receives keyboard focus and scrolls with arrow keys
- [ ] CSV headers in the user's language, ';' separator for pl and ',' for en

**What can go wrong**

- Create enabled before a clean preview, creating a series with collisions
- Move into a collision silently saves
- Coordinator sees and can use „Przywróć termin”
- Time grid unreachable by keyboard in a week without sessions

#### S16 · P0 — Administrator re-sends an invitation, changes the login e-mail and blocks an account on the Account tab

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high; blocking changes who can sign in
**PRs:** [#339](https://github.com/wladku/Vereino/pull/339) · **Stories:** E13-S01 · **Issues:** [#303](https://github.com/wladku/Vereino/issues/303)
**Route:** /backend/people/persons/{id} → tab „Konto” (Ludzie → Osoby)
**Before you start:** A person with an invited (not accepted) account, one with an active account, and the club's only active administrator.

**Steps**

1. Open the invited person, tab „Konto”, click „Wyślij zaproszenie ponownie” (four times within 5 minutes)
2. Click „Zmień e-mail logowania” and enter a free address, then an address used in the tenant
3. Open the active person and click „Zablokuj”, try to sign in as that person, then „Odblokuj”
4. Try to block the only club administrator

**What to verify**

- [ ] State shows „Zaproszenie wysłane” then a 'sent again today' line; old link stops working, new one works
- [ ] Fourth re-send is refused with a wait time; re-send on an active account reloads the tab as „Aktywne”
- [ ] Free e-mail sends the invitation to it; taken e-mail is refused
- [ ] Blocked: sessions end and sign-in is refused until unblocked; roles and data stay
- [ ] Last administrator cannot be blocked

**What can go wrong**

- Old invitation link still works
- Blocked user keeps an open session
- Contact e-mail overwritten when it differed from the login

#### S17 · P0 — Administrator reads one place's day on the facility calendar hour axis

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high; place scope of the calendar and options decides who sees renter contacts
**PRs:** [#335](https://github.com/wladku/Vereino/pull/335), [#337](https://github.com/wladku/Vereino/pull/337) · **Stories:** E11-S01, E11-S02 · **Issues:** [#275](https://github.com/wladku/Vereino/issues/275), [#276](https://github.com/wladku/Vereino/issues/276)
**Route:** /backend/facilities/calendar?place=&date= — Obiekty → Kalendarz obiektu; place form /backend/club/places/<id>/edit
**Before you start:** A complex with two leaf pitches and an external hall; zone rules with a reservable paid window on one pitch; on one day a session with a coach, a club booking, a rental with a contact, a held online request, a closure and a maintenance window (one entry at 06:00, one ending at 23:00); a second pitch without bookable windows; one closed day.

**Steps**

1. Open „Obiekty” → „Kalendarz obiektu” with no address parameters
2. Pick the second pitch in the „Miejsce” chips, then a day in the „Dzień” chips; then use „Inny dzień” to jump to the prepared busy day
3. Reload the page, then press the browser back button
4. Scroll to „Wpisy dnia” and use each row action: „Otwórz wynajem”, „Decyzja”, „Zamknięcia”, „Otwórz zadanie”
5. Switch on the „Do przeniesienia” filter; open the „Dostępność do rezerwacji z zewnątrz” card on the pitch without bookable windows
6. Follow „Ustawienia miejsca”, then use the place form's „Kalendarz obiektu” and „Strefy i cennik” links back
7. Repeat on a 375 px window in both locales and dark mode

**What to verify**

- [ ] First load → first bookable place and today are shown and the address gains ?place=&date=; reload and back restore the same place and day
- [ ] Busy day → session, club booking, rental, held request, closure and maintenance are all drawn with labels (e.g. „Wynajem: …”, „Zgłoszenie: … (czeka na akceptację)”) and listed in „Wpisy dnia”; overlapping entries sit side by side in lanes
- [ ] Entries at 06:00 and until 23:00 → the axis runs 06:00–23:00 instead of 08:00–22:00
- [ ] Closed day → „Obiekt zamknięty w tym dniu.” and no hour is a clickable button
- [ ] Pitch without bookable windows → the availability card is open and says „obiekt przyjmuje zgłoszenia online” or „obiekt nie przyjmuje zgłoszeń online”
- [ ] Place chips list only club places (no external hall); at 375 px only the axis scrolls sideways, never the page

**What can go wrong**

- Calendar still shows the old weekly text list or misses rentals/requests
- Place or day is lost on reload/back (address not updated)
- Axis clipped at 08:00/22:00 hiding early or late entries
- Hours on a closed day are still clickable

#### S18 · P0 — Administrator records and confirms a family's departure with a preview, then returns a person

**Role:** administrator · **Device:** desktop · **Why P0:** ends memberships, guardianships and accounts; payer change
**PRs:** [#365](https://github.com/wladku/Vereino/pull/365) · **Stories:** E13-S04 · **Issues:** [#306](https://github.com/wladku/Vereino/issues/306)
**Route:** /backend/people/persons/{id} → tab „Odejście”; /backend/people/persons view „Byli członkowie”
**Before you start:** Guardian with two wards in two groups (primary payer); a staying minor whose only guardian leaves; an open request from the phone.

**Steps**

1. Open the guardian, tab „Odejście”; see „Prośby”, „Odrzuć” / „Otwórz”, or click „Zapisz prośbę”
2. In „Odejście z klubu” choose „Kto odchodzi” and a future „Ostatni dzień”; read the preview
3. If asked, choose „Kto płaci za {name} od następnego dnia”; click „Potwierdź odejście”
4. Try a past date and a guardian whose ward would stay without a guardian
5. After the last day open the list view „Byli członkowie” and click „Powrót do klubu”

**What to verify**

- [ ] Preview lists „Zakończy się” and „Blokady”; confirm ends memberships, roles, guardianships on the last day
- [ ] Accounts close the next day; persons show under „Byli członkowie” and leave pickers
- [ ] Ward without guardian blocks; missing next payer, stale preview and past date are refused
- [ ] „Powrót do klubu” clears the date without restoring memberships

**What can go wrong**

- Partial departure after an error
- Former persons still in pickers or audiences
- Later attendance rows not dropped

#### S19 · P0 — Administrator saves a rental, a group event or a club booking from a free hour in one slot dialog

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high; the rental save fixes the amount and payment deadline (money)
**PRs:** [#342](https://github.com/wladku/Vereino/pull/342), [#315](https://github.com/wladku/Vereino/pull/315), [#360](https://github.com/wladku/Vereino/pull/360) · **Stories:** E11-S03, E11-S07 · **Issues:** [#277](https://github.com/wladku/Vereino/issues/277), [#221](https://github.com/wladku/Vereino/issues/221), [#281](https://github.com/wladku/Vereino/issues/281)
**Route:** /backend/facilities/calendar — Obiekty → Kalendarz obiektu; /backend/facilities/rentals — Obiekty → Wynajmy
**Before you start:** A pitch with a reservable paid zone and rates; a non-reservable zone on the same pitch; an existing rental on one hour; a held online request on another hour; an institution that rented the pitch before; the browser time zone set far from the club's (e.g. Pacific/Honolulu).

**Steps**

1. On „Kalendarz obiektu” click a free hour button („Zarezerwuj od …:00”)
2. In „Rodzaj” keep „Wynajem zewnętrzny”, search the renter under „Najemca” (type 2+ characters), fill „Cel” and „Uwagi”, click „Rezerwuj”
3. Click another free hour lying on the existing rental's slot and save a rental again; then try an hour in the non-reservable zone
4. On the held request's hour switch „Rodzaj” to „Dla grupy (wydarzenie)” and save an event
5. Open a past day (yesterday) and click an hour: only „Cel ogólny (rezerwacja klubu)” is offered; save it
6. Open „Obiekty” → „Wynajmy”, click „Nowy wynajem” and check the same dialog opens with no preset slot

**What to verify**

- [ ] Rental saved → toast „Wynajem zapisany: …” with amount and deadlines; the rental appears on the axis with purpose and notes stored
- [ ] Rental over a taken slot → „Termin zajęty” alert listing colliding entries as from–to label; nothing saved
- [ ] Non-reservable zone → „Ten termin nie leży w strefie rezerwowalnej, płatnej tego miejsca.” at the start field
- [ ] Group event over a held request → toast adds „Przebito 1 zgłoszenie zewnętrzne (e-mail wysłany).”
- [ ] Yesterday's club booking saves for the administrator; 100 days back answers „Rezerwację klubu można wpisać najwyżej 92 dni wstecz.”
- [ ] With a foreign browser time zone, 08:00 typed in the dialog is saved and listed as 08:00 club time

**What can go wrong**

- Times shift by hours when the browser zone differs from the club zone
- Conflict saves silently or shows a generic error without the colliding entries
- Renter search empty or showing persons who never rented
- „Nowy wynajem” opens an old separate dialog

#### S20 · P0 — Administrator sees the greeting, menu counts and the member-interface link; coordinator and attendant get their own dashboards

**Role:** administrator · **Device:** desktop · **Why P0:** grants dashboards.view to coordinator and attendant (changes who can see what)
**PRs:** [#413](https://github.com/wladku/Vereino/pull/413) · **Stories:** E09-S06 · **Issues:** [#260](https://github.com/wladku/Vereino/issues/260)
**Route:** /backend (dashboard) — sidebar „Terminy”, „Wyciągi bankowe”, „Zbiórki zamówień”, „Zgłoszenia do akceptacji”; top bar „Interfejs członkowski”
**Before you start:** Administrator linked to a person; one future session without a coach, two bank transactions to decide, one open order campaign, one rental request awaiting approval; a coordinator of another section and a facility attendant account.

**Steps**

1. Sign in as the administrator and open /backend
2. Read the greeting above the dashboard and the counts in the sidebar
3. Click „Interfejs członkowski” in the top bar (and in the mobile more menu below 768 px)
4. Sign in as the coordinator, then as the facility attendant, and open /backend

**What to verify**

- [ ] Greeting „Dzień dobry, {first name}” with „{date} · co wymaga dziś działania”
- [ ] „Terminy” shows 1, „Wyciągi bankowe” 2, „Zbiórki zamówień” 1, „Zgłoszenia do akceptacji” 1; above 99 shows 99+, zero shows nothing
- [ ] „Interfejs członkowski” opens /club; a user without a member side sees no such link
- [ ] Coordinator sees only widgets 1, 2 and 8 and no Terminy count for another section; attendant sees widget 8 only; no platform widget

**What can go wrong**

- Counts stay stale after navigation or show 0 badges
- Coordinator/attendant get 403 or an empty dashboard, or see admin widgets
- Greeting shows the platform heading or no name for a linked administrator

#### S21 · P0 — Administrator sets payment days and automatic expiry on a facility management agreement

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high; sets payment deadlines and auto-cancels unpaid rentals (money)
**PRs:** [#343](https://github.com/wladku/Vereino/pull/343) · **Stories:** E11-S10 · **Issues:** [#284](https://github.com/wladku/Vereino/issues/284)
**Route:** /backend/club/contracts (create/edit) — Klub → Instytucje i umowy → Umowy; then /backend/facilities/rentals
**Before you start:** Two owner institutions, each the payee of a place; rates on both places; ability to run the rental lifecycle (wait for the 15-minute job or have a developer run `yarn mercato facilities rental-lifecycle --now …`).

**Steps**

1. Open „Klub” → „Instytucje i umowy”, tab „Umowy”, click „Dodaj umowę”, kind „Zarządzanie obiektem” for the first owner
2. In „Warunki wynajmu” enter 61 in „Dni na wpłatę przed rozpoczęciem” and save; correct it to 5 and tick „Odwołuj nieopłacone wynajmy automatycznie”
3. Enter a rental on each owner's place from the slot dialog and read the quote's „Termin płatności”
4. Let the first owner's rental pass its payment deadline unpaid and run the lifecycle twice
5. Open „Obiekty” → „Wynajmy” → „Nieopłacone po terminie”

**What to verify**

- [ ] 61 days → „Podaj liczbę całkowitą dni od 0 do {max}.” at the field; 5 saves
- [ ] Deadlines → 5 days before start for the agreement's owner, 3 days for the owner without terms
- [ ] Expired unpaid rental → status „Anulowany (bezpłatnie)” and record note „Odwołano automatycznie: brak wpłaty w terminie”, done once only
- [ ] Second owner's late rental → listed under „Nieopłacone po terminie”, not cancelled

**What can go wrong**

- Terms field accepts out-of-range values
- Deadline ignores the agreement (always 3 days)
- Rental cancelled twice or the second owner's rental also cancelled

#### S22 · P0 — Administrator uses the remaining panel functions on publication, sections, contracts and people

**Role:** administrator · **Device:** desktop · **Why P0:** changes who sees PESEL and gives coordinators a read-only tab (access)
**PRs:** [#323](https://github.com/wladku/Vereino/pull/323) · **Stories:** E09-S08 · **Issues:** [#262](https://github.com/wladku/Vereino/issues/262)
**Route:** /backend/club/publication, /backend/club/sections/create, /backend/club/sections/{id}/edit, /backend/club/institutions, /backend/club/contracts, /backend/people/persons, /backend/people/persons/{id}
**Before you start:** Club with facility calendars off; an adult and a minor person; an institution with contracts; a section coordinator account; a user without people.pesel.view.

**Steps**

1. On „Publikacja strony klubu” turn „Zgłoszenia rezerwacji online” on while „Kalendarz obiektów” is off; then turn calendars off with requests on
2. Create a section via „Nowa sekcja” choosing a „Koordynator”; open the coordinator picker
3. As the section coordinator open the section and the „Koordynatorzy” tab; save „Szczegóły”
4. On „Instytucje” follow an institution's „Umowy” link and back
5. On „Osoby” filter by role „Animator obiektu” and click „Importuj”
6. As a user without PESEL permission open a person record

**What to verify**

- [ ] Requests cannot be turned on while calendars are off (field error); turning calendars off turns both off after a confirmation
- [ ] Section and coordinator role are created; picker lists adults only
- [ ] Coordinator sees „Koordynatorzy” read-only; saving Details stays on the record
- [ ] Contracts list filtered by institution with columns „Od”, „Podstawa”, „Za jednostkę”, „Mecz”
- [ ] „Importuj” opens /backend/people/imports; record header shows age and „ma konto”; PESEL field empty and disabled with „Widoczny tylko dla administratora”

**What can go wrong**

- A stored legacy combination of flags no longer saves
- Minor offered as coordinator
- PESEL value or a 'has PESEL' hint leaks to a user without permission

#### S23 · P0 — Administrator works the rentals list and corrects a rental on its record page

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high; record shows payment state and ban check blocks renters
**PRs:** [#341](https://github.com/wladku/Vereino/pull/341) · **Stories:** E11-S05 · **Issues:** [#279](https://github.com/wladku/Vereino/issues/279)
**Route:** /backend/facilities/rentals?status=&view= and /backend/facilities/rentals/<id> — Obiekty → Wynajmy
**Before you start:** Rentals in every status: one flagged for rescheduling, one unpaid past its deadline, one pending approval, one unregistered requested rental, one done rental; an institution with an active entry ban.

**Steps**

1. Open „Obiekty” → „Wynajmy”; walk the tabs „Aktywne”, „Czekają na akceptację”, „Wszystkie” and the views „Do przeniesienia”, „Nieopłacone po terminie”; reload on each
2. On the pending row click „Decyzja”; go back and click a row to open its record page
3. On the unregistered requested rental edit contact, „Cel” and „Uwagi” in „Najemca i kontakt”, pick an institution under „Najemca z rejestru”, click „Zapisz zmiany”, then undo
4. Assign the banned institution and save
5. Open the done rental and edit its contact, then only its notes
6. Edit the same rental in two tabs and save the older one

**What to verify**

- [ ] Tab and view survive reload in the address; „Decyzja” opens „Zgłoszenia do akceptacji”
- [ ] Record page shows sections „Najemca i kontakt”, „Płatność”, „Historia” with every saved field (deadlines, payee, charge state, source)
- [ ] Correction saves contact, purpose, notes and the institution's name; undo restores the previous values
- [ ] Banned institution → „Ten najemca ma aktywny zakaz wstępu na to miejsce.”
- [ ] Done rental → contact change refused with „Wynajem jest zamknięty — można zmienić tylko notatki.”, notes change accepted
- [ ] Stale save → the shared conflict dialog, nothing overwritten

**What can go wrong**

- View or tab resets after reload
- Renter name not replaced after assigning an institution
- Closed rental contact silently changed
- Undo leaves the institution linked

#### S24 · P0 — Decide each bank transfer with row buttons and delete an import from which nothing was booked

**Role:** administrator · **Device:** desktop · **Why P0:** books transfers (money) and deletes imported data
**PRs:** [#389](https://github.com/wladku/Vereino/pull/389), [#338](https://github.com/wladku/Vereino/pull/338) · **Stories:** E12-S04 · **Issues:** [#294](https://github.com/wladku/Vereino/issues/294)
**Route:** /backend/payments/bank — Płatności → Wyciągi bankowe
**Before you start:** An imported statement with a suggested match, an unmatched transfer and an automatically booked transfer; a second statement file with nothing booked

**Steps**

1. Open „Płatności” → „Wyciągi bankowe” at 1280 px
2. On a suggested row click „Potwierdź”; on an unmatched row click „Przypisz”; on another click „Pomiń”, then „Przywróć”
3. Compare the status badges of the auto-booked and the confirmed transfer
4. In „Historia importów” click „Usuń” on the import with nothing booked and confirm
5. Import the same file again; then try „Usuń” on an import with a booked-then-undone transfer

**What to verify**

- [ ] Suggested rows show „Potwierdź”, „Zmień”, „Pomiń” as row buttons (not in a menu) at 1280 px; after a decision focus moves to the next row
- [ ] Only the auto-booked transfer reads „Zaksięgowany automatycznie”; the confirmed one reads „Zaksięgowany”
- [ ] „Historia importów” columns: „Plik”, „Zaimportowano”, „Kto”, „Pozycje”, „Automatycznie”, „Do potwierdzenia”, „Nierozpoznane”, „Pominięte”
- [ ] Delete confirmation names the counts; after deleting the import disappears and the same file imports again
- [ ] Import with any booking (even undone) → delete refused with a conflict message, nothing removed

**What can go wrong**

- Delete is allowed on an import that had a booking, losing payment history
- Re-importing the deleted file is rejected as duplicate
- Row buttons fold into a menu on desktop, or overflow at 375 px

#### S25 · P0 — Families are notified in the thread, in the app and by e-mail when a session moves or is restored

**Role:** administrator · **Device:** desktop · **Why P0:** priority-high; notifies families by e-mail, must not leak across tenants
**PRs:** [#356](https://github.com/wladku/Vereino/pull/356) · **Stories:** E10-S06 · **Issues:** [#271](https://github.com/wladku/Vereino/issues/271)
**Route:** /backend/activities/occurrences, /backend/communication/threads/<id> — Harmonogram → Terminy; Wiadomości → Wątki
**Before you start:** A planned future session of a group with a group thread: two guardians (one without an account), a participant with an account and a coach; a weekly series with ten future sessions, one already moved (detached); a cancelled future session.

**Steps**

1. On „Terminy” use „Przenieś” on the single session, change the time and click „Przenieś termin”
2. Open the group thread under „Wiadomości” → „Wątki” and the recipients' notifications/inboxes
3. Change only the coach, then only the confirmation deadline of another session and save
4. Change the start time of the weekly series on the activity; then change only its description
5. Restore the cancelled future session with „Przywróć termin”

**What to verify**

- [ ] Move → toast „Przeniesiono termin. Powiadomione osoby: {count}.”; each recipient with an account gets one app notification and one e-mail with old → new values; the actor gets nothing
- [ ] The thread gets one system message naming who changed it; the guardian without an account is shown as skipped („Pominięte”)
- [ ] Coach-only or deadline-only change → no notice of any kind
- [ ] Series time change → each recipient gets one notice naming the first changed date and nine sessions; description-only change sends none
- [ ] Restore → one notice „Jednak się odbędzie: {activity}”

**What can go wrong**

- Duplicate notifications or e-mails for one move
- The person who moved the session is notified too
- Detached session counted in the series notice (ten instead of nine)
- Notice sent for a description-only change

#### S26 · P0 — Move several children from a roster to another group in one previewed, undoable step

**Role:** administrator · **Device:** desktop · **Why P0:** moves monthly fees and deletes declarations; section-scoped rights
**PRs:** [#429](https://github.com/wladku/Vereino/pull/429) · **Stories:** E13-S11 · **Issues:** [#383](https://github.com/wladku/Vereino/issues/383)
**Route:** /backend/groups/groups/<id> (tab Skład), also /club/groups/<id> on the phone
**Before you start:** Group 'Kids' with eleven participants, one already in 'Skrzaty' (aged 6–7), two with declarations for future Kids sessions, a September fee in both groups; a coordinator of another section.

**Steps**

1. Open 'Kids' → „Skład”, tick seven children and click „Przenieś do innej grupy”
2. Choose „Grupa docelowa” 'Skrzaty' and „Pierwszy dzień w nowej grupie” 1 September; use „Pasuje do Skrzaty (6–7 lat)” and untick one child
3. Read „Podgląd” and click „Przenieś ({count})”
4. Click „Cofnij” on the toast; redo the move and regenerate September fees
5. Repeat on the phone at 375 px as the section coordinator

**What to verify**

- [ ] Preview lists six moves, one skip with reason, and the two declarations to be removed
- [ ] After apply both rosters and each child's Groups tab show Kids ending 31 August and Skrzaty from 1 September; one September fee per child
- [ ] „Cofnij” restores both groups and the dropped declarations
- [ ] Stale membership → „Od podglądu coś się zmieniło…” with a refreshed preview; past date or same group refused; other-section coordinator refused

**What can go wrong**

- Child charged a September fee in both groups
- Undo restores memberships but not declarations
- Age filter preselects by today's age instead of the move date

#### S27 · P0 — On the 18th birthday guardianships end, consents and new charges move to the adult; age notices appear

**Role:** administrator · **Device:** desktop · **Why P0:** new charges change payer (money) and guardians lose access
**PRs:** [#414](https://github.com/wladku/Vereino/pull/414) · **Stories:** E13-S08 · **Issues:** [#310](https://github.com/wladku/Vereino/issues/310)
**Route:** /backend/people/persons („Wymaga uwagi”), /backend/people/persons/{id}; job via CLI mercato people life-cycle
**Before you start:** Ward 17 years 335 days old with two guardians; a ward turning 18 today with a monthly charge before the birthday; a guardianship created after 18; a ward without birth date; a child reaching the own-account age. A maintainer runs the daily job (CLI with --today) twice.

**Steps**

1. Run the life-cycle job for T−30 twice; check notifications
2. Run it for the birthday twice; open the adult's record and the former guardian's view
3. Generate the next fee period
4. On „Osoby” use „Wymaga uwagi”: „Może mieć konto”, „Kończy 18 lat w ciągu 30 dni”, „Dorosły bez kontaktu”

**What to verify**

- [ ] One notice per guardian, ward and administrator, without a birth date
- [ ] Guardianships end the day before; consents copied to the adult; former guardian loses the ward
- [ ] Old charge keeps its payer; new one names the adult
- [ ] Post-18 guardianship stays; ward without birth date listed, not changed
- [ ] Filters list the right people

**What can go wrong**

- Duplicate notices on re-run
- Old charges moved to the adult
- Guardian still sees the adult's calendar

#### S28 · P0 — Refund an online payment from the charge and find overpayments under 'To refund'

**Role:** administrator · **Device:** desktop · **Why P0:** refunds money through the gateway
**PRs:** [#391](https://github.com/wladku/Vereino/pull/391) · **Stories:** E12-S06 · **Issues:** [#296](https://github.com/wladku/Vereino/issues/296)
**Route:** /backend/payments/charges?perspective=to_refund, /backend/payments/charges/<id> — Płatności → Należności → Do zwrotu
**Before you start:** A charge paid online and also in cash (online overpayment flagged to refund), test payment gateway

**Steps**

1. Open „Płatności” → „Należności” and pick „Do zwrotu”
2. Open the charge; in „Wpłaty” click „Zwróć” on the online payment row
3. Enter an amount above the suggested one and click „Zwróć”
4. Enter part of the amount, fill „Powód” and click „Zwróć”; then refund the rest
5. Return to „Należności”

**What to verify**

- [ ] „Do zwrotu” appears only when there is something to refund and lists one row
- [ ] Dialog suggests the refundable amount; above it → „Kwota przekracza to, co można jeszcze zwrócić ({amount}).” on the field
- [ ] Missing reason → the dialog does not submit
- [ ] After each refund the payment row shows the refund line(s) and toast „Zwrócono {amount}”
- [ ] After the full refund the „Do zwrotu” view disappears
- [ ] Gateway refusal → „Serwis płatności odmówił zwrotu…” and the dialog stays open, nothing booked

**What can go wrong**

- Double-clicking confirm books the refund twice
- „Zwróć” offered on a cash or bank-statement payment
- „Do zwrotu” stays visible after a full refund

#### S29 · P0 — Run a kit campaign from its record: who ordered, payments, cash and handover in the row

**Role:** administrator · **Device:** desktop · **Why P0:** accepts cash from the row (money)
**PRs:** [#397](https://github.com/wladku/Vereino/pull/397) · **Stories:** E12-S03 · **Issues:** [#293](https://github.com/wladku/Vereino/issues/293)
**Route:** /backend/payments/orders/<id>, /backend/payments/orders/<id>/edit — Płatności → Zbiórki zamówień
**Before you start:** A delivered campaign with unpaid and paid orders, three kits not handed over; children without an order (one without a guardian, one whose guardian has no e-mail); an open campaign with orders; a closed campaign

**Steps**

1. Open „Płatności” → „Zbiórki zamówień” and a delivered campaign; read the „Zamówienia” tab columns
2. On an unpaid order click „Gotówka” and save the cash
3. On another unpaid order click „Wydaj”, then „Wydaj mimo braku wpłaty”
4. Open the tab „Bez zamówienia”
5. Click „Zakończ” with kits not handed over
6. Open the edit form of a closed campaign

**What to verify**

- [ ] Columns „Zamawia” (name, phone, channel), payment with remaining amount and collector, „Wydanie”
- [ ] „Gotówka” opens the cash dialog with the orderer chosen and only that charge ticked; the row then shows it paid in cash with the collector
- [ ] Unpaid hand-over warns „Wydać nieopłacony strój?” with „Do zapłaty pozostało {amount}.”; row then shows „wydane” with the name
- [ ] „Bez zamówienia” lists „Opiekunowie” with „bez e-maila” / „brak opiekuna”
- [ ] „Zakończ” → danger dialog „3 stroje nie zostały oznaczone jako wydane.”
- [ ] Closed campaign edit → „Formularza nie można już edytować” with „Wróć do zbiórki”

**What can go wrong**

- „Wydaj” offered before the campaign is delivered
- Cash dialog ticks all of the orderer's charges
- Tab counts and KPI tiles disagree with the rows

#### S30 · P0 — See who holds the club's cash and accept a numbered handover

**Role:** administrator · **Device:** desktop · **Why P0:** settles cash (money)
**PRs:** [#421](https://github.com/wladku/Vereino/pull/421) · **Stories:** E07-S11 · **Issues:** [#118](https://github.com/wladku/Vereino/issues/118)
**Route:** /backend/payments/cash-custody — Płatności → Gotówka do rozliczenia
**Before you start:** A coach who accepted cash for three payments; nothing else unsettled

**Steps**

1. Open „Płatności” → „Gotówka do rozliczenia”
2. Read the row of the coach („Osoba”, „Wpłaty”, „Najstarsza”, „Razem”)
3. Click „Przyjmij rozliczenie”, tick the payments and click „Potwierdzam odbiór gotówki”
4. Read „Historia rozliczeń”; sign in as the coach and check the cash summary on „Płatności moich grup”

**What to verify**

- [ ] Toast „Rozliczenie RG/RRRR/MM/NNN przyjęte” with a sequential number
- [ ] History row shows „Numer”, „Kiedy”, „Od kogo”, „Pokwitowania”, „Przyjął(a)”, „Kwota”
- [ ] With nothing left → „Cała przyjęta gotówka jest u skarbnika”
- [ ] Coach's „Gotówka u Ciebie” drops to 0
- [ ] Confirming without a ticked payment → „Zaznacz co najmniej jedną wpłatę.”

**What can go wrong**

- The same payment settled twice (two handovers)
- Handover numbers skip or repeat
- Cash accepted by the administrator appears as cash to settle

#### S31 · P0 — Turn on automatic monthly charges and overdue reminders in payment settings

**Role:** administrator · **Device:** desktop · **Why P0:** automatic charge generation creates charges (money)
**PRs:** [#398](https://github.com/wladku/Vereino/pull/398) · **Stories:** E12-S11 · **Issues:** [#301](https://github.com/wladku/Vereino/issues/301)
**Route:** /backend/payments/settings — Płatności → Cenniki i zniżki → Trenerzy i płatności
**Before you start:** Club with fee schedules and members in groups; no generation yet for the current month

**Steps**

1. Open „Trenerzy i płatności” and the group „Automatyczne naliczanie i przypomnienia”
2. Switch „Naliczaj opłaty miesiąca automatycznie” off and on; set „Dzień miesiąca” to 0, then 29, then 1
3. Switch „Przypominaj płatnikom o zaległościach” on and save
4. Next morning (or after the 06:00 job) open „Należności” → „Generowania”

**What to verify**

- [ ] „Dzień miesiąca” is visible only while the automatic switch is on and accepts only 1–28
- [ ] Saved values persist after reload
- [ ] After the 06:00 run → exactly one generation row for the month; none when the switch is off
- [ ] An overdue payer receives one reminder e-mail and in-app notification listing all overdue charges with a link to /club/payments

**What can go wrong**

- Two generations for the same month after the job runs twice
- Rental charges or charges without a payer get reminders
- An open kit campaign past its deadline is not closed automatically

#### S32 · P0 — Undo a charge generation, automatic runs included

**Role:** administrator · **Device:** desktop · **Why P0:** cancels charges in bulk (money)
**PRs:** [#420](https://github.com/wladku/Vereino/pull/420) · **Stories:** — · **Issues:** [#403](https://github.com/wladku/Vereino/issues/403)
**Route:** /backend/payments/generations — Płatności → Należności → Generowania
**Before you start:** One generation for a month (automatic or manual) with open charges and at least one paid charge

**Steps**

1. Open „Płatności” → „Należności” and click „Generowania”
2. Read the columns of the generation row
3. Click „Cofnij” and confirm the dialog
4. Return to „Należności”; after the next 06:00 job check „Generowania” again

**What to verify**

- [ ] Columns „Miesiąc”, „Wygenerowano”, „Utworzone”, „Pominięte”, „Bez płatnika”, „Otwarte”, „Stan”
- [ ] Dialog „Cofnąć generowanie za {period}?” names the open charges to cancel
- [ ] After undo → toast „Cofnięto generowanie za {period}…”, row status „Cofnięte: anulowano {cancelled}”
- [ ] Open charges are cancelled; paid and partially paid stay
- [ ] The automatic job does not regenerate the undone month

**What can go wrong**

- Undo cancels paid or partially paid charges
- Automatic runs have no „Cofnij”
- The undone month is regenerated the next morning

#### S33 · P1 — Administrator decides an online booking request from a card with every fact

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium
**PRs:** [#351](https://github.com/wladku/Vereino/pull/351) · **Stories:** E11-S06 · **Issues:** [#280](https://github.com/wladku/Vereino/issues/280)
**Route:** /backend/facilities/requests — Obiekty → Zgłoszenia do akceptacji
**Before you start:** Held confirmed requests: one clean, one colliding with a session, one whose requester matches a ban, one whose 48-hour hold lapsed; more requests than one page; place with an owner institution.

**Steps**

1. Open „Obiekty” → „Zgłoszenia do akceptacji”
2. Read the clean card: heading renter — place, „wygasa …”, contact, purpose, amount, badges
3. Click „Akceptuj” on it and read the dialog's first line, then cancel
4. Approve the colliding request and the lapsed one
5. Click „Pokaż więcej”; resize to 768 px and 480 px

**What to verify**

- [ ] Clean card → „brak kolizji”, „brak w rejestrze zakazów”, „regulamin zaakceptowany online”, „e-mail potwierdzony”, amount with owner account
- [ ] Approve dialog intro names the owner's account
- [ ] Colliding card → „Kolizja” alert naming the session; approval refused with 409
- [ ] Ban match → „zgodność z rejestrem zakazów — sprawdź”
- [ ] Lapsed hold → „Minęło 48 godzin na decyzję; zgłoszenie wygasło.” and the card is removed
- [ ] Soonest expiry first; columns stack under 768 px, buttons full width under 480 px

**What can go wrong**

- Card stays after an expiry/decision 409
- Badges shown by colour only
- Owner missing in the approval intro

#### S34 · P1 — Administrator edits the club consent texts and sees own consents and the missing-consents filter

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium
**PRs:** [#412](https://github.com/wladku/Vereino/pull/412) · **Stories:** E13-S07 · **Issues:** [#309](https://github.com/wladku/Vereino/issues/309)
**Route:** /backend/club/settings („Ustawienia klubu” → „Treść zgód”), /backend/people/persons/{id} tab „Opieka i zgody”, /backend/people/persons
**Before you start:** Adult participant with own consents; a person without the regulations consent.

**Steps**

1. Open „Ustawienia klubu”, group „Treść zgód”, change one text and save; enter 1001 characters
2. Empty a field and save
3. Open the adult's record, „Opieka i zgody” → „Własne zgody”
4. On „Osoby” filter „Wymaga uwagi” → „Brak zgód”

**What to verify**

- [ ] Text saved with last changed; 1001 characters refused; empty restores the built-in text
- [ ] Own consents listed with author and date
- [ ] Filter lists the person without consent

**What can go wrong**

- Changing a text withdraws given consents
- Coordinator sees consents

#### S35 · P1 — Administrator enters role dates, guardianship start, external id and renames a section material

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium
**PRs:** [#371](https://github.com/wladku/Vereino/pull/371) · **Stories:** E13-S02 · **Issues:** [#304](https://github.com/wladku/Vereino/issues/304)
**Route:** /backend/people/persons/{id} tabs „Role”, „Opieka i zgody”, „Dane”; /backend/club/sections/{id}/edit materials; /backend/communication/threads/{id}
**Before you start:** A person, a second person with an external id, a section with a material, a thread with own and others' messages and a thread marked as a case.

**Steps**

1. On „Role” click „Przypisz rolę” with an end date, then „Edytuj” its dates and „Zakończ z dniem…” a future date
2. On „Opieka i zgody” click „Dodaj opiekę” with a start date „Od”
3. On „Dane” enter the other person's „Identyfikator zewnętrzny”
4. Rename a section material inline
5. In a panel thread click „Edytuj” on your own message

**What to verify**

- [ ] Role dates stored and shown; inverted dates refused
- [ ] Guardianship shows the chosen start date
- [ ] Duplicate external id refused
- [ ] Material shows the new title without re-upload
- [ ] Edited message shows „edytowano”; others' messages offer no edit; in a case editing is refused

**What can go wrong**

- Role ends today instead of the chosen date
- Edit offered on others' or system messages

#### S36 · P1 — Administrator filters the groups list and works from a group record

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium label; list/record parity plus a data guard on group kind
**PRs:** [#349](https://github.com/wladku/Vereino/pull/349) · **Stories:** E10-S01 · **Issues:** [#266](https://github.com/wladku/Vereino/issues/266)
**Route:** /backend/groups/groups, /backend/groups/groups/<id>?tab=details — Grupy → Grupy
**Before you start:** A public class group with a level (e.g. 'początkujący') and a team with an age category; one team that already has a match or sparring activity.

**Steps**

1. Open „Grupy” → „Grupy” and set the filter „Publiczna” to „Tak”
2. Check the columns „Rodzaj”, „Kategoria / poziom” and „Publiczna” for both groups
3. Open the class group, switch to the tab „Szczegóły” and reload the page
4. Click „Aktywności” in the record header, then „Nowa aktywność”
5. Open the team with a match, on „Szczegóły” change „Rodzaj” from „Drużyna” to „Grupa zajęciowa” and click „Zapisz”

**What to verify**

- [ ] Filter „Publiczna” = „Tak” → only public groups are listed, each marked public
- [ ] Class group row → its level shows in „Kategoria / poziom”; the team shows its age category there
- [ ] Reload with ?tab=details → the „Szczegóły” tab stays selected
- [ ] „Aktywności” → the activities list is filtered to that group, and „Nowa aktywność” preselects the group
- [ ] Saving the team as „Grupa zajęciowa” → error „Ta drużyna ma mecze lub sparingi, więc nie może zostać grupą zajęciową.” and the kind stays „Drużyna”

**What can go wrong**

- Public filter ignored: non-public groups still listed
- Tab resets to „Skład” after reload
- A team with matches silently becomes a class group (its matches then orphaned)
- New activity form opens without the group preselected

#### S37 · P1 — Administrator manages zones, closures, rates, log, incidents and entry bans in the panel tabs

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium
**PRs:** [#360](https://github.com/wladku/Vereino/pull/360) · **Stories:** E11-S07 · **Issues:** [#281](https://github.com/wladku/Vereino/issues/281)
**Route:** /backend/facilities/zones|closures|rates — Obiekty → Strefy i cennik; /backend/facilities/logs|incidents|bans — Obiekty → Dziennik i incydenty
**Before you start:** Places with zones and rates; an incident with a ban request; a log day last week whose edit window closed; an attendant account for comparison.

**Steps**

1. Open „Obiekty” → „Strefy i cennik”, tab „Strefy”, click „Ustaw dostępność do rezerwacji” and save; also check „Dodaj regułę strefy”
2. Tab „Zamknięcia”: „Dodaj zamknięcie” over a booked slot; tab „Cennik wynajmu”: „Dodaj stawkę”
3. Open „Dziennik i incydenty”, tab „Dziennik”, „Dodaj wpis” for last week
4. Tab „Incydenty”: „Zgłoś incydent”; filter „Prośba o zakaz wstępu”, on the row click „Wydaj zakaz” and save
5. Tab „Zakazy wstępu”: check the new ban; as the attendant try the past log entry

**What to verify**

- [ ] Availability saved („Zapisano dostępność rezerwacji.”); columns Dni, Godziny, Strefa, Priorytet, Źródło
- [ ] Closure save message „Zapisano. Oznaczono do przeniesienia: …”; place cell links to that place's calendar
- [ ] Admin past log entry created; attendant gets „Tego dziennika nie można już zmienić — po następnym dniu może go edytować tylko administrator.”
- [ ] Ban form pre-filled with place, incident and reason; incident shows „zakaz wydany” and leaves the filter
- [ ] Panel-reported incident listed on „Incydenty”

**What can go wrong**

- Ban saved without link to the incident
- Attendant can write a closed log
- Zone columns missing or place link broken

#### S38 · P1 — Administrator sees today's facility entries in the dashboard widget

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium
**PRs:** [#416](https://github.com/wladku/Vereino/pull/416) · **Stories:** E11-S16 · **Issues:** [#290](https://github.com/wladku/Vereino/issues/290)
**Route:** /backend (dashboard) → widget Dziś na obiekcie → /backend/facilities/calendar
**Before you start:** More than eight entries today on club places; a second club with nothing today; an attendant account.

**Steps**

1. Open the panel dashboard
2. Find „Dziś na obiekcie” next to the requests widget
3. Click an entry, then „Otwórz kalendarz”
4. Open the dashboard of the empty club and as the attendant

**What to verify**

- [ ] Entries listed by start, eight at most, then „i N więcej”
- [ ] Click opens „Kalendarz obiektu” on that place and today
- [ ] Empty club → „Nic nie zaplanowano”
- [ ] Attendant sees only assigned places; both locales and dark mode

**What can go wrong**

- Widget missing on an existing saved dashboard (must be added via Customize)
- External places listed
- Unsorted entries

#### S39 · P1 — Administrator sets PZPN birth-year ranges on age categories and a team's age follows its category

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium label; new admin-only dictionary screen
**PRs:** [#424](https://github.com/wladku/Vereino/pull/424) · **Stories:** E13-S12 · **Issues:** [#384](https://github.com/wladku/Vereino/issues/384)
**Route:** /backend/groups/age-categories, /backend/groups/groups/create — Grupy → Grupy → tab „Kategorie wiekowe”
**Before you start:** Seeded age categories and a season starting 2026-09-01; a section coordinator account.

**Steps**

1. Open tab „Kategorie wiekowe” and read the row Orlik
2. Click „Dodaj kategorię”, add „Orlik młodszy” with „U od” 10 and „U do” 10
3. Create a team with this category and open its tab „Strona publiczna”
4. Set „U od” above „U do” on a category and save; repeat a range change as the coordinator
5. Check at 375 px and in English

**What to verify**

- [ ] Orlik U10–U11 shows „Roczniki” 2016–2017
- [ ] New team proposes „Wiek od” 9 and „Wiek do” 10 with the hint „Rocznik 2017 w sezonie 2026/27.”
- [ ] Inverted range → „„U od” nie może być większe niż „U do”.”; coordinator cannot change ranges
- [ ] A category renamed via „Zmień nazwy, kolejność lub usuń” keeps its range

**What can go wrong**

- Birth years shifted by one year relative to the season
- Coordinator can edit ranges
- Range lost after renaming the category

#### S40 · P1 — Administrator sets up a new coach from the staff checklist and stores a person photo and a contract PDF

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium
**PRs:** [#415](https://github.com/wladku/Vereino/pull/415) · **Stories:** E13-S10 · **Issues:** [#312](https://github.com/wladku/Vereino/issues/312)
**Route:** /backend/people/persons/{id} tabs „Role”, „Dane”; /backend/club/contracts
**Before you start:** A new person without account, role, groups or contract; a coordinator account; an image and a PDF.

**Steps**

1. Open „Role”, section „Przygotowanie pracownika”: „Utwórz konto”, „Nadaj rolę trenera”, „Dodaj do grupy jako trenera…”, „Dodaj umowę”
2. On „Dane” click „Dodaj zdjęcie”; try an SVG renamed to .png
3. Open the contract and click „Dołącz podpisaną umowę”, then replace and remove
4. Sign in as the coordinator and open the checklist

**What to verify**

- [ ] Each row turns „Gotowe” with working links
- [ ] Photo saved and only readable by staff; fake PNG refused
- [ ] PDF downloadable; second upload replaces
- [ ] Coordinator sees no account or contract actions

**What can go wrong**

- Checklist row stays „Jeszcze nie”
- Photo or PDF reachable without permission

#### S41 · P1 — Administrator uploads the poster and funder logos, replaces and removes them with undo

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium; file validation and undo
**PRs:** [#436](https://github.com/wladku/Vereino/pull/436) · **Stories:** E14-S04 · **Issues:** [#379](https://github.com/wladku/Vereino/issues/379)
**Route:** /backend/activities/club-events/{id}?tab=files — Harmonogram → Imprezy klubowe → event → Pliki
**Before you start:** A club event exists; test files: a ~3 MB JPEG, a second image, an SVG renamed to .png, a PDF, a 7 MB PNG, several small PNG logos.

**Steps**

1. Open the event record, tab „Pliki ({count})”, click „Wyślij plakat” and choose the 3 MB JPEG
2. Click „Zastąp plakat” with a second image, then undo the last operation
3. Try the renamed SVG, the PDF and the 7 MB PNG as the poster
4. Type „Nazwa fundatora” and click „Wyślij logo”; try once without a name
5. Remove a logo with „Usuń” and undo it

**What to verify**

- [ ] Upload shows „Wysyłanie {name}…” then a preview; only one live poster remains after replacing
- [ ] Undo after replacing brings the first poster back
- [ ] SVG/PDF are refused as unsupported format and the 7 MB PNG as too large, with a visible error
- [ ] Logo without a name shows „Podaj nazwę fundatora (od {min} do {max} znaków).”; the logo counter „Logo fundatorów ({count} z {max})” updates, and at 12 logos the upload is blocked
- [ ] Undo of a removed logo returns it in its original position

**What can go wrong**

- Two posters live at once after replace or undo
- A renamed SVG accepted because only the extension is checked
- Undone logo comes back at the end of the list or the file is broken (redo does not relink the stored file)

#### S42 · P1 — Staff and renters are told when a closure or maintenance window flags their entries

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium
**PRs:** [#387](https://github.com/wladku/Vereino/pull/387) · **Stories:** E11-S13 · **Issues:** [#287](https://github.com/wladku/Vereino/issues/287)
**Route:** /backend/facilities/closures — Obiekty → Strefy i cennik → Zamknięcia; /backend/facilities/rentals?view=to_move; coordinator phone /club/places/<placeId>
**Before you start:** Under a future window: two sessions of one section with a coach, a club booking, a rental with an e-mail; a coordinator of that section.

**Steps**

1. Add a closure over the window („Dodaj zamknięcie”) and save
2. Save the closure again unchanged
3. Plan a maintenance window over the same entries
4. Open „Wynajmy” → „Do przeniesienia”
5. As the coordinator open the notification on a 375 px phone

**What to verify**

- [ ] Each coordinator and the coach get one „Wpisy do przeniesienia” notification and one e-mail naming both sessions; the booker one; administrators one; the renter one e-mail „Twój wynajem: … — trzeba zmienić termin”
- [ ] Unchanged re-save sends nothing
- [ ] Maintenance sends its own messages
- [ ] Flagged rental listed under „Do przeniesienia”; the notice opens the place's day (filter „Tylko do przeniesienia”)
- [ ] No renter contact in any message

**What can go wrong**

- Duplicate notices on re-save
- Renter contact leaked in staff messages
- Notification link opens a 404

#### S43 · P1 — The dashboard shows bank statements and cash, order campaigns, overdue counts and charges without a payer

**Role:** administrator · **Device:** desktop · **Why P1:** priority-medium label; read-only widgets
**PRs:** [#411](https://github.com/wladku/Vereino/pull/411) · **Stories:** E12-S07 · **Issues:** [#297](https://github.com/wladku/Vereino/issues/297)
**Route:** /backend (dashboard)
**Before you start:** Transfers to decide, one online overpayment, two running campaigns, overdue charges of two families (one without a payer); a user without order-campaign rights

**Steps**

1. Open the dashboard
2. Read the bank statements and cash widget; click „Importuj wyciąg” and the accept cash button
3. Read the order campaigns widget and click a campaign
4. Read the overdue and charges-without-payer widgets
5. Sign in as a user without order-campaign rights

**What to verify**

- [ ] Bank widget → „{n} przelewy czekają na potwierdzenie lub przypisanie.” and „do zwrotu: 1”; with nothing pending „Wszystkie zaimportowane przelewy są rozliczone.”
- [ ] Accept cash opens the shared cash dialog
- [ ] Campaign line „{orders} z {children} dzieci · wpłacono {paid} z {value}” links to the campaign record
- [ ] Overdue widget shows charges, families and „{count} bez płatnika”; without-payer widget lists up to 5 rows then „i jeszcze {count}”
- [ ] User without order-campaign rights → no campaigns widget

**What can go wrong**

- Counts differ from the charges list views
- Campaigns widget shown to a user without the right
- Draft or completed campaigns listed

#### S44 · P2 — Person record shows membership status by the club's date, not the browser clock

**Role:** administrator · **Device:** desktop · **Why P2:** priority-low
**PRs:** [#247](https://github.com/wladku/Vereino/pull/247) · **Stories:** — · **Issues:** [#231](https://github.com/wladku/Vereino/issues/231)
**Route:** /backend/people/persons/{id} tab „Grupy”
**Before you start:** Membership starting on the club's today; computer time zone set so the browser date differs from Warsaw.

**Steps**

1. Change the OS time zone
2. Open the person, „Grupy”

**What to verify**

- [ ] Membership shows „Aktywne”, not „Przyszłe”
- [ ] Membership ended yesterday not active

**What can go wrong**

- Status flips around midnight

#### S45 · P2 — See the online payment connection and choose the payment methods offered to payers

**Role:** administrator · **Device:** desktop · **Why P2:** priority-low label; settings screen
**PRs:** [#401](https://github.com/wladku/Vereino/pull/401) · **Stories:** E12-S12 · **Issues:** [#302](https://github.com/wladku/Vereino/issues/302)
**Route:** /backend/payments/settings — Płatności → Cenniki i zniżki → Trenerzy i płatności
**Before you start:** Club with test Stripe credentials stored (and one without, for comparison); a payer with an open charge

**Steps**

1. Open „Trenerzy i płatności” and the group „Płatność online”
2. Read „Połączenie” and „Opłata za płatność online”
3. Untick all methods and save; then tick „Karta” and „BLIK” and save
4. As a payer start a payment on /club/payments

**What to verify**

- [ ] Badge reads „Połączono (tryb testowy)” with test keys, „Nie połączono” without
- [ ] Fee mode is read-only with the link „Zmień w ustawieniach klubu”
- [ ] Empty selection → save refused with an error
- [ ] Checkout offers card and BLIK; no key is shown anywhere

**What can go wrong**

- Stripe keys or parts of them appear on the page
- Saved methods are ignored by the checkout (card only)
- Fee mode is editable here

### Treasurer — desktop

#### S46 · P0 — A rental's charge is payable to the place owner and the payment confirms the rental

**Role:** treasurer · **Device:** desktop · **Why P0:** moves money: charges, payments, forfeits
**PRs:** [#385](https://github.com/wladku/Vereino/pull/385) · **Stories:** E11-S11 · **Issues:** [#285](https://github.com/wladku/Vereino/issues/285)
**Route:** /backend/facilities/rentals/<id> → /backend/payments/charges/<chargeId>; /backend/facilities/reports/owner — Obiekty → Raport dla gminy
**Before you start:** Payments enabled; a place whose parent has an owner institution; a registered and an unregistered renter; a confirmed online request awaiting approval. Steps run as administrator (rental pages) and treasurer or administrator (charge page).

**Steps**

1. Enter a rental for the registered renter and one for the unregistered renter; approve the online request
2. On a rental's record click „Potwierdź wpłatę”: the charge page „Należność” opens; check payee, payer, description, due date
3. Click „Zaksięguj wpłatę” for part of the amount, then for the rest
4. Cancel one rental before its free-cancellation deadline and one after it („Odwołaj”)
5. Open „Obiekty” → „Raport dla gminy”

**What to verify**

- [ ] Each charge names the owner as payee („na konto: …”), the renter or typed name as payer, description „Wynajem: {place}, {date} {start}–{end}” and the payment deadline as due date
- [ ] Partial payment → charge state „opłacona częściowo”, rental still „Zaakceptowany — czeka na wpłatę”; full payment → „Potwierdzony” once
- [ ] Direct confirm while the charge is open → „Ten wynajem potwierdza wpłata: zapisz wpłatę na należności wynajmu.”
- [ ] Cancel before deadline → „należność anulowana”; after → „przepadła”
- [ ] Owner report subtitle „Właściciel: …” and the payments source line

**What can go wrong**

- Charge payable to the club instead of the owner
- Rental confirmed after a partial payment or twice
- „Potwierdź wpłatę” confirms directly instead of opening the charge
- Without payments the screens break instead of saying „rejestr wynajmów”

#### S47 · P0 — A treasurer works with a finance-only role, menu and dashboard

**Role:** treasurer · **Device:** desktop · **Why P0:** changes who can see and do what (new role)
**PRs:** [#432](https://github.com/wladku/Vereino/pull/432), [#421](https://github.com/wladku/Vereino/pull/421) · **Stories:** E07-S11b, E07-S11 · **Issues:** [#245](https://github.com/wladku/Vereino/issues/245), [#118](https://github.com/wladku/Vereino/issues/118)
**Route:** /backend, /backend/payments/*, /backend/people/persons — person record → Role tab; Płatności menu
**Before you start:** A person with an account; a coach holding cash; the administrator signed in first

**Steps**

1. As administrator open the person's tab „Role”, click „Przypisz rolę” and choose „Skarbnik” (treasurer, vereino_treasurer)
2. Sign in as the treasurer and look at the menu and the dashboard
3. Open /backend/people/persons, a group, club settings and facilities by URL
4. Open „Płatności” → „Gotówka do rozliczenia” and accept the coach's handover
5. Accept cash as the treasurer and check „Gotówka do rozliczenia”

**What to verify**

- [ ] Treasurer sees only the „Płatności” menu and the finance dashboard widgets
- [ ] People, groups, club settings and facilities → access denied
- [ ] Handover accepted exactly as for the administrator, with an RG number
- [ ] Cash accepted by the treasurer is settled at once (not listed as cash to settle)
- [ ] People list filter and role badges show „Skarbnik”

**What can go wrong**

- The treasurer sees person records, groups or facilities
- Payment pages (charges, bank, orders) refuse the treasurer
- Assigning the role fails or the role ends without notice

### Section coordinator — phone 375 px

#### S48 · P0 — Section coordinator assigns a substitute, moves and cancels sessions from the phone

**Role:** section coordinator · **Device:** phone 375 px · **Why P0:** priority-high; section-scoped rights and notifications to families
**PRs:** [#367](https://github.com/wladku/Vereino/pull/367), [#356](https://github.com/wladku/Vereino/pull/356) · **Stories:** E10-S08, E10-S06 · **Issues:** [#273](https://github.com/wladku/Vereino/issues/273), [#271](https://github.com/wladku/Vereino/issues/271)
**Route:** /club, /club/calendar?…view=unassigned, /club/occurrences/<id>?as=coordinator, /club/occurrences/<id>/edit — Dziś → Terminy sekcji
**Before you start:** A coordinator of one section who coaches no group; in that section an unassigned session, a session flagged for reschedule and a free coach plus a coach with a colliding session; a session of another section.

**Steps**

1. Open „Dziś” and look at the tile „Terminy sekcji”; tap „Do obsadzenia”
2. Open the unassigned session, tap „Wskaż zastępcę”, use „Szukaj trenera” and pick a free coach; repeat with a busy coach
3. Open a „Do przełożenia” session, tap „Edytuj”, change the time and tap „Zapisz zmiany”
4. Cancel another session with „Odwołaj termin”, a reason and confirm
5. Open a session of another section by URL and try to act on it

**What to verify**

- [ ] Today tile shows three counts; „Do obsadzenia” opens the calendar filtered to unassigned sessions
- [ ] Free coach → saved with a toast and a history entry; busy coach → the collision is shown and nothing saved
- [ ] Move → flag cleared, toast „Zajęcia zapisane. Powiadomione osoby: {count}.”
- [ ] Cancel → toast „Termin odwołany — powiadomione osoby: {count}”
- [ ] Other section → refused or no actions; no change saved; no step needs /backend

**What can go wrong**

- Coordinator can change sessions of another section
- Substitute with a colliding session saved
- Reschedule flag stays after the move

#### S49 · P0 — Section coordinator edits a roster from the phone; coach sees it read-only, guardian is refused

**Role:** section coordinator · **Device:** phone 375 px · **Why P0:** changes who can see and edit rosters (contact data must not leak)
**PRs:** [#374](https://github.com/wladku/Vereino/pull/374), [#355](https://github.com/wladku/Vereino/pull/355) · **Stories:** E10-S09, E10-S02 · **Issues:** [#274](https://github.com/wladku/Vereino/issues/274), [#267](https://github.com/wladku/Vereino/issues/267)
**Route:** /club/groups, /club/groups/<id> — Więcej → Grupy
**Before you start:** A section coordinator, a coach of one group in that section, a guardian of a child in the group; a person not yet in the group.

**Steps**

1. As the coordinator open „Więcej” → „Grupy” and open a group
2. Tap „Dodaj do składu”, pick a person and save
3. On an active member use „Zakończ członkostwo” with a chosen „Ostatni dzień”
4. Log in as the coach and open „Grupy” and the roster
5. Log in as the guardian and open /club/groups/<id> by URL

**What to verify**

- [ ] Coordinator sees „Grupy Twoich sekcji.” with the section's groups; add and end succeed
- [ ] Coach sees „Grupy, które prowadzisz.” with only own groups and „Widzisz ten skład; zmienia go koordynator sekcji.” with no actions
- [ ] Guardian → „To nie jest Twoja grupa.”; no roster contact data shown
- [ ] Layout fits 375 px in both locales, light and dark

**What can go wrong**

- Coach gets add/end/remove actions
- Guardian can open another group's roster
- Coordinator sees groups of other sections

#### S50 · P0 — Section coordinator marks a group thread as a case and deletes a message from the phone

**Role:** section coordinator · **Device:** phone 375 px · **Why P0:** deletes personal messages; case makes a thread immutable
**PRs:** [#374](https://github.com/wladku/Vereino/pull/374) · **Stories:** E10-S09 · **Issues:** [#274](https://github.com/wladku/Vereino/issues/274)
**Route:** /club/messages/<threadId> — Wiadomości
**Before you start:** Two group threads in the coordinator's section, each with a guardian's message.

**Steps**

1. Open „Wiadomości” and the first group thread
2. Tap „Oznacz jako sprawę” and confirm
3. Try „Usuń wiadomość” on the guardian's message
4. In the second thread use „Usuń wiadomość” on a message

**What to verify**

- [ ] Case → banner „Sprawa — wiadomości nie można usuwać ani edytować” and badge „Sprawa”
- [ ] Deleting in a case → readable „Ten wątek jest sprawą: jego wiadomości nie można już edytować ani usuwać.”
- [ ] Deleting in a normal thread → tombstone „Ta wiadomość została usunięta.”

**What can go wrong**

- Message in a case thread deleted
- Raw error code shown instead of text
- Deleted message content still visible

#### S51 · P0 — Section coordinator sets up a tournament entirely on the phone (event, external place sheet, parts, move, poster, cancel)

**Role:** section coordinator · **Device:** phone 375 px · **Why P0:** new coordinator permission to add external places (#425, priority-high) and coordinator access to event management
**PRs:** [#438](https://github.com/wladku/Vereino/pull/438), [#425](https://github.com/wladku/Vereino/pull/425), [#426](https://github.com/wladku/Vereino/pull/426), [#441](https://github.com/wladku/Vereino/pull/441) · **Stories:** E14-S05, E14-S02, E14-S01 · **Issues:** [#380](https://github.com/wladku/Vereino/issues/380), [#377](https://github.com/wladku/Vereino/issues/377), [#376](https://github.com/wladku/Vereino/issues/376), [#440](https://github.com/wladku/Vereino/issues/440)
**Route:** /club/club-events, /club/club-events/new, /club/club-events/{id}, /club/club-events/{id}/parts/new, /club/occurrences/{id}/edit?as=coordinator — Więcej → Imprezy klubowe
**Before you start:** A coordinator of one section (role vereino_coordinator, after role ACL sync) with two groups and coaches; the venue is missing from the places list.

**Steps**

1. Open „Więcej” → „Imprezy klubowe”, tap „Nowa impreza klubowa”, fill the form; tap „Dodaj miejsce” and add the hall in the „Dodaj obiekt” bottom sheet
2. Save the event, then on the event page tap „Dodaj część”, add visiting teams, save; open a part card menu and use „Kopiuj”
3. Open the card menu of a group part and tap „Przenieś”; change the time and save
4. In the files block tap „Zrób zdjęcie” or „Wybierz plik” to add the poster
5. Add a part whose coach already has a session at that time
6. Tap „Odwołaj imprezę klubową”, give a reason and confirm

**What to verify**

- [ ] The whole journey works without opening any /backend page; no horizontal overflow at 375 px
- [ ] The new hall is selected in the form after the sheet closes and the coordinator never gets edit/delete on places
- [ ] „Przenieś” opens the session edit page with the place read-only („Miejsce imprezy klubowej ({name}): zmienia się je w imprezie klubowej.”) and the toast names the people told
- [ ] Coach collision → 409 lists the colliding sessions, nothing is saved
- [ ] Cancel → each planned future part session is cancelled and the toast names how many people were told

**What can go wrong**

- Coordinator gets „Tylko organizatorzy imprez klubowych…” denied notice despite having the role (missing ACL sync)
- Bottom sheet does not open or the new place is not selected
- Session edit page lets the coordinator change the place of a part session
- Part saved despite a coach collision

#### S52 · P2 — Phone club event forms recover from errors and the list keeps all past events

**Role:** section coordinator · **Device:** phone 375 px · **Why P2:** priority-low follow-up fixes (#441)
**PRs:** [#441](https://github.com/wladku/Vereino/pull/441), [#438](https://github.com/wladku/Vereino/pull/438) · **Stories:** E14-S05 · **Issues:** [#440](https://github.com/wladku/Vereino/issues/440), [#380](https://github.com/wladku/Vereino/issues/380)
**Route:** /club/club-events, /club/club-events/new, /club/club-events/{id}/parts/new — Więcej → Imprezy klubowe
**Before you start:** Coordinator with more than 20 past club events (or enough to need paging); ability to toggle the phone offline (browser devtools).

**Steps**

1. Open „Imprezy klubowe”, scroll the past events and tap „Pokaż więcej ({shown} z {total})”
2. Open „Nowa impreza klubowa” while the network is offline / the options request fails
3. Fill a part form, go offline, save, then go online and tap „Spróbuj ponownie”

**What to verify**

- [ ] Upcoming events are sorted soonest first, past events latest first; „Pokaż więcej” adds 20 cards each time
- [ ] Options failure shows an error with „Spróbuj ponownie”, never the „denied” notice
- [ ] Offline save keeps the typed values and shows „Brak połączenia. Wpisane dane zostają…”; retry saves

**What can go wrong**

- Newest past events missing from the list (only the first page sorted)
- A network error shown as „Tylko organizatorzy imprez klubowych…” (access denied)
- Form values lost after a failed save

### Coach — phone 375 px

#### S53 · P0 — Coach creates a sparring or away match with a typed venue on the phone and edits the own event

**Role:** coach · **Device:** phone 375 px · **Why P0:** priority-high; widens what a coach may edit
**PRs:** [#353](https://github.com/wladku/Vereino/pull/353) · **Stories:** E10-S05 · **Issues:** [#270](https://github.com/wladku/Vereino/issues/270)
**Route:** /club/calendar → /club/events/new, /club/occurrences/<id>, /club/occurrences/<id>/edit — Kalendarz → Nowe wydarzenie
**Before you start:** A coach of team A; team B of another coach and a class group C exist; at least one external team; a session of a recurring series of team A.

**Steps**

1. Open „Kalendarz” and tap „Nowe wydarzenie”
2. Choose team A, type „Sparing”, „Gdzie” = „Inny adres”, fill „Nazwa obiektu” and „Adres obiektu”, pick „Wybierz przeciwnika”, set a gathering time and „Potwierdź do”
3. Tap „Utwórz wydarzenie” and open the session page
4. Tap „Edytuj”, change the time, tap „Zapisz zmiany”; then cancel it with „Odwołaj termin”
5. Try the same for class group C, and open the edit page of a series session of team A

**What to verify**

- [ ] Session page shows the venue with „Otwórz mapę” and the event counts as away
- [ ] Class group → „Mecze i sparingi są tylko dla drużyn.”; team B is not offered / refused
- [ ] Edit and cancel of the own one-off event succeed
- [ ] Series session → „Nie możesz edytować tych zajęć…” and nothing saved
- [ ] Sessions without a club place open without errors in the calendar, facility calendar and public session page

**What can go wrong**

- Saving with both a club place and a typed venue (or neither) succeeds
- Coach can edit sessions of a recurring series
- A page crashes on a session without a club place

#### S54 · P0 — Coach fills attendance in one tap, takes over an unstaffed session and records a match score

**Role:** coach · **Device:** phone 375 px · **Why P0:** priority-high; attendance and takeover feed coach units (pay)
**PRs:** [#361](https://github.com/wladku/Vereino/pull/361), [#350](https://github.com/wladku/Vereino/pull/350) · **Stories:** E10-S07, E10-S04 · **Issues:** [#272](https://github.com/wladku/Vereino/issues/272), [#269](https://github.com/wladku/Vereino/issues/269)
**Route:** /club, /club/occurrences/<id>, /club/occurrences/<id>/attendance — Dziś → session → Lista obecności
**Before you start:** A training with ten participants and two reported absences, started or starting within 30 minutes; a match whose deadline passed with unanswered children; an unassigned session of the assistant's group starting within 2 hours; a started match and a match tomorrow; a session at an external venue with a substitute coach.

**Steps**

1. Open the training, tap „Lista obecności”, then „Oczekiwani obecni — zaznacz”, then „Zamknij termin” and confirm
2. Open the attendance list of a session starting in more than 30 minutes
3. Open the past-deadline match's attendance list and record a declaration for an unanswered child
4. As the assistant open the unassigned session and tap „Przejmij termin”; a second coach tries the same
5. On the started match fill „Wynik” („Nasza drużyna” 3, „Przeciwnik” 1, a note) and tap „Zapisz wynik”

**What to verify**

- [ ] Quick fill marks eight present; closing records the two absent; toast „Termin zamknięty — obecni: {count}.”
- [ ] Early list shows „Lista otworzy się o {time}, 30 minut przed rozpoczęciem…” and marks are refused
- [ ] Past deadline → „Termin minął: {count} bez odpowiedzi, na początku listy.” with them listed first; the coach can still record an answer
- [ ] Takeover → „Prowadzisz teraz ten termin.” and a history entry; the second person gets „Termin ma już prowadzącego…”
- [ ] Score 3:1 shows on the session page and the panel record; tomorrow's match → „Wynik można zapisać dopiero po rozpoczęciu terminu.”
- [ ] Venue session cards show the map link, „zastępstwo: {name}” and badges for guardian and coach

**What can go wrong**

- Quick fill marks children with reported absences as present
- Two coaches both take over the same session
- Score accepted on a training or before the match starts

#### S55 · P0 — Coach opens a place's day on the phone and books a free hour in one tap

**Role:** coach · **Device:** phone 375 px · **Why P0:** priority-high; contact data must stay hidden from coaches
**PRs:** [#348](https://github.com/wladku/Vereino/pull/348), [#335](https://github.com/wladku/Vereino/pull/335), [#392](https://github.com/wladku/Vereino/pull/392), [#363](https://github.com/wladku/Vereino/pull/363) · **Stories:** E11-S04, E11-S01, E11-S14 · **Issues:** [#278](https://github.com/wladku/Vereino/issues/278), [#275](https://github.com/wladku/Vereino/issues/275), [#366](https://github.com/wladku/Vereino/issues/366), [#288](https://github.com/wladku/Vereino/issues/288)
**Route:** /club/places and /club/places/<placeId>?date= — member menu Obiekty
**Before you start:** Coach with a team; a complex with two leaf pitches and an external hall; pitch open 08:00–22:00; a rental with a contact on Saturday; own general booking; four parallel entries on one day; a hall with no opening hours.

**Steps**

1. Open „Obiekty” in the member menu: check the list
2. Open the pitch, pick Saturday in the day chips and tap 09:00
3. Save a tournament with „Grupa”, „Rodzaj” „Turniej”, „Nazwa”; reload and tap the entry
4. Tap the rental entry; tap the own booking and choose „Odwołaj” → „Odwołaj rezerwację”
5. Tap 07:00 and save a group event starting 07:00 ending 09:00
6. Throttle the network and open the dialog again right after page load

**What to verify**

- [ ] List → only the two pitches, with kind, surface and „dziś: …” count (or „wolny”)
- [ ] Tap → dialog at once with „Dla grupy (wydarzenie)” preselected and 09:00–10:30, note „Rezerwacja personelu jest ważna od razu, bez akceptacji.”
- [ ] Tournament on the axis and in „Wpisy dnia”; tap opens the details sheet
- [ ] Rental details → renter name, no phone number
- [ ] Cancel asks „Odwołać rezerwację?” first; entry leaves the axis
- [ ] 07:00 event → „Miejsce jest wtedy nieczynne. Godziny otwarcia tego dnia: 08:00–22:00.” at the start time; a slow network still preselects „Dla grupy (wydarzenie)”

**What can go wrong**

- „Cel ogólny (rezerwacja klubu)” preselected for a coach
- Renter phone visible to the coach
- Page scrolls sideways with four parallel entries
- Member bottom bar covers the dialog's buttons

#### S56 · P0 — Coach runs a tournament part session without Edit and Cancel

**Role:** coach · **Device:** phone 375 px · **Why P0:** changes who can move or cancel a part session (#426 priority-high)
**PRs:** [#428](https://github.com/wladku/Vereino/pull/428), [#426](https://github.com/wladku/Vereino/pull/426) · **Stories:** E14-S07, E14-S01 · **Issues:** [#382](https://github.com/wladku/Vereino/issues/382), [#376](https://github.com/wladku/Vereino/issues/376)
**Route:** /club/occurrences/{id}, /club/occurrences/{id}/attendance
**Before you start:** A coach (not coordinator) assigned to a group part of a club event.

**Steps**

1. As the coach open the part from „Dziś” or „Kalendarz”
2. Look at the coach block on the session page
3. Open „Lista obecności” and „Napisz do grupy”

**What to verify**

- [ ] „Lista obecności” and „Napisz do grupy” are present and work
- [ ] „Edytuj” and „Odwołaj termin” are not shown for the part session
- [ ] A regular (non-part) session of the same coach still shows „Edytuj” and „Odwołaj termin”

**What can go wrong**

- Coach can still edit or cancel a part session (moves it away from the event)
- Edit/Cancel disappears also on ordinary sessions
- Attendance list missing for part sessions

#### S57 · P0 — Each role lands on its own start page; a coach-only person works in the staff context; an unlinked account sees a lasting notice

**Role:** coach · **Device:** phone 375 px · **Why P0:** priority-high; changes landing and context per role (access)
**PRs:** [#325](https://github.com/wladku/Vereino/pull/325), [#357](https://github.com/wladku/Vereino/pull/357) · **Stories:** E09-S05 · **Issues:** [#259](https://github.com/wladku/Vereino/issues/259), [#352](https://github.com/wladku/Vereino/issues/352)
**Route:** /login → /club, /club/calendar, /club/facility, /backend
**Before you start:** Coach-only person (no ward, no membership); coach who coordinates and has a ward; facility attendant; administrator without member side; an account linked to no person.

**Steps**

1. Sign in as the coach-only person and open „Kalendarz”
2. Sign in as the coach-coordinator with a ward and open the context switcher on /club
3. Sign in as the facility attendant without a redirect, then via a link to /club/messages/…
4. Sign in as the administrator without a member side
5. Sign in with the account linked to no person

**What to verify**

- [ ] Coach-only: lands on /club in staff context, no switcher, calendar lists her sessions; Today title is the greeting
- [ ] Coach-coordinator: switcher offers „jako członek / opiekun” and „jako trener / koordynator”, member is default; calendar merges ward and coached sessions, a shared session once
- [ ] Attendant lands on /club/facility; with an explicit redirect the redirect is kept; More shows „Panel administracyjny”
- [ ] Administrator without member side lands on /backend
- [ ] Unlinked account lands on /backend with a banner explaining the account is not linked; it stays until dismissed

**What can go wrong**

- Coach-only person sees an empty member view
- Stored staff context kept after coach grants end
- Unlinked-account notice flashes and disappears or never shows

#### S58 · P1 — A coach opens group payments from the Today tile with the group and the 'to pay' filter kept in the URL

**Role:** coach · **Device:** phone 375 px · **Why P1:** priority-medium label; display and navigation
**PRs:** [#370](https://github.com/wladku/Vereino/pull/370) · **Stories:** E12-S10 · **Issues:** [#300](https://github.com/wladku/Vereino/issues/300)
**Route:** /club/coach/payments?group=<id>&due=1 — Strefa członka → Płatności moich grup
**Before you start:** Coach of a group with unpaid charges and a handed-over kit; a section coordinator with a group that is not their own; club coach mode set in Trenerzy i płatności

**Steps**

1. Sign in as the coach and tap the coach payments tile on „Dziś”
2. Check the selected group chip and the „Do zapłaty” filter; reload
3. Read the group card (total, late count, mode line)
4. Find a handed-over kit row
5. Sign in as a section coordinator and open „Płatności moich grup”; then open ?group=<id> of a group outside their scope

**What to verify**

- [ ] Tile link opens with the group and „Do zapłaty” selected; reload keeps both
- [ ] Group card shows „Do zapłaty w grupie:”, „Osoby z zaległością: {count}” and the mode line matching the club setting
- [ ] Handed-over badge reads „Strój wydany {at}” with the time
- [ ] Coordinator → groups not their own carry „(sekcja)”
- [ ] Out-of-scope group in the URL → access denied state, no charges

**What can go wrong**

- The filter resets to „Wszyscy” after reload
- Mode line does not change after changing the coach mode setting
- Foreign group's charges render from a crafted URL

#### S59 · P1 — Author edits their own message on the phone

**Role:** coach · **Device:** phone 375 px · **Why P1:** priority-medium
**PRs:** [#371](https://github.com/wladku/Vereino/pull/371) · **Stories:** E13-S02 · **Issues:** [#304](https://github.com/wladku/Vereino/issues/304)
**Route:** /club/messages/{threadId} (bottom bar „Wiadomości”)
**Before you start:** A thread with the coach's own message and another person's message; a thread marked as a case.

**Steps**

1. Open „Wiadomości” and the thread
2. Click „Edytuj” on your own message, change „Treść wiadomości”, click „Zapisz”
3. Look for „Edytuj” on another person's message
4. Try to edit in the case thread

**What to verify**

- [ ] Text changes with the „edytowano” mark
- [ ] No edit on others', deleted or system messages
- [ ] Case thread refuses edits

**What can go wrong**

- Edit form overflows at 375 px
- Edited mark missing for other readers

### Guardian — phone 375 px

#### S60 · P0 — A payer pays every charge on the phone in two taps, including a partly paid one; a second guardian sees who pays

**Role:** guardian · **Device:** phone 375 px · **Why P0:** priority-high label; online payment (money)
**PRs:** [#345](https://github.com/wladku/Vereino/pull/345) · **Stories:** E12-S08 · **Issues:** [#298](https://github.com/wladku/Vereino/issues/298)
**Route:** /club/payments, /club/payments?pay=<chargeId>, Today page — Strefa członka → Płatności
**Before you start:** Guardian who is the primary payer with one open charge with a sibling discount and one partially paid charge; a second guardian of the same child who is not the payer; test payment gateway

**Steps**

1. Sign in as the paying guardian and open „Płatności”
2. Check the ticked charges, the „Opłata za płatność online” line and the discount line; untick one charge
3. Tick it again and tap „Zapłać {total}”, then „Potwierdź płatność testową”
4. Open /club/payments?pay=<chargeId> for one charge
5. Sign in as the second guardian and open „Płatności” and „Dziś”

**What to verify**

- [ ] On entry every payable charge (open and partially paid) is ticked; the button shows the total of what remains
- [ ] Discount line names its rule („Zniżka {name} −{amount}”); fee line always shows (in club-pays mode „{amount} — pokrywa klub”)
- [ ] Unticking updates the summary and the button amount
- [ ] ?pay=<id> → only that charge is ticked
- [ ] Second guardian → row „{child}: płaci {name}” with no checkbox and no amount; never „Wszystko opłacone.” falsely
- [ ] At 375 px one column, the pay button sticks to the bottom

**What can go wrong**

- Nothing is ticked on entry, or the partly paid charge cannot be selected
- The second guardian sees amounts of a charge they do not pay
- The fee line is hidden when zero
- A paid charge can still be sent to checkout

#### S61 · P0 — Guardian answers before the declaration deadline and is stopped after it

**Role:** guardian · **Device:** phone 375 px · **Why P0:** priority-high; changes when a guardian may declare
**PRs:** [#350](https://github.com/wladku/Vereino/pull/350) · **Stories:** E10-S04 · **Issues:** [#269](https://github.com/wladku/Vereino/issues/269)
**Route:** /club, /club/calendar, /club/occurrences/<id>, /club/d/<token> — Dziś / Kalendarz
**Before you start:** Administrator set „Potwierdzenie do (godzin przed rozpoczęciem)” on a match activity so a match has a deadline still ahead and another match whose deadline has passed; a training (absence-only) with a deadline value; a guardian with an account and one using a personal declaration link.

**Steps**

1. As the guardian open „Dziś”, then „Kalendarz”, then the match session page
2. Before the deadline tap „Będzie”
3. Open the match whose deadline has passed and try to answer „Nie będzie”; repeat through the personal e-mail link
4. On the training past its deadline tap „Zgłoś nieobecność”
5. Repeat in English and in dark mode

**What to verify**

- [ ] Card, calendar and session page show „Potwierdź do {date, time}” for the open match
- [ ] After the deadline → card reads „Termin minął” with „Jeśli dziecko jednak może przyjść, napisz do trenera.”; an unanswered child reads „Brak odpowiedzi”
- [ ] Late answer in app or via link → refused with „Termin odpowiedzi minął. Jeśli coś się zmieni, napisz do trenera.”
- [ ] Absence on the training after its deadline is accepted

**What can go wrong**

- Deadline shown in the wrong time zone or not at all on one of the three screens
- Late answer accepted through the personal link
- Absence reporting for trainings blocked by the deadline

#### S62 · P0 — Guardian has the same bottom bar and More list on every member page, skeletons while loading, unread messages on Today and the primary-payer badge

**Role:** guardian · **Device:** phone 375 px · **Why P0:** priority-high PR 320; bar entries are gated by features (who sees Payments)
**PRs:** [#320](https://github.com/wladku/Vereino/pull/320), [#333](https://github.com/wladku/Vereino/pull/333), [#324](https://github.com/wladku/Vereino/pull/324) · **Stories:** E09-S04, E09-S10, E09-S09 · **Issues:** [#258](https://github.com/wladku/Vereino/issues/258), [#264](https://github.com/wladku/Vereino/issues/264), [#263](https://github.com/wladku/Vereino/issues/263)
**Route:** /club, /club/calendar, /club/messages, /club/payments, /club/profile — bottom bar „Dziś · Kalendarz · Wiadomości · Płatności · Więcej”
**Before you start:** Adult guardian with a ward whose primary payer she is, two unread threads; also a coach without own payments and a 14-year-old participant with an account.

**Steps**

1. As the guardian at 375 px open „Dziś”, then „Kalendarz”, a thread in „Wiadomości”, „Płatności” and „Profil”
2. Open „Więcej” on each page
3. With DevTools network throttling (Slow 3G) reload Today, Messages and Payments
4. On Today read the Messages tile; on „Profil” find the ward card
5. Sign in as the coach and as the 14-year-old and open any member page

**What to verify**

- [ ] Every page shows „Dziś · Kalendarz · Wiadomości · Płatności · Więcej”, correct tab highlighted; „Więcej” lists „Profil”, „Zamówienia (np. stroje)”, „Wyloguj”
- [ ] Coach: fourth tab „Obiekty”, More lists „Profil”, „Moje jednostki”, „Płatności moich grup”, „Wyloguj”, without „Obiekty i rezerwacje”
- [ ] 14-year-old: three tabs, More with „Profil” and „Wyloguj” only
- [ ] While loading a grey skeleton in the content's shape appears, never a 'Wczytywanie…' text; empty lists name a next action
- [ ] Messages tile shows 2 and the newest subject linking to the thread; with none „Brak nowych wiadomości.”; the ward card shows the primary-payer badge

**What can go wrong**

- Payments tab appears on some pages and disappears on others
- Minor sees Payments or Orders
- Page jumps on load or shows a plain loading text
- More entry leads to 404 or 403

#### S63 · P0 — Guardian or adult member asks to leave the club from the phone and withdraws the request

**Role:** guardian · **Device:** phone 375 px · **Why P0:** departure ends memberships and closes accounts; may request data deletion
**PRs:** [#365](https://github.com/wladku/Vereino/pull/365) · **Stories:** E13-S04 · **Issues:** [#306](https://github.com/wladku/Vereino/issues/306)
**Route:** /club/profile → „Odejście z klubu” → /club/profile/leave
**Before you start:** Guardian with an account and two wards; a minor with an account; an adult participant and a coach.

**Steps**

1. Open „Profil”, click „Odejście z klubu”
2. Choose „Kto odchodzi”, „Ostatni dzień”, tick „Usuńcie też nasze dane”, click „Wyślij prośbę”
3. Click „Wycofaj”
4. Send again and have the administrator decline it with a reason; reopen the page
5. Sign in as the minor and open „Profil”

**What to verify**

- [ ] Open request shows with its date and a withdraw button; a second open request is refused
- [ ] Withdraw removes it
- [ ] Declined request shows the club's reason
- [ ] Minor has no leave link

**What can go wrong**

- Guardian can name another family's child
- Request not visible on the admin Leaving tab

#### S64 · P0 — Guardians and coaches without the coordinator role cannot manage club events

**Role:** guardian · **Device:** phone 375 px · **Why P0:** access control: who can create events and add places
**PRs:** [#438](https://github.com/wladku/Vereino/pull/438), [#425](https://github.com/wladku/Vereino/pull/425), [#426](https://github.com/wladku/Vereino/pull/426) · **Stories:** E14-S05, E14-S02, E14-S01 · **Issues:** [#380](https://github.com/wladku/Vereino/issues/380), [#377](https://github.com/wladku/Vereino/issues/377), [#376](https://github.com/wladku/Vereino/issues/376)
**Route:** /club (Więcej menu), /club/club-events/new
**Before you start:** A guardian account and a coach account (no coordinator role) in the example club; a club event exists.

**Steps**

1. Sign in as the guardian, open „Więcej”
2. Type /club/club-events/new in the address bar
3. Sign in as a coach and open /club/club-events/new

**What to verify**

- [ ] „Imprezy klubowe” is absent from „Więcej” for the guardian
- [ ] /club/club-events/new refuses the guardian (no form, access refused)
- [ ] The coach cannot create a club event nor reach the „Dodaj obiekt” place dialog

**What can go wrong**

- Menu entry visible to guardians
- Form loads and saves for a user without activities.manage
- A coach can add places to the club's places list

#### S65 · P1 — A guardian follows a kit order on the phone: stage, deadlines, pickup and who handed it over

**Role:** guardian · **Device:** phone 375 px · **Why P1:** priority-medium label
**PRs:** [#393](https://github.com/wladku/Vereino/pull/393) · **Stories:** E12-S09 · **Issues:** [#299](https://github.com/wladku/Vereino/issues/299)
**Route:** /club/orders, /club/orders/<campaignId>, Today page — Strefa członka → Zamówienia (np. stroje)
**Before you start:** An open kit campaign covering two wards (one ordered, unpaid; one not ordered); later the campaign delivered and one kit handed over

**Steps**

1. Sign in as the guardian and open „Dziś”; read the „Zamówienie” tile
2. Open „Zamówienia (np. stroje)” and read each campaign card
3. Open the campaign; switch children with the „Dziecko” chips
4. Tap „Zapłać online {amount}”
5. After the administrator marks delivered and hands over a kit, reopen the campaign

**What to verify**

- [ ] Tile shows „zamówienia do {date}” and per child „{child}: zamówiono — {amount}” / „{child}: nie zamówiono”; absent with no open campaign
- [ ] Campaign card shows the stage badge and „Płatność do {date}”
- [ ] „Zapłać online {amount}” opens /club/payments with only that charge ticked
- [ ] Delivered → „Do odbioru u trenera”; handed over → „Odebrane” with „{at} · wydał(a) {by}”
- [ ] At 375 px chips scroll horizontally

**What can go wrong**

- Tile visible when no campaign is open
- Pay online ticks all charges instead of one
- Handed-over line lacks the time or the person

#### S66 · P1 — A guardian without an account orders a kit from a personal e-mail link that names them

**Role:** guardian · **Device:** phone 375 px · **Why P1:** priority-medium label
**PRs:** [#393](https://github.com/wladku/Vereino/pull/393) · **Stories:** E12-S09 · **Issues:** [#299](https://github.com/wladku/Vereino/issues/299)
**Route:** /club/o/<token>
**Before you start:** A personal order link e-mailed to a guardian for an open campaign; an expired link

**Steps**

1. Open the personal link at 375 px without signing in
2. Read the notice above the form
3. Place an order
4. Open the expired link

**What to verify**

- [ ] Notice reads „Osobisty link: {name}” with the guardian's name and „Link z e-maila — nie przekazuj go dalej…”
- [ ] Order is placed for the right child
- [ ] Expired link → „Ten link wygasł” and „Zaloguj się”

**What can go wrong**

- The notice names another guardian
- Expired link still accepts an order

#### S67 · P1 — Guardian sees 18th-birthday and own-account notices on the ward card

**Role:** guardian · **Device:** phone 375 px · **Why P1:** priority-medium
**PRs:** [#414](https://github.com/wladku/Vereino/pull/414) · **Stories:** E13-S08 · **Issues:** [#310](https://github.com/wladku/Vereino/issues/310)
**Route:** /club/profile („Podopieczni i zgody”), /club/wards/{personId}
**Before you start:** Ward turning 18 within 30 days; ward at the own-account age; job has run.

**Steps**

1. Open „Profil” and the ward cards
2. Open the ward page
3. Sign in as the adult after the birthday and open „Profil”

**What to verify**

- [ ] „Kończy 18 lat {date}: od tego dnia {name} decyduje samodzielnie”
- [ ] „Może mieć własne konto — zapytaj klub”
- [ ] Adult sees a notice card about consents and charges

**What can go wrong**

- Notice text overflows at 375 px
- Notice shown for the wrong ward

#### S68 · P1 — Guardian sees only their child's tournament part, linked to the event, in Today, calendar and session page

**Role:** guardian · **Device:** phone 375 px · **Why P1:** priority-medium; read-only member view
**PRs:** [#428](https://github.com/wladku/Vereino/pull/428) · **Stories:** E14-S07 · **Issues:** [#382](https://github.com/wladku/Vereino/issues/382)
**Route:** /club (Dziś), /club/calendar (Kalendarz), /club/occurrences/{id}
**Before you start:** A club event with parts for two groups; the guardian's child is in one of them; a second guardian whose child plays in no part; the event initially not public.

**Steps**

1. As the guardian open „Dziś”, then „Kalendarz”, then the part's session page
2. Make the event and club page public (administrator), reload the three screens
3. Sign in as the guardian whose child plays in no part and check the same screens
4. After the declaration deadline, open the part session as the first guardian

**What to verify**

- [ ] Only the child's part shows, with the event name line; plain text while not public, a link to /p/{club}/events/{slug} once public
- [ ] The session page lists the visiting teams under „Drużyny gości”
- [ ] Guardian without a playing child sees nothing of the tournament
- [ ] After the deadline the controls close with „Termin minął”

**What can go wrong**

- Other groups' parts visible to the guardian
- Event line links to a 404 while the event is not public
- Declaration still possible after the deadline

### Member and adult participant — phone 375 px

#### S69 · P1 — Adult participant gives and withdraws own consents on the phone

**Role:** adult participant · **Device:** phone 375 px · **Why P1:** priority-medium
**PRs:** [#412](https://github.com/wladku/Vereino/pull/412) · **Stories:** E13-S07 · **Issues:** [#309](https://github.com/wladku/Vereino/issues/309)
**Route:** /club/profile → „Moje zgody”
**Before you start:** Adult participant with an account; administrator changed a consent text in „Treść zgód” after one consent was given; a 17-year-old with an account.

**Steps**

1. Open „Profil”, section „Moje zgody”
2. Give „Zgoda na publikację wizerunku” and „Zgoda na wyjazdy”
3. Withdraw one: confirm „Wycofaj” or „Zostaw zgodę”
4. Sign in as the 17-year-old and open „Profil”

**What to verify**

- [ ] Stored with author and date and an effect line
- [ ] Withdrawal asks for confirmation
- [ ] Consent given before a text change reads „Udzielona do wcześniejszej treści”
- [ ] 17-year-old cannot set own consents

**What can go wrong**

- Withdrawal blocks taking part
- Old club text shown

### Facility attendant and maintainer — phone 375 px

#### S70 · P0 — Facility attendant runs today, takes a phone rental and requests an entry ban

**Role:** facility attendant · **Device:** phone 375 px · **Why P0:** priority-high; place-scoped access for the attendant
**PRs:** [#354](https://github.com/wladku/Vereino/pull/354), [#335](https://github.com/wladku/Vereino/pull/335) · **Stories:** E11-S08, E11-S01 · **Issues:** [#282](https://github.com/wladku/Vereino/issues/282), [#275](https://github.com/wladku/Vereino/issues/275)
**Route:** /club/facility?tab=today|rentals, /club/facility/rentals/<id>, /club/places/<placeId> — member menu Dziś na obiekcie
**Before you start:** A user with only „Animator obiektu” (vereino_facility_operator) for pitch A; today a session with coach and group on a sub-place and a rental with a phone; a regular renter of pitch A; pitch B outside the grant.

**Steps**

1. Open „Dziś na obiekcie”, tab „Dziś”; tap „Nie stawił się” on the rental before its start
2. Tap „Otwórz obiekt”, then fill „Liczba osób” for the group
3. Tap „Zgłoś incydent”, pick the place and „Wynajem, którego dotyczy”, tick „Poproś o zakaz wstępu”, attach a photo, save; if the photo fails use „Dodaj zdjęcie”
4. Go to the place's day, tap a free hour, find the regular renter and save a rental
5. Open tab „Wynajmy”, open the new rental card; correct the contact, use „Potwierdź wpłatę” and „Odwołaj”
6. Try to open pitch B's day or a pitch B rental

**What to verify**

- [ ] Session row shows sub-place, group and coach; rental row shows contact with a tappable phone
- [ ] No headcount fields before opening; „Nie stawił się” before start shows „„Nie stawił się” można oznaczyć dopiero po rozpoczęciu wynajmu.” with no request
- [ ] Place picker lists pitch A and its sub-places; administrators get one „Prośba o zakaz wstępu” notification
- [ ] New rental appears on „Wynajmy”; its page saves contact changes, confirms (no charge) and cancels
- [ ] Pitch B → access refused or empty, no other club's data

**What can go wrong**

- Place pickers empty for the attendant
- Phone missing or not a tel: link
- Ban request sends no notification or duplicates
- Attendant sees pitch B rentals

#### S71 · P1 — Place maintainer sees, plans and completes maintenance tasks on the phone

**Role:** maintainer · **Device:** phone 375 px · **Why P1:** priority-medium
**PRs:** [#362](https://github.com/wladku/Vereino/pull/362) · **Stories:** E11-S09 · **Issues:** [#283](https://github.com/wladku/Vereino/issues/283)
**Route:** /club/places/maintenance and /club/places/<placeId> — member menu Obiekty → Konserwacja
**Before you start:** A person recorded as maintainer of a pitch (gets vereino_maintenance_planner) with a due task and a usage task at threshold; a session on Friday 07:00 on the pitch; a hall they do not maintain; a done task.

**Steps**

1. Open the maintenance reminder notification link, or „Obiekty” → „Konserwacja”
2. Check groups „Do zrobienia”, „Zaplanowane”, „Wykonane”
3. Click „Wykonano” on a due task
4. Open the pitch day via „Dzień: …”, use „Zaplanuj konserwację” over Friday 07:00
5. Open the hall's maintenance or day page

**What to verify**

- [ ] List shows only the pitch's tasks
- [ ] Completing creates the next instance
- [ ] Planned window appears on the axis and flags the session
- [ ] Hall → access refused
- [ ] Completing a done task again → „To zadanie jest już wykonane lub anulowane i nie można go zmienić.”

**What can go wrong**

- Tasks of other places listed
- „Konserwacja” link missing for a maintainer
- Axis shows names to the maintainer instead of a neutral busy label

### Public visitor and renter — phone 375 px

#### S72 · P0 — Renter receives rental e-mails and cancels the rental through the link

**Role:** renter · **Device:** phone 375 px · **Why P0:** moves money: free cancel vs forfeit, charge cancelled
**PRs:** [#386](https://github.com/wladku/Vereino/pull/386) · **Stories:** E11-S12 · **Issues:** [#286](https://github.com/wladku/Vereino/issues/286)
**Route:** /p/<clubSlug>/rentals/cancel/<token> (from the e-mail)
**Before you start:** Mailbox access for a rental with an e-mail address; a second rental past its free-cancellation deadline; a rental without an e-mail; payments enabled.

**Steps**

1. Staff enter a rental with an e-mail, then move it; check the renter's inbox
2. Open the cancel link from the newest e-mail on a 375 px phone
3. Read the summary and click „Odwołaj rezerwację”
4. Open the same link again; open the old pre-move link
5. Repeat with the late rental; on the panel open the rental without an e-mail

**What to verify**

- [ ] Summary e-mail „Twoja rezerwacja: …”, then „Rezerwacja przeniesiona: …” with a new link
- [ ] Before deadline → „Odwołanie bez opłat” shown before the button; result „Rezerwacja odwołana”, charge cancelled, cancellation e-mail sent
- [ ] After deadline → „Wpłata przepada” stated before the button; rental „Anulowany po terminie”
- [ ] Spent or old link → „Ten link już nie działa” with no data
- [ ] Page shows no contact data; rental without e-mail shows „Brak adresu e-mail: …” on its record

**What can go wrong**

- Old link still cancels after a move
- Forfeit not warned before cancelling
- Contact details shown on the public page

#### S73 · P1 — Guest opens the public tournament page from the club's Events page

**Role:** public visitor · **Device:** phone 375 px · **Why P1:** priority-medium; public sessionless page (no personal data must leak)
**PRs:** [#439](https://github.com/wladku/Vereino/pull/439) · **Stories:** E14-S06 · **Issues:** [#381](https://github.com/wladku/Vereino/issues/381)
**Route:** /p/{clubSlug}/events (P-06) → /p/{clubSlug}/events/{eventSlug} — Wydarzenia
**Before you start:** Club page published with the „Menu Wydarzenia” block on; a public club event with a poster, funder logos, parts over several days (one non-public group); also an unpublished event, a cancelled event and a single sparring.

**Steps**

1. Open the club's public „Wydarzenia” page signed out
2. Find the club event card and open it
3. Scroll the tournament page: poster, place, „Program”, „Dofinansowanie”
4. Open the URL of an unpublished event and of the event under another club's slug
5. Turn off the events block and reload

**What to verify**

- [ ] P-06 shows one card per club event with poster thumbnail, date range, place and „{count} części”, not one per part; the single sparring still shows as before; a cancelled event is struck through
- [ ] Tournament page shows poster, place with map link, days with parts, „Nasza drużyna:” / „Goście:”, „Organizator: {club}” and funder logos with names as alt text; no person's name anywhere
- [ ] Cancelled event shows „To wydarzenie zostało odwołane.” without the reason
- [ ] Unpublished / foreign-slug / no-parts event shows „To wydarzenie nie jest opublikowane” with a link to the club page

**What can go wrong**

- Each part listed as a separate event on P-06
- Coach or contact names visible on the public page
- Another club's event reachable under this club's slug, or files of an unpublished event downloadable

#### S74 · P1 — Public visitor browses places and confirms a booking request inside the club's frame

**Role:** public visitor · **Device:** phone 375 px · **Why P1:** priority-medium
**PRs:** [#388](https://github.com/wladku/Vereino/pull/388) · **Stories:** E11-S15 · **Issues:** [#289](https://github.com/wladku/Vereino/issues/289)
**Route:** /p/<clubSlug>/places, /p/<clubSlug>/places/<placeSlug>, /p/<clubSlug>/requests/verify/<token>
**Before you start:** A club with public places; online requests switched on and then off; a mid-month date; a request link from the e-mail; a second request whose slot gets taken before confirmation.

**Steps**

1. Open the places page with online requests on, then off; switch the club's public pages off
2. Open a place calendar
3. Click the request confirmation link from the e-mail; reopen it
4. Confirm the request whose slot was taken

**What to verify**

- [ ] Intro and badge follow the mode: „Zgłoszenia online” or „Rezerwacja telefoniczna”; disabled club shows „Klub nie udostępnia kalendarzy obiektów” with its phone
- [ ] Place page starts today („dziś”) with „Pokaż wcześniejsze dni”; online notice names the owner
- [ ] Confirmation shows the summary once; reopening shows the expired state with no data
- [ ] Taken slot → „Wróć do kalendarza” opens that place
- [ ] Every page and error state renders inside the club's frame

**What can go wrong**

- Summary shown again on reuse
- List starts at month start on the phone
- Error pages without the club header

#### S75 · P1 — Public visitor uses the club menu, the Events page and a club-branded sign-in page

**Role:** public visitor · **Device:** phone 375 px · **Why P1:** priority-medium PRs
**PRs:** [#327](https://github.com/wladku/Vereino/pull/327), [#324](https://github.com/wladku/Vereino/pull/324) · **Stories:** E09-S07, E09-S09 · **Issues:** [#261](https://github.com/wladku/Vereino/issues/261), [#263](https://github.com/wladku/Vereino/issues/263)
**Route:** /p/{clubSlug}, /p/{clubSlug}/events, /p/{clubSlug}/places, /login?club={clubSlug}; admin toggle at /backend/club/publication
**Before you start:** Published club with calendar block on; public sections with a tournament next week, one 30 and one 90 days ago, a sparring in a second section, and a match in a non-public group; administrator can toggle „Menu Wydarzenia”.

**Steps**

1. Open the club page and every public page type; use the header links „Klub”, „Sekcje”, „Obiekty”, „Wydarzenia”, „Zaloguj”
2. On „Wydarzenia” filter by „Sekcja”
3. Open a non-existent section URL
4. Click „Zaloguj”, sign in, sign out and open /login without parameters; then open /login?club=unknown-slug
5. As administrator switch off „Menu Wydarzenia” and reload the public page as a guest

**What to verify**

- [ ] Header with logo, name and links on every public page; under 480 px links scroll in a second row
- [ ] „Nadchodzące” lists next week's tournament and the sparring; „Minione (ostatnie 60 dni)” the 30-day one; never the 90-day one or the private match; filter leaves the first section's two
- [ ] Club page and section page list no events; team cards name their age category; missing section offers a link back to the club page
- [ ] Sign-in shows the club's logo, name and „Jedno konto dla rodzica, zawodnika i trenera”; after a sign-in /login alone keeps the club; unknown slug shows Vereino with no hint whether the club exists; 'Open Mercato' appears nowhere
- [ ] With the block off: no „Wydarzenia” link and the page says „Klub nie publikuje wydarzeń”

**What can go wrong**

- Header missing on facility or request-verification pages
- Private group match or an old event leaks onto the Events page
- Login reveals existence of an unpublished club

## Story coverage

Every issue closed since the window start, with the scenarios that cover it. Epics close when their stories do; they are covered through their stories.

| Issue | Title | Scenarios |
|---|---|---|
| [#82](https://github.com/wladku/Vereino/issues/82) | E06 — UX parity with the clickable mockup, phases 1–3 | epic — see its stories |
| [#106](https://github.com/wladku/Vereino/issues/106) | E07 — Payments (phase 4) | epic — see its stories |
| [#118](https://github.com/wladku/Vereino/issues/118) | E07-S11 — A treasurer sees who holds the club's cash and accepts a handover with a numbered record | S30, S47 |
| [#119](https://github.com/wladku/Vereino/issues/119) | E08 — Facilities and bookings (phase 5) | epic — see its stories |
| [#193](https://github.com/wladku/Vereino/issues/193) | ci: the integration job is at its time limit; shard the Playwright suite | no manual check needed (CI/tooling) |
| [#221](https://github.com/wladku/Vereino/issues/221) | E08-S02 follow-ups from PR #210: occupancy em, closure undo locking, rental nits | S13, S19 |
| [#231](https://github.com/wladku/Vereino/issues/231) | fix(people): the person record's Groups tab takes "today" from the browser clock, so a membership starting today shows as upcoming around midnight | S44 |
| [#245](https://github.com/wladku/Vereino/issues/245) | E07-S11b — A treasurer works with a finance-only role, menu and dashboard | S47 |
| [#246](https://github.com/wladku/Vereino/issues/246) | fix(club_core): the Club group (Sections, Places, Institutions, Contracts) is missing from the admin sidebar | S12 |
| [#248](https://github.com/wladku/Vereino/issues/248) | E06-S12 coordinator calendar: an empty week's time grid is not keyboard-reachable (axe scrollable-region-focusable; flakes late on Saturday) | S15 |
| [#251](https://github.com/wladku/Vereino/issues/251) | E09 — Navigation, shells and one glossary (parity II) | epic — see its stories |
| [#252](https://github.com/wladku/Vereino/issues/252) | E10 — Groups, activities and sessions in the panel and on the phone (parity II) | epic — see its stories |
| [#253](https://github.com/wladku/Vereino/issues/253) | E11 — Facility calendar, rentals and the attendant on the phone (parity II) | epic — see its stories |
| [#254](https://github.com/wladku/Vereino/issues/254) | E12 — Payments as the mockup shows them: rental charges, cash on every screen, campaign record and phone pages (parity II) | epic — see its stories |
| [#255](https://github.com/wladku/Vereino/issues/255) | E13 — People life cycle and data entry (parity II) | epic — see its stories |
| [#256](https://github.com/wladku/Vereino/issues/256) | E09-S02 — An administrator opens Institutions and contracts, Threads and cases, Zones and rates, Log and incidents and the Municipality report as pages with tabs | S12 |
| [#257](https://github.com/wladku/Vereino/issues/257) | E09-S03 — Every text of the application uses the mockup's glossary, and a check keeps retired terms out | S12 |
| [#258](https://github.com/wladku/Vereino/issues/258) | E09-S04 — A member sees the same bottom bar on every page and reaches every member page from More | S62 |
| [#259](https://github.com/wladku/Vereino/issues/259) | E09-S05 — A coach-only person starts in the staff context, and each role lands on its own page after sign-in | S57 |
| [#260](https://github.com/wladku/Vereino/issues/260) | E09-S06 — An administrator, a coordinator and an attendant see a greeting, their own dashboard widgets, menu counts and a link to the member interface | S20 |
| [#261](https://github.com/wladku/Vereino/issues/261) | E09-S07 — A guest finds the club's menu on every public page and signs in on a page with the club's logo and name | S75 |
| [#262](https://github.com/wladku/Vereino/issues/262) | E09-S08 — An administrator gets the mockup's remaining functions on publication, sections, contracts and people | S22 |
| [#263](https://github.com/wladku/Vereino/issues/263) | E09-S09 — A guest finds the club's matches, tournaments and camps on a public Events page, and a member sees unread messages on Today | S62, S75 |
| [#264](https://github.com/wladku/Vereino/issues/264) | E09-S10 — Member and public pages load with a skeleton, and every empty list names the next action | S62 |
| [#265](https://github.com/wladku/Vereino/issues/265) | E09-S11 — The UX concept README describes the navigation that D-029, D-030 and D-031 decided | no manual check needed (#332) |
| [#266](https://github.com/wladku/Vereino/issues/266) | E10-S01 — An administrator sees the groups list and record as in the mockup, and a team with matches cannot become a class group | S36 |
| [#267](https://github.com/wladku/Vereino/issues/267) | E10-S02 — A coordinator corrects a roster mistake: edits, ends on a chosen day or removes a membership | S10, S49, S50 |
| [#268](https://github.com/wladku/Vereino/issues/268) | E10-S03 — A coordinator plans a series without collisions and works one activity's sessions from the list | S15, S48 |
| [#269](https://github.com/wladku/Vereino/issues/269) | E10-S04 — A guardian confirms by the declaration deadline and the coach sees who has not answered | S54, S61 |
| [#270](https://github.com/wladku/Vereino/issues/270) | E10-S05 — A coach creates a sparring or an away match on the phone with a typed venue and a gathering time | S53 |
| [#271](https://github.com/wladku/Vereino/issues/271) | E10-S06 — Families are told in the thread, in the app and by e-mail whenever a session moves | S25, S48 |
| [#272](https://github.com/wladku/Vereino/issues/272) | E10-S07 — A coach fills attendance in one tap, takes over an unstaffed session and records a match score on the phone | S48, S54 |
| [#273](https://github.com/wladku/Vereino/issues/273) | E10-S08 — A section coordinator assigns a substitute, moves and cancels sessions from the phone | S48 |
| [#274](https://github.com/wladku/Vereino/issues/274) | E10-S09 — A section coordinator edits rosters, marks a case and deletes a message from the phone | S49, S50 |
| [#275](https://github.com/wladku/Vereino/issues/275) | E11-S01 — Facilities pickers and lists read places from the module's own source, and the attendant's pickers are no longer empty | S17, S55, S70 |
| [#276](https://github.com/wladku/Vereino/issues/276) | E11-S02 — An administrator sees one place's whole day on the hour axis of the facility calendar | S17 |
| [#277](https://github.com/wladku/Vereino/issues/277) | E11-S03 — Staff tap a free hour and save a rental, a group event or a club booking from one slot dialog | S19 |
| [#278](https://github.com/wladku/Vereino/issues/278) | E11-S04 — A coach or coordinator opens a place's day on the phone and books a free hour in one tap | S55 |
| [#279](https://github.com/wladku/Vereino/issues/279) | E11-S05 — An administrator opens a rental from the list and corrects its contact, purpose, notes and renter | S23 |
| [#280](https://github.com/wladku/Vereino/issues/280) | E11-S06 — An administrator decides a booking request from a card that shows every fact the decision needs | S33 |
| [#281](https://github.com/wladku/Vereino/issues/281) | E11-S07 — An administrator works the zones, closures, price list, log, incidents and bans tabs and adds past records from the panel | S19, S37 |
| [#282](https://github.com/wladku/Vereino/issues/282) | E11-S08 — A facility attendant takes and manages rentals and asks for an entry ban, all on the phone | S70 |
| [#283](https://github.com/wladku/Vereino/issues/283) | E11-S09 — A person who maintains a place sees, plans and completes their tasks on the phone | S71 |
| [#284](https://github.com/wladku/Vereino/issues/284) | E11-S10 — An administrator sets the payment days and automatic expiry in the management agreement, and unpaid rentals are listed or expire | S21 |
| [#285](https://github.com/wladku/Vereino/issues/285) | E11-S11 — A rental carries a charge payable to the place owner and is confirmed when the charge is paid | S46 |
| [#286](https://github.com/wladku/Vereino/issues/286) | E11-S12 — A renter gets e-mails about their rental and cancels it through a link | S72 |
| [#287](https://github.com/wladku/Vereino/issues/287) | E11-S13 — Staff are told when a closure or maintenance window flags their entry to be moved | S42 |
| [#288](https://github.com/wladku/Vereino/issues/288) | E11-S14 — A one-off group event on a club place is refused outside the place's opening hours | S55 |
| [#289](https://github.com/wladku/Vereino/issues/289) | E11-S15 — A guest sees the public places, calendar and request confirmation as the mockup shows them, inside the club's frame | S74 |
| [#290](https://github.com/wladku/Vereino/issues/290) | E11-S16 — An administrator sees today's facility entries on the dashboard widget "Today at the facility" | S38 |
| [#291](https://github.com/wladku/Vereino/issues/291) | E12-S01 — A rental creates its charge payable to the facility owner, and the administrator finds it under "Rentals (municipality)" | S04 |
| [#292](https://github.com/wladku/Vereino/issues/292) | E12-S02 — An administrator accepts cash from the charges list, a charge and the bank statement page, and B-21 and B-22 match the mockup | S04, S05, S24 |
| [#293](https://github.com/wladku/Vereino/issues/293) | E12-S03 — An administrator runs a kit campaign from its record: who ordered, what is paid, cash and handover in the row | S29 |
| [#294](https://github.com/wladku/Vereino/issues/294) | E12-S04 — An administrator decides each transfer with one button in the row and deletes an import from which nothing was booked | S24 |
| [#295](https://github.com/wladku/Vereino/issues/295) | E12-S05 — An administrator adds a charge by hand, assigns a payer to a charge without one and sees a person's charges on their record | S07 |
| [#296](https://github.com/wladku/Vereino/issues/296) | E12-S06 — An administrator refunds an online payment from the charge and finds every overpayment under "To refund" | S28 |
| [#297](https://github.com/wladku/Vereino/issues/297) | E12-S07 — An administrator sees bank statements and cash, order campaigns and charges without a payer on the dashboard | S43 |
| [#298](https://github.com/wladku/Vereino/issues/298) | E12-S08 — A payer pays everything on the phone in two taps, including what remains of a partly paid charge, and a guardian who is not the payer sees who pays | S60 |
| [#299](https://github.com/wladku/Vereino/issues/299) | E12-S09 — A guardian follows a kit order on the phone: stage, deadlines, pickup and who handed it over | S65, S66 |
| [#300](https://github.com/wladku/Vereino/issues/300) | E12-S10 — The cash and coach pages name the receiver, list today's receipts, state the club's coach mode and show when a kit was handed over | S06, S58 |
| [#301](https://github.com/wladku/Vereino/issues/301) | E12-S11 — Charges are generated, overdue payers reminded, checkouts reconciled and campaigns closed on a schedule | S31 |
| [#302](https://github.com/wladku/Vereino/issues/302) | E12-S12 — An administrator sees whether online payment is connected and chooses the payment methods offered to payers | S45 |
| [#303](https://github.com/wladku/Vereino/issues/303) | E13-S01 — An administrator sees the account state, sends the invitation again, changes the login e-mail and blocks or unblocks the account | S16 |
| [#304](https://github.com/wladku/Vereino/issues/304) | E13-S02 — An administrator enters role dates, a guardianship start, an external id and a material title, and an author edits their own message | S35, S59 |
| [#305](https://github.com/wladku/Vereino/issues/305) | E13-S03 — A new club is set up in the panel without the command line, and every empty picker says what is missing and offers a way on | S03 |
| [#306](https://github.com/wladku/Vereino/issues/306) | E13-S04 — A member or guardian asks to leave from the phone, and the administrator ends the family's part in the club in one dated, previewed step | S18, S63 |
| [#307](https://github.com/wladku/Vereino/issues/307) | E13-S05 — A leaving coach's sessions are handed over or freed, their contract ends, and the departure waits until their cash is settled | S02 |
| [#308](https://github.com/wladku/Vereino/issues/308) | E13-S06 — An administrator anonymises a former person on a recorded request, with a retention hold for payments, and deletes a person created by mistake | S08 |
| [#309](https://github.com/wladku/Vereino/issues/309) | E13-S07 — An adult participant gives and withdraws their own consents on the phone and sees what each changes, and the club edits the consent texts | S34, S69 |
| [#310](https://github.com/wladku/Vereino/issues/310) | E13-S08 — On a ward's 18th birthday the guardianship ends and the consents and new charges move to the adult; the family hears 30 days ahead and when a child reaches the account age | S27, S67 |
| [#311](https://github.com/wladku/Vereino/issues/311) | E13-S09 — An administrator, or a coordinator for their sections, moves groups, recurring activities and fees to a new season in one previewed step | S14 |
| [#312](https://github.com/wladku/Vereino/issues/312) | E13-S10 — An administrator sets up a new coach from one checklist, a moved child pays one fee for the month, and a person photo and a contract PDF are stored | S01, S40 |
| [#352](https://github.com/wladku/Vereino/issues/352) | test(people): E02-S03 unlinked-account sign-in is flaky in CI | S57 |
| [#358](https://github.com/wladku/Vereino/issues/358) | Fix: three setup hints send a new club administrator to the wrong place | S03 |
| [#359](https://github.com/wladku/Vereino/issues/359) | groups: roster correction follow-ups from the review of #355 (scope tests, usage query, a11y) | S10 |
| [#366](https://github.com/wladku/Vereino/issues/366) | fix(facilities): the slot dialog may preselect "General purpose" for a coach before their groups load (TEST-R04 flake) | S55 |
| [#368](https://github.com/wladku/Vereino/issues/368) | test(activities): TEST-A12 scans the new-event form mid colour-scheme fade and fails color-contrast intermittently | no manual check needed (#369) |
| [#375](https://github.com/wladku/Vereino/issues/375) | E14 — Club events with parts, like the Gwiazda Cup tournament | epic — see its stories |
| [#376](https://github.com/wladku/Vereino/issues/376) | E14-S01 — A club event and its parts exist through the API, each part with a group is a session of that group, and only the event's managers move or cancel it | S09, S11, S51, S56, S64 |
| [#377](https://github.com/wladku/Vereino/issues/377) | E14-S02 — A section coordinator adds a missing external place from the event form, and it stays on the list for next time | S11, S51, S64 |
| [#378](https://github.com/wladku/Vereino/issues/378) | E14-S03 — An administrator lists club events in the panel, creates one with its place, and works its parts by day | S09, S11 |
| [#379](https://github.com/wladku/Vereino/issues/379) | E14-S04 — An administrator uploads the club event's poster and the funders' logos | S41 |
| [#380](https://github.com/wladku/Vereino/issues/380) | E14-S05 — A section coordinator sets up and runs a club event with all its parts on the phone | S51, S52, S64 |
| [#381](https://github.com/wladku/Vereino/issues/381) | E14-S06 — A guest opens the tournament page from the poster and finds the club event once on the public Events page | S73 |
| [#382](https://github.com/wladku/Vereino/issues/382) | E14-S07 — A guardian sees only their child's part, named with its club event, and a coach runs the part without moving it | S56, S68 |
| [#383](https://github.com/wladku/Vereino/issues/383) | E13-S11 — An administrator or a coordinator moves several children from a roster to another group in one previewed step that can be undone | S26 |
| [#384](https://github.com/wladku/Vereino/issues/384) | E13-S12 — An administrator gives each age category its PZPN birth years, and a team's age range follows its category | S39 |
| [#394](https://github.com/wladku/Vereino/issues/394) | facilities: reschedule notices — batch the per-entry reads and cover a moved window end to end (follow-up of #387) | no manual check needed (#409) |
| [#403](https://github.com/wladku/Vereino/issues/403) | Payments: an administrator cannot undo an automatic charge generation (spec risk row expects it) — owner decision | S32 |
| [#404](https://github.com/wladku/Vereino/issues/404) | Payments: one overdue reminder moves the counters of every listed charge, not only the due ones (DD-C09 wording) — owner decision | no manual check needed (#419) |
| [#405](https://github.com/wladku/Vereino/issues/405) | Payments: harden the scheduled jobs (re-register on a time zone change, quieter sweep audit, migration-name lookup, setup of existing clubs) | no manual check needed (#417) |
| [#407](https://github.com/wladku/Vereino/issues/407) | ci: browser-smoke sign-in intermittently times out waiting for /backend | no manual check needed (#408) |
| [#440](https://github.com/wladku/Vereino/issues/440) | Club events on the phone: options error state, Past list order, lighter form imports (follow-up to #438) | S51, S52 |

## No manual check needed

Merged PRs without a user-visible change. They are covered by the automated gate and are not turned into scenarios.

- [#249](https://github.com/wladku/Vereino/pull/249) docs(specs): five draft specifications that close the mockup parity audit, and D-031 — documentation only (specs, SDLC, lessons)
- [#250](https://github.com/wladku/Vereino/pull/250) docs(specs): the public Events menu (P-06) in the mockup and the parity specs — documentation only (specs, SDLC, lessons)
- [#316](https://github.com/wladku/Vereino/pull/316) test(people): wait for the dashboard to settle before E06-S06 lifts the widget failure — test-only change — no user-visible change
- [#317](https://github.com/wladku/Vereino/pull/317) docs(specs): spec N is ready — owner decisions and audit gaps of #251 — documentation only (specs, SDLC, lessons)
- [#321](https://github.com/wladku/Vereino/pull/321) test: integration tests read UI texts from the catalogs, and qa-texts:check keeps it so — test-only change — no user-visible change
- [#322](https://github.com/wladku/Vereino/pull/322) docs(sdlc): Cezar builds at most two issues at a time — documentation only (specs, SDLC, lessons)
- [#326](https://github.com/wladku/Vereino/pull/326) docs(specs): spec A is ready — owner decisions and audit gaps of #252 — documentation only (specs, SDLC, lessons)
- [#328](https://github.com/wladku/Vereino/pull/328) docs(specs): spec R is ready — owner decisions and audit gaps of #253 — documentation only (specs, SDLC, lessons)
- [#329](https://github.com/wladku/Vereino/pull/329) docs(specs): spec C is ready — owner decisions and audit gaps of #254 — documentation only (specs, SDLC, lessons)
- [#331](https://github.com/wladku/Vereino/pull/331) test(facilities): E08-S06 lets the bans page settle before opening a row menu — test-only change — no user-visible change
- [#332](https://github.com/wladku/Vereino/pull/332) docs(ux-concept): the README describes the navigation of D-029, D-030 and D-031 (#265) — documentation only (specs, SDLC, lessons)
- [#347](https://github.com/wladku/Vereino/pull/347) test: UI texts use the key of the component on the page, not a key with the same text — test-only change — no user-visible change
- [#369](https://github.com/wladku/Vereino/pull/369) test(activities): TEST-A12 waits for the colour-scheme fade before its dark scan (#368) — test-only change — no user-visible change
- [#372](https://github.com/wladku/Vereino/pull/372) docs(specs): move several children from a roster to another group (REQ-L15) — documentation only (specs, SDLC, lessons)
- [#373](https://github.com/wladku/Vereino/pull/373) docs(specs): a club event with parts, like the Gwiazda Cup tournament (D-032) — documentation only (specs, SDLC, lessons)
- [#390](https://github.com/wladku/Vereino/pull/390) test(people): TEST-L03 declares on a session after today, not on today's — test-only change — no user-visible change
- [#395](https://github.com/wladku/Vereino/pull/395) ci: di-commands:check keeps every command file out of what a module's di.ts loads — CI and pipeline only — no user-visible change
- [#399](https://github.com/wladku/Vereino/pull/399) ci: run the integration suite on six shards instead of three — CI and pipeline only — no user-visible change
- [#400](https://github.com/wladku/Vereino/pull/400) docs(spec): merge throughput and a batch merge train — documentation only (specs, SDLC, lessons)
- [#402](https://github.com/wladku/Vereino/pull/402) ci: no integration failure outside the PR: date-safe days and a failure ledger — CI and pipeline only — no user-visible change
- [#408](https://github.com/wladku/Vereino/pull/408) fix(ci): browser-smoke signs in only after the login form hydrates (#407) — CI and pipeline only — no user-visible change
- [#409](https://github.com/wladku/Vereino/pull/409) refactor(facilities): reschedule notices batch the coordinator and rental reads; TEST-R18 covers a moved window (#394) — refactor (batched reads for reschedule notices) plus an integration test; no user-visible change, covered by the reschedule notices scenario
- [#417](https://github.com/wladku/Vereino/pull/417) fix(payments): schedules follow a time zone change, empty sweeps leave no audit entry, migration lookup survives a rebuild (#405) — skip-qa: scheduler internals (time-zone re-registration, quieter sweep audit, migration lookup); no UI change, unit-tested
- [#418](https://github.com/wladku/Vereino/pull/418) docs(spec): owner approves spec L phases L11–L12 and spec T (Ready) — documentation only (specs, SDLC, lessons)
- [#419](https://github.com/wladku/Vereino/pull/419) fix(payments): an overdue reminder counts only the charges due one, so each keeps its own cadence (#404) — skip-qa: overdue reminder counter per charge; needs days of scheduled runs, covered by unit tests
- [#422](https://github.com/wladku/Vereino/pull/422) docs(lessons): browser tests run locally on the cezar host under sg docker — documentation only (specs, SDLC, lessons)
- [#423](https://github.com/wladku/Vereino/pull/423) docs(agents): phase PRs stop listing their phase on the spec Status line — documentation only (specs, SDLC, lessons)
- [#434](https://github.com/wladku/Vereino/pull/434) test(groups): quarantine TEST-L22, its dialog axe scan fails intermittently in CI (#433) — test-only change — no user-visible change

## Unresolved items

Labels or routes the research could not find in the catalogs or the code; follow the scenario without them and report what the screen shows.

- S03: exact keys of the place form public-calendar hint (club_core.places.public.address.noClubSlug) and foundation.errors.scope_unlinked not re-read
- S04: Facilities rental form labels (save rental, cancel rental) not resolved — outside this group's catalog
- S06: Brief says administrators work on desktop; this is a member-area page whose story requires 375 px
- S07: Exact label of the 'primary payer' control on the guardianship tab (people module) not checked
- S10: Label of the undo control on the removal toast (platform toast, not in the groups catalog)
- S11: Label of the start/end time fields in the part dialog not located in the catalog
- S16: people.account.sentAgain says the link is valid for 60 minutes, while the story says 48 hours — confirm the intended validity
- S20: dashboard widget names 1, 2 and 8 not mapped to labels
- S21: exact menu entry for the contracts list (page title is „Instytucje i umowy”)
- S22: partial-success message 'Section created; the coordinator was not assigned' key not looked up
- S23: undo control and stale-version conflict dialog are platform UI; labels not in Vereino catalogs
- S25: E-mail delivery must be checked in the mail sink of the test environment; its location is not in the catalogs
- S31: Waiting for the scheduled job is impractical manually; the generation and reminder runs may need an operator trigger
- S35: material rename button label not located
- S38: requests widget title „Requests awaiting approval” has no Polish catalog key; dashboard Customize button is platform UI
- S41: Undo control label comes from the platform operations UI, not a Vereino catalog
- S43: Dashboard widget titles (Bank statements and cash, Order campaigns, Overdue, Charges without a payer) are English metadata with no pl.json key
- S43: Accept cash button key in the bank widget not confirmed
- S47: Access-denied page text not resolved (platform)
- S53: Label of the group selector and gathering-time field on the coach event form not confirmed in the catalog
- S54: The 90-minute unassigned warning job runs on a schedule; how a tester triggers it is not in the UI
- S57: the 'Dzień dobry, {name}' greeting key shell.memberShell.greeting not found; people.club.today.title has the same text
- S58: Label of the coach payments tile on Today (title key) not checked; 403 state text not resolved
- S64: Exact refusal text shown on /club/club-events/new for a guardian not confirmed (page requireFeatures guard vs. „denied” notice)
- S70: Polish role name „Animator obiektu” comes from people.roles.role.facility_operator
- S71: no Polish role label for the maintainer (vereino_maintenance_planner is granted from place maintainers)
- S71: redacted „zajęte przez klub” label key not found
- S75: section-not-found link label (p.screenSectionPage.clubPage) not located in catalogs

## Appendix: Full PR Inventory

One line per PR in the window, grouped by merge date (newest first).

### 2026-11-20

- [#441](https://github.com/wladku/Vereino/pull/441) feat(activities): club events on the phone — options error state, full Past list, lighter form imports (#440) — base `main` · QA: needs-qa · Issue refs: [#440](https://github.com/wladku/Vereino/issues/440) · Scenarios: S51, S52
- [#439](https://github.com/wladku/Vereino/pull/439) feat(club_core,activities): public tournament page and one P-06 card per club event (E14-S06, #381) — base `main` · QA: needs-qa · Issue refs: [#381](https://github.com/wladku/Vereino/issues/381) · Scenarios: S73
- [#438](https://github.com/wladku/Vereino/pull/438) feat(activities): club events on the phone — list, forms, event page with parts and files (E14-S05, #380) — base `main` · QA: needs-qa · Issue refs: [#380](https://github.com/wladku/Vereino/issues/380) · Scenarios: S51, S52, S64
- [#437](https://github.com/wladku/Vereino/pull/437) feat(people,facilities): an administrator anonymises a former person on a recorded request, with a retention hold, and deletes a person created by mistake (E13-S06, #308) — base `main` · QA: needs-qa · Issue refs: [#308](https://github.com/wladku/Vereino/issues/308) · Scenarios: S08
- [#436](https://github.com/wladku/Vereino/pull/436) feat(activities): club event poster and funder logos — Files tab, undoable uploads (E14-S04, #379) — base `main` · QA: needs-qa · Issue refs: [#379](https://github.com/wladku/Vereino/issues/379) · Scenarios: S41
- [#434](https://github.com/wladku/Vereino/pull/434) test(groups): quarantine TEST-L22, its dialog axe scan fails intermittently in CI (#433) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#432](https://github.com/wladku/Vereino/pull/432) feat(payments): the treasurer works with a finance-only role, menu and dashboard (E07-S11b, #245) — base `main` · QA: needs-qa · Issue refs: [#245](https://github.com/wladku/Vereino/issues/245) · Scenarios: S47
- [#431](https://github.com/wladku/Vereino/pull/431) feat(people,activities,payments,club_core,facilities): a leaving coach's sessions are handed over or freed, contracts end, cash held blocks (E13-S05, #307) — base `main` · QA: needs-qa · Issue refs: [#307](https://github.com/wladku/Vereino/issues/307) · Scenarios: S02
- [#430](https://github.com/wladku/Vereino/pull/430) feat(activities): club events in the panel — list, form with Add place, record with parts by day (E14-S03, #378) — base `main` · QA: needs-qa · Issue refs: [#378](https://github.com/wladku/Vereino/issues/378) · Scenarios: S09, S11
- [#429](https://github.com/wladku/Vereino/pull/429) feat(groups): move several children from a roster to another group in one previewed, undoable step (E13-S11, #383) — base `main` · QA: needs-qa · Issue refs: [#383](https://github.com/wladku/Vereino/issues/383) · Scenarios: S26
- [#422](https://github.com/wladku/Vereino/pull/422) docs(lessons): browser tests run locally on the cezar host under sg docker — base `main` · QA: none · Issue refs: none · Scenarios: no manual check
- [#419](https://github.com/wladku/Vereino/pull/419) fix(payments): an overdue reminder counts only the charges due one, so each keeps its own cadence (#404) — base `main` · QA: skip-qa · Issue refs: [#404](https://github.com/wladku/Vereino/issues/404) · Scenarios: no manual check

### 2026-11-19

- [#428](https://github.com/wladku/Vereino/pull/428) feat(activities): a part's card and session page name its club event; the coach runs it without Edit and Cancel (E14-S07, #382) — base `main` · QA: needs-qa · Issue refs: [#382](https://github.com/wladku/Vereino/issues/382) · Scenarios: S56, S68
- [#427](https://github.com/wladku/Vereino/pull/427) refactor(facilities): the charge follows a moved rental, another place re-quotes, occupancy reads on the caller's em (#221) — base `main` · QA: needs-qa · Issue refs: [#221](https://github.com/wladku/Vereino/issues/221) · Scenarios: S13
- [#426](https://github.com/wladku/Vereino/pull/426) feat(activities): club events and their parts through the API; part sessions only for the event's managers (E14-S01, #376) — base `main` · QA: skip-qa · Issue refs: [#376](https://github.com/wladku/Vereino/issues/376) · Scenarios: S09, S11, S51, S56, S64
- [#425](https://github.com/wladku/Vereino/pull/425) feat(club_core): a section coordinator adds a missing external place from the event form (E14-S02, #377) — base `main` · QA: needs-qa · Issue refs: [#377](https://github.com/wladku/Vereino/issues/377) · Scenarios: S11, S51, S64
- [#424](https://github.com/wladku/Vereino/pull/424) feat(groups): age categories carry their PZPN birth years and a team's age range follows its category (E13-S12, #384) — base `main` · QA: needs-qa · Issue refs: [#384](https://github.com/wladku/Vereino/issues/384) · Scenarios: S39
- [#423](https://github.com/wladku/Vereino/pull/423) docs(agents): phase PRs stop listing their phase on the spec Status line — base `main` · QA: none · Issue refs: none · Scenarios: no manual check
- [#421](https://github.com/wladku/Vereino/pull/421) feat(payments): B-33 cash to settle — who holds the club's cash and a numbered handover (E07-S11, #118) — base `main` · QA: needs-qa · Issue refs: [#118](https://github.com/wladku/Vereino/issues/118) · Scenarios: S30, S47
- [#420](https://github.com/wladku/Vereino/pull/420) feat(payments): an administrator undoes a charge generation, automatic runs included (#403) — base `main` · QA: needs-qa · Issue refs: [#403](https://github.com/wladku/Vereino/issues/403) · Scenarios: S32
- [#418](https://github.com/wladku/Vereino/pull/418) docs(spec): owner approves spec L phases L11–L12 and spec T (Ready) — base `main` · QA: none · Issue refs: none · Scenarios: no manual check
- [#417](https://github.com/wladku/Vereino/pull/417) fix(payments): schedules follow a time zone change, empty sweeps leave no audit entry, migration lookup survives a rebuild (#405) — base `main` · QA: skip-qa · Issue refs: [#405](https://github.com/wladku/Vereino/issues/405) · Scenarios: no manual check
- [#416](https://github.com/wladku/Vereino/pull/416) feat(facilities): the dashboard widget "Today at the facility" lists today's entries in the reader's scope (E11-S16, #290) — base `main` · QA: needs-qa · Issue refs: [#290](https://github.com/wladku/Vereino/issues/290) · Scenarios: S38
- [#415](https://github.com/wladku/Vereino/pull/415) feat(people,groups,payments): a new coach is set up from one checklist, a moved child pays one fee for the month, a person photo and a contract PDF are stored (E13-S10, #312) — base `main` · QA: needs-qa · Issue refs: [#312](https://github.com/wladku/Vereino/issues/312) · Scenarios: S01, S40
- [#414](https://github.com/wladku/Vereino/pull/414) feat(people): on the 18th birthday guardianships end, consents and new charges move to the adult; 18th-birthday and account-age notices (E13-S08, #310) — base `main` · QA: needs-qa · Issue refs: [#310](https://github.com/wladku/Vereino/issues/310) · Scenarios: S27, S67
- [#413](https://github.com/wladku/Vereino/pull/413) feat(vereino): greeting, role dashboards, menu counts and the member-interface link (E09-S06, #260) — base `main` · QA: needs-qa · Issue refs: [#260](https://github.com/wladku/Vereino/issues/260) · Scenarios: S20
- [#412](https://github.com/wladku/Vereino/pull/412) feat(people): an adult participant gives and withdraws own consents on the phone, the club edits the consent texts (E13-S07, #309) — base `main` · QA: needs-qa · Issue refs: [#309](https://github.com/wladku/Vereino/issues/309) · Scenarios: S34, S69
- [#411](https://github.com/wladku/Vereino/pull/411) feat(payments): an administrator sees bank statements and cash, order campaigns and charges without a payer on the dashboard (E12-S07, #297) — base `main` · QA: needs-qa · Issue refs: [#297](https://github.com/wladku/Vereino/issues/297) · Scenarios: S43
- [#409](https://github.com/wladku/Vereino/pull/409) refactor(facilities): reschedule notices batch the coordinator and rental reads; TEST-R18 covers a moved window (#394) — base `main` · QA: skip-qa · Issue refs: [#394](https://github.com/wladku/Vereino/issues/394) · Scenarios: no manual check
- [#408](https://github.com/wladku/Vereino/pull/408) fix(ci): browser-smoke signs in only after the login form hydrates (#407) — base `main` · QA: skip-qa · Issue refs: [#407](https://github.com/wladku/Vereino/issues/407) · Scenarios: no manual check
- [#406](https://github.com/wladku/Vereino/pull/406) feat(groups): an administrator, or a coordinator for their sections, moves groups, recurring activities and fees to a new season in one previewed step (E13-S09, #311) — base `main` · QA: needs-qa · Issue refs: [#311](https://github.com/wladku/Vereino/issues/311) · Scenarios: S14
- [#402](https://github.com/wladku/Vereino/pull/402) ci: no integration failure outside the PR: date-safe days and a failure ledger — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#401](https://github.com/wladku/Vereino/pull/401) feat(payments): the administrator sees the online payment connection and chooses the offered methods (E12-S12, #302) — base `main` · QA: needs-qa · Issue refs: [#302](https://github.com/wladku/Vereino/issues/302) · Scenarios: S45
- [#400](https://github.com/wladku/Vereino/pull/400) docs(spec): merge throughput and a batch merge train — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#398](https://github.com/wladku/Vereino/pull/398) feat(payments): charges generated, overdue payers reminded, checkouts reconciled and campaigns closed on a schedule (E12-S11, #301) — base `main` · QA: needs-qa · Issue refs: [#301](https://github.com/wladku/Vereino/issues/301) · Scenarios: S31
- [#397](https://github.com/wladku/Vereino/pull/397) feat(payments): an administrator runs a kit campaign from its record — who ordered, payments, cash and handover in the row (E12-S03, #293) — base `main` · QA: needs-qa · Issue refs: [#293](https://github.com/wladku/Vereino/issues/293) · Scenarios: S29
- [#396](https://github.com/wladku/Vereino/pull/396) fix(groups): roster correction follow-ups — scope oracles, one usage query, dialog a11y (#359) — base `main` · QA: needs-qa · Issue refs: [#359](https://github.com/wladku/Vereino/issues/359) · Scenarios: S10
- [#393](https://github.com/wladku/Vereino/pull/393) feat(payments): a guardian follows a kit order on the phone — stage, deadlines, pickup and who handed it over (E12-S09, #299) — base `main` · QA: needs-qa · Issue refs: [#299](https://github.com/wladku/Vereino/issues/299) · Scenarios: S65, S66
- [#392](https://github.com/wladku/Vereino/pull/392) fix(facilities): the slot dialog preselects the first kind as a coach's groups load (#366) — base `main` · QA: needs-qa · Issue refs: [#366](https://github.com/wladku/Vereino/issues/366) · Scenarios: S55
- [#391](https://github.com/wladku/Vereino/pull/391) feat(payments): an administrator refunds an online payment from B-22 and finds every overpayment under "To refund" (E12-S06, #296) — base `main` · QA: needs-qa · Issue refs: [#296](https://github.com/wladku/Vereino/issues/296) · Scenarios: S28
- [#387](https://github.com/wladku/Vereino/pull/387) feat(facilities): staff and renters are told when a closure or maintenance window flags their entries (E11-S13, #287) — base `main` · QA: needs-qa · Issue refs: [#287](https://github.com/wladku/Vereino/issues/287) · Scenarios: S42

### 2026-11-18

- [#399](https://github.com/wladku/Vereino/pull/399) ci: run the integration suite on six shards instead of three — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#395](https://github.com/wladku/Vereino/pull/395) ci: di-commands:check keeps every command file out of what a module's di.ts loads — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#390](https://github.com/wladku/Vereino/pull/390) test(people): TEST-L03 declares on a session after today, not on today's — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#389](https://github.com/wladku/Vereino/pull/389) feat(payments): B-29 decides each transfer with a row button and deletes an import from which nothing was booked (E12-S04, #294) — base `main` · QA: needs-qa · Issue refs: [#294](https://github.com/wladku/Vereino/issues/294) · Scenarios: S24
- [#388](https://github.com/wladku/Vereino/pull/388) feat(facilities): the public places, calendar and request confirmation follow the mockup inside the club's frame (E11-S15, #289) — base `main` · QA: needs-qa · Issue refs: [#289](https://github.com/wladku/Vereino/issues/289) · Scenarios: S74
- [#386](https://github.com/wladku/Vereino/pull/386) feat(facilities): the renter gets e-mails about their rental and cancels it through a link (E11-S12, #286) — base `main` · QA: needs-qa · Issue refs: [#286](https://github.com/wladku/Vereino/issues/286) · Scenarios: S72
- [#385](https://github.com/wladku/Vereino/pull/385) feat(facilities): a rental's charge is payable to the place owner and the rental is confirmed by its payment (E11-S11, #285) — base `main` · QA: needs-qa · Issue refs: [#285](https://github.com/wladku/Vereino/issues/285) · Scenarios: S46
- [#374](https://github.com/wladku/Vereino/pull/374) feat(groups): a section coordinator edits rosters, marks a case and deletes a message from the phone (E10-S09, #274) — base `main` · QA: needs-qa · Issue refs: [#267](https://github.com/wladku/Vereino/issues/267), [#274](https://github.com/wladku/Vereino/issues/274) · Scenarios: S49, S50
- [#373](https://github.com/wladku/Vereino/pull/373) docs(specs): a club event with parts, like the Gwiazda Cup tournament (D-032) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#372](https://github.com/wladku/Vereino/pull/372) docs(specs): move several children from a roster to another group (REQ-L15) — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#371](https://github.com/wladku/Vereino/pull/371) feat(people): an administrator enters role dates, a guardianship start, an external id and a material title, and an author edits their own message (E13-S02, #304) — base `main` · QA: needs-qa · Issue refs: [#304](https://github.com/wladku/Vereino/issues/304) · Scenarios: S35, S59
- [#370](https://github.com/wladku/Vereino/pull/370) feat(payments): M-15 names the receiver and lists receipts by charge; M-18 keeps the group in the URL, states the coach mode and shows the handover time (E12-S10, #300) — base `main` · QA: needs-qa · Issue refs: [#300](https://github.com/wladku/Vereino/issues/300) · Scenarios: S06, S58
- [#369](https://github.com/wladku/Vereino/pull/369) test(activities): TEST-A12 waits for the colour-scheme fade before its dark scan (#368) — base `main` · QA: skip-qa · Issue refs: [#368](https://github.com/wladku/Vereino/issues/368) · Scenarios: no manual check
- [#367](https://github.com/wladku/Vereino/pull/367) feat(activities): a section coordinator assigns a substitute, moves and cancels sessions from the phone (E10-S08, #273) — base `main` · QA: needs-qa · Issue refs: [#268](https://github.com/wladku/Vereino/issues/268), [#271](https://github.com/wladku/Vereino/issues/271), [#272](https://github.com/wladku/Vereino/issues/272), [#273](https://github.com/wladku/Vereino/issues/273) · Scenarios: S48
- [#365](https://github.com/wladku/Vereino/pull/365) feat(people): a member or guardian asks to leave from the phone, and the administrator ends the family's part in the club in one dated, previewed step (E13-S04, #306) — base `main` · QA: needs-qa · Issue refs: [#306](https://github.com/wladku/Vereino/issues/306) · Scenarios: S18, S63
- [#364](https://github.com/wladku/Vereino/pull/364) fix(i18n): three setup hints name the real place to go (#358) — base `main` · QA: skip-qa · Issue refs: [#358](https://github.com/wladku/Vereino/issues/358) · Scenarios: S03
- [#363](https://github.com/wladku/Vereino/pull/363) feat(activities): a one-off group event on a club place is refused outside the place's opening hours (E11-S14, #288) — base `main` · QA: needs-qa · Issue refs: [#288](https://github.com/wladku/Vereino/issues/288) · Scenarios: S55
- [#362](https://github.com/wladku/Vereino/pull/362) feat(facilities): a person who maintains a place sees, plans and completes their tasks on the phone (E11-S09, #283) — base `main` · QA: needs-qa · Issue refs: [#283](https://github.com/wladku/Vereino/issues/283) · Scenarios: S71
- [#361](https://github.com/wladku/Vereino/pull/361) feat(activities): a coach fills attendance in one tap, takes over an unstaffed session and records a match score on the phone (E10-S07, #272) — base `main` · QA: needs-qa · Issue refs: [#272](https://github.com/wladku/Vereino/issues/272) · Scenarios: S54
- [#360](https://github.com/wladku/Vereino/pull/360) feat(facilities): an administrator works the B-26 and B-27 tabs and adds past records from the panel (E11-S07, #281) — base `main` · QA: needs-qa · Issue refs: [#281](https://github.com/wladku/Vereino/issues/281) · Scenarios: S19, S37

### 2026-11-17

- [#357](https://github.com/wladku/Vereino/pull/357) fix(people): the unlinked-account sign-in lands on a notice that cannot be lost (#352) — base `main` · QA: needs-qa · Issue refs: [#352](https://github.com/wladku/Vereino/issues/352) · Scenarios: S57
- [#356](https://github.com/wladku/Vereino/pull/356) feat(activities): families are told in the thread, in the app and by e-mail whenever a session moves (E10-S06, #271) — base `main` · QA: needs-qa · Issue refs: [#271](https://github.com/wladku/Vereino/issues/271) · Scenarios: S25, S48
- [#355](https://github.com/wladku/Vereino/pull/355) feat(groups): a coordinator corrects a roster mistake: edits, ends on a chosen day or removes a membership (E10-S02, #267) — base `main` · QA: needs-qa · Issue refs: [#267](https://github.com/wladku/Vereino/issues/267) · Scenarios: S10, S49
- [#354](https://github.com/wladku/Vereino/pull/354) feat(facilities): the facility attendant takes and manages rentals and asks for an entry ban on the phone (E11-S08, #282) — base `main` · QA: needs-qa · Issue refs: [#282](https://github.com/wladku/Vereino/issues/282) · Scenarios: S70
- [#353](https://github.com/wladku/Vereino/pull/353) feat(activities): a coach creates a sparring or an away match on the phone with a typed venue, and edits the own event (E10-S05, #270) — base `main` · QA: needs-qa · Issue refs: [#270](https://github.com/wladku/Vereino/issues/270) · Scenarios: S53
- [#351](https://github.com/wladku/Vereino/pull/351) feat(facilities): an administrator decides a booking request from a card with every fact (E11-S06, #280) — base `main` · QA: needs-qa · Issue refs: [#280](https://github.com/wladku/Vereino/issues/280) · Scenarios: S33
- [#350](https://github.com/wladku/Vereino/pull/350) feat(activities): a guardian confirms by the declaration deadline and the coach sees who has not answered (E10-S04, #269) — base `main` · QA: needs-qa · Issue refs: [#269](https://github.com/wladku/Vereino/issues/269) · Scenarios: S54, S61
- [#349](https://github.com/wladku/Vereino/pull/349) feat(groups): groups list and record as in the mockup, a team with matches cannot become a class group (E10-S01, #266) — base `main` · QA: needs-qa · Issue refs: [#266](https://github.com/wladku/Vereino/issues/266) · Scenarios: S36
- [#348](https://github.com/wladku/Vereino/pull/348) feat(facilities): one tap on a free hour of M-11 opens the slot dialog (E11-S04, #278) — base `main` · QA: needs-qa · Issue refs: [#278](https://github.com/wladku/Vereino/issues/278) · Scenarios: S55
- [#347](https://github.com/wladku/Vereino/pull/347) test: UI texts use the key of the component on the page, not a key with the same text — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#346](https://github.com/wladku/Vereino/pull/346) feat(people): a new club is set up in the panel, and every empty picker says what is missing (E13-S03, #305) — base `main` · QA: needs-qa · Issue refs: [#305](https://github.com/wladku/Vereino/issues/305) · Scenarios: S03
- [#345](https://github.com/wladku/Vereino/pull/345) feat(payments): M-08 pays everything in two taps, partly paid charges too, and names who pays a ward (E12-S08, #298) — base `main` · QA: needs-qa · Issue refs: [#298](https://github.com/wladku/Vereino/issues/298) · Scenarios: S60
- [#344](https://github.com/wladku/Vereino/pull/344) feat(payments): manual charge, assigning a payer and the person's Charges tab (E12-S05, #295) — base `main` · QA: needs-qa · Issue refs: [#295](https://github.com/wladku/Vereino/issues/295) · Scenarios: S07
- [#343](https://github.com/wladku/Vereino/pull/343) feat(facilities): payment days and automatic expiry from the management agreement (E11-S10, #284) — base `main` · QA: needs-qa · Issue refs: [#284](https://github.com/wladku/Vereino/issues/284) · Scenarios: S21
- [#342](https://github.com/wladku/Vereino/pull/342) feat(facilities): one slot dialog for rentals, group events and club bookings (E11-S03, #277) — base `main` · QA: needs-qa · Issue refs: [#277](https://github.com/wladku/Vereino/issues/277) · Scenarios: S19
- [#341](https://github.com/wladku/Vereino/pull/341) feat(facilities): open a rental from B-24 and correct its contact, purpose, notes and renter (E11-S05, #279) — base `main` · QA: needs-qa · Issue refs: [#279](https://github.com/wladku/Vereino/issues/279) · Scenarios: S23
- [#340](https://github.com/wladku/Vereino/pull/340) feat(activities): plan a series without collisions and work one activity's sessions (#268) — base `main` · QA: needs-qa · Issue refs: [#268](https://github.com/wladku/Vereino/issues/268) · Scenarios: S15

### 2026-11-16

- [#339](https://github.com/wladku/Vereino/pull/339) feat(people): account state, invitation again, login e-mail and block (E13-S01, #303) — base `main` · QA: needs-qa · Issue refs: [#303](https://github.com/wladku/Vereino/issues/303) · Scenarios: S16
- [#338](https://github.com/wladku/Vereino/pull/338) feat(payments): accept cash from B-21, B-22 and B-29; B-21 keeps its URL state (#292) — base `main` · QA: needs-qa · Issue refs: [#292](https://github.com/wladku/Vereino/issues/292) · Scenarios: S04, S05, S24
- [#337](https://github.com/wladku/Vereino/pull/337) feat(facilities): the facility calendar shows one place's day on the hour axis (E11-S02, #276) — base `main` · QA: needs-qa · Issue refs: [#276](https://github.com/wladku/Vereino/issues/276) · Scenarios: S17
- [#336](https://github.com/wladku/Vereino/pull/336) feat(payments): rental charge service payable to the facility owner (#291) — base `main` · QA: needs-qa · Issue refs: [#291](https://github.com/wladku/Vereino/issues/291) · Scenarios: S04
- [#335](https://github.com/wladku/Vereino/pull/335) feat(facilities): place options and calendar reads inside the module's scope (E11-S01, #275) — base `main` · QA: needs-qa · Issue refs: [#275](https://github.com/wladku/Vereino/issues/275) · Scenarios: S17, S55, S70
- [#334](https://github.com/wladku/Vereino/pull/334) fix(ui): backend pages start at the scope of their cookies, so admin lists load once — base `main` · QA: needs-qa · Issue refs: none · Scenarios: S12
- [#333](https://github.com/wladku/Vereino/pull/333) feat: member and public pages load with a skeleton, and empty lists name the next action (#264) — base `main` · QA: needs-qa · Issue refs: [#264](https://github.com/wladku/Vereino/issues/264) · Scenarios: S62
- [#332](https://github.com/wladku/Vereino/pull/332) docs(ux-concept): the README describes the navigation of D-029, D-030 and D-031 (#265) — base `main` · QA: skip-qa · Issue refs: [#265](https://github.com/wladku/Vereino/issues/265) · Scenarios: no manual check
- [#331](https://github.com/wladku/Vereino/pull/331) test(facilities): E08-S06 lets the bans page settle before opening a row menu — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#329](https://github.com/wladku/Vereino/pull/329) docs(specs): spec C is ready — owner decisions and audit gaps of #254 — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#328](https://github.com/wladku/Vereino/pull/328) docs(specs): spec R is ready — owner decisions and audit gaps of #253 — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#327](https://github.com/wladku/Vereino/pull/327) feat(club_core): the club's menu on every public page and the club on the sign-in page (E09-S07, #261) — base `main` · QA: needs-qa · Issue refs: [#261](https://github.com/wladku/Vereino/issues/261) · Scenarios: S75
- [#326](https://github.com/wladku/Vereino/pull/326) docs(specs): spec A is ready — owner decisions and audit gaps of #252 — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#325](https://github.com/wladku/Vereino/pull/325) feat(people): staff context for coach-only members and a landing page per role (#259) — base `main` · QA: needs-qa · Issue refs: [#259](https://github.com/wladku/Vereino/issues/259) · Scenarios: S57
- [#324](https://github.com/wladku/Vereino/pull/324) feat: public Events page P-06, Today messages tile and primary payer badge (#263) — base `main` · QA: needs-qa · Issue refs: [#263](https://github.com/wladku/Vereino/issues/263) · Scenarios: S62, S75
- [#323](https://github.com/wladku/Vereino/pull/323) feat: the mockup's remaining panel functions on publication, sections, contracts and people (#262) — base `main` · QA: needs-qa · Issue refs: [#262](https://github.com/wladku/Vereino/issues/262) · Scenarios: S22
- [#322](https://github.com/wladku/Vereino/pull/322) docs(sdlc): Cezar builds at most two issues at a time — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#321](https://github.com/wladku/Vereino/pull/321) test: integration tests read UI texts from the catalogs, and qa-texts:check keeps it so — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check

### 2026-11-15

- [#320](https://github.com/wladku/Vereino/pull/320) feat(club): the same member bottom bar on every page, every member page in More (#258) — base `main` · QA: needs-qa · Issue refs: [#258](https://github.com/wladku/Vereino/issues/258) · Scenarios: S62
- [#319](https://github.com/wladku/Vereino/pull/319) feat: every text uses the mockup's glossary, and glossary:check keeps retired terms out (#257) — base `main` · QA: needs-qa · Issue refs: [#257](https://github.com/wladku/Vereino/issues/257) · Scenarios: S12
- [#318](https://github.com/wladku/Vereino/pull/318) feat: five admin pages with tabs — Institutions and contracts, Threads and cases, Zones and rates, Log and incidents, Municipality report (#256) — base `main` · QA: needs-qa · Issue refs: [#256](https://github.com/wladku/Vereino/issues/256) · Scenarios: S12
- [#317](https://github.com/wladku/Vereino/pull/317) docs(specs): spec N is ready — owner decisions and audit gaps of #251 — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#316](https://github.com/wladku/Vereino/pull/316) test(people): wait for the dashboard to settle before E06-S06 lifts the widget failure — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#315](https://github.com/wladku/Vereino/pull/315) fix(facilities): rental dialogs and labels read wall times in the club zone (#221) — base `main` · QA: needs-qa · Issue refs: none · Scenarios: S13, S19
- [#314](https://github.com/wladku/Vereino/pull/314) fix(activities): the coordinator calendar's hours stay keyboard-reachable in a week without sessions (#248) — base `main` · QA: needs-qa · Issue refs: [#248](https://github.com/wladku/Vereino/issues/248) · Scenarios: S15
- [#313](https://github.com/wladku/Vereino/pull/313) fix(club_core): the Club group is back in the admin sidebar (#246) — base `main` · QA: needs-qa · Issue refs: [#246](https://github.com/wladku/Vereino/issues/246) · Scenarios: S12
- [#250](https://github.com/wladku/Vereino/pull/250) docs(specs): the public Events menu (P-06) in the mockup and the parity specs — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check
- [#249](https://github.com/wladku/Vereino/pull/249) docs(specs): five draft specifications that close the mockup parity audit, and D-031 — base `main` · QA: skip-qa · Issue refs: none · Scenarios: no manual check

### 2026-11-14

- [#247](https://github.com/wladku/Vereino/pull/247) fix(ui): pages take "today" from the club zone, not the browser clock (#231) — base `main` · QA: needs-qa · Issue refs: [#231](https://github.com/wladku/Vereino/issues/231) · Scenarios: S44
