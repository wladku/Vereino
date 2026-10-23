---
type: benchmark
checked-on: 2026-10-23
author: Claude (agent), not yet re-checked by a human
question: Which existing products are realistic alternatives for a small multi-section sports club in Poland that also administers a municipal facility (Orlik), and how much of Vereino's 1.0 scope (items 1–10) does each one cover, at what price?
---

# [BENCHMARK] Competitor benchmark for Vereino

## How to read this file

- Every line marked **[BENCHMARK]** is a fact read on the vendor's own page (or help centre / repository) on **2026-10-23**, with the link next to it. A benchmark says what a reference product does; it says nothing about demand for Vereino.
- Lines marked **Assessment** are the agent's own judgement. They are not facts and have not been checked by a human.
- **no data** means the pages read did not say. It does not mean the product lacks the feature.
- Pages were read through an automated fetch tool that converts them to text. Tick marks in pricing tables (which plan includes which module) were sometimes lost in that conversion; where that happened the entry says so. Nothing was clicked through in a live account.
- Scope items used below (from the product owner's request):
  1. one person, many roles; one guardian account for all children across sections; limited own account for a child 13+;
  2. sections with coordinators; groups; recurring activities generating sessions; role-based calendars;
  3. attendance declaration and actual attendance; call-ups for matches and tournaments;
  4. coach substitutions with settlement (monthly base, deductions/additions, away trips);
  5. announcements to club / section / group / session with in-app notification and e-mail, plus a text to paste into Messenger/WhatsApp;
  6. membership fees: schedule, sibling discount, automatic charges, overdue list, online payment, cash taken by coaches with receipt numbers and handover to the treasurer, bank statement import with automatic matching;
  7. kit order campaigns: form with sizes, charges, handover, payment;
  8. sports facility: hour zones, rental rates, calendar with collisions, internal bookings, external rental requests approved by an administrator, public schedule without sign-in, report for the facility owner, attendant log, maintenance;
  9. public club page with sections, classes, prices, contact;
  10. Polish and English interface; web app.

## Solutions found (13 profiled)

| # | Solution | Kind | Country of the site read |
|---|---|---|---|
| 1 | ProTrainUp | club/academy platform | PL |
| 2 | SportBM | club/academy platform | PL |
| 3 | PlayTeam | club app | PL |
| 4 | SportsManago | club platform | PL |
| 5 | Vibeclass | club / classes platform, multi-section | PL |
| 6 | Pagaspot | fee billing and payment collection | PL |
| 7 | Spond | team and club app (free app + Spond Club) | NO (international site) |
| 8 | SportMember | team and club app | UK site of an international product |
| 9 | SportEasy | team and club app | FR (international site) |
| 10 | SOROS — OPTeam facility booking system | municipal facility booking | PL |
| 11 | Caldis | facility booking calendar | PL |
| 12 | Admidio | open-source membership management | DE project, international |
| 13 | LibreBooking | open-source resource booking | international project |

---

## 1. ProTrainUp

- **Links:** home https://protrainup.com/pl · pricing https://protrainup.com/pl/pricing · clubs and academies https://protrainup.com/en/for/clubs-academies · parent FAQ https://protrainup.com/en/faq/parents
- **Checked on:** 2026-10-23
- **Target segment (vendor):** [BENCHMARK] clubs and academies, plus individual coach licences on the same pricing page (https://protrainup.com/en/for/clubs-academies, https://protrainup.com/pl/pricing).

**Coverage of items 1–10**

| Item | Verdict | Reason and source |
|---|---|---|
| 1 | partly | [BENCHMARK] "one user can have several different roles simultaneously" (clubs page). A guardian with two children sees both children's trainings in the private calendar (parent FAQ). Guardian accounts are created by the club administrator or coach (parent FAQ). Children across sections and a limited account for a child 13+: no data. |
| 2 | partly | [BENCHMARK] mass messages to "selected groups of users"; "Training and Matches" listed (clubs page); "recurring trainings" listed in the paid coach licences (pricing). Sections with coordinators: plans differ by number of coordinators (pricing), but sections as a concept: no data. Role-based calendars: private calendar vs team calendar (parent FAQ). |
| 3 | partly | [BENCHMARK] a guardian uses "confirm attendance" on the event and can give a reason for an absence (parent FAQ). Coach-marked actual attendance and call-ups: no data on the pages read today. |
| 4 | partly | [BENCHMARK] "The module automatically counts coach working hours, calculates salaries, and generates pay slips" (clubs page); "trainer time records" from the Gold plan (pricing). Substitutions, deductions/additions, away trips: no data. |
| 5 | partly | [BENCHMARK] mass SMS/e-mail to selected groups, automatic messages, an announcement board (clubs page); "mass communication (SMS/e-mail)" from Gold (pricing). Section/session targeting and Messenger text: no data. |
| 6 | partly | [BENCHMARK] the system "automatically registers the payment, assigns it to the player"; arrears reminders (clubs page). Online payments for guardians via PayU, Przelewy24, Dotpay and Stripe; "bank statement parsing" from Gold; "contribution automation with online payments" from Club Pro (pricing). Sibling discount, cash taken by coaches with receipt numbers: no data. |
| 7 | partly | [BENCHMARK] "The warehouse module allows managing all club equipment and gear" (clubs page); warehouse from Gold, online store from Platinum (pricing). Size forms and order campaigns: no data. |
| 8 | partly | [BENCHMARK] "controlling the availability of pitches and training rooms", "The facility schedule is always up-to-date" (clubs page); "facilities and reservations" module from Club Pro (pricing). External rentals, public schedule, owner report, attendant log, maintenance: no data. |
| 9 | partly | [BENCHMARK] "an announcement board and a simple website" (clubs page); club website from Platinum (pricing). Sections, classes and prices on that site: no data. |
| 10 | partly | [BENCHMARK] browser version with a language switch by flag; mobile apps in App Store, Google Play and AppGallery (clubs page). Which interface languages: no data. |

- **Multi-section:** no data on sections. [BENCHMARK] one guardian with two children sees both in one calendar (parent FAQ); whether the children may be in different sections: no data.
- **Municipal facility:** [BENCHMARK] pitch/room availability only (clubs page). Public schedule, external rentals, owner report: no data.
- **Payments:** [BENCHMARK] PayU, Przelewy24, Dotpay, Stripe (pricing). Commission and who pays it: no data.
- **Pricing (PLN, monthly, gross, as on https://protrainup.com/pl/pricing):** [BENCHMARK]
  - Club Pro 125 zł (5 coaches and 100 players, 1 coordinator); Silver 245 zł (unlimited, 3 coordinators); Gold 495 zł (unlimited, unlimited coordinators); Platinum 899 zł (unlimited).
  - Add-on modules shown at 30 zł/m, 60 zł/m and 150 zł/m (150 zł/m for the parent-organisation module); the page does not clearly map each add-on price to a plan.
  - Coach licences: Coach Free 0 zł (1 team, 15 players), Coach Elite 13 zł (2 teams, 60 players), Coach Creator 19 zł (limits not stated), Coach Lider 30 zł (2 teams, 100 players).
  - ProTrainUp OneTeam + LiveTag.Pro 239 zł/month.
  - "Zaoszczędź do 10% dzięki rozliczeniu rocznemu"; 14-day demo account set up by sales; indefinite contract with a 2-month notice period.
  - The FAQ on the same page names the coach licences "Free, Elite, Leader and One Club", which does not match the price table (Free, Creator, Elite, Lider).
- **Model:** SaaS subscription. Where data is kept: no data.
- **Platforms:** [BENCHMARK] web, iOS, Android, Huawei AppGallery (clubs page).
- **Assessment — strengths for a small multi-section club:** the widest feature set among the Polish products found (roles, multi-child guardian view, fees with bank statement parsing, coach hours, facility availability, website); established vendor.
- **Assessment — weaknesses:** the parts closest to Vereino's scope (bank statement parsing, coach time, mass communication) start at Gold (495 zł/month); website at Platinum (899 zł/month); much of the platform is coaching tooling Vereino deliberately does not build; nothing found on municipal-facility workflows.
- **Confidence:** medium — pricing page and two feature pages read today; module-to-plan mapping comes from "od:" (from) tags on the pricing page; no hands-on use.

### Re-check of ProTrainUp against the 2026-09-30 benchmark

Compared with `2026-09-30-benchmark-protrainup.md`:

- **Unchanged:** Club Pro 125, Silver 245, Gold 495, Platinum 899 zł/month; coach licences 0 / 13 / 19 / 30 zł; OneTeam + LiveTag.Pro 239 zł; "up to 10%" cheaper annually; Club Pro limits (5 coaches, 100 players, 1 coordinator); Silver 3 coordinators.
- **New on the page today, or not recorded on 2026-09-30:**
  - trial: a 14-day demo account set up by sales (2026-09-30: "length — no data");
  - contract: indefinite, 2-month notice;
  - Dotpay listed as a payment provider in addition to PayU, Przelewy24 and Stripe;
  - modules with "from" plans: facilities and reservations (Club Pro), bank statement parsing (Gold), class sign-ups and parent organisation (Platinum), add-on prices 30 / 60 / 150 zł per month;
  - file-size limits per plan (20 / 30 / 50 / 50 MB).
- **Cannot tell:** whether these items are changes made by the vendor after 2026-09-30 or were already on the page and simply not recorded then. The 2026-09-30 note said ProTrainUp has "no management of a facility administered on behalf of a municipality" as an assumption; today's page lists a "facilities and reservations" module, but nothing about external rentals, a public schedule or an owner report.

---

## 2. SportBM

- **Links:** home https://sportbm.com/pl/ · pricing https://sportbm.com/pl/cennik/ · features https://sportbm.com/pl/funkcje/
- **Checked on:** 2026-10-23
- **Target segment (vendor):** [BENCHMARK] "system do zarządzania akademią lub klubem sportowym" — sports academies and clubs (home).

| Item | Verdict | Reason and source |
|---|---|---|
| 1 | no data | [BENCHMARK] coaches, athletes and guardians are named on the features page; document visibility can be limited ("decyduj kto ma je widzieć"). Family accounts and child accounts: no data. A search-engine snippet of SportBM's terms PDF (https://sportbm.com/files/regulamin-sportbm.pdf?version=19) mentions players who are 13 or older as users; the PDF could not be read in full, so this is **not verified**. |
| 2 | partly | [BENCHMARK] "bieżące zarządzanie zespołami, trenerami, zawodnikami oraz obiektami"; interactive calendar with automatic reminders (features). Sections, recurring sessions, role-based calendars: no data. |
| 3 | partly | [BENCHMARK] "usprawnij sprawdzanie obecności i weryfikację frekwencji" (home). Guardian declarations and call-ups: no data. |
| 4 | no data | [BENCHMARK] the calendar section mentions arranging substitutes and extra participants (features); whether this means coach substitutions or their settlement: no data. |
| 5 | partly | [BENCHMARK] messages to "dowolnie skonfigurowanej grupy odbiorców" by SMS, e-mail or system message, schedulable (features); unlimited e-mails and system messages (pricing). Messenger text: no data. |
| 6 | partly | [BENCHMARK] "ustaw płatności cykliczne dla wszystkich zawodników", permanent or one-time discounts, payments into different accounts, automatic reminders (features); "zautomatyzuj zbieranie składek członkowskich" (home). Sibling discount as such, cash with receipts, bank statement import: no data. |
| 7 | partly | [BENCHMARK] sell equipment and merchandise to athletes and guardians, invite trade partners, orders handled by distributors (features). Size forms and handover: no data. |
| 8 | partly | [BENCHMARK] facilities are among the managed objects; events with sign-ups and participant limits (features). Zones, rates, rentals, public schedule, owner report: no data. |
| 9 | partly | [BENCHMARK] "uzupełnij podstawowe dane, wybierz szablon i opublikuj w internecie" — club website with articles and live reports (features). Sections, classes and prices on it: no data. |
| 10 | partly | [BENCHMARK] web browser on computers and tablets, apps for Android, iOS and Huawei AppGallery (home); the marketing site has a 14-language switcher (features). Interface languages of the app: no data. |

- **Multi-section:** [BENCHMARK] the exercise designer covers "jednej z 12 dyscyplin" (features). Sections and one guardian across sections: no data.
- **Municipal facility:** no data beyond "obiekty" in the administration list.
- **Payments:** [BENCHMARK] market module 0 zł plus commission "zgodnie z cennikiem operatora" (pricing). Operator name, rate and who pays: no data.
- **Pricing (PLN, as on https://sportbm.com/pl/cennik/):** [BENCHMARK] 2.50 zł per registered player per month; monthly minimum 25 zł (includes 10 players); monthly maximum 600 zł (above 250 players); unlimited teams and coaches; training module 0 zł; market module 0 zł + operator commission; one free month with all modules, set-up support and staff training. Gross or net: not stated. [BENCHMARK] "bez umowy narzucającej opłaty i okres współpracy" (home).
- **Model:** SaaS. Where data is kept: no data.
- **Platforms:** web, iOS, Android, AppGallery (home).
- **Assessment — strengths:** per-player price with a cap is predictable for ~200 players (500 zł at 200 players); covers fees, messaging, equipment sales and a website in one product.
- **Assessment — weaknesses:** no evidence found on family accounts, call-ups, coach settlement, or facility rentals; football-academy positioning with coaching tools Vereino does not need.
- **Confidence:** medium — home, features and pricing pages read; terms PDF not readable.

---

## 3. PlayTeam

- **Links:** home https://playteam.pl · pricing https://playteam.pl/price · payments https://playteam.pl/platnosci · calendar and attendance https://playteam.pl/kalendarz-i-frekwencja · parent communication https://playteam.pl/komunikacja-z-rodzicami
- **Checked on:** 2026-10-23
- **Target segment (vendor):** [BENCHMARK] "Kluby i akademie różnych dyscyplin"; testimonials from football, rugby and kayaking/dragon-boat clubs (home). Vendor shown as SoftMade.

| Item | Verdict | Reason and source |
|---|---|---|
| 1 | no data | Family accounts and child accounts: not described on the pages read. |
| 2 | partly | [BENCHMARK] "Ustaw stałe dni i godziny treningów na cały sezon", events "cyklicznie lub jednorazowo" (calendar); chat "w ramach konkretnych roczników i grup treningowych" (communication). Sections and role-based calendars: no data. |
| 3 | partly | [BENCHMARK] coach takes attendance with statuses "obecny, nieobecny, usprawiedliwiony lub kontuzjowany" (calendar); "Cyfrowy dziennik trenera i powołania na mecze" (calendar, no detail). Advance declaration by guardians: not described on the calendar page. |
| 4 | no data | — |
| 5 | partly | [BENCHMARK] "Oficjalne Tablice Ogłoszeń" with read confirmation; push notifications; club chat (communication). The page contrasts the app with "gubiące się wiadomości e-mail"; an e-mail channel and Messenger text: no data. |
| 6 | partly | [BENCHMARK] billing plans "miesięczne, kwartalne, semestralne, roczne" for groups or persons; individual amount overrides the group rate; percentage or fixed discounts, example "Rodzeństwo -20%"; Tpay with BLIK, card or quick transfer, automatic status; reminders for event payments; financial summaries exported to PDF and CSV (payments). Cash and bank statement import: no data. |
| 7 | no data | — |
| 8 | no data | [BENCHMARK] pitch changes are shown in the schedule (calendar); facility management: no data. |
| 9 | no data | — |
| 10 | partly | [BENCHMARK] "Android (do pobrania z Google Play) oraz iOS (do pobrania z App Store)" (home). Web version and English: no data. |

- **Multi-section:** no data. One guardian with several children: no data.
- **Municipal facility:** no data.
- **Payments:** [BENCHMARK] Tpay; "Płatności online wymagają konfiguracji konta Tpay dla klubu" (payments). Commission and who pays it: no data.
- **Pricing (PLN, as on https://playteam.pl/price):** [BENCHMARK] one package with all features; "2 zł brutto miesięcznie za każdego aktywnego zawodnika"; minimum 20 zł, maximum 500 zł per month; above 250 athletes individual quote; annual 10% cheaper; first 30 days free without a card.
- **Model:** SaaS. Where data is kept: no data.
- **Platforms:** [BENCHMARK] iOS, Android; web: no data.
- **Assessment — strengths:** the only product found that shows a sibling discount example explicitly; low, simple per-player price; Polish payment operator.
- **Assessment — weaknesses:** mobile-first with no web version found (item 10 asks for a web app); no evidence on sections, family accounts, coach settlement or facilities.
- **Confidence:** medium — five vendor pages read; no hands-on use.

---

## 4. SportsManago

- **Links:** home https://sportsmanago.pl · pricing https://sportsmanago.pl/?p=cennik · features https://sportsmanago.pl/?p=mozliwosci
- **Checked on:** 2026-10-23
- **Target segment (vendor):** [BENCHMARK] team sports, multisport clubs, martial arts, gymnastics and dance, swimming, tennis, small clubs, large academies, activity organisers (home).

| Item | Verdict | Reason and source |
|---|---|---|
| 1 | partly | [BENCHMARK] manager, coach and parent roles; parent zone shows "Twój mały zawodnik" — one child (features). Multiple children and child accounts: no data. |
| 2 | partly | [BENCHMARK] online sign-ups go to "wybranej grupy"; parents see a class schedule (features). Sections and recurring sessions: no data. |
| 3 | partly | [BENCHMARK] coaches check attendance on a smartphone; "Wyślij powołania na zawody z systemu" with tracking of who confirmed (features). Guardian declarations: no data. |
| 4 | no data | — |
| 5 | partly | [BENCHMARK] "Wysyłaj wiadomości grupowe SMS / e-mail kilkoma kliknięciami zupełnie za darmo!" (home); SMS to the whole club or a selected group (features). Push and Messenger text: no data. |
| 6 | partly | [BENCHMARK] "Monitoruj składki, system sam wyśle powiadomienia do rodziców" (home); fee records, arrears tracking, revenue reports (features); "Księgowanie wpłat" and "Integracja KSeF" listed (pricing, features navigation). Online payment provider, sibling discount, cash receipts, bank import: no data. |
| 7 | no data | — |
| 8 | no data | — |
| 9 | no data | [BENCHMARK] online recruitment and sign-ups exist (features); a public club page: no data. |
| 10 | partly | [BENCHMARK] "Komputer, tablet, telefon"; apps on Google Play and App Store (home). English: no data. |

- **Multi-section:** [BENCHMARK] "Kluby multisportowe" as a target audience only (home). One guardian across sections: no data.
- **Municipal facility:** no data.
- **Payments:** no data on providers, commission or who pays.
- **Pricing (PLN, as on https://sportsmanago.pl/?p=cennik):** [BENCHMARK] free account: 1 manager, up to 5 coaches, no group limit, up to 100 athletes. STANDARD 150 zł/m-c, EXTENDED 250 zł/m-c, PRO 400 zł/m-c, PLATINUM 750 zł/m-c; "Podane ceny są cenami netto/miesiąc", plus 23% VAT; annual payment by individual offer. Per-plan limits (managers, coaches, groups, athletes, SMS) and per-plan feature ticks did not survive text extraction: no data.
- **Model:** SaaS. Where data is kept: no data.
- **Platforms:** web, iOS, Android (home).
- **Assessment — strengths:** free tier up to 100 athletes; call-ups with confirmations; free group SMS claimed.
- **Assessment — weaknesses:** no evidence on online payment collection, family accounts, facilities; plan contents unclear from the page.
- **Confidence:** medium for prices, low for which features sit in which plan.

---

## 5. Vibeclass

- **Links:** club page https://vibeclass.pl/program-do-zarzadzania-klubem-sportowym/ · pricing https://vibeclass.pl/cennik/ · calendar and bookings https://vibeclass.pl/kalendarz-i-rezerwacje/ · finance https://vibeclass.pl/rozliczenia-i-finanse/ · communication https://vibeclass.pl/wewnetrzna-komunikacja/
- **Checked on:** 2026-10-23
- **Target segment (vendor):** [BENCHMARK] clubs in many disciplines, including football academies, swimming schools, UKS/MKS clubs, chess sections; "Uczniowskie i miejskie kluby sportowe prowadzą kilka sekcji równolegle — pływanie, lekkoatletykę i piłkę pod jednym szyldem" (club page).

| Item | Verdict | Reason and source |
|---|---|---|
| 1 | partly | [BENCHMARK] "Rodzic ma własne konto w aplikacji mobilnej, gdzie widzi grafik treningów dziecka, frekwencję, historię składek"; "Dla właściciela, rodzica, instruktora" (club page). Several children on one account, across sections, and child accounts: no data. |
| 2 | partly | [BENCHMARK] "Każda sekcja ma własne grupy treningowe, trenerów i grafiki, ale zarządzasz całym klubem z jednego panelu" (club page); month/week/day/agenda views filtered by location, instructor and event type (calendar). Section coordinators as a role and recurring sessions generated from activities: no data (recurring is described for room bookings). |
| 3 | partly | [BENCHMARK] coach marks attendance in the mobile app; a sample notification "Adam Wala zgłosił nieobecność" (communication). Who may report absences, and call-ups: no data. |
| 4 | partly | [BENCHMARK] "Rozliczaj godziny pracy trenerów"; "rozliczanie godzin trenerów" (club page). Substitutions, deductions/additions, away trips: no data; the finance page does not describe coach pay. |
| 5 | partly | [BENCHMARK] group messages "do wybranych zajęć, do wszystkich rodzin albo do całego zespołu"; free push; "System wysyła też powiadomienia email jako fallback"; "zero SMS" (communication). Section-level targeting and Messenger text: no data. |
| 6 | partly | [BENCHMARK] price levels with "nazwa, kwota, częstotliwość" and six accrual modes per student or group; Stripe with card, BLIK, Przelewy24; cash listed as a payment method; "Podgląd zaległych faktur na żywo"; Fakturownia.pl invoicing (finance); each section has its own fee settlement (club page). Sibling discount, coach cash handover with receipt numbers, bank statement import: no data. |
| 7 | no data | — |
| 8 | partly | [BENCHMARK] room/court/hall bookings "lokalizacja, sala, data, godzina"; recurring weekly bookings; "System wykrywa kolizje automatycznie" (calendar); "sam wykrywa kolizje sal i trenerów" (club page). External rental requests, approval, public schedule, owner report, attendant log, maintenance: no data. |
| 9 | no data | [BENCHMARK] online enrolment form, QR code or app, 24/7 (club page). A public club page: no data. |
| 10 | partly | [BENCHMARK] web admin panel, participant panel, iOS and Android apps (club page). English interface: no data. |

- **Multi-section:** [BENCHMARK] yes at club level — separate schedules, fee settlement and board reports per section (club page). One guardian with children in different sections: no data.
- **Municipal facility:** internal room/court bookings with collision detection only; municipal workflows: no data.
- **Payments:** [BENCHMARK] Stripe (card, BLIK, Przelewy24); "Stripe ma standardową prowizję od transakcji"; the club chooses whether to pass the cost to the customer or absorb it (finance FAQ). Stripe's rate itself is not stated.
- **Pricing (PLN, net, as on https://vibeclass.pl/cennik/):** [BENCHMARK] Vibe Flow "49,00 zł netto/miesiąc" (marked promotional, limited time) shown next to "79,00 zł"; "79,00 zł stałej opłaty (do 20 użytkowników w pakiecie)", above 20 users an extra fee per additional active user (rate not shown in the text read); all features; "Płatność: BLIK, karta, przelew (P24)"; Vibe Scale for over 500 users: individual quote; +23% VAT; 14 days free after a presentation, no card; cancel any time.
- **Model:** SaaS. Where data is kept: no data.
- **Platforms:** [BENCHMARK] web, iOS (https://apps.apple.com/pl/app/vibe-class/id6756965514), Android (https://play.google.com/store/apps/details?id=com.classmanager.app).
- **Assessment — strengths:** the only club product found that states multi-section clubs with per-section schedules and fees as a core use case; covers coach hours, internal room booking with collisions, cash as a method, push + e-mail fallback, web + mobile.
- **Assessment — weaknesses:** per-user price above 20 users is not visible, so the cost for ~200 players plus guardians cannot be computed from the page; no evidence on sibling discount, bank statement import, external rentals, public page, kit orders; product maturity: no data.
- **Confidence:** medium — five vendor pages read; no hands-on use.

---

## 6. Pagaspot

- **Links:** home https://pagaspot.com · pricing https://pagaspot.com/cena · club payments guide (vendor blog) https://blog.pagaspot.com/automatyzacja-platnosci-w-klubie-sportowym-poradnik/
- **Checked on:** 2026-10-23
- **Target segment (vendor):** [BENCHMARK] schools, clubs, caterers, associations — organisations that bill payers (home); "ponad 170 organizacji i ponad 60 tys. płatników" (blog). This is a **billing tool, not a club-management product**.

| Item | Verdict | Reason and source |
|---|---|---|
| 1 | no data | [BENCHMARK] a parent view with current and paid dues (home). Multiple children: no data. |
| 2 | no data | [BENCHMARK] an "after-school classes" module exists on the price list without a feature description (pricing). |
| 3 | no data | — |
| 4 | no data | — |
| 5 | partly | [BENCHMARK] in-app individual and group messages; calendar of scheduled SMS, e-mails and push notifications (home). |
| 6 | partly | [BENCHMARK] one-time fees, monthly instalments, semester fees, season passes; "Zniżki, na przykład za drugie dziecko, nalicza system, a nie skarbnik z kalkulatorem"; fast transfer or BLIK through a gateway; "Tradycyjne przelewy rozlicza się, importując wyciąg bankowy i zatwierdzając podpowiedzi systemu"; cash payment recorded with a printable confirmation (blog). "Import … transakcji z wyciągów bankowych (pliki csv)" and automatic reminders in the basic plan (pricing). Coaches handing cash over to a treasurer: no data. |
| 7 | no data | — |
| 8 | no data | — |
| 9 | no data | — |
| 10 | partly | [BENCHMARK] "Aplikacja przeglądarowa, iOS i Android (dla klientów)" (pricing); an English site at /en (home). App interface languages: no data. |

- **Multi-section:** no data.
- **Municipal facility:** not in scope of the product.
- **Payments:** [BENCHMARK] payment gateway, fast transfer and BLIK; money reaches the club account the next day (blog). Gateway operator name, commission and who pays: no data.
- **Pricing (PLN, net, per payer per month, as on https://pagaspot.com/cena):** [BENCHMARK] basic plan 0,00 zł (0–30 payers), 1,26 zł (31–500 payers), 0,99 zł (501+ payers); meal module +0,81 zł; accounting documents +0,45 zł (not available for 0–30); after-school classes module +0,81 zł (not available for 0–30); +23% VAT; annual billing 10% cheaper.
- **Model:** SaaS. Where data is kept: no data.
- **Platforms:** web, iOS, Android.
- **Assessment — strengths:** covers more of item 6 than any club app found (sibling discount, bank statement CSV import with suggested matching, cash confirmations).
- **Assessment — weaknesses:** billing only; a club would still need another tool for groups, attendance, calendar and facility.
- **Confidence:** medium — the strongest fee claims come from the vendor's blog guide, not from a product page.

---

## 7. Spond

- **Links:** home https://www.spond.com/ · Spond Club overview https://www.spond.com/spond-club-overview/ · about the app https://help.spond.com/app/en/articles/121230-about-the-spond-app · about Spond Club https://help.spond.com/club/en/articles/185666-about-spond-club · transaction fees https://help.spond.com/club/en/articles/58192-what-is-the-transaction-fee-in-spond-club · instalments https://help.spond.com/club/en/articles/45292-payment-requests-in-spond-club-instalments-and-flexible-payments · payment methods https://help.spond.com/app/en/articles/113372-payment-and-payment-method
- **Checked on:** 2026-10-23
- **Target segment (vendor):** [BENCHMARK] group admins and coaches, club admins, guardians and parents, organisations and schools (home); "A free app trusted by over 12 million people" (home).
- **Availability in Poland:** [BENCHMARK] the mobile app is available in Poland (about the app). **Spond Club** new registrations are available only in Norway, the United Kingdom, the USA, Canada and Ireland; existing accounts are also supported in Australia, Belgium, France, the Netherlands, Switzerland, Germany and Austria (about Spond Club). Poland is in neither list.

| Item | Verdict | Reason and source |
|---|---|---|
| 1 | partly | [BENCHMARK] "Add Guardians" feature (home). One guardian for several children, across sections, and child accounts: no data on the pages read. |
| 2 | partly | [BENCHMARK] single, repeating and season-planner events; group setup; "Manage members & groups" in Spond Club (home). Sections: no data. |
| 3 | partly | [BENCHMARK] invites and reminders, availability requests, events with a maximum and a waiting list (home). Coach-recorded actual attendance and call-ups: no data. |
| 4 | no data | — |
| 5 | partly | [BENCHMARK] integrated messaging, notifications (home). E-mail channel and Messenger text: no data. |
| 6 | partly | [BENCHMARK] collect payments for membership fees, trips, uniforms (home); instalments up to 12 (instalments article). PLN is not in the fee table; sibling discount, cash, bank import: no data. |
| 7 | partly | [BENCHMARK] payments can be collected for uniforms (home). Size forms and handover: no data. |
| 8 | no data | — |
| 9 | partly | [BENCHMARK] club website in Spond Club (about Spond Club). Content options and price: no data on the pages read. |
| 10 | partly | [BENCHMARK] web app plus iOS 16+ and Android 7.0+ (about the app). Site languages: English, Norwegian, German, French, Spanish (home switcher); Polish interface: no data. |

- **Multi-section:** no data.
- **Municipal facility:** no data.
- **Payments:** [BENCHMARK] cards, Apple Pay, Google Pay, Link in all countries; local methods only in NO/NL/IE/BE (payment methods). Fees: EUR standard 2.5% + €0.20; GBP 2.5% + £0.20; temporary October 2026 rate 1.25% + €0.10 in BE/FR/DE/NL; no PLN row. "By default, the transaction fee is covered by the club"; the club can pass it to members (transaction fees).
- **Pricing:** [BENCHMARK] "The Spond app is free to download" (about the app). Spond Club price: no data on the pages read.
- **Model:** SaaS. Where data is kept: no data.
- **Platforms:** web, iOS, Android.
- **Assessment — strengths:** free core app, large user base, recurring events and RSVP, guardian support.
- **Assessment — weaknesses:** Spond Club (membership register, fees, website) cannot be newly registered from Poland per the vendor's help centre; no PLN in the fee table; Polish interface not confirmed.
- **Confidence:** medium — help-centre articles are explicit; marketing pages are general.

---

## 8. SportMember

- **Links:** team app https://www.sportmember.co.uk/en/team-app · pricing ("What does it cost?") https://sportmember.co.uk/public_pages/643 · membership fees https://www.sportmember.co.uk/en/membership-fee · parent FAQ https://sportmember.de/en/faq/member-parent/profile-settings/how-do-i-attach-a-profile-to-another-profile
- **Checked on:** 2026-10-23
- **Target segment (vendor):** [BENCHMARK] clubs and teams; "Manage your entire club in one app" (team app).

| Item | Verdict | Reason and source |
|---|---|---|
| 1 | partly | [BENCHMARK] "Associate an unlimited number of children to your parent profile" and switch between them (parent FAQ). Children in different teams/sections from one profile: not stated. Child accounts with limited rights: no data. |
| 2 | partly | [BENCHMARK] create club and teams; shared calendar syncing with Google, Apple or Outlook (team app). Sections and recurring activities: no data. |
| 3 | partly | [BENCHMARK] players and parents "sign up or decline directly in the app and get automatic reminders"; statistics of attendees, no-shows and no-reply (team app). Call-ups: no data. |
| 4 | no data | — |
| 5 | partly | [BENCHMARK] team chat, club news feed, "Email or notify the whole team in one tap", push (team app). Section targeting and Messenger text: no data. |
| 6 | partly | [BENCHMARK] fee schedule "monthly, quarterly or annual"; sample breakdown with a "Family discount" line; Stripe card and Apple Pay; optional automatic suspension of unpaid members from training and matches; receipts in the member profile (membership fees). Cash and bank import: no data. |
| 7 | no data | — |
| 8 | no data | [BENCHMARK] a screenshot caption mentions "booking" without description (team app). |
| 9 | partly | [BENCHMARK] CMS/Premium Website add-on (pricing). |
| 10 | partly | [BENCHMARK] iOS and Android; "every feature is also available on the web" (team app). UK site shows English only; Polish interface and availability in Poland: no data. |

- **Multi-section:** no data.
- **Municipal facility:** no data.
- **Payments:** [BENCHMARK] Stripe; admin fee "£0.35 + 1.0%" per payment; the club chooses whether the member or the club pays it (pricing).
- **Pricing (GBP, as on https://sportmember.co.uk/public_pages/643):** [BENCHMARK] Basic £0 per member/month; PRO £0.16 per member/month plus payment fee, minimum £22.00/month excl. VAT and admin fee (example: 250 members = £40.00/month); CMS/Premium Website £25/month excl. VAT; Widgets £10/month excl. VAT. The team-app FAQ says the product is "completely free to use, with no hidden costs and no feature restrictions", which conflicts with the PRO price list.
- **Model:** SaaS. Where data is kept: no data.
- **Platforms:** web, iOS, Android.
- **Assessment — strengths:** explicit multi-child parent profile; RSVP with no-show statistics; club chooses who pays the payment fee.
- **Assessment — weaknesses:** only UK pages were read; Polish language and payouts in PLN not confirmed.
- **Confidence:** medium-low for a Polish club (no Polish source found).

---

## 9. SportEasy

- **Links:** clubs https://www.sporteasy.net/en/clubs/ · plans https://www.sporteasy.net/en/clubs/plans/ · payments and fees https://www.sporteasy.net/en/clubs/features/payments-and-fees/
- **Checked on:** 2026-10-23
- **Target segment (vendor):** amateur sports clubs — the clubs page is titled "Manage your amateur sports club more efficiently" in search results; that page itself was not read. [BENCHMARK] the plans and payments pages describe a "SportEasy Club" offer with multi-team management (plans, payments).

| Item | Verdict | Reason and source |
|---|---|---|
| 1 | no data | — |
| 2 | partly | [BENCHMARK] multi-team management, club calendar, club roster (plans). Sections, recurring sessions: no data. |
| 3 | partly | [BENCHMARK] team features include schedules, lineups, statistics and attendance records (plans). Guardian declarations: no data. |
| 4 | no data | — |
| 5 | partly | [BENCHMARK] newsletters for all members; "Dedicated threads by team, role within the club, or for specific members" (plans). Messenger text: no data. |
| 6 | partly | [BENCHMARK] fee collection; "single or flexible rate, depending on the different age groups"; instalments; discount coupons; Stripe (payments). Sibling discount, cash, bank import: no data. |
| 7 | partly | [BENCHMARK] products including equipment orders; forms collecting "jersey and shorts sizes"; add-on items such as a jersey alongside a membership fee (payments). Handover tracking: no data. |
| 8 | no data | — |
| 9 | no data | — |
| 10 | partly | [BENCHMARK] site languages: English, French, Spanish, German, Italian, Portuguese, Dutch — Polish is not offered on the site (plans). App interface languages and platforms: no data on the pages read. |

- **Multi-section:** no data (multi-team only).
- **Municipal facility:** no data.
- **Payments:** [BENCHMARK] Stripe (payments). Commission and who pays: no data.
- **Pricing (EUR, as on https://www.sporteasy.net/en/clubs/plans/):** [BENCHMARK] Classic "0.45€ per member per month or 5.40€ per member per year" and "0.33€ per member per month or 3.96€ per member per year" (the page does not label which price belongs to monthly or yearly billing); Sponsors "0.48€ per member per month or 5.76€ per member per year", "Offer unavailable monthly"; unlimited members; one-month free trial.
- **Model:** SaaS. Where data is kept: no data.
- **Platforms:** no data on the pages read.
- **Assessment — strengths:** the clearest kit-order-with-sizes flow among the products found; low per-member price.
- **Assessment — weaknesses:** no Polish on the site; team-sports orientation; nothing on facilities.
- **Confidence:** medium-low.

---

## 10. SOROS — OPTeam sports facility booking system

- **Links:** product page https://opteam.pl/rozwiazania-it/platformy-i-aplikacje-web/system-obslugi-rejestracji-obiektow-sportowych · Web360 listing (not read) https://web360.opteam.pl/poznaj-web360/portale-dziedzinowe/system-obslugi-rezerwacji-obiektow-sportowych
- **Checked on:** 2026-10-23
- **Target segment (vendor):** [BENCHMARK] public administration (city offices, education and sports departments), schools and OSiR sports centres managing halls, pitches, courts and Orliki; residents and local clubs as bookers (product page). **Different segment:** the buyer is a municipality, not a club. The name "SOROS" appears only in image file names; the page calls it "System Obsługi Rejestracji Obiektów Sportowych".

| Item | Verdict | Reason and source |
|---|---|---|
| 1–7 | no data | The product page does not describe club membership, groups, attendance, coaches, fees or kit. |
| 8 | partly | [BENCHMARK] per-facility availability calendars, "Szybka rezerwacja i zawsze aktualny grafik"; one-time booking "Nie wymaga konta", recurring booking "Wymaga założenia konta"; online payment; "Możliwość konfiguracji cenników – np. ze względu na pory dnia i roku"; occupancy statistics; "Automatyczne raportowanie do organu nadzorującego" (product page). Approval of requests, collision handling, attendant log, maintenance: no data. |
| 9 | partly | [BENCHMARK] a "Drużyn Sportowych" module lists local clubs filterable by category (product page). A club's own page with sections and prices: no data. |
| 10 | partly | [BENCHMARK] web on "komputer, tablet lub telefon" (product page). English: no data. |

- **Multi-section:** not applicable.
- **Municipal facility:** [BENCHMARK] public schedule, booking without an account for one-off slots, reporting to the supervising body (product page). Reference: a portal for Urząd Miasta Rzeszowa aggregating the city's sports-centre sites (vendor case study mentioned on the page; the case-study page itself was not read).
- **Payments:** online transfer; provider, commission and payer: no data.
- **Pricing:** not published.
- **Model:** no data (SaaS or on-premise not stated).
- **Platforms:** web.
- **Assessment — strengths:** the only product found whose page names reporting to the facility owner and a public schedule without sign-in.
- **Assessment — weaknesses:** sold to municipalities, not to clubs; no club features; price unknown.
- **Confidence:** low-medium — one vendor page.

Related observation [BENCHMARK]: the city of Olsztyn runs a public booking portal https://obiekty.olsztyn.eu/?page=1 (footer: Urząd Miasta Olsztyna and CIUWO; software vendor not named). It shows four steps (choose facility, date and time, form, payment), online payment or bank transfer depending on the owner's setting, and lists an Orlik basketball/volleyball court "from 40 zł per 60 minutes".

---

## 11. Caldis

- **Links:** sports facilities https://caldis.pl/system-rezerwacji-dla-obiektow-sportowych · pricing https://caldis.pl/cennik
- **Checked on:** 2026-10-23
- **Target segment (vendor):** [BENCHMARK] sports facilities ("System rezerwacji dla obiektów sportowych"); "Twój prosty kalendarz internetowy!" (sports page). **Different segment:** facility operators, not clubs.

| Item | Verdict | Reason and source |
|---|---|---|
| 1–7 | no data | [BENCHMARK] a passes module ("moduł karnetów") and SMS/e-mail notifications to customers are listed (pricing, sports page); club membership features: no data. |
| 8 | partly | [BENCHMARK] day, week, mobile and list calendar views; "cenniki sezonowe (automatyczne przeliczanie cen)"; client portal for online booking at any time; website booking widget; statistics and reports; invoices and receipts; automatic contracts and protocols (sports page, pricing). Collision handling, approval, public schedule without sign-in, owner report, attendant log, maintenance: no data. |
| 9 | no data | — |
| 10 | partly | [BENCHMARK] web access and mobile apps "dla Ciebie, zespołu i klienta" (sports page). English: no data. |

- **Multi-section / municipal facility:** no data beyond the booking features above.
- **Payments:** [BENCHMARK] BLIK and Przelewy24 (sports page). Commission and payer: no data.
- **Pricing (PLN, net, as on https://caldis.pl/cennik):** [BENCHMARK] Standardowy 39.00 zł/mc (annual) or 49.00 zł/mc (monthly), up to 20 calendars, up to 15 users; Premium 49.00 / 59.00 zł/mc, up to 50 calendars, 25 users; Solo 49.00 / 59.00 zł/mc, 1 calendar, 1 user; Premium Plus 89.00 / 99.00 zł/mc, up to 50 calendars, 25 users. Add-ons: SMS 0,08 zł net each; online booking widget 99 zł net/month; each additional location 39 zł net/month; storage 3 zł per GB per month. 14-day trial. Per-plan feature ticks did not survive text extraction.
- **Model:** SaaS. Where data is kept: no data.
- **Platforms:** web, mobile apps.
- **Assessment — strengths:** cheap, Polish, external customers can book online and pay by BLIK/P24.
- **Assessment — weaknesses:** a booking calendar only; no club side; nothing found on approval or owner reports.
- **Confidence:** medium for prices, low for features per plan.

---

## 12. Admidio (open source)

- **Links:** home https://www.admidio.org/ · repository https://github.com/Admidio/admidio · demo https://www.admidio.org/demo · documentation https://www.admidio.org/dokuwiki/doku.php?id=en:2.0:index
- **Checked on:** 2026-10-23
- **Target segment (project):** [BENCHMARK] clubs and organisations in general; free, self-hosted membership management (home). **Not sport-specific.**

| Item | Verdict | Reason and source |
|---|---|---|
| 1 | partly | [BENCHMARK] "Flexible Roles and Groups"; "Relationship Management" linking members such as parent and child (repository README). Child accounts with limited rights: no data. |
| 2 | partly | [BENCHMARK] groups, roles and memberships mirror the organisation; events with schedules, registrations, participants and rooms (home). Recurring sessions: no data. |
| 3 | partly | [BENCHMARK] "publish events online and let members sign up" (README). Actual attendance and call-ups: no data. |
| 4 | no data | — |
| 5 | partly | [BENCHMARK] HTML e-mails to users, roles and groups (README); messages and e-mails to contacts, groups or roles (home). Push: no data. |
| 6 | no data | The home page does not mention fees or payments. |
| 7 | no data | — |
| 8 | no data | Events can reference rooms (home); booking and rental: no data. |
| 9 | no data | — |
| 10 | partly | [BENCHMARK] 22 languages including Polish and English; Progressive Web App on Android, iOS, Windows, macOS (README). |

- **Multi-section:** [BENCHMARK] role/group model (home); a guardian linked to several children across groups: plausible from the relationship feature but not stated → no data.
- **Municipal facility:** no data.
- **Payments:** no data.
- **Pricing:** [BENCHMARK] "No license fees" (home); licence GPL-2.0 (repository).
- **Model:** [BENCHMARK] open source, self-hosted on the club's own web server — data stays with whoever hosts it (home). Requirements: PHP 8.2+, MariaDB 10+/MySQL 5.0+/PostgreSQL 11+ (README). Latest release named on the home page: 5.0.17, dated 11.10.2026.
- **Platforms:** web + PWA.
- **Assessment — strengths:** free, Polish UI, data kept by the club, parent–child links.
- **Assessment — weaknesses:** no fees, attendance or facility features found; needs someone to host and maintain a PHP server.
- **Confidence:** medium.

---

## 13. LibreBooking (open source)

- **Links:** repository https://github.com/LibreBooking/librebooking · administration docs https://librebooking.readthedocs.io/en/latest/ADMINISTRATION.html · configuration docs https://librebooking.readthedocs.io/en/stable/_sources/BASIC-CONFIGURATION.rst.txt
- **Checked on:** 2026-10-23
- **Target segment (project):** [BENCHMARK] "an open-source resource scheduling solution" for rooms and equipment; a fork of Booked Scheduler (repository). **Different segment:** generic resource booking, not sport.

| Item | Verdict | Reason and source |
|---|---|---|
| 1–7 | no data | Not a club product. |
| 8 | partly | [BENCHMARK] multi-resource booking, waitlists, role-based access, quotas and credits, "Granular usage reporting" (repository); "Resources can be set to require approval before a reservation is confirmed"; administrators approve pending reservations; blackout times; reservation reports (administration docs); "By default only logged in users can view schedules, but this can be changed with some configuration updates" — unauthenticated users can then browse schedules but must log in to book (administration docs); `privacy.allow.guest.reservations` option (configuration docs). Hour zones with rates, owner report format, attendant log, maintenance: no data. |
| 9 | no data | — |
| 10 | partly | [BENCHMARK] `default.language` and `enabled.languages` settings (configuration docs). Whether Polish is among the languages: no data. Web (responsive Bootstrap 5, repository). |

- **Municipal facility:** [BENCHMARK] public schedule view and administrator approval are configurable (see item 8).
- **Payments:** no data (credits/quotas only).
- **Pricing:** free; [BENCHMARK] licence GPL-3.0 (repository).
- **Model:** [BENCHMARK] self-hosted: PHP 8.2+, Apache 2.4+, MySQL 8.0+ or MariaDB 10.6+ (repository); the repository warns that versions before 7.1.0 have a critical vulnerability.
- **Platforms:** web.
- **Assessment — strengths:** free, data with the host, approval workflow and public schedule — the facility pieces club apps lack.
- **Assessment — weaknesses:** no club features, no rates by hour zone found, needs self-hosting; would run beside a club app, not instead of one.
- **Confidence:** medium.

---

## Other products seen but not profiled

- **eAktywni** https://eaktywni.pl/ — [BENCHMARK] ticketing and booking for sports and recreation facilities (pools, courts, fitness); Ekonomiczny 499 zł per month + 4% net of sales, Standard 659 per month + 3.5% net (reservations and customer accounts only in Standard); payments by TT Pay Sp. z o.o. Not profiled: a ticketing system for facility operators, not a club tool.
- **Skedda**, **GYM System**, **Asysto**, **Klubaro**, **Stadiops** — appeared in search results; their own pages were not read, so nothing is recorded about them here.

## General tools clubs use instead

Assessment, not benchmarked: the alternative a small club actually runs today is a mix of free general tools — Messenger or WhatsApp groups per team for schedules and attendance, Google Forms or paper for sign-ups and kit sizes, Excel or Google Sheets for the fee list and the bank-transfer check, and phone calls for facility bookings. This is what the club's own discovery notes record for the pilot club ("schedule and attendance via Messenger groups, membership fees tracked manually, coach substitutions arranged by phone, Orlik bookings by phoning the club", `2026-10-20-business-case.md`, a [DOCUMENT] of the founders' knowledge, not an interview), and the Orlik regulations found in search describe bookings by phone or with the facility animator. These tools cost nothing and parents already use them; none of them links attendance, fees and the facility calendar.

## Summary matrix (items 1–10)

Legend: **Y** yes · **P** partly · **N** no · **–** no data. Every cell is backed by the entry above. No cell is "Y": no product showed every sub-requirement of an item.

| Solution | 1 roles/family | 2 sections/groups | 3 attendance/call-ups | 4 coach settlement | 5 announcements | 6 fees | 7 kit orders | 8 facility | 9 public page | 10 PL/EN web |
|---|---|---|---|---|---|---|---|---|---|---|
| ProTrainUp | P | P | P | P | P | P | P | P | P | P |
| SportBM | – | P | P | – | P | P | P | P | P | P |
| PlayTeam | – | P | P | – | P | P | – | – | – | P |
| SportsManago | P | P | P | – | P | P | – | – | – | P |
| Vibeclass | P | P | P | P | P | P | – | P | – | P |
| Pagaspot | – | – | – | – | P | P | – | – | – | P |
| Spond | P | P | P | – | P | P | P | – | P | P |
| SportMember | P | P | P | – | P | P | – | – | P | P |
| SportEasy | – | P | P | – | P | P | P | – | – | P |
| SOROS (OPTeam) | – | – | – | – | – | – | – | P | P | P |
| Caldis | – | – | – | – | – | – | – | P | – | P |
| Admidio | P | P | P | – | P | – | – | – | – | P |
| LibreBooking | – | – | – | – | – | – | – | P | – | P |

## The three solutions closest to Vereino's scope (assessment)

1. **ProTrainUp** — "partly" on all ten items: roles, multi-child guardian calendar, guardian attendance confirmation, coach hours and pay slips, group SMS/e-mail, fees with online payment and bank statement parsing, warehouse/shop, facility availability, website, web + mobile. Distance from Vereino: the relevant modules sit in the 495–899 zł/month plans, the product is built around coaching tools Vereino excludes, and nothing was found on municipal-facility workflows.
2. **Vibeclass** — the only club product that states multi-section clubs (swimming, athletics, football under one roof) as a core case, with per-section schedules and fee settlement, coach-hour settlement, internal room/court bookings with collision detection, cash as a payment method, push with e-mail fallback, web + mobile. Distance: no evidence on sibling discount, bank statement import, kit orders, a public page or external rentals; the price for a club of ~200 players cannot be computed from the page.
3. **SportBM** — "partly" on eight items: teams and facilities in one administration, attendance, SMS/e-mail/system messages to any group, recurring fees with discounts and reminders, equipment sales to guardians, club website, web + mobile; per-player price capped at 600 zł/month. Distance: nothing found on family accounts, coach settlement, call-ups or facility rentals.

Honourable mentions: **Pagaspot** covers the most of item 6 alone (sibling discount, bank CSV import with suggested matching, cash confirmations) but nothing else; **SOROS** and **LibreBooking** cover the municipal-facility side (public schedule, approval or owner reporting) but no club side.

## Gaps no solution covers (assessment)

- **Club management and municipal facility administration in one product.** No club app found describes external rental requests with administrator approval, a public schedule without sign-in, or a report for the facility owner; the products that do (SOROS, LibreBooking) have no club side. Assessment.
- **Coach substitution settlement** (monthly base with deductions and additions for substitutions and away trips). ProTrainUp and Vibeclass settle coach hours; no product describes substitutions. Assessment.
- **Cash taken by coaches with receipt numbers and handover to the treasurer.** Vibeclass lists cash as a method and Pagaspot prints a cash confirmation; no product describes a coach-to-treasurer handover. Assessment.
- **A text with a link to paste into a Messenger/WhatsApp group.** Not found anywhere; vendors position their apps as replacements for those groups (Vibeclass, PlayTeam). Assessment.
- **One guardian account for children in different sections.** ProTrainUp and SportMember show several children per guardian; none states it across sections. Assessment.
- **Limited own account for a child 13+.** Only an unverified search snippet of SportBM's terms; nothing confirmed. Assessment.
- **Facility attendant log and maintenance work.** Not found in any product. Assessment.
- **Kit order campaign end-to-end (sizes → charges → handover → payment).** SportEasy collects sizes and payment; handover not found anywhere. Assessment.
- **Open-source option for the club side.** Admidio is open source and in Polish but has no fees, attendance or facility; no open-source sports-club product was found. Assessment.

## Questions to check by hand

1. ProTrainUp: buy or request the 14-day demo; check whether the "facilities and reservations" module supports external renters, a public schedule, approval, and an owner report; whether the Club Pro plan already includes fee automation with online payments; payment commission and who pays it.
2. ProTrainUp: confirm whether the new pricing-page items (Dotpay, bank statement parsing, facilities module, 14-day demo) are changes since 2026-09-30 or were already there.
3. SportBM: read the terms PDF (https://sportbm.com/files/regulamin-sportbm.pdf?version=19) — do players 13+ get own accounts, and with what rights; can one guardian hold several players; who is the payment operator and what is its commission.
4. Vibeclass: the price per active user above 20 users; total monthly cost for ~200 players with guardians; does one parent account cover several children in different sections; sibling discount; bank statement import.
5. PlayTeam: is there a web version; can parents declare attendance in advance; Tpay commission and who pays it.
6. SportsManago: which features and limits belong to which plan; online payment provider.
7. Pagaspot: name of the payment gateway and its commission; whether it can import statements from the bank the club uses.
8. Spond: can a Polish club collect payments in PLN with the free app; is the app available in Polish.
9. SportMember and SportEasy: availability in Poland, Polish interface, PLN payouts.
10. SOROS: price, hosting model, whether a club (not a municipality) can buy it, whether it handles request approval and collisions; read the Rzeszów case study.
11. LibreBooking: is Polish among the bundled languages; can rates differ by hour zone.
12. For all: where customer data is hosted (none of the pages read said).
