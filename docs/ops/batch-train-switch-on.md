# Włączenie batch merge train (E16-S04, #698)

> Instrukcja dla właściciela repozytorium, po polsku na jego prośbę (issue #698). Spec: `.ai/specs/2026-11-18-batch-merge-train.md`, faza 3 (REQ-BT05, BT-AC-01 … BT-AC-03). Ustawienia docelowe: `docs/ops/github-settings.md` sekcje 2, 6 i 6a; proces: `SDLC.md` → "Validation gate".
>
> Agenci nie zmieniają żadnego z tych ustawień: token, sekret, zmienną i ruleset zmienia tylko właściciel.

## Dlaczego taka kolejność

Pociąg czyta listę wymaganych checków z rulesetu `main`. Kolejność kroków jest dobrana tak, żeby w żadnym momencie PR-y nie stały się niescalalne:

- **Najpierw kod z PR-a #698** (krok 0). Bez niego pociąg potraktowałby `merge-train/verified` jak zwykły check CI, którego żaden head nigdy nie ma, i nie scaliłby już niczego — w żadnym trybie. Z nim pociąg pomija `merge-train/verified` przy ocenie i sam ustawia ten status tuż przed każdym merge'em, także w trybie jednego PR-a.
- **Token przed rulesetem** (krok 1). Gdy ruleset wymaga `merge-train/verified`, pociąg musi umieć ustawić status commita. Bez uprawnienia *Commit statuses* run kończy się błędem zanim cokolwiek scali (bezpieczna awaria, ale kolejka stoi).
- **`merge-train/verified` przed zdjęciem „up to date”** (kroki 2 i 3). Odwrotna kolejność zostawiłaby okno, w którym każdy mógłby ręcznie scalić zielony, ale nieaktualny PR.
- **Zdjęcie „up to date” przed rozmiarem paczki** (kroki 3 i 4). Paczka scala PR-y, które są za `main`; przy włączonym „up to date” GitHub odrzuciłby merge, a pociąg otworzyłby issue pauzy.
- **Najpierw paczka 2, potem 4** (kroki 4–6), jak wymaga spec: pierwsza paczka na żywo jest nadzorowana.

## Krok 0 — scal PR z #698 (zmiana kodu pociągu)

1. Przejrzyj PR (link w komentarzu na #698). PR ma `risk-high` i `needs-qa`, więc pociąg go trzyma, dopóki nie nadasz etykiety **`qa`**.
2. Nadaj `qa`. Pociąg (jeszcze w trybie jednego PR-a) zaktualizuje PR z `main` i scali go po zielonym CI. PR zmienia `.github/` i `scripts/merge-train*`, więc i tak zawsze idzie sam.
3. Sprawdź: na <https://github.com/wladku/Vereino/actions/workflows/merge-train.yml> najnowszy run po scaleniu wypisuje `required checks on main: gate, integration, browser-smoke; skip labels: …` i działa jak dotąd.

## Krok 1 — uprawnienia tokenu `MERGE_TRAIN_TOKEN`

1. Otwórz <https://github.com/settings/personal-access-tokens> (Settings → Developer settings → Personal access tokens → **Fine-grained tokens**) i wybierz token, którego wartość jest w sekrecie `MERGE_TRAIN_TOKEN` (sekret zapisany 2026-11-07; nazwę tokenu znasz tylko Ty).
2. Kliknij **Edit**. W *Repository permissions* ustaw:
   - **Commit statuses: Read and write** — nowe;
   - **Issues: Read and write** — sprawdź, że już jest (pociąg od #449 przenosi etykiety na issue; batch train otwiera nim issue pauzy);
   - bez zmian: **Contents**, **Pull requests**, **Workflows: Read and write**; *Metadata: Read* zostaje automatycznie.
   - *Repository access* zostaje: tylko `wladku/Vereino`.
3. Zapisz (**Update**). Zmiana uprawnień istniejącego tokenu **nie zmienia jego wartości**, więc sekretu <https://github.com/wladku/Vereino/settings/secrets/actions> nie trzeba ruszać. Jeżeli GitHub zamiast *Edit* każe użyć **Regenerate token** (np. bo token wygasł), dostaniesz nową wartość: wtedy wklej ją do sekretu `MERGE_TRAIN_TOKEN` (*Update secret*).
4. Sprawdź datę ważności tokenu na tej samej stronie: wygasły token zatrzymuje pociąg w każdym trybie.

Uwaga: agent nie ma dostępu do tego tokenu, a strona dokumentacji GitHuba o tokenach (sprawdzona 2026-11-24) nie opisuje edycji uprawnień. To, że wartość się nie zmienia, wynika z działania przycisku *Edit* w interfejsie GitHuba, a nie ze sprawdzenia na tym tokenie. Pierwszym realnym testem uprawnienia jest krok 2. Run, który dostanie `POST /repos/wladku/Vereino/statuses/… → 403`, kończy się na czerwono **przed** merge'em. Wtedy popraw uprawnienie i poczekaj na następny run (co 15 min) albo uruchom go ręcznie (*Run workflow*).

## Krok 2 — ruleset: dodaj wymagany check `merge-train/verified`

1. Otwórz ruleset <https://github.com/wladku/Vereino/settings/rules/26707580> („main: merge only when up to date and green”).
2. W regule **Require status checks to pass** kliknij **Add checks**, wpisz `merge-train/verified` i dodaj go. Jako źródło zostaw **any source** (nie „GitHub Actions”): status ustawia token `MERGE_TRAIN_TOKEN`, a nie aplikacja GitHub Actions. Trzy istniejące checki (`gate`, `integration`, `browser-smoke`, źródło GitHub Actions) zostają. **Require branches to be up to date before merging** na razie zostaje włączone.
3. **Save changes**.

Jeżeli pole nie pozwala dodać checka, którego jeszcze nigdy nie zgłoszono, to samo zrobi polecenie (Twoje konto `gh`, uprawnienie admin do repozytorium; zachowuje obecne ustawienia i dodaje czwarty check):

```bash
gh api -X PUT repos/wladku/Vereino/rulesets/26707580 --input - <<'EOF'
{"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":true,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"gate","integration_id":15368},{"context":"integration","integration_id":15368},{"context":"browser-smoke","integration_id":15368},{"context":"merge-train/verified"}]}}]}
EOF
```

Sprawdź:

- `gh api repos/wladku/Vereino/rules/branches/main --jq '.[].parameters.required_status_checks[].context'` wypisuje `gate`, `integration`, `browser-smoke`, `merge-train/verified`.
- Następny run pociągu wypisuje `required checks on main: gate, integration, browser-smoke (+ merge-train/verified, set by the train); …`.
- Następny PR scalony przez pociąg ma na swoim headzie status `merge-train/verified` = success („up to date with main and green”). Jeśli run padł z 403 — wróć do kroku 1.

## Krok 3 — ruleset: wyłącz „up to date”

1. Ten sam ruleset <https://github.com/wladku/Vereino/settings/rules/26707580>.
2. W **Require status checks to pass** odznacz **Require branches to be up to date before merging**. Cztery checki zostają.
3. **Save changes**. (Polecenie `gh api` z kroku 2 z `"strict_required_status_checks_policy":false` robi to samo.)

Od tej chwili pociąg w trybie jednego PR-a działa jak dotąd (sam i tak scala tylko aktualne PR-y), a ręczny merge nie przejdzie, bo nikt poza pociągiem nie ustawia `merge-train/verified`.

**Sprawdź BT-AC-03 (merge poza pociągiem się nie udaje)** — bez klikania „Merge”:

1. Wybierz otwarty PR, który ma zielone `gate`, `integration` i `browser-smoke`, ale nie jest jeszcze scalony (lista: <https://github.com/wladku/Vereino/pulls>).
2. W polu merge PR-a GitHub pokazuje `merge-train/verified` — *Expected — Waiting for status to be reported* i „Merging is blocked”.
3. To samo z wiersza poleceń: `gh pr view <numer> --json mergeStateStatus,statusCheckRollup --jq '.mergeStateStatus'` daje `BLOCKED`.
4. Nie klikaj „Merge” ani „Bypass” (ruleset nie ma listy bypass, więc i tak się nie da). Zapisz numer PR-a i wynik w komentarzu na #698.

## Krok 4 — zmienna `MERGE_TRAIN_BATCH_SIZE=2` (pierwsza nadzorowana paczka)

1. Opcjonalnie najpierw próba na sucho (nic nie zmienia): <https://github.com/wladku/Vereino/actions/workflows/merge-train.yml> → **Run workflow** → zaznacz *dry_run*, w *batch_size* wpisz `2` → w logu linia `batch plan (size 2, …): #…, #…`.
2. Otwórz <https://github.com/wladku/Vereino/settings/variables/actions> → **New repository variable** → nazwa `MERGE_TRAIN_BATCH_SIZE`, wartość `2` → **Add variable**.
3. Następny run pociągu (CI completed, push do `main` albo co 15 min; możesz też *Run workflow* bez *dry_run*) buduje paczkę.

## Krok 5 — obserwuj pierwszą paczkę dwóch PR-ów (BT-AC-01)

1. Run pociągu wypisuje `built merge-train/batch at <sha> on main <sha>: #A@…, #B@…`. Gałąź: <https://github.com/wladku/Vereino/tree/merge-train/batch>; oba PR-y mają etykietę `merge-train-batched` (<https://github.com/wladku/Vereino/pulls?q=is%3Aopen+label%3Amerge-train-batched>).
2. CI rusza na gałęzi `merge-train/batch`: <https://github.com/wladku/Vereino/actions/workflows/ci.yml?query=branch%3Amerge-train%2Fbatch> (ok. 35 min). W tym czasie kolejne runy pociągu wypisują `judge: wait`.
3. Po zielonym CI run pociągu wypisuje `judge: merge`, a potem dla każdego PR-a `merged #A; tree check passed: main <tree>, batch prefix 1 <tree>` i `merged #B; tree check passed: …, batch prefix 2 …`. **To jest BT-AC-01**: obie linie z `tree check passed` w jednym runie.
4. Oba PR-y mają status `merge-train/verified` = success („tested in batch <sha>”) na swoich headach; gałąź `merge-train/batch` znika, a pociąg buduje następną paczkę.
5. Wklej link do tego runu w komentarzu na #698.

Co może się zdarzyć i co znaczy:

- `dropped batch …: main moved` / `a PR head moved` — ktoś wypchnął nowy commit; pociąg buduje paczkę od nowa. Normalne.
- `judge: bisect` — paczka czerwona; pociąg testuje połowy. PR czerwony sam dostaje `merge-train/verdict` = failure i `merge-train-failed` (BT-AC-02) i czeka na nowy commit autora.
- Nowe issue z etykietą `merge-train-paused` (<https://github.com/wladku/Vereino/issues?q=is%3Aopen+label%3Amerge-train-paused>) — pociąg zatrzymał się sam (różne drzewo albo merge nie przeszedł po 3 próbach). Przeczytaj je, sprawdź CI `main`, i zamknij issue dopiero wtedy, gdy `main` jest w porządku. Do zamknięcia pociąg tylko planuje i loguje.

## Krok 6 — `MERGE_TRAIN_BATCH_SIZE=4`

Po udanej pierwszej paczce: <https://github.com/wladku/Vereino/settings/variables/actions> → `MERGE_TRAIN_BATCH_SIZE` → **Edit** → `4` → **Update variable**. Kolejka ok. 14 PR-ów schodzi wtedy w ok. 2 h zamiast ok. 8 h.

## Krok 7 — Cezar

Reguły dla agentów są w repozytorium (`AGENTS.md` → Never, `SDLC.md` → "Never act for the train"), więc Cezar czyta je w każdym runie. Prompt systemowy Cezara nie jest w repozytorium (`.ai/cezar/config.json`, klucz `systemPrompt`, w Twoim checkoutcie `~/vereino-cezar`); dopisz w nim po zdaniu „Never merge a PR.”:

> Never set the commit statuses merge-train/verified or merge-train/verdict, never push to or delete merge-train/** or merge-train-build, and never close a merge-train-paused issue.

## Wycofanie (rollback) — w tej kolejności

Kolejność ze spec; każdy krok zostawia PR-y scalalne przez pociąg (pociąg w trybie jednego PR-a też ustawia `merge-train/verified`, dopóki ruleset go wymaga).

1. **Rozmiar 1**: <https://github.com/wladku/Vereino/settings/variables/actions> → `MERGE_TRAIN_BATCH_SIZE` → `1` (albo usuń zmienną). Następny run pociągu to tryb jednego PR-a.
2. **Zamknij gałąź paczki**: <https://github.com/wladku/Vereino/branches/all?query=merge-train> → usuń `merge-train/batch` (i `merge-train-build`, jeśli jest). Zdejmij pozostałe etykiety `merge-train-batched` (<https://github.com/wladku/Vereino/pulls?q=is%3Aopen+label%3Amerge-train-batched>); niczego nie blokują, ale wprowadzają w błąd.
3. **Przywróć „up to date”**: ruleset <https://github.com/wladku/Vereino/settings/rules/26707580> → zaznacz **Require branches to be up to date before merging** → **Save changes**.
4. **Usuń `merge-train/verified`** z wymaganych checków tego samego rulesetu → **Save changes**.

Awaryjne zatrzymanie bez zmiany ustawień (tylko w trybie paczek): otwórz issue z etykietą `merge-train-paused`; pociąg tylko planuje i loguje, dopóki go nie zamkniesz. W każdym trybie: <https://github.com/wladku/Vereino/actions/workflows/merge-train.yml> → **…** → **Disable workflow**.

Uprawnienia tokenu (*Commit statuses*, *Issues*) mogą zostać; zabranie *Commit statuses* przed krokiem 4 zatrzymałoby pociąg.
