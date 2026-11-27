# Polish wording review — menu, page titles, tabs, statuses and buttons (2026-11)

Issue: #603 (AC-N11 of `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md`, phase 3 exit gate). Owner decision of 2026-11-24 on #603: the owner reviews the Polish wording on this pull request; a follow-up applies the marked changes and ticks AC-N11 with this PR's link.

## How to review

- Read the **Polish (now)** column. Leave **Change to** empty when the text is right; write the new Polish text when it is not (a short note such as "rule 2" or "as in the mockup" is welcome).
- The **English (source)** column is the English catalog value of the same key, for meaning only; it is not under review.
- **Where** names the page route (backend pages under `/backend`, member pages under `/club`, public pages under `/p`) when a page declares the key; empty means the key is used inside a page.
- When done, fill in **Result** at the end (accepted, or "changes in the table") — that line is the record AC-N11 asks for.
- Editing tip: suggest changes as GitHub review comments on the rows, or commit the filled-in column to this branch — both count.

## Glossary rules under review (spec, *Glossary (D-031 §2)*)

1. The series is "aktywność"; one meeting is "termin". "Zajęcia" stays in three uses only: the activity type `classes`, "grupa zajęciowa", and the mockup's everyday phrases on Today and in the calendar legend.
2. "Trener" is the role, the contract kind and the member context. "Prowadzący" is the person who runs a given activity or session. "Instruktor" labels that person for a class group. English stays "coach".
3. "Miejsce" is a record in the club's register of places and every field or picker that points at one. "Obiekt" is the facility as the facilities module shows it. English: "place" and "facility".
4. "Zgłoszenie" is an outside booking request; "rezerwacja" is a club booking; "wynajem" is the paid rental. The noun "zgłoszenie" is not used for anything else.
5. The menu label and the page title may differ where the mockup differs (short in the menu, full on the page).

Rules 1–2 are accepted or corrected through the wording below; rules 3–5 are reviewed as wording. The retired-term list is already enforced by `glossary:check` in `yarn verify` (TEST-N10; #319, #513), so the review looks for what a pattern cannot judge: natural Polish, consistency, and agreement with the mockup.

## Scope and how the list was built

- Catalogs: `packages/app/src/modules/<id>/i18n/pl.json` and `en.json` of the eight Vereino modules (`packages/app/vereino-modules.json`) at commit `5683e44c` (main, 2026-11-24). The app catalog `packages/app/src/i18n/pl.json` holds Open Mercato's own platform strings and is out of scope.
- **Menu**: the `pageTitleKey` of every admin page that appears in the sidebar, the sidebar groups (`pageGroupKey`), and every key under a `nav` segment (tab strips, badges, member and public shells).
- **Page titles**: the `pageTitleKey`/`titleKey` of the other pages, the last breadcrumb label of admin pages (the heading when the menu label is short, rule 5), and the `<area>.title` keys.
- **Tabs**: keys under a `tab`/`tabs` segment or ending in `Tab`. **Statuses**: keys under `status`/`state` (column and filter labels left out). **Buttons**: keys under `action(s)`/`button(s)`/`cta`, ending in `Button`/`Action`/`Cta`, or ending in a verb such as `save`, `cancel`, `delete`, `submit` (audit, error and notification texts left out).
- The member and public shell labels are copied into several modules with the same text; they are listed once in *Member and public shell* with every key that holds the copy, and a change there applies to all of them.
- The list is keyed by the catalog key, so the follow-up applies a change to exactly that key. Strings outside these five kinds (field labels, help texts, messages, e-mails apart from their buttons) are not in the sheet.

## Size

| Section | Rows |
|---|---|
| Member and public shell | 31 |
| foundation | 3 |
| club_core | 78 |
| people | 91 |
| groups | 75 |
| activities | 117 |
| communication | 34 |
| payments | 125 |
| facilities | 183 |
| **Total** | **737** |

## Member and public shell

### Member area

| # | Keys (all copies) | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 1 | `people.club.nav.acceptCash`<br>`groups.club.nav.acceptCash`<br>`activities.club.nav.acceptCash`<br>`communication.club.nav.acceptCash`<br>`payments.club.nav.acceptCash`<br>`facilities.places.nav.acceptCash` | Przyjmij gotówkę | Accept cash | member menu and bottom bar | |
| 2 | `people.club.nav.allWards`<br>`groups.club.nav.allWards`<br>`activities.club.nav.allWards`<br>`communication.club.nav.allWards`<br>`payments.club.nav.allWards`<br>`facilities.places.nav.allWards` | Wszyscy | Everyone | member menu and bottom bar | |
| 3 | `people.club.nav.backend`<br>`groups.club.nav.backend`<br>`activities.club.nav.backend`<br>`communication.club.nav.backend`<br>`payments.club.nav.backend`<br>`facilities.places.nav.backend` | Panel administracyjny | Admin panel | member menu and bottom bar | |
| 4 | `people.club.nav.calendar`<br>`groups.club.nav.calendar`<br>`activities.club.nav.calendar`<br>`communication.club.nav.calendar`<br>`payments.club.nav.calendar`<br>`facilities.places.nav.calendar` | Kalendarz | Calendar | member menu and bottom bar | |
| 5 | `people.club.nav.clubEvents`<br>`groups.club.nav.clubEvents`<br>`activities.club.nav.clubEvents`<br>`communication.club.nav.clubEvents`<br>`payments.club.nav.clubEvents`<br>`facilities.places.nav.clubEvents` | Imprezy klubowe | Club events | member menu and bottom bar | |
| 6 | `people.club.nav.context`<br>`groups.club.nav.context`<br>`activities.club.nav.context`<br>`communication.club.nav.context`<br>`payments.club.nav.context`<br>`facilities.places.nav.context` | Kontekst | Context | member menu and bottom bar | |
| 7 | `people.club.nav.contextCoach`<br>`groups.club.nav.contextCoach`<br>`activities.club.nav.contextCoach`<br>`communication.club.nav.contextCoach`<br>`payments.club.nav.contextCoach`<br>`facilities.places.nav.contextCoach` | jako trener | as coach | member menu and bottom bar | |
| 8 | `people.club.nav.contextCoachCoordinator`<br>`groups.club.nav.contextCoachCoordinator`<br>`activities.club.nav.contextCoachCoordinator`<br>`communication.club.nav.contextCoachCoordinator`<br>`payments.club.nav.contextCoachCoordinator`<br>`facilities.places.nav.contextCoachCoordinator` | jako trener / koordynator | as coach / coordinator | member menu and bottom bar | |
| 9 | `people.club.nav.contextMember`<br>`groups.club.nav.contextMember`<br>`activities.club.nav.contextMember`<br>`communication.club.nav.contextMember`<br>`payments.club.nav.contextMember`<br>`facilities.places.nav.contextMember` | jako członek / opiekun | as member / guardian | member menu and bottom bar | |
| 10 | `people.club.nav.facilities`<br>`groups.club.nav.facilities`<br>`activities.club.nav.facilities`<br>`communication.club.nav.facilities`<br>`payments.club.nav.facilities`<br>`facilities.places.nav.facilities` | Obiekty | Facilities | member menu and bottom bar | |
| 11 | `people.club.nav.facilitiesMore`<br>`groups.club.nav.facilitiesMore`<br>`activities.club.nav.facilitiesMore`<br>`communication.club.nav.facilitiesMore`<br>`payments.club.nav.facilitiesMore`<br>`facilities.places.nav.facilitiesMore` | Obiekty i rezerwacje | Facilities and booking | member menu and bottom bar | |
| 12 | `people.club.nav.facilityToday`<br>`groups.club.nav.facilityToday`<br>`activities.club.nav.facilityToday`<br>`communication.club.nav.facilityToday`<br>`payments.club.nav.facilityToday`<br>`facilities.places.nav.facilityToday` | Dziś na obiekcie | Today at the facility | member menu and bottom bar | |
| 13 | `people.club.nav.groupPayments`<br>`groups.club.nav.groupPayments`<br>`activities.club.nav.groupPayments`<br>`communication.club.nav.groupPayments`<br>`payments.club.nav.groupPayments`<br>`facilities.places.nav.groupPayments` | Płatności moich grup | My groups' payments | member menu and bottom bar | |
| 14 | `people.club.nav.groups`<br>`groups.club.nav.groups`<br>`activities.club.nav.groups`<br>`communication.club.nav.groups`<br>`payments.club.nav.groups`<br>`facilities.places.nav.groups` | Grupy | Groups | member menu and bottom bar | |
| 15 | `people.club.nav.label`<br>`groups.club.nav.label`<br>`activities.club.nav.label`<br>`communication.club.nav.label`<br>`payments.club.nav.label`<br>`facilities.places.nav.label` | Strefa członka | Member area | member menu and bottom bar | |
| 16 | `people.club.nav.me`<br>`groups.club.nav.me`<br>`activities.club.nav.me`<br>`communication.club.nav.me`<br>`payments.club.nav.me`<br>`facilities.places.nav.me` | Ja | Me | member menu and bottom bar | |
| 17 | `people.club.nav.messages`<br>`groups.club.nav.messages`<br>`activities.club.nav.messages`<br>`communication.club.nav.messages`<br>`payments.club.nav.messages`<br>`facilities.places.nav.messages` | Wiadomości | Messages | member menu and bottom bar | |
| 18 | `people.club.nav.more`<br>`groups.club.nav.more`<br>`activities.club.nav.more`<br>`communication.club.nav.more`<br>`payments.club.nav.more`<br>`facilities.places.nav.more` | Więcej | More | member menu and bottom bar | |
| 19 | `people.club.nav.myUnits`<br>`groups.club.nav.myUnits`<br>`activities.club.nav.myUnits`<br>`communication.club.nav.myUnits`<br>`payments.club.nav.myUnits`<br>`facilities.places.nav.myUnits` | Moje jednostki | My units | member menu and bottom bar | |
| 20 | `people.club.nav.orders`<br>`groups.club.nav.orders`<br>`activities.club.nav.orders`<br>`communication.club.nav.orders`<br>`payments.club.nav.orders`<br>`facilities.places.nav.orders` | Zamówienia (np. stroje) | Orders (e.g. kit) | member menu and bottom bar | |
| 21 | `people.club.nav.payments`<br>`groups.club.nav.payments`<br>`activities.club.nav.payments`<br>`communication.club.nav.payments`<br>`payments.club.nav.payments`<br>`facilities.places.nav.payments` | Płatności | Payments | member menu and bottom bar | |
| 22 | `people.club.nav.profile`<br>`groups.club.nav.profile`<br>`activities.club.nav.profile`<br>`communication.club.nav.profile`<br>`payments.club.nav.profile`<br>`facilities.places.nav.profile` | Profil | Profile | member menu and bottom bar | |
| 23 | `people.club.nav.signOut`<br>`groups.club.nav.signOut`<br>`activities.club.nav.signOut`<br>`communication.club.nav.signOut`<br>`payments.club.nav.signOut`<br>`facilities.places.nav.signOut` | Wyloguj | Sign out | member menu and bottom bar | |
| 24 | `people.club.nav.today`<br>`groups.club.nav.today`<br>`activities.club.nav.today`<br>`communication.club.nav.today`<br>`payments.club.nav.today`<br>`facilities.places.nav.today` | Dziś | Today | member menu and bottom bar | |
| 25 | `people.club.nav.ward`<br>`groups.club.nav.ward`<br>`activities.club.nav.ward`<br>`communication.club.nav.ward`<br>`payments.club.nav.ward`<br>`facilities.places.nav.ward` | Pokazuję | Showing | member menu and bottom bar | |

### Public club page

| # | Keys (all copies) | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 26 | `club_core.public.nav.club`<br>`activities.publicSession.nav.club`<br>`facilities.public.nav.club` | Klub | Club | public club header | |
| 27 | `club_core.public.nav.events`<br>`activities.publicSession.nav.events`<br>`facilities.public.nav.events` | Wydarzenia | Events | public club header | |
| 28 | `club_core.public.nav.facilities`<br>`activities.publicSession.nav.facilities`<br>`facilities.public.nav.facilities` | Obiekty | Facilities | public club header | |
| 29 | `club_core.public.nav.label`<br>`activities.publicSession.nav.label`<br>`facilities.public.nav.label` | Strona klubu | Club page | public club header | |
| 30 | `club_core.public.nav.sections`<br>`activities.publicSession.nav.sections`<br>`facilities.public.nav.sections` | Sekcje | Sections | public club header | |
| 31 | `club_core.public.nav.signIn`<br>`activities.publicSession.nav.signIn`<br>`facilities.public.nav.signIn` | Zaloguj | Sign in | public club header | |

## Module `foundation`

### Buttons

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 32 | `foundation.account.clubInvitation.cta` | Ustaw hasło | Set up your password |  | |
| 33 | `foundation.account.invitation.cta` | Ustaw hasło | Set up your password |  | |
| 34 | `foundation.email.action` | Otwórz w Vereino | Open in Vereino |  | |

## Module `club_core`

### Menu

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 35 | `club_core.institutions.page.title` | Instytucje i umowy | Institutions and contracts | /backend/club/contracts, /backend/club/institutions | |
| 36 | `club_core.nav.group` | Klub | Club | menu group | |
| 37 | `club_core.nav.publication` | Publikacja | Publication | /backend/club/publication | |
| 38 | `club_core.nav.settings` | Ustawienia | Settings | /backend/club/settings | |
| 39 | `club_core.places.title` | Miejsca | Places | /backend/club/places | |
| 40 | `club_core.sections.title` | Sekcje | Sections | /backend/club/sections | |

### Page titles

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 41 | `club_core.contracts.create.title` | Nowa umowa | New contract | /backend/club/contracts/create | |
| 42 | `club_core.contracts.edit.title` | Edycja umowy | Edit contract | /backend/club/contracts/[id]/edit | |
| 43 | `club_core.contracts.title` | Umowy | Contracts |  | |
| 44 | `club_core.coordinators.title` | Koordynatorzy | Coordinators |  | |
| 45 | `club_core.externalPlace.title` | Dodaj obiekt | Add place |  | |
| 46 | `club_core.institutions.create.title` | Nowa instytucja | New institution | /backend/club/institutions/create | |
| 47 | `club_core.institutions.edit.title` | Edycja instytucji | Edit institution | /backend/club/institutions/[id]/edit | |
| 48 | `club_core.institutions.title` | Instytucje | Institutions |  | |
| 49 | `club_core.materials.title` | Materiały | Materials |  | |
| 50 | `club_core.places.create.title` | Nowe miejsce | New place | /backend/club/places/create | |
| 51 | `club_core.places.edit.title` | Edycja miejsca | Edit place | /backend/club/places/[id]/edit | |
| 52 | `club_core.privacy.title` | Polityka prywatności | Privacy policy | /p/[clubSlug]/privacy | |
| 53 | `club_core.public.clubEvent.pageTitle` | Wydarzenie | Event | /p/[clubSlug]/events/[eventSlug] | |
| 54 | `club_core.public.events.pageTitle` | Wydarzenia | Events | /p/[clubSlug]/events | |
| 55 | `club_core.public.pageTitle` | Strona klubu | Club page | /p/[clubSlug] | |
| 56 | `club_core.public.sectionPageTitle` | Strona sekcji | Section page | /p/[clubSlug]/sections/[sectionSlug] | |
| 57 | `club_core.public.title` | Strona klubu | Club page |  | |
| 58 | `club_core.publication.title` | Publikacja strony klubu | Club page publication | /backend/club/publication | |
| 59 | `club_core.sections.create.title` | Nowa sekcja | New section | /backend/club/sections/create | |
| 60 | `club_core.sections.edit.title` | Edycja sekcji | Edit section | /backend/club/sections/[id]/edit | |
| 61 | `club_core.settings.title` | Ustawienia klubu | Club settings | /backend/club/settings | |

### Tabs

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 62 | `club_core.institutions.tabs.contracts` | Umowy | Contracts |  | |
| 63 | `club_core.institutions.tabs.institutions` | Instytucje | Institutions |  | |
| 64 | `club_core.institutions.tabs.label` | Instytucje i umowy | Institutions and contracts |  | |
| 65 | `club_core.sections.tabs.coordinators` | Koordynatorzy | Coordinators |  | |
| 66 | `club_core.sections.tabs.details` | Szczegóły | Details |  | |
| 67 | `club_core.sections.tabs.label` | Strona sekcji | Section page |  | |
| 68 | `club_core.sections.tabs.public` | Strona publiczna | Public page |  | |

### Buttons

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 69 | `club_core.common.cancel` | Anuluj | Cancel |  | |
| 70 | `club_core.common.create` | Utwórz | Create |  | |
| 71 | `club_core.common.delete` | Usuń | Delete |  | |
| 72 | `club_core.common.edit` | Edytuj | Edit |  | |
| 73 | `club_core.common.save` | Zapisz | Save |  | |
| 74 | `club_core.contracts.actions.back` | Wróć do umów | Back to contracts |  | |
| 75 | `club_core.contracts.actions.create` | Dodaj umowę | Add contract |  | |
| 76 | `club_core.contracts.attachment.remove` | Usuń | Remove |  | |
| 77 | `club_core.contracts.institutionFilter.back` | Wróć do instytucji | Back to institutions |  | |
| 78 | `club_core.coordinators.actions.assign` | Przypisz koordynatora | Assign coordinator |  | |
| 79 | `club_core.coordinators.actions.end` | Zakończ | End |  | |
| 80 | `club_core.externalPlace.cancel` | Anuluj | Cancel |  | |
| 81 | `club_core.externalPlace.close` | Zamknij | Close |  | |
| 82 | `club_core.externalPlace.submit` | Dodaj obiekt | Add place |  | |
| 83 | `club_core.institutions.actions.back` | Wróć do instytucji | Back to institutions |  | |
| 84 | `club_core.institutions.actions.contracts` | Umowy | Contracts |  | |
| 85 | `club_core.institutions.actions.create` | Dodaj instytucję | Add institution |  | |
| 86 | `club_core.logo.actions.remove` | Usuń logo | Remove logo |  | |
| 87 | `club_core.materials.actions.publish` | Upublicznij | Make public |  | |
| 88 | `club_core.materials.actions.rename` | Zmień nazwę | Rename |  | |
| 89 | `club_core.materials.actions.unpublish` | Ukryj | Make internal |  | |
| 90 | `club_core.picker.dialog.cancel` | Anuluj | Cancel |  | |
| 91 | `club_core.picker.dialog.close` | Zamknij | Close |  | |
| 92 | `club_core.picker.dialog.submit` | Dodaj i wybierz | Add and select |  | |
| 93 | `club_core.picker.institution.add` | Dodaj instytucję | Add an institution |  | |
| 94 | `club_core.picker.person.add` | Dodaj osobę | Add a person |  | |
| 95 | `club_core.placeFiles.actions.remove` | Usuń | Remove |  | |
| 96 | `club_core.placeFiles.actions.removePhoto` | Usuń zdjęcie {name} | Remove photo {name} |  | |
| 97 | `club_core.places.actions.back` | Wróć do miejsc | Back to places |  | |
| 98 | `club_core.places.actions.create` | Dodaj miejsce | Add place |  | |
| 99 | `club_core.places.contacts.add` | Dodaj kontakt | Add contact |  | |
| 100 | `club_core.places.contacts.remove` | Usuń | Remove |  | |
| 101 | `club_core.public.actions.retry` | Spróbuj ponownie | Try again |  | |
| 102 | `club_core.publication.save` | Zapisz publikację | Save publication |  | |
| 103 | `club_core.sections.actions.activate` | Aktywuj | Activate |  | |
| 104 | `club_core.sections.actions.back` | Wróć do sekcji | Back to sections |  | |
| 105 | `club_core.sections.actions.create` | Dodaj sekcję | Add section |  | |
| 106 | `club_core.sections.actions.deactivate` | Dezaktywuj | Deactivate |  | |
| 107 | `club_core.sections.actions.publicPage` | Strona publiczna | Public page |  | |
| 108 | `club_core.sections.inUse.close` | Zamknij | Close |  | |
| 109 | `club_core.sections.public.save` | Zapisz stronę publiczną | Save public page |  | |
| 110 | `club_core.settings.declarationKind.confirm` | Potwierdzenie | Confirmation |  | |
| 111 | `club_core.settings.save` | Zapisz ustawienia | Save settings |  | |
| 112 | `club_core.staffSetup.contract.add` | Dodaj umowę | Add a contract |  | |

## Module `people`

### Menu

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 113 | `people.firstAdministrator.title` | Pierwszy administrator | First administrator | /backend/people/first-administrator | |
| 114 | `people.imports.title` | Importy | Imports | /backend/people/imports | |
| 115 | `people.nav.group` | Ludzie | People | menu group | |
| 116 | `people.persons.title` | Osoby | People | /backend/people/persons | |

### Page titles

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 117 | `people.account.title` | Konto | Account |  | |
| 118 | `people.club.leave.title` | Odejście z klubu | Leave the club | /club/profile/leave | |
| 119 | `people.club.profile.title` | Profil i podopieczni | Profile and wards | /club/profile | |
| 120 | `people.club.title` | Klub | Club |  | |
| 121 | `people.club.today.pageTitle` | Dziś | Today | /club | |
| 122 | `people.club.ward.pageTitle` | Podopieczny | Ward | /club/wards/[personId] | |
| 123 | `people.dataExport.title` | Zgłoszenia dotyczące danych | Data requests |  | |
| 124 | `people.guardianships.title` | Opieka prawna i zgody | Guardianship and consents |  | |
| 125 | `people.imports.record.pageTitle` | Import | Import | /backend/people/imports/[id] | |
| 126 | `people.leaving.title` | Odejście | Leaving |  | |
| 127 | `people.persons.create.title` | Dodaj osobę | Add a person | /backend/people/persons/create | |
| 128 | `people.persons.record.title` | Kartoteka osoby | Person record | /backend/people/persons/[id] | |
| 129 | `people.roles.title` | Role w klubie | Staff roles |  | |
| 130 | `people.staffSetup.title` | Przygotowanie pracownika | Staff setup |  | |

### Tabs

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 131 | `people.persons.tabs.account` | Konto | Account |  | |
| 132 | `people.persons.tabs.charges` | Należności | Charges |  | |
| 133 | `people.persons.tabs.details` | Dane | Details |  | |
| 134 | `people.persons.tabs.groups` | Grupy | Groups |  | |
| 135 | `people.persons.tabs.guardianship` | Opieka i zgody | Guardianship and consents |  | |
| 136 | `people.persons.tabs.label` | Sekcje kartoteki osoby | Person record sections |  | |
| 137 | `people.persons.tabs.leaving` | Odejście | Leaving |  | |
| 138 | `people.persons.tabs.roles` | Role | Roles |  | |

### Statuses

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 139 | `people.account.state.active` | Aktywne | Active |  | |
| 140 | `people.account.state.blocked` | Zablokowane | Blocked |  | |
| 141 | `people.account.state.invited` | Zaproszenie wysłane | Invited |  | |
| 142 | `people.account.state.none` | Brak konta | No account |  | |
| 143 | `people.imports.status.cancelled` | Anulowany | Cancelled |  | |
| 144 | `people.imports.status.committed` | Zatwierdzony | Committed |  | |
| 145 | `people.imports.status.previewed` | Podgląd | Preview |  | |

### Buttons

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 146 | `people.account.actions.block` | Zablokuj | Block |  | |
| 147 | `people.account.actions.cancel` | Anuluj | Cancel |  | |
| 148 | `people.account.actions.changeEmail` | Zmień e-mail logowania | Change login e-mail |  | |
| 149 | `people.account.actions.create` | Utwórz konto | Create account |  | |
| 150 | `people.account.actions.resend` | Wyślij zaproszenie ponownie | Send the invitation again |  | |
| 151 | `people.account.actions.save` | Zapisz | Save |  | |
| 152 | `people.account.actions.unblock` | Odblokuj | Unblock |  | |
| 153 | `people.club.actions.retry` | Spróbuj ponownie | Try again |  | |
| 154 | `people.club.leave.back` | ‹ Profil | ‹ Profile |  | |
| 155 | `people.club.leave.send` | Wyślij prośbę | Send the request |  | |
| 156 | `people.club.profile.actions.save` | Zapisz profil | Save profile |  | |
| 157 | `people.club.ward.actions.save` | Zapisz zgody | Save consents |  | |
| 158 | `people.club.ward.back` | Wróć do „Dziś” | Back to Today |  | |
| 159 | `people.common.cancel` | Anuluj | Cancel |  | |
| 160 | `people.common.create` | Utwórz | Create |  | |
| 161 | `people.common.edit` | Edytuj | Edit |  | |
| 162 | `people.common.save` | Zapisz | Save |  | |
| 163 | `people.dataExport.action` | Eksportuj dane osobowe | Export personal data |  | |
| 164 | `people.email.departureConfirmed.action` | Otwórz klub | Open the club |  | |
| 165 | `people.email.departureRequestDeclined.action` | Otwórz prośbę | Open the request |  | |
| 166 | `people.email.departureRequestReceived.action` | Otwórz prośbę | Open the request |  | |
| 167 | `people.erasure.anonymise.action` | Zanonimizuj | Anonymise |  | |
| 168 | `people.erasure.anonymise.confirm` | Zanonimizuj | Anonymise |  | |
| 169 | `people.erasure.delete.action` | Usuń osobę | Delete person |  | |
| 170 | `people.erasure.delete.confirm` | Usunąć tę osobę? | Delete this person? |  | |
| 171 | `people.firstAdministrator.banner.action` | Pierwszy administrator | First administrator |  | |
| 172 | `people.firstAdministrator.submit` | Ustaw jako administratora klubu | Make club administrator |  | |
| 173 | `people.guardianships.actions.add` | Dodaj opiekę | Add guardianship |  | |
| 174 | `people.guardianships.actions.edit` | Edytuj | Edit |  | |
| 175 | `people.guardianships.actions.end` | Zakończ | End |  | |
| 176 | `people.guardianships.actions.saveConsents` | Zapisz zgody | Save consents |  | |
| 177 | `people.imports.actions.back` | Wróć do importów | Back to imports |  | |
| 178 | `people.imports.actions.cancel` | Anuluj import | Cancel the import |  | |
| 179 | `people.imports.actions.commit` | Zatwierdź import | Commit the import |  | |
| 180 | `people.imports.actions.create` | Utwórz | Create |  | |
| 181 | `people.imports.actions.createMemberships` | Utwórz członkostwa | Create memberships |  | |
| 182 | `people.imports.actions.match` | Dopasuj… | Match… |  | |
| 183 | `people.imports.actions.skip` | Pomiń | Skip |  | |
| 184 | `people.imports.decisions.create` | Utwórz jako nową osobę | Create as a new person |  | |
| 185 | `people.imports.match.cancel` | Zamknij | Close |  | |
| 186 | `people.imports.match.close` | Zamknij | Close |  | |
| 187 | `people.leaving.actions.cancel` | Anuluj | Cancel |  | |
| 188 | `people.leaving.actions.confirm` | Potwierdź odejście | Confirm leaving |  | |
| 189 | `people.leaving.return.action` | Powrót do klubu | Return to the club |  | |
| 190 | `people.leaving.return.confirm` | Przywrócić tę osobę do klubu? | Return this person to the club? |  | |
| 191 | `people.persons.actions.back` | Wróć do listy osób | Back to people |  | |
| 192 | `people.persons.actions.create` | Dodaj osobę | Add person |  | |
| 193 | `people.persons.actions.import` | Importuj | Import |  | |
| 194 | `people.persons.photo.remove` | Usuń zdjęcie | Remove the photo |  | |
| 195 | `people.picker.dialog.close` | Zamknij | Close |  | |
| 196 | `people.picker.dialog.submit` | Dodaj i wybierz | Add and select |  | |
| 197 | `people.picker.person.add` | Dodaj osobę | Add a person |  | |
| 198 | `people.picker.place.add` | Dodaj miejsce | Add a place |  | |
| 199 | `people.picker.section.add` | Dodaj sekcję | Add a section |  | |
| 200 | `people.roles.actions.assign` | Przypisz rolę | Assign role |  | |
| 201 | `people.roles.actions.end` | Zakończ | End |  | |
| 202 | `people.roles.actions.endOn` | Zakończ z dniem… | End on… |  | |
| 203 | `people.staffSetup.account.create` | Utwórz konto | Create an account |  | |

## Module `groups`

### Menu

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 204 | `groups.ageCategories.title` | Kategorie wiekowe | Age categories | /backend/groups/age-categories | |
| 205 | `groups.externalTeams.title` | Drużyny zewnętrzne | External teams | /backend/groups/external-teams | |
| 206 | `groups.groups.title` | Grupy | Groups | /backend/groups/groups | |
| 207 | `groups.nav.group` | Zajęcia | Classes | menu group | |
| 208 | `groups.nav.tabs.ageCategories` | Kategorie wiekowe | Age categories |  | |
| 209 | `groups.nav.tabs.externalTeams` | Drużyny zewnętrzne | External teams |  | |
| 210 | `groups.nav.tabs.groups` | Grupy | Groups |  | |
| 211 | `groups.nav.tabs.label` | Grupy, sezony i drużyny zewnętrzne | Groups, seasons and external teams |  | |
| 212 | `groups.nav.tabs.seasons` | Sezony | Seasons |  | |
| 213 | `groups.rollover.title` | Rozpocznij nowy sezon | Start a new season | /backend/groups/seasons/rollover | |
| 214 | `groups.seasons.title` | Sezony | Seasons | /backend/groups/seasons | |

### Page titles

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 215 | `groups.club.roster.title` | Skład | Roster | /club/groups/[id] | |
| 216 | `groups.club.title` | Grupy | Groups | /club/groups | |
| 217 | `groups.externalTeams.create.title` | Nowa drużyna zewnętrzna | New external team | /backend/groups/external-teams/create | |
| 218 | `groups.externalTeams.edit.title` | Edycja drużyny zewnętrznej | Edit external team | /backend/groups/external-teams/[id]/edit | |
| 219 | `groups.groups.create.title` | Nowa grupa | New group | /backend/groups/groups/create | |
| 220 | `groups.groups.record.title` | Grupa | Group | /backend/groups/groups/[id] | |
| 221 | `groups.memberships.title` | Skład | Roster |  | |
| 222 | `groups.personGroups.title` | Grupy | Groups |  | |
| 223 | `groups.seasons.create.title` | Nowy sezon | New season | /backend/groups/seasons/create | |
| 224 | `groups.seasons.edit.title` | Edycja sezonu | Edit season | /backend/groups/seasons/[id]/edit | |
| 225 | `groups.staffSetup.title` | Grupy jako trener | Groups as coach |  | |

### Tabs

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 226 | `groups.groups.tabs.details` | Szczegóły | Details |  | |
| 227 | `groups.groups.tabs.label` | Karta grupy | Group record |  | |
| 228 | `groups.groups.tabs.public` | Strona publiczna | Public page |  | |
| 229 | `groups.groups.tabs.roster` | Skład | Roster |  | |

### Statuses

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 230 | `groups.common.status.active` | Aktywne | Active |  | |
| 231 | `groups.common.status.ended` | Zakończone | Ended |  | |
| 232 | `groups.common.status.upcoming` | Przyszłe | Upcoming |  | |

### Buttons

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 233 | `groups.ageCategories.actions.create` | Dodaj kategorię | Add category |  | |
| 234 | `groups.ageCategories.actions.dictionary` | Zmień nazwy, kolejność lub usuń | Rename, reorder or delete |  | |
| 235 | `groups.club.back` | Wszystkie grupy | All groups |  | |
| 236 | `groups.common.cancel` | Anuluj | Cancel |  | |
| 237 | `groups.common.close` | Zamknij | Close |  | |
| 238 | `groups.common.create` | Utwórz | Create |  | |
| 239 | `groups.common.delete` | Usuń | Delete |  | |
| 240 | `groups.common.edit` | Edytuj | Edit |  | |
| 241 | `groups.common.save` | Zapisz | Save |  | |
| 242 | `groups.externalTeams.actions.back` | Wróć do drużyn zewnętrznych | Back to external teams |  | |
| 243 | `groups.externalTeams.actions.create` | Dodaj drużynę zewnętrzną | Add external team |  | |
| 244 | `groups.groups.actions.activities` | Aktywności | Activities |  | |
| 245 | `groups.groups.actions.back` | Wróć do grup | Back to groups |  | |
| 246 | `groups.groups.actions.create` | Dodaj grupę | Add group |  | |
| 247 | `groups.groups.actions.editAgeCategories` | Edytuj kategorie wiekowe | Edit age categories |  | |
| 248 | `groups.groups.actions.publicPreview` | Podgląd publiczny | Public preview |  | |
| 249 | `groups.memberships.actions.add` | Dodaj do składu | Add to roster |  | |
| 250 | `groups.memberships.actions.edit` | Zmień | Edit |  | |
| 251 | `groups.memberships.actions.end` | Zakończ członkostwo | End membership |  | |
| 252 | `groups.memberships.actions.endFor` | Zakończ członkostwo: {name} | End membership: {name} |  | |
| 253 | `groups.memberships.actions.move` | Przenieś | Move |  | |
| 254 | `groups.memberships.actions.moveEllipsis` | Przenieś… | Move… |  | |
| 255 | `groups.memberships.actions.remove` | Usuń | Remove |  | |
| 256 | `groups.memberships.moveMany.action` | Przenieś do innej grupy | Move to another group |  | |
| 257 | `groups.memberships.moveMany.submit` | Przenieś ({count}) | Move {count} |  | |
| 258 | `groups.picker.ageCategory.add` | Dodaj kategorię wiekową | Add an age category |  | |
| 259 | `groups.picker.dialog.cancel` | Anuluj | Cancel |  | |
| 260 | `groups.picker.dialog.close` | Zamknij | Close |  | |
| 261 | `groups.picker.dialog.submit` | Dodaj i wybierz | Add and select |  | |
| 262 | `groups.picker.institution.add` | Dodaj instytucję | Add an institution |  | |
| 263 | `groups.picker.season.add` | Dodaj sezon | Add a season |  | |
| 264 | `groups.picker.section.add` | Dodaj sekcję | Add a section |  | |
| 265 | `groups.rollover.actions.apply` | Zastosuj | Apply |  | |
| 266 | `groups.rollover.actions.back` | Wstecz | Back |  | |
| 267 | `groups.rollover.actions.cancel` | Anuluj | Cancel |  | |
| 268 | `groups.rollover.actions.next` | Dalej | Next |  | |
| 269 | `groups.rollover.actions.preview` | Pokaż podgląd | Show the preview |  | |
| 270 | `groups.rollover.fields.action` | Działanie | Action |  | |
| 271 | `groups.rollover.groupAction.close` | Zamknij | Close |  | |
| 272 | `groups.rollover.item.activities.activity.create` | {name} od {startsOn}, {startTime}–{endTime} | {name} from {startsOn}, {startTime}–{endTime} |  | |
| 273 | `groups.rollover.item.groups.group.create` | Nowa grupa {name} (kopia {sourceName}, pusty skład) | New group {name} (copy of {sourceName}, empty roster) |  | |
| 274 | `groups.rollover.item.groups.season.create` | Utworzenie sezonu {name} ({startsOn} – {endsOn}) | Create the season {name} ({startsOn} – {endsOn}) |  | |
| 275 | `groups.rollover.item.payments.fee.create` | {name}: {amount} od {validFrom} | {name}: {amount} from {validFrom} |  | |
| 276 | `groups.seasons.actions.back` | Wróć do sezonów | Back to seasons |  | |
| 277 | `groups.seasons.actions.create` | Dodaj sezon | Add season |  | |
| 278 | `groups.staffSetup.add` | Dodaj do grupy jako trenera… | Add to a group as coach… |  | |

## Module `activities`

### Menu

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 279 | `activities.activities.title` | Aktywności | Activities | /backend/activities/activities | |
| 280 | `activities.clubEvents.title` | Imprezy klubowe | Club events | /backend/activities/club-events | |
| 281 | `activities.nav.badge.waiting` | {count} oczekuje | {count} waiting |  | |
| 282 | `activities.occurrences.title` | Terminy | Sessions | /backend/activities/occurrences | |
| 283 | `activities.policies.title` | Polityki deklaracji | Declaration policies | /backend/activities/policies | |
| 284 | `activities.reports.coachUnits.title` | Raport jednostek | Coach units report | /backend/activities/reports/coach-units | |

### Page titles

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 285 | `activities.activities.create.title` | Nowa aktywność | New activity | /backend/activities/activities/create | |
| 286 | `activities.activities.record.title` | Aktywność | Activity | /backend/activities/activities/[id] | |
| 287 | `activities.club.attendance.pageTitle` | Lista obecności | Attendance list | /club/occurrences/[id]/attendance | |
| 288 | `activities.club.calendar.title` | Kalendarz | Calendar | /club/calendar | |
| 289 | `activities.club.edit.title` | Edycja terminu | Edit session | /club/occurrences/[id]/edit | |
| 290 | `activities.club.event.title` | Nowe wydarzenie | New event | /club/events/new | |
| 291 | `activities.club.session.pageTitle` | Termin | Session | /club/occurrences/[id] | |
| 292 | `activities.club.title` | Klub | Club |  | |
| 293 | `activities.club.units.title` | Moje jednostki | My units | /club/coach/units | |
| 294 | `activities.clubEvents.club.form.editTitle` | Edytuj imprezę klubową | Edit club event | /club/club-events/[id]/edit | |
| 295 | `activities.clubEvents.create.title` | Nowa impreza klubowa | New club event | /backend/activities/club-events/create, /club/club-events/new | |
| 296 | `activities.clubEvents.part.createTitle` | Nowa część | New part | /club/club-events/[id]/parts/new | |
| 297 | `activities.clubEvents.part.editTitle` | Edycja części | Edit part | /club/club-events/[id]/parts/[partId]/edit | |
| 298 | `activities.clubEvents.record.title` | Impreza klubowa | Club event | /backend/activities/club-events/[id], /club/club-events/[id] | |
| 299 | `activities.conflicts.title` | Nie zapisano: część terminów koliduje z innymi | Not saved: some sessions conflict with others |  | |
| 300 | `activities.declarationLink.pageTitle` | Deklaracja z linku | Declaration from link | /club/d/[token] | |
| 301 | `activities.declarationLink.title` | Obecność | Attendance |  | |
| 302 | `activities.events.create.title` | Nowe wydarzenie jednorazowe | New one-off event | /backend/activities/events/create | |
| 303 | `activities.linkRequest.pageTitle` | Osobisty link | Personal link | /club/link | |
| 304 | `activities.linkRequest.title` | Osobisty link | Personal link |  | |
| 305 | `activities.occurrences.record.title` | Termin | Session | /backend/activities/occurrences/[id] | |
| 306 | `activities.policies.create.title` | Nowa polityka deklaracji | New declaration policy | /backend/activities/policies/create | |
| 307 | `activities.policies.edit.title` | Edycja polityki deklaracji | Edit declaration policy | /backend/activities/policies/[id]/edit | |
| 308 | `activities.preview.title` | Terminy | Sessions |  | |
| 309 | `activities.publicSession.pageTitle` | Termin | Session | /p/[clubSlug]/s/[occurrenceId] | |
| 310 | `activities.publicSession.title` | Termin | Session |  | |
| 311 | `activities.score.title` | Wynik | Score |  | |

### Tabs

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 312 | `activities.activities.record.tabs` | Szczegóły i terminy aktywności | Activity details and sessions |  | |
| 313 | `activities.clubEvents.record.tabs` | Sekcje imprezy klubowej | Club event sections |  | |

### Statuses

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 314 | `activities.clubEvents.status.cancelled` | Odwołana | Cancelled |  | |
| 315 | `activities.clubEvents.status.planned` | Zaplanowana | Planned |  | |
| 316 | `activities.occurrences.status.cancelled` | Odwołany | Cancelled |  | |
| 317 | `activities.occurrences.status.done` | Odbyty | Done |  | |
| 318 | `activities.occurrences.status.planned` | Zaplanowany | Planned |  | |
| 319 | `activities.preview.status.conflict` | Kolizja | Conflict |  | |
| 320 | `activities.preview.status.free` | Wolne | Free |  | |
| 321 | `activities.publicSession.status` | Status: | Status: |  | |

### Buttons

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 322 | `activities.activities.actions.back` | Wróć do aktywności | Back to activities |  | |
| 323 | `activities.activities.actions.create` | Nowa aktywność | New activity |  | |
| 324 | `activities.activities.actions.createEvent` | Nowe wydarzenie jednorazowe | New one-off event |  | |
| 325 | `activities.activities.actions.sessions` | Terminy | Sessions |  | |
| 326 | `activities.activities.actions.sessionsOf` | Terminy: {name} | Sessions of {name} |  | |
| 327 | `activities.club.actions.approve` | Zatwierdź | Approve |  | |
| 328 | `activities.club.actions.attending` | Będzie | Attending |  | |
| 329 | `activities.club.actions.notAttending` | Nie będzie | Not attending |  | |
| 330 | `activities.club.actions.reject` | Odrzuć | Reject |  | |
| 331 | `activities.club.actions.reportAbsence` | Zgłoś nieobecność | Report absence |  | |
| 332 | `activities.club.actions.retry` | Spróbuj ponownie | Try again |  | |
| 333 | `activities.club.actions.withdrawAbsence` | Cofnij nieobecność | Withdraw the absence |  | |
| 334 | `activities.club.attendance.close` | Zamknij termin | Close session |  | |
| 335 | `activities.club.attendance.fillNothing.confirm` | Wszyscy, którzy potwierdzili, są już zaznaczeni. | Everyone who confirmed is already marked. |  | |
| 336 | `activities.club.attendance.save` | Zapisz | Save |  | |
| 337 | `activities.club.edit.back` | Wróć do terminu | Back to the session |  | |
| 338 | `activities.club.edit.submit` | Zapisz zmiany | Save changes |  | |
| 339 | `activities.club.event.back` | Wróć do kalendarza | Back to the calendar |  | |
| 340 | `activities.club.event.cancel` | Anuluj | Cancel |  | |
| 341 | `activities.club.event.submit` | Utwórz wydarzenie | Create event |  | |
| 342 | `activities.club.kind.confirm` | Potwierdzenie obecności | Confirm attendance |  | |
| 343 | `activities.club.session.back` | Wróć do kalendarza | Back to the calendar |  | |
| 344 | `activities.club.session.cancel` | Odwołaj termin | Cancel session |  | |
| 345 | `activities.club.session.edit` | Edytuj | Edit |  | |
| 346 | `activities.clubEventFiles.actions.remove` | Usuń | Remove |  | |
| 347 | `activities.clubEventFiles.actions.removeLogo` | Usuń logo: {name} | Remove the logo of {name} |  | |
| 348 | `activities.clubEvents.actions.addPlace` | Dodaj miejsce | Add place |  | |
| 349 | `activities.clubEvents.actions.back` | Wróć do imprez klubowych | Back to club events |  | |
| 350 | `activities.clubEvents.actions.cancel` | Odwołaj imprezę klubową | Cancel club event |  | |
| 351 | `activities.clubEvents.actions.create` | Nowa impreza klubowa | New club event |  | |
| 352 | `activities.clubEvents.actions.publicPage` | Strona publiczna | Public page |  | |
| 353 | `activities.clubEvents.club.event.back` | Wróć do imprezy klubowej | Back to the club event |  | |
| 354 | `activities.clubEvents.club.event.edit` | Edytuj imprezę klubową | Edit club event |  | |
| 355 | `activities.clubEvents.part.actions.add` | Dodaj część | Add part |  | |
| 356 | `activities.clubEvents.part.actions.cancel` | Odwołaj część | Cancel part |  | |
| 357 | `activities.clubEvents.part.actions.copy` | Kopiuj | Copy |  | |
| 358 | `activities.clubEvents.part.actions.edit` | Edytuj | Edit |  | |
| 359 | `activities.clubEvents.part.actions.move` | Przenieś | Move |  | |
| 360 | `activities.clubEvents.part.actions.remove` | Usuń | Remove |  | |
| 361 | `activities.clubEvents.part.teams.add` | Dodaj drużynę | Add team |  | |
| 362 | `activities.clubEvents.part.teams.remove` | Usuń {name} | Remove {name} |  | |
| 363 | `activities.clubEvents.part.teams.submit` | Dodaj drużynę | Add team |  | |
| 364 | `activities.common.back` | Wróć | Back |  | |
| 365 | `activities.common.cancel` | Anuluj | Cancel |  | |
| 366 | `activities.common.close` | Zamknij | Close |  | |
| 367 | `activities.common.create` | Utwórz | Create |  | |
| 368 | `activities.common.delete` | Usuń | Delete |  | |
| 369 | `activities.common.save` | Zapisz | Save |  | |
| 370 | `activities.email.declarationLink.action` | Zadeklaruj obecność | Declare attendance |  | |
| 371 | `activities.form.recurrence.exdates.add` | Dodaj dzień | Add day |  | |
| 372 | `activities.form.recurrence.exdates.remove` | Usuń {date} | Remove {date} |  | |
| 373 | `activities.linkRequest.form.submit` | Wyślij mi link | Send me a link |  | |
| 374 | `activities.occurrences.actions.attendance` | Lista obecności | Attendance list |  | |
| 375 | `activities.occurrences.actions.back` | Wróć do terminów | Back to sessions |  | |
| 376 | `activities.occurrences.actions.cancel` | Odwołaj termin | Cancel session |  | |
| 377 | `activities.occurrences.actions.forSession` | {action}: {session} | {action}: {session} |  | |
| 378 | `activities.occurrences.actions.move` | Przenieś | Move |  | |
| 379 | `activities.occurrences.actions.restore` | Przywróć termin | Restore session |  | |
| 380 | `activities.occurrences.cancel.confirm` | Odwołaj termin | Cancel session |  | |
| 381 | `activities.occurrences.columns.actions` | Akcje | Actions |  | |
| 382 | `activities.occurrences.move.submit` | Przenieś termin | Move session |  | |
| 383 | `activities.occurrences.restore.confirm` | Przywróć termin | Restore session |  | |
| 384 | `activities.policies.actions.back` | Wróć do polityk | Back to policies |  | |
| 385 | `activities.policies.actions.create` | Dodaj politykę | Add policy |  | |
| 386 | `activities.policies.actions.edit` | Edytuj | Edit |  | |
| 387 | `activities.preview.action` | Podgląd | Preview |  | |
| 388 | `activities.publicSession.link.action` | Wyślij mi link | Send me a link |  | |
| 389 | `activities.publicSession.signIn.action` | Zaloguj się | Sign in |  | |
| 390 | `activities.score.save` | Zapisz wynik | Save score |  | |
| 391 | `activities.substitutions.absence.action` | Zgłoś nieobecność | Report absence |  | |
| 392 | `activities.substitutions.absence.submit` | Zgłoś | Report |  | |
| 393 | `activities.substitutions.assign.action` | Wskaż zastępcę | Assign substitute |  | |
| 394 | `activities.substitutions.change.action` | Zmień prowadzącego | Change coach |  | |
| 395 | `activities.substitutions.submit` | Zapisz zastępstwo | Save substitution |  | |

## Module `communication`

### Menu

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 396 | `communication.nav.group` | Komunikacja | Communication | menu group | |
| 397 | `communication.threads.page.title` | Wątki i sprawy | Threads and cases | /backend/communication/cases, /backend/communication/threads | |

### Page titles

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 398 | `communication.cases.title` | Sprawy | Cases |  | |
| 399 | `communication.club.thread.pageTitle` | Wątek | Thread | /club/messages/[threadId] | |
| 400 | `communication.club.title` | Wiadomości | Messages | /club/messages | |
| 401 | `communication.deliveries.title` | Odbiorcy | Recipients |  | |
| 402 | `communication.direct.title` | Napisz do trenera | Write to the coach | /club/messages/new | |
| 403 | `communication.threads.create.title` | Nowe ogłoszenie | New announcement | /backend/communication/threads/create | |
| 404 | `communication.threads.record.title` | Wątek | Thread | /backend/communication/threads/[id] | |
| 405 | `communication.threads.title` | Wątki | Threads |  | |
| 406 | `communication.tile.title` | Wiadomości | Messages |  | |

### Tabs

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 407 | `communication.threads.tabs.all` | Wszystkie | All |  | |
| 408 | `communication.threads.tabs.cases` | Sprawy | Cases |  | |
| 409 | `communication.threads.tabs.label` | Wątki i sprawy | Threads and cases |  | |

### Statuses

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 410 | `communication.deliveries.status.failed` | Niedoręczone | Not delivered |  | |
| 411 | `communication.deliveries.status.queued` | W kolejce | Queued |  | |
| 412 | `communication.deliveries.status.sent` | Wysłane | Sent |  | |
| 413 | `communication.deliveries.status.skipped` | Pominięte | Skipped |  | |

### Buttons

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 414 | `communication.actions.retry` | Spróbuj ponownie | Try again |  | |
| 415 | `communication.cases.actions.mark` | Oznacz jako sprawę | Mark as case |  | |
| 416 | `communication.club.back` | Wszystkie wiadomości | All messages |  | |
| 417 | `communication.club.compose.action` | Nowe ogłoszenie | New announcement |  | |
| 418 | `communication.club.compose.close` | Zamknij | Close |  | |
| 419 | `communication.direct.action` | Napisz do trenera | Write to the coach |  | |
| 420 | `communication.direct.cancel` | Anuluj | Cancel |  | |
| 421 | `communication.direct.send` | Wyślij | Send |  | |
| 422 | `communication.message.actions.delete` | Usuń wiadomość | Delete message |  | |
| 423 | `communication.message.actions.edit` | Edytuj | Edit |  | |
| 424 | `communication.message.edit.cancel` | Anuluj | Cancel |  | |
| 425 | `communication.message.edit.save` | Zapisz | Save |  | |
| 426 | `communication.reply.send` | Wyślij odpowiedź | Send reply |  | |
| 427 | `communication.share.action` | Kopiuj tekst do czatu grupy | Copy text for group chat |  | |
| 428 | `communication.threads.actions.create` | Nowe ogłoszenie | New announcement |  | |
| 429 | `communication.threads.create.submit` | Wyślij | Send |  | |

## Module `payments`

### Menu

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 430 | `payments.bank.title` | Wyciągi bankowe | Bank statements | /backend/payments/bank | |
| 431 | `payments.cashCustody.title` | Gotówka do rozliczenia | Cash to settle | /backend/payments/cash-custody | |
| 432 | `payments.charges.title` | Należności | Charges | /backend/payments/charges | |
| 433 | `payments.discounts.title` | Zniżki | Discounts | /backend/payments/discounts | |
| 434 | `payments.fees.title` | Cenniki i zniżki | Fees and discounts | /backend/payments/fees | |
| 435 | `payments.generations.title` | Generowania | Generations | /backend/payments/generations | |
| 436 | `payments.nav.badge.waiting` | {count} oczekuje | {count} waiting |  | |
| 437 | `payments.nav.group` | Finanse | Finance | menu group | |
| 438 | `payments.nav.tabs.discounts` | Zniżki | Discounts |  | |
| 439 | `payments.nav.tabs.fees` | Cenniki | Fees |  | |
| 440 | `payments.nav.tabs.label` | Cenniki i zniżki | Fees and discounts |  | |
| 441 | `payments.nav.tabs.settings` | Trenerzy i płatności | Coaches and payments |  | |
| 442 | `payments.orders.title` | Zbiórki zamówień | Order campaigns | /backend/payments/orders | |
| 443 | `payments.settings.title` | Trenerzy i płatności | Coaches and payments | /backend/payments/settings | |

### Page titles

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 444 | `payments.assignPayer.title` | Przypisz płatnika | Assign payer |  | |
| 445 | `payments.cash.title` | Przyjmij gotówkę | Accept cash | /club/cash | |
| 446 | `payments.club.return.title` | Wynik płatności | Payment result | /club/payments/return | |
| 447 | `payments.club.title` | Płatności | Payments | /club/payments | |
| 448 | `payments.coach.title` | Płatności moich grup | My groups' payments | /club/coach/payments | |
| 449 | `payments.discounts.create.title` | Nowa zniżka | New discount rule | /backend/payments/discounts/create | |
| 450 | `payments.discounts.edit.title` | Edycja zniżki | Edit discount rule | /backend/payments/discounts/[id]/edit | |
| 451 | `payments.fees.create.title` | Nowy cennik składki | New fee schedule | /backend/payments/fees/create | |
| 452 | `payments.fees.edit.title` | Edycja cennika składki | Edit fee schedule | /backend/payments/fees/[id]/edit | |
| 453 | `payments.ledger.title` | Należność | Charge | /backend/payments/charges/[id] | |
| 454 | `payments.manual.title` | Dodaj należność | Add charge |  | |
| 455 | `payments.orders.club.listTitle` | Zamówienia | Orders | /club/orders | |
| 456 | `payments.orders.club.pageTitle` | Zamówienie | Order | /club/orders/[campaignId] | |
| 457 | `payments.orders.create.title` | Nowy formularz zamówienia | New order form | /backend/payments/orders/create | |
| 458 | `payments.orders.edit.title` | Edycja formularza zamówienia | Edit order form | /backend/payments/orders/[id]/edit | |
| 459 | `payments.orders.link.title` | Zamówienie stroju | Kit order | /club/o/[token] | |
| 460 | `payments.orders.record.title` | Zbiórka zamówień | Order campaign | /backend/payments/orders/[id] | |
| 461 | `payments.personCharges.title` | Należności | Charges |  | |

### Tabs

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 462 | `payments.assignPayer.guardianshipTab` | Opieka | Guardianship |  | |
| 463 | `payments.orders.tabs.label` | Widoki zbiórki | Campaign views |  | |
| 464 | `payments.orders.tabs.missing` | Bez zamówienia | No order |  | |
| 465 | `payments.orders.tabs.missingCount` | Bez zamówienia ({count}) | No order ({count}) |  | |
| 466 | `payments.orders.tabs.orders` | Zamówienia | Orders |  | |
| 467 | `payments.orders.tabs.ordersCount` | Zamówienia ({count}) | Orders ({count}) |  | |
| 468 | `payments.orders.tabs.summary` | Zestawienie dla dostawcy | Supplier summary |  | |

### Statuses

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 469 | `payments.bank.status.autoBooked` | Zaksięgowany automatycznie | Recorded automatically |  | |
| 470 | `payments.bank.status.booked` | Zaksięgowany | Recorded |  | |
| 471 | `payments.bank.status.ignored` | Pominięty | Skipped |  | |
| 472 | `payments.bank.status.suggested` | Do potwierdzenia | To confirm |  | |
| 473 | `payments.bank.status.unmatched` | Niedopasowany | Unmatched |  | |
| 474 | `payments.charges.status.cancelled` | Anulowana | Cancelled |  | |
| 475 | `payments.charges.status.forfeited` | Umorzona | Forfeited |  | |
| 476 | `payments.charges.status.open` | Otwarta | Open |  | |
| 477 | `payments.charges.status.paid` | Opłacona | Paid |  | |
| 478 | `payments.charges.status.partially_paid` | Częściowo opłacona | Partially paid |  | |
| 479 | `payments.club.charges.status.paid` | Opłacona | Paid |  | |
| 480 | `payments.club.charges.status.partially_paid` | Częściowo opłacona | Partly paid |  | |
| 481 | `payments.coach.tile.state` | Osoby z należnościami: {people}, z zaległością: {overdue}; gotówka u Ciebie {cash} | {people} people have charges, {overdue} overdue; cash with you {cash} |  | |
| 482 | `payments.generations.status.active` | Aktywne | Active |  | |
| 483 | `payments.generations.status.undone` | Cofnięte: anulowano {cancelled} | Undone: {cancelled} cancelled |  | |
| 484 | `payments.orders.club.state.not_ordered` | Nie zamówiono | Not ordered |  | |
| 485 | `payments.orders.club.state.paid` | Opłacone | Paid |  | |
| 486 | `payments.orders.club.state.picked_up` | Odebrane | Picked up |  | |
| 487 | `payments.orders.club.state.to_pay` | Do zapłaty | To pay |  | |

### Buttons

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 488 | `payments.assignPayer.action` | Przypisz płatnika | Assign payer |  | |
| 489 | `payments.assignPayer.confirm` | Przypisz | Assign |  | |
| 490 | `payments.bank.actions.assign` | Przypisz | Assign |  | |
| 491 | `payments.bank.actions.change` | Zmień | Change |  | |
| 492 | `payments.bank.actions.confirm` | Potwierdź | Confirm |  | |
| 493 | `payments.bank.actions.ignore` | Pomiń | Skip |  | |
| 494 | `payments.bank.actions.restore` | Przywróć | Restore |  | |
| 495 | `payments.bank.actions.undo` | Cofnij | Undo |  | |
| 496 | `payments.bank.history.delete.action` | Usuń | Delete |  | |
| 497 | `payments.bank.import.action` | Importuj | Import |  | |
| 498 | `payments.cash.action` | Przyjmij gotówkę | Accept cash |  | |
| 499 | `payments.cash.confirm` | Przyjmij {amount} zł | Accept {amount} zł |  | |
| 500 | `payments.cashCustody.accept.action` | Przyjmij rozliczenie | Accept handover |  | |
| 501 | `payments.cashCustody.accept.confirm` | Potwierdzam odbiór gotówki | I confirm receipt of the cash |  | |
| 502 | `payments.charges.actions.generate` | Generuj okres | Generate period |  | |
| 503 | `payments.charges.actions.generations` | Generowania | Generations |  | |
| 504 | `payments.charges.actions.importStatement` | Importuj wyciąg | Import statement |  | |
| 505 | `payments.charges.export.action` | Eksportuj CSV | Export CSV |  | |
| 506 | `payments.charges.generate.confirm` | Generuj | Generate |  | |
| 507 | `payments.club.form.back` | Wróć do należności | Back to charges |  | |
| 508 | `payments.club.return.back` | Wróć do płatności | Back to payments |  | |
| 509 | `payments.club.testGateway.confirm` | Potwierdź płatność testową | Confirm test payment |  | |
| 510 | `payments.coach.handOver.action` | Wydaj strój | Hand over kit |  | |
| 511 | `payments.coach.remind.action` | Wyślij przypomnienie | Send reminder |  | |
| 512 | `payments.common.back` | Wróć | Back |  | |
| 513 | `payments.common.cancel` | Anuluj | Cancel |  | |
| 514 | `payments.common.close` | Zamknij | Close |  | |
| 515 | `payments.common.create` | Utwórz | Create |  | |
| 516 | `payments.common.delete` | Usuń | Delete |  | |
| 517 | `payments.common.edit` | Edytuj | Edit |  | |
| 518 | `payments.common.save` | Zapisz | Save |  | |
| 519 | `payments.discounts.actions.back` | Wróć do zniżek | Back to discounts |  | |
| 520 | `payments.discounts.actions.create` | Dodaj zniżkę | Add discount rule |  | |
| 521 | `payments.email.chargeReminder.action` | Zapłać online w aplikacji klubu, przelewem z kodem płatnika lub gotówką u trenera. | Pay online in the club app, by transfer with your payer code, or in cash to the coach. |  | |
| 522 | `payments.email.orderLink.action` | Otwórz formularz zamówienia | Open the order form |  | |
| 523 | `payments.email.orderReminder.action` | Otwórz formularz zamówienia w aplikacji klubu. | Open the order form in the club app. |  | |
| 524 | `payments.fees.actions.back` | Wróć do składek | Back to fees |  | |
| 525 | `payments.fees.actions.create` | Dodaj cennik | Add fee schedule |  | |
| 526 | `payments.generations.undo.action` | Cofnij | Undo |  | |
| 527 | `payments.ledger.back` | Wróć do należności | Back to charges |  | |
| 528 | `payments.ledger.cancel.action` | Anuluj należność | Cancel charge |  | |
| 529 | `payments.ledger.cancel.confirm` | Anuluj należność | Cancel charge |  | |
| 530 | `payments.ledger.payments.actions` | Akcje | Actions |  | |
| 531 | `payments.ledger.record.action` | Zaksięguj wpłatę | Record payment |  | |
| 532 | `payments.ledger.record.confirm` | Zaksięguj | Record |  | |
| 533 | `payments.ledger.refund.action` | Zwróć | Refund |  | |
| 534 | `payments.ledger.refund.confirm` | Zwróć | Refund |  | |
| 535 | `payments.ledger.reverse.action` | Storno | Reverse |  | |
| 536 | `payments.ledger.reverse.confirm` | Wystornuj | Reverse |  | |
| 537 | `payments.manual.action` | Dodaj należność | Add charge |  | |
| 538 | `payments.manual.confirm` | Dodaj należność | Add charge |  | |
| 539 | `payments.orders.actions.back` | Wróć do zbiórek zamówień | Back to order campaigns |  | |
| 540 | `payments.orders.actions.create` | Nowy formularz zamówienia | New order form |  | |
| 541 | `payments.orders.actions.saveAndOpen` | Zapisz i otwórz zbieranie | Save and open collection |  | |
| 542 | `payments.orders.actions.saveDraft` | Zapisz szkic | Save draft |  | |
| 543 | `payments.orders.club.cancel.action` | Anuluj zamówienie | Cancel order |  | |
| 544 | `payments.orders.club.cancel.confirm` | Anuluj zamówienie | Cancel order |  | |
| 545 | `payments.orders.club.signedOut.send` | Wyślij mi link | Send me a link |  | |
| 546 | `payments.orders.next.close.action` | Zamknij zamówienia | Close orders |  | |
| 547 | `payments.orders.next.complete.action` | Zakończ | Complete |  | |
| 548 | `payments.orders.next.mark-delivered.action` | Oznacz jako dostarczone | Mark as delivered |  | |
| 549 | `payments.orders.next.mark-ordered.action` | Oznacz jako zamówione | Mark as ordered |  | |
| 550 | `payments.orders.next.open.action` | Otwórz zbieranie | Open collection |  | |
| 551 | `payments.orders.orders.columns.actions` | Akcje | Actions |  | |
| 552 | `payments.orders.products.add` | Dodaj produkt | Add product |  | |
| 553 | `payments.orders.products.remove` | Usuń | Remove |  | |
| 554 | `payments.orders.share.action` | Tekst do Messengera | Text for Messenger |  | |

## Module `facilities`

### Menu

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 555 | `facilities.nav.badge.waiting` | {count} oczekuje | {count} waiting |  | |
| 556 | `facilities.nav.calendar` | Kalendarz | Calendar | /backend/facilities/calendar | |
| 557 | `facilities.nav.group` | Obiekt | Facility | menu group | |
| 558 | `facilities.nav.requests` | Zgłoszenia | Requests | /backend/facilities/requests | |
| 559 | `facilities.records.title` | Dziennik i incydenty | Log and incidents | /backend/facilities/bans, /backend/facilities/incidents, /backend/facilities/logs, /backend/facilities/maintenance | |
| 560 | `facilities.rentals.title` | Wynajmy | Rentals | /backend/facilities/rentals | |
| 561 | `facilities.reports.owner.title` | Raport dla gminy | Municipality report | /backend/facilities/reports/owner, /backend/facilities/reports/rented-hours | |
| 562 | `facilities.rules.title` | Strefy i cennik | Zones and rates | /backend/facilities/closures, /backend/facilities/rates, /backend/facilities/zones | |

### Page titles

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 563 | `facilities.availability.title` | Ustaw dostępność do rezerwacji | Set booking availability |  | |
| 564 | `facilities.calendar.title` | Kalendarz obiektu | Facility calendar | /backend/facilities/calendar | |
| 565 | `facilities.closures.create.title` | Nowe zamknięcie | New closure | /backend/facilities/closures/create | |
| 566 | `facilities.closures.edit.title` | Edycja zamknięcia | Edit closure | /backend/facilities/closures/[id]/edit | |
| 567 | `facilities.closures.title` | Zamknięcia | Closures |  | |
| 568 | `facilities.facility.title` | Dziś na obiekcie | Today at the facility | /club/facility | |
| 569 | `facilities.maintenance.title` | Konserwacja | Maintenance |  | |
| 570 | `facilities.places.detail.title` | Obiekt | Facility | /club/places/[placeId] | |
| 571 | `facilities.places.maintenance.title` | Konserwacja | Maintenance | /club/places/maintenance | |
| 572 | `facilities.places.title` | Obiekty | Facilities | /club/places | |
| 573 | `facilities.preview.title` | Podgląd tygodnia: {from} – {to} | Week preview: {from} – {to} |  | |
| 574 | `facilities.public.cancel.pageTitle` | Odwołanie rezerwacji | Cancel a booking | /p/[clubSlug]/rentals/cancel/[token] | |
| 575 | `facilities.public.places.pageTitle` | Obiekty | Facilities | /p/[clubSlug]/places | |
| 576 | `facilities.public.schedule.pageTitle` | Kalendarz obiektu | Facility calendar | /p/[clubSlug]/places/[placeSlug] | |
| 577 | `facilities.public.title` | Obiekty klubu | Club facilities |  | |
| 578 | `facilities.public.verify.pageTitle` | Potwierdzenie zgłoszenia | Booking request confirmation | /p/[clubSlug]/requests/verify/[token] | |
| 579 | `facilities.rates.create.title` | Nowa pozycja cennika wynajmu | New rental rate | /backend/facilities/rates/create | |
| 580 | `facilities.rates.edit.title` | Edycja pozycji cennika wynajmu | Edit rental rate | /backend/facilities/rates/[id]/edit | |
| 581 | `facilities.rates.title` | Cennik wynajmu | Rental rates |  | |
| 582 | `facilities.rentals.record.title` | Wynajem | Rental | /backend/facilities/rentals/[id], /club/facility/rentals/[id] | |
| 583 | `facilities.requests.title` | Zgłoszenia do akceptacji | Requests awaiting approval | /backend/facilities/requests | |
| 584 | `facilities.slot.title` | Rezerwuj: {place}, {date} | Book: {place}, {date} |  | |
| 585 | `facilities.zones.create.title` | Nowa reguła strefy | New zone rule | /backend/facilities/zones/create | |
| 586 | `facilities.zones.edit.title` | Edycja reguły strefy | Edit zone rule | /backend/facilities/zones/[id]/edit | |
| 587 | `facilities.zones.title` | Strefy | Zones |  | |

### Tabs

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 588 | `facilities.facility.tabs.label` | Obiekt | Facility |  | |
| 589 | `facilities.facility.tabs.rentals` | Wynajmy | Rentals |  | |
| 590 | `facilities.facility.tabs.today` | Dziś | Today |  | |
| 591 | `facilities.maintenance.tabs.label` | Widoki konserwacji | Maintenance views |  | |
| 592 | `facilities.maintenance.tabs.maintainers` | Opiekunowie | Maintainers |  | |
| 593 | `facilities.maintenance.tabs.tasks` | Zadania | Tasks |  | |
| 594 | `facilities.records.bans.tabs.active` | Aktywne | Active |  | |
| 595 | `facilities.records.bans.tabs.all` | Wszystkie | All |  | |
| 596 | `facilities.records.bans.tabs.label` | Zakazy wstępu według stanu | Entry bans by state |  | |
| 597 | `facilities.records.bans.tabs.revoked` | Odwołane | Revoked |  | |
| 598 | `facilities.records.tabs.bans` | Zakazy wstępu | Entry bans |  | |
| 599 | `facilities.records.tabs.incidents` | Incydenty | Incidents |  | |
| 600 | `facilities.records.tabs.label` | Dziennik i incydenty | Log and incidents |  | |
| 601 | `facilities.records.tabs.logs` | Dziennik | Log |  | |
| 602 | `facilities.records.tabs.maintenance` | Konserwacja | Maintenance |  | |
| 603 | `facilities.rentals.tabs.active` | Aktywne | Active |  | |
| 604 | `facilities.rentals.tabs.all` | Wszystkie | All |  | |
| 605 | `facilities.rentals.tabs.awaiting_approval` | Czekają na akceptację | Awaiting approval |  | |
| 606 | `facilities.rentals.tabs.label` | Listy wynajmów | Rental lists |  | |
| 607 | `facilities.reports.tabs.label` | Raport dla gminy | Municipality report |  | |
| 608 | `facilities.reports.tabs.owner` | Raport dla gminy | Municipality report |  | |
| 609 | `facilities.reports.tabs.rentedHours` | Wynajmowane godziny | Rented hours |  | |
| 610 | `facilities.rules.tabs.closures` | Zamknięcia | Closures |  | |
| 611 | `facilities.rules.tabs.label` | Strefy i cennik | Zones and rates |  | |
| 612 | `facilities.rules.tabs.rates` | Cennik wynajmu | Rental rates |  | |
| 613 | `facilities.rules.tabs.zones` | Strefy | Zones |  | |

### Statuses

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 614 | `facilities.facility.state.closed` | Obiekt zamknięty {time} | Facility closed {time} |  | |
| 615 | `facilities.facility.state.conditionAfter` | Stan po: {text} | Condition after: {text} |  | |
| 616 | `facilities.facility.state.conditionBefore` | Stan przed: {text} | Condition before: {text} |  | |
| 617 | `facilities.facility.state.notOpened` | Obiekt nie został dziś otwarty. | The facility has not been opened today. |  | |
| 618 | `facilities.facility.state.opened` | Obiekt otwarty {time} | Facility opened {time} |  | |
| 619 | `facilities.maintenance.status.all` | Wszystkie statusy | All statuses |  | |
| 620 | `facilities.maintenance.status.cancelled` | Anulowane | Cancelled |  | |
| 621 | `facilities.maintenance.status.done` | Wykonane | Done |  | |
| 622 | `facilities.maintenance.status.planned` | Zaplanowane | Planned |  | |
| 623 | `facilities.places.details.status` | Status | Status |  | |
| 624 | `facilities.public.state.bookable` | Wolne — do rezerwacji | Free — bookable |  | |
| 625 | `facilities.public.state.bookable.help` | Wolne; można je wynająć. | Free; it can be rented. |  | |
| 626 | `facilities.public.state.booked` | Zarezerwowane | Booked |  | |
| 627 | `facilities.public.state.booked.help` | Wynajęte. | Rented. |  | |
| 628 | `facilities.public.state.closed` | Zamknięte | Closed |  | |
| 629 | `facilities.public.state.closed.help` | Obiekt jest zamknięty. | The facility is closed. |  | |
| 630 | `facilities.public.state.club` | Zajęte przez klub | Taken by the club |  | |
| 631 | `facilities.public.state.club.help` | Klub korzysta z obiektu. | Used by the club. |  | |
| 632 | `facilities.public.state.club_training` | Treningi klubu | Club training hours |  | |
| 633 | `facilities.public.state.club_training.help` | Zarezerwowane na treningi klubu. | Reserved for the club’s training. |  | |
| 634 | `facilities.public.state.public_free` | Otwarte dla wszystkich | Open to the public |  | |
| 635 | `facilities.public.state.public_free.help` | Każdy może korzystać bez rezerwacji. | Anyone may use it, without booking. |  | |
| 636 | `facilities.public.state.requested` | Zgłoszone — oczekuje | Requested — pending |  | |
| 637 | `facilities.public.state.requested.help` | Zgłoszenie rezerwacji czeka na decyzję. | A booking request is waiting for a decision. |  | |
| 638 | `facilities.public.state.unavailable` | Niedostępne | Unavailable |  | |
| 639 | `facilities.public.state.unavailable.help` | Niedostępne, np. z powodu prac konserwacyjnych. | Not available, e.g. for maintenance work. |  | |
| 640 | `facilities.records.bans.state.active` | Aktywny | Active |  | |
| 641 | `facilities.records.bans.state.revoked` | Odwołany | Revoked |  | |
| 642 | `facilities.rentals.status.cancelled_free` | Anulowany (bezpłatnie) | Cancelled (free) |  | |
| 643 | `facilities.rentals.status.cancelled_late` | Anulowany po terminie | Cancelled late |  | |
| 644 | `facilities.rentals.status.confirmed` | Potwierdzony | Confirmed |  | |
| 645 | `facilities.rentals.status.done` | Zrealizowany | Done |  | |
| 646 | `facilities.rentals.status.expired` | Wygasły | Expired |  | |
| 647 | `facilities.rentals.status.no_show` | Nie stawił się | No-show |  | |
| 648 | `facilities.rentals.status.pending_approval` | Czeka na akceptację | Awaiting approval |  | |
| 649 | `facilities.rentals.status.pending_verification` | Czeka na potwierdzenie e-mail | Awaiting e-mail confirmation |  | |
| 650 | `facilities.rentals.status.rejected` | Odrzucony | Rejected |  | |
| 651 | `facilities.rentals.status.requested` | Zaakceptowany — czeka na wpłatę | Approved — awaiting payment |  | |
| 652 | `facilities.rentals.status.superseded` | Zastąpiony | Superseded |  | |

### Buttons

| # | Key | Polish (now) | English (source) | Where | Change to |
|---|---|---|---|---|---|
| 653 | `facilities.calendar.actions.closures` | Zamknięcia | Closures |  | |
| 654 | `facilities.calendar.actions.decide` | Decyzja | Decision |  | |
| 655 | `facilities.calendar.actions.openRental` | Otwórz wynajem | Open the rental |  | |
| 656 | `facilities.calendar.actions.task` | Otwórz zadanie | Open the task |  | |
| 657 | `facilities.calendar.availability.remove` | Usuń | Remove |  | |
| 658 | `facilities.calendar.empty.action` | Przejdź do stref | Go to zones |  | |
| 659 | `facilities.closures.actions.back` | Wróć do zamknięć | Back to closures |  | |
| 660 | `facilities.closures.actions.create` | Dodaj zamknięcie | Add closure |  | |
| 661 | `facilities.common.cancel` | Anuluj | Cancel |  | |
| 662 | `facilities.common.close` | Zamknij | Close |  | |
| 663 | `facilities.common.create` | Utwórz | Create |  | |
| 664 | `facilities.common.delete` | Usuń | Delete |  | |
| 665 | `facilities.common.edit` | Edytuj | Edit |  | |
| 666 | `facilities.common.save` | Zapisz | Save |  | |
| 667 | `facilities.email.banRequest.action` | Otwórz incydenty | Open incidents |  | |
| 668 | `facilities.email.maintenanceDue.action` | Otwórz konserwację | Open maintenance |  | |
| 669 | `facilities.email.rental.cancelAction` | Odwołaj rezerwację | Cancel the booking |  | |
| 670 | `facilities.email.request.action` | Otwórz kalendarz | Open the calendar |  | |
| 671 | `facilities.email.requestVerification.action` | Potwierdź zgłoszenie | Confirm the request |  | |
| 672 | `facilities.email.reschedule.action` | Otwórz dzień | Open the day |  | |
| 673 | `facilities.facility.close.action` | Zamknij obiekt | Close facility |  | |
| 674 | `facilities.facility.close.submit` | Zamknij obiekt | Close facility |  | |
| 675 | `facilities.facility.groups.save` | Zapisz | Save |  | |
| 676 | `facilities.facility.incident.action` | Zgłoś incydent | Report incident |  | |
| 677 | `facilities.facility.incident.submit` | Zgłoś incydent | Report incident |  | |
| 678 | `facilities.facility.noShow.action` | Nie stawił się | No-show |  | |
| 679 | `facilities.facility.noShow.confirm` | Zapisz: nie stawił się | Record no-show |  | |
| 680 | `facilities.facility.open.action` | Otwórz obiekt | Open facility |  | |
| 681 | `facilities.facility.open.submit` | Otwórz obiekt | Open facility |  | |
| 682 | `facilities.facility.rental.back` | Wróć do wynajmów | Back to rentals |  | |
| 683 | `facilities.maintenance.actions.cancel` | Anuluj zadanie | Cancel task |  | |
| 684 | `facilities.maintenance.actions.complete` | Oznacz jako wykonane | Mark done |  | |
| 685 | `facilities.maintenance.actions.plan` | Zaplanuj konserwację | Plan maintenance |  | |
| 686 | `facilities.maintenance.cancel.confirm` | Anuluj zadanie | Cancel the task |  | |
| 687 | `facilities.maintenance.complete.submit` | Oznacz jako wykonane | Mark done |  | |
| 688 | `facilities.maintenance.maintainers.actions.add` | Dodaj opiekuna | Add maintainer |  | |
| 689 | `facilities.maintenance.maintainers.actions.remove` | Usuń | Remove |  | |
| 690 | `facilities.maintenance.maintainers.add.submit` | Dodaj | Add |  | |
| 691 | `facilities.maintenance.maintainers.remove.confirm` | Usuń opiekuna | Remove the maintainer |  | |
| 692 | `facilities.maintenance.plan.submit` | Zaplanuj | Plan |  | |
| 693 | `facilities.places.back` | Wróć do obiektów | Back to facilities |  | |
| 694 | `facilities.places.cancel.action` | Odwołaj | Cancel |  | |
| 695 | `facilities.places.cancel.confirm` | Odwołaj rezerwację | Cancel the booking |  | |
| 696 | `facilities.places.list.add` | Dodaj obiekt | Add a facility |  | |
| 697 | `facilities.places.maintenance.actions.complete` | Wykonano | Done |  | |
| 698 | `facilities.places.maintenance.actions.day` | Dzień: {place} | Day of {place} |  | |
| 699 | `facilities.places.maintenance.actions.plan` | Zaplanuj | Plan |  | |
| 700 | `facilities.public.actions.retry` | Spróbuj ponownie | Try again |  | |
| 701 | `facilities.public.cancel.action` | Odwołaj rezerwację | Cancel the booking |  | |
| 702 | `facilities.public.places.back` | Wróć do: {club} | Back to {club} |  | |
| 703 | `facilities.public.request.cancel` | Anuluj | Cancel |  | |
| 704 | `facilities.public.request.close` | Zamknij | Close |  | |
| 705 | `facilities.public.request.submit` | Wyślij zgłoszenie | Send request |  | |
| 706 | `facilities.public.request.taken.back` | Wybierz inny termin | Choose another slot |  | |
| 707 | `facilities.rates.actions.back` | Wróć do cennika | Back to rates |  | |
| 708 | `facilities.rates.actions.create` | Dodaj stawkę | Add rate |  | |
| 709 | `facilities.records.bans.actions.create` | Wydaj zakaz | Issue ban |  | |
| 710 | `facilities.records.bans.actions.revoke` | Odwołaj | Revoke |  | |
| 711 | `facilities.records.bans.create.submit` | Wydaj zakaz | Issue the ban |  | |
| 712 | `facilities.records.bans.revoke.confirm` | Odwołaj zakaz | Revoke the ban |  | |
| 713 | `facilities.records.incidents.actions.issueBan` | Wydaj zakaz | Issue ban |  | |
| 714 | `facilities.records.incidents.actions.report` | Zgłoś incydent | Report incident |  | |
| 715 | `facilities.records.logs.actions.create` | Dodaj wpis | Add entry |  | |
| 716 | `facilities.records.logs.create.submit` | Dodaj wpis | Add entry |  | |
| 717 | `facilities.rentals.actions.back` | Wróć | Back |  | |
| 718 | `facilities.rentals.actions.cancel` | Anuluj wynajem | Cancel rental |  | |
| 719 | `facilities.rentals.actions.confirm` | Potwierdź | Confirm |  | |
| 720 | `facilities.rentals.actions.create` | Nowy wynajem | New rental |  | |
| 721 | `facilities.rentals.actions.move` | Przenieś | Move |  | |
| 722 | `facilities.rentals.actions.noShow` | Nie stawił się | No-show |  | |
| 723 | `facilities.rentals.cancel.confirm` | Anuluj wynajem | Cancel rental |  | |
| 724 | `facilities.rentals.columns.actions` | Akcje | Actions |  | |
| 725 | `facilities.rentals.list.cancel` | Odwołaj | Cancel |  | |
| 726 | `facilities.rentals.list.confirm` | Potwierdź wpłatę | Confirm payment |  | |
| 727 | `facilities.rentals.move.confirm` | Przenieś | Move |  | |
| 728 | `facilities.rentals.record.back` | Wróć do wynajmów | Back to rentals |  | |
| 729 | `facilities.rentals.record.save` | Zapisz zmiany | Save changes |  | |
| 730 | `facilities.requests.actions.approve` | Akceptuj | Approve |  | |
| 731 | `facilities.requests.actions.reject` | Odrzuć | Reject |  | |
| 732 | `facilities.requests.approve.confirm` | Akceptuj | Approve |  | |
| 733 | `facilities.requests.approve.mode.create` | Nowa instytucja | New institution |  | |
| 734 | `facilities.requests.reject.confirm` | Odrzuć | Reject |  | |
| 735 | `facilities.slot.submit` | Rezerwuj | Book |  | |
| 736 | `facilities.zones.actions.back` | Wróć do stref | Back to zones |  | |
| 737 | `facilities.zones.actions.create` | Dodaj regułę strefy | Add zone rule |  | |

## Addendum — new strings on `main` at `ee5ddb2a` (2026-11-26)

The table above was built at `5683e44c`. Later merges added strings of the same five kinds; they are listed here with the same selection rules, so one review covers everything that `main` shows today. The new `training` module (training outlines, #685) is now in `packages/app/vereino-modules.json` and is included. No Polish value already in the table above has changed since `5683e44c`, and none of its keys was removed.

Fill in **Change to** here the same way as above. **Since the sheet** says why the row is here. 54 rows to review: 1 in the member shell and 53 in the modules.

| Section | Rows |
|---|---|
| Member and public shell | 1 |
| foundation | 4 |
| club_core | 4 |
| people | 7 |
| activities | 4 |
| payments | 10 |
| training | 24 |
| **Total** | **54** |

Note for the reviewer: rows A48 and A49 (reporting a shared outline in the training library) use "zgłoś" / "zgłoszenie" for a content report, while glossary rule 4 keeps the noun "zgłoszenie" for outside booking requests only. Please confirm or reword them; `glossary:check` does not catch it, because "zgłoszenie" is not a retired term.

### Addendum — member and public shell

| # | Keys (all copies) | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| AS1 | `people.club.nav.outlines`<br>`groups.club.nav.outlines`<br>`activities.club.nav.outlines`<br>`communication.club.nav.outlines`<br>`payments.club.nav.outlines`<br>`facilities.places.nav.outlines`<br>`training.club.nav.outlines` | Konspekty treningów | Training outlines | member menu and bottom bar | new | |

The `training` module also holds copies of the member shell labels already in *Member and public shell* above, with the same Polish text. A change marked on one of those rows also applies to these copies, so they are not reviewed again:

| Row above | New copy | Polish (now) |
|---|---|---|
| 1 | `training.club.nav.acceptCash` | Przyjmij gotówkę |
| 2 | `training.club.nav.allWards` | Wszyscy |
| 3 | `training.club.nav.backend` | Panel administracyjny |
| 4 | `training.club.nav.calendar` | Kalendarz |
| 5 | `training.club.nav.clubEvents` | Imprezy klubowe |
| 6 | `training.club.nav.context` | Kontekst |
| 7 | `training.club.nav.contextCoach` | jako trener |
| 8 | `training.club.nav.contextCoachCoordinator` | jako trener / koordynator |
| 9 | `training.club.nav.contextMember` | jako członek / opiekun |
| 10 | `training.club.nav.facilities` | Obiekty |
| 11 | `training.club.nav.facilitiesMore` | Obiekty i rezerwacje |
| 12 | `training.club.nav.facilityToday` | Dziś na obiekcie |
| 13 | `training.club.nav.groupPayments` | Płatności moich grup |
| 14 | `training.club.nav.groups` | Grupy |
| 15 | `training.club.nav.label` | Strefa członka |
| 16 | `training.club.nav.me` | Ja |
| 17 | `training.club.nav.messages` | Wiadomości |
| 18 | `training.club.nav.more` | Więcej |
| 19 | `training.club.nav.myUnits` | Moje jednostki |
| 20 | `training.club.nav.orders` | Zamówienia (np. stroje) |
| 21 | `training.club.nav.payments` | Płatności |
| 22 | `training.club.nav.profile` | Profil |
| 23 | `training.club.nav.signOut` | Wyloguj |
| 24 | `training.club.nav.today` | Dziś |
| 25 | `training.club.nav.ward` | Pokazuję |

### Addendum — module `foundation`

#### Page titles

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A1 | `foundation.identity.deletion.title` | Prośba o usunięcie danych | Data deletion request | /identity/deletion | new | |
| A2 | `foundation.identity.title` | Połączone konta | Connected accounts |  | new | |

#### Buttons

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A3 | `foundation.identity.login.signInWith` | Zaloguj się przez {provider} | Sign in with {provider} |  | new | |
| A4 | `foundation.identity.retry` | Spróbuj ponownie | Try again |  | new | |

### Addendum — module `club_core`

#### Page titles

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A5 | `club_core.landing.title` | Vereino | Vereino |  | new | |

#### Buttons

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A6 | `club_core.landing.signIn` | Zaloguj się, aby zarządzać usługą | Sign in to manage the service |  | new | |
| A7 | `club_core.offboarding.banner.download` | Pobierz eksport | Download the export |  | new | |
| A8 | `club_core.offboarding.banner.retry` | Spróbuj ponownie | Try again |  | new | |

### Addendum — module `people`

#### Statuses

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A9 | `people.club.medical.state.expired` | Wygasło — było ważne do {date} | Expired — was valid until {date} |  | new | |
| A10 | `people.club.medical.state.expiring` | Ważne do {date} — zostało mniej niż miesiąc | Valid until {date} — under a month left |  | new | |
| A11 | `people.club.medical.state.missing` | Brak | Missing |  | new | |
| A12 | `people.club.medical.state.unknown` | Nieznane | Unknown |  | new | |
| A13 | `people.club.medical.state.valid` | Ważne do {date} | Valid until {date} |  | new | |

#### Buttons

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A14 | `people.club.medical.clear` | Usuń datę | Delete date |  | new | |
| A15 | `people.club.medical.save` | Zapisz datę | Save date |  | new | |

### Addendum — module `activities`

#### Menu

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A16 | `activities.reports.declarationShare.title` | Deklaracje w Vereino | Declarations in Vereino | /backend/activities/reports/declaration-share | new | |

#### Page titles

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A17 | `activities.club.pzpn.title` | Eksport do PZPN | PZPN exports | /club/reports/pzpn | new | |

#### Buttons

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A18 | `activities.occurrences.actions.reopen` | Otwórz ponownie | Reopen session |  | new | |
| A19 | `activities.occurrences.reopen.confirm` | Otwórz ponownie | Reopen session |  | new | |

### Addendum — module `payments`

#### Page titles

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A20 | `payments.cashHandovers.title` | Przekazania do potwierdzenia | Handovers to confirm | /club/cash-handovers | new | |

#### Statuses

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A21 | `payments.cashCustody.history.status.confirmed` | Potwierdzone | Confirmed |  | new | |
| A22 | `payments.cashCustody.history.status.pending` | Czeka na potwierdzenie | Waiting for confirmation |  | new | |
| A23 | `payments.cashCustody.history.status.rejected` | Odrzucone | Rejected |  | new | |
| A24 | `payments.cashCustody.history.status.settled` | Rozliczone bez przekazującego | Settled without the collector |  | new | |
| A25 | `payments.cashCustody.history.status.withdrawn` | Wycofane | Withdrawn |  | new | |
| A26 | `payments.coach.handover.status.pending` | Czeka na potwierdzenie | Waiting for confirmation |  | new | |

#### Buttons

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A27 | `payments.cashHandovers.confirm` | Potwierdź | Confirm |  | new | |
| A28 | `payments.cashHandovers.reject` | Odrzuć | Reject |  | new | |
| A29 | `payments.coach.handover.send` | Wyślij przekazanie | Send handover |  | new | |

### Addendum — module `training`

#### Page titles

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A30 | `training.club.title` | Klub | Club |  | new | |
| A31 | `training.editor.newTitle` | Nowy konspekt | New training outline | /club/training/outlines/new | new | |
| A32 | `training.editor.title` | Konspekt | Training outline | /club/training/outlines/[id] | new | |
| A33 | `training.library.entryTitle` | Udostępniony konspekt | Shared outline | /club/training/library/[entryId] | new | |
| A34 | `training.library.title` | Biblioteka konspektów | Outline library | /club/training/library | new | |
| A35 | `training.list.title` | Konspekty treningów | Training outlines | /club/training/outlines | new | |
| A36 | `training.print.pageTitle` | Konspekt — wydruk | Training outline — print | /club/training/outlines/[id]/print | new | |
| A37 | `training.public.pageTitle` | Konspekt treningu | Training outline | /library/o/[entryId] | new | |
| A38 | `training.publish.title` | Udostępnianie | Sharing |  | new | |
| A39 | `training.widget.title` | Konspekt | Outline |  | new | |

#### Buttons

| # | Key | Polish (now) | English (source) | Where | Since the sheet | Change to |
|---|---|---|---|---|---|---|
| A40 | `training.actions.pdf` | PDF | PDF |  | new | |
| A41 | `training.club.actions.retry` | Spróbuj ponownie | Try again |  | new | |
| A42 | `training.editor.back` | Wróć do konspektów | Back to outlines |  | new | |
| A43 | `training.editor.cancel` | Anuluj | Cancel |  | new | |
| A44 | `training.editor.delete` | Usuń | Delete |  | new | |
| A45 | `training.editor.save` | Zapisz | Save |  | new | |
| A46 | `training.library.back` | Wróć do biblioteki | Back to the library |  | new | |
| A47 | `training.library.report.cancel` | Anuluj | Cancel |  | new | |
| A48 | `training.library.report.open` | Zgłoś | Report |  | new | |
| A49 | `training.library.report.send` | Wyślij zgłoszenie | Send report |  | new | |
| A50 | `training.print.back` | Wróć do konspektu | Back to the outline |  | new | |
| A51 | `training.publish.open` | Otwórz w bibliotece | Open in the library |  | new | |
| A52 | `training.publish.submit` | Udostępnij | Share |  | new | |
| A53 | `training.widget.edit` | Edytuj | Edit |  | new | |

## Result

- [ ] Accepted as written
- [ ] Changes as marked in the **Change to** column

Reviewer: … · Date: …
