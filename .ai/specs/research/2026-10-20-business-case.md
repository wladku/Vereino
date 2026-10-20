---
typ: business-case
data: 2026-10-20
autor: Władek Kuć
status: założenia zespołu (żadna odpowiedź nie jest jeszcze potwierdzona rozmową z odbiorcą)
---

# Business case: Vereino

## 1. Co chcemy zbudować i dla kogo?
Otwartoźródłowy system do zarządzania małą akademią piłkarską (do ~200 zawodników), zbudowany na Open Mercato. [ZAŁOŻENIE: segment] Użytkownicy: koordynator sekcji, skarbnik/administrator klubu, trenerzy (często na zleceniu), opiekunowie prawni dzieci, uczestnicy 13+, animator obiektu. Płacący klient: zarząd klubu (stowarzyszenie), docelowo także gmina jako właściciel obiektu. [ZAŁOŻENIE]

Pilot: KS Gwiazda Ściejowice (klub wielosekcyjny: akademia piłkarska, basen, zajęcia dodatkowe; administruje Orlikiem 2024 w imieniu Gminy Liszki). [DOKUMENT: regulamin Orlika, notatka orlik-ustalenia]

## 2. W czym produkt ma pomóc i dlaczego ktoś miałby z niego skorzystać?
Dziś (w Gwieździe): grafik i obecność przez grupy na Messengerze, składki śledzone ręcznie, zastępstwa trenerów ustalane telefonicznie, rezerwacje orlika przez telefon do klubu, brak rejestru trudnych spraw. [DOKUMENT: transkrypcja spotkania 26.09.2026 — to wiedza Władka jako wiceprezesa, nie rozmowa z użytkownikiem]

Produkt ma: (a) dać rodzicowi jeden kalendarz wszystkich dzieci i „będę/nie będę” w dwa kliknięcia, (b) dać trenerowi listę obecności i zastępstwo z telefonu, (c) dać skarbnikowi naliczanie składek i płatność online, (d) dać koordynatorowi grafik bez kolizji na obiekcie i publiczny harmonogram orlika z rezerwacjami, (e) dać zarządowi rejestr spraw jako zabezpieczenie prawne. [ZAŁOŻENIE: które z tych bólów są największe — do sprawdzenia w rozmowach]

Dlaczego nie ProTrainUp (125–245 zł/mies.): [BENCHMARK] PTU jest rozbudowany pod duże kluby i trenerów (rysunki, medycyna, skauting); nie ma zarządzania obiektem gminy ani sekcji niesportowych; to SaaS z danymi u dostawcy. Vereino ma być proste, darmowe (open source) i mieć obiekt gminny jako funkcję centralną. [ZAŁOŻENIE: że „darmowe + proste + orlik” wystarczy, by mała akademia wybrała nas zamiast PTU]

## 3. Co już wiemy, skąd, i czego musimy się dowiedzieć?
Wiemy:
- Strukturę bytów klubu i role — ze spotkania założycieli [DOKUMENT].
- Reguły orlika: strefy godzin, 90-min jednostka, opłata na konto gminy, 24 h na odwołanie, animator, sankcje — z regulaminu [DOKUMENT].
- Cennik i zakres PTU — ze strony, sprawdzone 30.09.2026 [BENCHMARK].
- Model rozliczania trenerów w Gwieździe: podstawa + jednostki treningowe — od Władka [DOKUMENT/wiedza zarządu].

Nie wiemy (metoda):
- Czy trenerzy wolą jedno narzędzie klubowe, czy PTU Coach dla siebie + coś klubowego → rozmowa z 3 trenerami (Mom Test).
- Jak skarbnik dziś ściąga składki i ile czasu to kosztuje → rozmowa ze skarbnikiem Gwiazdy + 1–2 innych klubów.
- Czy rodzice wejdą do aplikacji zamiast Messengera, przy jakim bodźcu → rozmowa z 5 rodzicami; test magic-linku.
- Ile akademii 100–200 zawodników gra na obiektach gminnych i administruje nimi → dane PZPN/gminy lub 5 rozmów z koordynatorami innych klubów.
- Kto w innych klubach podejmuje decyzję o narzędziu i czy „open source” jest dla nich argumentem czy ryzykiem → rozmowy z prezesami 3 klubów.
- Hosting: kto utrzyma instancję dla klubu, który nie ma informatyka → decyzja zespołu + rozmowy.

## 4. Co obejmuje pierwsza wersja, a co odkładamy?
Zakres 1.0: patrz `2026-10-20-moscow.md` i decyzje D-001…D-012. W skrócie: osoby i role, grupy, aktywności/terminy, kalendarze, obecność, komunikaty z push, składki z płatnością online, obiekt (orlik) z publicznym harmonogramem i rezerwacjami.

Wizja (poza 1.0, do sprawdzenia): wiele klubów na jednej instancji dla gminy; projekty i dofinansowania; sklep; rezerwacja online dla najemców; historia rozwoju zawodnika; sekcje niesportowe jako pełnoprawny przypadek.

Świadomie nie budujemy: rysunków treningowych, bazy ćwiczeń, modułu medycznego, skautingu, statystyk indywidualnych, integracji z Messengerem/WhatsApp (brak API dla grup).
