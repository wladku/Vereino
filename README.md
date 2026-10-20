# Vereino

**Open-source management for small multi-section sports clubs — football academy first — built on [Open Mercato](https://www.openmercato.com/).**
*Otwartoźródłowy system do zarządzania małym klubem wielosekcyjnym, z akademią piłkarską jako główną sekcją, zbudowany na Open Mercato.*

> Status: **discovery / pre-implementation** — see [`.ai/specs/research/`](.ai/specs/research/README.md).
> Licencja / License: MIT.

---

## PL

Vereino (od niem. *Verein* — stowarzyszenie, klub) powstaje dla małych klubów wielosekcyjnych: akademia piłkarska do ok. 200 zawodników jako główna sekcja, obok niej basen, zajęcia dodatkowe (zumba, pilates, siłownia). Takie kluby dziś prowadzi się w Messengerze, Excelu i przez telefon — często na obiekcie należącym do gminy.

**Co ma robić pierwsza wersja**

- osoby z wieloma rolami (opiekun, trener, koordynator, animator), konto opiekuna z profilami dzieci, własny login od 13 lat;
- sekcje z koordynatorami, grupy (drużyny i grupy zajęciowe na równych prawach), aktywności cykliczne → terminy, kalendarz per rola — jeden dla rodzica, którego dzieci są w różnych sekcjach;
- deklaracja i faktyczna obecność, zastępstwa trenerów z automatycznym rozliczeniem jednostek;
- komunikaty do grupy/terminu/sekcji z push i e-mailem, rejestr trudnych spraw;
- składki, zniżki na rodzeństwo, należności, płatność online;
- obiekt sportowy administrowany w imieniu gminy (np. Orlik): strefy godzinowe, publiczny harmonogram bez logowania, rezerwacje, dziennik animatora, raport dla właściciela.

**Czego świadomie nie budujemy:** rysunków treningowych, modułu medycznego, skautingu, statystyk indywidualnych, integracji z Messengerem/WhatsApp.

Pilot: KS Gwiazda Ściejowice. Autorzy: Władek Kuć (produkt), Kacper Kuć (technologia).

## EN

Vereino targets small, suburban multi-section sports clubs whose main section is a football academy (up to ~200 players) next to e.g. swimming and fitness classes — clubs that currently run on Messenger groups, spreadsheets and phone calls, often on a municipality-owned pitch.

**First release scope:** people with multiple roles and guardian accounts with child profiles; sections, groups, recurring activities and role-filtered calendars; attendance declarations and coach substitutions with automatic unit settlement; group/occurrence messaging with push and e-mail; fees, sibling discounts and online payment; municipality-facility administration (time zones, public schedule, bookings, operator log, owner report).

**Explicitly out of scope:** training diagrams, medical module, scouting, individual statistics, Messenger/WhatsApp integration.

## Struktura / Structure

```
.ai/specs/research/     discovery: business case, stakeholders, benchmark, MoSCoW,
                        decisions D-001…D-012, interview scripts, domain-model draft
.ai/specs/              specifications (SPEC-000 template, authored via om-spec-writing)
src/modules/            Vereino modules (club_core, people, groups, activities,
                        communication, payments, facilities) — to be created
```

## Uruchomienie / Getting started

```
yarn install
cp .env.example .env     # database settings; Docker stack in docker-compose*.yml
yarn setup
yarn dev
```

See `AGENTS.md` for agent rules and `.ai/guides/` for framework context.
