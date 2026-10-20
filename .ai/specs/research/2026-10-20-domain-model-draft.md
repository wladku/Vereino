# Vereino — Domain Model Draft (INPUT for om-spec-writing, not a spec)

> Status: discovery output. This file is NOT in SPEC-000 format. The real spec is authored from it via `om-spec-writing` as `.ai/specs/2026-10-20-vereino-club-management.md`. Module references in "Reuse" below come from the Open Mercato monorepo and must be re-checked against this app's `.ai/guides/module-facts.json`.

**Status:** Draft v0.3 (discovery complete, pre-implementation) · **Owner:** Władek Kuć · **Tech:** Kacper Kuć
**Language note:** domain content is in Polish (the product's first market); entity and code names are English.

## Overview

Vereino is an open-source club management system built on Open Mercato, targeted at small football academies (up to ~200 players), typically suburban clubs playing on municipality-owned facilities. One Open Mercato tenant = one club. Pilot: KS Gwiazda Ściejowice, which also administers the "Orlik 2024" facility on behalf of Gmina Liszki.

Research inputs (business case, stakeholders, benchmark, decisions D-001…D-012, interview scripts) live in [`README.md`](README.md) (this folder). The visual system map is [`assets/vereino-system-map.html`](assets/vereino-system-map.html) (in this research folder).

## Problem Statement

Small academies run schedules, attendance, coach substitutions, fees and facility bookings across Messenger groups, Excel and phone calls. Existing SaaS (ProTrainUp, 125–245 PLN/month) covers the calendar/attendance/fees core but not municipality-facility administration, multi-section clubs or data ownership; it is also heavier than a small academy needs. See `research/2026-09-30-benchmark-protrainup.md`.

## Proposed Solution

Seven Open Mercato modules — `club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities` — with role-filtered calendars, a public (unauthenticated) facility schedule, online fee payment and a coach-settlement report derived from occurrence data. Scope decided by MoSCoW (`research/2026-10-20-moscow.md`). Reuse of existing Open Mercato modules is expected where they fit: `messages` (SPEC-002) and `notifications` (SPEC-003) for the `communication` module, `attachments` for documents, dashboard widgets (SPEC-011) for the coordinator/treasurer views — to be verified against each module's spec before implementation.

---

## 1. Cel

System do zarządzania klubem sportowym (pilot: LKS Gwiazda), zbudowany na Open Mercato. Jedna platforma dla: uczestników (zawodników / osób na zajęciach), opiekunów prawnych, trenerów, koordynatorów sekcji, administratora klubu i administratora technicznego. Docelowo wiele klubów i dyscyplin.

## 2. Decyzje podjęte

1. **Zakres MVP** = rdzeń kalendarzowy + płatności. Projekty, sklep, umowy, wynajem — moduły zarezerwowane, poza MVP.
2. **Aktywność** to jeden byt z polem `type` (training / match / sparring / camp / other). Cykliczność = atrybut (RRULE), nie osobna klasa. Nie ma osobnych „zajęć” i „wydarzeń”.
3. **Grupa** to jeden byt z polem `kind` (team / class_group). Drużyna piłkarska i grupa zumby to ta sama encja; drużyna ma dodatkowe pola (kategoria wiekowa, liga, sezon).
4. **Konto niepełnoletniego**: opiekun ma konto i widzi profile wszystkich swoich dzieci; dziecko od 13 lat może dostać własny login z ograniczonym widokiem (kalendarz, obecność, komunikaty). Zgody i płatności zawsze po stronie opiekuna. Dzieci < 13 nie mają konta.
   **Deklaracja obecności przez dziecko 13+ jest konfigurowalna** (ustawienie klubu, z możliwością nadpisania per grupa lub typ aktywności): `immediate` — status zmienia się od razu, opiekun dostaje powiadomienie; `guardian_confirm` — status „oczekuje na potwierdzenie opiekuna” do czasu akceptacji (po terminie X h przyjmuje wartość domyślną wskazaną w konfiguracji); `guardian_only` — dziecko widzi, ale nie deklaruje. Rekomendowany default: `immediate` dla treningów, `guardian_confirm` dla meczów i wyjazdów.
5. **Osoba** jest jednym rekordem niezależnie od liczby ról; jedna osoba może łączyć role, np. koordynator + trener, opiekun + trener. Uprawnienia się sumują; UI pokazuje przełącznik kontekstu („jako trener / jako koordynator”), a rekordy zapisują, w jakiej roli wykonano akcję (np. `attendance.marked_as_role`).
6. Nazewnictwo: „uczestnik” zamiast „gracz/zawodnik”, „opiekun prawny” zamiast „rodzic”, „miejsce” zamiast „boisko”. Encje i kod po angielsku, UI po polsku.
7. **Orlik w MVP w pełnym zakresie**: strefy godzinowe, publiczny harmonogram, rezerwacje, cennik, dziennik animatora, incydenty i zakazy wstępu, raport dla gminy. Klub jest *administratorem* obiektu, gmina *właścicielem* — system musi to rozróżniać (płatności za wynajem idą na konto gminy).
8. Nazwa produktu: **Vereino** (od niem. *Verein* — stowarzyszenie/klub). Odrzucone: CoolClub (nazwa robocza), Clubio i Klubio (zajęte: domeny, GitHub, aplikacja w Google Play). GitHub `vereino` był wolny w dniu wyboru; zakup domeny wstrzymany.

## 3. Role i uprawnienia

| Rola | Zakres | Co widzi / robi |
|---|---|---|
| Uczestnik (participant) | własne dane | kalendarz swoich terminów, „będę / nie będę”, komunikaty swoich grup, profil ze zdjęciem, podgląd płatności |
| Opiekun prawny (guardian) | swoje dzieci | kalendarz wszystkich dzieci, deklaruje obecność w ich imieniu, płaci należności, pisze do trenera, zgłasza się na dyżur |
| Trener (coach) | swoje grupy | terminy i listy obecności swoich grup, odwołanie terminu, zgłoszenie nieobecności i wskazanie zastępcy, komunikaty do grupy/terminu; (później) podgląd własnej umowy |
| Koordynator sekcji (coordinator) | jedna sekcja | definiuje grupy, aktywności, miejsca w sekcji; lista terminów bez trenera; komunikaty do trenerów i całej sekcji; rejestr „spraw” |
| Animator obiektu (facility_operator) | jedno miejsce (obiekt) | otwiera/zamyka obiekt, prowadzi dziennik (stan przed/po, obecność grup), potwierdza i anuluje rezerwacje, zgłasza incydenty, wnioskuje o zakaz wstępu; widzi harmonogram obiektu i dane kontaktowe najemców |
| Administrator klubu (club_admin) | cały klub | osoby, przypisania ról, sekcje, cenniki, zniżki, należności, płatności; (później) projekty, instytucje, umowy, wynajem |
| Administrator techniczny (tech_admin) | instancja | tenant, moduły, konfiguracja, wygląd; bez dostępu do danych osobowych poza koniecznymi |

Uprawnienia koordynatora są nadawane **per sekcja** (`role_assignment.section_id`), animatora **per miejsce** (`role_assignment.place_id`). Uczestnik i opiekun nie są rolami nadawanymi ręcznie — wynikają z członkostwa w grupie i rekordu opieki prawnej.

Kalendarz nie jest encją — to widok `occurrence` przefiltrowany przez rolę:
- uczestnik: terminy grup, w których ma członkostwo;
- opiekun: suma terminów wszystkich podopiecznych;
- trener: terminy, gdzie jest trenerem (domyślnym lub zastępcą) + terminy swoich grup;
- koordynator: wszystkie terminy sekcji, osobna lista „bez trenera”;
- animator: kalendarz obiektu (terminy klubu + rezerwacje + godziny ogólnodostępne);
- **gość bez logowania**: publiczny harmonogram obiektu (patrz 4.7).

## 4. Moduły i encje (MVP)

Konwencja: 1 tenant Open Mercato = 1 klub. Nazwy tabel snake_case, `id` UUID, `created_at/updated_at`, soft delete tam, gdzie dane osobowe.

### 4.1 `club_core`
- **club** — name, short_name, logo, address, settings (JSON: waluta, strefa czasowa, próg wieku dla własnego konta = 13).
- **section** — club_id, name, description, is_active. Przykłady: akademia piłkarska, basen, zajęcia dodatkowe.
- **place** — club_id, parent_place_id (hierarchia: kompleks → boisko piłkarskie, boisko wielofunkcyjne, zaplecze szatniowe), name, kind (complex / pitch / multi_pitch / hall / locker_room / pool / other), surface (synthetic_turf / polyurethane / …; z niej wynika wymagane obuwie), address, geo_lat, geo_lng, description, photos[], owner_institution_id (np. Gmina Liszki), managed_by_club (bool — klub jest administratorem), is_external, opening_hours (JSON: pn–pt 8:00–22:00, sb–nd i święta 9:00–20:30), closure_rules (np. „zamknięte, gdy leży śnieg”), regulations_document_id, contacts (administrator, animator, właściciel, numery alarmowe), is_active.
  Rezerwacja i terminy wskazują konkretne miejsce-dziecko (boisko), a nie cały kompleks.

### 4.2 `people`
- **person** — club_id, first_name, last_name, birth_date, pesel (szyfrowany, opcjonalny), phone, email, photo, notes. Wiek liczony z birth_date decyduje o pełnoletności i o możliwości własnego konta.
- **user** (Open Mercato) — person_id (0..1). Konto tylko dla osób ≥ 13 lat lub dorosłych.
- **guardianship** — guardian_person_id, ward_person_id, relation (parent / grandparent / other), is_primary_payer, consents (JSON: regulamin, wizerunek, wyjazdy), valid_from, valid_to. Relacja n:m (dwoje rodziców, rodzeństwo).
- **role_assignment** — person_id, role (coordinator / club_admin / coach / facility_operator / tech_admin), section_id (wymagane dla coordinator), place_id (wymagane dla facility_operator), valid_from, valid_to.

### 4.3 `groups`
- **group** — section_id, name, kind (team / class_group), age_category, league, season, description, is_active.
- **group_membership** — group_id, person_id, role (participant / coach / coordinator / assistant), valid_from, valid_to. Historia rozwoju uczestnika = kolejne członkostwa (żaki → orliki → juniorzy).
- **external_team** — club_id, name, club_name, institution_id (opcjonalnie — ten sam klub może być przeciwnikiem i najemcą orlika), contact, notes. Słownik przeciwników do wyboru z listy.

### 4.4 `activities`
- **activity** — section_id, group_id, name, type (training / match / sparring / camp / other), default_place_id, default_coach_id, opponent_external_team_id, recurrence_rule (RRULE, null dla jednorazowych), starts_on, ends_on, default_start_time, default_end_time, description, is_active.
- **occurrence** — activity_id, date, start_at, end_at, place_id, coach_id (null = nieobsadzony), status (planned / confirmed / done / cancelled), cancel_reason, notes, substitution_log (JSON: kto, kiedy, za kogo). Generowany z RRULE; edytowalny pojedynczo.
- **attendance** — occurrence_id, person_id, declared (yes / no / unknown), declared_by_person_id, declared_at, declaration_status (final / pending_guardian / rejected_by_guardian), guardian_decided_at, actual (present / absent / late / null), marked_by_person_id, marked_as_role. Unikalne (occurrence_id, person_id).
- **attendance_policy** (ustawienie) — scope (club / group / activity_type), minor_declaration_mode (immediate / guardian_confirm / guardian_only), confirm_timeout_hours, default_after_timeout (declared / rejected).
- **occurrence_supervisor** — occurrence_id, person_id, note. Rodzic-wolontariusz na konkretnym terminie („dyżurny”).

Reguły:
- zmiana trenera na terminie = zastępstwo; system zapisuje wpis w `substitution_log` (kto, za kogo, kiedy, kto zatwierdził). **Rozliczenie**: trener otrzymuje podstawę + stawkę za jednostkę treningową; jednostka liczy się temu, kto faktycznie poprowadził termin (`occurrence.coach_id` w statusie `done`). Na koniec miesiąca system liczy jednostki per trener z terminów `done`, więc zastępstwo automatycznie przenosi jednostkę z trenera domyślnego na zastępcę — bez ręcznych korekt. Raport miesięczny pokazuje osobno: jednostki planowe, oddane w zastępstwo, przejęte w zastępstwie, bilans.
- termin ze statusem planned i `coach_id = null` trafia na listę koordynatora „do obsadzenia”;
- odwołanie terminu wysyła komunikat do grupy (scope = occurrence).

### 4.5 `communication`
- **message** — club_id, author_person_id, scope (club / section / group / activity / occurrence / direct), scope_id, recipient_person_id (dla direct), body, attachments[], parent_message_id (wątek), is_case, created_at.
- Wątek z `is_case = true` = „sprawa” (skarga, konflikt); widoczny dla koordynatora sekcji i administratora, nieusuwalny, z pełną historią. Wymagane do celów dowodowych.
- Powiadomienia w MVP: e-mail. Push, WhatsApp/Messenger — później.

### 4.6 `payments`
- **fee** — club_id, name, amount, currency, period (monthly / one_off / per_occurrence), group_id lub activity_id, valid_from, valid_to.
- **discount_rule** — club_id, name, kind (sibling / project / custom), percent lub amount, conditions (JSON, np. „drugie i kolejne dziecko tego samego opiekuna”), valid_from, valid_to.
- **charge** — person_id (uczestnik) *lub* payer_institution_id (najemca-instytucja), payer_person_id (opiekun lub sam uczestnik), fee_id *lub* rental_id, period_label, amount, discount_rule_id, discount_amount, due_date, **payee** (club / owner_institution — opłaty za wynajem orlika trafiają na rachunek gminy), status (open / paid / partially_paid / cancelled / forfeited — przepadła przy nieodwołaniu w terminie).
- **payment** — charge_id, amount, method (cash / transfer / online), paid_at, reference, recorded_by_person_id.
W MVP wpłaty księguje ręcznie administrator; bramka online później.


### 4.7 `facilities` — obiekt sportowy administrowany przez klub (Orlik)
Źródło reguł: Regulamin Orlika 2024 Ściejowice (§2–§6) i notatka o umowie administracyjnej.

- **institution** (przeniesione do MVP z `projects`) — club_id, name, type (municipality / school / club / company / sponsor / other), address, contact, bank_account (do wskazania odbiorcy płatności), notes. Gmina Liszki = właściciel; inne kluby, szkoły, firmy = najemcy.
- **contract** (przeniesione do MVP, uogólnione) — party_type (person / institution), party_id, kind (coach / facility_management / rental / grant / other), valid_from, valid_to, terms (JSON), file. Dla `coach`: terms = { base_monthly, unit_rate (za jednostkę treningową), unit_minutes (np. 90), match_rate, travel_rate }. Raport rozliczeniowy trenera za miesiąc = base + Σ jednostek z terminów `done` × unit_rate (+ mecze, wyjazdy) — w MVP tylko wyliczenie i eksport, bez księgowania wypłat. Umowa administracyjna z gminą = `facility_management`; z niej wynika cennik i podział obowiązków.
- **place_zone_rule** — place_id, weekday(s), time_from, time_to, zone (public_free / club_training / reservable_paid / closed), priority (school / municipal_event / club / rental / public), valid_from, valid_to. Definiuje stały tygodniowy podział godzin; z reguł + terminów + rezerwacji system generuje **harmonogram miesięczny** (§2 ust. 3).
- **place_closure** — place_id, date_from, date_to, reason (snow / maintenance / event / other). Zamknięcie blokuje rezerwacje i oznacza terminy klubu do przeniesienia.
- **rental_rate** — place_id, renter_category (municipal_club / municipal_club_winter_lighting / external_commercial), price_per_60, price_per_90, season_from, season_to, includes_lighting, valid_from, valid_to. Stawki z notatki: kluby z gminy 80–150 zł/90 min, zimą z oświetleniem 150–220 zł, zewnętrzne 220–350 zł — konkretne kwoty do ustalenia w umowie.
- **rental** — place_id, renter_type (institution / person), renter_id, contact_person, requested_by (phone / email / form), starts_at, ends_at, units (wielokrotność **90 min** — jednostka treningowa, §3 ust. 2), rate_id, amount, charge_id, status (requested / confirmed / paid / cancelled_free / cancelled_late / no_show / done), cancellation_deadline (= starts_at − 24 h, §3 ust. 4), payment_deadline (= starts_at − N dni, N z umowy, §3 ust. 3), regulations_accepted_at, notes.
  Reguły: rezerwacja możliwa tylko w strefie `reservable_paid`; koliduje z `occurrence` i innymi `rental`; odwołanie po `cancellation_deadline` → status `cancelled_late`, należność `forfeited`; zdarzenia gminy/szkolne mają pierwszeństwo — administrator może przesunąć rezerwację z powiadomieniem.
- **facility_log** — place_id, date, operator_person_id, opened_at, closed_at, condition_before, condition_after, groups_present (JSON: rezerwacja/termin, liczba osób, obecność pełnoletniego opiekuna), remarks. Dziennik animatora (notatka, pkt 4).
- **facility_incident** — place_id, occurred_at, reported_by_person_id, kind (rule_violation / damage / injury / other), description, involved (osoby lub grupa lub rezerwacja), action_taken (warning / removed / reservation_cancelled / police_called), attachments[], linked_message_id (wątek „sprawa”). Podstawa dowodowa przy sporach (§6).
- **entry_ban** — place_id, subject_type (person / institution), subject_id, from, to (null = stały), reason, incident_id, issued_by. Blokuje nowe rezerwacje tego podmiotu.
- **maintenance_task** — place_id, kind (daily_cleaning / turf_brushing / granulate / net_repair / lighting / annual_inspection / five_year_inspection / other), responsible (club / owner), due_date, done_at, cost, notes. Z notatki: podział obowiązków klub ↔ gmina, przeglądy roczne i 5-letnie.
- **Publiczny harmonogram** (bez logowania): kalendarz miesięczny obiektu z oznaczeniem stref (ogólnodostępne / treningi klubu / wolne do rezerwacji / zarezerwowane — bez nazwy najemcy / zamknięte), godziny otwarcia, cennik, link do regulaminu, telefon do rezerwacji. Statyczny link, możliwy do wywieszenia jako QR na tablicy obiektu.
- **Raport dla właściciela**: za miesiąc/kwartał — godziny w każdej strefie, liczba i wartość rezerwacji, wpłaty na konto gminy, incydenty, wykonane prace konserwacyjne. Podstawa rozliczenia umowy administracyjnej.

Ekrany MVP dla modułu: publiczny harmonogram; kalendarz obiektu dla animatora/administratora (dodaj rezerwację po telefonie, zmień status, wpis w dzienniku); cennik i reguły stref (administrator); rejestr incydentów i zakazów; raport dla gminy.

## 5. Moduły zarezerwowane (poza MVP)

- **projects**: `project` (institution_id, budget, coordinator_person_id, status, settlement). Korzysta z `institution` i `contract` (kind = grant) z MVP. Projekt łączy aktywności, należności i umowy; wymaga rozliczenia końcowego.
- **contracts (rozszerzenie)**: księgowanie wypłat trenerów i eksport do kadr/księgowości; `regulation` jako dokumenty do akceptacji przez opiekunów. (Wyliczenie podstawa + jednostki jest już w MVP.)
- **shop**: `product`, `order` (stroje uczestników z rozmiarami, gadżety dla kibiców).
- **facilities (rozszerzenie)**: formularz rezerwacji online dla najemców, płatność online, konta dla stałych najemców.
- **development**: historia uczestnika, dane z urządzeń (zegarek).

## 6. Ekrany MVP (minimum)

- Uczestnik / opiekun: ekran „Dziś” (4 kafle: kalendarz, wiadomości, obecność, płatności), kalendarz, szczegóły terminu z „będę / nie będę”, wątek wiadomości, profil (+ przełącznik dzieci u opiekuna).
- Trener: moje grupy → terminy → lista obecności (odhaczanie), zgłoszenie nieobecności / zastępcy, nowy komunikat.
- Koordynator: sekcja → grupy, aktywności (kreator z RRULE), miejsca, „terminy bez trenera”, sprawy.
- Administrator: osoby i role, cenniki, zniżki, należności (lista + księgowanie wpłat), sekcje, instytucje i umowy.
- Animator: kalendarz obiektu, nowa rezerwacja (po telefonie), dziennik dnia (otwarcie/zamknięcie, stan, grupy), zgłoszenie incydentu.
- Gość: publiczny harmonogram obiektu (miesiąc, strefy, cennik, regulamin, telefon).

## 7. Przepływ referencyjny: jeden trening

1. Koordynator tworzy aktywność „Trening żaki” (grupa Żaki, wtorki 17:00–18:30, Orlik, trener Wojtek, RRULE co tydzień do 30.06).
2. System generuje terminy (1 na wtorek).
3. Kalendarze ról wypełniają się.
4. Trener prosi o potwierdzenie; opiekun/uczestnik deklaruje obecność.
5. Trener zgłasza nieobecność → termin bez trenera → koordynator wskazuje zastępcę → wpis w substitution_log.
6. Po treningu trener odhacza obecność faktyczną; termin → done.

## 7a. Przepływ referencyjny: wynajem orlika

1. Trener klubu z sąsiedniej gminy otwiera publiczny harmonogram, widzi wolny slot „do rezerwacji” w środę 19:30–21:00 i dzwoni na numer z harmonogramu.
2. Animator (lub administrator) zakłada `rental`: boisko piłkarskie, 1 jednostka (90 min), najemca = instytucja „KS Sąsiedzi” (kategoria: klub z gminy → stawka zimowa, bo grudzień), status `requested`; system wylicza kwotę, termin wpłaty (N dni przed) i termin bezpłatnego odwołania (24 h przed); najemca otrzymuje e-mail z podsumowaniem, numerem konta gminy i linkiem do regulaminu.
3. Slot w harmonogramie publicznym zmienia się na „zarezerwowane” (bez nazwy najemcy); koordynatorzy klubu widzą kolizję, gdyby chcieli wstawić tam trening.
4. Administrator odnotowuje wpłatę na koncie gminy → `charge.status = paid`, `rental.status = confirmed`.
5. W dniu wynajmu animator otwiera obiekt, wpisuje w `facility_log` stan boiska przed, obecność pełnoletniego opiekuna grupy; po zakończeniu stan po, zamknięcie. Ewentualne naruszenie regulaminu → `facility_incident`, opcjonalnie `entry_ban`.
6. Na koniec miesiąca raport dla gminy: godziny w strefach, rezerwacje, wpłaty, incydenty, konserwacja.

Wariant: najemca odwołuje 10 h przed → `cancelled_late`, należność `forfeited`, slot wraca do „do rezerwacji”. Wariant: gmina zgłasza imprezę w zarezerwowanym slocie → administrator przesuwa rezerwację (priorytet §2 ust. 4), najemca dostaje powiadomienie i propozycję innego terminu.

## 8. Założenia techniczne

- Open Mercato: moduły jak w sekcji 4 (`club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities`), każdy z własnymi encjami, API i widokami; encje rozszerzalne przez custom fields tam, gdzie kluby będą różne.
- Publiczny harmonogram obiektu = jedyny widok bez uwierzytelnienia; nie ujawnia danych osobowych (rezerwacja pokazuje tylko „zarezerwowane”).
- Multi-tenant: 1 tenant = 1 klub (do potwierdzenia — pytanie 7).
- Web responsywny (PWA) w MVP; aplikacja natywna później (pytanie 8).
- RODO: PESEL szyfrowany i widoczny tylko dla club_admin; soft delete osób; rejestr zgód w guardianship.consents.

## 9. Pytania otwarte

1. Sekcje: lista i koordynatorzy (akademia — Wojtek?, basen — Aneta?, dodatkowe — ?). Czy seniorzy to osobna sekcja?
2. Granica koordynator (co się dzieje) ↔ administrator klubu (pieniądze i ludzie) — zgoda na propozycję? (Potwierdzone: jedna osoba może mieć obie role.)
3. Składki: miesięczna za grupę, za konkretną aktywność, czy obie? Płatnik dla dorosłego = on sam? Księgowanie ręczne w MVP?
4. Obóz = aktywność typu camp; projekt tylko przy dofinansowaniu zewnętrznym — zgoda?
5. PESEL i zgody: czy potrzebne w MVP, kto widzi, jakie zgody opiekun potwierdza?
6. Komunikaty: tylko w aplikacji + e-mail w MVP? „Sprawa” zakładana przez koordynatora czy flaga na dowolnym wątku?
7. Multi-tenant od razu czy jedna instancja dla Gwiazdy?
8. MVP jako PWA, natywna aplikacja później?
9. Nazwa produktu — rozstrzygnięte: Vereino (decyzja 8). Otwarte: która domena (.org / .com / .app) i kiedy ją kupić.

Pytania z regulaminu i umowy administracyjnej (Orlik):
10. Godziny otwarcia i strefy: regulamin ma placeholdery (8:00–22:00, 9:00–20:30). Jakie są faktyczne godziny i jaki tygodniowy podział na ogólnodostępne / treningi klubu / wynajem?
11. Termin opłaty: „na N dni przed” — ile? I czy rezerwacja bez wpłaty w terminie ma automatycznie wygasać?
12. Kto wpisuje rezerwacje: animator, administrator klubu, czy obaj? Czy animator widzi cennik i kwoty?
13. Stawki: które kwoty z widełek (80–150 / 150–220 / 220–350 zł) wchodzą do cennika? Kiedy zaczyna się „sezon zimowy / oświetlenie” — od daty czy od godziny zapadania zmroku?
14. Płatności za wynajem: system tylko rejestruje „opłacono na konto gminy” na podstawie potwierdzenia, czy klub ma dostęp do wyciągu gminy? Czy część przychodu wraca do klubu (fundusz remontowy)?
15. Priorytet szkół i imprez gminnych: kto je wpisuje do harmonogramu (gmina nie ma konta) — administrator w imieniu gminy? Jakie wyprzedzenie?
16. Animator: pracownik klubu czy gminy? Czy prowadzenie dziennika ma być obowiązkowe (obiekt nie da się „zamknąć” w systemie bez wpisu)?
17. Zakazy wstępu: wystarczy rejestr w systemie, czy potrzebna procedura (kto wydaje, jak długo, odwołanie)?
18. Ubezpieczenie OC, przeglądy roczne i 5-letnie: czy system ma pilnować terminów (przypomnienia), czy to zostaje poza nim?
19. Regulamin: czy najemca ma akceptować regulamin w systemie (checkbox przy rezerwacji online — później) czy wystarczy zapis „zaakceptowano telefonicznie”?

Rozstrzygnięte 29.09.2026:
- Jedna osoba może łączyć role (np. koordynator + trener) — model to obsługuje przez `role_assignment` i `group_membership`.
- Deklaracja nieobecności przez dziecko 13+: konfigurowalne (`attendance_policy`), nie sztywna reguła.
- Zastępstwo a rozliczenie trenera: podstawa + jednostki treningowe; na koniec miesiąca jednostki z zastępstw przechodzą na zastępcę, trenerowi zastępowanemu są odejmowane. Wynika to wprost z liczenia jednostek po `occurrence.coach_id` dla terminów `done`.

## 10. Słownik PL → EN

klub → club · sekcja → section · miejsce → place · osoba → person · konto → user · opieka prawna → guardianship · przypisanie roli → role_assignment · grupa → group · członkostwo → group_membership · drużyna zewnętrzna → external_team · aktywność → activity · termin → occurrence · obecność → attendance · dyżur → occurrence_supervisor · komunikat → message · sprawa → case (message.is_case) · opłata/cennik → fee · należność → charge · płatność → payment · zniżka → discount_rule · projekt → project · instytucja → institution · umowa → contract · zamówienie → order · rezerwacja/wynajem → rental · cennik wynajmu → rental_rate · strefa godzinowa → place_zone_rule · zamknięcie obiektu → place_closure · animator → facility_operator · dziennik obiektu → facility_log · incydent → facility_incident · zakaz wstępu → entry_ban · konserwacja/przegląd → maintenance_task


## Alternatives Considered

- Buying ProTrainUp for the pilot club instead of building — rejected as long as the goal is an open-source product for small academies (research/decisions/D-011, benchmark).
- Separate entities for "zajęcia" vs "wydarzenia", "drużyna" vs "grupa" — rejected in favour of single entities with a type field (D-002, D-003).
- Two-way integration with Messenger/WhatsApp groups — not feasible (no group API); replaced by push + e-mail + share-to-group text + magic links (D-009, proposal).

## Implementation Approach

1. `club_core` + `people` (person, user link, guardianship, role_assignment) — foundation and auth.
2. `groups` + `activities` (RRULE → occurrences, attendance, attendance_policy, substitution_log) — the calendar.
3. `communication` on top of Open Mercato messages/notifications — scopes, threads, `is_case`, share text, magic links.
4. `payments` — fee, discount_rule, charge (with payee), payment, online gateway adapter.
5. `facilities` — place hierarchy, zone rules, closures, rental_rate, rental, public schedule, facility_log, incidents, bans, maintenance, owner report.
6. Coach settlement report; parent/participant "4 tiles" screen; PWA packaging.

## Success Metrics

- ≥80% attendance declarations made in-app during pilot season 2027/28.
- Fee collection on-time rate before vs after pilot (baseline to be measured — currently no data).
- Monthly facility report accepted by the municipality without manual rework.
- 5 additional academies on Vereino by end of 2027.

## Open Questions

See section 9 above and `research/2026-10-20-stakeholders.md` (three decisions with owner "unknown").

## Changelog

### 2026-10-20
- Converted to Open Mercato SPEC format; linked research package, MoSCoW and decision records; target segment narrowed to small football academies (D-011); online payments proposed for 1.0 (D-010).

### 2026-09-29
- v0.3: multiple roles per person; configurable guardian confirmation for 13+ declarations; coach settlement = base + training units, substitutions transfer units.

### 2026-09-26
- v0.2: `facilities` module (Orlik regulations); v0.1: initial domain model from founders' meeting.
