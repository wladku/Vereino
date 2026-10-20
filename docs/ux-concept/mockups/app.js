// Wygenerowane z app.ts przez build.mjs — nie edytuj ręcznie.
// Vereino — klikalne mockupy (koncepcja UX v0.1).
// Źródło: docs/ux-concept/README.md + .ai/specs/2026-10-20-vereino-club-management.md
// Budowanie: node docs/ux-concept/mockups/build.mjs  →  app.js (TypeScript z samymi adnotacjami typów).

(() => {
  // ═══════════════════════════════════════════════════════════════════
  // Typy
  // ═══════════════════════════════════════════════════════════════════
                                                           
                                                                                    
                                                           
                                      
                                                                                    
                                                                            

                                                                                                                                                                                             
                                                                                                                                                                                    
                                                                                                                                                               
                                                                                                                                                                                                                                                                                                 
                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                              
                                                                                                                                                                                        
                                                                                                                                         
                                                                                                                         
                                                                                                                                                                                                          
                                                                                                           
                                                                                                                                                                                                                                                                                                                                                                                                                                              
                                                                                                                                                
                                                                                                                                                                                                                                                                                       
                                                                                                                                                                 
  // Zbiórki zamówień (np. stroje) — REQ-032, REQ-033.
                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                    
                                                                                                    
                                                                                                                                                                                                                                                                                                                                   
                                                                                                                                 
                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                            
                                                                                                                         
                                                                                                             
                                                                                                                                     
                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                       

  // ═══════════════════════════════════════════════════════════════════
  // Czas demonstracyjny
  // ═══════════════════════════════════════════════════════════════════
  const TODAY = '2026-11-10' // wtorek
  const NOW = '15:30'
  const DAY_SHORT = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob']
  const DAY_LONG = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']

  const toMin = (t        )         => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const fromMin = (m        )         => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const parseDate = (d        )       => new Date(`${d}T12:00:00Z`)
  const iso = (dt      )         => dt.toISOString().slice(0, 10)
  const addDays = (d        , n        )         => { const x = parseDate(d); x.setUTCDate(x.getUTCDate() + n); return iso(x) }
  const weekday = (d        )         => { const w = parseDate(d).getUTCDay(); return w === 0 ? 7 : w } // 1 = pn … 7 = nd
  const dShort = (d        )         => { const x = parseDate(d); return `${DAY_SHORT[x.getUTCDay()]} ${String(x.getUTCDate()).padStart(2, '0')}.${String(x.getUTCMonth() + 1).padStart(2, '0')}` }
  const dLong = (d        )         => { const x = parseDate(d); return `${DAY_LONG[x.getUTCDay()]}, ${x.getUTCDate()}.${String(x.getUTCMonth() + 1).padStart(2, '0')}.${x.getUTCFullYear()}` }
  const mondayOf = (d        )         => addDays(d, 1 - weekday(d))
  const ageOn = (birth        , on         = TODAY)         => {
    const b = parseDate(birth); const o = parseDate(on)
    let a = o.getUTCFullYear() - b.getUTCFullYear()
    if (o.getUTCMonth() < b.getUTCMonth() || (o.getUTCMonth() === b.getUTCMonth() && o.getUTCDate() < b.getUTCDate())) a--
    return a
  }
  const zl = (grosze        )         => `${(grosze / 100).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} zł`
  const esc = (s         )         => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]          ))
  const uid = (p        )         => `${p}-${Math.random().toString(36).slice(2, 8)}`
  const overlap = (a1        , a2        , b1        , b2        )          => a1 < b2 && b1 < a2

  // ═══════════════════════════════════════════════════════════════════
  // Dane demonstracyjne (LKS Gwiazda Ściejowice)
  // ═══════════════════════════════════════════════════════════════════
  // Logo klubu: plik logo-klubu.(png|jpg|webp) obok mockupów → logo.js (window.VEREINO_LOGO); bez pliku — przykładowa gwiazda.
  const LOGO_CLUB = (window                                        ).VEREINO_LOGO || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1f6f43"/><path d="M32 12l5.9 12 13.1 1.9-9.5 9.3 2.2 13.1L32 42.1l-11.7 6.2 2.2-13.1-9.5-9.3 13.1-1.9z" fill="#ffd34d"/></svg>')
  const LOGO_BASEN = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1d5fa8"/><path d="M8 38c6 0 6-5 12-5s6 5 12 5 6-5 12-5 6 5 12 5M8 48c6 0 6-5 12-5s6 5 12 5 6-5 12-5 6 5 12 5" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="40" cy="20" r="6" fill="#fff"/></svg>')

                                                                                                                                                                          
  // Godziny otwarcia z regulaminu Orlika — granica dla dostępności do rezerwacji.
  const OPENING                                                                           = { 'pl-boisko': { weekday: ['08:00', '22:00'], weekend: ['09:00', '20:30'] }, 'pl-multi': { weekday: ['08:00', '22:00'], weekend: ['09:00', '20:30'] } }

                
                                                                                                                                                                                                                       
                                                                             
                                                                                                                                    
                                                                                                                                                    
                                                                  
                                                                                                                                            
                                                                                                         
                                                                                                                               
                                     
                                                                              
                                                               
                                                                                                                                               
                                                                                                                           
                                                                                                 
                                                                                                               
                                                                                               
                                                                   
                                                                                                                                                        
                                                                                               
   

  const P = (id        , first        , last        , birth        , extra                  = {})         => ({ id, first, last, birth, updatedAt: 1, ...extra })

  function seed()     {
    const db     = {
      settings: {
        name: 'LKS Gwiazda Ściejowice', short: 'Gwiazda', slug: 'gwiazda', tz: 'Europe/Warsaw', minAge: 13, phone: '600 000 000', logo: LOGO_CLUB,
        description: 'Klub sportowy z Ściejowic: akademia piłkarska dla dzieci i młodzieży, sekcja pływacka i zajęcia ruchowe dla dorosłych. Administrujemy Orlikiem 2024 w imieniu Gminy Liszki.',
        publication: { enabled: true, description_schedule: true, conditions: true, prices: true, coaches: true, materials: true, contact: true, places_calendar: true, online_requests: true },
        updatedAt: 1,
      },
      persons: [
        P('p-kasia', 'Kasia', 'Nowak', '1986-04-02', { email: 'kasia.nowak@example.pl', phone: '600 100 200', account: true }),
        P('p-jas', 'Jaś', 'Nowak', '2017-05-03'),
        P('p-ola', 'Ola', 'Nowak', '2012-03-14', { email: 'ola.nowak@example.pl', account: true }),
        P('p-wojtek', 'Wojtek', 'Malinowski', '1990-06-11', { email: 'wojtek@gwiazda.example', phone: '601 222 333', account: true, publishConsent: true }),
        P('p-piotr', 'Piotr', 'Zieliński', '1995-01-20', { email: 'piotr@gwiazda.example', account: true, publishConsent: true }),
        P('p-anna', 'Anna', 'Kowalczyk', '1992-09-30', { email: 'anna@gwiazda.example', account: true, publishConsent: true }),
        P('p-aneta', 'Aneta', 'Wiśniewska', '1984-02-17', { email: 'aneta@gwiazda.example', account: true, pesel: '84021712345' }),
        P('p-tomek', 'Tomek', 'Lis', '1999-07-07', { email: 'tomek@gwiazda.example', account: true }),
        P('p-ewa', 'Ewa', 'Dąbrowska', '1993-12-01', { email: 'ewa@gwiazda.example', account: true, publishConsent: false }),
        P('p-michal', 'Michał', 'Nowicki', '1994-03-03', { email: 'michal@gwiazda.example', account: true, publishConsent: true }),
        P('p-kamil', 'Kamil', 'Wrona', '1997-08-08', { email: 'kamil@gwiazda.example', account: true, publishConsent: true }),
        P('p-lukasz', 'Łukasz', 'Dudek', '1991-11-11', { email: 'lukasz@gwiazda.example', account: true, publishConsent: false }),
        P('p-marcin', 'Marcin', 'Sobczak', '1980-05-05', { email: 'marcin@gwiazda.example', account: true, publishConsent: true }),
        P('p-natalia', 'Natalia', 'Krawczyk', '1998-02-20', { email: 'natalia@gwiazda.example', account: true, publishConsent: true }),
        P('p-marek', 'Marek', 'Kowalski', '1983-08-08', { email: 'marek.k@example.pl', account: true }),
        P('p-adam', 'Adam', 'Kowalski', '2017-02-14'),
        P('p-zosia', 'Zosia', 'Kowalska', '2012-11-02'),
        P('p-ewelina', 'Ewelina', 'Mazur', '1988-03-03', { email: 'e.mazur@example.pl', account: true }),
        P('p-bartek', 'Bartek', 'Mazur', '2017-06-21'),
        P('p-filip', 'Filip', 'Sowa', '2017-10-10'),
        P('p-robert', 'Robert', 'Tracz', '1985-05-05', { email: 'r.tracz@example.pl' }),
        P('p-lena', 'Lena', 'Tracz', '2017-04-04'),
        P('p-iwona', 'Iwona', 'Pawlak', '1987-01-12', { email: 'iwona.p@example.pl', account: true }),
        P('p-kuba', 'Kuba', 'Pawlak', '2012-07-19', { account: false }),
        P('p-maja', 'Maja', 'Pawlak', '2018-02-02'),
        P('p-dorota', 'Dorota', 'Wójcik', '1979-09-09', { email: 'dorota.w@example.pl', account: true }),
        P('p-teresa', 'Teresa', 'Lis', '1970-04-25', { email: 'teresa.lis@example.pl', account: true }),
      ],
      guardianships: [
        { id: 'gs-1', guardian: 'p-kasia', ward: 'p-jas', relation: 'rodzic', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-2', guardian: 'p-kasia', ward: 'p-ola', relation: 'rodzic', primaryPayer: true, consents: { regulations: true, image: false, trips: true } },
        { id: 'gs-3', guardian: 'p-marek', ward: 'p-adam', relation: 'rodzic', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-4', guardian: 'p-marek', ward: 'p-zosia', relation: 'rodzic', primaryPayer: true, consents: { regulations: true, image: true, trips: false } },
        { id: 'gs-5', guardian: 'p-ewelina', ward: 'p-bartek', relation: 'rodzic', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-6', guardian: 'p-robert', ward: 'p-lena', relation: 'rodzic', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-7', guardian: 'p-iwona', ward: 'p-kuba', relation: 'rodzic', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-8', guardian: 'p-iwona', ward: 'p-maja', relation: 'rodzic', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-9', guardian: 'p-robert', ward: 'p-filip', relation: 'inna', primaryPayer: false, consents: { regulations: true, image: false, trips: false } },
      ],
      roles: [
        { id: 'ra-1', person: 'p-aneta', role: 'club_admin' },
        { id: 'ra-2', person: 'p-wojtek', role: 'coordinator', section: 's-akad' },
        { id: 'ra-3', person: 'p-aneta', role: 'coordinator', section: 's-basen' },
        { id: 'ra-4', person: 'p-wojtek', role: 'coach' },
        { id: 'ra-5', person: 'p-piotr', role: 'coach' },
        { id: 'ra-6', person: 'p-anna', role: 'coach' },
        { id: 'ra-7', person: 'p-ewa', role: 'coach' },
        { id: 'ra-8', person: 'p-tomek', role: 'facility_operator', place: 'pl-orlik' },
        { id: 'ra-9', person: 'p-michal', role: 'coach' }, { id: 'ra-10', person: 'p-kamil', role: 'coach' }, { id: 'ra-11', person: 'p-lukasz', role: 'coach' },
        { id: 'ra-12', person: 'p-marcin', role: 'coach' }, { id: 'ra-13', person: 'p-natalia', role: 'coach' },
        { id: 'ra-14', person: 'p-ewa', role: 'coordinator', section: 's-zumba' }, { id: 'ra-15', person: 'p-natalia', role: 'coordinator', section: 's-cheer' },
      ],
      sections: [
        { id: 's-akad', name: 'Akademia piłkarska', slug: 'akademia', short: 'Piłka nożna dla dzieci i młodzieży od 4 lat — osiem grup rocznikowych, od Kids do Trampkarza.', description: 'Akademia Gwiazdy: treningi na boisku Gwiazdy Ściejowice według programu PZPN „Grassroots” — radość z gry, technika i współpraca. Drużyny grają w ligach OZPN.', isPublic: true, conditions: 'Deklaracja członkowska, badania lekarskie (od kategorii Trampkarz), strój sportowy, obuwie na sztuczną murawę.', contactName: 'Akademia Gwiazdy', contactEmail: 'akademiagwiazdy@gmail.com', contactPhone: '608 07 29 29', materials: ['Regulamin akademii (PDF)', 'Deklaracja członkowska (PDF)', 'Grafik treningów (PDF)'], active: true, color: 'akad', updatedAt: 1 },
        { id: 's-basen', logo: LOGO_BASEN, name: 'Basen', slug: 'basen', short: 'Nauka i doskonalenie pływania dla dzieci 6–12 lat.', description: 'Zajęcia w małych grupach na basenie zewnętrznym, z instruktorkami pływania. Zimą zajęcia na krytej pływalni partnerskiej.', isPublic: true, conditions: 'Strój kąpielowy, czepek, klapki, ręcznik. Dziecko musi być zdrowe — zaświadczenie lekarskie przy zapisie.', contactName: 'Aneta Wiśniewska — koordynatorka', contactEmail: 'basen@gwiazda.example', contactPhone: '602 333 444', materials: ['Regulamin sekcji pływackiej (PDF)'], active: true, color: 'basen', updatedAt: 1 },
        { id: 's-zumba', name: 'Zumba', slug: 'zumba', short: 'Taniec fitness przy muzyce latino dla młodzieży i dorosłych.', description: 'Godzina dobrej energii w salce klubowej — bez wymagań, w przyjaznej atmosferze.', isPublic: true, conditions: 'Wygodny strój i buty sportowe, woda. Od 16 lat.', contactName: 'Ewa Dąbrowska — instruktorka', contactEmail: 'zumba@gwiazda.example', contactPhone: '600 000 000', materials: [], active: true, color: 'zumba', updatedAt: 1 },
        { id: 's-szachy', name: 'Szachy', slug: 'szachy', short: 'Nauka gry w szachy dla dzieci od 7 lat i dorosłych.', description: 'Zasady, taktyka i turnieje klubowe. Zajęcia w salce klubowej.', isPublic: true, conditions: 'Bez wymagań — szachownice zapewnia klub.', contactName: 'Biuro klubu', contactEmail: 'biuro@gwiazda.example', contactPhone: '600 000 000', materials: ['Regulamin turnieju klubowego (PDF)'], active: true, color: 'szachy', updatedAt: 1 },
        { id: 's-cheer', name: 'Cheerleader', slug: 'cheerleader', short: 'Taniec, akrobatyka i doping na meczach klubu dla dziewcząt i chłopców 8–14 lat.', description: 'Układy taneczne z pomponami, elementy akrobatyki i występy podczas meczów Gwiazdy.', isPublic: true, conditions: 'Strój sportowy, obuwie na halę. Pompony zapewnia klub.', contactName: 'Natalia Krawczyk — trenerka', contactEmail: 'cheer@gwiazda.example', contactPhone: '600 000 000', materials: [], active: true, color: 'cheer', updatedAt: 1 },
      ],
      places: [
        { id: 'pl-orlik', name: 'Orlik 2024', kind: 'kompleks', publicSchedule: false, acceptsRequests: false, capacity: 1, address: 'ul. Sportowa 1, Ściejowice' },
        { id: 'pl-boisko', parent: 'pl-orlik', name: 'Boisko piłkarskie', kind: 'boisko', slug: 'orlik-boisko', publicSchedule: true, acceptsRequests: true, capacity: 2, address: 'ul. Sportowa 1, Ściejowice', surface: 'sztuczna trawa' },
        { id: 'pl-multi', parent: 'pl-orlik', name: 'Boisko wielofunkcyjne', kind: 'boisko wielofunkcyjne', slug: 'orlik-wielofunkcyjne', publicSchedule: true, acceptsRequests: true, capacity: 2, address: 'ul. Sportowa 1, Ściejowice', surface: 'poliuretan' },
        { id: 'pl-salka', name: 'Salka w budynku klubowym', kind: 'sala', slug: 'salka', publicSchedule: true, acceptsRequests: false, capacity: 1, address: 'Budynek klubowy, Ściejowice' },
        { id: 'pl-basen', name: 'Basen zewnętrzny', kind: 'basen', slug: 'basen', publicSchedule: false, acceptsRequests: false, capacity: 2, address: 'Pływalnia partnerska, Liszki' },
      ],
      institutions: [
        { id: 'i-gmina', name: 'Gmina Liszki', type: 'gmina', contact: 'Referat Sportu, 12 000 00 00', bank: 'PL 12 1240 0000 0000 0000 1234 5678' },
        { id: 'i-sasiedzi', name: 'KS Sąsiedzi', type: 'klub', contact: 'Jan Nowicki, 603 000 111' },
        { id: 'i-abak', name: 'Abak sp. z o.o.', type: 'firma', contact: 'Recepcja, 12 345 67 89' },
        { id: 'i-szkola', name: 'SP Ściejowice', type: 'szkoła', contact: 'Sekretariat, 12 111 22 33' },
      ],
      contracts: [
        { id: 'k-1', party: 'p-wojtek', kind: 'trener', from: '2026-09-01', base: 120000, unit: 6000, match: 10000, travel: 5000 },
        { id: 'k-2', party: 'p-piotr', kind: 'trener', from: '2026-09-01', base: 80000, unit: 5500, match: 10000, travel: 5000 },
        { id: 'k-3', party: 'p-anna', kind: 'trener', from: '2026-09-01', base: 0, unit: 7000, match: 0, travel: 0 },
        { id: 'k-4', party: 'p-ewa', kind: 'trener', from: '2026-09-01', base: 0, unit: 8000, match: 0, travel: 0 },
        { id: 'k-6', party: 'p-michal', kind: 'trener', from: '2026-09-01', base: 60000, unit: 5500, match: 10000, travel: 5000 },
        { id: 'k-7', party: 'p-kamil', kind: 'trener', from: '2026-09-01', base: 0, unit: 5000, match: 0, travel: 0 },
        { id: 'k-8', party: 'p-lukasz', kind: 'trener', from: '2026-09-01', base: 60000, unit: 5500, match: 10000, travel: 5000 },
        { id: 'k-9', party: 'p-marcin', kind: 'trener', from: '2026-09-01', base: 0, unit: 6000, match: 0, travel: 0 },
        { id: 'k-10', party: 'p-natalia', kind: 'trener', from: '2026-09-01', base: 0, unit: 6500, match: 0, travel: 0 },
        { id: 'k-5', party: 'i-gmina', kind: 'administracyjna', from: '2026-01-01', base: 0, unit: 0, match: 0, travel: 0, note: 'Wpłata 3 dni przed terminem; bez automatycznego wygaszania' },
      ],
      groups: [
        { id: 'g-kids', section: 's-akad', name: 'Kids', kind: 'team', category: 'rocznik 2021–2022', season: '2026/27', ageFrom: 4, ageTo: 5, isPublic: true, publicDescription: 'Pierwsze spotkanie z piłką: zabawy ruchowe, koordynacja i radość z gry.', conditions: 'Strój sportowy, obuwie na sztuczną murawę, bidon.', members: [], coaches: ['p-kamil'] },
        { id: 'g-skrzat', section: 's-akad', name: 'Skrzat', kind: 'team', category: 'rocznik 2020', season: '2026/27', ageFrom: 6, ageTo: 6, isPublic: true, publicDescription: 'Gry i zabawy z piłką, pierwsze mini-mecze.', conditions: 'Strój sportowy, obuwie na sztuczną murawę, bidon.', members: [], coaches: ['p-kamil'] },
        { id: 'g-zakm', section: 's-akad', name: 'Żak młodszy', kind: 'team', category: 'rocznik 2019', league: 'Liga Żaka OZPN', season: '2026/27', ageFrom: 7, ageTo: 7, isPublic: true, publicDescription: 'Prowadzenie piłki, podania, gra 3×3 i 4×4.', conditions: 'Strój sportowy, obuwie na sztuczną murawę, bidon.', members: [], coaches: ['p-michal'] },
        { id: 'g-zaks', section: 's-akad', name: 'Żak starszy', kind: 'team', category: 'rocznik 2018', league: 'Liga Żaka OZPN', season: '2026/27', ageFrom: 8, ageTo: 8, isPublic: true, publicDescription: 'Technika użytkowa i mini-mecze ligowe 5×5.', conditions: 'Strój sportowy, obuwie na sztuczną murawę, bidon.', members: [], coaches: ['p-wojtek'] },
        { id: 'g-orlm', section: 's-akad', name: 'Orlik młodszy', kind: 'team', category: 'rocznik 2017', league: 'Liga Orlika OZPN', season: '2026/27', ageFrom: 9, ageTo: 9, isPublic: true, publicDescription: 'Gra 5×5, technika użytkowa, pierwsze elementy taktyki.', conditions: 'Strój sportowy, obuwie na sztuczną murawę, bidon.', members: ['p-jas', 'p-adam', 'p-bartek', 'p-filip', 'p-lena'], coaches: ['p-wojtek'] },
        { id: 'g-orls', section: 's-akad', name: 'Orlik starszy', kind: 'team', category: 'rocznik 2015–2016', league: 'Liga Orlika OZPN', season: '2026/27', ageFrom: 10, ageTo: 11, isPublic: true, publicDescription: 'Gra 7×7, przygotowanie do piłki jedenastoosobowej.', conditions: 'Strój sportowy, obuwie na sztuczną murawę, bidon.', members: [], coaches: ['p-lukasz'] },
        { id: 'g-mlodzik', section: 's-akad', name: 'Młodzik starszy', kind: 'team', category: 'rocznik 2014', league: 'Liga Młodzika OZPN', season: '2026/27', ageFrom: 12, ageTo: 12, isPublic: true, publicDescription: 'Taktyka zespołowa i mecze ligowe 9×9.', conditions: 'Strój sportowy, obuwie na sztuczną murawę, bidon.', members: [], coaches: ['p-lukasz'] },
        { id: 'g-tramp', section: 's-akad', name: 'Trampkarz', kind: 'team', category: 'rocznik 2012–2013', league: 'II liga Trampkarzy OZPN', season: '2026/27', ageFrom: 13, ageTo: 14, isPublic: true, publicDescription: 'Treningi taktyczne i mecze ligowe 11×11.', conditions: 'Badania lekarskie, korki/turfy, ochraniacze.', members: ['p-ola', 'p-zosia', 'p-kuba'], coaches: ['p-piotr'] },
        { id: 'g-basen1', section: 's-basen', name: 'Basen — początkujący', kind: 'class_group', level: 'początkujący', ageFrom: 6, ageTo: 9, isPublic: true, publicDescription: 'Oswojenie z wodą, oddychanie, kraul na plecach.', conditions: 'Czepek, okularki, klapki.', members: ['p-jas', 'p-maja'], coaches: ['p-anna'] },
        { id: 'g-zumba', section: 's-zumba', name: 'Zumba', kind: 'class_group', level: 'wszyscy', ageFrom: 16, isPublic: true, publicDescription: 'Taniec fitness przy muzyce latino — godzina dobrej energii.', conditions: 'Wygodne buty sportowe.', members: ['p-dorota', 'p-teresa'], coaches: ['p-ewa'] },
        { id: 'g-szachy', section: 's-szachy', name: 'Szachy — początkujący', kind: 'class_group', level: 'początkujący', ageFrom: 7, isPublic: true, publicDescription: 'Ruchy figur, matowanie, pierwsze otwarcia i partie turniejowe.', conditions: 'Bez wymagań.', members: ['p-maja'], coaches: ['p-marcin'] },
        { id: 'g-cheer', section: 's-cheer', name: 'Cheerleaderki', kind: 'class_group', level: 'wszyscy', ageFrom: 8, ageTo: 14, isPublic: true, publicDescription: 'Układy z pomponami, akrobatyka i występy na meczach.', conditions: 'Strój sportowy, obuwie na halę.', members: ['p-zosia'], coaches: ['p-natalia'] },
      ],
      externalTeams: [
        { id: 'et-rzesz', name: 'LKS Rzeszotary' }, { id: 'et-myd', name: 'UKS Mydlniki' }, { id: 'et-liszki', name: 'Wisła Liszki' }, { id: 'et-sas', name: 'KS Sąsiedzi' }, { id: 'et-kryspinow', name: 'Orzeł Kryspinów' },
      ],
      activities: [
        { id: 'a-kids', group: 'g-kids', name: 'Trening Kids', type: 'training', weekdays: [1, 3], start: '17:05', end: '18:05', place: 'pl-multi', coach: 'p-kamil', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-skrzat', group: 'g-skrzat', name: 'Trening Skrzatów', type: 'training', weekdays: [1, 3], start: '18:15', end: '19:15', place: 'pl-multi', coach: 'p-kamil', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-zakm', group: 'g-zakm', name: 'Trening Żaków młodszych', type: 'training', weekdays: [1, 3], start: '18:15', end: '19:30', place: 'pl-multi', coach: 'p-michal', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-zaks', group: 'g-zaks', name: 'Trening Żaków starszych', type: 'training', weekdays: [1, 3], start: '18:15', end: '19:30', place: 'pl-boisko', coach: 'p-wojtek', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-orlm', group: 'g-orlm', name: 'Trening Orlików młodszych', type: 'training', weekdays: [2, 4], start: '17:00', end: '18:30', place: 'pl-boisko', coach: 'p-wojtek', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-orls', group: 'g-orls', name: 'Trening Orlików starszych', type: 'training', weekdays: [2, 4], start: '17:40', end: '19:10', place: 'pl-boisko', coach: 'p-lukasz', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-mlodzik', group: 'g-mlodzik', name: 'Trening Młodzików starszych', type: 'training', weekdays: [2, 4], start: '16:00', end: '17:30', place: 'pl-boisko', coach: 'p-lukasz', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-tramp', group: 'g-tramp', name: 'Trening Trampkarzy', type: 'training', weekdays: [1, 3], start: '18:00', end: '19:30', place: 'pl-boisko', coach: 'p-piotr', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-basen', group: 'g-basen1', name: 'Zajęcia na basenie', type: 'training', weekdays: [4], start: '16:00', end: '17:00', place: 'pl-basen', coach: 'p-anna', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-zumba', group: 'g-zumba', name: 'Zumba', type: 'training', weekdays: [2], start: '19:00', end: '20:00', place: 'pl-salka', coach: 'p-ewa', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-szachy', group: 'g-szachy', name: 'Szachy', type: 'training', weekdays: [3], start: '16:30', end: '17:30', place: 'pl-salka', coach: 'p-marcin', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-cheer', group: 'g-cheer', name: 'Trening cheerleaderek', type: 'training', weekdays: [5], start: '17:00', end: '18:30', place: 'pl-salka', coach: 'p-natalia', from: '2026-09-01', to: '2027-06-30' },
        { id: 'a-turniej-szach', group: 'g-szachy', name: 'II Turniej Szachowy z Gwiazdą o Puchar Wójta Gminy Liszki', type: 'tournament', weekdays: [6], start: '10:00', end: '15:00', place: 'pl-salka', coach: 'p-marcin', from: '2026-10-17', to: '2026-10-17', oneOff: true,
          info: ['Turniej dla dzieci i młodzieży z gminy Liszki urodzonych w 2012 r. i młodszych, z maksymalnym rankingiem PZSzach 1600.', 'Start o godz. 10:00, budynek klubowy LKS Gwiazda Ściejowice.', 'Zapisy przez formularz.', 'Wpisowe: 40 zł; dla zawodników Gwiazdy i CIS Czernichów: 10 zł.'] },
        { id: 'a-mecz', group: 'g-tramp', name: 'Mecz ligowy: Gwiazda — LKS Rzeszotary', type: 'match', weekdays: [7], start: '10:00', end: '11:30', place: 'pl-boisko', coach: 'p-piotr', from: '2026-11-15', to: '2026-11-15', opponent: 'et-rzesz', oneOff: true },
      ],
      occurrences: [], attendance: {}, substitutions: [],
      policies: [
        { id: 'po-1', scope: 'klub', target: 'cały klub', mode: 'immediate', hours: 24, after: 'declared' },
        { id: 'po-2', scope: 'typ aktywności', target: 'mecz', mode: 'guardian_confirm', hours: 24, after: 'declared' },
        { id: 'po-3', scope: 'typ aktywności', target: 'turniej', mode: 'guardian_confirm', hours: 24, after: 'declared' },
        { id: 'po-4', scope: 'typ aktywności', target: 'obóz', mode: 'guardian_confirm', hours: 48, after: 'rejected' },
      ],
      threads: [],
      fees: [
        { id: 'f-orlm', name: 'Składka Orlik młodszy', group: 'g-orlm', amount: 15000, dueDay: 10, period: 'miesięczna' },
        { id: 'f-tramp', name: 'Składka Trampkarz', group: 'g-tramp', amount: 16000, dueDay: 10, period: 'miesięczna' },
        { id: 'f-basen', name: 'Składka Basen — początkujący', group: 'g-basen1', amount: 12000, dueDay: 10, period: 'miesięczna' },
        { id: 'f-zumba', name: 'Karnet Zumba', group: 'g-zumba', amount: 10000, dueDay: 10, period: 'miesięczna' },
        { id: 'f-szachy', name: 'Składka Szachy', group: 'g-szachy', amount: 8000, dueDay: 10, period: 'miesięczna' },
        { id: 'f-cheer', name: 'Składka Cheerleader', group: 'g-cheer', amount: 9000, dueDay: 10, period: 'miesięczna' },
      ],
      discounts: [{ id: 'd-sib', name: 'Rodzeństwo', kind: 'rodzeństwo', percent: 30 }],
      charges: [],
      zones: {},
      rates: [
        { place: 'pl-boisko', category: 'municipal_club', label: 'Klub z gminy', price: 12000 },
        { place: 'pl-boisko', category: 'municipal_club_winter_lighting', label: 'Klub z gminy — zima z oświetleniem', price: 18000 },
        { place: 'pl-boisko', category: 'external_commercial', label: 'Zewnętrzny / komercyjny', price: 30000 },
        { place: 'pl-multi', category: 'municipal_club', label: 'Klub z gminy', price: 8000 },
        { place: 'pl-multi', category: 'municipal_club_winter_lighting', label: 'Klub z gminy — zima z oświetleniem', price: 15000 },
        { place: 'pl-multi', category: 'external_commercial', label: 'Zewnętrzny / komercyjny', price: 22000 },
      ],
      rentals: [
        { id: 'r-abak', place: 'pl-boisko', renter: 'Abak sp. z o.o.', renterId: 'i-abak', category: 'external_commercial', contact: 'Marta Abak', email: 'marta@abak.example', phone: '605 111 222', date: '2026-11-10', start: '19:30', end: '21:00', units: 1, amount: 30000, status: 'confirmed', via: 'telefon' },
        { id: 'r-sas', place: 'pl-boisko', renter: 'KS Sąsiedzi', renterId: 'i-sasiedzi', category: 'municipal_club_winter_lighting', contact: 'Jan Nowicki', email: 'jan@sasiedzi.example', phone: '603 000 111', date: '2026-11-11', start: '19:30', end: '21:00', units: 1, amount: 18000, status: 'requested', via: 'telefon' },
        { id: 'r-myd', place: 'pl-boisko', renter: 'UKS Mydlniki', category: 'municipal_club_winter_lighting', contact: 'Paweł Mydlnicki', email: 'kontakt@mydlniki.example', phone: '604 222 333', date: '2026-11-13', start: '19:30', end: '21:00', units: 1, amount: 18000, status: 'pending_approval', via: 'online', holdUntil: '2026-11-11 14:00', purpose: 'Sparing seniorów' },
        { id: 'r-xyz', place: 'pl-boisko', renter: 'Akademia Ruchu Kraków', category: 'external_commercial', contact: 'Ewa Ruch', email: 'biuro@akademiaruchu.example', phone: '606 333 444', date: '2026-11-14', start: '09:00', end: '10:30', units: 1, amount: 30000, status: 'pending_approval', via: 'online', holdUntil: '2026-11-12 09:00', purpose: 'Zajęcia ogólnorozwojowe', banMatch: false },
        { id: 'r-old', place: 'pl-boisko', renter: 'SP Ściejowice', renterId: 'i-szkola', category: 'municipal_club', contact: 'Sekretariat', email: 'sp@sciejowice.example', phone: '12 111 22 33', date: '2026-11-02', start: '19:30', end: '21:00', units: 1, amount: 18000, status: 'done', via: 'telefon' },
      ],
      bookings: [
        { id: 'b-szk', place: 'pl-salka', date: '2026-11-12', start: '20:00', end: '21:30', purpose: 'Szkolenie trenerów (UEFA Grassroots)', by: 'p-aneta', section: 's-akad', status: 'confirmed' },
      ],
      closures: [
        { id: 'cl-1', place: 'pl-boisko', date: '2026-11-18', start: '08:00', end: '22:00', reason: 'konserwacja', note: 'Szczotkowanie i uzupełnienie granulatu' },
      ],
      logs: [
        { id: 'lg-1', date: '2026-11-09', operator: 'p-tomek', opened: '15:55', closed: '21:10', before: 'Boisko suche, siatki OK', after: 'Bez uwag', remarks: '' },
      ],
      incidents: [
        { id: 'in-1', date: '2026-11-07', place: 'pl-boisko', kind: 'uszkodzenie', description: 'Rozerwana siatka w bramce północnej po zajęciach grupy wynajmującej.', action: 'upomnienie', by: 'p-tomek' },
      ],
      bans: [
        { id: 'bn-1', subject: 'Grupa „Orły” (nieformalna)', from: '2026-10-15', to: '2026-12-31', reason: 'Wielokrotne wejście na boisko w obuwiu z wkrętami', by: 'p-aneta' },
      ],
      maintenance: [
        { id: 'mt-1', place: 'pl-boisko', kind: 'przegląd roczny', responsible: 'gmina', due: '2026-11-30' },
        { id: 'mt-2', place: 'pl-boisko', kind: 'szczotkowanie nawierzchni', responsible: 'klub', due: '2026-11-18' },
      ],
      mails: [], bankImports: [], bankTx: [], receiptSeq: 6,
      kitCampaigns: [], kitOrders: [], kitTokens: { 'kit-robert': { guardian: 'p-robert', campaign: 'oc-akad' } }, cashHandovers: [],
      tokens: { 'tok-expired': { guardian: 'p-kasia', occ: 'a-orlm-2026-11-10', expired: true } },
      log: { opened: false, closed: false, before: '', after: '' },
    }

    const weekdays                                   = [['public_free', '08:00', '16:00', 1], ['club_training', '16:00', '19:30', 2], ['reservable_paid', '19:30', '22:00', 2]]
    const weekend                                   = [['reservable_paid', '09:00', '13:00', 2], ['public_free', '13:00', '20:30', 1]]
    for (const pid of ['pl-boisko', 'pl-multi']) {
      db.zones[pid] = [
        ...weekdays.map(([zone, from, to, priority]) => ({ days: [1, 2, 3, 4, 5], from, to, zone, priority })),
        ...weekend.map(([zone, from, to, priority]) => ({ days: [6, 7], from, to, zone, priority })),
      ]
    }
    db.zones['pl-salka'] = [{ days: [1, 2, 3, 4, 5, 6, 7], from: '08:00', to: '22:00', zone: 'club_training', priority: 2 }]
    db.zones['pl-basen'] = [{ days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '20:00', zone: 'club_training', priority: 2 }]

    // Terminy z reguł aktywności: od początku listopada do końca roku (horyzont generatora).
    for (const a of db.activities) generateOccurrences(db, a, a.oneOff && a.from < '2026-11-02' ? a.from : '2026-11-02', '2026-12-31')
    const occ = (id        )             => db.occurrences.find((o) => o.id === id)              
    for (const o of db.occurrences) if (o.date < TODAY && o.id !== 'a-tramp-2026-11-09') o.status = 'done'
    for (const o of db.occurrences) if (o.date === '2026-11-11') { o.status = 'cancelled'; o.cancelReason = 'Święto Niepodległości' }
    occ('a-orlm-2026-11-05').coach = 'p-piotr'
    db.substitutions.push({ occ: 'a-orlm-2026-11-05', prev: 'p-wojtek', next: 'p-piotr', kind: 'substitute_assigned', at: '2026-11-04 20:10', by: 'p-wojtek', reason: 'Kurs trenerski' })
    occ('a-orlm-2026-11-12').coach = null
    db.substitutions.push({ occ: 'a-orlm-2026-11-12', prev: 'p-wojtek', next: null, kind: 'absence_reported', at: '2026-11-09 21:40', by: 'p-wojtek', reason: 'Wyjazd służbowy' })
    for (const o of db.occurrences) if (o.status === 'done') {
      const g = db.groups.find((x) => x.id === o.group)         
      db.attendance[o.id] = Object.fromEntries(g.members.map((m, i) => [m, { declared: 'yes', status: 'final', actual: i === 1 ? 'absent' : 'present' }              ]))
    }
    db.attendance['a-orlm-2026-11-10'] = {
      'p-adam': { declared: 'yes', status: 'final', by: 'p-marek' },
      'p-bartek': { declared: 'yes', status: 'final', by: 'p-ewelina' },
      'p-lena': { declared: 'no', status: 'final', by: 'p-robert' },
    }
    db.attendance['a-mecz-2026-11-15'] = { 'p-ola': { declared: 'yes', status: 'pending_guardian', by: 'p-ola' }, 'p-kuba': { declared: 'yes', status: 'final', by: 'p-iwona' } }

    db.threads = [
      { id: 't-orlm', scope: 'group', scopeId: 'g-orlm', scopeLabel: 'Grupa: Orlik młodszy', subject: 'Czwartkowy trening — zmiana trenera', isCase: false, readBy: [], messages: [
        { id: 'm1', author: 'p-wojtek', role: 'trener', body: 'Dzień dobry! W czwartek 12.11 nie poprowadzę treningu — koordynator wskaże zastępstwo, godzina bez zmian (17:00).', at: '2026-11-09 21:45', delivered: 6, failed: 0 },
      ] },
      { id: 't-cancel', scope: 'occurrence', scopeId: 'a-tramp-2026-11-11', scopeLabel: 'Termin: Trening Trampkarzy, śr 11.11', subject: 'Trening odwołany — Święto Niepodległości', isCase: false, readBy: ['p-kasia'], messages: [
        { id: 'm2', author: 'p-piotr', role: 'trener', body: 'Trening w środę 11.11 jest odwołany (święto). Widzimy się w poniedziałek.', at: '2026-11-05 10:00', delivered: 4, failed: 1 },
      ] },
      { id: 't-uwagi', scope: 'group', scopeId: 'g-tramp', scopeLabel: 'Grupa: Trampkarz', subject: 'Uwagi do składu na mecz', isCase: false, readBy: ['p-kasia'], messages: [
        { id: 'm3', author: 'p-iwona', role: 'opiekun', body: 'Kuba trzeci mecz z rzędu siedzi na ławce, a trenuje najczęściej z całej grupy. Proszę o wyjaśnienie zasad wyboru składu.', at: '2026-11-08 19:12', delivered: 2, failed: 0 },
        { id: 'm4', author: 'p-piotr', role: 'trener', body: 'Dziękuję za wiadomość. Zapraszam na rozmowę po poniedziałkowym treningu — omówimy plan rotacji.', at: '2026-11-08 20:30', delivered: 2, failed: 0 },
      ] },
      { id: 't-walne', scope: 'club', scopeId: 'club', scopeLabel: 'Cały klub', subject: 'Walne zebranie członków 28.11', isCase: false, readBy: [], messages: [
        { id: 'm5', author: 'p-aneta', role: 'administrator', body: 'Zapraszamy na walne zebranie 28.11 o 18:00 w salce klubowej. Porządek obrad w załączniku.', at: '2026-11-06 12:00', delivered: 41, failed: 2 },
      ] },
    ]

    // Należności: października i listopada (generator z zniżką na rodzeństwo).
    generateCharges(db, '2026-10')
    generateCharges(db, '2026-11')
    for (const c of db.charges) if (c.period === '2026-10') { c.status = 'paid'; c.payments = [{ amount: c.amount - c.discount, method: 'przelew', date: '2026-10-08' }] }
    const oct = (person        )                     => db.charges.find((c) => c.period === '2026-10' && c.person === person)
    const mazur = oct('p-bartek'); if (mazur) { mazur.status = 'open'; mazur.payments = [] }
    const adam = oct('p-adam'); if (adam) { adam.status = 'partially_paid'; adam.payments = [{ amount: 5000, method: 'gotówka', date: '2026-10-12' }] }
    for (const c of db.charges) if (c.payerMissing) { c.status = 'open'; c.payments = [] }
    // Wynajmy: należności na rzecz gminy.
    for (const r of db.rentals) if (['requested', 'confirmed', 'done'].includes(r.status)) {
      const ch = rentalCharge(db, r)
      if (r.status !== 'requested') { ch.status = 'paid'; ch.payments = [{ amount: ch.amount, method: 'przelew na konto gminy', date: addDays(r.date, -3) }] }
    }
    seedKit(db)
    return db
  }

  function generateOccurrences(db    , a          , from        , to        )               {
    const created               = []
    const start = a.from > from ? a.from : from
    const end = a.to < to ? a.to : to
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (!a.weekdays.includes(weekday(d))) continue
      const id = `${a.id}-${d}`
      if (db.occurrences.some((o) => o.id === id)) continue
      const o             = { id, activity: a.id, group: a.group, name: a.name, type: a.type, date: d, start: a.start, end: a.end, place: a.place, coach: a.coach, defaultCoach: a.coach, status: 'planned', opponent: a.opponent, invited: a.invited, updatedAt: 1 }
      db.occurrences.push(o); created.push(o)
    }
    return created
  }

  function generateCharges(db    , period        )                                                        {
    let created = 0, skipped = 0, missing = 0
    const due = `${period}-10`
    const rows                                 = []
    for (const fee of db.fees) {
      const g = db.groups.find((x) => x.id === fee.group)
      if (!g) continue
      for (const m of g.members) rows.push({ fee, person: m })
    }
    const payerOf = (person        )                     => {
      const gs = db.guardianships.find((x) => x.ward === person && x.primaryPayer)
      if (gs) return gs.guardian
      const p = db.persons.find((x) => x.id === person)
      if (p && ageOn(p.birth) >= 18) return person
      return undefined
    }
    // Ranking rodzeństwa per płatnik: najstarsze dziecko pełna stawka.
    const byPayer                           = {}
    for (const r of rows) { const pay = payerOf(r.person); if (pay && pay !== r.person) (byPayer[pay] ||= []).includes(r.person) || byPayer[pay].push(r.person) }
    for (const pay of Object.keys(byPayer)) byPayer[pay].sort((a, b) => (personById(db, a).birth < personById(db, b).birth ? -1 : 1))
    for (const r of rows) {
      if (db.charges.some((c) => c.source === 'fee' && c.sourceId === r.fee.id && c.person === r.person && c.period === period)) { skipped++; continue }
      const payer = payerOf(r.person)
      const rank = payer && byPayer[payer] ? byPayer[payer].indexOf(r.person) : 0
      const discount = rank >= 1 ? Math.round(r.fee.amount * 0.3) : 0
      const p = personById(db, r.person)
      db.charges.push({ id: uid('ch'), source: 'fee', sourceId: r.fee.id, person: r.person, payerPerson: payer, payerMissing: !payer, description: `${r.fee.name} — ${p.first} ${p.last}`, period, amount: r.fee.amount, discount, discountName: discount ? 'Rodzeństwo −30%' : undefined, due, payee: 'club', status: 'open', payments: [], updatedAt: 1 })
      created++
      if (!payer) missing++
    }
    return { created, skipped, missing }
  }

  function rentalCharge(db    , r        )         {
    const ch         = { id: uid('ch'), source: 'rental', sourceId: r.id, payerInstitution: r.renter, description: `Wynajem: ${placeName(db, r.place)}, ${dShort(r.date)} ${r.start}–${r.end}`, amount: r.amount, discount: 0, due: addDays(r.date, -3), payee: 'owner_institution', status: 'open', payments: [], updatedAt: 1 }
    db.charges.push(ch); r.chargeId = ch.id
    return ch
  }

  // Szablon formularza strojów Akademii (jak dotychczasowy Formularz Google).
  const KIT_CHILD = ['104', '116', '128', '140', '152', '164']
  const KIT_DESC = 'Zamawiamy stroje meczowe i treningowe dla dzieci z Akademii. Komplet meczowy z nadrukiem herbu, numeru i imienia kosztuje 120 zł; elementy można też zamówić osobno. Stroje odbierzecie u trenera po dostawie (ok. 3 tygodnie od zamknięcia zamówień).'
  function kitTemplate()               {
    return [
      { id: 'kp-koszulka', name: 'Koszulka meczowa Hummel niebieska', kind: 'item', sizesChild: [...KIT_CHILD], sizesAdult: ['S', 'M', 'L'], priceChild: 6000, priceAdult: 6000, required: true },
      { id: 'kp-spodenki', name: 'Spodenki Hummel czerwone', kind: 'item', sizesChild: [...KIT_CHILD], sizesAdult: ['S', 'M', 'L'], priceChild: 5000, priceAdult: 5000, required: true },
      { id: 'kp-getry', name: 'Getry', kind: 'item', sizesChild: ['31–34', '35–38', '39–42', '43–46'], sizesAdult: [], priceChild: 2500, required: true },
      { id: 'kp-komplet', name: 'Strój meczowy w komplecie: koszulka, spodenki i getry z nadrukiem herbu, numeru i imienia', kind: 'set', components: ['kp-koszulka', 'kp-spodenki', 'kp-getry'], sizesChild: [], sizesAdult: [], priceChild: 12000, required: false },
      { id: 'kp-dres', name: 'Dres Hummel granatowy', kind: 'item', sizesChild: KIT_CHILD.slice(1), sizesAdult: ['S', 'M', 'L'], priceChild: 18000, priceAdult: 20000, required: true },
      { id: 'kp-ortalion', name: 'Ortalion', kind: 'item', sizesChild: KIT_CHILD.slice(1), sizesAdult: ['S', 'M', 'L'], priceChild: 10000, priceAdult: 10000, required: true },
      { id: 'kp-czapka', name: 'Czapka truckerka', kind: 'item', sizesChild: [], sizesAdult: [], priceChild: 3000, required: false },
      { id: 'kp-bidon', name: 'Termos / bidon', kind: 'item', sizesChild: [], sizesAdult: [], priceChild: 3000, required: false },
    ]
  }

  // Wycena zamówienia: komplet zastępuje ceny swoich elementów; rozmiar dorosły może mieć inną cenę.
  function kitPrice(c             , choice                        , set         )                                                    {
    const errs         = {}, lines            = []
    const setP = c.products.find((p) => p.kind === 'set')
    const inSet = new Set(set && setP ? setP.components || [] : [])
    if (set && setP) {
      const sizes                         = {}
      for (const id of inSet) { const v = choice[id] || ''; if (!v || v === 'none' || v === 'yes') errs[`p-${id}`] = 'Komplet wymaga rozmiaru tego elementu.'; else sizes[id] = v }
      lines.push({ product: setP.id, size: '', sizes, price: setP.priceChild })
    }
    for (const p of c.products) {
      if (p.kind === 'set' || inSet.has(p.id)) continue
      const v = choice[p.id] || ''
      if (!v) { if (p.required) errs[`p-${p.id}`] = 'Wybierz rozmiar albo „Nie zamawiam”.'; continue }
      if (v === 'none') continue
      lines.push({ product: p.id, size: v === 'yes' ? '' : v, price: p.sizesAdult.includes(v) ? (p.priceAdult ?? p.priceChild) : p.priceChild })
    }
    if (!lines.length && !Object.keys(errs).length) errs._ = 'Zamówienie jest puste — wybierz co najmniej jedną rzecz.'
    return { lines, total: lines.reduce((a, l) => a + l.price, 0), errs }
  }

  // Zamówienie tworzy należność płatnika = osoby zamawiającej (source_type „order”).
  function kitCharge(dbx    , c             , o          )         {
    const kid = personById(dbx, o.child)
    const ch         = { id: uid('ch'), source: 'order', sourceId: o.id, person: o.child, payerPerson: o.by, description: `Stroje: ${c.name} — ${kid.first} ${kid.last}`, amount: o.lines.reduce((a, l) => a + l.price, 0), discount: 0, due: c.payDue, payee: 'club', status: 'open', payments: [], updatedAt: 1 }
    dbx.charges.push(ch)
    return ch
  }

  function seedKit(dbx    )       {
    const c              = { id: 'oc-akad', name: 'Stroje Akademii — zima 2026', description: KIT_DESC, section: 's-akad', groups: dbx.groups.filter((g) => g.section === 's-akad').map((g) => g.id), closes: '2026-11-20', payDue: '2026-12-04', status: 'open', printName: true, printNumber: true, notesLabel: 'Dodatkowe prośby (np. strój bramkarski, ochraniacze, rękawice)', products: kitTemplate(), supplier: 'Hummel — hurtownia Sport-Team', createdBy: 'p-aneta' }
    dbx.kitCampaigns.push(c)
    const add = (child        , by        , choice                        , set         , printNumber        , at        , pay      )       => {
      const priced = kitPrice(c, choice, set)
      const p = personById(dbx, by)
      const o           = { id: `ko-${child.slice(2)}`, campaign: c.id, child, by, email: p.email || '', phone: p.phone || '600 000 000', printName: personById(dbx, child).first.toUpperCase(), printNumber, notes: '', lines: priced.lines, chargeId: '', at, status: 'submitted', via: p.account ? 'aplikacja' : 'link z e-maila' }
      const ch = kitCharge(dbx, c, o)
      o.chargeId = ch.id
      if (pay) { ch.payments.push(pay); ch.status = pay.amount >= ch.amount ? 'paid' : 'partially_paid' }
      dbx.kitOrders.push(o)
    }
    const none = { 'kp-dres': 'none', 'kp-ortalion': 'none' }
    add('p-adam', 'p-marek', { ...none, 'kp-koszulka': '128', 'kp-spodenki': '128', 'kp-getry': '31–34', 'kp-dres': '128' }, true, '9', '2026-11-06 20:14', { amount: 30000, method: 'gotówka', date: '2026-11-05', by: 'p-wojtek', receipt: 'KP/2026/11/005' })
    add('p-bartek', 'p-ewelina', { ...none, 'kp-koszulka': '128', 'kp-spodenki': 'none', 'kp-getry': '31–34' }, false, '10', '2026-11-07 08:40')
    add('p-lena', 'p-robert', { ...none, 'kp-koszulka': '128', 'kp-spodenki': '128', 'kp-getry': '31–34', 'kp-czapka': 'yes' }, true, '7', '2026-11-07 21:02', { amount: 15000, method: 'online (Stripe)', date: '2026-11-07', ref: 'pi_3Q…' })
    add('p-kuba', 'p-iwona', { ...none, 'kp-koszulka': '164', 'kp-spodenki': '164', 'kp-getry': '39–42', 'kp-ortalion': '164' }, true, '14', '2026-11-08 18:30', { amount: 22000, method: 'gotówka', date: '2026-11-09', by: 'p-piotr', receipt: 'KP/2026/11/006' })
  }

  const personById = (db    , id        )         => db.persons.find((p) => p.id === id)          
  const placeName = (db    , id        )         => (db.places.find((p) => p.id === id) || { name: '—' }).name

  // ═══════════════════════════════════════════════════════════════════
  // Stan aplikacji mockupu
  // ═══════════════════════════════════════════════════════════════════
  const PERSONAS            = [
    { id: 'kasia', person: 'p-kasia', label: 'Kasia Nowak', role: 'opiekunka (Jaś — Orlik młodszy i basen, Ola — Trampkarz)', features: ['people.self', 'activities.attendance.declare', 'communication.view', 'payments.view_own', 'payments.pay_online', 'payments.orders.place'], home: '/club', email: 'kasia.nowak@example.pl' },
    { id: 'ola', person: 'p-ola', label: 'Ola Nowak', role: 'uczestniczka, 14 lat (bez płatności — płaci opiekun)', features: ['people.self', 'activities.attendance.declare', 'communication.view'], home: '/club', email: 'ola.nowak@example.pl' },
    { id: 'wojtek', person: 'p-wojtek', label: 'Wojtek Malinowski', role: 'trener Orlików młodszych i Żaków starszych + koordynator akademii', features: ['people.self', 'activities.attendance.declare', 'communication.view', 'activities.coach', 'activities.events.create', 'communication.post', 'activities.reports.view_own', 'facilities.view', 'facilities.bookings.create', 'backend', 'club_core.view', 'club_core.sections.public_content', 'people.view', 'groups.view', 'groups.manage', 'activities.view', 'activities.manage', 'activities.reports.view', 'communication.cases.manage', 'payments.orders.collect'], home: '/club', email: 'wojtek@gwiazda.example' },
    { id: 'anna', person: 'p-anna', label: 'Anna Kowalczyk', role: 'instruktorka pływania', features: ['people.self', 'communication.view', 'activities.coach', 'activities.events.create', 'communication.post', 'activities.reports.view_own', 'facilities.view', 'facilities.bookings.create'], home: '/club', email: 'anna@gwiazda.example' },
    { id: 'aneta', person: 'p-aneta', label: 'Aneta Wiśniewska', role: 'administratorka / skarbnik + koordynatorka basenu', features: ['*'], home: '/backend', email: 'aneta@gwiazda.example' },
    { id: 'tomek', person: 'p-tomek', label: 'Tomek Lis', role: 'animator Orlika', features: ['people.self', 'facilities.view', 'facilities.rentals.manage', 'facilities.log.write', 'facilities.incidents.manage', 'facilities.bookings.create', 'backend'], home: '/club/facility', email: 'tomek@gwiazda.example' },
    { id: 'guest', label: 'Gość (bez logowania)', role: 'rodzic szukający zajęć / najemca', features: [], home: '/p/gwiazda' },
  ]

  let db     = seed()
  let personaId            = 'kasia'
  let demoState            = 'normal'
  let transientLoading = false
  let modal                   = null
  let drawer                                      = null
  let coachCtx = true // „jako trener” dla osób z wieloma rolami
  const ui                         = {}
  try { personaId = (sessionStorage.getItem('vereino.persona')             ) || 'kasia'; const t = localStorage.getItem('vereino.theme'); if (t) document.documentElement.dataset.theme = t } catch { /* brak storage */ }

  const persona = ()          => PERSONAS.find((p) => p.id === personaId)           
  const me = ()         => persona().person || ''
  const can = (f        )          => persona().features.includes('*') || persona().features.includes(f)
  const isAdmin = ()          => persona().features.includes('*')
  const pName = (id                           )         => { if (!id) return '—'; const p = db.persons.find((x) => x.id === id); return p ? `${p.first} ${p.last}` : id }
  const group = (id        )        => db.groups.find((g) => g.id === id)         
  const section = (id        )          => db.sections.find((s) => s.id === id)           
  const occById = (id        )                         => db.occurrences.find((o) => o.id === id)
  // Logo efektywne sekcji = logo sekcji ?? logo klubu ?? inicjał (REQ-028).
  const sectionLogo = (s         )                     => s.logo || db.settings.logo
  function logoBox(src                    , alt        , size        )         {
    const rad = Math.round(size / 4)
    return src
      ? `<img class="logo-img" src="${esc(src)}" alt="${esc(alt)}" width="${size}" height="${size}" style="border-radius:${rad}px">`
      : `<span class="logo-fallback" role="img" aria-label="${esc(alt)}" style="width:${size}px;height:${size}px;border-radius:${rad}px;font-size:${Math.round(size * 0.45)}px">${esc((db.settings.short || 'K').slice(0, 1))}</span>`
  }
  const wardsOf = (pid        )           => db.guardianships.filter((g) => g.guardian === pid).map((g) => g.ward)
  const coachedGroups = (pid        )           => db.groups.filter((g) => g.coaches.includes(pid)).map((g) => g.id)
  const coordSections = (pid        )           => isAdmin() ? db.sections.map((s) => s.id) : db.roles.filter((r) => r.person === pid && r.role === 'coordinator').map((r) => r.section          )
  const hasMemberRole = (pid        )          => wardsOf(pid).length > 0 || db.groups.some((g) => g.members.includes(pid))
  const isCoachPersona = ()          => can('activities.coach')
  const started = (o                                 )          => o.date < TODAY || (o.date === TODAY && toMin(o.start) <= toMin(NOW))
  const ended = (o                               )          => o.date < TODAY || (o.date === TODAY && toMin(o.end) <= toMin(NOW))
  const typeLabel = (t         , kind         )         => ({ training: kind === 'class_group' ? 'zajęcia' : 'trening', match: 'mecz', sparring: 'sparing', tournament: 'turniej', camp: 'obóz', other: 'wydarzenie' }                          )[t]

  function mail(to        , subject        , body        , link         , linkLabel         )       {
    db.mails.unshift({ id: db.mails.length + 1, to, subject, body, link, linkLabel })
  }

  // ═══════════════════════════════════════════════════════════════════
  // Komponenty HTML
  // ═══════════════════════════════════════════════════════════════════
  const badge = (text        , kind                                                       = 'neutral')         => `<span class="badge ${kind}">${esc(text)}</span>`
  const btn = (label        , action        , attrs                         = {}, cls = '')         =>
    `<button type="button" class="btn ${cls}" data-action="${action}" ${Object.entries(attrs).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${label}</button>`
  const link = (label        , href        , cls = 'btn')         => `<a class="${cls}" href="#${href}">${label}</a>`
  const fld = (name        , label        , control        , opts                                   = {})         =>
    `<label class="field" data-field="${name}"><span>${esc(label)}${opts.req ? ' <b class="req">*</b>' : ''}</span>${control}${opts.hint ? `<small>${esc(opts.hint)}</small>` : ''}</label>`
  const inp = (name        , type = 'text', value = '', extra = '')         => `<input type="${type}" name="${name}" value="${esc(value)}" ${extra}>`
  const sel = (name        , options                    , value = '', extra = '')         =>
    `<select name="${name}" ${extra}>${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
  const area = (name        , value = '', extra = '')         => `<textarea name="${name}" ${extra}>${esc(value)}</textarea>`
  const chk = (name        , label        , checked = false, extra = '')         => `<label class="check" data-field="${name}"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''} ${extra}><span>${label}</span></label>`

  function empty(title        , text        , action = '', ico = '○')         {
    return `<div class="empty"><div class="ico" aria-hidden="true">${ico}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`
  }
  function errorView(text = 'Nie udało się wczytać danych. Sprawdź połączenie i spróbuj ponownie.')         {
    return `<div class="alert error" role="alert"><strong>Coś poszło nie tak</strong>${esc(text)}</div><div class="row">${btn('Spróbuj ponownie', 'retry', {}, 'primary')}</div>`
  }
  function skeleton(kind           )         {
    const lines = '<div class="skeleton sk-line" style="width:60%"></div><div class="skeleton sk-line" style="width:85%"></div>'
    return kind === 'backend'
      ? `<div class="skeleton sk-line" style="width:30%;height:22px"></div>${lines}<div class="skeleton sk-card" style="height:260px;margin-top:16px"></div><span class="sr-only">Wczytywanie…</span>`
      : `${lines}<div class="skeleton sk-card"></div><div class="skeleton sk-card"></div><div class="skeleton sk-card"></div><span class="sr-only">Wczytywanie…</span>`
  }

                                                                          
  function table(opts                                                                                                                                )         {
    const tabs = opts.tabs ? `<div class="dt-tabs">${opts.tabs.map(([l, h, a]) => `<a href="#${h}" class="${a ? 'active' : ''}">${l}</a>`).join('')}</div>` : ''
    const toolbar = opts.toolbar ? `<div class="dt-toolbar">${opts.toolbar}</div>` : ''
    const body = opts.rows.length
      ? `<div class="dt-scroll"><table><thead><tr>${opts.cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${opts.rows.map((r) => `<tr>${opts.cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.cell(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : empty(opts.empty ? opts.empty[0] : 'Brak wyników', opts.empty ? opts.empty[1] : 'Zmień filtry lub dodaj pierwszy rekord.')
    const foot = opts.footer === false || !opts.rows.length ? '' : `<div class="dt-foot"><span>${opts.rows.length} ${opts.rows.length === 1 ? 'rekord' : 'rekordów'}</span><span>Strona 1 z 1 · 25 na stronę</span></div>`
    return `<div class="dt">${tabs}${toolbar}${body}${foot}</div>`
  }

  function pageHead(title        , sub        , actions = '')         {
    return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="row">${actions}</div></div>`
  }

  function statusBadge(s        )         {
    const map                                                                                 = {
      planned: ['zaplanowany', 'neutral'], done: ['zakończony', 'success'], cancelled: ['odwołany', 'error'],
      open: ['otwarta', 'warning'], partially_paid: ['częściowo opłacona', 'warning'], paid: ['opłacona', 'success'], forfeited: ['przepadła', 'error'],
      pending_verification: ['czeka na potwierdzenie e-mail', 'neutral'], pending_approval: ['czeka na akceptację', 'warning'], requested: ['zaakceptowany — czeka na wpłatę', 'info'],
      confirmed: ['potwierdzony', 'success'], rejected: ['odrzucony', 'error'], expired: ['wygasł', 'neutral'], superseded: ['przebity rezerwacją klubu', 'neutral'],
      cancelled_free: ['odwołany bezpłatnie', 'neutral'], cancelled_late: ['odwołany po terminie', 'error'], no_show: ['nie stawił się', 'error'],
    }
    const [l, k] = map[s] || [s, 'neutral']
    return badge(l, k)
  }

  function declBadge(a             )         {
    if (!a || a.declared === 'unknown') return badge('brak deklaracji', 'neutral')
    if (a.status === 'pending_guardian') return badge('czeka na potwierdzenie opiekuna', 'warning')
    if (a.status === 'rejected_by_guardian') return badge('opiekun nie potwierdził', 'error')
    return a.declared === 'yes' ? badge('będzie', 'success') : badge('nie będzie', 'error')
  }

  // ═══════════════════════════════════════════════════════════════════
  // Logika domenowa mockupu
  // ═══════════════════════════════════════════════════════════════════
  function placeFamily(pid        )           {
    const ids = new Set        ([pid])
    let p = db.places.find((x) => x.id === pid)
    while (p && p.parent) { ids.add(p.parent); p = db.places.find((x) => x.id === p .parent) }
    for (const c of db.places) if (c.parent === pid) ids.add(c.id)
    return [...ids]
  }

  function zonesFor(pid        , date        )                                             {
    const rules = (db.zones[pid] || []).filter((r) => r.days.includes(weekday(date)) && (!r.validFrom || r.validFrom <= date) && (!r.validTo || date <= r.validTo))
    const cuts = [...new Set(rules.flatMap((r) => [toMin(r.from), toMin(r.to)]))].sort((a, b) => a - b)
    const out                                             = []
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1]
      const cover = rules.filter((r) => toMin(r.from) <= a && toMin(r.to) >= b)
      if (!cover.length) continue
      const top = cover.reduce((x, y) => (y.priority > x.priority ? y : x)) // wyższy priorytet wygrywa
      const last = out[out.length - 1]
      if (last && last.zone === top.zone && last.to === a) last.to = b
      else out.push({ from: a, to: b, zone: top.zone })
    }
    return out
  }
  const openingFor = (pid        , date        )                          => {
    const z = zonesFor(pid, date); if (!z.length) return null
    return [Math.min(...z.map((x) => x.from)), Math.max(...z.map((x) => x.to))]
  }

                                                                                                                                                              
  function occupancy(pid        , date        , opts                               = {})        {
    const fam = placeFamily(pid)
    const out        = []
    for (const o of db.occurrences) if (o.date === date && o.status !== 'cancelled' && fam.includes(o.place)) out.push({ kind: 'occ', from: toMin(o.start), to: toMin(o.end), label: `${o.name} (${group(o.group).name})`, publicLabel: 'zajęte przez klub', ref: o.id })
    for (const b of db.bookings) if (b.date === date && b.status === 'confirmed' && fam.includes(b.place)) out.push({ kind: 'int', from: toMin(b.start), to: toMin(b.end), label: `${b.purpose} — ${pName(b.by)}`, publicLabel: 'zajęte przez klub', ref: b.id, own: b.by === me() })
    for (const r of db.rentals) if (r.date === date && fam.includes(r.place)) {
      if (['requested', 'confirmed', 'done'].includes(r.status)) out.push({ kind: 'rent', from: toMin(r.start), to: toMin(r.end), label: `Wynajem: ${r.renter}`, publicLabel: 'zarezerwowane', ref: r.id })
      else if (r.status === 'pending_approval' && opts.includePending !== false) out.push({ kind: 'pend', from: toMin(r.start), to: toMin(r.end), label: `Zgłoszenie: ${r.renter} (czeka na akceptację)`, publicLabel: 'zgłoszone — oczekuje', ref: r.id })
    }
    for (const c of db.closures) if (c.date === date && fam.includes(c.place)) out.push({ kind: 'closed', from: toMin(c.start), to: toMin(c.end), label: `Zamknięte: ${c.note}`, publicLabel: 'zamknięte', ref: c.id })
    return out.sort((a, b) => a.from - b.from)
  }

  function conflicts(pid        , date        , from        , to        , opts                                                                   = {})        {
    const occ = occupancy(pid, date).filter((o) => o.ref !== opts.ignore && overlap(from, to, o.from, o.to))
    const blocking = occ.filter((o) => o.kind !== 'pend' || opts.pendingBlocks)
    if (opts.capacity) {
      const place = db.places.find((p) => p.id === pid)         
      const clubOcc = blocking.filter((o) => o.kind === 'occ')
      const other = blocking.filter((o) => o.kind !== 'occ')
      return clubOcc.length >= place.capacity ? blocking : other
    }
    return blocking
  }

  function declare(occId        , personId        , value              )       {
    const o = occById(occId)              
    if (started(o)) { toast('Deklaracje zamknięte — termin już się rozpoczął (409 declaration_closed).', true); return }
    const actor = me()
    const p = personById(db, personId)
    const isWardSelf = actor === personId && ageOn(p.birth) < 18
    const needsConfirm = isWardSelf && ['match', 'tournament', 'camp'].includes(o.type)
    db.attendance[occId] ||= {}
    db.attendance[occId][personId] = { declared: value, status: needsConfirm ? 'pending_guardian' : 'final', by: actor }
    if (needsConfirm) {
      toast(`Zapisano. Opiekun dostał prośbę o potwierdzenie (polityka „guardian_confirm”).`)
    } else toast(`Zapisano: ${p.first} ${value === 'yes' ? 'będzie' : 'nie będzie'}.`)
    render()
  }

  // ═══════════════════════════════════════════════════════════════════
  // Toast, modal, drawer
  // ═══════════════════════════════════════════════════════════════════
  function toast(text        , error = false)       {
    const host = document.getElementById('toasts')               
    const el = document.createElement('div')
    el.className = `toast${error ? ' error' : ''}`
    el.textContent = text
    host.appendChild(el)
    setTimeout(() => el.remove(), 4200)
  }

  function openModal(spec           )       { modal = spec; renderModal(); setTimeout(() => { const f = document.querySelector('#modal input, #modal select, #modal textarea')                      ; f?.focus() }, 0) }
  function closeModal()       { modal = null; renderModal() }
  function renderModal()       {
    const host = document.getElementById('modal')               
    if (!modal) { host.innerHTML = ''; return }
    host.innerHTML = `<div class="overlay" data-action="overlay"><form class="modal" data-form="modal" role="dialog" aria-modal="true" aria-label="${esc(modal.title)}" style="${modal.wide ? 'width:min(760px,100%)' : ''}" novalidate>
      <div class="modal-head"><h2>${esc(modal.title)}</h2><button type="button" class="btn sm" data-action="close-modal" aria-label="Zamknij">✕</button></div>
      <div class="modal-body"><div class="form-general"></div>${modal.body}</div>
      ${modal.noFooter ? '' : `<div class="modal-foot"><span class="hint">Ctrl/Cmd+Enter — zapisz · Esc — anuluj</span><div class="row"><button type="button" class="btn" data-action="close-modal">Anuluj</button><button type="submit" class="btn ${modal.danger ? 'danger' : 'primary'}">${esc(modal.submitLabel || 'Zapisz')}</button></div></div>`}
    </form></div>`
  }

  function applyErrors(form             , errors        )       {
    form.querySelectorAll('.field-error').forEach((e) => e.remove())
    form.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'))
    const general = form.querySelector('.form-general')                      
    if (general) general.innerHTML = ''
    for (const [name, msg] of Object.entries(errors)) {
      const f = form.querySelector(`[data-field="${name}"]`)
      if (f) { f.classList.add('invalid'); const p = document.createElement('p'); p.className = 'field-error'; p.textContent = msg; f.appendChild(p) }
      else if (general) general.innerHTML += `<div class="alert error" role="alert">${msg}</div>`
    }
    const first = form.querySelector('.invalid input, .invalid select, .invalid textarea')                      
    first?.focus()
  }

  // ═══════════════════════════════════════════════════════════════════
  // Ścieżki (przewodnik po przepływach F-01…F-12)
  // ═══════════════════════════════════════════════════════════════════
  const FLOWS                                                                        = [
    { id: 'F-01', title: 'Rodzina na start', steps: [['aneta', '/backend/club/sections', 'Sekcje z koordynatorami (B-04)'], ['aneta', '/backend/people/persons', 'Osoby → „Dodaj osobę” (B-09)'], ['aneta', '/backend/people/persons/p-kasia?tab=opieka', 'Karta Kasi → Opieka i zgody (B-10)'], ['aneta', '/backend/people/persons/p-jas?tab=konto', 'Jaś (9 lat) → Konto zablokowane progiem wieku'], ['aneta', '/backend/people/persons/p-kuba?tab=konto', 'Kuba (14 lat) → „Załóż konto”'], ['kasia', '/club', 'Kasia widzi dzieci w „Dziś” (M-02)']] },
    { id: 'F-02', title: 'Dziś i deklaracja obecności', steps: [['kasia', '/login', 'Logowanie (M-01)'], ['kasia', '/club', 'Dziś: „Będzie” przy treningu Jasia (M-02)'], ['ola', '/club/occurrences/a-mecz-2026-11-15', 'Ola zgłasza się na mecz (czeka na opiekuna)'], ['kasia', '/club/occurrences/a-mecz-2026-11-15', 'Kasia potwierdza deklarację Oli (M-04)'], ['kasia', '/club/calendar', 'Jeden kalendarz dwóch sekcji (M-03)']] },
    { id: 'F-03', title: 'Obecność, zastępstwo, rozliczenie', steps: [['wojtek', '/club/occurrences/a-orlm-2026-11-17', 'Wojtek zgłasza nieobecność (M-04)'], ['wojtek', '/backend', 'Pulpit: „Terminy do obsadzenia” (B-01)'], ['wojtek', '/backend/activities/occurrences?view=unassigned', 'Wskaż zastępcę (B-15)'], ['wojtek', '/club/occurrences/a-orlm-2026-11-10/attendance', 'Lista obecności → Zamknij termin (M-05)'], ['aneta', '/backend/activities/units', 'Raport jednostek + CSV (B-16)']] },
    { id: 'F-04', title: 'Nowa aktywność bez kolizji', steps: [['wojtek', '/backend/activities/activities', 'Aktywności (B-13)'], ['wojtek', '/backend/activities/create', 'Kreator: wt 17:00 Boisko → kolizja; zmień godzinę → utwórz (B-14)']] },
    { id: 'F-05', title: 'Odwołanie, komunikat, sprawa', steps: [['wojtek', '/club/occurrences/a-orlm-2026-11-19', 'Odwołaj termin (M-04)'], ['wojtek', '/club/messages', 'Wątek terminu → „Skopiuj tekst na grupę” (M-06/M-07)'], ['aneta', '/backend/communication/threads/t-uwagi', 'Oznacz wątek jako sprawę (B-19)']] },
    { id: 'F-06', title: 'Deklaracja z linku bez logowania', steps: [['guest', '/club/link?occ=a-orlm-2026-11-12', 'Link z Messengera → podaj e-mail (M-13)'], ['guest', '/club/d/tok-expired', 'Wygasły link (M-14, 410)']] },
    { id: 'F-07', title: 'Składki: naliczenie, zaległości, płatność', steps: [['aneta', '/backend/payments/fees', 'Cenniki i zniżki (B-20)'], ['aneta', '/backend/payments/charges', 'Nalicz okres 2026-12 (B-21)'], ['aneta', '/backend/payments/charges?view=overdue', 'Zaległości → zaksięguj wpłatę (B-22)'], ['kasia', '/club/payments', 'Kasia płaci online (M-08 → Stripe → M-09)']] },
    { id: 'F-08', title: 'Trener rezerwuje boisko na turniej', steps: [['wojtek', '/club/places', 'Obiekty (M-11)'], ['wojtek', '/club/places/pl-boisko?date=2026-11-14', 'Sobota → klik 9:00 → „Rezerwuj dla grupy” → turniej 9–12'], ['anna', '/club/places/pl-salka?date=2026-11-13', 'Instruktorka rezerwuje salkę na szkolenie']] },
    { id: 'F-09', title: 'Zgłoszenie z zewnątrz i akceptacja', steps: [['guest', '/p/gwiazda', 'Strona klubu (P-01)'], ['guest', '/p/gwiazda/places', 'Obiekty (P-03)'], ['guest', '/p/gwiazda/places/orlik-boisko', 'Kalendarz → „Zgłoś rezerwację” (P-04)'], ['guest', '/mail', 'Skrzynka testowa → link potwierdzający (P-05)'], ['aneta', '/backend/facilities/requests', 'Administrator akceptuje (B-25)']] },
    { id: 'F-10', title: 'Animator na obiekcie', steps: [['tomek', '/club/facility', 'Dziś na obiekcie → Otwórz obiekt → Incydent (M-12)'], ['tomek', '/backend/facilities/calendar', 'Kalendarz → wynajem po telefonie (B-23)']] },
    { id: 'F-11', title: 'Strona klubu i konfiguracja publikacji', steps: [['guest', '/p/gwiazda/sections/basen', 'Strona sekcji Basen (P-02)'], ['aneta', '/backend/club/publication', 'Wyłącz „Ceny” (B-03)'], ['guest', '/p/gwiazda/sections/basen', 'Sekcja bez cen'], ['aneta', '/backend/club/sections/s-zumba?tab=public', 'Treści publiczne sekcji (B-05)'], ['aneta', '/backend/club/sections', 'Sekcja Szachy bez koordynatora (B-04)']] },
    { id: 'F-12', title: 'Raport dla gminy', steps: [['aneta', '/backend/facilities/report', 'Raport dla właściciela + CSV (B-28)']] },
    { id: 'F-13', title: 'Zamówienie strojów i rozliczenie', steps: [['aneta', '/backend/payments/orders', 'Zbiórki zamówień (B-30)'], ['aneta', '/backend/payments/orders/create', 'Nowy formularz → „Wczytaj szablon” → otwórz zbieranie (B-31)'], ['kasia', '/club/orders/oc-akad', 'Kasia zamawia strój dla Jasia (M-17)'], ['guest', '/club/orders/oc-akad', 'Rodzic bez konta prosi o osobisty link (M-17)'], ['guest', '/club/o/kit-robert', 'Robert zamawia z linku dla Filipa (M-19)'], ['wojtek', '/club/coach/orders', 'Trener przyjmuje gotówkę za strój Bartka (M-18)'], ['aneta', '/backend/payments/cash-custody', 'Skarbnik rozlicza gotówkę od trenerów (B-33)'], ['aneta', '/backend/payments/orders/oc-akad?view=supplier', 'Zestawienie dla dostawcy → zamknij → zamówione → dostarczone (B-32)'], ['wojtek', '/club/coach/orders', 'Trener wydaje stroje (M-18)']] },
  ]

  // ═══════════════════════════════════════════════════════════════════
  // Ekrany członkowskie (M)
  // ═══════════════════════════════════════════════════════════════════
  function memberCalendarItems(from        , to        , filter = 'all')                                                       {
    const pid = me()
    const people = [pid, ...wardsOf(pid)].filter((x) => filter === 'all' || x === filter)
    const coached = coachedGroups(pid)
    return db.occurrences.filter((o) => o.date >= from && o.date <= to).map((o) => {
      const g = group(o.group)
      const who = people.filter((x) => g.members.includes(x))
      const asCoach = (filter === 'all' || filter === pid) && (coached.includes(o.group) || o.coach === pid)
      return { o, who, asCoach }
    }).filter((x) => x.who.length || x.asCoach).sort((a, b) => (a.o.date + a.o.start).localeCompare(b.o.date + b.o.start))
  }

  function occCard(x                                                    , withDecl = true)         {
    const o = x.o, g = group(o.group), s = section(g.section)
    const closed = started(o)
    const decl = withDecl && o.status === 'planned' ? x.who.map((w) => {
      const a = db.attendance[o.id]?.[w]
      const yes = a?.declared === 'yes', no = a?.declared === 'no'
      const canDecl = !(w === me() && ageOn(personById(db, w).birth) < 13)
      return `<div class="who"><span>${esc(personById(db, w).first)} ${a?.status === 'pending_guardian' ? badge('czeka na opiekuna', 'warning') : ''}</span>${canDecl ? `<div class="seg" role="group" aria-label="Deklaracja: ${esc(personById(db, w).first)}">
        <button type="button" class="${yes ? 'on-yes' : ''}" data-action="declare" data-occ="${o.id}" data-person="${w}" data-val="yes" ${closed ? 'disabled' : ''} aria-pressed="${yes}">Będzie</button>
        <button type="button" class="${no ? 'on-no' : ''}" data-action="declare" data-occ="${o.id}" data-person="${w}" data-val="no" ${closed ? 'disabled' : ''} aria-pressed="${no}">Nie będzie</button></div>` : ''}</div>`
    }).join('') : ''
    const coachLine = x.asCoach && o.status === 'planned' ? `<div class="row" style="margin-top:6px">${link('Lista obecności', `/club/occurrences/${o.id}/attendance`, 'btn sm primary')}${o.coach === null ? badge('bez trenera', 'warning') : ''}</div>` : ''
    return `<div class="occ"><div class="time">${o.start}<small>${o.end}</small></div><div>
      <a class="title" href="#/club/occurrences/${o.id}"><span class="dot sec-${s.color}" aria-hidden="true"></span>${esc(o.name)}</a>
      <div class="meta">${esc(g.name)} · ${esc(s.name)} · ${esc(placeName(db, o.place))}${o.coach && o.coach !== o.defaultCoach ? ` · zastępstwo: ${esc(pName(o.coach))}` : ''}</div>
      ${o.status === 'cancelled' ? `<div style="margin-top:4px">${badge(`odwołany: ${o.cancelReason || ''}`, 'error')}</div>` : ''}
      ${closed && o.status === 'planned' && x.who.length ? `<div style="margin-top:4px">${badge('deklaracje zamknięte', 'neutral')}</div>` : ''}
      <div class="decl">${decl}</div>${coachLine}</div></div>`
  }

  function screenToday()         {
    const pid = me()
    const items = memberCalendarItems(TODAY, addDays(TODAY, 1)).filter((x) => coachCtx || x.who.length)
    const next = memberCalendarItems(addDays(TODAY, 2), addDays(TODAY, 30))[0]
    const pend = Object.entries(db.attendance).flatMap(([occ, map]) => Object.entries(map).filter(([w, a]) => a.status === 'pending_guardian' && wardsOf(pid).includes(w)).map(([w]) => ({ occ, w })))
    const unsettled = isCoachPersona() ? db.occurrences.filter((o) => o.status === 'planned' && ended(o) && (o.coach === pid || coachedGroups(pid).includes(o.group))) : []
    const myThreads = visibleThreads()
    const unread = myThreads.filter((t) => !t.readBy.includes(pid))
    const charges = db.charges.filter((c) => (c.payerPerson === pid || c.person === pid) && ['open', 'partially_paid'].includes(c.status))
    const sum = charges.reduce((s, c) => s + c.amount - c.discount - c.payments.reduce((a, p) => a + p.amount, 0), 0)
    const cal = `<section class="card" aria-labelledby="t-cal"><div class="tile-head"><h2 id="t-cal">Kalendarz — dziś i jutro</h2><a href="#/club/calendar">Cały kalendarz</a></div>
      ${items.length ? `<div class="day-head">${dShort(TODAY)} (dziś)</div>${items.filter((x) => x.o.date === TODAY).map((x) => occCard(x)).join('') || '<p class="muted small">Dziś bez zajęć.</p>'}<div class="day-head">${dShort(addDays(TODAY, 1))}</div>${items.filter((x) => x.o.date !== TODAY).map((x) => occCard(x)).join('') || '<p class="muted small">Jutro bez zajęć.</p>'}`
      : `<p class="muted">Dziś nie ma zajęć.${next ? ` Najbliższy termin: <a href="#/club/occurrences/${next.o.id}">${dShort(next.o.date)} ${next.o.start} — ${esc(next.o.name)}</a>.` : ''}</p>`}</section>`
    const att = `<section class="card" aria-labelledby="t-att"><div class="tile-head"><h2 id="t-att">Obecność</h2></div>
      ${pend.length ? pend.map(({ occ, w }) => { const o = occById(occ)              ; return `<div class="alert warning"><strong>${esc(personById(db, w).first)} zgłosiła się: ${esc(o.name)}</strong>${dShort(o.date)} ${o.start}. Potwierdzasz?<div class="row" style="margin-top:6px">${link('Zobacz i zdecyduj', `/club/occurrences/${o.id}`, 'btn sm primary')}</div></div>` }).join('') : ''}
      ${unsettled.length ? unsettled.map((o) => `<div class="alert warning"><strong>Nierozliczony termin</strong>${esc(o.name)}, ${dShort(o.date)} ${o.start} — odhacz obecność i zamknij.<div class="row" style="margin-top:6px">${link('Lista obecności', `/club/occurrences/${o.id}/attendance`, 'btn sm primary')}</div></div>`).join('') : ''}
      ${!pend.length && !unsettled.length ? '<p class="muted">Nic nie czeka na Twoją decyzję.</p>' : ''}</section>`
    const msg = `<section class="card" aria-labelledby="t-msg"><div class="tile-head"><h2 id="t-msg">Wiadomości</h2><a href="#/club/messages">Wszystkie</a></div>
      ${unread.length ? `<p><b>${unread.length}</b> nieprzeczytane</p><a href="#/club/messages/${unread[0].id}">${esc(unread[0].subject)}</a>` : '<p class="muted">Brak nowych wiadomości.</p>'}</section>`
    const pay = can('payments.view_own') ? `<section class="card" aria-labelledby="t-pay"><div class="tile-head"><h2 id="t-pay">Płatności</h2><a href="#/club/payments">Szczegóły</a></div>
      ${sum ? `<div class="kpi">${zl(sum)}</div><p class="muted small">do ${dShort(charges.map((c) => c.due).sort()[0])} · ${charges.length} należności</p>${can('payments.pay_online') ? link('Zapłać', '/club/payments', 'btn primary block') : '<p class="small muted">Płaci opiekun.</p>'}` : '<p class="muted">Wszystko opłacone.</p>'}</section>` : ''
    return `<div class="tiles">${cal}${att}${msg}${pay}${kitTodayTiles()}</div>`
  }

  function screenCalendar(q                 )         {
    const pid = me()
    const week = q.get('week') === 'next' ? 1 : 0
    const from = addDays(mondayOf(TODAY), week * 7)
    const filter = q.get('who') || 'all'
    const people = [pid, ...wardsOf(pid)].filter((x) => x === pid ? (hasMemberRole(x) || isCoachPersona()) : true)
    const items = memberCalendarItems(from, addDays(from, 6), filter)
    const chips = people.length > 1 ? `<div class="chips" role="group" aria-label="Filtr osoby"><a class="chip ${filter === 'all' ? 'on' : ''}" href="#/club/calendar?week=${week ? 'next' : 'this'}&who=all">Wszyscy</a>${people.map((p) => `<a class="chip ${filter === p ? 'on' : ''}" href="#/club/calendar?week=${week ? 'next' : 'this'}&who=${p}">${esc(p === pid ? 'Ja' : personById(db, p).first)}</a>`).join('')}</div>` : ''
    let body = ''
    for (let i = 0; i < 7; i++) {
      const d = addDays(from, i)
      const day = items.filter((x) => x.o.date === d)
      if (day.length) body += `<div class="day-head">${dShort(d)}${d === TODAY ? ' (dziś)' : ''}</div>${day.map((x) => occCard(x)).join('')}`
    }
    return `<div class="row between" style="margin-bottom:8px"><div class="seg" role="group" aria-label="Tydzień"><button type="button" class="${week ? '' : 'on'}" data-action="nav" data-href="/club/calendar?week=this&who=${filter}">Ten tydzień</button><button type="button" class="${week ? 'on' : ''}" data-action="nav" data-href="/club/calendar?week=next&who=${filter}">Następny</button></div><span class="small muted">${dShort(from)} – ${dShort(addDays(from, 6))}</span></div>
      ${chips}<div class="legend"><span><span class="dot sec-akad"></span>Akademia</span><span><span class="dot sec-basen"></span>Basen</span><span><span class="dot sec-zumba"></span>Zumba</span><span><span class="dot sec-szachy"></span>Szachy</span><span><span class="dot sec-cheer"></span>Cheerleader</span></div>
      ${body || empty('Brak terminów w tym tygodniu', 'Sprawdź następny tydzień.', link('Następny tydzień', '/club/calendar?week=next', 'btn'))}`
  }

  function screenOccurrence(p                        )         {
    const o = occById(p.id)
    if (!o) return empty('Termin nie istnieje', 'Albo nie masz do niego dostępu (404).', link('Wróć do „Dziś”', '/club'))
    const g = group(o.group), s = section(g.section), pid = me()
    const who = [pid, ...wardsOf(pid)].filter((x) => g.members.includes(x))
    const isCoach = o.coach === pid || g.coaches.includes(pid) || coordSections(pid).includes(g.section)
    const closed = started(o)
    const pend = who.filter((w) => w !== pid && db.attendance[o.id]?.[w]?.status === 'pending_guardian')
    const subs = db.substitutions.filter((x) => x.occ === o.id)
    return `<div class="card"><div class="row between"><span class="badge info">${esc(typeLabel(o.type, g.kind))}</span>${statusBadge(o.status)}</div>
      <h2 style="margin:8px 0 2px;font-size:18px">${esc(o.name)}</h2>
      <p class="muted" style="margin:0">${esc(dLong(o.date))}, ${o.start}–${o.end}</p>
      <ul class="list small" style="margin-top:8px"><li><b>Miejsce:</b> ${esc(placeName(db, o.place))}</li><li><b>Grupa:</b> ${esc(g.name)} · ${esc(s.name)}</li><li><b>${g.kind === 'team' ? 'Trener' : 'Instruktor'}:</b> ${o.coach ? esc(pName(o.coach)) : badge('do obsadzenia', 'warning')}${o.coach && o.coach !== o.defaultCoach ? ` (zastępstwo za ${esc(pName(o.defaultCoach))})` : ''}</li>
      ${o.opponent ? `<li><b>Przeciwnik:</b> ${esc((db.externalTeams.find((t) => t.id === o.opponent) || { name: '' }).name)}</li>` : ''}
      ${o.invited?.length ? `<li><b>Zaproszone drużyny:</b> ${o.invited.map((i) => esc((db.externalTeams.find((t) => t.id === i) || { name: i }).name)).join(', ')}</li>` : ''}
      ${o.status === 'cancelled' ? `<li><b>Powód odwołania:</b> ${esc(o.cancelReason)}</li>` : ''}</ul></div>
      ${pend.map((w) => `<div class="alert warning"><strong>${esc(personById(db, w).first)} zadeklarowała obecność — wymaga Twojego potwierdzenia</strong>Polityka klubu dla meczów: „potwierdzenie opiekuna”, bez decyzji w 24 h — przyjęta deklaracja.
        <div class="row" style="margin-top:8px">${btn('Potwierdź', 'guardian-decide', { occ: o.id, person: w, val: 'yes' }, 'primary sm')}${btn('Nie zgadzam się', 'guardian-decide', { occ: o.id, person: w, val: 'no' }, 'sm')}</div></div>`).join('')}
      ${who.length && o.status === 'planned' ? `<div class="section-title">Obecność</div>${occCard({ o, who, asCoach: false }).replace('class="occ"', 'class="occ" style="grid-template-columns:0 1fr"')}` : ''}
      ${closed && o.status === 'planned' && who.length ? '<p class="small muted">Deklaracje są zamknięte od rozpoczęcia terminu.</p>' : ''}
      ${isCoach && o.status === 'planned' ? `<div class="section-title">Prowadzenie</div><div class="stack">
        ${link('Lista obecności', `/club/occurrences/${o.id}/attendance`, 'btn primary block')}
        ${o.coach === pid ? btn('Zgłoś nieobecność', 'absence', { occ: o.id }, 'block') : ''}
        ${btn('Odwołaj termin', 'cancel-occ', { occ: o.id }, 'block danger')}
        ${can('communication.post') ? btn('Napisz do grupy', 'new-thread', { scope: `occurrence:${o.id}` }, 'block') : ''}</div>` : ''}
      ${subs.length && isCoach ? `<div class="section-title">Historia zastępstw</div><ul class="list small">${subs.map((x) => `<li>${esc(x.at)} — ${x.kind === 'absence_reported' ? `${esc(pName(x.prev))} zgłosił nieobecność` : `${esc(pName(x.next))} za ${esc(pName(x.prev))}`}${x.reason ? ` (${esc(x.reason)})` : ''}</li>`).join('')}</ul>` : ''}`
  }

  function screenAttendance(p                        )         {
    const o = occById(p.id)
    if (!o) return empty('Termin nie istnieje', '404')
    const g = group(o.group)
    if (!(o.coach === me() || g.coaches.includes(me()) || coordSections(me()).includes(g.section))) return `<div class="alert error" role="alert"><strong>Brak uprawnień (403)</strong>Listę obecności prowadzi trener tej grupy lub koordynator sekcji.</div>`
    const att = db.attendance[o.id] || {}
    const ids = [...new Set([...g.members, ...Object.keys(att)])]
    const counts = { yes: 0, no: 0, unknown: 0 }
    for (const m of ids) { const a = att[m]; if (!a || a.declared === 'unknown') counts.unknown++; else if (a.declared === 'yes') counts.yes++; else counts.no++ }
    if (o.status === 'cancelled') return `<div class="alert error"><strong>Termin odwołany</strong>Obecności nie można odhaczyć (409).</div>`
    const rows = ids.map((m) => {
      const a = att[m]; const v = a?.actual || ''
      const opt = (val        , l        )         => `<button type="button" class="${v === val ? 'on' : ''}" data-action="mark" data-occ="${o.id}" data-person="${m}" data-val="${val}" aria-pressed="${v === val}" ${o.status === 'done' ? 'disabled' : ''}>${l}</button>`
      return `<li><div class="row between"><div><div class="item-title">${esc(pName(m))}</div><div class="small">${declBadge(a)}</div></div><div class="seg" role="group" aria-label="Obecność: ${esc(pName(m))}">${opt('present', 'Obecny')}${opt('absent', 'Nieob.')}${opt('late', 'Spóźn.')}</div></div></li>`
    }).join('')
    return `<div class="card"><div class="item-title">${esc(o.name)}</div><div class="small muted">${dShort(o.date)} ${o.start}–${o.end} · ${esc(placeName(db, o.place))} · ${o.coach ? esc(pName(o.coach)) : 'bez trenera'}</div>
      <div class="row" style="margin-top:8px">${badge(`${counts.yes} będzie`, 'success')}${badge(`${counts.no} nie będzie`, 'error')}${badge(`${counts.unknown} brak`, 'neutral')}</div></div>
      ${o.status === 'done' ? '<div class="alert success" style="margin-top:12px"><strong>Termin zamknięty</strong>Jednostka zaliczona prowadzącemu.</div>' : ''}
      ${ids.length ? `<ul class="list">${rows}</ul>` : empty('Grupa nie ma członków w dniu terminu', 'Koordynator może dodać uczestników w składzie grupy.')}
      ${o.status === 'planned' && ids.length ? `<div class="stack" style="margin-top:12px">${btn('Zadeklarowani obecni — zaznacz', 'mark-declared', { occ: o.id })}${btn('Zamknij termin', 'complete-occ', { occ: o.id }, 'primary block')}</div>` : ''}`
  }

  function visibleThreads()           {
    const pid = me()
    const myGroups = new Set([...db.groups.filter((g) => g.members.includes(pid) || g.members.some((m) => wardsOf(pid).includes(m)) || g.coaches.includes(pid)).map((g) => g.id)])
    const mySections = new Set([...coordSections(pid), ...[...myGroups].map((g) => group(g).section)])
    return db.threads.filter((t) => isAdmin() || t.scope === 'club' || (t.scope === 'group' && myGroups.has(t.scopeId)) || (t.scope === 'section' && mySections.has(t.scopeId)) || (t.scope === 'occurrence' && myGroups.has((occById(t.scopeId)              )?.group)) || t.messages.some((m) => m.author === pid))
  }

  function screenMessages()         {
    const list = visibleThreads()
    const items = list.map((t) => `<li><a href="#/club/messages/${t.id}" style="text-decoration:none"><div class="row between"><span class="item-title">${!t.readBy.includes(me()) ? '● ' : ''}${esc(t.subject)}</span>${t.isCase ? badge('Sprawa', 'warning') : ''}</div>
      <div class="small muted">${esc(t.scopeLabel)} · ${esc(pName(t.messages[t.messages.length - 1].author))} · ${esc(t.messages[t.messages.length - 1].at)}</div></a></li>`).join('')
    return `${can('communication.post') ? `<div style="margin-bottom:8px">${btn('Nowy komunikat', 'new-thread', {}, 'primary block')}</div>` : ''}
      ${list.length ? `<ul class="list">${items}</ul>` : empty('Brak wiadomości', 'Tu pojawią się komunikaty trenerów i klubu.')}`
  }

  function threadView(t        , backend         )         {
    if (!t.readBy.includes(me())) t.readBy.push(me())
    const canCase = can('communication.cases.manage')
    return `${t.isCase ? '<div class="alert warning"><strong>Sprawa</strong>Wątek ma charakter dowodowy: wiadomości nie można usuwać ani edytować. Widzą go uczestnicy, koordynator sekcji i administrator.</div>' : ''}
      <div class="small muted" style="margin-bottom:8px">${esc(t.scopeLabel)}</div>
      ${t.messages.map((m) => `<div class="card"><div class="row between"><span class="item-title">${esc(pName(m.author))} <span class="small muted">· ${esc(m.role)}</span></span><span class="small muted">${esc(m.at)}</span></div><p style="margin:6px 0 0">${esc(m.body)}</p>
        ${backend || m.author === me() ? `<div class="small muted" style="margin-top:6px">E-mail: ${m.delivered} doręczone${m.failed ? ` · <span style="color:var(--destructive)">${m.failed} niedoręczone</span>` : ''}</div>` : ''}
        ${backend && !t.isCase ? `<div style="margin-top:6px">${btn('Usuń wiadomość', 'delete-msg', { thread: t.id, msg: m.id }, 'sm danger')}</div>` : ''}</div>`).join('')}
      <form class="form" data-form="reply" data-thread="${t.id}" style="margin-top:12px" novalidate>${fld('body', 'Odpowiedź', area('body', '', 'rows="3" placeholder="Napisz odpowiedź…"'), { req: true })}
        <div class="form-actions">${can('communication.post') ? btn('Skopiuj tekst na grupę', 'share-text', { thread: t.id }) : ''}${backend && canCase && !t.isCase ? btn('Oznacz jako sprawę', 'mark-case', { thread: t.id }) : ''}<button class="btn primary" type="submit">Wyślij</button></div></form>`
  }

  function screenThread(p                        )         {
    const t = db.threads.find((x) => x.id === p.id)
    if (!t || !visibleThreads().includes(t)) return `<div class="alert error"><strong>Brak dostępu (403)</strong>Ten wątek nie należy do Twoich grup.</div>`
    return threadView(t, false)
  }

  function myCharges()           {
    return db.charges.filter((c) => c.source !== 'rental' && c.status !== 'cancelled' && (c.payerPerson === me() || c.person === me()))
  }
  const remaining = (c        )         => c.amount - c.discount - c.payments.reduce((s, p) => s + p.amount, 0)

  function screenPayments()         {
    const list = myCharges()
    const open = list.filter((c) => ['open', 'partially_paid'].includes(c.status))
    const paid = list.filter((c) => c.status === 'paid')
    const payer = can('payments.pay_online')
    const row = (c        , selectable         )         => `<li><label class="check" style="width:100%">${selectable ? `<input type="checkbox" name="charge" value="${c.id}" ${c.payerMissing ? 'disabled' : 'checked'} data-change="pay-sum">` : ''}<span style="flex:1">
      <span class="row between"><span class="item-title">${esc(c.description)}</span><b>${zl(remaining(c) > 0 && c.status !== 'paid' ? remaining(c) : c.amount - c.discount)}</b></span>
      <span class="small muted">${c.period ? `okres ${esc(c.period)} · ` : ''}termin ${dShort(c.due)}${c.discount ? ` · zniżka ${esc(c.discountName)} −${zl(c.discount)}` : ''}</span>
      <span class="row" style="margin-top:4px">${statusBadge(c.status)}${c.due < TODAY && c.status !== 'paid' ? badge('po terminie', 'error') : ''}${c.payerMissing ? badge('brak płatnika — skontaktuj się z klubem', 'warning') : ''}</span></span></label></li>`
    return `${kitPayHint()}${open.length ? `<form data-form="checkout" novalidate><div class="section-title">Do zapłaty</div><ul class="list">${open.map((c) => row(c, payer)).join('')}</ul>
      ${payer ? `<div class="form-general"></div><button class="btn primary block" type="submit" id="pay-btn">Zapłać ${zl(open.filter((c) => !c.payerMissing).reduce((s, c) => s + remaining(c), 0))}</button><p class="small muted">Płatność obsługuje Stripe (karta, Apple Pay, Google Pay). Możesz też zapłacić przelewem na konto klubu PL 00 1020 0000 0000 0000 0000 0000 — w tytule wpisz <b>${payerCode(me())}</b> (Twój kod płatnika), a wpłata rozliczy się sama. Gotówkę przyjmuje skarbnik.</p>` : '<p class="small muted">Należności opłaca Twój opiekun.</p>'}</form>`
      : empty('Wszystko opłacone', 'Nowe należności pojawią się na początku miesiąca.', '', '✓')}
      ${paid.length ? `<div class="section-title">Opłacone</div><ul class="list">${paid.slice(0, 6).map((c) => row(c, false)).join('')}</ul>` : ''}`
  }

  function screenPayReturn(q                 )         {
    const st = q.get('status')
    const ids = (q.get('ids') || '').split(',').filter(Boolean)
    const list = db.charges.filter((c) => ids.includes(c.id))
    if (st === 'cancelled') return `<div class="alert warning" role="alert"><strong>Płatność przerwana</strong>Należności są nadal otwarte. Możesz spróbować ponownie.</div>${link('Wróć do płatności', '/club/payments', 'btn primary block')}`
    if (st === 'pending') return `<div class="alert info" role="status"><strong>Płatność w toku</strong>Czekamy na potwierdzenie od operatora płatności (webhook). Odśwież za chwilę.</div>${btn('Odśwież status', 'pay-refresh', { ids: ids.join(',') }, 'primary block')}`
    return `<div class="alert success" role="status"><strong>Płatność przyjęta</strong>Dziękujemy! Potwierdzenie wysłaliśmy e-mailem.</div><ul class="list">${list.map((c) => `<li><div class="row between"><span>${esc(c.description)}</span>${statusBadge(c.status)}</div></li>`).join('')}</ul>${link('Wróć do „Dziś”', '/club', 'btn block')}`
  }

  function screenProfile()         {
    const pid = me(); const p = personById(db, pid)
    const wards = db.guardianships.filter((g) => g.guardian === pid)
    const guardOf = db.guardianships.filter((g) => g.ward === pid)
    return `<form class="form" data-form="profile" novalidate><div class="form-group"><h3>Moje dane</h3><div class="fields">
        ${fld('phone', 'Telefon', inp('phone', 'tel', p.phone || ''), { hint: 'np. 600 100 200' })}${fld('email', 'E-mail kontaktowy', inp('email', 'email', p.email || ''), { req: true })}</div>
        ${isCoachPersona() ? `<div style="margin-top:10px">${chk('publish', 'Zgadzam się na publikację imienia i nazwiska jako prowadzącego na stronie klubu', !!p.publishConsent)}</div>` : ''}
        <div class="form-actions" style="margin-top:10px"><button class="btn primary" type="submit">Zapisz</button></div></div></form>
      ${wards.length ? `<div class="section-title">Podopieczni i zgody</div>${wards.map((g) => { const w = personById(db, g.ward); const grs = db.groups.filter((x) => x.members.includes(w.id)); return `<div class="card"><div class="row between"><span class="item-title">${esc(w.first)} ${esc(w.last)}</span><span class="small muted">${ageOn(w.birth)} lat${w.account ? ' · ma konto' : ''}</span></div>
        <div class="small muted">${grs.map((x) => `${esc(x.name)} (${esc(section(x.section).name)})`).join(' · ') || 'brak grup'}</div>
        <div class="stack" style="margin-top:8px">${(['regulations', 'image', 'trips']         ).map((k) => `<label class="check"><input type="checkbox" data-change="consent" data-gs="${g.id}" data-key="${k}" ${g.consents[k] ? 'checked' : ''}><span>${({ regulations: 'Akceptacja regulaminu klubu', image: 'Zgoda na publikację wizerunku', trips: 'Zgoda na wyjazdy' }                          )[k]}</span></label>`).join('')}</div>
        ${g.primaryPayer ? `<div style="margin-top:6px">${badge('główny płatnik', 'info')}</div>` : ''}</div>` }).join('')}` : ''}
      ${guardOf.length ? `<div class="section-title">Moi opiekunowie</div><div class="card small">${guardOf.map((g) => esc(pName(g.guardian))).join(', ')} — zgody i płatności są po stronie opiekuna.</div>` : ''}
      <div class="section-title">Więcej</div><div class="stack">
        ${can('facilities.view') ? link('Obiekty i rezerwacje', '/club/places', 'btn block') : ''}
        ${can('facilities.log.write') ? link('Dziś na obiekcie', '/club/facility', 'btn block') : ''}
        ${can('payments.orders.place') ? link('Zamówienia (np. stroje)', '/club/orders', 'btn block') : ''}
        ${can('payments.orders.collect') ? link('Zamówienia w moich grupach', '/club/coach/orders', 'btn block') : ''}
        ${can('payments.cash.record') ? link('Przyjmij gotówkę', '/club/cash', 'btn block') : ''}
        ${can('backend') ? link('Panel administracyjny', '/backend', 'btn block') : ''}
        ${btn('Wyloguj', 'logout', {}, 'block')}</div>`
  }

  function timeline(pid        , date        , opts                                            )         {
    const open = openingFor(pid, date)
    const startH = 8, endH = 22
    const zones = zonesFor(pid, date)
    const occ = occupancy(pid, date)
    const rows = Array.from({ length: endH - startH }, (_, i) => {
      const h = startH + i
      const isOpen = !!open && h * 60 >= open[0] && h * 60 < open[1]
      return `<div class="tl-row"><div class="tl-hour">${String(h).padStart(2, '0')}:00</div><div class="${opts.clickable && isOpen ? 'tl-slot' : ''}" ${opts.clickable && isOpen ? `data-action="slot" data-place="${pid}" data-date="${date}" data-hour="${h}" role="button" tabindex="0" aria-label="Zarezerwuj od ${h}:00"` : ''}></div></div>`
    }).join('')
    const pos = (m        )         => `${((m - startH * 60) / 60) * 40}px`
    const hgt = (a        , b        )         => `${((b - a) / 60) * 40 - 2}px`
    const zoneEls = zones.map((z) => `<div class="tl-zone z-${z.zone}" style="top:${pos(z.from)};height:${hgt(z.from, z.to)}" title="${zoneLabel(z.zone)}"></div>`).join('')
    // Wpisy nakładające się w czasie (np. dwie grupy na połówkach boiska) idą obok siebie.
    const laneEnds           = []
    const lanes = occ.map((o) => { let l = laneEnds.findIndex((end) => end <= o.from); if (l < 0) { l = laneEnds.length; laneEnds.push(0) } laneEnds[l] = o.to; return l })
    const nl = Math.max(1, laneEnds.length)
    const blocks = occ.map((o, i) => `<div class="tl-block blk-${o.kind}" style="top:${pos(o.from)};height:${hgt(o.from, o.to)};left:calc(16px + (100% - 24px) * ${lanes[i]} / ${nl});right:auto;width:calc((100% - 24px) / ${nl} - 4px)"><strong>${fromMin(o.from)}–${fromMin(o.to)}</strong>${esc(opts.showNames ? o.label : o.publicLabel)}${o.own ? ` <button type="button" class="btn sm" data-action="cancel-booking" data-id="${o.ref}">Anuluj</button>` : ''}</div>`).join('')
    return `<div class="legend"><span><i class="z-public_free"></i>ogólnodostępne</span><span><i class="z-club_training"></i>treningi klubu</span><span><i class="z-reservable_paid"></i>do rezerwacji</span><span><i class="blk-occ"></i>zajęcia</span><span><i class="blk-int"></i>rezerwacja klubu</span><span><i class="blk-rent"></i>wynajem</span><span><i class="blk-pend"></i>zgłoszenie</span></div>
      <div class="timeline">${rows}<div class="tl-layer">${zoneEls}${blocks}</div></div>${!open ? '<p class="small muted">Obiekt zamknięty w tym dniu.</p>' : ''}`
  }
  const zoneLabel = (z      )         => ({ public_free: 'ogólnodostępne', club_training: 'treningi klubu', reservable_paid: 'do rezerwacji', closed: 'zamknięte' }                          )[z]

  function dateChips(hrefFor                       , current        , n = 7)         {
    return `<div class="chips" role="group" aria-label="Dzień">${Array.from({ length: n }, (_, i) => addDays(TODAY, i)).map((d) => `<a class="chip ${d === current ? 'on' : ''}" href="#${hrefFor(d)}" ${d === current ? 'aria-current="date"' : ''}>${dShort(d)}</a>`).join('')}</div>`
  }

  function screenPlaces()         {
    const leaves = db.places.filter((p) => !db.places.some((c) => c.parent === p.id))
    return `<p class="small muted">Rezerwacja klubu jest ważna od razu, jeśli termin jest wolny. Zgłoszenia osób z zewnątrz akceptuje administrator.</p>
      ${leaves.map((p) => { const today = occupancy(p.id, TODAY); return `<a class="card" href="#/club/places/${p.id}?date=${TODAY}" style="display:block;text-decoration:none"><div class="row between"><span class="item-title">${esc(p.name)}</span>${p.parent ? `<span class="small muted">${esc(placeName(db, p.parent))}</span>` : ''}</div>
        <div class="small muted">${esc(p.kind)}${p.surface ? ` · ${esc(p.surface)}` : ''} · dziś: ${today.length ? `${today.length} wpisów` : 'wolny'}</div></a>` }).join('')}`
  }

  function screenPlace(p                        , q                 , backend = false)         {
    const place = db.places.find((x) => x.id === p.id) || db.places.find((x) => x.id === (q.get('place') || 'pl-boisko'))         
    const date = q.get('date') || TODAY
    const day = occupancy(place.id, date)
    const hrefFor = (d        )         => backend ? `/backend/facilities/calendar?place=${place.id}&date=${d}` : `/club/places/${place.id}?date=${d}`
    const placeSel = backend ? `<div class="chips" style="margin-bottom:8px" role="group" aria-label="Miejsce">${db.places.filter((x) => !db.places.some((c) => c.parent === x.id)).map((x) => `<a class="chip ${x.id === place.id ? 'on' : ''}" href="#/backend/facilities/calendar?place=${x.id}&date=${date}">${esc(x.name)}</a>`).join('')}</div>` : ''
    return `${backend ? pageHead('Kalendarz obiektu', 'Strefy, zajęcia, rezerwacje klubu, wynajmy, zgłoszenia i zamknięcia', can('facilities.manage') ? btn('Ustaw dostępność do rezerwacji', 'availability', { place: place.id }, 'primary') : '') : ''}${placeSel}
      ${backend && can('facilities.manage') ? availabilityCard(place) : ''}
      <div class="row between"><div><div class="item-title">${esc(place.name)}</div><div class="small muted">${esc(dLong(date))} · ${place.capacity} ${place.capacity === 1 ? 'grupa' : 'grupy'} klubu naraz</div></div></div>
      ${dateChips(hrefFor, date)}
      <p class="small muted">Kliknij wolną godzinę, aby ${backend ? 'dodać wynajem lub rezerwację klubu' : 'zarezerwować — rezerwacja personelu jest ważna od razu'}.</p>
      ${timeline(place.id, date, { clickable: true, showNames: true })}
      ${day.length ? `<div class="section-title">Wpisy dnia</div><ul class="list small">${day.map((o) => `<li>${fromMin(o.from)}–${fromMin(o.to)} · ${esc(o.label)}${o.own ? ` ${btn('Anuluj', 'cancel-booking', { id: o.ref }, 'sm')}` : ''}</li>`).join('')}</ul>` : ''}`
  }

  // Tygodniowa dostępność do rezerwacji z zewnątrz (reguły stref „do rezerwacji”) dla obiektu.
  function availabilityCard(place       )         {
    const rules = (db.zones[place.id] || []).filter((x) => x.zone === 'reservable_paid')
    const rows = [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const win = rules.filter((x) => x.days.includes(d))
      return `<tr><td><b>${DAY_LONG[d % 7]}</b></td><td>${win.length ? win.map((x) => `${x.from}–${x.to}${x.validTo ? ` <span class="small muted">do ${esc(x.validTo)}</span>` : ''}${x.source === 'dostępność' ? '' : ' <span class="small muted">(regulamin)</span>'}`).join(', ') : '<span class="muted">brak — obiekt nie przyjmuje zgłoszeń</span>'}</td><td>${win.length ? btn('Usuń', 'availability-clear-day', { place: place.id, day: String(d) }, 'sm') : ''}</td></tr>`
    }).join('')
    return `<details class="card" style="margin-bottom:12px" ${rules.length ? '' : 'open'}><summary><b>Dostępność do rezerwacji z zewnątrz</b> <span class="small muted">— godziny, w których osoby spoza klubu mogą zgłaszać rezerwacje (${place.acceptsRequests ? 'obiekt przyjmuje zgłoszenia online' : 'obiekt nie przyjmuje zgłoszeń online'})</span></summary>
      <div class="dt" style="margin-top:10px"><div class="dt-scroll"><table><thead><tr><th>Dzień</th><th>Dostępne do rezerwacji</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <p class="small muted" style="margin:8px 0 0">Zajęcia klubu, rezerwacje klubu i wynajmy w tych godzinach pozostają zajęte — zgłosić można tylko wolny czas, co najmniej 90 minut.</p></details>`
  }

  function availabilityModal(placeId        )       {
    const places = db.places.filter((x) => !db.places.some((c) => c.parent === x.id) && db.zones[x.id])
    const dayChip = (d        )         => `<label class="chip ${d <= 5 ? 'on' : ''}"><input type="checkbox" name="days" value="${d}" class="sr-only" data-change="chip" ${d <= 5 ? 'checked' : ''}>${DAY_SHORT[d % 7]}</label>`
    const perDay = [1, 2, 3, 4, 5, 6, 7].map((d) => `<tr data-field="pd-${d}"><td><label class="check"><input type="checkbox" name="pd-on-${d}" ${d <= 5 ? 'checked' : ''}><span>${DAY_LONG[d % 7]}</span></label></td><td><input type="time" name="pd-from-${d}" value="${d <= 5 ? '16:00' : '09:00'}" aria-label="Od — ${DAY_LONG[d % 7]}"></td><td><input type="time" name="pd-to-${d}" value="${d <= 5 ? '22:00' : '13:00'}" aria-label="Do — ${DAY_LONG[d % 7]}"></td></tr>`).join('')
    openModal({ title: 'Dostępność do rezerwacji z zewnątrz', submitLabel: 'Zapisz dostępność', wide: true,
      body: `<p class="small muted" style="margin-top:0">Ustal, kiedy osoby spoza klubu mogą zgłaszać rezerwacje w publicznym kalendarzu. Zgłoszenie i tak wymaga Twojej akceptacji.</p>
        <div class="field" data-field="places"><span>Obiekty <b class="req">*</b></span><div class="chips">${places.map((x) => `<label class="chip ${x.id === placeId ? 'on' : ''}"><input type="checkbox" name="places" value="${x.id}" class="sr-only" data-change="chip" ${x.id === placeId ? 'checked' : ''}>${esc(x.name)}${x.acceptsRequests ? '' : ' (bez zgłoszeń online)'}</label>`).join('')}</div></div>
        <div style="margin-top:12px">${fld('am', 'Sposób', sel('am', [['same', 'Te same godziny w wybrane dni'], ['perday', 'Różne godziny dla poszczególnych dni']], 'same', 'data-change="avail-mode"'))}</div>
        <div data-am="same" style="margin-top:10px">
          <div class="field" data-field="days"><span>Dni tygodnia <b class="req">*</b></span><div class="chips">${[1, 2, 3, 4, 5, 6, 7].map(dayChip).join('')}</div>
          <div class="row" style="margin-top:6px">${btn('pn–pt', 'avail-days', { set: '1,2,3,4,5' }, 'sm')}${btn('weekend', 'avail-days', { set: '6,7' }, 'sm')}${btn('codziennie', 'avail-days', { set: '1,2,3,4,5,6,7' }, 'sm')}${btn('wyczyść', 'avail-days', { set: '' }, 'sm')}</div></div>
          <div class="fields" style="margin-top:10px">${fld('from', 'Od godziny', inp('from', 'time', '16:00'), { req: true })}${fld('to', 'Do godziny', inp('to', 'time', '22:00'), { req: true })}</div>
        </div>
        <div data-am="perday" hidden style="margin-top:10px"><div class="dt"><div class="dt-scroll"><table><thead><tr><th>Dzień</th><th>Od</th><th>Do</th></tr></thead><tbody>${perDay}</tbody></table></div></div></div>
        <div class="fields" style="margin-top:12px">${fld('validFrom', 'Obowiązuje od', inp('validFrom', 'date', TODAY), { req: true })}${fld('validTo', 'Obowiązuje do (opcjonalnie)', inp('validTo', 'date', ''), { hint: 'Puste = bez końca, np. cały sezon' })}</div>
        ${chk('replace', 'Zastąp dotychczasową dostępność w wybrane dni (bez zaznaczenia — dopisz kolejne godziny)', true)}
        <p class="small muted">Godziny muszą mieścić się w godzinach otwarcia z regulaminu (pn–pt 8:00–22:00, sob–nd 9:00–20:30) i obejmować co najmniej 90 minut.</p>`,
      onSubmit: (fd) => {
        const errs         = {}
        const placeIds = fd.getAll('places').map(String)
        if (!placeIds.length) errs.places = 'Wybierz co najmniej jeden obiekt.'
        const windows                                            = []
        const check = (d        , from        , to        , key        )       => {
          if (!from || !to) { errs[key] = 'Podaj godziny.'; return }
          if (toMin(to) <= toMin(from)) { errs[key] = `${DAY_LONG[d % 7]}: godzina „do” musi być późniejsza niż „od”.`; return }
          if (toMin(to) - toMin(from) < 90) { errs[key] = `${DAY_LONG[d % 7]}: co najmniej 90 minut (jedna jednostka rezerwacji).`; return }
          const o = OPENING[placeIds[0] || placeId] || { weekday: ['08:00', '22:00'], weekend: ['09:00', '20:30'] }
          const [oa, ob] = d >= 6 ? o.weekend : o.weekday
          if (toMin(from) < toMin(oa) || toMin(to) > toMin(ob)) { errs[key] = `${DAY_LONG[d % 7]}: poza godzinami otwarcia (${oa}–${ob}).`; return }
          windows.push({ d, from, to })
        }
        if (fd.get('am') === 'perday') {
          for (let d = 1; d <= 7; d++) if (fd.get(`pd-on-${d}`)) check(d, String(fd.get(`pd-from-${d}`) || ''), String(fd.get(`pd-to-${d}`) || ''), `pd-${d}`)
          if (!windows.length && !Object.keys(errs).some((k) => k.startsWith('pd-'))) errs._ = 'Zaznacz co najmniej jeden dzień.'
        } else {
          const ds = fd.getAll('days').map(Number)
          if (!ds.length) errs.days = 'Wybierz co najmniej jeden dzień.'
          for (const d of ds) { check(d, String(fd.get('from') || ''), String(fd.get('to') || ''), 'to'); if (errs.to) break }
        }
        const vf = String(fd.get('validFrom') || ''), vt = String(fd.get('validTo') || '')
        if (!vf) errs.validFrom = 'Podaj datę.'
        if (vt && vt < vf) errs.validTo = 'Data „do” musi być ≥ „od”.'
        if (Object.keys(errs).length) return errs
        const replace = !!fd.get('replace')
        const days = [...new Set(windows.map((w) => w.d))]
        let created = 0
        for (const pid of placeIds) {
          const list = db.zones[pid] || (db.zones[pid] = [])
          if (replace) {
            for (const rule of list) if (rule.zone === 'reservable_paid') rule.days = rule.days.filter((d) => !days.includes(d))
            db.zones[pid] = list.filter((rule) => rule.days.length)
          }
          const byHours                           = {}
          for (const w of windows) (byHours[`${w.from}-${w.to}`] ||= []).push(w.d)
          for (const [k, ds] of Object.entries(byHours)) { const [from, to] = k.split('-'); db.zones[pid].push({ days: ds, from, to, zone: 'reservable_paid', priority: 3, validFrom: vf, validTo: vt || undefined, source: 'dostępność' }); created += ds.length }
        }
        // Ostrzeżenia: zajęcia klubu w nowych oknach (zostają zajęte), zgłoszenia poza nową dostępnością
        let clubBusy = 0
        for (let i = 0; i < 28; i++) { const d = addDays(TODAY, i); for (const pid of placeIds) for (const w of windows.filter((x) => x.d === weekday(d))) clubBusy += occupancy(pid, d).filter((o) => (o.kind === 'occ' || o.kind === 'int') && overlap(toMin(w.from), toMin(w.to), o.from, o.to)).length }
        const pendingOutside = db.rentals.filter((x) => x.status === 'pending_approval' && placeIds.includes(x.place) && !zonesFor(x.place, x.date).some((z) => z.zone === 'reservable_paid' && z.from <= toMin(x.start) && z.to >= toMin(x.end))).length
        const plural = (n        , one        , few        , many        )         => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? few : many
        toast(`Zapisano dostępność: ${placeIds.length} ${plural(placeIds.length, 'obiekt', 'obiekty', 'obiektów')} × ${days.length} ${plural(days.length, 'dzień', 'dni', 'dni')} (${created} ${plural(created, 'wpis', 'wpisy', 'wpisów')}).${clubBusy ? ` W tych godzinach jest ${clubBusy} zajęć klubu w najbliższych 4 tygodniach — te terminy pozostają zajęte.` : ''}${pendingOutside ? ` Uwaga: ${pendingOutside} zgłoszeń czeka poza nową dostępnością — zdecyduj o nich w „Zgłoszeniach”.` : ''}`)
        render()
      } })
  }

  function screenFacilityToday()         {
    const fam = placeFamily('pl-orlik')
    const occ = db.occurrences.filter((o) => o.date === TODAY && fam.includes(o.place) && o.status !== 'cancelled')
    const rent = db.rentals.filter((r) => r.date === TODAY && fam.includes(r.place) && ['requested', 'confirmed', 'no_show'].includes(r.status))
    const L = db.log
    const items = [...occ.map((o) => ({ t: o.start, html: `<b>${o.start}–${o.end}</b> ${esc(o.name)} · ${esc(placeName(db, o.place))}<div class="small muted">grupa klubu · ${esc(pName(o.coach))}</div>` })),
      ...rent.map((r) => ({ t: r.start, html: `<b>${r.start}–${r.end}</b> Wynajem: ${esc(r.renter)} · ${esc(placeName(db, r.place))} ${statusBadge(r.status)}<div class="small muted">kontakt: ${esc(r.contact)}, ${esc(r.phone)}</div>${r.status !== 'no_show' ? `<div class="row" style="margin-top:6px">${btn('Nie stawił się', 'no-show', { id: r.id }, 'sm')}</div>` : ''}` }))].sort((a, b) => a.t.localeCompare(b.t))
    return `<div class="card"><div class="row between"><span class="item-title">Orlik 2024 — ${esc(dShort(TODAY))}</span>${L.closed ? badge('zamknięty', 'neutral') : L.opened ? badge(`otwarty ${L.openedAt}`, 'success') : badge('nieotwarty', 'warning')}</div>
      <div class="stack" style="margin-top:10px">${!L.opened ? btn('Otwórz obiekt', 'open-facility', {}, 'primary block') : !L.closed ? btn('Zamknij obiekt', 'close-facility', {}, 'block') : ''}${btn('Zgłoś incydent', 'incident', {}, 'block danger')}</div></div>
      <div class="section-title">Na obiekcie dziś</div>
      ${items.length ? `<ul class="list">${items.map((i) => `<li>${i.html}${L.opened ? `<div class="row" style="margin-top:6px"><input type="number" min="0" placeholder="liczba osób" aria-label="Liczba osób" style="width:120px">${chk('adult', 'pełnoletni opiekun obecny')}</div>` : ''}</li>`).join('')}</ul>` : empty('Dziś na obiekcie nic nie zaplanowano', 'Godziny ogólnodostępne według strefy.')}
      ${L.opened ? `<div class="small muted">Stan przed: ${esc(L.before)}</div>` : ''}`
  }

  function screenLink(q                 )         {
    const o = occById(q.get('occ') || '')
    return `${o ? `<div class="card"><div class="item-title">${esc(o.name)}</div><div class="small muted">${dShort(o.date)} ${o.start} · ${esc(placeName(db, o.place))}</div></div>` : ''}
      <form class="form" data-form="link-request" data-occ="${o ? o.id : ''}" style="margin-top:12px" novalidate><p>Aby zadeklarować obecność bez logowania, podaj e-mail zapisany w klubie — wyślemy osobisty link ważny do rozpoczęcia terminu.</p>
      ${fld('email', 'E-mail', inp('email', 'email', '', 'autocomplete="email"'), { req: true })}<button class="btn primary block" type="submit">Wyślij mi link</button></form>
      <p class="small muted" style="margin-top:12px">Masz konto? ${link('Zaloguj się', '/login', '')}</p>`
  }

  function screenTokenDeclare(p                        )         {
    const t = db.tokens[p.token]
    if (!t) return `<div class="alert error"><strong>Nieprawidłowy link (404)</strong>Sprawdź, czy skopiowałeś cały adres.</div>`
    const o = occById(t.occ)              
    if (t.expired || started(o)) return `<div class="alert error" role="alert"><strong>Link wygasł (410)</strong>Deklaracje dla tego terminu są zamknięte albo link stracił ważność.</div>${link('Poproś o nowy link', `/club/link?occ=${o.id}`, 'btn primary block')}`
    const g = group(o.group)
    const kids = wardsOf(t.guardian).filter((w) => g.members.includes(w))
    return `<div class="card"><div class="item-title">${esc(o.name)}</div><div class="small muted">${esc(dLong(o.date))}, ${o.start}–${o.end} · ${esc(placeName(db, o.place))}</div></div>
      <div class="section-title">Twoje dzieci w tej grupie</div>
      ${kids.map((w) => { const a = db.attendance[o.id]?.[w]; return `<div class="row between card"><span class="item-title">${esc(personById(db, w).first)}</span><div class="seg"><button type="button" class="${a?.declared === 'yes' ? 'on-yes' : ''}" data-action="token-declare" data-token="${p.token}" data-person="${w}" data-val="yes">Będzie</button><button type="button" class="${a?.declared === 'no' ? 'on-no' : ''}" data-action="token-declare" data-token="${p.token}" data-person="${w}" data-val="no">Nie będzie</button></div></div>` }).join('')}
      <p class="small muted">${link('Zaloguj się', '/login', '')}, aby zobaczyć cały kalendarz.</p>`
  }

  function screenLogin()         {
    return `<form class="form" data-form="login" novalidate style="margin-top:12px"><div style="text-align:center;margin-bottom:8px">${logoBox(db.settings.logo, 'Logo klubu', 52)}<h2 style="margin:8px 0 0">${esc(db.settings.name)}</h2><p class="muted small">Jedno konto dla rodzica, zawodnika i trenera</p></div>
      <div class="form-general"></div>${fld('email', 'E-mail', inp('email', 'email', '', 'autocomplete="username"'), { req: true })}${fld('password', 'Hasło', inp('password', 'password', '', 'autocomplete="current-password"'), { req: true })}
      <button class="btn primary block" type="submit">Zaloguj</button><a href="#/login" class="small muted" style="text-align:center">Nie pamiętam hasła</a></form>
      <div class="card small" style="margin-top:16px"><b>Konta demonstracyjne</b> (dowolne hasło, min. 4 znaki):<ul style="margin:6px 0 0;padding-left:18px">${PERSONAS.filter((x) => x.email).map((x) => `<li><a href="#" data-action="fill-login" data-email="${x.email}">${esc(x.email)}</a> — ${esc(x.role)}</li>`).join('')}</ul></div>`
  }

  // ═══════════════════════════════════════════════════════════════════
  // Ekrany panelu (B)
  // ═══════════════════════════════════════════════════════════════════
  function screenDashboard()         {
    const pid = me()
    const secs = coordSections(pid)
    const inScope = (o            )          => secs.includes(group(o.group).section)
    const unassigned = db.occurrences.filter((o) => o.status === 'planned' && !o.coach && o.date >= TODAY && o.date <= addDays(TODAY, 14) && inScope(o))
    const unsettled = db.occurrences.filter((o) => o.status === 'planned' && ended(o) && inScope(o))
    const overdue = db.charges.filter((c) => c.source === 'fee' && c.due < TODAY && ['open', 'partially_paid'].includes(c.status))
    const missing = db.charges.filter((c) => c.payerMissing && c.status !== 'paid')
    const pend = db.rentals.filter((r) => r.status === 'pending_approval')
    const noCoord = db.sections.filter((s) => s.active && !db.roles.some((r) => r.role === 'coordinator' && r.section === s.id))
    const w = (title        , body        , href        , count         )         => `<section class="card"><div class="tile-head"><h2>${esc(title)}${count !== undefined ? ` <span class="count">${count}</span>` : ''}</h2><a href="#${href}">Otwórz</a></div>${body}</section>`
    const widgets           = []
    if (can('activities.view')) {
      widgets.push(w('Terminy do obsadzenia', unassigned.length ? `<ul class="list small">${unassigned.map((o) => `<li><a href="#/backend/activities/occurrences?view=unassigned">${dShort(o.date)} ${o.start} — ${esc(o.name)}</a></li>`).join('')}</ul>` : '<p class="muted small">Wszystkie terminy w najbliższych 14 dniach mają trenera.</p>', '/backend/activities/occurrences?view=unassigned', unassigned.length))
      widgets.push(w('Nierozliczone terminy', unsettled.length ? `<ul class="list small">${unsettled.map((o) => `<li>${dShort(o.date)} ${o.start} — ${esc(o.name)} · ${esc(pName(o.coach))}</li>`).join('')}</ul>` : '<p class="muted small">Wszystkie zakończone terminy mają obecność.</p>', '/backend/activities/occurrences?view=unsettled', unsettled.length))
    }
    if (can('payments.view')) {
      const sum = overdue.reduce((s, c) => s + remaining(c), 0)
      const toConfirm = db.bankTx.filter((t) => t.status === 'suggested' || t.status === 'unmatched').length
      widgets.push(w('Wyciągi i gotówka', `<p class="small" style="margin:0 0 8px">${toConfirm ? `<b>${toConfirm}</b> przelewów czeka na potwierdzenie lub przypisanie.` : 'Wszystkie zaimportowane przelewy są rozliczone.'}</p><div class="row">${link('Importuj wyciąg', '/backend/payments/bank', 'btn sm')}${btn('Przyjmij gotówkę', 'cash', {}, 'sm')}</div>`, '/backend/payments/bank', toConfirm))
      widgets.push(w('Zaległości', `<div class="kpi">${zl(sum)}</div><p class="muted small">${overdue.length} należności po terminie · ${new Set(overdue.map((c) => c.payerPerson)).size} rodzin</p>`, '/backend/payments/charges?view=overdue', overdue.length))
      widgets.push(w('Należności bez płatnika', missing.length ? `<ul class="list small">${missing.map((c) => `<li>${esc(c.description)}</li>`).join('')}</ul>` : '<p class="muted small">Każda należność ma płatnika.</p>', '/backend/payments/charges?view=missing', missing.length))
    }
    if (can('payments.orders.manage')) widgets.push(kitDashboardWidget(w))
    if (can('facilities.rentals.approve')) widgets.push(w('Zgłoszenia do akceptacji', pend.length ? `<ul class="list small">${pend.map((r) => `<li>${esc(r.renter)} — ${dShort(r.date)} ${r.start} · wygasa ${esc(r.holdUntil)}</li>`).join('')}</ul>` : '<p class="muted small">Brak zgłoszeń.</p>', '/backend/facilities/requests', pend.length))
    if (can('facilities.view')) { const today = occupancy('pl-boisko', TODAY).concat(occupancy('pl-multi', TODAY)); widgets.push(w('Dziś na obiekcie', `<ul class="list small">${today.map((o) => `<li>${fromMin(o.from)}–${fromMin(o.to)} ${esc(o.label)}</li>`).join('') || '<li class="muted">Nic nie zaplanowano</li>'}</ul>`, '/backend/facilities/calendar')) }
    if (isAdmin()) widgets.push(w('Sekcje bez koordynatora', noCoord.length ? `<ul class="list small">${noCoord.map((s) => `<li><a href="#/backend/club/sections/${s.id}?tab=coord">${esc(s.name)}</a></li>`).join('')}</ul>` : '<p class="muted small">Każda sekcja ma koordynatora.</p>', '/backend/club/sections', noCoord.length))
    return `${pageHead(`Dzień dobry, ${personById(db, pid).first}`, `${dLong(TODAY)} · co wymaga dziś działania`)}<div class="grid2">${widgets.join('')}</div>`
  }

  function screenSettings()         {
    const s = db.settings
    return `${pageHead('Ustawienia klubu', 'Dane klubu i parametry działania')}
      <form class="form" data-form="settings" novalidate><div class="form-group"><h3>Klub</h3><div class="fields">
      ${fld('name', 'Nazwa', inp('name', 'text', s.name), { req: true })}${fld('short', 'Nazwa skrócona', inp('short', 'text', s.short), { req: true })}
      ${fld('slug', 'Publiczny adres', inp('slug', 'text', s.slug), { req: true, hint: 'vereino…/p/<adres> · małe litery, cyfry, myślniki (3–40)' })}${fld('phone', 'Telefon kontaktowy', inp('phone', 'tel', s.phone))}
      ${fld('tz', 'Strefa czasowa', sel('tz', [['Europe/Warsaw', 'Europe/Warsaw']], s.tz))}${fld('minAge', 'Próg wieku własnego konta', inp('minAge', 'number', String(s.minAge), 'min="13" max="18"'), { req: true, hint: '13–18 lat (D-004; do potwierdzenia prawnego Q-007)' })}
      </div>${fld('description', 'Opis klubu (strona publiczna)', area('description', s.description))}</div>
      <div class="form-group"><h3>Logo klubu</h3><div class="row" style="gap:16px;align-items:flex-start">${logoBox(s.logo, 'Logo klubu', 72)}<div class="stack" style="flex:1;min-width:200px">
        <label class="field" data-field="logo"><span>${s.logo ? 'Podmień logo' : 'Wgraj logo'}</span><input type="file" accept="image/png,image/jpeg,image/webp" data-change="logo-upload" data-target="club"><small>PNG, JPG lub WebP, do 2 MB; najlepiej kwadrat od 256 px. Widoczne w nagłówkach panelu, aplikacji i strony klubu oraz w sekcjach bez własnego logo.</small></label>
        ${s.logo ? btn('Usuń logo klubu', 'logo-remove', { target: 'club' }, 'sm danger') : '<p class="small muted" style="margin:0">Brak logo — wyświetlany jest inicjał nazwy klubu.</p>'}</div></div></div>
      <div class="form-actions"><button class="btn primary" type="submit">Zapisz</button></div></form>`
  }

  function screenPublication()         {
    const pub = db.settings.publication
    const rows                             = [
      ['description_schedule', 'Opis i harmonogram zajęć', 'Opisy sekcji i grup, dni, godziny, miejsce, najbliższe terminy z odwołaniami.'],
      ['conditions', 'Warunki', 'Wiek, poziom, wymagany sprzęt i dokumenty.'],
      ['prices', 'Ceny', 'Składka z cennika grupy i zniżka na rodzeństwo.'],
      ['coaches', 'Prowadzący', 'Imię i nazwisko trenera/instruktora — tylko za jego zgodą w profilu.'],
      ['materials', 'Materiały', 'Pliki oznaczone jako publiczne (regulaminy, deklaracje).'],
      ['contact', 'Kontakt', 'Kontakt do publikacji wpisany przy sekcji (nie dane z kartoteki).'],
      ['places_calendar', 'Kalendarz obiektów', 'Publiczna zajętość obiektów bez nazw najemców.'],
      ['online_requests', 'Zgłoszenia rezerwacji online', 'Formularz zgłoszenia przy wolnych slotach; zgłoszenie ważne dopiero po akceptacji administratora.'],
    ]
    return `${pageHead('Publikacja strony klubu', 'Co klub pokazuje osobom z zewnątrz. Wyłączony blok nie jest wysyłany przez API.', link('Podgląd strony', '/p/gwiazda', 'btn'))}
      <form class="form" data-form="publication" novalidate><div class="form-group">
      <div class="toggle-row"><div><b>Strona klubu włączona</b><div class="small muted">Adres: /p/${esc(db.settings.slug)}</div></div><input type="checkbox" name="enabled" ${pub.enabled ? 'checked' : ''} aria-label="Strona klubu włączona"></div>
      ${rows.map(([k, l, d]) => `<div class="toggle-row" data-field="${k}"><div><b>${esc(l)}</b><div class="small muted">${esc(d)}</div></div><input type="checkbox" name="${k}" ${pub[k] ? 'checked' : ''} aria-label="${esc(l)}"></div>`).join('')}
      </div><div class="form-general"></div><div class="form-actions"><button class="btn primary" type="submit">Zapisz</button></div></form>`
  }

  function screenSections()         {
    return `${pageHead('Sekcje', 'Sekcja ma koordynatora, grupy, aktywności i własną stronę publiczną', isAdmin() ? btn('Dodaj sekcję', 'new-section', {}, 'primary') : '')}
      ${table({ cols: [
        { label: 'Logo', cell: (s         ) => `<span class="row" style="gap:6px">${logoBox(sectionLogo(s), `Logo sekcji ${s.name}`, 28)}${s.logo ? '' : '<span class="small muted">klubu</span>'}</span>` },
        { label: 'Sekcja', cell: (s         ) => `<a class="row-link" href="#/backend/club/sections/${s.id}">${esc(s.name)}</a>` },
        { label: 'Koordynatorzy', cell: (s         ) => { const c = db.roles.filter((r) => r.role === 'coordinator' && r.section === s.id).map((r) => esc(pName(r.person))); return c.length ? c.join(', ') : badge('bez koordynatora', 'warning') } },
        { label: 'Grupy', num: true, cell: (s         ) => String(db.groups.filter((g) => g.section === s.id).length) },
        { label: 'Publiczna', cell: (s         ) => s.isPublic ? badge('tak', 'success') : badge('nie', 'neutral') },
        { label: 'Status', cell: (s         ) => s.active ? badge('aktywna', 'success') : badge('nieaktywna', 'neutral') },
        { label: '', cell: (s         ) => isAdmin() ? btn('Dezaktywuj', 'deactivate-section', { id: s.id }, 'sm') : '' },
      ], rows: db.sections, toolbar: `<input type="search" placeholder="Szukaj sekcji…" aria-label="Szukaj">`, empty: ['Klub nie ma jeszcze sekcji', 'Dodaj pierwszą sekcję, np. akademię piłkarską.'] })}`
  }

  function screenSection(p                        , q                 )         {
    const s = section(p.id)
    if (!s) return empty('Nie znaleziono sekcji', '404')
    const tab = q.get('tab') || 'data'
    const canEdit = isAdmin() || (can('club_core.sections.public_content') && coordSections(me()).includes(s.id))
    const tabs = `<div class="tabs">${[['data', 'Dane'], ['coord', 'Koordynatorzy'], ['public', 'Strona publiczna']].map(([k, l]) => `<a class="${tab === k ? 'active' : ''}" href="#/backend/club/sections/${s.id}?tab=${k}">${l}</a>`).join('')}</div>`
    let body = ''
    if (tab === 'data') body = `<form class="form" data-form="section" data-id="${s.id}" novalidate><div class="form-group"><div class="fields">${fld('name', 'Nazwa', inp('name', 'text', s.name, isAdmin() ? '' : 'disabled'), { req: true })}${fld('short', 'Krótki opis', inp('short', 'text', s.short))}</div>${fld('description', 'Opis wewnętrzny', area('description', s.description))}</div>
      <div class="form-group"><h3>Logo sekcji</h3><div class="row" style="gap:16px;align-items:flex-start">${logoBox(sectionLogo(s), `Logo sekcji ${s.name}`, 72)}<div class="stack" style="flex:1;min-width:200px">
        <p class="small muted" style="margin:0">${s.logo ? 'Sekcja ma własne logo.' : 'Sekcja nie ma własnego logo — wyświetlane jest logo klubu.'}</p>
        ${canEdit ? `<label class="field" data-field="logo"><span>${s.logo ? 'Podmień logo sekcji' : 'Wgraj logo sekcji'}</span><input type="file" accept="image/png,image/jpeg,image/webp" data-change="logo-upload" data-target="${s.id}"><small>PNG, JPG lub WebP, do 2 MB; najlepiej kwadrat od 256 px.</small></label>${s.logo ? btn('Usuń logo sekcji (użyj logo klubu)', 'logo-remove', { target: s.id }, 'sm') : ''}` : ''}</div></div></div>
      <div class="form-actions"><button class="btn primary" type="submit" ${canEdit ? '' : 'disabled'}>Zapisz</button></div></form>`
    if (tab === 'coord') {
      const rows = db.roles.filter((r) => r.role === 'coordinator' && r.section === s.id)
      body = `${!rows.length ? '<div class="alert warning"><strong>Sekcja nie ma koordynatora</strong>Przypisz osobę — będzie zarządzać grupami, terminami i stroną sekcji.</div>' : ''}${table({ cols: [{ label: 'Osoba', cell: (r                ) => esc(pName(r.person)) }, { label: 'Od', cell: () => '2026-09-01' }, { label: '', cell: (r                ) => isAdmin() ? btn('Zakończ', 'end-role', { id: r.id }, 'sm') : '' }], rows, empty: ['Brak koordynatorów', 'Dodaj koordynatora sekcji.'], toolbar: isAdmin() ? btn('Przypisz koordynatora', 'add-coordinator', { section: s.id }, 'primary sm') : '' })}`
    }
    if (tab === 'public') body = `<form class="form" data-form="section-public" data-id="${s.id}" novalidate><div class="form-group"><h3>Strona publiczna sekcji</h3>
      ${chk('isPublic', 'Sekcja widoczna na stronie klubu', s.isPublic)}<div class="fields" style="margin-top:10px">${fld('slug', 'Adres sekcji', inp('slug', 'text', s.slug), { req: true, hint: `/p/${db.settings.slug}/sections/<adres>` })}</div>
      ${fld('description', 'Opis publiczny', area('description', s.description))}${fld('conditions', 'Warunki uczestnictwa', area('conditions', s.conditions))}
      <div class="fields">${fld('contactName', 'Kontakt — osoba', inp('contactName', 'text', s.contactName))}${fld('contactEmail', 'Kontakt — e-mail', inp('contactEmail', 'email', s.contactEmail))}${fld('contactPhone', 'Kontakt — telefon', inp('contactPhone', 'tel', s.contactPhone))}</div>
      <div class="field" style="margin-top:8px"><span>Materiały publiczne</span><ul class="list small">${s.materials.map((m) => `<li>📄 ${esc(m)}</li>`).join('') || '<li class="muted">Brak plików</li>'}</ul><small>PDF, JPG, PNG do 10 MB; plik jest publiczny tylko z oznaczeniem „publiczny”.</small></div></div>
      <div class="form-actions">${link('Podgląd', `/p/gwiazda/sections/${s.slug}`, 'btn')}<button class="btn primary" type="submit" ${canEdit ? '' : 'disabled'}>Zapisz</button></div></form>`
    return `${pageHead(s.name, 'Sekcja klubu')}${tabs}${body}`
  }

  function screenPlacesAdmin()         {
    return `${pageHead('Miejsca', 'Hierarchia obiektów: kompleks → boisko, sala, basen', isAdmin() ? btn('Dodaj miejsce', 'todo', { what: 'Formularz miejsca (CrudForm)' }, 'primary') : '')}
      ${table({ cols: [
        { label: 'Miejsce', cell: (x       ) => `${x.parent ? '↳ ' : ''}<b>${esc(x.name)}</b>` },
        { label: 'Rodzaj', cell: (x       ) => esc(x.kind) },
        { label: 'Nadrzędne', cell: (x       ) => esc(x.parent ? placeName(db, x.parent) : '—') },
        { label: 'Grupy naraz', num: true, cell: (x       ) => String(x.capacity) },
        { label: 'Harmonogram publiczny', cell: (x       ) => x.publicSchedule ? badge('tak', 'success') : badge('nie', 'neutral') },
        { label: 'Zgłoszenia online', cell: (x       ) => x.acceptsRequests ? badge('tak', 'success') : badge('nie', 'neutral') },
      ], rows: db.places })}`
  }

  function screenInstitutions(q                 )         {
    const tab = q.get('tab') || 'inst'
    const tabs = `<div class="tabs"><a class="${tab === 'inst' ? 'active' : ''}" href="#/backend/club/institutions?tab=inst">Instytucje</a><a class="${tab === 'contracts' ? 'active' : ''}" href="#/backend/club/institutions?tab=contracts">Umowy</a></div>`
    const body = tab === 'inst' ? table({ cols: [{ label: 'Nazwa', cell: (i     ) => `<b>${esc(i.name)}</b>` }, { label: 'Typ', cell: (i     ) => esc(i.type) }, { label: 'Kontakt', cell: (i     ) => esc(i.contact) }, { label: 'Konto', cell: (i     ) => esc(i.bank || '—') }], rows: db.institutions })
      : table({ cols: [{ label: 'Strona', cell: (c     ) => esc(c.party.startsWith('p-') ? pName(c.party) : (db.institutions.find((i) => i.id === c.party) || { name: c.party }).name) }, { label: 'Rodzaj', cell: (c     ) => esc(c.kind) }, { label: 'Od', cell: (c     ) => esc(c.from) }, { label: 'Podstawa', num: true, cell: (c     ) => c.kind === 'trener' ? zl(c.base) : '—' }, { label: 'Za jednostkę', num: true, cell: (c     ) => c.kind === 'trener' ? zl(c.unit) : '—' }, { label: 'Mecz', num: true, cell: (c     ) => c.kind === 'trener' ? zl(c.match) : '—' }, { label: 'Uwagi', cell: (c     ) => esc(c.note || '') }], rows: db.contracts })
    return `${pageHead('Instytucje i umowy', 'Gmina, szkoły, kluby, firmy; stawki trenerów i umowa administracyjna')}${tabs}${body}`
  }

  function screenPersons(q                 )         {
    const term = (ui.personSearch || '').toLowerCase()
    const filter = q.get('f') || 'all'
    const rows = db.persons.filter((p) => `${p.first} ${p.last}`.toLowerCase().includes(term)).filter((p) => filter === 'all' || (filter === 'staff' ? db.roles.some((r) => r.person === p.id) : filter === 'kids' ? ageOn(p.birth) < 18 : filter === 'noaccount' ? !p.account : true))
    return `${pageHead('Osoby', 'Jedna kartoteka klubu — wszystkie sekcje', can('people.manage') ? btn('Dodaj osobę', 'new-person', {}, 'primary') : '')}
      ${table({ tabs: [['Wszyscy', '/backend/people/persons?f=all', filter === 'all'], ['Personel', '/backend/people/persons?f=staff', filter === 'staff'], ['Dzieci i młodzież', '/backend/people/persons?f=kids', filter === 'kids'], ['Bez konta', '/backend/people/persons?f=noaccount', filter === 'noaccount']],
        toolbar: `<input type="search" id="person-search" placeholder="Szukaj po nazwisku…" aria-label="Szukaj osób" value="${esc(ui.personSearch || '')}" data-input="person-search">`,
        cols: [
          { label: 'Osoba', cell: (p        ) => `<a class="row-link" href="#/backend/people/persons/${p.id}">${esc(p.last)} ${esc(p.first)}</a>` },
          { label: 'Wiek', num: true, cell: (p        ) => String(ageOn(p.birth)) },
          { label: 'Role', cell: (p        ) => [...new Set(db.roles.filter((r) => r.person === p.id).map((r) => ({ club_admin: 'administrator', coordinator: 'koordynator', coach: 'trener', facility_operator: 'animator' }                          )[r.role]))].map((r) => badge(r, 'info')).join(' ') + (wardsOf(p.id).length ? ` ${badge('opiekun', 'neutral')}` : '') },
          { label: 'Grupy', cell: (p        ) => esc(db.groups.filter((g) => g.members.includes(p.id)).map((g) => g.name).join(', ')) },
          { label: 'Konto', cell: (p        ) => p.account ? badge('tak', 'success') : badge('nie', 'neutral') },
          { label: 'Opiekunowie', cell: (p        ) => esc(db.guardianships.filter((g) => g.ward === p.id).map((g) => pName(g.guardian)).join(', ')) },
        ], rows, empty: ['Brak osób', 'Dodaj pierwszą osobę lub całą rodzinę.'] })}`
  }

  function screenPerson(p                        , q                 )         {
    const person = db.persons.find((x) => x.id === p.id)
    if (!person) return empty('Nie znaleziono osoby', '404')
    const tab = q.get('tab') || 'dane'
    const age = ageOn(person.birth)
    const tabs = `<div class="tabs">${[['dane', 'Dane'], ['opieka', 'Opieka i zgody'], ['role', 'Role'], ['konto', 'Konto'], ['grupy', 'Grupy'], ['naleznosci', 'Należności']].map(([k, l]) => `<a class="${tab === k ? 'active' : ''}" href="#/backend/people/persons/${person.id}?tab=${k}">${l}</a>`).join('')}</div>`
    let body = ''
    if (tab === 'dane') body = `<form class="form" data-form="person" data-id="${person.id}" data-version="${person.updatedAt}" novalidate><div class="form-group"><div class="fields">
      ${fld('first', 'Imię', inp('first', 'text', person.first), { req: true })}${fld('last', 'Nazwisko', inp('last', 'text', person.last), { req: true })}${fld('birth', 'Data urodzenia', inp('birth', 'date', person.birth), { req: true })}
      ${fld('pesel', 'PESEL', can('people.pesel.view') ? inp('pesel', 'text', person.pesel || '', 'inputmode="numeric" maxlength="11"') : inp('pesel', 'text', person.pesel ? '•••••••••••' : '', 'disabled'), { hint: can('people.pesel.view') ? 'Opcjonalny, szyfrowany; suma kontrolna i zgodność z datą urodzenia' : 'Widoczny tylko dla administratora' })}
      ${fld('phone', 'Telefon', inp('phone', 'tel', person.phone || ''))}${fld('email', 'E-mail', inp('email', 'email', person.email || ''))}</div></div>
      <div class="form-actions">${btn('Symuluj zmianę przez inną osobę', 'simulate-conflict', { id: person.id }, 'sm')}<button class="btn primary" type="submit">Zapisz</button></div></form>`
    if (tab === 'opieka') {
      const asG = db.guardianships.filter((g) => g.guardian === person.id), asW = db.guardianships.filter((g) => g.ward === person.id)
      const consent = (g              )         => (['regulations', 'image', 'trips']         ).map((k) => g.consents[k] ? badge({ regulations: 'regulamin', image: 'wizerunek', trips: 'wyjazdy' }[k], 'success') : badge(`brak: ${{ regulations: 'regulamin', image: 'wizerunek', trips: 'wyjazdy' }[k]}`, 'neutral')).join(' ')
      body = `${asG.length || !asW.length ? `<div class="section-title">Podopieczni</div>${table({ cols: [{ label: 'Podopieczny', cell: (g              ) => `<a class="row-link" href="#/backend/people/persons/${g.ward}">${esc(pName(g.ward))}</a> <span class="muted small">${ageOn(personById(db, g.ward).birth)} lat</span>` }, { label: 'Relacja', cell: (g              ) => esc(g.relation) }, { label: 'Płatnik', cell: (g              ) => g.primaryPayer ? badge('główny płatnik', 'info') : '—' }, { label: 'Zgody', cell: consent }], rows: asG, toolbar: can('people.manage') ? btn('Dodaj podopiecznego', 'add-ward', { guardian: person.id }, 'primary sm') : '', empty: ['Brak podopiecznych', 'Dodaj dziecko, którym ta osoba opiekuje się prawnie.'] })}` : ''}
        ${asW.length ? `<div class="section-title">Opiekunowie</div>${table({ cols: [{ label: 'Opiekun', cell: (g              ) => `<a class="row-link" href="#/backend/people/persons/${g.guardian}">${esc(pName(g.guardian))}</a>` }, { label: 'Relacja', cell: (g              ) => esc(g.relation) }, { label: 'Płatnik', cell: (g              ) => g.primaryPayer ? badge('główny płatnik', 'info') : '—' }, { label: 'Zgody', cell: consent }], rows: asW })}` : ''}`
    }
    if (tab === 'role') body = table({ cols: [{ label: 'Rola', cell: (r                ) => esc(({ club_admin: 'administrator klubu', coordinator: 'koordynator sekcji', coach: 'trener / instruktor', facility_operator: 'animator obiektu' }                          )[r.role]) }, { label: 'Zakres', cell: (r                ) => esc(r.section ? section(r.section).name : r.place ? placeName(db, r.place) : 'cały klub') }, { label: 'Od', cell: () => '2026-09-01' }], rows: db.roles.filter((r) => r.person === person.id), empty: ['Brak ról personelu', 'Uczestnik i opiekun wynikają z grup i opieki — nie nadaje się ich ręcznie.'], toolbar: can('people.roles.manage') ? btn('Przypisz rolę', 'add-role', { person: person.id }, 'primary sm') : '' })
    if (tab === 'konto') body = person.account ? `<div class="alert success"><strong>Konto aktywne</strong>Login: ${esc(person.email)} · rola członkowska + role personelu z przypisań.</div>`
      : age < db.settings.minAge ? `<div class="alert info"><strong>Konto niedostępne</strong>${esc(person.first)} ma ${age} lat — poniżej progu wieku konta (${db.settings.minAge}). Kalendarzem i deklaracjami zarządza opiekun.</div><button class="btn" disabled title="Poniżej progu wieku konta">Załóż konto</button>`
      : `<div class="card"><p>Osoba nie ma konta. Po założeniu dostanie e-mail z ustawieniem hasła.${age < 18 ? ' Konto niepełnoletniego ma ograniczony widok (kalendarz, obecność, komunikaty); zgody i płatności zostają u opiekuna.' : ''}</p>${btn('Załóż konto', 'create-account', { id: person.id }, 'primary')}</div>`
    if (tab === 'grupy') body = table({ cols: [{ label: 'Grupa', cell: (g       ) => esc(g.name) }, { label: 'Sekcja', cell: (g       ) => esc(section(g.section).name) }, { label: 'Rola', cell: (g       ) => g.coaches.includes(person.id) ? 'trener' : 'uczestnik' }, { label: 'Od', cell: () => '2026-09-01' }], rows: db.groups.filter((g) => g.members.includes(person.id) || g.coaches.includes(person.id)), empty: ['Brak członkostw', 'Dodaj osobę do grupy w składzie grupy.'] })
    if (tab === 'naleznosci') body = chargesTable(db.charges.filter((c) => c.person === person.id || c.payerPerson === person.id))
    return `${pageHead(`${person.first} ${person.last}`, `${age} lat${person.account ? ' · ma konto' : ''}`)}${tabs}${body}`
  }

  function screenGroups(q                 )         {
    const kind = q.get('kind') || 'all'
    const secs = coordSections(me())
    const rows = db.groups.filter((g) => (isAdmin() || secs.includes(g.section) || g.coaches.includes(me())) && (kind === 'all' || g.kind === kind))
    return `${pageHead('Grupy', 'Drużyny i grupy zajęciowe — na równych prawach', can('groups.manage') ? btn('Dodaj grupę', 'todo', { what: 'Formularz grupy: sekcja, rodzaj, pola drużyny warunkowe' }, 'primary') : '')}
      ${table({ tabs: [['Wszystkie', '/backend/groups/groups?kind=all', kind === 'all'], ['Drużyny', '/backend/groups/groups?kind=team', kind === 'team'], ['Grupy zajęciowe', '/backend/groups/groups?kind=class_group', kind === 'class_group']],
        cols: [
          { label: 'Grupa', cell: (g       ) => `<a class="row-link" href="#/backend/groups/groups/${g.id}">${esc(g.name)}</a>` },
          { label: 'Sekcja', cell: (g       ) => esc(section(g.section).name) },
          { label: 'Rodzaj', cell: (g       ) => g.kind === 'team' ? badge('drużyna', 'info') : badge('grupa zajęciowa', 'neutral') },
          { label: 'Kategoria / poziom', cell: (g       ) => esc(g.category || g.level || '—') },
          { label: 'Prowadzący', cell: (g       ) => esc(g.coaches.map(pName).join(', ')) },
          { label: 'Uczestnicy', num: true, cell: (g       ) => String(g.members.length) },
          { label: 'Publiczna', cell: (g       ) => g.isPublic ? badge('tak', 'success') : badge('nie', 'neutral') },
        ], rows, empty: ['Brak grup', 'Dodaj pierwszą grupę w sekcji.'] })}`
  }

  function screenGroup(p                        , q                 )         {
    const g = group(p.id)
    if (!g) return empty('Nie znaleziono grupy', '404')
    const tab = q.get('tab') || 'sklad'
    const tabs = `<div class="tabs">${[['dane', 'Dane'], ['sklad', 'Skład'], ['public', 'Strona publiczna']].map(([k, l]) => `<a class="${tab === k ? 'active' : ''}" href="#/backend/groups/groups/${g.id}?tab=${k}">${l}</a>`).join('')}</div>`
    let body = ''
    if (tab === 'dane') body = `<form class="form" data-form="group" data-id="${g.id}" novalidate><div class="form-group"><div class="fields">${fld('name', 'Nazwa', inp('name', 'text', g.name), { req: true })}${fld('kind', 'Rodzaj', sel('kind', [['team', 'drużyna'], ['class_group', 'grupa zajęciowa']], g.kind))}${fld('category', 'Kategoria wiekowa (PZPN)', inp('category', 'text', g.category || ''), { hint: 'Tylko dla drużyny' })}${fld('league', 'Liga', inp('league', 'text', g.league || ''), { hint: 'Tylko dla drużyny' })}${fld('level', 'Poziom', inp('level', 'text', g.level || ''))}</div></div><div class="form-actions"><button class="btn primary" type="submit">Zapisz</button></div></form>`
    if (tab === 'sklad') body = table({ cols: [{ label: 'Osoba', cell: (id        ) => `<a class="row-link" href="#/backend/people/persons/${id}">${esc(pName(id))}</a>` }, { label: 'Rola w grupie', cell: (id        ) => g.coaches.includes(id) ? badge(g.kind === 'team' ? 'trener' : 'instruktor', 'info') : 'uczestnik' }, { label: 'Wiek', num: true, cell: (id        ) => String(ageOn(personById(db, id).birth)) }, { label: 'Od', cell: () => '2026-09-01' }, { label: '', cell: (id        ) => can('groups.manage') ? btn('Zakończ członkostwo', 'end-member', { group: g.id, person: id }, 'sm') : '' }], rows: [...g.coaches, ...g.members], toolbar: can('groups.manage') ? btn('Dodaj do składu', 'add-member', { group: g.id }, 'primary sm') : '', empty: ['Skład jest pusty', 'Dodaj uczestników i prowadzącego.'] })
    if (tab === 'public') body = `<form class="form" data-form="group-public" data-id="${g.id}" novalidate><div class="form-group">${chk('isPublic', 'Grupa widoczna na stronie sekcji', g.isPublic)}${fld('publicDescription', 'Opis publiczny', area('publicDescription', g.publicDescription))}${fld('conditions', 'Warunki', area('conditions', g.conditions))}<div class="fields">${fld('ageFrom', 'Wiek od', inp('ageFrom', 'number', String(g.ageFrom ?? '')))}${fld('ageTo', 'Wiek do', inp('ageTo', 'number', String(g.ageTo ?? '')))}${fld('level', 'Poziom', inp('level', 'text', g.level || ''))}</div></div><div class="form-actions"><button class="btn primary" type="submit">Zapisz</button></div></form>`
    return `${pageHead(g.name, `${section(g.section).name} · ${g.kind === 'team' ? 'drużyna' : 'grupa zajęciowa'}`)}${tabs}${body}`
  }

  const ruleText = (a          )         => a.oneOff ? `jednorazowo ${dShort(a.from)} ${a.start}–${a.end}` : `${a.weekdays.map((d) => DAY_SHORT[d % 7]).join(', ')} ${a.start}–${a.end}, co tydzień do ${a.to.split('-').reverse().join('.')}`

  function screenActivities()         {
    const secs = coordSections(me())
    const rows = db.activities.filter((a) => isAdmin() || secs.includes(group(a.group).section))
    return `${pageHead('Aktywności', 'Serie zajęć i wydarzenia jednorazowe', can('activities.manage') ? link('Nowa aktywność', '/backend/activities/create', 'btn primary') : '')}
      ${table({ cols: [
        { label: 'Nazwa', cell: (a          ) => `<b>${esc(a.name)}</b>` },
        { label: 'Grupa', cell: (a          ) => esc(group(a.group).name) },
        { label: 'Typ', cell: (a          ) => badge(typeLabel(a.type, group(a.group).kind), 'info') },
        { label: 'Reguła', cell: (a          ) => esc(ruleText(a)) },
        { label: 'Miejsce', cell: (a          ) => esc(placeName(db, a.place)) },
        { label: 'Prowadzący', cell: (a          ) => esc(pName(a.coach)) },
        { label: '', cell: (a          ) => link('Terminy', `/backend/activities/occurrences?activity=${a.id}`, 'btn sm') },
      ], rows, toolbar: `<input type="search" placeholder="Szukaj…" aria-label="Szukaj aktywności">` })}`
  }

  function screenActivityCreate()         {
    const secs = coordSections(me())
    const groups = db.groups.filter((g) => isAdmin() || secs.includes(g.section))
    const f = ui.wizard ? JSON.parse(ui.wizard) : { group: 'g-orlm', type: 'training', name: 'Trening dodatkowy Orlików młodszych', place: 'pl-boisko', coach: 'p-wojtek', days: ['2'], start: '17:00', end: '18:00', from: '2026-11-17', to: '2026-12-15' }
    const g = group(f.group)
    const types                     = g.kind === 'team' ? [['training', 'trening'], ['match', 'mecz'], ['sparring', 'sparing'], ['tournament', 'turniej'], ['camp', 'obóz'], ['other', 'inne']] : [['training', 'zajęcia'], ['tournament', 'turniej / zawody'], ['camp', 'obóz'], ['other', 'inne']]
    const leaves = db.places.filter((p) => !db.places.some((c) => c.parent === p.id))
    const coaches = db.persons.filter((p) => db.roles.some((r) => r.person === p.id && r.role === 'coach'))
    const preview = ui.preview ? JSON.parse(ui.preview)                                             : null
    return `${pageHead('Nowa aktywność', 'Seria z regułą powtarzania — podgląd terminów i kolizji przed zapisem', link('Anuluj', '/backend/activities/activities', 'btn'))}
      <form class="form" data-form="wizard" novalidate>
      <div class="form-group"><h3>Podstawowe</h3><div class="fields">
        ${fld('group', 'Grupa', sel('group', groups.map((x) => [x.id, `${x.name} (${section(x.section).name})`]), f.group, 'data-change="wizard-group"'), { req: true })}
        ${fld('type', 'Typ', sel('type', types, types.some((t) => t[0] === f.type) ? f.type : 'training'), { req: true, hint: g.kind === 'class_group' ? 'Mecz, sparing i turniej tylko dla drużyn' : '' })}
        ${fld('name', 'Nazwa', inp('name', 'text', f.name), { req: true })}
        ${fld('place', 'Miejsce', sel('place', leaves.map((p) => [p.id, p.name]), f.place), { req: true })}
        ${fld('coach', 'Prowadzący domyślny', sel('coach', [['', '— bez prowadzącego —'], ...coaches.map((p) => [p.id, `${p.first} ${p.last}`]                    )], f.coach))}
      </div></div>
      <div class="form-group"><h3>Powtarzanie</h3>
        <div class="field" data-field="days"><span>Dni tygodnia <b class="req">*</b></span><div class="chips">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label class="chip ${f.days.includes(String(d)) ? 'on' : ''}"><input type="checkbox" name="days" value="${d}" ${f.days.includes(String(d)) ? 'checked' : ''} class="sr-only" data-change="chip">${DAY_SHORT[d % 7]}</label>`).join('')}</div></div>
        <div class="fields" style="margin-top:10px">${fld('start', 'Od godziny', inp('start', 'time', f.start), { req: true })}${fld('end', 'Do godziny', inp('end', 'time', f.end), { req: true })}${fld('from', 'Data od', inp('from', 'date', f.from), { req: true })}${fld('to', 'Data do', inp('to', 'date', f.to), { req: true })}</div>
      </div>
      <div class="form-general"></div>
      ${preview ? `<div class="form-group"><h3>Podgląd: ${preview.dates.length} terminów</h3>${preview.conflicts.length ? `<div class="alert error" role="alert"><strong>Kolizja na miejscu (409 occurrence_place_conflict)</strong><ul style="margin:4px 0 0;padding-left:18px">${preview.conflicts.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>Zmień godziny, dni lub miejsce.</div>` : '<div class="alert success"><strong>Brak kolizji</strong>Można utworzyć serię.</div>'}
        <div class="chips">${preview.dates.slice(0, 12).map((d) => `<span class="chip">${dShort(d)}</span>`).join('')}${preview.dates.length > 12 ? `<span class="chip">+${preview.dates.length - 12}</span>` : ''}</div></div>` : ''}
      <div class="form-actions"><button type="submit" class="btn" name="mode" value="preview">Podgląd terminów</button><button type="submit" class="btn primary" name="mode" value="create" ${preview && !preview.conflicts.length ? '' : 'disabled title="Najpierw podgląd bez kolizji"'}>Utwórz</button></div></form>`
  }

  function screenOccurrences(q                 )         {
    const view = q.get('view') || 'all'
    const act = q.get('activity')
    const secs = coordSections(me())
    let rows = db.occurrences.filter((o) => (isAdmin() || secs.includes(group(o.group).section)) && (!act || o.activity === act))
    if (view === 'unassigned') rows = rows.filter((o) => o.status === 'planned' && !o.coach && o.date >= TODAY)
    if (view === 'unsettled') rows = rows.filter((o) => o.status === 'planned' && ended(o))
    if (view === 'cancelled') rows = rows.filter((o) => o.status === 'cancelled')
    if (view === 'all') rows = rows.filter((o) => o.date >= addDays(TODAY, -7) && o.date <= addDays(TODAY, 14))
    rows.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    const base = `/backend/activities/occurrences${act ? `?activity=${act}&` : '?'}`
    return `${pageHead('Terminy', 'Operacyjna lista terminów sekcji')}
      ${table({ tabs: [['Najbliższe', `${base}view=all`, view === 'all'], ['Do obsadzenia', `${base}view=unassigned`, view === 'unassigned'], ['Nierozliczone', `${base}view=unsettled`, view === 'unsettled'], ['Odwołane', `${base}view=cancelled`, view === 'cancelled']],
        cols: [
          { label: 'Data', cell: (o            ) => `${dShort(o.date)} ${o.start}` },
          { label: 'Aktywność', cell: (o            ) => `<a class="row-link" href="#/club/occurrences/${o.id}">${esc(o.name)}</a>${o.detached ? ` ${badge('edytowany', 'neutral')}` : ''}` },
          { label: 'Grupa', cell: (o            ) => esc(group(o.group).name) },
          { label: 'Miejsce', cell: (o            ) => esc(placeName(db, o.place)) },
          { label: 'Prowadzący', cell: (o            ) => o.coach ? `${esc(pName(o.coach))}${o.coach !== o.defaultCoach ? ' <span class="small muted">(zastępstwo)</span>' : ''}` : badge('do obsadzenia', 'warning') },
          { label: 'Status', cell: (o            ) => o.status === 'planned' && ended(o) ? badge('nierozliczony', 'warning') : statusBadge(o.status) },
          { label: '', cell: (o            ) => o.status === 'planned' ? `<div class="row">${btn(o.coach ? 'Zmień prowadzącego' : 'Wskaż zastępcę', 'assign-coach', { occ: o.id }, 'sm' + (o.coach ? '' : ' primary'))}${ended(o) ? link('Obecność', `/club/occurrences/${o.id}/attendance`, 'btn sm') : btn('Odwołaj', 'cancel-occ', { occ: o.id }, 'sm danger')}</div>` : '' },
        ], rows, empty: view === 'unassigned' ? ['Wszystkie terminy mają prowadzącego', 'Nic nie czeka na zastępstwo.'] : view === 'unsettled' ? ['Brak nierozliczonych terminów', 'Wszystkie zakończone terminy mają obecność.'] : ['Brak terminów', 'Zmień filtr.'] })}`
  }

  function unitsReport(month        )                                                                                                                                                  {
    const done = db.occurrences.filter((o) => o.status === 'done' && o.date.startsWith(month))
    const coaches = [...new Set([...done.map((o) => o.coach), ...done.map((o) => o.defaultCoach)].filter(Boolean)            )]
    return coaches.map((c) => {
      const tr = done.filter((o) => o.type === 'training')
      const planned = tr.filter((o) => o.defaultCoach === c).length
      const given = tr.filter((o) => o.defaultCoach === c && o.coach !== c).length
      const taken = tr.filter((o) => o.coach === c && o.defaultCoach !== c).length
      const balance = tr.filter((o) => o.coach === c).length
      const matches = done.filter((o) => ['match', 'sparring', 'tournament'].includes(o.type) && o.coach === c).length
      const k = db.contracts.find((x) => x.party === c && x.kind === 'trener')
      return { coach: c, planned, given, taken, balance, matches, amount: k ? k.base + balance * k.unit + matches * k.match : null, occs: done.filter((o) => o.coach === c || o.defaultCoach === c) }
    }).filter((r) => isAdmin() || can('activities.reports.view') || r.coach === me())
  }

  function screenUnits(q                 )         {
    const month = q.get('month') || '2026-11'
    const rows = unitsReport(month)
    const showAmount = isAdmin()
    const unsettled = db.occurrences.filter((o) => o.status === 'planned' && ended(o) && o.date.startsWith(month)).length
    return `${pageHead('Raport jednostek', '1 zamknięty termin treningowy = 1 jednostka dla prowadzącego (Q-004)', `${sel('month', [['2026-11', 'listopad 2026'], ['2026-10', 'październik 2026']], month, 'data-change="units-month" aria-label="Miesiąc"')}${btn('Eksport CSV', 'units-csv', { month }, 'primary')}`)}
      ${unsettled ? `<div class="alert warning"><strong>${unsettled} nierozliczony termin w miesiącu</strong>Nie liczy się do jednostek, dopóki prowadzący nie zamknie listy obecności. ${link('Pokaż', '/backend/activities/occurrences?view=unsettled', '')}</div>` : ''}
      ${table({ cols: [
        { label: 'Prowadzący', cell: (r) => `<b>${esc(pName(r.coach))}</b>` },
        { label: 'Planowe', num: true, cell: (r) => String(r.planned) },
        { label: 'Oddane', num: true, cell: (r) => String(r.given) },
        { label: 'Przejęte', num: true, cell: (r) => String(r.taken) },
        { label: 'Bilans', num: true, cell: (r) => `<b>${r.balance}</b>` },
        { label: 'Mecze', num: true, cell: (r) => String(r.matches) },
        ...(showAmount ? [{ label: 'Kwota', num: true, cell: (r     ) => r.amount === null ? badge('brak umowy', 'warning') : zl(r.amount) }] : []),
        { label: 'Terminy', cell: (r) => `<details><summary class="small">${r.occs.length} terminów</summary><ul class="small" style="margin:4px 0;padding-left:16px">${r.occs.map((o            ) => `<li>${dShort(o.date)} ${esc(group(o.group).name)} — ${esc(pName(o.coach))}${o.coach !== o.defaultCoach ? ' (zastępstwo)' : ''}</li>`).join('')}</ul></details>` },
      ], rows, empty: ['Brak zamkniętych terminów w tym miesiącu', 'Jednostki liczą się z terminów w statusie „zakończony”.'] })}`
  }

  function screenPolicies()         {
    const modeL                         = { immediate: 'od razu (opiekun dostaje powiadomienie)', guardian_confirm: 'wymaga potwierdzenia opiekuna', guardian_only: 'deklaruje tylko opiekun' }
    return `${pageHead('Polityki deklaracji', 'Jak deklarują obecność uczestnicy 13+ z własnym kontem (D-006)', btn('Dodaj politykę', 'todo', { what: 'Formularz polityki: zakres, tryb, limit godzin, wartość po limicie' }, 'primary'))}
      ${table({ cols: [{ label: 'Zakres', cell: (p     ) => esc(p.scope) }, { label: 'Dotyczy', cell: (p     ) => esc(p.target) }, { label: 'Tryb', cell: (p     ) => esc(modeL[p.mode]) }, { label: 'Limit', num: true, cell: (p     ) => `${p.hours} h` }, { label: 'Po limicie', cell: (p     ) => p.after === 'declared' ? 'deklaracja przyjęta' : 'deklaracja odrzucona' }], rows: db.policies })}`
  }

  function screenThreadsAdmin(q                 )         {
    const onlyCases = q.get('cases') === '1'
    const rows = visibleThreads().filter((t) => !onlyCases || t.isCase)
    return `${pageHead('Wątki i sprawy', 'Komunikacja w zakresie Twoich sekcji', btn('Nowy komunikat', 'new-thread', {}, 'primary'))}
      ${table({ tabs: [['Wszystkie', '/backend/communication/threads', !onlyCases], ['Sprawy', '/backend/communication/threads?cases=1', onlyCases]],
        cols: [
          { label: 'Temat', cell: (t        ) => `<a class="row-link" href="#/backend/communication/threads/${t.id}">${esc(t.subject)}</a>` },
          { label: 'Zakres', cell: (t        ) => esc(t.scopeLabel) },
          { label: 'Ostatnia wiadomość', cell: (t        ) => `${esc(pName(t.messages[t.messages.length - 1].author))}, ${esc(t.messages[t.messages.length - 1].at)}` },
          { label: 'Wiadomości', num: true, cell: (t        ) => String(t.messages.length) },
          { label: '', cell: (t        ) => t.isCase ? badge('Sprawa', 'warning') : '' },
        ], rows, empty: onlyCases ? ['Brak spraw', 'Oznacz wątek jako sprawę, gdy wymaga udokumentowania.'] : ['Brak wątków', 'Napisz pierwszy komunikat do sekcji lub grupy.'] })}`
  }

  function screenThreadAdmin(p                        )         {
    const t = db.threads.find((x) => x.id === p.id)
    if (!t) return empty('Nie znaleziono wątku', '404')
    return `${pageHead(t.subject, t.scopeLabel, link('Wszystkie wątki', '/backend/communication/threads', 'btn'))}<div style="max-width:760px">${threadView(t, true)}</div>`
  }

  function screenFees()         {
    return `${pageHead('Cenniki i zniżki', 'Stawki składek per grupa lub aktywność; zniżki liczone automatycznie', btn('Dodaj cennik', 'new-fee', {}, 'primary'))}
      ${table({ cols: [{ label: 'Nazwa', cell: (f     ) => `<b>${esc(f.name)}</b>` }, { label: 'Dotyczy', cell: (f     ) => esc(`grupa: ${group(f.group).name}`) }, { label: 'Okres', cell: (f     ) => esc(f.period) }, { label: 'Kwota', num: true, cell: (f     ) => zl(f.amount) }, { label: 'Dzień płatności', num: true, cell: (f     ) => String(f.dueDay) }], rows: db.fees })}
      <div class="section-title">Zniżki</div>
      ${table({ cols: [{ label: 'Nazwa', cell: (d     ) => `<b>${esc(d.name)}</b>` }, { label: 'Rodzaj', cell: (d     ) => esc(d.kind) }, { label: 'Wartość', num: true, cell: (d     ) => `−${d.percent}%` }, { label: 'Reguła', cell: () => 'Najstarsze dziecko płatnika — pełna stawka; każde kolejne (wszystkie sekcje) — zniżka' }], rows: db.discounts })}`
  }

  function chargesTable(rows          , toolbar = '', tabs                              )         {
    return table({ tabs, toolbar, cols: [
      { label: 'Należność', cell: (c        ) => `<a class="row-link" href="#/backend/payments/charges/${c.id}">${esc(c.description)}</a>` },
      { label: 'Płatnik', cell: (c        ) => c.payerMissing ? badge('brak płatnika', 'warning') : esc(c.payerPerson ? pName(c.payerPerson) : c.payerInstitution) },
      { label: 'Okres', cell: (c        ) => esc(c.period || '—') },
      { label: 'Kwota', num: true, cell: (c        ) => `${zl(c.amount - c.discount)}${c.discount ? `<div class="small muted">zniżka −${zl(c.discount)}</div>` : ''}` },
      { label: 'Pozostało', num: true, cell: (c        ) => ['paid', 'cancelled', 'forfeited'].includes(c.status) ? '—' : zl(remaining(c)) },
      { label: 'Termin', cell: (c        ) => `${dShort(c.due)}${c.due < TODAY && ['open', 'partially_paid'].includes(c.status) ? ` ${badge('po terminie', 'error')}` : ''}` },
      { label: 'Odbiorca', cell: (c        ) => c.payee === 'club' ? 'klub' : badge('gmina', 'info') },
      { label: 'Status', cell: (c        ) => statusBadge(c.status) },
    ], rows, empty: ['Brak należności', 'Nalicz okres, aby utworzyć składki.'] })
  }

  // Stały kod płatnika do tytułu przelewu (np. GW-K7Q2).
  function payerCode(pid        )         {
    let h = 7
    for (const ch of pid) h = (h * 31 + ch.charCodeAt(0)) % 1679616
    return 'GW-' + h.toString(36).toUpperCase().padStart(4, '0').slice(-4)
  }
  const payers = ()           => [...new Set(db.charges.filter((c) => c.source !== 'rental' && c.payerPerson).map((c) => c.payerPerson          ))]
  const openOf = (pid        )           => db.charges.filter((c) => c.source !== 'rental' && c.payerPerson === pid && ['open', 'partially_paid'].includes(c.status)).sort((a, b) => a.due.localeCompare(b.due))

  // Dopasowanie: kod w tytule → płatnik; kwota rozdzielana od najstarszej należności. Bez kodu — nazwisko + kwota (do potwierdzenia).
  function matchTx(tx        )       {
    const code = (tx.title.toUpperCase().match(/GW-[A-Z0-9]{4}/) || [])[0]
    let payer = code ? payers().find((x) => payerCode(x) === code) : undefined
    let byName = false
    if (!payer) {
      const words = new Set(`${tx.sender} ${tx.title}`.toLowerCase().split(/[^a-ząćęłńóśźż]+/).filter(Boolean)) // całe słowa: „Lis” ≠ „listopad”
      const cands = payers().filter((x) => [x, ...wardsOf(x)].some((y) => words.has(personById(db, y).last.toLowerCase())))
      if (cands.length === 1) { payer = cands[0]; byName = true }
    }
    tx.alloc = []; tx.payer = payer
    if (!payer) { tx.status = 'unmatched'; tx.reason = 'Brak kodu płatnika i jednoznacznego nazwiska w tytule lub nadawcy'; return }
    let left = tx.amount
    for (const c of openOf(payer)) { if (left <= 0) break; const a = Math.min(left, remaining(c)); tx.alloc.push({ chargeId: c.id, amount: a }); left -= a }
    const owed = openOf(payer).reduce((sum, c) => sum + remaining(c), 0)
    const exactPrefix = left === 0 && tx.alloc.every((a) => a.amount === remaining(db.charges.find((c) => c.id === a.chargeId)          ))
    if (!tx.alloc.length) { tx.status = 'suggested'; tx.reason = `Płatnik ${pName(payer)} nie ma otwartych należności — nadpłata ${zl(tx.amount)}` }
    else if (byName) { tx.status = 'suggested'; tx.reason = `Dopasowano po nazwisku${tx.amount === owed ? ' i kwocie' : ''} — bez kodu płatnika` }
    else if (left > 0) { tx.status = 'suggested'; tx.reason = `Nadpłata ${zl(left)} — kod ${code}` }
    else if (!exactPrefix) { tx.status = 'suggested'; tx.reason = `Niedopłata — kwota nie pokrywa całych należności (kod ${code})` }
    else { tx.status = 'booked'; tx.reason = `Kod ${code} i kwota zgodne`; tx.auto = true }
  }

  function bookTx(tx        )       {
    for (const a of tx.alloc) {
      const c = db.charges.find((x) => x.id === a.chargeId)          
      c.payments.push({ amount: a.amount, method: 'przelew', date: tx.date, ref: tx.title, bankTx: tx.id })
      c.status = remaining(c) <= 0 ? 'paid' : 'partially_paid'
    }
    tx.status = 'booked'
  }
  function unbookTx(tx        )       {
    for (const c of db.charges) { const before = c.payments.length; c.payments = c.payments.filter((x) => x.bankTx !== tx.id); if (c.payments.length !== before) c.status = c.payments.length ? 'partially_paid' : 'open' }
  }

  function importStatement(file        , rows                                                                   )             {
    const imp             = { id: uid('imp'), file, at: `${TODAY} ${NOW}`, by: me(), total: rows.length, booked: 0, suggested: 0, unmatched: 0, skipped: 0 }
    for (const row of rows) {
      if (row.amount <= 0) { imp.skipped++; continue } // obciążenia rachunku pomijamy
      const hash = `${row.date}|${row.amount}|${row.sender}|${row.title}`
      if (db.bankTx.some((t) => t.hash === hash)) { imp.skipped++; continue } // ponowny import — bez duplikatów
      const tx         = { id: uid('tx'), importId: imp.id, date: row.date, amount: row.amount, sender: row.sender, title: row.title, hash, status: 'unmatched', alloc: [], reason: '' }
      matchTx(tx)
      if (tx.status === 'booked') { if (db.settings.autoBook !== false) bookTx(tx); else tx.status = 'suggested' }
      db.bankTx.push(tx)
      imp[tx.status === 'booked' ? 'booked' : tx.status === 'suggested' ? 'suggested' : 'unmatched']++
    }
    db.bankImports.unshift(imp)
    return imp
  }

  // Przykładowy wyciąg z aktualnych należności (do pokazu dopasowań).
  function sampleStatement()                                                                    {
    const sum = (pid        )         => openOf(pid).reduce((a, c) => a + remaining(c), 0)
    const rows                                                                    = []
    const add = (pid        , amount        , title        , sender         )       => { if (amount > 0) rows.push({ date: '2026-11-09', amount, sender: sender || pName(pid).toUpperCase(), title }) }
    add('p-marek', sum('p-marek'), `${payerCode('p-marek')} składki Zosia i Adam`)
    add('p-ewelina', (openOf('p-ewelina')[0] ? remaining(openOf('p-ewelina')[0]) : 0), `${payerCode('p-ewelina')} składka październik`)
    add('p-iwona', sum('p-iwona'), 'Składka Kuba i Maja Pawlak listopad')
    add('p-dorota', sum('p-dorota'), 'zumba listopad', 'DOROTA WÓJCIK')
    add('p-teresa', sum('p-teresa') + 2000, `${payerCode('p-teresa')} zumba`)
    rows.push({ date: '2026-11-08', amount: 50000, sender: 'JAN KOWALCZYK', title: 'Darowizna na stroje dla dzieci' })
    rows.push({ date: '2026-11-08', amount: -12000, sender: 'ENERGIA SA', title: 'Opłata za prąd — obciążenie' })
    return rows
  }

  // Prosty parser CSV: kolumny data; kwota; nadawca; tytuł (nagłówek rozpoznawany po nazwach).
  function parseCsv(text        )                                                                    {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (!lines.length) return []
    const sep = lines[0].includes(';') ? ';' : ','
    const head = lines[0].toLowerCase().split(sep).map((x) => x.replace(/"/g, '').trim())
    const col = (names          )         => head.findIndex((h) => names.some((n) => h.includes(n)))
    const ci = { date: col(['data', 'date']), amount: col(['kwota', 'amount']), sender: col(['nadawca', 'kontrahent', 'nazwa', 'sender']), title: col(['tytuł', 'tytul', 'opis', 'title']) }
    if (Object.values(ci).some((v) => v < 0)) throw new Error('Nie rozpoznano kolumn: wymagane data, kwota, nadawca (kontrahent), tytuł (opis).')
    return lines.slice(1).map((l) => { const c = l.split(sep).map((x) => x.replace(/^"|"$/g, '').trim()); const d = c[ci.date]; const iso = /^\d{2}[.-]\d{2}[.-]\d{4}$/.test(d) ? `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}` : d; return { date: iso, amount: Math.round(Number(c[ci.amount].replace(/\s/g, '').replace(',', '.')) * 100), sender: c[ci.sender] || '', title: c[ci.title] || '' } }).filter((x) => !Number.isNaN(x.amount))
  }

  function screenBank(q                 )         {
    const view = q.get('view') || 'suggested'
    const rows = db.bankTx.filter((t) => view === 'all' || t.status === view).sort((a, b) => b.date.localeCompare(a.date))
    const cnt = (st        )         => db.bankTx.filter((t) => t.status === st).length
    const last = db.bankImports[0]
    return `${pageHead('Wyciągi bankowe', 'Import wyciągu i automatyczne rozliczanie wpłat na konto klubu', `${btn('Przyjmij gotówkę', 'cash', {}, '')}`)}
      <div class="card"><div class="row between" style="align-items:flex-start"><div style="flex:1;min-width:240px"><h3 style="margin:0 0 4px">Importuj wyciąg</h3><p class="small muted" style="margin:0 0 8px">Plik CSV z banku (kolumny: data, kwota, nadawca, tytuł) albo MT940. Przelewy z kodem płatnika i pełną kwotą księgują się same; pozostałe czekają na Twoje potwierdzenie. Ponowny import tego samego pliku nie tworzy duplikatów.</p>
        <label class="field" data-field="statement"><span>Plik wyciągu</span><input type="file" accept=".csv,.txt,.sta,.mt940" data-change="bank-file"></label></div>
        <div class="stack">${btn('Wczytaj przykładowy wyciąg', 'bank-sample', {}, 'primary')}<label class="check small"><input type="checkbox" data-change="autobook" ${db.settings.autoBook !== false ? 'checked' : ''}><span>Księguj automatycznie pewne dopasowania</span></label></div></div>
        ${last ? `<div class="alert success" style="margin:12px 0 0"><strong>Ostatni import: ${esc(last.file)} (${esc(last.at)})</strong>${last.total} pozycji: zaksięgowane automatycznie ${last.booked}, do potwierdzenia ${last.suggested}, niedopasowane ${last.unmatched}, pominięte ${last.skipped} (obciążenia i duplikaty).</div>` : ''}</div>
      <div style="margin-top:12px">${table({ tabs: [[`Do potwierdzenia (${cnt('suggested')})`, '/backend/payments/bank?view=suggested', view === 'suggested'], [`Niedopasowane (${cnt('unmatched')})`, '/backend/payments/bank?view=unmatched', view === 'unmatched'], [`Zaksięgowane (${cnt('booked')})`, '/backend/payments/bank?view=booked', view === 'booked'], [`Pominięte (${cnt('ignored')})`, '/backend/payments/bank?view=ignored', view === 'ignored'], ['Wszystkie', '/backend/payments/bank?view=all', view === 'all']],
        cols: [
          { label: 'Data', cell: (t        ) => dShort(t.date) },
          { label: 'Kwota', num: true, cell: (t        ) => `<b>${zl(t.amount)}</b>` },
          { label: 'Nadawca i tytuł', cell: (t        ) => `<b>${esc(t.sender)}</b><div class="small muted">${esc(t.title)}</div>` },
          { label: 'Dopasowanie', cell: (t        ) => `${t.payer ? `<b>${esc(pName(t.payer))}</b> <span class="small muted">${payerCode(t.payer)}</span>` : '—'}${t.alloc.length ? `<div class="small">${t.alloc.map((a) => `${esc((db.charges.find((c) => c.id === a.chargeId)          ).description)} — ${zl(a.amount)}`).join('<br>')}</div>` : ''}<div class="small muted">${esc(t.reason)}</div>` },
          { label: 'Status', cell: (t        ) => t.status === 'booked' ? badge(t.auto ? 'zaksięgowane automatycznie' : 'zaksięgowane', 'success') : t.status === 'suggested' ? badge('do potwierdzenia', 'warning') : t.status === 'unmatched' ? badge('niedopasowane', 'error') : badge('pominięte', 'neutral') },
          { label: '', cell: (t        ) => t.status === 'suggested' ? `<div class="row">${t.alloc.length ? btn('Potwierdź', 'tx-confirm', { id: t.id }, 'sm primary') : ''}${btn('Zmień', 'tx-assign', { id: t.id }, 'sm')}${btn('Pomiń', 'tx-ignore', { id: t.id }, 'sm')}</div>` : t.status === 'unmatched' ? `<div class="row">${btn('Przypisz', 'tx-assign', { id: t.id }, 'sm primary')}${btn('Pomiń', 'tx-ignore', { id: t.id }, 'sm')}</div>` : t.status === 'booked' ? btn('Cofnij', 'tx-undo', { id: t.id }, 'sm') : btn('Przywróć', 'tx-undo', { id: t.id }, 'sm') },
        ], rows, empty: view === 'suggested' ? ['Nic nie czeka na potwierdzenie', 'Zaimportuj wyciąg — pewne dopasowania księgują się same.'] : ['Brak pozycji', 'Zaimportuj wyciąg bankowy.'] })}</div>
      ${db.bankImports.length ? `<div class="section-title">Historia importów</div>${table({ cols: [{ label: 'Plik', cell: (i            ) => esc(i.file) }, { label: 'Kiedy', cell: (i            ) => esc(i.at) }, { label: 'Kto', cell: (i            ) => esc(pName(i.by)) }, { label: 'Pozycje', num: true, cell: (i            ) => String(i.total) }, { label: 'Auto', num: true, cell: (i            ) => String(i.booked) }, { label: 'Do potw.', num: true, cell: (i            ) => String(i.suggested) }, { label: 'Niedop.', num: true, cell: (i            ) => String(i.unmatched) }, { label: 'Pominięte', num: true, cell: (i            ) => String(i.skipped) }], rows: db.bankImports })}` : ''}`
  }

  // Formularz przyjęcia gotówki — wspólny dla panelu (okno) i telefonu (M-15).
  function cashForm(pre = '', inModal = true, only = '')         {
    const ps = payers().filter((x) => openOf(x).length).sort((a, b) => personById(db, a).last.localeCompare(personById(db, b).last, 'pl'))
    const sel0 = pre || ui.cashPayer || ''
    const charges = sel0 ? openOf(sel0) : []
    const picked = charges.filter((c) => !only || c.id === only)
    return `${fld('payer', 'Płatnik (rodzic lub dorosły uczestnik)', sel('payer', [['', '— wybierz —'], ...ps.map((x) => [x, `${personById(db, x).last} ${personById(db, x).first} — ${wardsOf(x).filter((w) => db.charges.some((c) => c.person === w)).map((w) => personById(db, w).first).join(', ') || 'sam(a)'} · do zapłaty ${zl(openOf(x).reduce((a, c) => a + remaining(c), 0))}`]                    )], sel0, 'data-change="cash-payer"'), { req: true })}
      <div class="field" data-field="charges" style="margin-top:10px"><span>Za co <b class="req">*</b></span>${charges.length ? charges.map((c) => `<label class="check"><input type="checkbox" name="charges" value="${c.id}" ${picked.includes(c) ? 'checked' : ''} data-change="cash-sum"><span>${esc(c.description)} · ${esc(c.period || '')} — <b>${zl(remaining(c))}</b>${c.due < TODAY ? ' ' + badge('po terminie', 'error') : ''}</span></label>`).join('') : '<p class="small muted" style="margin:0">Wybierz płatnika, aby zobaczyć jego należności.</p>'}</div>
      <div class="fields" style="margin-top:10px">${fld('amount', 'Kwota przyjęta (zł)', inp('amount', 'number', picked.length ? String(picked.reduce((a, c) => a + remaining(c), 0) / 100) : '', 'step="0.01" min="0.01" id="cash-amount"'), { req: true, hint: 'Mniejsza kwota = wpłata częściowa (od najstarszej należności)' })}${fld('date', 'Data', inp('date', 'date', TODAY), { req: true })}</div>
      ${chk('notify', 'Wyślij płatnikowi potwierdzenie e-mail', true)}
      <p class="small muted">Przyjmuje: <b>${esc(pName(me()))}</b>. Numer potwierdzenia nada system (KP/2026/11/…).</p>
      ${inModal ? '' : '<div class="form-general"></div><button class="btn primary block" type="submit">Przyjmij gotówkę</button>'}`
  }

  function recordCash(fd          )                {
    const errs         = {}
    const payer = String(fd.get('payer') || '')
    const ids = fd.getAll('charges').map(String)
    const amt = Math.round(Number(fd.get('amount')) * 100)
    if (!payer) errs.payer = 'Wybierz płatnika.'
    if (payer && !ids.length) errs.charges = 'Zaznacz co najmniej jedną należność.'
    const chosen = openOf(payer).filter((c) => ids.includes(c.id))
    const max = chosen.reduce((a, c) => a + remaining(c), 0)
    if (!(amt > 0)) errs.amount = 'Kwota musi być większa od zera.'
    else if (amt > max) errs.amount = `Kwota przekracza wybrane należności (${zl(max)}) — 422.`
    if (String(fd.get('date')) > TODAY) errs.date = 'Data nie może być z przyszłości.'
    if (Object.keys(errs).length) return errs
    const receipt = `KP/2026/11/${String(++db.receiptSeq).padStart(3, '0')}`
    let left = amt
    for (const c of chosen) { if (left <= 0) break; const a = Math.min(left, remaining(c)); c.payments.push({ amount: a, method: 'gotówka', date: String(fd.get('date')), by: me(), receipt, settled: isAdmin() ? 'kasa klubu' : undefined }); c.status = remaining(c) <= 0 ? 'paid' : 'partially_paid'; left -= a }
    if (fd.get('notify')) mail(personById(db, payer).email || '', `Potwierdzenie wpłaty gotówkowej ${receipt}`, `Przyjęto ${zl(amt)} gotówką (${chosen.map((c) => c.description).join(', ')}). Przyjął(a): ${pName(me())}.`)
    delete ui.cashPayer
    toast(`Przyjęto ${zl(amt)} gotówką od ${pName(payer)} — potwierdzenie ${receipt}${fd.get('notify') ? ', e-mail wysłany' : ''}.`)
  }

  function screenCashMobile()         {
    const today = db.charges.flatMap((c) => c.payments.filter((x) => x.method === 'gotówka' && x.date === TODAY && x.by === me()).map((x) => ({ x, c })))
    return `<form class="form" data-form="cash-mobile" novalidate>${cashForm('', false)}</form>
      <div class="section-title">Przyjęte dziś przeze mnie</div>${today.length ? `<ul class="list small">${today.map(({ x, c }) => `<li class="row between"><span>${esc(c.description)}<br><span class="muted">${esc(x.receipt)}</span></span><b>${zl(x.amount)}</b></li>`).join('')}<li class="row between"><b>Razem do przekazania skarbnikowi</b><b>${zl(today.reduce((a, t) => a + t.x.amount, 0))}</b></li></ul>` : '<p class="small muted">Jeszcze nic.</p>'}`
  }

  function screenCharges(q                 )         {
    const view = q.get('view') || 'all'
    let rows = db.charges
    if (view === 'all') rows = rows.filter((c) => c.source === 'fee')
    if (view === 'orders') rows = rows.filter((c) => c.source === 'order')
    if (view === 'overdue') rows = rows.filter((c) => c.source === 'fee' && c.due < TODAY && ['open', 'partially_paid'].includes(c.status))
    if (view === 'missing') rows = rows.filter((c) => c.payerMissing && c.status !== 'paid')
    if (view === 'owner') rows = rows.filter((c) => c.payee === 'owner_institution')
    rows = [...rows].sort((a, b) => (b.period || b.due).localeCompare(a.period || a.due))
    if (view === 'cash') rows = db.charges.filter((c) => c.payments.some((x) => x.method === 'gotówka'))
    return `${pageHead('Należności', 'Składki klubu i wynajmy na konto gminy', `${btn('Przyjmij gotówkę', 'cash', {}, '')}${link('Importuj wyciąg', '/backend/payments/bank', 'btn')}${btn('Nalicz okres', 'generate', {}, 'primary')}`)}
      ${ui.genResult ? `<div class="alert success" role="status"><strong>Naliczono okres ${esc(JSON.parse(ui.genResult).period)}</strong>Utworzono ${JSON.parse(ui.genResult).created}, pominięto ${JSON.parse(ui.genResult).skipped} (już istniały), bez płatnika ${JSON.parse(ui.genResult).missing}.</div>` : ''}
      ${chargesTable(rows, `<input type="search" placeholder="Szukaj po nazwisku…" aria-label="Szukaj">${btn('Eksport CSV', 'todo', { what: 'Eksport listy do CSV' }, 'sm')}`, [['Składki', '/backend/payments/charges?view=all', view === 'all'], ['Zaległości', '/backend/payments/charges?view=overdue', view === 'overdue'], ['Zamówienia', '/backend/payments/charges?view=orders', view === 'orders'], ['Bez płatnika', '/backend/payments/charges?view=missing', view === 'missing'], ['Wynajmy (gmina)', '/backend/payments/charges?view=owner', view === 'owner'], ['Wpłaty gotówką', '/backend/payments/charges?view=cash', view === 'cash']])}`
  }

  function screenCharge(p                        )         {
    const c = db.charges.find((x) => x.id === p.id)
    if (!c) return empty('Nie znaleziono należności', '404')
    return `${pageHead(c.description, `${c.period ? `okres ${c.period} · ` : ''}termin ${dShort(c.due)}`, `${['open', 'partially_paid'].includes(c.status) && c.payerPerson ? btn('Przyjmij gotówkę', 'cash', { payer: c.payerPerson }, '') : ''}${['open', 'partially_paid'].includes(c.status) ? btn('Zaksięguj wpłatę', 'record-payment', { id: c.id }, 'primary') : ''}${c.status === 'open' && !c.payments.length ? btn('Anuluj należność', 'cancel-charge', { id: c.id }, 'danger') : ''}`)}
      <div class="grid3"><div class="card"><div class="sub">Do zapłaty</div><div class="kpi">${zl(c.amount - c.discount)}</div>${c.discount ? `<div class="small muted">${esc(c.discountName)}: −${zl(c.discount)} z ${zl(c.amount)}</div>` : ''}</div>
      <div class="card"><div class="sub">Pozostało</div><div class="kpi">${zl(Math.max(0, remaining(c)))}</div>${statusBadge(c.status)}</div>
      <div class="card"><div class="sub">Płatnik / odbiorca</div><div class="item-title">${c.payerMissing ? badge('brak płatnika', 'warning') : esc(c.payerPerson ? pName(c.payerPerson) : c.payerInstitution)}</div><div class="small muted">${c.payee === 'club' ? 'na konto klubu' : 'na konto Gminy Liszki'}</div></div></div>
      <div class="section-title">Wpłaty</div>${table({ cols: [{ label: 'Data', cell: (x     ) => esc(x.date) }, { label: 'Metoda', cell: (x     ) => esc(x.method) }, { label: 'Tytuł / potwierdzenie', cell: (x     ) => esc(x.receipt || x.ref || '—') }, { label: 'Przyjął / źródło', cell: (x     ) => x.by ? esc(pName(x.by)) : x.bankTx ? 'wyciąg bankowy' : '—' }, { label: 'Kwota', num: true, cell: (x     ) => zl(x.amount) }], rows: c.payments, empty: ['Brak wpłat', 'Zaksięguj wpłatę gotówkową lub przelew; płatności online księgują się same.'] })}`
  }

  function screenRentals(q                 )         {
    const st = q.get('status') || 'active'
    const rows = db.rentals.filter((r) => st === 'all' || (st === 'active' ? ['requested', 'confirmed'].includes(r.status) : r.status === st)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    return `${pageHead('Wynajmy', 'Wynajmy zewnętrzne — wpisane po telefonie i zaakceptowane zgłoszenia online', link('Nowy wynajem (kalendarz)', '/backend/facilities/calendar?place=pl-boisko', 'btn primary'))}
      ${table({ tabs: [['Aktywne', '/backend/facilities/rentals?status=active', st === 'active'], ['Czekają na akceptację', '/backend/facilities/rentals?status=pending_approval', st === 'pending_approval'], ['Wszystkie', '/backend/facilities/rentals?status=all', st === 'all']],
        cols: [
          { label: 'Termin', cell: (r        ) => `${dShort(r.date)} ${r.start}–${r.end}` },
          { label: 'Miejsce', cell: (r        ) => esc(placeName(db, r.place)) },
          { label: 'Najemca', cell: (r        ) => `<b>${esc(r.renter)}</b><div class="small muted">${esc(r.contact)} · ${esc(r.phone)}</div>` },
          { label: 'Źródło', cell: (r        ) => esc(r.via) },
          { label: 'Kwota', num: true, cell: (r        ) => zl(r.amount) },
          { label: 'Status', cell: (r        ) => statusBadge(r.status) },
          { label: '', cell: (r        ) => r.status === 'requested' ? `<div class="row">${btn('Potwierdź wpłatę', 'rental-confirm', { id: r.id }, 'sm')}${btn('Odwołaj', 'rental-cancel', { id: r.id }, 'sm danger')}</div>` : r.status === 'confirmed' ? btn('Odwołaj', 'rental-cancel', { id: r.id }, 'sm danger') : r.status === 'pending_approval' ? link('Decyzja', '/backend/facilities/requests', 'btn sm primary') : '' },
        ], rows, empty: ['Brak wynajmów', 'Wpisz wynajem z kalendarza obiektu.'] })}`
  }

  function screenRequests()         {
    const rows = db.rentals.filter((r) => r.status === 'pending_approval')
    return `${pageHead('Zgłoszenia do akceptacji', 'Zgłoszenia z publicznego kalendarza — ważne dopiero po Twojej akceptacji')}
      ${rows.length ? rows.map((r) => { const conf = conflicts(r.place, r.date, toMin(r.start), toMin(r.end), { ignore: r.id }); return `<div class="card"><div class="row between"><div><div class="item-title">${esc(r.renter)} — ${esc(placeName(db, r.place))}</div><div class="small muted">${esc(dLong(r.date))}, ${r.start}–${r.end} · ${r.units} × 90 min · ${esc((db.rates.find((x) => x.category === r.category) || { label: r.category }).label)}</div></div>${badge(`wygasa ${r.holdUntil}`, 'warning')}</div>
        <div class="grid3" style="margin-top:10px"><div><div class="sub">Kontakt</div>${esc(r.contact)}<br>${esc(r.email)}<br>${esc(r.phone)}</div><div><div class="sub">Cel</div>${esc(r.purpose || '—')}</div><div><div class="sub">Kwota orientacyjna</div><b>${zl(r.amount)}</b><div class="small muted">na konto Gminy Liszki</div></div></div>
        <div style="margin-top:10px">${conf.length ? `<div class="alert error"><strong>Kolizja</strong>${conf.map((c) => esc(c.label)).join('; ')}</div>` : badge('brak kolizji', 'success')} ${r.banMatch ? badge('zgodność z rejestrem zakazów — sprawdź', 'error') : badge('brak w rejestrze zakazów', 'success')} ${badge('regulamin zaakceptowany online', 'neutral')} ${badge('e-mail potwierdzony', 'neutral')}</div>
        <div class="row" style="margin-top:12px">${btn('Akceptuj', 'approve', { id: r.id }, 'primary')}${btn('Odrzuć', 'reject', { id: r.id }, 'danger')}</div></div>` }).join('') : empty('Brak zgłoszeń do akceptacji', 'Nowe zgłoszenia pojawią się tutaj i w powiadomieniach.', '', '✓')}`
  }

  function screenZones(q                 )         {
    const tab = q.get('tab') || 'zones'
    const tabs = `<div class="tabs">${[['zones', 'Strefy'], ['closures', 'Zamknięcia'], ['rates', 'Cennik wynajmu']].map(([k, l]) => `<a class="${tab === k ? 'active' : ''}" href="#/backend/facilities/zones?tab=${k}">${l}</a>`).join('')}</div>`
    let body = ''
    if (tab === 'zones') body = table({ cols: [{ label: 'Miejsce', cell: (r     ) => esc(placeName(db, r.place)) }, { label: 'Dni', cell: (r     ) => r.days.map((d        ) => DAY_SHORT[d % 7]).join(', ') }, { label: 'Godziny', cell: (r     ) => `${r.from}–${r.to}` }, { label: 'Strefa', cell: (r     ) => `<i class="z-${r.zone}" style="display:inline-block;width:10px;height:10px;border-radius:2px"></i> ${zoneLabel(r.zone)}` }, { label: 'Priorytet', num: true, cell: (r     ) => String(r.priority) }, { label: 'Obowiązuje', cell: (r     ) => r.validFrom || r.validTo ? `${esc(r.validFrom || '…')} – ${esc(r.validTo || 'bez końca')}` : 'stale' }, { label: 'Źródło', cell: (r     ) => esc(r.source || 'regulamin') }], rows: Object.entries(db.zones).flatMap(([place, rules]) => rules.map((r) => ({ ...r, place }))), toolbar: `${btn('Ustaw dostępność do rezerwacji', 'availability', { place: 'pl-boisko' }, 'primary sm')}${btn('Dodaj regułę strefy', 'todo', { what: 'Formularz pojedynczej reguły strefy' }, 'sm')}` })
    if (tab === 'closures') body = table({ cols: [{ label: 'Miejsce', cell: (c         ) => esc(placeName(db, c.place)) }, { label: 'Kiedy', cell: (c         ) => `${dShort(c.date)} ${c.start}–${c.end}` }, { label: 'Powód', cell: (c         ) => esc(c.reason) }, { label: 'Opis', cell: (c         ) => esc(c.note) }], rows: db.closures, toolbar: btn('Dodaj zamknięcie', 'new-closure', {}, 'primary sm') })
    if (tab === 'rates') body = table({ cols: [{ label: 'Miejsce', cell: (r     ) => esc(placeName(db, r.place)) }, { label: 'Kategoria najemcy', cell: (r     ) => esc(r.label) }, { label: 'Cena za 90 min', num: true, cell: (r     ) => zl(r.price) }], rows: db.rates })
    return `${pageHead('Strefy, zamknięcia, cennik', 'Reguły obiektu z regulaminu Orlika')}${tabs}${body}`
  }

  function screenLogs(q                 )         {
    const tab = q.get('tab') || 'logs'
    const tabs = `<div class="tabs">${[['logs', 'Dziennik'], ['incidents', 'Incydenty'], ['bans', 'Zakazy wstępu'], ['maint', 'Konserwacja']].map(([k, l]) => `<a class="${tab === k ? 'active' : ''}" href="#/backend/facilities/logs?tab=${k}">${l}</a>`).join('')}</div>`
    let body = ''
    if (tab === 'logs') body = table({ cols: [{ label: 'Dzień', cell: (l     ) => dShort(l.date) }, { label: 'Animator', cell: (l     ) => esc(pName(l.operator)) }, { label: 'Otwarcie', cell: (l     ) => esc(l.opened || '—') }, { label: 'Zamknięcie', cell: (l     ) => esc(l.closed || '—') }, { label: 'Stan przed', cell: (l     ) => esc(l.before || '') }, { label: 'Stan po', cell: (l     ) => esc(l.after || '') }], rows: db.logs })
    if (tab === 'incidents') body = table({ cols: [{ label: 'Data', cell: (i     ) => dShort(i.date) }, { label: 'Miejsce', cell: (i     ) => esc(placeName(db, i.place)) }, { label: 'Rodzaj', cell: (i     ) => esc(i.kind) }, { label: 'Opis', cell: (i     ) => esc(i.description) }, { label: 'Działanie', cell: (i     ) => esc(i.action) }, { label: 'Zgłosił', cell: (i     ) => esc(pName(i.by)) }], rows: db.incidents, toolbar: '<span class="small muted">Incydentów nie można usuwać (materiał dowodowy, §6 regulaminu).</span>' })
    if (tab === 'bans') body = table({ cols: [{ label: 'Podmiot', cell: (b     ) => `<b>${esc(b.subject)}</b>` }, { label: 'Od', cell: (b     ) => esc(b.from) }, { label: 'Do', cell: (b     ) => esc(b.to || 'stały') }, { label: 'Powód', cell: (b     ) => esc(b.reason) }, { label: 'Wydał', cell: (b     ) => esc(pName(b.by)) }], rows: db.bans, toolbar: btn('Wydaj zakaz', 'todo', { what: 'Formularz zakazu: podmiot, okres, powód, incydent' }, 'primary sm') })
    if (tab === 'maint') body = table({ cols: [{ label: 'Miejsce', cell: (m     ) => esc(placeName(db, m.place)) }, { label: 'Rodzaj', cell: (m     ) => esc(m.kind) }, { label: 'Odpowiada', cell: (m     ) => esc(m.responsible) }, { label: 'Termin', cell: (m     ) => dShort(m.due) }, { label: 'Status', cell: (m     ) => m.done ? badge('wykonane', 'success') : badge('do zrobienia', 'warning') }], rows: db.maintenance })
    return `${pageHead('Dziennik, incydenty, zakazy', 'Ewidencja obiektu')}${tabs}${body}`
  }

  function ownerReport(pid        , month        )                                                                                                                                {
    const zones                         = { public_free: 0, club_training: 0, reservable_paid: 0 }
    let clubHours = 0
    for (let i = 0; i < 31; i++) {
      const d = addDays(`${month}-01`, i)
      if (!d.startsWith(month)) break
      for (const z of zonesFor(pid, d)) zones[z.zone] = (zones[z.zone] || 0) + (z.to - z.from) / 60
      for (const o of occupancy(pid, d)) if (o.kind === 'occ' || o.kind === 'int') clubHours += (o.to - o.from) / 60
    }
    const rentals = db.rentals.filter((r) => r.place === pid && r.date.startsWith(month) && ['requested', 'confirmed', 'done', 'cancelled_late', 'no_show'].includes(r.status))
    const paid = db.charges.filter((c) => c.payee === 'owner_institution' && rentals.some((r) => r.chargeId === c.id)).reduce((s, c) => s + c.payments.reduce((a, p) => a + p.amount, 0), 0)
    return { zones, clubHours, rentals, paid, incidents: db.incidents.filter((i) => i.place === pid && i.date.startsWith(month)).length, maintenance: db.maintenance.filter((m) => m.place === pid && m.due.startsWith(month)).length }
  }

  function screenOwnerReport(q                 )         {
    const pid = q.get('place') || 'pl-boisko'
    const month = q.get('month') || '2026-11'
    const r = ownerReport(pid, month)
    return `${pageHead('Raport dla gminy', 'Rozliczenie umowy administracyjnej z Gminą Liszki', `${sel('place', [['pl-boisko', 'Boisko piłkarskie'], ['pl-multi', 'Boisko wielofunkcyjne']], pid, 'data-change="report-place" aria-label="Obiekt"')}${btn('Eksport CSV', 'report-csv', { place: pid, month }, 'primary')}`)}
      <div class="grid3"><div class="card"><div class="sub">Godziny ogólnodostępne</div><div class="kpi">${Math.round(r.zones.public_free)} h</div></div>
      <div class="card"><div class="sub">Godziny treningów klubu (strefa)</div><div class="kpi">${Math.round(r.zones.club_training)} h</div><div class="small muted">faktyczny czas klubu: ${r.clubHours.toFixed(1)} h (zajęcia + rezerwacje klubu)</div></div>
      <div class="card"><div class="sub">Godziny do wynajęcia</div><div class="kpi">${Math.round(r.zones.reservable_paid)} h</div></div>
      <div class="card"><div class="sub">Wynajmy</div><div class="kpi">${r.rentals.length}</div><div class="small muted">wartość ${zl(r.rentals.reduce((s, x) => s + x.amount, 0))}</div></div>
      <div class="card"><div class="sub">Wpłaty na konto gminy</div><div class="kpi">${zl(r.paid)}</div></div>
      <div class="card"><div class="sub">Incydenty / konserwacja</div><div class="kpi">${r.incidents} / ${r.maintenance}</div></div></div>
      <div class="section-title">Wynajmy w okresie</div>${table({ cols: [{ label: 'Termin', cell: (x        ) => `${dShort(x.date)} ${x.start}–${x.end}` }, { label: 'Najemca', cell: (x        ) => esc(x.renter) }, { label: 'Kwota', num: true, cell: (x        ) => zl(x.amount) }, { label: 'Status', cell: (x        ) => statusBadge(x.status) }], rows: r.rentals, empty: ['Brak wynajmów w okresie', ''] })}`
  }

  // ═══════════════════════════════════════════════════════════════════
  // Strony publiczne (P)
  // ═══════════════════════════════════════════════════════════════════
  const pub = ()                          => db.settings.publication

  function eventsList(sectionId         )         {
    const evs = db.activities.filter((a) => a.oneOff && (!sectionId || group(a.group).section === sectionId) && a.from >= addDays(TODAY, -60)).sort((a, b) => a.from.localeCompare(b.from))
    if (!evs.length) return ''
    return `<div class="section-title">Wydarzenia</div><div class="stack">${evs.map((a) => { const past = a.to < TODAY; const g = group(a.group); return `<div class="card"><div class="row between"><div class="row" style="gap:10px">${logoBox(sectionLogo(section(g.section)), `Logo sekcji ${section(g.section).name}`, 36)}<div><div class="item-title">${esc(a.name)}</div><div class="small muted">${esc(dLong(a.from))}, start ${a.start} · ${esc(placeName(db, a.place))} · ${esc(section(g.section).name)}</div></div></div>${past ? badge('odbyło się', 'neutral') : badge(typeLabel(a.type, g.kind), 'info')}</div>${a.info?.length ? `<ul class="small" style="margin:8px 0 0;padding-left:18px">${a.info.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>` }).join('')}</div>`
  }

  function screenClubPage()         {
    if (!pub().enabled) return empty('Klub nie publikuje strony', 'Skontaktuj się z klubem telefonicznie.', '', '⦸')
    const secs = db.sections.filter((s) => s.isPublic && s.active)
    return `<div class="hero"><div class="row" style="gap:14px;align-items:center;margin-bottom:6px">${logoBox(db.settings.logo, 'Logo klubu', 56)}<h1 style="margin:0">${esc(db.settings.name)}</h1></div><p>${esc(db.settings.description)}</p></div>
      <div class="section-title">Sekcje</div>
      ${secs.length ? `<div class="grid3">${secs.map((s) => `<a class="card" href="#/p/gwiazda/sections/${s.slug}" style="text-decoration:none;display:block"><div class="row" style="gap:10px;margin-bottom:6px">${logoBox(sectionLogo(s), `Logo sekcji ${s.name}`, 40)}<h3 style="margin:0">${esc(s.name)}</h3></div><p class="muted small" style="margin:0 0 8px">${esc(s.short)}</p><span class="small">${db.groups.filter((g) => g.section === s.id && g.isPublic).length} grup · zobacz zajęcia →</span></a>`).join('')}</div>` : empty('Klub nie opublikował jeszcze sekcji', '')}
      ${pub().description_schedule ? eventsList() : ''}
      ${pub().places_calendar ? `<div class="section-title">Obiekty</div><div class="card"><div class="row between"><div><b>Orlik 2024 i salka klubowa</b><div class="small muted">Sprawdź wolne terminy${pub().online_requests ? ' i zgłoś rezerwację online' : ''}.</div></div>${link('Kalendarze obiektów', '/p/gwiazda/places', 'btn primary')}</div></div>` : ''}`
  }

  function screenSectionPage(p                        )         {
    const s = db.sections.find((x) => x.slug === p.slug)
    if (!pub().enabled || !s || !s.isPublic) return empty('Nie znaleziono strony (404)', 'Sekcja nie istnieje lub nie jest publiczna.', link('Strona klubu', '/p/gwiazda'), '⦸')
    const P = pub()
    const groups = db.groups.filter((g) => g.section === s.id && g.isPublic)
    const card = (g       )         => {
      const acts = db.activities.filter((a) => a.group === g.id && !a.oneOff)
      const next = db.occurrences.filter((o) => o.group === g.id && o.date >= TODAY).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 3)
      const fee = db.fees.find((f) => f.group === g.id)
      const coaches = g.coaches.map((c) => personById(db, c)).map((c) => c.publishConsent ? `${c.first} ${c.last[0]}.` : null)
      return `<div class="card"><div class="row between"><h3 style="margin:0">${esc(g.name)}</h3>${badge(g.ageTo && g.ageTo < 99 ? `${g.ageFrom}–${g.ageTo} lat` : `od ${g.ageFrom} lat`, 'info')}</div>
        ${P.description_schedule ? `<p class="small" style="margin:6px 0">${esc(g.publicDescription)}</p>${acts.map((a) => `<div class="small"><b>${esc(ruleText(a).replace(/, co tydzień.*/, ''))}</b> · ${esc(placeName(db, a.place))}</div>`).join('')}
          <div class="small muted" style="margin-top:4px">Najbliższe: ${next.map((o) => o.status === 'cancelled' ? `<s>${dShort(o.date)}</s> (odwołane)` : dShort(o.date)).join(', ') || '—'}</div>` : ''}
        ${P.conditions && g.conditions ? `<div class="small" style="margin-top:6px"><b>Warunki:</b> ${esc(g.conditions)}${g.category ? ` · kategoria ${esc(g.category)}` : ''}${g.level ? ` · poziom: ${esc(g.level)}` : ''}</div>` : ''}
        ${P.prices && fee ? `<div class="small" style="margin-top:6px"><b>Składka:</b> ${zl(fee.amount)} / miesiąc · rodzeństwo −30%</div>` : ''}
        ${P.coaches ? `<div class="small" style="margin-top:6px"><b>Prowadzi:</b> ${coaches.map((c) => c || (g.kind === 'team' ? 'trener sekcji' : 'instruktor sekcji')).join(', ')}</div>` : ''}</div>`
    }
    return `<div class="crumbs small"><a href="#/p/gwiazda">${esc(db.settings.short)}</a> › Sekcje › ${esc(s.name)}</div>
      <div class="hero" style="margin-top:8px"><div class="row" style="gap:14px;align-items:center;margin-bottom:6px">${logoBox(sectionLogo(s), `Logo sekcji ${s.name}`, 56)}<h1 style="margin:0">${esc(s.name)}</h1></div>${P.description_schedule ? `<p>${esc(s.description)}</p>` : ''}</div>
      ${P.conditions && s.conditions ? `<div class="alert info"><strong>Warunki uczestnictwa</strong>${esc(s.conditions)}</div>` : ''}
      ${P.description_schedule ? eventsList(s.id) : ''}
      <div class="section-title">Zajęcia</div>${groups.length ? `<div class="grid2">${groups.map(card).join('')}</div>` : empty('Sekcja nie ma obecnie zajęć otwartych dla nowych osób', 'Zapytaj koordynatora o listę oczekujących.')}
      ${P.materials && s.materials.length ? `<div class="section-title">Materiały</div><ul class="list">${s.materials.map((m) => `<li>📄 <a href="#" data-action="todo" data-what="Pobranie pliku z attachments">${esc(m)}</a></li>`).join('')}</ul>` : ''}
      ${P.contact ? `<div class="section-title">Kontakt</div><div class="card"><b>${esc(s.contactName)}</b><div class="small">${esc(s.contactEmail)} · ${esc(s.contactPhone)}</div></div>` : ''}`
  }

  function screenPublicPlaces()         {
    if (!pub().enabled || !pub().places_calendar) return empty('Klub nie udostępnia kalendarzy obiektów', 'Zadzwoń, aby zapytać o wolne terminy.', '', '⦸')
    const list = db.places.filter((p) => p.publicSchedule)
    return `<div class="hero"><h1>Obiekty klubu</h1><p>Zobacz zajętość${pub().online_requests ? ' i zgłoś rezerwację — zgłoszenie jest ważne dopiero po akceptacji administratora klubu' : ''}.</p></div>
      <div class="grid3">${list.map((p) => `<a class="card" href="#/p/gwiazda/places/${p.slug}" style="text-decoration:none;display:block"><h3>${esc(p.name)}</h3><div class="small muted">${esc(p.address)}${p.surface ? ` · ${esc(p.surface)}` : ''}</div><div style="margin-top:8px">${p.acceptsRequests && pub().online_requests ? badge('zgłoszenia online', 'success') : badge('rezerwacja telefoniczna', 'neutral')}</div></a>`).join('')}</div>`
  }

  function publicSegments(pid        , date        )                                                                                   {
    const zones = zonesFor(pid, date)
    const occ = occupancy(pid, date)
    const out                                                                                   = []
    for (const z of zones) {
      const cuts = [z.from, z.to, ...occ.flatMap((o) => [o.from, o.to]).filter((m) => m > z.from && m < z.to)].sort((a, b) => a - b)
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1]; if (a === b) continue
        const hit = occ.find((o) => overlap(a, b, o.from, o.to))
        if (hit) out.push({ from: a, to: b, label: hit.publicLabel, canRequest: false, kind: hit.kind })
        else out.push({ from: a, to: b, label: zoneLabel(z.zone), canRequest: z.zone === 'reservable_paid', kind: z.zone })
      }
    }
    // scal sąsiednie segmenty o tej samej etykiecie
    return out.reduce((acc, s) => { const last = acc[acc.length - 1]; if (last && last.label === s.label && last.to === s.from) last.to = s.to; else acc.push({ ...s }); return acc }, []              )
  }

  function screenPublicPlace(p                        , q                 )         {
    const place = db.places.find((x) => x.slug === p.slug && x.publicSchedule)
    if (!pub().enabled || !pub().places_calendar || !place) return empty('Nie znaleziono strony (404)', 'Obiekt nie istnieje lub nie ma publicznego kalendarza.', link('Obiekty klubu', '/p/gwiazda/places'), '⦸')
    const start = q.get('from') || TODAY
    const days = Array.from({ length: 10 }, (_, i) => addDays(start, i))
    const canReq = pub().online_requests && place.acceptsRequests
    return `<div class="crumbs small"><a href="#/p/gwiazda">${esc(db.settings.short)}</a> › <a href="#/p/gwiazda/places">Obiekty</a> › ${esc(place.name)}</div>
      <div class="hero" style="margin-top:8px"><h1>${esc(place.name)}</h1><p>${esc(place.address)} · rezerwacje: tel. ${esc(db.settings.phone)}${canReq ? ' lub online przy wolnym terminie' : ''}</p></div>
      ${canReq ? '<div class="alert info"><strong>Zgłoszenie online jest ważne dopiero po akceptacji administratora klubu.</strong>Do decyzji (najwyżej 48 h) termin jest wstrzymany dla innych zgłoszeń. Płatność przelewem na konto Gminy Liszki po akceptacji.</div>' : ''}
      <div class="row between"><div class="seg"><button type="button" data-action="nav" data-href="/p/gwiazda/places/${place.slug}?from=${addDays(start, -10) < TODAY ? TODAY : addDays(start, -10)}" ${start <= TODAY ? 'disabled' : ''}>‹ Wcześniej</button><button type="button" data-action="nav" data-href="/p/gwiazda/places/${place.slug}?from=${addDays(start, 10)}">Później ›</button></div><span class="small muted">${dShort(days[0])} – ${dShort(days[9])}</span></div>
      <div class="legend"><span><i class="z-public_free"></i>ogólnodostępne</span><span><i class="z-club_training"></i>zajęte przez klub</span><span><i class="z-reservable_paid"></i>do rezerwacji</span><span><i class="blk-rent"></i>zarezerwowane</span><span><i class="blk-pend"></i>zgłoszone — oczekuje</span><span><i class="z-closed"></i>zamknięte</span></div>
      ${days.map((d) => { const segs = publicSegments(place.id, d); return `<div class="day-head">${dShort(d)}${d === TODAY ? ' (dziś)' : ''}</div>${segs.length ? `<ul class="slotlist">${segs.map((s) => { const cls = s.kind === 'rent' ? 'blk-rent' : s.kind === 'pend' ? 'blk-pend' : s.kind === 'closed' ? 'z-closed' : s.kind === 'occ' || s.kind === 'int' ? 'z-club_training' : `z-${s.kind}`; const past = d === TODAY && s.from < toMin(NOW); return `<li class="${cls}"><b>${fromMin(s.from)}–${fromMin(s.to)}</b><span>${esc(s.label)}</span>${s.canRequest && canReq && !past && s.to - s.from >= 90 ? btn('Zgłoś rezerwację', 'public-request', { place: place.id, date: d, from: String(s.from), to: String(s.to) }, 'sm primary') : '<span></span>'}</li>` }).join('')}</ul>` : '<p class="small muted">Obiekt zamknięty.</p>'}` }).join('')}
      <div class="section-title">Cennik (za 90 min)</div><ul class="list small">${db.rates.filter((r) => r.place === place.id).map((r) => `<li class="row between"><span>${esc(r.label)}</span><b>${zl(r.price)}</b></li>`).join('') || '<li class="muted">Brak cennika — zapytaj telefonicznie.</li>'}</ul>`
  }

  function screenVerify(p                        )         {
    const r = db.rentals.find((x) => x.token === p.token)
    if (!r || p.token === 'expired') return `<div class="alert error" role="alert"><strong>Link wygasł (410)</strong>Link potwierdzający jest ważny 1 godzinę. Złóż zgłoszenie ponownie.</div>${link('Obiekty klubu', '/p/gwiazda/places', 'btn primary')}`
    if (r.status === 'superseded') return `<div class="alert error"><strong>Termin został zajęty (409)</strong>W międzyczasie termin zarezerwował klub. Wybierz inny termin.</div>${link('Wróć do kalendarza', `/p/gwiazda/places/${(db.places.find((x) => x.id === r.place)         ).slug}`, 'btn primary')}`
    return `<div class="alert success" role="status"><strong>Zgłoszenie potwierdzone — czeka na akceptację administratora</strong>Decyzja najpóźniej do ${esc(r.holdUntil)}. Do tego czasu termin jest wstrzymany dla innych zgłoszeń. Zgłoszenie nie jest jeszcze rezerwacją.</div>
      <div class="card"><div class="item-title">${esc(placeName(db, r.place))}</div><div class="small muted">${esc(dLong(r.date))}, ${r.start}–${r.end} · ${r.units} × 90 min</div><div class="small" style="margin-top:6px">${esc(r.renter)} · ${esc(r.contact)} · ${esc(r.email)}</div><div class="small" style="margin-top:6px">Kwota orientacyjna: <b>${zl(r.amount)}</b> (płatna po akceptacji na konto Gminy Liszki)</div></div>`
  }

  function screenStripe(q                 )         {
    const ids = (q.get('ids') || '').split(',')
    const list = db.charges.filter((c) => ids.includes(c.id))
    const sum = list.reduce((s, c) => s + remaining(c), 0)
    return `<div class="stripe"><div class="small" style="color:#697386">Stripe Checkout (symulacja) · tryb testowy</div><h1>LKS Gwiazda Ściejowice</h1><div class="amt">${zl(sum)}</div>
      <ul style="padding-left:18px;color:#425466">${list.map((c) => `<li>${esc(c.description)}</li>`).join('')}</ul>
      <div class="stack">${btn('Zapłać (karta testowa 4242…)', 'stripe-pay', { ids: ids.join(','), mode: 'paid' }, 'primary block')}${btn('Zapłać — webhook z opóźnieniem', 'stripe-pay', { ids: ids.join(','), mode: 'pending' }, 'block')}${btn('Anuluj i wróć', 'stripe-pay', { ids: ids.join(','), mode: 'cancelled' }, 'block')}</div></div>`
  }

  // ═══════════════════════════════════════════════════════════════════
  // Trasy
  // ═══════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  // Zbiórki zamówień — stroje (REQ-032, REQ-033)
  // ═══════════════════════════════════════════════════════════════════
  const KIT_STATUS                                                                                                = { draft: ['szkic', 'neutral'], open: ['zbieramy zamówienia', 'info'], closed: ['zamknięta — do zamówienia u dostawcy', 'warning'], ordered: ['zamówiona u dostawcy', 'info'], delivered: ['dostarczona — wydawanie', 'success'], completed: ['zakończona', 'neutral'] }
  const kitBadge = (s                       )         => badge(KIT_STATUS[s][0], KIT_STATUS[s][1])
  const kitCampaign = (id        )                          => db.kitCampaigns.find((c) => c.id === id)
  const kitOrders = (c             )             => db.kitOrders.filter((o) => o.campaign === c.id && o.status === 'submitted')
  const kitOrderOf = (c             , child        )                       => kitOrders(c).find((o) => o.child === child)
  const kitTotal = (o          )         => o.lines.reduce((a, l) => a + l.price, 0)
  const chargeById = (id        )         => db.charges.find((c) => c.id === id)          
  const kitGroupOf = (c             , child        )         => c.groups.find((g) => group(g).members.includes(child)) || ''
  const kitKids = (c             , guardian        )           => wardsOf(guardian).filter((w) => !!kitGroupOf(c, w))
  // Zakres trenera: prowadzone grupy + grupy sekcji, które koordynuje.
  const kitScope = (pid        )           => [...new Set([...coachedGroups(pid), ...db.groups.filter((g) => coordSections(pid).includes(g.section)).map((g) => g.id)])]
  const paidOf = (c        )         => c.payments.reduce((a, p) => a + p.amount, 0)
  const groupsWord = (n        )         => n === 1 ? 'grupa' : n < 5 ? 'grupy' : 'grup'
  // Gotówka przyjęta przez trenera (lub inną osobę) i jeszcze nieprzekazana skarbnikowi.
  const custodyOf = (pid        )                          => db.charges.flatMap((c) => c.payments.filter((x) => x.method === 'gotówka' && x.by === pid && !x.settled).map((x) => ({ c, x })))
  const custodians = ()           => [...new Set(db.charges.flatMap((c) => c.payments.filter((x) => x.method === 'gotówka' && x.by && !x.settled).map((x) => x.by          )))]
  const kitPayBadge = (ch        )         => ch.status === 'paid' ? badge('opłacone', 'success') : ch.status === 'cancelled' ? badge('anulowane', 'neutral') : badge(`do zapłaty ${zl(remaining(ch))}`, ch.due < TODAY ? 'error' : 'warning')

  function kitLineLabel(c             , l         )         {
    const p = c.products.find((x) => x.id === l.product)
    if (!p) return '—'
    if (p.kind === 'set') return `${p.name.split(':')[0]} (${Object.entries(l.sizes || {}).map(([id, s]) => `${(c.products.find((x) => x.id === id) || { name: '?' }).name.split(' ')[0].toLowerCase()} ${s}`).join(', ')})`
    return `${p.name}${l.size ? ` — ${l.size}` : ''}`
  }

  function kitStats(c             )                                                                                {
    const os = kitOrders(c)
    return { orders: os.length, kids: new Set(c.groups.flatMap((g) => group(g).members)).size, value: os.reduce((a, o) => a + chargeById(o.chargeId).amount, 0), paid: os.reduce((a, o) => a + paidOf(chargeById(o.chargeId)), 0), handed: os.filter((o) => o.handedAt).length }
  }

  // Zestawienie dla dostawcy: sztuki per produkt i rozmiar; elementy kompletów liczone przy swoich produktach.
  function kitSupplier(c             )                                                                      {
    const out                                                                      = []
    const add = (pid        , size        , inSet         )       => {
      const product = c.products.find((x) => x.id === pid); if (!product) return
      let e = out.find((x) => x.product === product && x.size === size)
      if (!e) { e = { product, size, qty: 0, inSet: 0 }; out.push(e) }
      e.qty++; if (inSet) e.inSet++
    }
    for (const o of kitOrders(c)) for (const l of o.lines) {
      const p = c.products.find((x) => x.id === l.product)
      if (p?.kind === 'set') for (const [id, s] of Object.entries(l.sizes || {})) add(id, s, true)
      else add(l.product, l.size || 'bez rozmiaru', false)
    }
    const rank = (x                                       )         => c.products.indexOf(x.product) * 100 + [...x.product.sizesChild, ...x.product.sizesAdult].indexOf(x.size)
    return out.sort((a, b) => rank(a) - rank(b))
  }

  function kitShareModal(id        )       {
    const c = kitCampaign(id)               
    const setP = c.products.find((p) => p.kind === 'set')
    const text = `${c.name}\n${c.description}\n\nZamówienia do ${dShort(c.closes)}${setP ? ` · komplet meczowy ${zl(setP.priceChild)}` : ''}.\nFormularz: https://gwiazda.vereino.example/club/orders/${c.id}\n(zaloguj się w aplikacji klubu albo podaj e-mail — wyślemy osobisty link)`
    try { navigator.clipboard.writeText(text).catch(() => undefined) } catch { /* brak schowka */ }
    openModal({ title: 'Tekst na grupę w Messengerze', submitLabel: 'Gotowe', body: `<div class="alert success"><strong>Skopiowano do schowka</strong>Wklej na grupę rodziców. Link nie pokazuje dzieci ani zamówień bez zalogowania lub osobistego linku z e-maila.</div><textarea readonly rows="8" style="width:100%">${esc(text)}</textarea><p class="small"><a href="#" data-action="goto" data-persona="guest" data-href="/club/orders/${c.id}">Zobacz, co zobaczy rodzic po kliknięciu linku →</a></p>`, onSubmit: () => undefined })
  }

  // ── Interfejs członkowski ────────────────────────────────────────────
  function kitTodayTiles()         {
    const pid = me(), out           = []
    if (can('payments.orders.place')) for (const c of db.kitCampaigns.filter((x) => x.status === 'open')) {
      const kids = kitKids(c, pid); if (!kids.length) continue
      out.push(`<section class="card" aria-labelledby="t-kit-${c.id}"><div class="tile-head"><h2 id="t-kit-${c.id}">Zamówienie</h2><a href="#/club/orders/${c.id}">Otwórz</a></div><p class="small" style="margin:0 0 6px">${esc(c.name)} · zamówienia do <b>${dShort(c.closes)}</b></p>
        <ul class="list small">${kids.map((k) => { const o = kitOrderOf(c, k); return `<li class="row between"><span>${esc(personById(db, k).first)}</span>${o ? badge(`zamówiono · ${zl(kitTotal(o))}`, 'success') : badge('nie zamówiono', 'warning')}</li>` }).join('')}</ul></section>`)
    }
    if (can('payments.orders.collect') && coachCtx) {
      const mine = coachedGroups(pid)
      const camps = db.kitCampaigns.filter((c) => !['draft', 'completed'].includes(c.status) && c.groups.some((g) => kitScope(pid).includes(g)))
      const cash = custodyOf(pid).reduce((a, t) => a + t.x.amount, 0)
      if (camps.length || cash) {
        const unpaid = camps.flatMap((c) => kitOrders(c).filter((o) => mine.includes(kitGroupOf(c, o.child)) && chargeById(o.chargeId).status !== 'paid')).length
        const toHand = camps.filter((c) => c.status === 'delivered').flatMap((c) => kitOrders(c).filter((o) => mine.includes(kitGroupOf(c, o.child)) && !o.handedAt)).length
        out.push(`<section class="card" aria-labelledby="t-kit-coach"><div class="tile-head"><h2 id="t-kit-coach">Zamówienia w moich grupach</h2><a href="#/club/coach/orders">Otwórz</a></div><p class="small" style="margin:0">${unpaid ? `<b>${unpaid}</b> nieopłaconych w Twoich grupach` : 'Zamówienia w Twoich grupach są opłacone.'}${toHand ? ` · <b>${toHand}</b> do wydania` : ''}</p>${cash ? `<p class="small" style="margin:6px 0 0">Gotówka u Ciebie: <b>${zl(cash)}</b> — do przekazania skarbnikowi.</p>` : ''}</section>`)
      }
    }
    return out.join('')
  }

  function kitPayHint()         {
    if (!can('payments.orders.place')) return ''
    const c = db.kitCampaigns.find((x) => x.status === 'open' && kitKids(x, me()).length)
    if (!c) return ''
    const todo = kitKids(c, me()).filter((k) => !kitOrderOf(c, k)).length
    return `<a class="card" href="#/club/orders/${c.id}" style="display:block;text-decoration:none;margin-bottom:12px"><div class="row between"><span class="item-title">${esc(c.name)}</span>${badge(`do ${dShort(c.closes)}`, 'info')}</div><div class="small muted">Zamówienie — ${todo ? 'zamów dla dziecka' : 'zobacz swoje zamówienia'}</div></a>`
  }

  function screenKitList()         {
    const pid = me()
    const camps = db.kitCampaigns.filter((c) => c.status !== 'draft' && kitKids(c, pid).length && (c.status === 'open' || kitKids(c, pid).some((k) => kitOrderOf(c, k))))
    if (!camps.length) return empty('Brak zamówień', 'Gdy klub otworzy zamówienie strojów, znajdziesz je tutaj i na ekranie „Dziś”.')
    return camps.map((c) => `<a class="card" href="#/club/orders/${c.id}" style="display:block;text-decoration:none"><div class="row between"><span class="item-title">${esc(c.name)}</span>${kitBadge(c.status)}</div>
      <div class="small muted">${c.status === 'open' ? `zamówienia do ${dShort(c.closes)}` : c.status === 'delivered' ? 'stroje do odbioru u trenera' : `zamknięte ${dShort(c.closes)}`} · płatność do ${dShort(c.payDue)}</div>
      <ul class="list small" style="margin-top:6px">${kitKids(c, pid).map((k) => { const o = kitOrderOf(c, k); return `<li class="row between"><span>${esc(personById(db, k).first)}</span><span>${o ? `${kitPayBadge(chargeById(o.chargeId))}${o.handedAt ? ' ' + badge('odebrane', 'success') : ''}` : badge('nie zamówiono', 'neutral')}</span></li>` }).join('')}</ul></a>`).join('')
  }

  function screenKitOrder(p                        , q                 )         {
    const c = kitCampaign(p.id)
    if (!c || c.status === 'draft') return empty('Nie znaleziono zamówienia', 'Link jest nieaktualny albo zbiórka nie została jeszcze otwarta (404).')
    if (personaId === 'guest') return kitGuestView(c)
    return kitOrderPage(c, me(), q, '')
  }

  function kitGuestView(c             )         {
    const sent = ui.kitLinkSent
    return `<div class="card"><div class="row" style="gap:10px">${logoBox(sectionLogo(section(c.section)), 'Logo sekcji', 40)}<div><div class="item-title">${esc(c.name)}</div><div class="small muted">${esc(section(c.section).name)} · zamówienia do ${dShort(c.closes)}</div></div></div><p class="small" style="margin:8px 0 0">${esc(c.description)}</p></div>
      ${c.status !== 'open' ? '<div class="alert warning"><strong>Zamówienia są zamknięte</strong>Szczegóły złożonego zamówienia zobaczysz po zalogowaniu.</div>' : ''}
      <div class="alert info"><strong>Zamówienie składa opiekun dziecka z grupy</strong>Zaloguj się w aplikacji klubu albo podaj e-mail, który zna klub — wyślemy osobisty link do formularza z Twoimi dziećmi.</div>
      ${link('Zaloguj się', '/login', 'btn primary block')}
      ${sent ? `<div class="alert success" role="status" style="margin-top:12px"><strong>Sprawdź skrzynkę</strong>Jeśli adres ${esc(sent)} jest w klubie, wysłaliśmy na niego osobisty link (ważny do ${dShort(c.closes)}).</div>` : `<form class="form" data-form="kit-link" data-campaign="${c.id}" style="margin-top:12px" novalidate><div class="form-general"></div>${fld('email', 'Twój e-mail', inp('email', 'email', '', 'autocomplete="email"'), { req: true })}<button class="btn block" type="submit">Wyślij mi link</button></form>`}`
  }

  function screenKitToken(p                        , q                 )         {
    const t = db.kitTokens[p.token]
    const c = t ? kitCampaign(t.campaign) : undefined
    if (!t || !c || c.status === 'completed') return `<div class="alert error" role="alert"><strong>Link wygasł lub jest nieprawidłowy (410)</strong>Poproś o nowy link w formularzu zamówienia albo zaloguj się.</div>${link('Zaloguj się', '/login', 'btn primary block')}`
    delete ui.kitLinkSent
    return `<div class="alert info"><strong>Osobisty link: ${esc(pName(t.guardian))}</strong>Link z e-maila — nie przekazuj go dalej. Możesz też zalogować się w aplikacji.</div>${kitOrderPage(c, t.guardian, q, p.token)}`
  }

  function kitOrderPage(c             , guardian        , q                 , token        )         {
    const base = token ? `/club/o/${token}` : `/club/orders/${c.id}`
    const kids = kitKids(c, guardian)
    const head = `<div class="card"><div class="row between"><span class="item-title">${esc(c.name)}</span>${kitBadge(c.status)}</div><p class="small" style="margin:6px 0 0">${esc(c.description)}</p><p class="small muted" style="margin:6px 0 0">Zamówienia do <b>${dShort(c.closes)}</b> · płatność do <b>${dShort(c.payDue)}</b>: online, przelewem z kodem płatnika albo gotówką u trenera</p></div>`
    if (!kids.length) return head + empty('Brak dzieci w grupach tej zbiórki', 'Zamówienie dotyczy wybranych grup. Jeśli to pomyłka, napisz do klubu.')
    const child = kids.includes(q.get('child') || '') ? (q.get('child')          ) : kids[0]
    const chips = kids.length > 1 ? `<div class="chips" role="group" aria-label="Dziecko" style="margin-top:12px">${kids.map((k) => `<a class="chip ${k === child ? 'on' : ''}" href="#${base}?child=${k}" ${k === child ? 'aria-current="true"' : ''}>${esc(personById(db, k).first)}${kitOrderOf(c, k) ? ' ✓' : ''}</a>`).join('')}</div>` : ''
    const o = kitOrderOf(c, child)
    const sub = `<div class="section-title">${esc(pName(child))} · ${esc(group(kitGroupOf(c, child)).name)}</div>`
    if (o && q.get('edit') !== '1') return head + chips + sub + kitOrderSummary(c, o, base, !token)
    if (c.status !== 'open') return head + chips + sub + `<div class="alert warning"><strong>Zamówienia są zamknięte</strong>${o ? '' : 'Dla tego dziecka nie złożono zamówienia. W pilnej sprawie napisz do klubu.'}</div>`
    return head + chips + sub + kitOrderForm(c, guardian, child, o, token)
  }

  function kitOrderSummary(c             , o          , base        , loggedIn         )         {
    const ch = chargeById(o.chargeId)
    const rest = ['paid', 'cancelled'].includes(ch.status) ? 0 : remaining(ch)
    return `<div class="card"><div class="row between"><span class="item-title">Zamówienie z ${esc(o.at)}</span>${kitPayBadge(ch)}</div>
      <ul class="list small">${o.lines.map((l) => `<li class="row between"><span>${esc(kitLineLabel(c, l))}</span><b>${zl(l.price)}</b></li>`).join('')}<li class="row between"><b>Razem</b><b>${zl(kitTotal(o))}</b></li></ul>
      ${o.printName || o.printNumber ? `<p class="small" style="margin:6px 0 0">Nadruk: <b>${esc(o.printName || '—')}</b>, numer <b>${esc(o.printNumber || '—')}</b></p>` : ''}
      ${o.notes ? `<p class="small muted" style="margin:6px 0 0">Uwagi: ${esc(o.notes)}</p>` : ''}
      ${o.handedAt ? `<div class="alert success" style="margin:8px 0 0"><strong>Odebrane</strong>${esc(o.handedAt)} · wydał(a) ${esc(pName(o.handedBy))}</div>` : c.status === 'delivered' ? '<div class="alert success" style="margin:8px 0 0"><strong>Do odbioru u trenera</strong>Stroje dotarły — odbierz je na najbliższym treningu.</div>' : ''}</div>
      ${rest > 0 ? `<div class="section-title">Płatność — ${zl(rest)} do ${dShort(ch.due)}</div><div class="stack">${loggedIn && can('payments.pay_online') ? link(`Zapłać online ${zl(rest)}`, `/stripe?ids=${ch.id}`, 'btn primary block') : ''}<p class="small muted" style="margin:0">Przelew na konto klubu PL 00 1020 0000 0000 0000 0000 0000 — w tytule wpisz <b>${payerCode(o.by)}</b>, a wpłata rozliczy się sama. Gotówkę przyjmuje trener grupy (dostaniesz potwierdzenie e-mail).</p></div>` : ''}
      ${c.status === 'open' ? `<div class="stack" style="margin-top:12px">${link('Zmień zamówienie', `${base}?child=${o.child}&edit=1`, 'btn block')}${btn('Anuluj zamówienie', 'kit-cancel-order', { order: o.id }, 'block danger')}<p class="small muted" style="margin:0">Zmiany są możliwe do ${dShort(c.closes)}.</p></div>` : ''}`
  }

  function kitOrderForm(c             , guardian        , child        , o                      , token        )         {
    const gp = personById(db, guardian)
    const setP = c.products.find((p) => p.kind === 'set')
    const setLine = setP ? o?.lines.find((l) => l.product === setP.id) : undefined
    const comps = setP?.components || []
    const val = (pid        )         => {
      if (!o) return ''
      if (setLine?.sizes?.[pid]) return setLine.sizes[pid]
      const l = o.lines.find((x) => x.product === pid)
      const p = c.products.find((x) => x.id === pid)              
      return l ? (l.size || 'yes') : (p.required ? 'none' : '')
    }
    const setSum = comps.reduce((a, id) => a + (c.products.find((x) => x.id === id)              ).priceChild, 0)
    const g = kitGroupOf(c, child)
    const taken = kitOrders(c).filter((x) => x !== o && kitGroupOf(c, x.child) === g && x.printNumber).map((x) => Number(x.printNumber)).sort((a, b) => a - b)
    const items = c.products.filter((p) => p.kind === 'item').map((p) => {
      const price = (s        )         => p.sizesAdult.includes(s) ? (p.priceAdult ?? p.priceChild) : p.priceChild
      const sized = p.sizesChild.length + p.sizesAdult.length > 0
      const opts                     = sized
        ? [['', p.required ? '— wybierz —' : '— nie zamawiam —'], ...(p.required ? [['none', 'Nie zamawiam']                    ] : []), ...[...p.sizesChild, ...p.sizesAdult].map((s) => [s, `${s} — ${zl(price(s))}`]                    )]
        : [['', '— nie zamawiam —'], ['yes', `Zamawiam — ${zl(p.priceChild)}`]]
      return fld(`p-${p.id}`, p.name, sel(`p-${p.id}`, opts, val(p.id), 'data-change="kit-recalc"'), { req: p.required, hint: comps.includes(p.id) ? `W komplecie wybierz rozmiar; osobno ${zl(p.priceChild)}` : '' })
    }).join('')
    const total = kitPrice(c, Object.fromEntries(c.products.filter((p) => p.kind === 'item').map((p) => [p.id, val(p.id)])), !!setLine).total
    return `<form class="form" data-form="kit-order" data-campaign="${c.id}" data-child="${child}" data-token="${esc(token)}" novalidate><div class="form-general"></div>
      ${setP ? `<div class="card">${chk('set', `<b>${esc(setP.name.split(':')[0])} — ${zl(setP.priceChild)}</b> zamiast ${zl(setSum)} osobno${setP.name.includes(':') ? ` — ${esc(setP.name.split(':')[1].trim())}` : ''}.`, !!setLine, 'data-change="kit-recalc"')}</div>` : ''}
      <div class="form-group"><h3>Co zamawiasz</h3><div class="stack">${items}</div></div>
      ${c.printName || c.printNumber ? `<div class="form-group"><h3>Nadruk</h3><div class="fields">${c.printName ? fld('printName', 'Imię do nadruku', inp('printName', 'text', o ? o.printName : personById(db, child).first.toUpperCase(), 'maxlength="12"'), { hint: 'Do 12 znaków' }) : ''}${c.printNumber ? fld('printNumber', 'Numer', inp('printNumber', 'number', o?.printNumber || '', 'min="1" max="99"'), { hint: taken.length ? `Zajęte w grupie: ${taken.join(', ')}` : 'Numery w grupie nie mogą się powtarzać' }) : ''}</div></div>` : ''}
      <div class="form-group"><h3>Kontakt i uwagi</h3><div class="fields">${fld('email', 'E-mail (kopia zamówienia)', inp('email', 'email', o?.email || gp.email || ''), { req: true })}${fld('phone', 'Telefon', inp('phone', 'tel', o?.phone || gp.phone || ''), { req: true })}</div><div style="margin-top:10px">${fld('notes', c.notesLabel, area('notes', o?.notes || '', 'rows="2" maxlength="500"'))}</div></div>
      <div class="card row between"><b>Razem</b><b id="kit-total">${zl(total)}</b></div>
      <button class="btn primary block" type="submit">${o ? 'Zapisz zmiany' : 'Złóż zamówienie'}</button>
      <p class="small muted" style="margin:0">Kopię zamówienia wyślemy e-mailem. Do ${dShort(c.closes)} możesz je zmienić lub anulować. Należność zobaczysz w „Płatnościach”.</p></form>`
  }

  function screenKitCoach(q                 )         {
    const pid = me(), scope = kitScope(pid), mine = coachedGroups(pid)
    const camps = db.kitCampaigns.filter((c) => !['draft', 'completed'].includes(c.status) && c.groups.some((g) => scope.includes(g)))
    const cash = custodyOf(pid)
    const cashBox = cash.length ? `<div class="alert info"><strong>Gotówka u Ciebie: ${zl(cash.reduce((a, t) => a + t.x.amount, 0))} (${cash.length} ${cash.length === 1 ? 'wpłata' : 'wpłaty'})</strong>Przekaż ją skarbnikowi — rozliczenie potwierdza administrator w panelu.<ul class="list small" style="margin-top:6px">${cash.map((t) => `<li class="row between"><span>${esc(t.x.receipt || '')} · ${esc(t.c.description)}</span><b>${zl(t.x.amount)}</b></li>`).join('')}</ul></div>` : ''
    if (!camps.length) return cashBox + empty('Brak zamówień w Twoich grupach', 'Gdy administrator otworzy zamówienie strojów, zobaczysz tu zamówienia dzieci ze swoich grup.')
    const c = camps.find((x) => x.id === q.get('c')) || camps[0]
    const groups = c.groups.filter((g) => scope.includes(g) && group(g).members.length).sort((a, b) => Number(!mine.includes(a)) - Number(!mine.includes(b)))
    const gid = groups.includes(q.get('group') || '') ? (q.get('group')          ) : groups[0]
    const campChips = camps.length > 1 ? `<div class="chips">${camps.map((x) => `<a class="chip ${x === c ? 'on' : ''}" href="#/club/coach/orders?c=${x.id}">${esc(x.name)}</a>`).join('')}</div>` : ''
    const chips = `<div class="chips" role="group" aria-label="Grupa" style="margin-top:12px">${groups.map((x) => `<a class="chip ${x === gid ? 'on' : ''}" href="#/club/coach/orders?c=${c.id}&group=${x}">${esc(group(x).name)}${mine.includes(x) ? '' : ' (sekcja)'} · ${kitOrders(c).filter((o) => kitGroupOf(c, o.child) === x).length}/${group(x).members.length}</a>`).join('')}</div>`
    const members = gid ? group(gid).members : []
    const rows = members.map((m) => {
      const o = kitOrderOf(c, m)
      if (!o) return `<li class="row between"><span class="item-title">${esc(pName(m))}</span>${badge('brak zamówienia', 'neutral')}</li>`
      const ch = chargeById(o.chargeId)
      return `<li><div class="row between"><span class="item-title">${esc(pName(m))}</span>${kitPayBadge(ch)}</div>
        <div class="small muted">${o.lines.map((l) => esc(kitLineLabel(c, l))).join(' · ')}${o.printName || o.printNumber ? ` · nadruk ${esc(o.printName)} ${esc(o.printNumber)}` : ''} · razem ${zl(kitTotal(o))}</div>
        <div class="small muted">Zamawia: ${esc(pName(o.by))}, tel. ${esc(o.phone)}</div>
        <div class="row" style="margin-top:6px">${ch.status !== 'paid' ? btn('Przyjmij gotówkę', 'kit-cash', { order: o.id }, 'sm primary') : ''}${o.handedAt ? badge(`wydane ${o.handedAt}`, 'success') : c.status === 'delivered' ? btn('Wydaj strój', 'kit-hand', { order: o.id }, 'sm') : ''}</div></li>`
    }).join('')
    const missing = members.filter((m) => !kitOrderOf(c, m)).length
    return `${cashBox}${campChips}<div class="card"><div class="row between"><span class="item-title">${esc(c.name)}</span>${kitBadge(c.status)}</div><div class="small muted">${c.status === 'open' ? `zamówienia do ${dShort(c.closes)}` : c.status === 'delivered' ? 'stroje dotarły — wydawaj na treningu' : 'zamówienia zamknięte — czekamy na dostawę'} · płatność do ${dShort(c.payDue)}</div></div>
      ${chips}${members.length ? `<ul class="list">${rows}</ul>` : empty('Twoje grupy nie mają członków', '')}
      <div class="stack" style="margin-top:12px">${c.status === 'open' && missing ? btn(`Przypomnij opiekunom (${missing} bez zamówienia)`, 'kit-remind', { c: c.id, group: gid }, 'block') : ''}${c.status === 'open' ? btn('Tekst z linkiem na grupę', 'kit-share', { id: c.id }, 'block') : ''}</div>`
  }

  // ── Panel ─────────────────────────────────────────────────────────────
  function screenKitCampaigns()         {
    return `${pageHead('Zbiórki zamówień', 'Formularze zamówień (np. stroje): rodzice zamawiają w aplikacji lub z osobistego linku, każde zamówienie to należność', link('Nowy formularz', '/backend/payments/orders/create', 'btn primary'))}
      ${table({ cols: [
        { label: 'Zbiórka', cell: (c             ) => `<a class="row-link" href="#/backend/payments/orders/${c.id}">${esc(c.name)}</a><div class="small muted">${esc(section(c.section).name)} · ${c.groups.length} ${groupsWord(c.groups.length)}</div>` },
        { label: 'Zamówienia do', cell: (c             ) => dShort(c.closes) },
        { label: 'Status', cell: (c             ) => kitBadge(c.status) },
        { label: 'Zamówienia', num: true, cell: (c             ) => { const s = kitStats(c); return `${s.orders} / ${s.kids}` } },
        { label: 'Wartość', num: true, cell: (c             ) => zl(kitStats(c).value) },
        { label: 'Wpłacono', num: true, cell: (c             ) => zl(kitStats(c).paid) },
        { label: 'Wydano', num: true, cell: (c             ) => String(kitStats(c).handed) },
      ], rows: db.kitCampaigns, empty: ['Brak zbiórek', 'Utwórz formularz zamówień — np. stroje dla Akademii.'] })}`
  }

  function blankKit()              {
    return { id: '', name: '', description: '', section: 's-akad', groups: [], closes: addDays(TODAY, 10), payDue: addDays(TODAY, 24), status: 'draft', printName: false, printNumber: false, notesLabel: 'Uwagi do zamówienia', products: [{ id: uid('kp'), name: '', kind: 'item', sizesChild: [], sizesAdult: [], priceChild: 0, required: true }], supplier: '', createdBy: me() }
  }

  function readKitDraft(form                 )              {
    const fd = new FormData(form)
    const base              = ui.kitDraft ? JSON.parse(ui.kitDraft) : blankKit()
    const list = (v         )           => String(v || '').split(',').map((x) => x.trim()).filter(Boolean)
    const money = (v         )         => Math.round(Number(String(v || '').replace(',', '.')) * 100) || 0
    const products               = []
    for (let i = 0; i < Number(fd.get('pcount')); i++) {
      const kind = String(fd.get(`pk-${i}`)) === 'set' ? 'set' : 'item'
      const adult = String(fd.get(`pp-${i}`) || '').trim()
      products.push({ id: String(fd.get(`pid-${i}`)), name: String(fd.get(`pn-${i}`) || '').trim(), kind, components: kind === 'set' ? fd.getAll(`pcomp-${i}`).map(String) : undefined, sizesChild: kind === 'set' ? [] : list(fd.get(`ps-${i}`)), sizesAdult: kind === 'set' ? [] : list(fd.get(`pa-${i}`)), priceChild: money(fd.get(`pc-${i}`)), priceAdult: kind === 'item' && adult ? money(adult) : undefined, required: kind === 'item' && !!fd.get(`pr-${i}`) })
    }
    return { ...base, name: String(fd.get('name') || '').trim(), description: String(fd.get('description') || '').trim(), section: String(fd.get('section') || base.section), groups: fd.getAll('groups').map(String), closes: String(fd.get('closes') || ''), payDue: String(fd.get('payDue') || ''), supplier: String(fd.get('supplier') || '').trim(), printName: !!fd.get('printName'), printNumber: !!fd.get('printNumber'), notesLabel: String(fd.get('notesLabel') || '').trim() || 'Uwagi do zamówienia', products }
  }
  function kitDraftEdit(fn                          )       {
    const d = readKitDraft(document.querySelector('[data-form="kit-campaign"]')                   )
    fn(d); ui.kitDraft = JSON.stringify(d); render()
  }

  function screenKitBuilder(p                        )         {
    const key = p.id || 'new'
    const src = p.id ? kitCampaign(p.id) : undefined
    if (p.id && !src) return empty('Nie znaleziono zbiórki', '404', link('Zbiórki zamówień', '/backend/payments/orders'))
    if (src && !['draft', 'open'].includes(src.status)) return `<div class="alert warning"><strong>Formularza nie można już edytować (409)</strong>Zbiórka jest zamknięta — zamówienia przekazano dalej.</div>${link('Wróć do zbiórki', `/backend/payments/orders/${src.id}`)}`
    if (ui.kitDraftFor !== key || !ui.kitDraft) { ui.kitDraft = JSON.stringify(src || blankKit()); ui.kitDraftFor = key }
    const d              = JSON.parse(ui.kitDraft)
    const used = new Set(src ? kitOrders(src).flatMap((o) => o.lines.flatMap((l) => [l.product, ...Object.keys(l.sizes || {})])) : [])
    const items = d.products.filter((x) => x.kind === 'item')
    const money = (v                    )         => v ? String(v / 100) : ''
    const prow = (x            , i        )         => `<div class="card"><input type="hidden" name="pid-${i}" value="${esc(x.id)}">
      <div class="row between" style="margin-bottom:8px"><b>${i + 1}. ${x.kind === 'set' ? 'Komplet' : 'Produkt'}${x.name ? ` — ${esc(x.name.split(':')[0])}` : ''}</b>${used.has(x.id) ? badge('w zamówieniach', 'info') : btn('Usuń', 'kit-remove-product', { i: String(i) }, 'sm')}</div>
      <div class="fields">${fld(`pk-${i}`, 'Rodzaj', sel(`pk-${i}`, [['item', 'Produkt (z rozmiarami lub bez)'], ['set', 'Komplet z kilku produktów']], x.kind, `data-change="kit-redraw" ${used.has(x.id) ? 'disabled' : ''}`))}${fld(`pn-${i}`, 'Nazwa', inp(`pn-${i}`, 'text', x.name, 'maxlength="140"'), { req: true })}</div>
      ${used.has(x.id) ? `<input type="hidden" name="pk-${i}" value="${x.kind}">` : ''}
      ${x.kind === 'set'
        ? `<div class="fields" style="margin-top:10px">${fld(`pc-${i}`, 'Cena kompletu (zł)', inp(`pc-${i}`, 'number', money(x.priceChild), 'step="0.01" min="0"'), { req: true })}</div>
          <div class="field" data-field="pcomp-${i}" style="margin-top:10px"><span>Elementy kompletu <b class="req">*</b></span><div class="chips">${items.map((it) => `<label class="chip ${x.components?.includes(it.id) ? 'on' : ''}"><input type="checkbox" class="sr-only" name="pcomp-${i}" value="${esc(it.id)}" data-change="chip" ${x.components?.includes(it.id) ? 'checked' : ''}>${esc(it.name || 'bez nazwy')}</label>`).join('')}</div><small>Rodzic wybiera rozmiary elementów; zamiast cen pojedynczych liczona jest cena kompletu.</small></div>`
        : `<div class="fields" style="margin-top:10px">${fld(`ps-${i}`, 'Rozmiary dziecięce', inp(`ps-${i}`, 'text', x.sizesChild.join(', '), 'placeholder="np. 116, 128, 140"'), { hint: 'Po przecinku; puste = produkt bez rozmiaru' })}${fld(`pa-${i}`, 'Rozmiary dorosłe', inp(`pa-${i}`, 'text', x.sizesAdult.join(', '), 'placeholder="np. S, M, L"'))}${fld(`pc-${i}`, 'Cena (zł)', inp(`pc-${i}`, 'number', money(x.priceChild), 'step="0.01" min="0"'), { req: true })}${fld(`pp-${i}`, 'Cena rozmiarów dorosłych (zł)', inp(`pp-${i}`, 'number', money(x.priceAdult), 'step="0.01" min="0"'), { hint: 'Puste = jak cena podstawowa' })}</div>
          <div style="margin-top:8px">${chk(`pr-${i}`, 'Wymagana odpowiedź (rozmiar albo „Nie zamawiam”)', x.required)}</div>`}
      ${used.has(x.id) ? '<p class="small muted" style="margin:8px 0 0">Produkt jest w złożonych zamówieniach — nie można go usunąć; nowa cena dotyczy tylko kolejnych zamówień.</p>' : ''}</div>`
    const secGroups = db.groups.filter((g) => g.section === d.section)
    return `${pageHead(src ? `Edycja: ${src.name}` : 'Nowy formularz zamówień', 'Rodzice wypełniają go w aplikacji lub z osobistego linku; każde zamówienie tworzy należność płatnika', '')}
      <form class="form" data-form="kit-campaign" novalidate><div class="form-general"></div>
      ${src && src.status === 'open' ? `<div class="alert info"><strong>Zbieranie trwa (${kitOrders(src).length} zamówień)</strong>Zmiany widzą od razu rodzice. Złożone zamówienia zachowują swoje ceny i rozmiary.</div>` : ''}
      <div class="form-group"><h3>Zbiórka</h3><div class="fields">${fld('name', 'Nazwa', inp('name', 'text', d.name, 'maxlength="120" placeholder="np. Stroje Akademii — zima 2026"'), { req: true })}${fld('section', 'Sekcja', sel('section', db.sections.map((s) => [s.id, s.name]                    ), d.section, 'data-change="kit-section"'), { req: true })}</div>
        <div style="margin-top:10px">${fld('description', 'Opis dla rodziców', area('description', d.description, 'rows="3" maxlength="1000"'), { hint: 'Co zamawiamy, ile kosztuje, kiedy i gdzie odbiór — trafia też do tekstu na Messengera' })}</div>
        <div class="field" data-field="groups" style="margin-top:10px"><span>Grupy — kto zamawia <b class="req">*</b></span><div class="chips">${secGroups.map((g) => `<label class="chip ${d.groups.includes(g.id) ? 'on' : ''}"><input type="checkbox" class="sr-only" name="groups" value="${g.id}" data-change="chip" ${d.groups.includes(g.id) ? 'checked' : ''}>${esc(g.name)}</label>`).join('')}</div><div style="margin-top:6px">${btn('Zaznacz wszystkie', 'kit-all-groups', {}, 'sm')}</div></div>
        <div class="fields" style="margin-top:10px">${fld('closes', 'Zamówienia do', inp('closes', 'date', d.closes), { req: true, hint: 'Po tym dniu formularz zamyka się sam' })}${fld('payDue', 'Termin płatności', inp('payDue', 'date', d.payDue), { req: true, hint: 'Nie wcześniej niż zamknięcie; przypomnienia po terminie' })}${fld('supplier', 'Dostawca (widzi tylko klub)', inp('supplier', 'text', d.supplier))}</div></div>
      <div class="form-group"><h3>Personalizacja i uwagi</h3><div class="stack">${chk('printName', 'Pytaj o imię do nadruku', d.printName)}${chk('printNumber', 'Pytaj o numer do nadruku (unikalny w grupie)', d.printNumber)}</div><div style="margin-top:10px">${fld('notesLabel', 'Pytanie o uwagi', inp('notesLabel', 'text', d.notesLabel))}</div></div>
      <div class="form-group"><div class="row between" style="margin-bottom:10px"><h3 style="margin:0">Produkty</h3><div class="row">${used.size ? '' : btn('Wczytaj szablon: stroje Akademii', 'kit-template', {}, 'sm')}${btn('Dodaj produkt', 'kit-add-product', {}, 'sm primary')}</div></div><input type="hidden" name="pcount" value="${d.products.length}"><div class="stack">${d.products.map(prow).join('')}</div></div>
      <div class="form-actions">${link('Anuluj', src ? `/backend/payments/orders/${src.id}` : '/backend/payments/orders')}${!src || src.status === 'draft' ? '<button class="btn" type="submit" value="draft">Zapisz szkic</button><button class="btn primary" type="submit" value="open">Zapisz i otwórz zbieranie</button>' : '<button class="btn primary" type="submit" value="save">Zapisz zmiany</button>'}</div></form>`
  }

  function screenKitCampaignAdmin(p                        , q                 )         {
    const c = kitCampaign(p.id)
    if (!c) return empty('Nie znaleziono zbiórki', '404', link('Zbiórki zamówień', '/backend/payments/orders'))
    const view = q.get('view') || 'orders'
    const s = kitStats(c), os = kitOrders(c)
    const steps                          = ['draft', 'open', 'closed', 'ordered', 'delivered', 'completed']
    const stepper = `<div class="chips" aria-label="Etapy zbiórki" style="margin-bottom:12px">${steps.map((st) => `<span class="chip ${st === c.status ? 'on' : ''}" ${st === c.status ? 'aria-current="step"' : ''}>${esc(KIT_STATUS[st][0])}</span>`).join('')}</div>`
    const next                                                           = { draft: ['open', 'Otwórz zbieranie'], open: ['closed', 'Zamknij zamówienia'], closed: ['ordered', 'Oznacz: zamówione u dostawcy'], ordered: ['delivered', 'Oznacz: dostarczone — powiadom rodziców'], delivered: ['completed', 'Zakończ zbiórkę'] }
    const nx = next[c.status]
    const actions = `${['draft', 'open'].includes(c.status) ? link('Edytuj formularz', `/backend/payments/orders/${c.id}/edit`) : ''}${c.status === 'open' ? btn('Tekst na Messengera', 'kit-share', { id: c.id }) : ''}${nx ? btn(nx[1], 'kit-status', { id: c.id, to: nx[0] }, 'primary') : ''}`
    const kpis = `<div class="grid3"><div class="card"><div class="sub">Zamówienia</div><div class="kpi">${s.orders} / ${s.kids}</div><div class="small muted">dzieci w wybranych grupach</div></div><div class="card"><div class="sub">Wpłacono</div><div class="kpi">${zl(s.paid)}</div><div class="small muted">z ${zl(s.value)} · termin ${dShort(c.payDue)}</div></div><div class="card"><div class="sub">Wydano</div><div class="kpi">${s.handed} / ${s.orders}</div><div class="small muted">${esc(c.supplier || 'dostawca nie wskazany')}</div></div></div>`
    const missingRows = c.groups.flatMap((gid) => group(gid).members.filter((m) => !kitOrderOf(c, m)).map((m) => ({ m, gid })))
    const tabs                              = [[`Zamówienia (${os.length})`, `/backend/payments/orders/${c.id}?view=orders`, view === 'orders'], ['Zestawienie dla dostawcy', `/backend/payments/orders/${c.id}?view=supplier`, view === 'supplier'], [`Bez zamówienia (${missingRows.length})`, `/backend/payments/orders/${c.id}?view=missing`, view === 'missing']]
    let body = ''
    if (view === 'supplier') {
      const agg = kitSupplier(c)
      const prints = os.filter((o) => o.printName || o.printNumber)
      const first = c.products.find((x) => x.kind === 'item')
      const shirt = (o          )         => { if (!first) return '—'; for (const l of o.lines) { if (l.sizes?.[first.id]) return l.sizes[first.id]; if (l.product === first.id) return l.size } return '—' }
      const csv = ['produkt;rozmiar;sztuk;w kompletach', ...agg.map((a) => `${a.product.name};${a.size};${a.qty};${a.inSet}`), '', 'dziecko;grupa;imię;numer;koszulka', ...prints.map((o) => `${pName(o.child)};${group(kitGroupOf(c, o.child)).name};${o.printName};${o.printNumber};${shirt(o)}`)].join('\n')
      body = `${c.status === 'open' ? '<div class="alert warning"><strong>Zbieranie trwa</strong>Zestawienie zmieni się, dopóki nie zamkniesz zamówień.</div>' : ''}${table({ tabs, cols: [
          { label: 'Produkt', cell: (a                         ) => esc(a.product.name) },
          { label: 'Rozmiar', cell: (a                  ) => `<b>${esc(a.size)}</b>` },
          { label: 'Sztuk', num: true, cell: (a                 ) => `<b>${a.qty}</b>` },
          { label: 'W tym w kompletach', num: true, cell: (a                   ) => a.inSet ? String(a.inSet) : '—' },
        ], rows: agg, empty: ['Brak pozycji', 'Zestawienie powstaje ze złożonych zamówień.'] })}
        <div class="section-title">Nadruki (${prints.length})</div>${table({ cols: [{ label: 'Dziecko', cell: (o          ) => esc(pName(o.child)) }, { label: 'Grupa', cell: (o          ) => esc(group(kitGroupOf(c, o.child)).name) }, { label: 'Imię', cell: (o          ) => `<b>${esc(o.printName || '—')}</b>` }, { label: 'Numer', num: true, cell: (o          ) => `<b>${esc(o.printNumber || '—')}</b>` }, { label: 'Koszulka', cell: (o          ) => esc(shirt(o)) }], rows: prints, empty: ['Brak nadruków', ''] })}
        <div class="section-title">CSV dla dostawcy</div><textarea id="csv-text" readonly rows="8" style="width:100%">${esc(csv)}</textarea><div class="row" style="margin-top:8px">${btn('Kopiuj CSV', 'copy-csv', {}, 'primary')}</div>`
    } else if (view === 'missing') {
      body = table({ tabs, toolbar: c.status === 'open' && missingRows.length ? btn(`Przypomnij wszystkim (${missingRows.length})`, 'kit-remind', { c: c.id }, 'sm primary') : '', cols: [
        { label: 'Dziecko', cell: (r               ) => `<b>${esc(pName(r.m))}</b>` },
        { label: 'Grupa', cell: (r                 ) => esc(group(r.gid).name) },
        { label: 'Opiekunowie', cell: (r               ) => esc(db.guardianships.filter((x) => x.ward === r.m).map((x) => `${pName(x.guardian)}${personById(db, x.guardian).email ? '' : ' (bez e-maila)'}`).join(', ') || 'brak opiekuna') },
      ], rows: missingRows, empty: ['Wszyscy zamówili', 'Każde dziecko z wybranych grup ma zamówienie.'] })
    } else {
      body = table({ tabs, cols: [
        { label: 'Dziecko', cell: (o          ) => `<b>${esc(pName(o.child))}</b><div class="small muted">${esc(group(kitGroupOf(c, o.child)).name)}</div>` },
        { label: 'Zamawia', cell: (o          ) => `${esc(pName(o.by))}<div class="small muted">${esc(o.phone)} · ${esc(o.via)}</div>` },
        { label: 'Pozycje', cell: (o          ) => `<div class="small">${o.lines.map((l) => esc(kitLineLabel(c, l))).join('<br>')}</div>${o.notes ? `<div class="small muted">Uwagi: ${esc(o.notes)}</div>` : ''}` },
        { label: 'Nadruk', cell: (o          ) => esc([o.printName, o.printNumber].filter(Boolean).join(' ') || '—') },
        { label: 'Kwota', num: true, cell: (o          ) => zl(kitTotal(o)) },
        { label: 'Płatność', cell: (o          ) => { const ch = chargeById(o.chargeId); return `${kitPayBadge(ch)}${ch.payments.length ? `<div class="small muted">${ch.payments.map((x) => `${esc(x.method)}${x.by ? ` — ${esc(pName(x.by))}${x.settled ? '' : ', u przyjmującego'}` : ''}`).join(', ')}</div>` : ''}` } },
        { label: 'Wydanie', cell: (o          ) => o.handedAt ? `${badge('wydane', 'success')}<div class="small muted">${esc(pName(o.handedBy))}</div>` : '—' },
        { label: '', cell: (o          ) => { const ch = chargeById(o.chargeId); return `<div class="row">${ch.status !== 'paid' ? btn('Gotówka', 'cash', { payer: o.by, charge: ch.id }, 'sm') : ''}${c.status === 'delivered' && !o.handedAt ? btn('Wydaj', 'kit-hand', { order: o.id }, 'sm') : ''}<a class="btn sm" href="#/backend/payments/charges/${ch.id}">Należność</a></div>` } },
      ], rows: os, empty: ['Brak zamówień', c.status === 'draft' ? 'Otwórz zbieranie i wyślij link rodzicom.' : 'Wyślij rodzicom tekst z linkiem na Messengera.'] })
    }
    return `${pageHead(c.name, `${section(c.section).name} · ${c.groups.length} ${groupsWord(c.groups.length)} · zamówienia do ${dShort(c.closes)} · płatność do ${dShort(c.payDue)}`, actions)}${stepper}${kpis}<div style="margin-top:12px">${body}</div>`
  }

  function screenCashCustody()         {
    return `${pageHead('Gotówka do rozliczenia', 'Gotówka przyjęta przez trenerów i inne osoby, której skarbnik jeszcze nie odebrał', '')}
      ${table({ cols: [
        { label: 'Osoba', cell: (pid        ) => `<b>${esc(pName(pid))}</b>` },
        { label: 'Wpłaty', cell: (pid        ) => `<div class="small">${custodyOf(pid).map((t) => `${esc(t.x.receipt || '—')} · ${esc(t.c.description)} · ${dShort(t.x.date)} — ${zl(t.x.amount)}`).join('<br>')}</div>` },
        { label: 'Najstarsza', cell: (pid        ) => dShort(custodyOf(pid).map((t) => t.x.date).sort()[0]) },
        { label: 'Razem', num: true, cell: (pid        ) => `<b>${zl(custodyOf(pid).reduce((a, t) => a + t.x.amount, 0))}</b>` },
        { label: '', cell: (pid        ) => btn('Przyjmij rozliczenie', 'cash-settle', { person: pid }, 'sm primary') },
      ], rows: custodians(), empty: ['Nic do rozliczenia', 'Cała przyjęta gotówka jest u skarbnika.'] })}
      ${db.cashHandovers.length ? `<div class="section-title">Rozliczenia</div>${table({ cols: [{ label: 'Numer', cell: (h              ) => `<b>${esc(h.number)}</b>` }, { label: 'Od', cell: (h              ) => esc(pName(h.collector)) }, { label: 'Kiedy', cell: (h              ) => esc(h.at) }, { label: 'Przyjął(a)', cell: (h              ) => esc(pName(h.by)) }, { label: 'Wpłat', num: true, cell: (h              ) => String(h.count) }, { label: 'Kwota', num: true, cell: (h              ) => zl(h.amount) }], rows: db.cashHandovers })}` : ''}`
  }

  function kitDashboardWidget(w                                                                       )         {
    const camps = db.kitCampaigns.filter((c) => !['draft', 'completed'].includes(c.status))
    const held = custodians().reduce((a, pid) => a + custodyOf(pid).reduce((b, t) => b + t.x.amount, 0), 0)
    return w('Zbiórki zamówień', `${camps.length ? `<ul class="list small">${camps.map((c) => { const s = kitStats(c); return `<li><a href="#/backend/payments/orders/${c.id}">${esc(c.name)}</a> ${kitBadge(c.status)}<br><span class="muted">${s.orders} z ${s.kids} dzieci · wpłacono ${zl(s.paid)} z ${zl(s.value)}</span></li>` }).join('')}</ul>` : '<p class="muted small">Brak trwających zbiórek.</p>'}${held ? `<p class="small" style="margin:8px 0 0">Gotówka u trenerów: <b>${zl(held)}</b> — <a href="#/backend/payments/cash-custody">rozlicz</a></p>` : ''}`, '/backend/payments/orders', camps.length)
  }

  const R = (pattern        , id        , name        , shell           , api          , render                    , extra                    = {})           => ({ pattern, id, name, shell, api, render, ...extra })
  const ROUTES             = [
    R('/login', 'M-01', 'Logowanie', 'member', ['logowanie modułu auth', 'GET /api/people/me'], () => screenLogin(), { persona: false }),
    R('/club', 'M-02', 'Dziś', 'member', ['GET /api/people/me', 'GET /api/activities/calendar?as=self', 'POST /api/activities/attendance/declare', 'GET /api/communication/threads?unread=1', 'GET /api/payments/my-charges?status=open'], () => screenToday(), { empty: ['Dziś nie ma zajęć', 'Najbliższy termin: czw 16:00 — Zajęcia na basenie.'] }),
    R('/club/calendar', 'M-03', 'Kalendarz', 'member', ['GET /api/activities/calendar?as=guardian&from&to'], (_p, q) => screenCalendar(q), { empty: ['Brak terminów w tym tygodniu', 'Sprawdź następny tydzień.'] }),
    R('/club/occurrences/:id', 'M-04', 'Termin', 'member', ['GET /api/activities/occurrences/{id}', 'POST /api/activities/attendance/declare', 'POST /api/activities/attendance/{id}/guardian-decision', 'POST /api/activities/occurrences/{id}/absence', 'POST /api/activities/occurrences/{id}/cancel'], (p) => screenOccurrence(p), { back: '/club/calendar' }),
    R('/club/occurrences/:id/attendance', 'M-05', 'Lista obecności', 'member', ['GET /api/activities/occurrences/{id}/attendance', 'PUT /api/activities/occurrences/{id}/attendance'], (p) => screenAttendance(p), { empty: ['Grupa nie ma członków w dniu terminu', 'Koordynator może dodać uczestników w składzie grupy.'], back: '/club' }),
    R('/club/messages', 'M-06', 'Wiadomości', 'member', ['GET /api/communication/threads', 'POST /api/communication/threads'], () => screenMessages(), { empty: ['Brak wiadomości', 'Tu pojawią się komunikaty trenerów i klubu.'] }),
    R('/club/messages/:id', 'M-07', 'Wątek', 'member', ['GET /api/communication/threads/{id}', 'POST /api/communication/threads/{id}/replies', 'GET /api/communication/share-text'], (p) => screenThread(p), { back: '/club/messages' }),
    R('/club/payments', 'M-08', 'Płatności', 'member', ['GET /api/payments/my-charges', 'POST /api/payments/checkout'], () => screenPayments(), { empty: ['Wszystko opłacone', 'Nowe należności pojawią się na początku miesiąca.'] }),
    R('/club/payments/return', 'M-09', 'Wynik płatności', 'member', ['GET /api/payments/my-charges'], (_p, q) => screenPayReturn(q), { back: '/club/payments' }),
    R('/club/profile', 'M-10', 'Profil i podopieczni', 'member', ['GET /api/people/me', 'PUT /api/people/persons/{id}', 'PUT /api/people/guardianships/{id}'], () => screenProfile()),
    R('/club/places', 'M-11', 'Obiekty', 'member', ['GET /api/facilities/calendar'], () => screenPlaces(), { empty: ['Brak obiektów', 'Administrator nie dodał jeszcze obiektów.'] }),
    R('/club/places/:id', 'M-11', 'Obiekt — rezerwacja', 'member', ['GET /api/facilities/calendar?placeId&from&to', 'POST /api/facilities/internal-bookings', 'DELETE /api/facilities/internal-bookings/{id}', 'POST /api/activities/events'], (p, q) => screenPlace(p, q), { empty: ['Obiekt nie ma reguł stref', 'Skontaktuj się z administratorem.'], back: '/club/places' }),
    R('/club/facility', 'M-12', 'Dziś na obiekcie', 'member', ['GET /api/facilities/today', 'POST/PUT /api/facilities/logs', 'POST /api/facilities/incidents', 'POST /api/facilities/rentals/{id}/no-show'], () => screenFacilityToday(), { empty: ['Dziś na obiekcie nic nie zaplanowano', 'Godziny ogólnodostępne według strefy.'] }),
    R('/club/link', 'M-13', 'Prośba o link', 'member', ['POST /api/activities/declaration-links'], (_p, q) => screenLink(q), { persona: false }),
    R('/club/cash', 'M-15', 'Przyjmij gotówkę', 'member', ['GET /api/payments/charges?payer=&status=open', 'POST /api/payments/cash'], () => screenCashMobile(), { back: '/club/profile' }),
    R('/club/orders', 'M-16', 'Zamówienia', 'member', ['GET /api/payments/order-campaigns?for=me'], () => screenKitList(), { empty: ['Brak zamówień', 'Gdy klub otworzy zamówienie strojów, znajdziesz je tutaj.'], back: '/club/payments' }),
    R('/club/orders/:id', 'M-17', 'Zamówienie', 'member', ['GET /api/payments/order-campaigns/{id}/form', 'POST /api/payments/orders', 'PUT /api/payments/orders/{id}', 'POST /api/payments/orders/{id}/cancel', 'POST /api/payments/public/order-campaigns/{id}/link-request'], (p, q) => screenKitOrder(p, q), { back: '/club/orders', guestOk: true }),
    R('/club/coach/orders', 'M-18', 'Zamówienia moich grup', 'member', ['GET /api/payments/orders?scope=coach&campaignId&groupId', 'POST /api/payments/cash', 'POST /api/payments/orders/{id}/hand-over', 'POST /api/payments/order-campaigns/{id}/remind'], (_p, q) => screenKitCoach(q), { empty: ['Brak zamówień w Twoich grupach', ''], back: '/club/profile' }),
    R('/club/o/:token', 'M-19', 'Zamówienie z linku', 'member', ['GET /api/payments/order-links/{token}', 'POST /api/payments/order-links/{token}/orders'], (p, q) => screenKitToken(p, q), { persona: false }),
    R('/club/d/:token', 'M-14', 'Deklaracja z linku', 'member', ['GET /api/activities/declaration-links/{token}', 'POST /api/activities/declaration-links/{token}'], (p) => screenTokenDeclare(p), { persona: false }),
    R('/stripe', '—', 'Stripe Checkout (zewnętrzny)', 'bare', ['POST /api/payments/checkout → redirectUrl', 'webhook → payment_gateways.payment.captured'], (_p, q) => screenStripe(q)),
    R('/backend', 'B-01', 'Pulpit', 'backend', ['GET /api/activities/occurrences?unassigned=1', 'GET /api/activities/occurrences?unsettled=1', 'GET /api/payments/overdue', 'GET /api/facilities/rentals?status=pending_approval', 'GET /api/facilities/today'], () => screenDashboard()),
    R('/backend/club/settings', 'B-02', 'Ustawienia klubu', 'backend', ['GET/PUT /api/club_core/settings'], () => screenSettings()),
    R('/backend/club/publication', 'B-03', 'Publikacja', 'backend', ['GET/PUT /api/club_core/settings (publication)'], () => screenPublication()),
    R('/backend/club/sections', 'B-04', 'Sekcje', 'backend', ['GET /api/club_core/sections'], () => screenSections(), { empty: ['Klub nie ma jeszcze sekcji', 'Dodaj pierwszą sekcję.'] }),
    R('/backend/club/sections/:id', 'B-05', 'Sekcja', 'backend', ['GET/PUT /api/club_core/sections/{id}', 'POST/DELETE /api/people/role-assignments'], (p, q) => screenSection(p, q)),
    R('/backend/club/places', 'B-06', 'Miejsca', 'backend', ['/api/club_core/places'], () => screenPlacesAdmin()),
    R('/backend/club/institutions', 'B-07', 'Instytucje i umowy', 'backend', ['/api/club_core/institutions', '/api/club_core/contracts'], (_p, q) => screenInstitutions(q)),
    R('/backend/people/persons', 'B-09', 'Osoby', 'backend', ['GET /api/people/persons'], (_p, q) => screenPersons(q), { empty: ['Brak osób', 'Dodaj pierwszą osobę lub rodzinę.'] }),
    R('/backend/people/persons/:id', 'B-10', 'Karta osoby', 'backend', ['GET/PUT /api/people/persons/{id}', '/api/people/guardianships', '/api/people/role-assignments', 'POST /api/people/persons/{id}/account'], (p, q) => screenPerson(p, q)),
    R('/backend/groups/groups', 'B-11', 'Grupy', 'backend', ['GET /api/groups/groups'], (_p, q) => screenGroups(q)),
    R('/backend/groups/groups/:id', 'B-12', 'Grupa', 'backend', ['/api/groups/groups/{id}', '/api/groups/memberships'], (p, q) => screenGroup(p, q)),
    R('/backend/activities/activities', 'B-13', 'Aktywności', 'backend', ['GET /api/activities/activities'], () => screenActivities()),
    R('/backend/activities/create', 'B-14', 'Kreator aktywności', 'backend', ['POST /api/activities/activities/preview', 'POST /api/activities/activities'], () => screenActivityCreate()),
    R('/backend/activities/occurrences', 'B-15', 'Terminy', 'backend', ['GET /api/activities/occurrences', 'POST /api/activities/occurrences/{id}/coach', 'POST /api/activities/occurrences/{id}/cancel'], (_p, q) => screenOccurrences(q)),
    R('/backend/activities/units', 'B-16', 'Raport jednostek', 'backend', ['GET /api/activities/reports/coach-units?month&format=csv'], (_p, q) => screenUnits(q), { empty: ['Brak zamkniętych terminów w tym miesiącu', ''] }),
    R('/backend/activities/policies', 'B-17', 'Polityki deklaracji', 'backend', ['/api/activities/attendance-policies'], () => screenPolicies()),
    R('/backend/communication/threads', 'B-18', 'Wątki i sprawy', 'backend', ['GET/POST /api/communication/threads'], (_p, q) => screenThreadsAdmin(q)),
    R('/backend/communication/threads/:id', 'B-19', 'Wątek', 'backend', ['GET /api/communication/threads/{id}', 'POST …/replies', 'POST …/case'], (p) => screenThreadAdmin(p)),
    R('/backend/payments/fees', 'B-20', 'Cenniki i zniżki', 'backend', ['/api/payments/fees', '/api/payments/discount-rules'], () => screenFees()),
    R('/backend/payments/charges', 'B-21', 'Należności', 'backend', ['GET /api/payments/charges', 'GET /api/payments/overdue', 'POST /api/payments/charges/generate'], (_p, q) => screenCharges(q)),
    R('/backend/payments/bank', 'B-29', 'Wyciągi bankowe', 'backend', ['POST /api/payments/bank-imports (plik)', 'GET /api/payments/bank-transactions?status=', 'POST /api/payments/bank-transactions/{id}/confirm|assign|ignore|undo', 'POST /api/payments/cash'], (_p, q) => screenBank(q)),
    R('/backend/payments/orders', 'B-30', 'Zbiórki zamówień', 'backend', ['GET /api/payments/order-campaigns'], () => screenKitCampaigns(), { empty: ['Brak zbiórek', 'Utwórz formularz zamówień.'] }),
    R('/backend/payments/orders/create', 'B-31', 'Nowy formularz zamówień', 'backend', ['POST /api/payments/order-campaigns'], (p) => screenKitBuilder(p)),
    R('/backend/payments/orders/:id/edit', 'B-31', 'Edycja formularza zamówień', 'backend', ['GET/PUT /api/payments/order-campaigns/{id}'], (p) => screenKitBuilder(p)),
    R('/backend/payments/orders/:id', 'B-32', 'Zbiórka zamówień', 'backend', ['GET /api/payments/order-campaigns/{id}', 'GET /api/payments/orders?campaignId', 'GET /api/payments/order-campaigns/{id}/summary?format=csv', 'POST /api/payments/order-campaigns/{id}/open|close|mark-ordered|mark-delivered|complete', 'GET /api/payments/order-campaigns/{id}/share-text', 'POST /api/payments/orders/{id}/hand-over'], (p, q) => screenKitCampaignAdmin(p, q)),
    R('/backend/payments/cash-custody', 'B-33', 'Gotówka do rozliczenia', 'backend', ['GET /api/payments/cash-custody', 'POST /api/payments/cash-handovers', 'GET /api/payments/cash-handovers'], () => screenCashCustody(), { empty: ['Nic do rozliczenia', 'Cała przyjęta gotówka jest u skarbnika.'] }),
    R('/backend/payments/charges/:id', 'B-22', 'Należność', 'backend', ['GET /api/payments/charges/{id}', 'POST /api/payments/charges/{id}/payments', 'POST /api/payments/charges/{id}/cancel'], (p) => screenCharge(p)),
    R('/backend/facilities/calendar', 'B-23', 'Kalendarz obiektu', 'backend', ['GET /api/facilities/calendar', 'POST /api/facilities/rentals', 'POST /api/facilities/rentals/quote'], (p, q) => screenPlace({ id: q.get('place') || 'pl-boisko' }, q, true)),
    R('/backend/facilities/rentals', 'B-24', 'Wynajmy', 'backend', ['/api/facilities/rentals', 'POST …/{id}/confirm|cancel|move|no-show'], (_p, q) => screenRentals(q)),
    R('/backend/facilities/requests', 'B-25', 'Zgłoszenia do akceptacji', 'backend', ['GET /api/facilities/rentals?status=pending_approval', 'POST /api/facilities/rentals/{id}/approve', 'POST /api/facilities/rentals/{id}/reject'], () => screenRequests(), { empty: ['Brak zgłoszeń do akceptacji', ''] }),
    R('/backend/facilities/zones', 'B-26', 'Strefy, zamknięcia, cennik', 'backend', ['/api/facilities/zone-rules', '/api/facilities/closures', '/api/facilities/rental-rates'], (_p, q) => screenZones(q)),
    R('/backend/facilities/logs', 'B-27', 'Dziennik, incydenty, zakazy', 'backend', ['/api/facilities/logs', '/api/facilities/incidents', '/api/facilities/entry-bans'], (_p, q) => screenLogs(q)),
    R('/backend/facilities/report', 'B-28', 'Raport dla gminy', 'backend', ['GET /api/facilities/reports/owner?placeId&from&to&format=csv'], (_p, q) => screenOwnerReport(q)),
    R('/p/gwiazda', 'P-01', 'Strona klubu', 'public', ['GET /api/club_core/public/{clubSlug}'], () => screenClubPage(), { persona: false, empty: ['Klub nie opublikował jeszcze sekcji', ''] }),
    R('/p/gwiazda/sections/:slug', 'P-02', 'Strona sekcji', 'public', ['GET /api/club_core/public/{clubSlug}/sections/{sectionSlug}'], (p) => screenSectionPage(p), { persona: false, empty: ['Sekcja nie ma obecnie zajęć otwartych dla nowych osób', ''] }),
    R('/p/gwiazda/places', 'P-03', 'Obiekty', 'public', ['GET /api/facilities/public/{clubSlug}/places'], () => screenPublicPlaces(), { persona: false }),
    R('/p/gwiazda/places/:slug', 'P-04', 'Kalendarz obiektu', 'public', ['GET /api/facilities/public/{clubSlug}/places/{placeSlug}/schedule', 'POST …/places/{placeSlug}/requests'], (p, q) => screenPublicPlace(p, q), { persona: false, empty: ['W tym okresie obiekt nie ma opublikowanego harmonogramu', ''] }),
    R('/p/gwiazda/verify/:token', 'P-05', 'Potwierdzenie zgłoszenia', 'public', ['POST /api/facilities/public/requests/verify/{token}'], (p) => screenVerify(p), { persona: false }),
  ]
  // Funkcje ACL wymagane przez strony (requireFeatures w page.meta.ts).
  const ROUTE_FEATURES                         = {
    'M-08': 'payments.view_own', 'M-09': 'payments.view_own', 'M-11': 'facilities.view', 'M-12': 'facilities.log.write',
    'B-02': 'club_core.manage', 'B-03': 'club_core.publication.manage', 'B-04': 'club_core.view', 'B-05': 'club_core.view', 'B-06': 'club_core.manage', 'B-07': 'club_core.manage',
    'B-09': 'people.view', 'B-10': 'people.view', 'B-11': 'groups.view', 'B-12': 'groups.view', 'B-13': 'activities.manage', 'B-14': 'activities.manage', 'B-15': 'activities.view',
    'B-16': 'activities.reports.view', 'B-17': 'activities.manage', 'B-18': 'communication.cases.manage', 'B-19': 'communication.cases.manage',
    'B-20': 'payments.manage', 'B-21': 'payments.view', 'B-22': 'payments.view', 'B-29': 'payments.manage', 'M-15': 'payments.cash.record', 'M-16': 'payments.orders.place', 'M-17': 'payments.orders.place', 'M-18': 'payments.orders.collect', 'B-30': 'payments.orders.manage', 'B-31': 'payments.orders.manage', 'B-32': 'payments.orders.manage', 'B-33': 'payments.manage', 'B-23': 'facilities.view', 'B-24': 'facilities.rentals.manage', 'B-25': 'facilities.rentals.approve',
    'B-26': 'facilities.manage', 'B-27': 'facilities.log.write', 'B-28': 'facilities.reports.view',
  }
  for (const r of ROUTES) if (ROUTE_FEATURES[r.id]) r.feature = ROUTE_FEATURES[r.id]

  function match(path        )                                                             {
    for (const route of ROUTES) {
      const pp = route.pattern.split('/'), xp = path.split('/')
      if (pp.length !== xp.length) continue
      const params                         = {}
      let ok = true
      for (let i = 0; i < pp.length; i++) {
        if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(xp[i])
        else if (pp[i] !== xp[i]) { ok = false; break }
      }
      if (ok) return { route, params }
    }
    return null
  }

  // ═══════════════════════════════════════════════════════════════════
  // Powłoki
  // ═══════════════════════════════════════════════════════════════════
  function memberShell(route          , content        , path        )         {
    const loggedIn = personaId !== 'guest'
    const multi = isCoachPersona() && (hasMemberRole(me()) || can('backend'))
    const ctxSel = loggedIn && multi && path === '/club' ? `<label class="small">Kontekst ${sel('ctx', [['coach', isAdmin() || coordSections(me()).length ? 'jako trener / koordynator' : 'jako trener'], ['member', 'jako członek / opiekun']], coachCtx ? 'coach' : 'member', 'data-change="ctx"')}</label>` : ''
    const title = path === '/club' && loggedIn ? `Dzień dobry, ${personById(db, me()).first}` : route.name
    const tab = (href        , ico        , label        , active         )         => `<a href="#${href}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}><span class="ico" aria-hidden="true">${ico}</span>${label}</a>`
    // Płatności tylko dla osób pełnoletnich (payments.view_own); niepełnoletni uczestnik ma 4 zakładki.
    const fourth = can('payments.view_own') ? tab('/club/payments', '¤', 'Płatności', path.startsWith('/club/payments') || path.startsWith('/club/orders')) : can('facilities.view') ? tab('/club/places', '⌂', 'Obiekty', path.startsWith('/club/places')) : ''
    const tabList = [tab('/club', '◉', 'Dziś', path === '/club'), tab('/club/calendar', '▦', 'Kalendarz', path.startsWith('/club/calendar') || path.startsWith('/club/occurrences')), tab('/club/messages', '✉', 'Wiadomości', path.startsWith('/club/messages')), fourth, tab('/club/profile', '≡', 'Więcej', path.startsWith('/club/profile') || path.startsWith('/club/facility') || path.startsWith('/club/coach') || (can('payments.view_own') && path.startsWith('/club/places')))].filter(Boolean)
    const tabs = loggedIn && route.persona !== false ? `<nav class="tabbar" aria-label="Nawigacja" style="grid-template-columns:repeat(${tabList.length},1fr)">${tabList.join('')}</nav>` : ''
    return `<div class="phone"><header class="phone-header"><div class="row">${route.back ? `<a class="back" href="#${route.back}">‹ Wróć</a>` : '<span></span>'}<span class="row small muted" style="gap:6px">${logoBox(db.settings.logo, 'Logo klubu', 20)}${esc(db.settings.name)}</span></div><div class="row"><h1 class="phone-title">${esc(title)}</h1>${ctxSel}</div></header>
      <div class="phone-body" id="phone-body">${content}${apiFoot(route)}</div>${tabs}</div>`
  }

  function backendShell(route          , content        , path        )         {
    const groups                                                  = [
      ['', [['Pulpit', '/backend', 'backend']]],
      ['Klub', [['Sekcje', '/backend/club/sections', 'club_core.view'], ['Miejsca', '/backend/club/places', 'club_core.manage'], ['Instytucje i umowy', '/backend/club/institutions', 'club_core.manage'], ['Ustawienia', '/backend/club/settings', 'club_core.manage'], ['Publikacja', '/backend/club/publication', 'club_core.publication.manage']]],
      ['Ludzie', [['Osoby', '/backend/people/persons', 'people.view']]],
      ['Zajęcia', [['Grupy', '/backend/groups/groups', 'groups.view'], ['Aktywności', '/backend/activities/activities', 'activities.manage'], ['Terminy', '/backend/activities/occurrences', 'activities.view', db.occurrences.filter((o) => o.status === 'planned' && !o.coach && o.date >= TODAY).length], ['Raport jednostek', '/backend/activities/units', 'activities.reports.view'], ['Polityki deklaracji', '/backend/activities/policies', 'activities.manage']]],
      ['Komunikacja', [['Wątki i sprawy', '/backend/communication/threads', 'communication.cases.manage']]],
      ['Finanse', [['Cenniki i zniżki', '/backend/payments/fees', 'payments.manage'], ['Należności', '/backend/payments/charges', 'payments.view'], ['Wyciągi bankowe', '/backend/payments/bank', 'payments.manage', db.bankTx.filter((t) => t.status === 'suggested' || t.status === 'unmatched').length], ['Zbiórki zamówień', '/backend/payments/orders', 'payments.orders.manage', db.kitCampaigns.filter((c) => ['open', 'closed', 'ordered', 'delivered'].includes(c.status)).length], ['Gotówka do rozliczenia', '/backend/payments/cash-custody', 'payments.manage', custodians().length]]],
      ['Obiekt', [['Kalendarz', '/backend/facilities/calendar', 'facilities.view'], ['Wynajmy', '/backend/facilities/rentals', 'facilities.rentals.manage'], ['Zgłoszenia', '/backend/facilities/requests', 'facilities.rentals.approve', db.rentals.filter((r) => r.status === 'pending_approval').length], ['Strefy i cennik', '/backend/facilities/zones', 'facilities.manage'], ['Dziennik i incydenty', '/backend/facilities/logs', 'facilities.log.write'], ['Raport dla gminy', '/backend/facilities/report', 'facilities.reports.view']]],
    ]
    const nav = groups.map(([g, items]) => { const vis = items.filter(([, , f]) => can(f)); return vis.length ? `<div class="nav-group">${g ? `<span>${g}</span>` : ''}${vis.map(([l, h, , n]) => `<a href="#${h}" class="${path === h || (h !== '/backend' && path.startsWith(h)) ? 'active' : ''}">${l}${n ? `<span class="count">${n}</span>` : ''}</a>`).join('')}</div>` : '' }).join('')
    return `<div class="backend"><aside class="sidebar"><div class="club">${logoBox(db.settings.logo, 'Logo klubu', 28)}<span>${esc(db.settings.name)}</span></div><nav aria-label="Menu panelu">${nav}</nav></aside>
      <div class="main"><div class="topbar"><span class="crumbs">Panel › ${esc(route.name)}</span><div class="row small">${hasMemberRole(me()) || isCoachPersona() ? link('Interfejs członkowski', '/club', 'btn sm') : ''}<span>${esc(persona().label)}</span></div></div><div class="page">${content}${apiFoot(route)}</div></div></div>`
  }

  function publicShell(route          , content        , path        )         {
    return `<div class="public"><header class="public-head"><a href="#/p/gwiazda" style="text-decoration:none;font-weight:700;display:flex;gap:8px;align-items:center">${logoBox(db.settings.logo, 'Logo klubu', 32)}${esc(db.settings.name)}</a>
      <nav aria-label="Strona klubu"><a href="#/p/gwiazda" class="${path === '/p/gwiazda' ? 'active' : ''}">Klub</a><a href="#/p/gwiazda/sections/akademia" class="${path.includes('/sections/') ? 'active' : ''}">Sekcje</a>${pub().places_calendar ? `<a href="#/p/gwiazda/places" class="${path.includes('/places') ? 'active' : ''}">Obiekty</a>` : ''}<a href="#/login">Zaloguj</a></nav></header>
      <div class="public-body">${content}${apiFoot(route)}</div><footer class="public-foot"><span>${esc(db.settings.name)} · tel. ${esc(db.settings.phone)}</span><a href="#" data-action="todo" data-what="Regulamin klubu (attachments)">Regulamin</a><a href="#" data-action="todo" data-what="Polityka prywatności (/privacy, moduł content)">Polityka prywatności</a></footer></div>`
  }

  const apiFoot = (route          )         => `<div class="api-foot"><b>${esc(route.id)}</b> · API: ${route.api.map((a) => `<code>${esc(a)}</code>`).join('')}</div>`

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════
  function currentPath()                            {
    const h = decodeURIComponent(location.hash.slice(1)) || persona().home
    const [path, query] = h.split('?')
    return [path, new URLSearchParams(query || '')]
  }

  function render()       {
    const [path, q] = currentPath()
    if (path === '/mail') { drawer = 'mail'; history.replaceState(null, '', `#${persona().home}`); render(); return }
    // P-05: wejście z linku z e-maila potwierdza zgłoszenie (POST …/verify/{token}).
    const vm = path.match(/^\/p\/gwiazda\/verify\/(.+)$/)
    if (vm) {
      const r = db.rentals.find((x) => x.token === vm[1])
      if (r && r.status === 'pending_verification') {
        if (conflicts(r.place, r.date, toMin(r.start), toMin(r.end), { ignore: r.id, pendingBlocks: true }).length) r.status = 'superseded'
        else { r.status = 'pending_approval'; r.holdUntil = '2026-11-12 15:30' }
      }
    }
    const m = match(path)
    const chromeEl = document.getElementById('chrome')               
    const stage = document.getElementById('stage')               
    if (!m) { stage.className = 'stage'; stage.innerHTML = `<div class="public"><div class="public-body">${empty('Nie znaleziono ekranu (404)', path, link('Start', persona().home))}</div></div>`; renderChrome(null); return }
    const { route, params } = m
    renderChrome(route)
    const shell = route.shell
    // Ekrany wymagające zalogowania
    let content        
    const guestOk = !!route.guestOk && personaId === 'guest'
    if (route.persona !== false && !guestOk && personaId === 'guest' && shell !== 'public') content = `<div class="alert info"><strong>Zaloguj się</strong>Ten ekran wymaga konta.</div>${screenLogin()}`
    else if (shell === 'backend' && !can('backend') && !isAdmin()) content = `<div class="alert error" role="alert"><strong>Brak uprawnień (403)</strong>Ta osoba nie ma dostępu do panelu.</div>`
    else if (route.feature && !guestOk && !can(route.feature)) content = `<div class="alert error" role="alert"><strong>Brak uprawnień (403)</strong>Ekran wymaga funkcji <code>${esc(route.feature)}</code>, której ta osoba nie ma.</div>`
    else if (demoState === 'loading' || transientLoading) content = skeleton(shell)
    else if (demoState === 'error') content = errorView()
    else if (demoState === 'empty') { const e = route.empty || ['Brak danych', 'Ten ekran nie ma osobnego stanu pustego — zobacz dokumentację ekranu.']; content = empty(e[0], e[1], '', '○') }
    else content = route.render(params, q)
    stage.className = `stage ${shell === 'member' ? 'member' : ''}`
    const scroll = (document.getElementById('phone-body')                      )?.scrollTop || 0
    stage.innerHTML = shell === 'member' ? memberShell(route, content, path) : shell === 'backend' ? backendShell(route, content, path) : shell === 'public' ? publicShell(route, content, path) : content
    const pb = document.getElementById('phone-body'); if (pb && !navigated) pb.scrollTop = scroll
    navigated = false
    renderDrawer()
    document.title = `${route.id} ${route.name} — Vereino mockup`
  }
  let navigated = false

  function renderChrome(route                 )       {
    const el = document.getElementById('chrome')               
    const [path] = currentPath()
    el.innerHTML = `<header class="chrome"><div class="chrome-row"><span class="brand">Vereino · mockupy v0.1</span>
      <label>Osoba ${sel('persona', PERSONAS.map((p) => [p.id, `${p.label} — ${p.role}`]), personaId, 'data-change="persona" id="persona-select"')}</label>
      <label>Stan ekranu ${sel('demo', [['normal', 'Normalny'], ['loading', 'Ładowanie'], ['empty', 'Pusty'], ['error', 'Błąd']], demoState, 'data-change="demo"')}</label>
      <span class="spacer"></span>
      <button type="button" data-action="drawer" data-which="flows">Ścieżki</button><button type="button" data-action="drawer" data-which="screens">Ekrany</button><button type="button" data-action="drawer" data-which="mail">Skrzynka (${db.mails.length})</button>
      <button type="button" data-action="theme">Motyw</button><button type="button" data-action="reset">Resetuj dane</button></div>
      <div class="chrome-row">${route ? `<span class="screen-id">${esc(route.id)}</span><span>${esc(route.name)}</span><code>${esc(path)}</code><span class="api-list">Dziś w demo: ${esc(dLong(TODAY))}, ${NOW}</span>` : '<span>Nieznany ekran</span>'}</div></header>`
  }

  function renderDrawer()       {
    const host = document.getElementById('drawer')               
    if (!drawer) { host.innerHTML = ''; return }
    let title = '', body = ''
    if (drawer === 'flows') { title = 'Ścieżki (przepływy F-01…F-13)'; body = FLOWS.map((f) => `<div class="flow"><h3>${f.id} ${esc(f.title)}</h3><ol>${f.steps.map(([pp, href, l]) => `<li><a href="#" data-action="goto" data-persona="${pp}" data-href="${href}">${esc(l)}</a> <span class="small muted">— ${esc((PERSONAS.find((x) => x.id === pp)           ).label.split(' ')[0])}</span></li>`).join('')}</ol></div>`).join('') }
    if (drawer === 'screens') { title = 'Ekrany'; const groups                     = [['M', 'Członkowskie (telefon)'], ['B', 'Panel'], ['P', 'Publiczne']]; body = groups.map(([k, l]) => `<div class="section-title">${l}</div><ul class="list">${ROUTES.filter((r) => r.id.startsWith(k)).map((r) => { const sample = r.pattern.replace(':id', r.id === 'M-04' || r.id === 'M-05' ? 'a-orlm-2026-11-10' : r.id === 'M-07' ? 't-orlm' : r.id === 'M-11' ? 'pl-boisko' : r.id === 'B-05' ? 's-akad' : r.id === 'B-10' ? 'p-kasia' : r.id === 'B-12' ? 'g-orlm' : r.id === 'B-19' ? 't-uwagi' : r.id === 'M-17' || r.id === 'B-31' || r.id === 'B-32' ? 'oc-akad' : r.id === 'B-22' ? (db.charges[0] || { id: '' }).id : 'x').replace(':token', r.id === 'M-14' ? 'tok-expired' : r.id === 'M-19' ? 'kit-robert' : 'expired').replace(':slug', r.id === 'P-02' ? 'basen' : 'orlik-boisko'); const pp            = k === 'P' ? 'guest' : k === 'B' ? 'aneta' : r.id === 'M-12' ? 'tomek' : r.id === 'M-18' ? 'wojtek' : r.id === 'M-19' ? 'guest' : r.id === 'M-15' ? 'aneta' : r.id === 'M-05' || r.id === 'M-11' ? 'wojtek' : 'kasia'; return `<li><a href="#" data-action="goto" data-persona="${pp}" data-href="${sample}"><b>${r.id}</b> ${esc(r.name)}</a> <code class="small">${esc(r.pattern)}</code></li>` }).join('')}</ul>`).join('') }
    if (drawer === 'mail') { title = `Skrzynka testowa (${db.mails.length})`; body = db.mails.length ? db.mails.map((m) => `<div class="mail"><div class="small muted">Do: ${esc(m.to)}</div><div class="subj">${esc(m.subject)}</div><pre>${esc(m.body)}</pre>${m.link ? `<a class="btn sm primary" href="#" data-action="mail-link" data-href="${m.link}">${esc(m.linkLabel || 'Otwórz link')}</a>` : ''}</div>`).join('') : empty('Skrzynka jest pusta', 'Tu pojawią się e-maile wysłane przez system: zaproszenia, linki, potwierdzenia, decyzje.') }
    host.innerHTML = `<aside class="drawer" aria-label="${esc(title)}"><div class="drawer-head"><h2>${esc(title)}</h2><button type="button" class="btn sm" data-action="drawer-close" aria-label="Zamknij">✕</button></div><div class="drawer-body">${body}</div></aside>`
  }

  function go(href        )       { navigated = true; transientLoading = demoState === 'normal'; if (location.hash === `#${href}`) render(); else location.hash = href; setTimeout(() => { transientLoading = false; render() }, 260) }
  function setPersona(id           )       { personaId = id; coachCtx = true; try { sessionStorage.setItem('vereino.persona', id) } catch { /* */ } }

  // ═══════════════════════════════════════════════════════════════════
  // Akcje
  // ═══════════════════════════════════════════════════════════════════
  const required = (fd          , names          , errs        )       => { for (const n of names) if (!String(fd.get(n) || '').trim()) errs[n] = 'Pole wymagane' }
  const emailOk = (v        )          => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
  const phoneOk = (v        )          => /^(\+48)?[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}$|^\d{2}\s?\d{3}\s?\d{2}\s?\d{2}$/.test(v.trim())

  const ACTIONS                                                       = {
    retry: () => { demoState = 'normal'; render() },
    nav: (el) => go(el.dataset.href          ),
    goto: (el, ev) => { ev.preventDefault(); setPersona(el.dataset.persona             ); drawer = null; go(el.dataset.href          ) },
    'mail-link': (el, ev) => { ev.preventDefault(); drawer = null; go(el.dataset.href          ) },
    drawer: (el) => { const w = el.dataset.which                 ; drawer = drawer === w ? null : w; renderDrawer() },
    'drawer-close': () => { drawer = null; renderDrawer() },
    availability: (el) => availabilityModal(el.dataset.place          ),
    cash: (el) => { ui.cashPayer = el.dataset.payer || ''; openModal({ title: 'Przyjmij gotówkę', submitLabel: 'Przyjmij gotówkę', wide: true, body: cashForm(el.dataset.payer || '', true, el.dataset.charge || ''), onSubmit: (fd) => { const res = recordCash(fd); if (res) return res; render() } }) },
    'bank-sample': () => { const imp = importStatement('wyciag_2026-11-09.csv (przykład)', sampleStatement()); toast(`Zaimportowano ${imp.total} pozycji: automatycznie ${imp.booked}, do potwierdzenia ${imp.suggested}, niedopasowane ${imp.unmatched}, pominięte ${imp.skipped}.`); go('/backend/payments/bank?view=suggested') },
    'kit-share': (el) => kitShareModal(el.dataset.id          ),
    'kit-template': () => kitDraftEdit((d) => {
      d.products = kitTemplate()
      if (!d.name) d.name = 'Stroje Akademii — zima 2026'
      if (!d.description) d.description = KIT_DESC
      d.printName = true; d.printNumber = true; d.notesLabel = 'Dodatkowe prośby (np. strój bramkarski, ochraniacze, rękawice)'
      if (!d.groups.length) d.groups = db.groups.filter((g) => g.section === d.section).map((g) => g.id)
    }),
    'kit-add-product': () => kitDraftEdit((d) => { d.products.push({ id: uid('kp'), name: '', kind: 'item', sizesChild: [], sizesAdult: [], priceChild: 0, required: false }) }),
    'kit-remove-product': (el) => kitDraftEdit((d) => {
      const x = d.products[Number(el.dataset.i)]
      d.products = d.products.filter((y) => y !== x)
      for (const y of d.products) if (y.components) y.components = y.components.filter((id) => id !== x.id)
    }),
    'kit-all-groups': () => { document.querySelectorAll('[data-form="kit-campaign"] input[name="groups"]').forEach((i) => { (i                    ).checked = true; (i.closest('.chip')               ).classList.add('on') }) },
    'kit-status': (el) => {
      const c = kitCampaign(el.dataset.id          )               
      const to = el.dataset.to                         
      const os = kitOrders(c)
      const msgs                         = { open: 'Zbieranie otwarte — wyślij rodzicom link.', closed: 'Zamówienia zamknięte — rodzice nie mogą już zamawiać ani zmieniać.', ordered: 'Oznaczono: zamówione u dostawcy.', delivered: `Oznaczono dostawę — ${os.length} opiekunów dostało e-mail „do odbioru u trenera”.`, completed: 'Zbiórka zakończona.' }
      const apply = ()       => {
        c.status = to
        if (to === 'delivered') for (const o of os) { const ch = chargeById(o.chargeId); mail(o.email, `Stroje do odbioru — ${c.name}`, `Stroje dla ${pName(o.child)} dotarły. Odbierz je u trenera na najbliższym treningu.${ch.status !== 'paid' ? ` Do zapłaty pozostało ${zl(remaining(ch))}.` : ''}`, `/club/orders/${c.id}`, 'Zobacz zamówienie') }
        toast(msgs[to]); render()
        if (to === 'open') setTimeout(() => kitShareModal(c.id), 50)
      }
      const missing = c.groups.flatMap((g) => group(g).members.filter((m) => !kitOrderOf(c, m))).length
      if (to === 'closed') openModal({ title: 'Zamknąć zamówienia?', submitLabel: 'Zamknij zamówienia', body: `<p>Rodzice nie będą mogli już składać ani zmieniać zamówień. ${missing ? `<b>${missing} dzieci</b> z wybranych grup nie ma zamówienia.` : 'Wszystkie dzieci mają zamówienia.'} Należności zostają otwarte do ${dShort(c.payDue)}.</p><p class="small muted">Po ${dShort(c.closes)} system zamyka zamówienia sam.</p>`, onSubmit: () => apply() })
      else if (to === 'completed' && os.some((o) => !o.handedAt)) openModal({ title: 'Zakończyć zbiórkę?', danger: true, submitLabel: 'Zakończ mimo to', body: `<div class="alert warning"><strong>${os.filter((o) => !o.handedAt).length} strojów nie oznaczono jako wydane</strong>Po zakończeniu trenerzy nie zobaczą już tej zbiórki. Nieopłacone należności zostają otwarte.</div>`, onSubmit: () => apply() })
      else apply()
    },
    'kit-cash': (el) => {
      const o = db.kitOrders.find((x) => x.id === el.dataset.order)            
      const c = kitCampaign(o.campaign)               
      const ch = chargeById(o.chargeId)
      if (!isAdmin() && !kitScope(me()).includes(kitGroupOf(c, o.child))) { toast('Dziecko spoza Twoich grup (403).', true); return }
      openModal({ title: `Gotówka: ${pName(o.child)}`, submitLabel: 'Przyjmij gotówkę', body: `<p class="small">${esc(ch.description)} — do zapłaty <b>${zl(remaining(ch))}</b>. Płaci: ${esc(pName(o.by))}.</p>
        <div class="fields">${fld('amount', 'Kwota (zł)', inp('amount', 'number', String(remaining(ch) / 100), 'step="0.01" min="0.01"'), { req: true, hint: 'Mniejsza kwota = wpłata częściowa' })}${fld('date', 'Data', inp('date', 'date', TODAY), { req: true })}</div>
        ${chk('notify', 'Wyślij płatnikowi potwierdzenie e-mail', true)}<p class="small muted">Przyjmuje: <b>${esc(pName(me()))}</b>. ${isAdmin() ? 'Gotówka trafia od razu do kasy klubu.' : 'Gotówka jest u Ciebie do rozliczenia ze skarbnikiem.'}</p>`,
        onSubmit: (fd) => {
          const amt = Math.round(Number(fd.get('amount')) * 100)
          if (!(amt > 0)) return { amount: 'Kwota musi być większa od zera.' }
          if (amt > remaining(ch)) return { amount: `Kwota przekracza należność (${zl(remaining(ch))}) — 422.` }
          if (String(fd.get('date')) > TODAY) return { date: 'Data nie może być z przyszłości.' }
          const receipt = `KP/2026/11/${String(++db.receiptSeq).padStart(3, '0')}`
          ch.payments.push({ amount: amt, method: 'gotówka', date: String(fd.get('date')), by: me(), receipt, settled: isAdmin() ? 'kasa klubu' : undefined })
          ch.status = remaining(ch) <= 0 ? 'paid' : 'partially_paid'
          if (fd.get('notify')) mail(o.email, `Potwierdzenie wpłaty gotówkowej ${receipt}`, `Przyjęto ${zl(amt)} gotówką za: ${ch.description}. Przyjął(a): ${pName(me())}.${ch.status !== 'paid' ? ` Pozostało ${zl(remaining(ch))}.` : ''}`)
          toast(`Przyjęto ${zl(amt)} — potwierdzenie ${receipt}${fd.get('notify') ? ', e-mail wysłany' : ''}.`); render()
        } })
    },
    'kit-hand': (el) => {
      const o = db.kitOrders.find((x) => x.id === el.dataset.order)            
      const c = kitCampaign(o.campaign)               
      if (c.status !== 'delivered') { toast('Stroje jeszcze nie dotarły — wydanie jest możliwe po oznaczeniu dostawy (409).', true); return }
      const ch = chargeById(o.chargeId)
      const done = ()       => { o.handedAt = `${TODAY.slice(8)}.${TODAY.slice(5, 7)} ${NOW}`; o.handedBy = me(); toast(`Wydano strój: ${pName(o.child)}.`); render() }
      if (ch.status !== 'paid') openModal({ title: 'Wydać nieopłacony strój?', danger: true, submitLabel: 'Wydaj mimo braku wpłaty', body: `<div class="alert warning"><strong>Do zapłaty pozostało ${zl(remaining(ch))}</strong>Należność zostaje otwarta (termin ${dShort(ch.due)}), a opiekun dostanie przypomnienie po terminie. Wydanie zapisze się z Twoim nazwiskiem.</div>`, onSubmit: () => done() })
      else done()
    },
    'kit-remind': (el) => {
      const c = kitCampaign(el.dataset.c          )               
      const kids = (el.dataset.group ? [el.dataset.group] : c.groups).flatMap((g) => group(g).members.filter((m) => !kitOrderOf(c, m)))
      const gs = [...new Set(kids.flatMap((k) => db.guardianships.filter((x) => x.ward === k).map((x) => x.guardian)))].filter((g) => personById(db, g).email)
      for (const g of gs) mail(personById(db, g).email          , `Przypomnienie: ${c.name}`, `Zamówienia zbieramy do ${dShort(c.closes)}. Zamów w aplikacji klubu albo poproś o osobisty link.`, `/club/orders/${c.id}`, 'Przejdź do zamówienia')
      toast(`Wysłano przypomnienie do ${gs.length} opiekunów (${kids.length} dzieci bez zamówienia).`)
    },
    'kit-cancel-order': (el) => {
      const o = db.kitOrders.find((x) => x.id === el.dataset.order)            
      const ch = chargeById(o.chargeId)
      if (paidOf(ch) > 0) { toast(`Wpłacono już ${zl(paidOf(ch))} — anulowanie i zwrot uzgodnij z klubem (409).`, true); return }
      openModal({ title: 'Anulować zamówienie?', danger: true, submitLabel: 'Anuluj zamówienie', body: `<p>Zamówienie dla: ${esc(personById(db, o.child).first)} zostanie anulowane, a należność ${zl(ch.amount)} zamknięta. Do ${dShort((kitCampaign(o.campaign)               ).closes)} możesz złożyć nowe.</p>`, onSubmit: () => { o.status = 'cancelled'; ch.status = 'cancelled'; toast('Anulowano zamówienie.'); render() } })
    },
    'cash-settle': (el) => {
      const person = el.dataset.person          
      const items = custodyOf(person)
      openModal({ title: `Rozliczenie gotówki: ${pName(person)}`, submitLabel: 'Potwierdzam odbiór gotówki', wide: true, body: `<p class="small">Zaznacz wpłaty, których gotówkę właśnie otrzymujesz. Rozliczenie dostanie numer i zniknie z listy „u przyjmującego”.</p><div class="field" data-field="pays"><span>Wpłaty <b class="req">*</b></span>${items.map((it, i) => `<label class="check"><input type="checkbox" name="pays" value="${i}" checked><span>${esc(it.x.receipt || '—')} · ${esc(it.c.description)} · ${dShort(it.x.date)} — <b>${zl(it.x.amount)}</b></span></label>`).join('')}</div>`,
        onSubmit: (fd) => {
          const idx = fd.getAll('pays').map(Number)
          if (!idx.length) return { pays: 'Zaznacz co najmniej jedną wpłatę.' }
          const number = `RG/2026/11/${String(db.cashHandovers.length + 1).padStart(3, '0')}`
          const amount = idx.reduce((a, i) => a + items[i].x.amount, 0)
          for (const i of idx) items[i].x.settled = number
          db.cashHandovers.unshift({ id: uid('rg'), number, collector: person, at: `${TODAY} ${NOW}`, by: me(), amount, count: idx.length })
          toast(`Przyjęto rozliczenie ${number}: ${zl(amount)} od ${pName(person)}.`); render()
        } })
    },
    'tx-confirm': (el) => { const t = db.bankTx.find((x) => x.id === el.dataset.id)          ; bookTx(t); t.auto = false; toast(`Zaksięgowano ${zl(t.amount)} — ${pName(t.payer)}.`); render() },
    'tx-ignore': (el) => { const t = db.bankTx.find((x) => x.id === el.dataset.id)          ; openModal({ title: 'Pomiń przelew', submitLabel: 'Pomiń', body: `<p class="small">${esc(t.sender)} — ${zl(t.amount)} „${esc(t.title)}”. Przelew nie będzie rozliczany jako składka (np. darowizna, dotacja, zwrot).</p>${fld('reason', 'Powód', sel('reason', [['darowizna', 'darowizna'], ['dotacja / grant', 'dotacja / grant'], ['zwrot', 'zwrot'], ['inne', 'inne']]))}`, onSubmit: (fd) => { t.status = 'ignored'; t.reason = `Pominięty: ${String(fd.get('reason'))}`; toast('Pominięto przelew.'); render() } }) },
    'tx-undo': (el) => { const t = db.bankTx.find((x) => x.id === el.dataset.id)          ; if (t.status === 'booked') unbookTx(t); matchTx(t); if (t.status === 'booked') t.status = 'suggested'; t.auto = false; toast('Cofnięto — przelew wrócił do potwierdzenia.'); render() },
    'tx-assign': (el) => {
      const t = db.bankTx.find((x) => x.id === el.dataset.id)          
      const ps = payers().sort((a, b) => personById(db, a).last.localeCompare(personById(db, b).last, 'pl'))
      openModal({ title: `Przypisz przelew ${zl(t.amount)}`, submitLabel: 'Przypisz i zaksięguj', wide: true, body: `<p class="small"><b>${esc(t.sender)}</b> — „${esc(t.title)}”, ${dShort(t.date)}</p>${fld('payer', 'Płatnik', sel('payer', [['', '— wybierz —'], ...ps.map((x) => [x, `${personById(db, x).last} ${personById(db, x).first} (${payerCode(x)}) · otwarte ${zl(openOf(x).reduce((a, c) => a + remaining(c), 0))}`]                    )], t.payer || ''), { req: true, hint: 'Kwota zostanie rozdzielona od najstarszej otwartej należności; nadwyżka zostanie pokazana jako nadpłata.' })}`,
        onSubmit: (fd) => { const pid = String(fd.get('payer') || ''); if (!pid) return { payer: 'Wybierz płatnika.' }; if (!openOf(pid).length) return { payer: 'Ten płatnik nie ma otwartych należności.' }; t.payer = pid; t.alloc = []; let left = t.amount; for (const c of openOf(pid)) { if (left <= 0) break; const a = Math.min(left, remaining(c)); t.alloc.push({ chargeId: c.id, amount: a }); left -= a } bookTx(t); t.auto = false; t.reason = `Przypisano ręcznie${left > 0 ? ` — nadpłata ${zl(left)} do wyjaśnienia` : ''}`; toast(`Przypisano i zaksięgowano ${zl(t.amount - left)}.${left > 0 ? ` Nadpłata ${zl(left)}.` : ''}`); render() } })
    },
    'avail-days': (el) => { const set = (el.dataset.set || '').split(',').filter(Boolean); document.querySelectorAll('#modal input[name="days"]').forEach((i) => { const c = i                    ; c.checked = set.includes(c.value); (c.closest('.chip')               ).classList.toggle('on', c.checked) }) },
    'availability-clear-day': (el) => { const pid = el.dataset.place          , d = Number(el.dataset.day); for (const rule of db.zones[pid]) if (rule.zone === 'reservable_paid') rule.days = rule.days.filter((x) => x !== d); db.zones[pid] = db.zones[pid].filter((rule) => rule.days.length); toast(`Usunięto dostępność do rezerwacji: ${DAY_LONG[d % 7]}.`); render() },
    'logo-remove': (el) => { const t = el.dataset.target          ; if (t === 'club') { db.settings.logo = undefined; toast('Usunięto logo klubu — wyświetlany jest inicjał nazwy.') } else { section(t).logo = undefined; toast('Usunięto logo sekcji — wyświetlane jest logo klubu.') } render() },
    'copy-csv': () => { const ta = document.getElementById('csv-text')                       ; const fallback = ()       => { ta.focus(); ta.select(); toast('Zaznaczono — naciśnij Ctrl+C.') }; try { navigator.clipboard.writeText(ta.value).then(() => toast('Skopiowano CSV.'), fallback) } catch { fallback() } },
    theme: () => { const cur = document.documentElement.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); const t = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try { localStorage.setItem('vereino.theme', t) } catch { /* */ } },
    reset: () => { db = seed(); for (const k of Object.keys(ui)) delete ui[k]; toast('Przywrócono dane początkowe.'); render() },
    'close-modal': () => closeModal(),
    overlay: (el, ev) => { if (ev.target === el) closeModal() },
    todo: (el, ev) => { ev.preventDefault(); toast(`W mockupie pominięte: ${el.dataset.what || 'akcja'} — opis w README.`) },
    logout: () => { setPersona('guest'); go('/login') },
    'fill-login': (el, ev) => { ev.preventDefault(); const f = document.querySelector('[data-form="login"]')                   ; (f.elements.namedItem('email')                    ).value = el.dataset.email          ; (f.elements.namedItem('password')                    ).value = 'demo1234'; (f.elements.namedItem('password')                    ).focus() },
    declare: (el) => declare(el.dataset.occ          , el.dataset.person          , el.dataset.val                ),
    'guardian-decide': (el) => {
      const a = db.attendance[el.dataset.occ          ][el.dataset.person          ]
      a.status = el.dataset.val === 'yes' ? 'final' : 'rejected_by_guardian'
      toast(el.dataset.val === 'yes' ? 'Potwierdzono deklarację.' : 'Deklaracja odrzucona — uczestniczka dostała powiadomienie.'); render()
    },
    absence: (el) => {
      const o = occById(el.dataset.occ          )              
      openModal({ title: 'Zgłoś nieobecność', submitLabel: 'Zgłoś', body: `<p class="small">${esc(o.name)}, ${dShort(o.date)} ${o.start}. Termin trafi na listę „Do obsadzenia”, a koordynator sekcji dostanie powiadomienie.</p>${fld('reason', 'Powód (opcjonalnie)', area('reason', '', 'maxlength="200"'))}`,
        onSubmit: (fd) => { db.substitutions.push({ occ: o.id, prev: o.coach, next: null, kind: 'absence_reported', at: `${TODAY} ${NOW}`, by: me(), reason: String(fd.get('reason') || '') }); o.coach = null; o.updatedAt++; toast('Zgłoszono nieobecność — koordynator dostał powiadomienie.'); render() } })
    },
    'cancel-occ': (el) => {
      const o = occById(el.dataset.occ          )              
      openModal({ title: 'Odwołaj termin', danger: true, submitLabel: 'Odwołaj termin', body: `<div class="alert warning"><strong>${esc(o.name)}, ${dShort(o.date)} ${o.start}</strong>Uczestnicy, opiekunowie i prowadzący dostaną powiadomienie w aplikacji i e-mail.</div>${fld('reason', 'Powód', area('reason', '', 'maxlength="200"'), { req: true, hint: '3–200 znaków, np. „Ulewa — boisko zalane”' })}`,
        onSubmit: (fd) => {
          const reason = String(fd.get('reason') || '').trim()
          if (reason.length < 3) return { reason: 'Podaj powód (co najmniej 3 znaki).' }
          o.status = 'cancelled'; o.cancelReason = reason; o.updatedAt++
          const g = group(o.group)
          const recips = [...new Set([...g.members.flatMap((m) => { const p = personById(db, m); return ageOn(p.birth) >= 13 && p.account ? [m] : [] }), ...g.members.flatMap((m) => db.guardianships.filter((x) => x.ward === m).map((x) => x.guardian)), ...g.coaches])]
          db.threads.unshift({ id: uid('t'), scope: 'occurrence', scopeId: o.id, scopeLabel: `Termin: ${o.name}, ${dShort(o.date)}`, subject: `Odwołany: ${o.name}, ${dShort(o.date)} ${o.start}`, isCase: false, readBy: [me()], messages: [{ id: uid('m'), author: me(), role: 'trener', body: `Termin ${dShort(o.date)} ${o.start} jest odwołany. Powód: ${reason}.`, at: `${TODAY} ${NOW}`, delivered: recips.length, failed: 0 }] })
          mail('kasia.nowak@example.pl', `Odwołane: ${o.name}, ${dShort(o.date)} ${o.start}`, `Powód: ${reason}\n\nSzczegóły w aplikacji klubu.`, '/club/messages', 'Otwórz wiadomości')
          toast(`Termin odwołany — powiadomiono ${recips.length} osób (w aplikacji + e-mail).`); render()
        } })
    },
    mark: (el) => {
      const occ = el.dataset.occ          , p = el.dataset.person          
      db.attendance[occ] ||= {}
      db.attendance[occ][p] = { ...(db.attendance[occ][p] || { declared: 'unknown', status: 'final' }), actual: el.dataset.val              }
      render()
    },
    'mark-declared': (el) => {
      const occ = el.dataset.occ          
      const g = group((occById(occ)              ).group)
      db.attendance[occ] ||= {}
      for (const m of g.members) { const a = db.attendance[occ][m]; if (a?.declared === 'yes' && !a.actual) a.actual = 'present' }
      toast('Zaznaczono obecność zadeklarowanych.'); render()
    },
    'complete-occ': (el) => {
      const o = occById(el.dataset.occ          )              
      const att = db.attendance[o.id] || {}
      const missing = group(o.group).members.filter((m) => !att[m]?.actual).length
      openModal({ title: 'Zamknąć termin?', submitLabel: 'Zamknij termin', body: `<p>${missing ? `<b>${missing} osób bez zaznaczonej obecności</b> — zostaną zapisane jako nieobecne. ` : ''}${!ended(o) ? 'Termin jeszcze trwa lub się nie zaczął. ' : ''}Po zamknięciu jednostka zostanie zaliczona: <b>${esc(pName(o.coach))}</b>.</p>`,
        onSubmit: () => { for (const m of group(o.group).members) { db.attendance[o.id] ||= {}; db.attendance[o.id][m] = { ...(db.attendance[o.id][m] || { declared: 'unknown', status: 'final' }), actual: db.attendance[o.id][m]?.actual || 'absent' } } o.status = 'done'; o.updatedAt++; const present = Object.values(db.attendance[o.id]).filter((a) => a.actual !== 'absent').length; toast(`Termin zamknięty — ${present} obecnych.`); go('/club') } })
    },
    'new-thread': (el) => {
      const pid = me()
      const opts                     = []
      const pre = el.dataset.scope || ''
      for (const gid of coachedGroups(pid)) opts.push([`group:${gid}`, `Grupa: ${group(gid).name}`])
      for (const sid of coordSections(pid)) opts.push([`section:${sid}`, `Sekcja: ${section(sid).name}`])
      if (isAdmin()) opts.push(['club:club', 'Cały klub'])
      if (pre.startsWith('occurrence:')) { const o = occById(pre.split(':')[1])              ; opts.unshift([pre, `Termin: ${o.name}, ${dShort(o.date)}`]) }
      openModal({ title: 'Nowy komunikat', submitLabel: 'Wyślij', body: `${fld('scope', 'Do kogo', sel('scope', [['', '— wybierz —'], ...opts], pre), { req: true, hint: 'Adresaci: uczestnicy z kontem, opiekunowie małoletnich, prowadzący' })}${fld('subject', 'Temat', inp('subject', 'text', '', 'maxlength="120"'), { req: true })}${fld('body', 'Treść', area('body', '', 'maxlength="5000"'), { req: true })}`,
        onSubmit: (fd) => {
          const errs         = {}; required(fd, ['scope', 'subject', 'body'], errs)
          if (String(fd.get('subject') || '').trim().length && String(fd.get('subject')).trim().length < 3) errs.subject = 'Temat: 3–120 znaków'
          if (Object.keys(errs).length) return errs
          const [kind, id] = String(fd.get('scope')).split(':')
          const label = opts.find((o) => o[0] === fd.get('scope'))?.[1] || ''
          const count = kind === 'club' ? 41 : kind === 'section' ? db.groups.filter((g) => g.section === id).reduce((s, g) => s + g.members.length + 2, 0) : kind === 'group' ? group(id).members.length + 2 : 8
          const t         = { id: uid('t'), scope: kind                   , scopeId: id, scopeLabel: label, subject: String(fd.get('subject')), isCase: false, readBy: [pid], messages: [{ id: uid('m'), author: pid, role: isAdmin() ? 'administrator' : 'trener', body: String(fd.get('body')), at: `${TODAY} ${NOW}`, delivered: count, failed: 0 }] }
          db.threads.unshift(t)
          mail('kasia.nowak@example.pl', String(fd.get('subject')), String(fd.get('body')), `/club/messages/${t.id}`, 'Otwórz w aplikacji')
          toast(`Wysłano do ${count} osób (w aplikacji + e-mail).`)
          go(location.hash.includes('/backend') ? `/backend/communication/threads/${t.id}` : `/club/messages/${t.id}`)
        } })
    },
    'share-text': (el) => {
      const t = db.threads.find((x) => x.id === el.dataset.thread)          
      const occId = t.scope === 'occurrence' ? t.scopeId : (db.occurrences.find((o) => o.group === t.scopeId && o.date >= TODAY && o.status === 'planned') || { id: '' }).id
      const text = `${t.subject}\n${t.messages[t.messages.length - 1].body}\n\nSzczegóły i deklaracja obecności: https://gwiazda.vereino.example/club/link?occ=${occId}`
      try { navigator.clipboard.writeText(text).catch(() => undefined) } catch { /* brak schowka */ }
      openModal({ title: 'Tekst do wklejenia na grupę', submitLabel: 'Gotowe', body: `<div class="alert success"><strong>Skopiowano do schowka</strong>Wklej tekst na grupę w Messengerze lub WhatsAppie. Link nie ujawnia danych bez zalogowania.</div><textarea readonly rows="6" style="width:100%">${esc(text)}</textarea><p class="small"><a href="#/club/link?occ=${occId}" data-action="close-modal">Zobacz, co zobaczy rodzic po kliknięciu linku →</a></p>`, onSubmit: () => undefined })
    },
    'mark-case': (el) => {
      const t = db.threads.find((x) => x.id === el.dataset.thread)          
      openModal({ title: 'Oznaczyć jako sprawę?', danger: true, submitLabel: 'Oznacz jako sprawę', body: `<div class="alert warning"><strong>Tej operacji nie można cofnąć.</strong>Wiadomości w wątku staną się nieusuwalne i nieedytowalne (materiał dowodowy). Wątek zobaczą koordynator sekcji i administrator.</div>`,
        onSubmit: () => { t.isCase = true; toast('Wątek oznaczony jako sprawa.'); render() } })
    },
    'delete-msg': (el) => {
      const t = db.threads.find((x) => x.id === el.dataset.thread)          
      if (t.isCase) { toast('409 case_immutable — wiadomości sprawy nie można usuwać.', true); return }
      t.messages = t.messages.filter((m) => m.id !== el.dataset.msg)
      if (!t.messages.length) db.threads = db.threads.filter((x) => x !== t)
      toast('Usunięto wiadomość.'); t.messages.length ? render() : go('/backend/communication/threads')
    },
    'stripe-pay': (el) => {
      const ids = (el.dataset.ids          ).split(',')
      const mode = el.dataset.mode          
      if (mode === 'paid') { for (const c of db.charges.filter((x) => ids.includes(x.id))) { c.payments.push({ amount: remaining(c), method: 'online (Stripe)', date: TODAY, ref: 'pi_3Q…' }); c.status = 'paid' } mail(persona().email || '', 'Potwierdzenie płatności', `Zapłacono ${ids.length} należności. Dziękujemy!`) }
      go(`/club/payments/return?status=${mode}&ids=${ids.join(',')}`)
    },
    'pay-refresh': (el) => { const ids = (el.dataset.ids          ).split(','); for (const c of db.charges.filter((x) => ids.includes(x.id))) { c.payments.push({ amount: remaining(c), method: 'online (Stripe)', date: TODAY }); c.status = 'paid' } go(`/club/payments/return?status=paid&ids=${ids.join(',')}`) },
    slot: (el) => slotModal(el.dataset.place          , el.dataset.date          , Number(el.dataset.hour)),
    'cancel-booking': (el, ev) => { ev.stopPropagation(); const b = db.bookings.find((x) => x.id === el.dataset.id)           ; b.status = 'cancelled'; toast('Anulowano rezerwację.'); render() },
    'open-facility': () => openModal({ title: 'Otwórz obiekt', submitLabel: 'Otwórz', body: fld('before', 'Stan obiektu przed otwarciem', area('before', '', 'placeholder="np. boisko suche, siatki OK, oświetlenie sprawne"'), { req: true }), onSubmit: (fd) => { const v = String(fd.get('before') || '').trim(); if (v.length < 3) return { before: 'Opisz stan obiektu (min. 3 znaki).' }; db.log.opened = true; db.log.before = v; db.log.openedAt = NOW; db.logs.unshift({ id: uid('lg'), date: TODAY, operator: me(), opened: NOW, before: v }); toast(`Obiekt otwarty ${NOW}.`); render() } }),
    'close-facility': () => openModal({ title: 'Zamknij obiekt', submitLabel: 'Zamknij', body: `${fld('after', 'Stan po zamknięciu', area('after'), { req: true })}${fld('remarks', 'Uwagi', area('remarks'))}`, onSubmit: (fd) => { const v = String(fd.get('after') || '').trim(); if (v.length < 3) return { after: 'Opisz stan obiektu (min. 3 znaki).' }; db.log.closed = true; db.logs[0].closed = '21:15'; db.logs[0].after = v; toast('Obiekt zamknięty — wpis w dzienniku zapisany.'); render() } }),
    incident: () => openModal({ title: 'Zgłoś incydent', submitLabel: 'Zgłoś', body: `<div class="fields">${fld('kind', 'Rodzaj', sel('kind', [['', '— wybierz —'], ['naruszenie regulaminu', 'naruszenie regulaminu'], ['uszkodzenie', 'uszkodzenie'], ['uraz', 'uraz'], ['inne', 'inne']]), { req: true })}${fld('action', 'Podjęte działanie', sel('action', [['upomnienie', 'upomnienie'], ['usunięcie z obiektu', 'usunięcie z obiektu'], ['odwołanie rezerwacji', 'odwołanie rezerwacji'], ['wezwanie policji', 'wezwanie policji']]))}</div>${fld('description', 'Opis', area('description'), { req: true, hint: '10–2000 znaków; bez danych wrażliwych o zdrowiu' })}${fld('photo', 'Zdjęcie', inp('photo', 'file', '', 'accept="image/*"'))}`,
      onSubmit: (fd) => { const errs         = {}; required(fd, ['kind'], errs); if (String(fd.get('description') || '').trim().length < 10) errs.description = 'Opis: co najmniej 10 znaków.'; if (Object.keys(errs).length) return errs; db.incidents.unshift({ id: uid('in'), date: TODAY, place: 'pl-boisko', kind: String(fd.get('kind')), description: String(fd.get('description')), action: String(fd.get('action')), by: me() }); toast('Incydent zgłoszony — administrator dostał powiadomienie.'); render() } }),
    'no-show': (el) => { const r = db.rentals.find((x) => x.id === el.dataset.id)          ; if (!started(r)) { toast('„Nie stawił się” można oznaczyć dopiero po rozpoczęciu wynajmu.', true); return } r.status = 'no_show'; toast('Oznaczono: nie stawił się — należność pozostaje.'); render() },
    'token-declare': (el) => { const t = db.tokens[el.dataset.token          ]; db.attendance[t.occ] ||= {}; db.attendance[t.occ][el.dataset.person          ] = { declared: el.dataset.val         , status: 'final', by: t.guardian }; toast('Zapisano deklarację.'); render() },
    'public-request': (el) => publicRequestModal(el.dataset.place          , el.dataset.date          , Number(el.dataset.from), Number(el.dataset.to)),
    approve: (el) => {
      const r = db.rentals.find((x) => x.id === el.dataset.id)          
      openModal({ title: `Akceptuj zgłoszenie: ${r.renter}`, submitLabel: 'Akceptuj i wyślij e-mail', body: `<p class="small">${esc(placeName(db, r.place))}, ${dShort(r.date)} ${r.start}–${r.end}. Po akceptacji powstanie należność na konto Gminy Liszki, a zgłaszający dostanie e-mail z kwotą, numerem konta, terminem wpłaty i terminem bezpłatnego odwołania.</p>
        ${fld('renterId', 'Najemca w kartotece', sel('renterId', [['new', `+ Utwórz instytucję „${r.renter}”`], ...db.institutions.map((i) => [i.id, i.name]                    )], 'new'), { req: true })}
        <div class="fields">${fld('amount', 'Kwota (zł)', inp('amount', 'number', String(r.amount / 100), 'min="0" step="1"'), { hint: `Z cennika: ${zl(r.amount)}` })}${fld('note', 'Uzasadnienie zmiany kwoty', inp('note', 'text'), { hint: 'Wymagane, jeśli zmieniasz kwotę' })}</div>`,
        onSubmit: (fd) => {
          const amt = Math.round(Number(fd.get('amount')) * 100)
          if (!(amt >= 0)) return { amount: 'Podaj kwotę.' }
          if (amt !== r.amount && !String(fd.get('note') || '').trim()) return { note: 'Podaj uzasadnienie zmiany kwoty.' }
          if (conflicts(r.place, r.date, toMin(r.start), toMin(r.end), { ignore: r.id }).length) return { _: '409 — termin koliduje z innym wpisem. Odrzuć zgłoszenie lub przesuń kolidujący wpis.' }
          if (fd.get('renterId') === 'new') db.institutions.push({ id: uid('i'), name: r.renter, type: 'klub', contact: `${r.contact}, ${r.phone}` })
          r.amount = amt; r.status = 'requested'; r.renterId = String(fd.get('renterId')); rentalCharge(db, r)
          mail(r.email, `Rezerwacja zaakceptowana: ${placeName(db, r.place)}, ${dShort(r.date)}`, `Kwota: ${zl(r.amount)}\nKonto Gminy Liszki: PL 12 1240 0000 0000 0000 1234 5678\nWpłata do: ${dShort(addDays(r.date, -3))}\nBezpłatne odwołanie do: ${dShort(addDays(r.date, -1))} ${r.start}`)
          toast('Zaakceptowano — wysłano e-mail z danymi do wpłaty.'); render()
        } })
    },
    reject: (el) => {
      const r = db.rentals.find((x) => x.id === el.dataset.id)          
      openModal({ title: `Odrzuć zgłoszenie: ${r.renter}`, danger: true, submitLabel: 'Odrzuć i wyślij e-mail', body: fld('reason', 'Powód (trafi do zgłaszającego)', area('reason', '', 'maxlength="500"'), { req: true, hint: '5–500 znaków' }),
        onSubmit: (fd) => { const v = String(fd.get('reason') || '').trim(); if (v.length < 5) return { reason: 'Powód: co najmniej 5 znaków.' }; r.status = 'rejected'; r.reason = v; mail(r.email, 'Zgłoszenie rezerwacji odrzucone', `Powód: ${v}`); toast('Odrzucono — zgłaszający dostał e-mail.'); render() } })
    },
    'rental-confirm': (el) => { const r = db.rentals.find((x) => x.id === el.dataset.id)          ; const c = db.charges.find((x) => x.id === r.chargeId); if (c) { c.payments.push({ amount: remaining(c), method: 'przelew na konto gminy', date: TODAY }); c.status = 'paid' } r.status = 'confirmed'; toast('Wpłata odnotowana — wynajem potwierdzony.'); render() },
    'rental-cancel': (el) => {
      const r = db.rentals.find((x) => x.id === el.dataset.id)          
      const deadline = addDays(r.date, -1)
      const late = TODAY > deadline || (TODAY === deadline && toMin(NOW) > toMin(r.start))
      openModal({ title: 'Odwołać wynajem?', danger: true, submitLabel: 'Odwołaj', body: `<div class="alert ${late ? 'error' : 'info'}"><strong>${late ? 'Odwołanie po terminie (mniej niż 24 h)' : 'Odwołanie bezpłatne'}</strong>${late ? 'Status „odwołany po terminie”, należność przepada (§3 ust. 4).' : 'Należność zostanie anulowana.'}</div>`,
        onSubmit: () => { r.status = late ? 'cancelled_late' : 'cancelled_free'; const c = db.charges.find((x) => x.id === r.chargeId); if (c) c.status = late ? 'forfeited' : 'cancelled'; toast('Wynajem odwołany.'); render() } })
    },
    'assign-coach': (el) => {
      const o = occById(el.dataset.occ          )              
      const coaches = db.persons.filter((p) => db.roles.some((r) => r.person === p.id && r.role === 'coach') && p.id !== o.coach)
      const busy = (pid        )                => { const c = db.occurrences.find((x) => x.id !== o.id && x.coach === pid && x.date === o.date && x.status !== 'cancelled' && overlap(toMin(o.start), toMin(o.end), toMin(x.start), toMin(x.end))); return c ? `${c.name} ${c.start}` : null }
      openModal({ title: `Wskaż zastępcę — ${o.name}, ${dShort(o.date)} ${o.start}`, submitLabel: 'Zapisz zastępstwo', body: `<div class="stack" role="radiogroup" aria-label="Prowadzący">${coaches.map((p) => { const b = busy(p.id); return `<label class="check card" style="margin:0"><input type="radio" name="coach" value="${p.id}" ${b ? 'disabled' : ''}><span><b>${esc(p.first)} ${esc(p.last)}</b><br><span class="small muted">${b ? `zajęty: ${esc(b)}` : 'wolny w tym czasie'}</span></span></label>` }).join('')}</div><div data-field="coach"></div>${fld('reason', 'Powód (opcjonalnie)', inp('reason'))}`,
        onSubmit: (fd) => { const c = String(fd.get('coach') || ''); if (!c) return { coach: 'Wybierz prowadzącego.' }; db.substitutions.push({ occ: o.id, prev: o.coach, next: c, kind: 'substitute_assigned', at: `${TODAY} ${NOW}`, by: me(), reason: String(fd.get('reason') || '') }); o.coach = c; o.updatedAt++; toast(`${pName(c)} poprowadzi termin — dostał powiadomienie.`); render() } })
    },
    'units-csv': (el) => { const rows = unitsReport(el.dataset.month          ); const csv = ['prowadzący;planowe;oddane;przejęte;bilans;mecze;kwota', ...rows.map((r) => `${pName(r.coach)};${r.planned};${r.given};${r.taken};${r.balance};${r.matches};${r.amount === null ? '' : (r.amount / 100).toFixed(2)}`)].join('\n'); csvModal(`raport-jednostek-${el.dataset.month}.csv`, csv) },
    'report-csv': (el) => { const r = ownerReport(el.dataset.place          , el.dataset.month          ); const csv = ['pozycja;wartość', `godziny ogólnodostępne;${Math.round(r.zones.public_free)}`, `godziny treningów klubu;${Math.round(r.zones.club_training)}`, `faktyczny czas klubu;${r.clubHours.toFixed(1)}`, `godziny do wynajęcia;${Math.round(r.zones.reservable_paid)}`, `liczba wynajmów;${r.rentals.length}`, `wpłaty na konto gminy;${(r.paid / 100).toFixed(2)}`, `incydenty;${r.incidents}`, `prace konserwacyjne;${r.maintenance}`].join('\n'); csvModal('raport-dla-gminy.csv', csv) },
    generate: () => openModal({ title: 'Nalicz okres', submitLabel: 'Nalicz', body: `<p class="small">Tworzy składki dla członków grup z cennikiem; zniżka na rodzeństwo liczona automatycznie. Ponowne naliczenie tego samego okresu niczego nie dubluje.</p>${fld('period', 'Okres', inp('period', 'month', '2026-12'), { req: true })}`,
      onSubmit: (fd) => { const p = String(fd.get('period') || ''); if (!/^\d{4}-\d{2}$/.test(p)) return { period: 'Wybierz miesiąc.' }; if (p < '2025-11') return { period: 'Nie wcześniej niż 12 miesięcy wstecz.' }; const res = generateCharges(db, p); ui.genResult = JSON.stringify({ period: p, ...res }); toast(`Naliczono ${p}: utworzono ${res.created}, pominięto ${res.skipped}.`); render() } }),
    'record-payment': (el) => {
      const c = db.charges.find((x) => x.id === el.dataset.id)          
      openModal({ title: 'Zaksięguj wpłatę', submitLabel: 'Zaksięguj', body: `<p class="small">Pozostało do zapłaty: <b>${zl(remaining(c))}</b></p><div class="fields">${fld('amount', 'Kwota (zł)', inp('amount', 'number', String(remaining(c) / 100), 'step="0.01" min="0.01"'), { req: true })}${fld('method', 'Metoda', sel('method', [['gotówka', 'gotówka'], ['przelew', 'przelew']]), { req: true })}${fld('date', 'Data wpłaty', inp('date', 'date', TODAY), { req: true })}${fld('ref', 'Tytuł / numer', inp('ref'))}</div>`,
        onSubmit: (fd) => { const amt = Math.round(Number(fd.get('amount')) * 100); const errs         = {}; if (!(amt > 0)) errs.amount = 'Kwota musi być większa od zera.'; else if (amt > remaining(c)) errs.amount = `Kwota przekracza pozostałe ${zl(remaining(c))} (422).`; if (String(fd.get('date')) > TODAY) errs.date = 'Data nie może być z przyszłości.'; if (Object.keys(errs).length) return errs; c.payments.push({ amount: amt, method: String(fd.get('method')), date: String(fd.get('date')), ref: String(fd.get('ref') || '') }); c.status = remaining(c) <= 0 ? 'paid' : 'partially_paid'; c.updatedAt++; toast(c.status === 'paid' ? 'Należność opłacona.' : 'Zaksięgowano — należność częściowo opłacona.'); render() } })
    },
    'cancel-charge': (el) => { const c = db.charges.find((x) => x.id === el.dataset.id)          ; openModal({ title: 'Anulować należność?', danger: true, submitLabel: 'Anuluj należność', body: '<p>Należność bez wpłat zostanie anulowana. Operacja trafi do dziennika audytu.</p>', onSubmit: () => { c.status = 'cancelled'; toast('Należność anulowana.'); render() } }) },
    'new-fee': () => openModal({ title: 'Nowy cennik', body: `<div class="fields">${fld('name', 'Nazwa', inp('name'), { req: true })}${fld('group', 'Grupa', sel('group', [['', '—'], ...db.groups.map((g) => [g.id, g.name]                    )]))}${fld('activity', 'albo aktywność', sel('activity', [['', '—'], ...db.activities.map((a) => [a.id, a.name]                    )]))}${fld('amount', 'Kwota (zł)', inp('amount', 'number', '', 'min="1"'), { req: true })}${fld('dueDay', 'Dzień płatności', inp('dueDay', 'number', '10', 'min="1" max="28"'), { req: true })}</div>`,
      onSubmit: (fd) => { const errs         = {}; required(fd, ['name', 'amount'], errs); const g = String(fd.get('group')), a = String(fd.get('activity')); if (!!g === !!a) errs.group = 'Wybierz dokładnie jedno: grupę albo aktywność (422).'; if (Number(fd.get('amount')) <= 0) errs.amount = 'Kwota musi być większa od zera.'; const d = Number(fd.get('dueDay')); if (!(d >= 1 && d <= 28)) errs.dueDay = 'Dzień 1–28.'; if (Object.keys(errs).length) return errs; db.fees.push({ id: uid('f'), name: String(fd.get('name')), group: g || db.activities.find((x) => x.id === a) .group, amount: Number(fd.get('amount')) * 100, dueDay: d, period: 'miesięczna' }); toast('Dodano cennik.'); render() } }),
    'new-closure': () => openModal({ title: 'Nowe zamknięcie', body: `<div class="fields">${fld('place', 'Miejsce', sel('place', [['pl-boisko', 'Boisko piłkarskie'], ['pl-multi', 'Boisko wielofunkcyjne']]), { req: true })}${fld('date', 'Dzień', inp('date', 'date', '2026-11-12'), { req: true })}${fld('start', 'Od', inp('start', 'time', '08:00'), { req: true })}${fld('end', 'Do', inp('end', 'time', '22:00'), { req: true })}${fld('reason', 'Powód', sel('reason', [['śnieg', 'śnieg'], ['konserwacja', 'konserwacja'], ['impreza gminna', 'impreza gminna'], ['szkoła', 'szkoła'], ['inne', 'inne']]))}</div>${fld('note', 'Opis', inp('note'))}`,
      onSubmit: (fd) => { const s = String(fd.get('start')), e = String(fd.get('end')); if (toMin(e) <= toMin(s)) return { end: 'Godzina „do” musi być późniejsza niż „od”.' }; const pl = String(fd.get('place')), d = String(fd.get('date')); const hit = occupancy(pl, d).filter((o) => overlap(toMin(s), toMin(e), o.from, o.to)); db.closures.push({ id: uid('cl'), place: pl, date: d, start: s, end: e, reason: String(fd.get('reason')), note: String(fd.get('note') || '') }); toast(`Zamknięcie zapisane. Oznaczono do przeniesienia: ${hit.filter((h) => h.kind === 'occ').length} terminów, ${hit.filter((h) => h.kind === 'rent').length} wynajmów.`); render() } }),
    'new-section': () => openModal({ title: 'Nowa sekcja', body: `${fld('name', 'Nazwa', inp('name'), { req: true, hint: '2–80 znaków, unikalna' })}${fld('coordinator', 'Koordynator', sel('coordinator', [['', '— później —'], ...db.persons.filter((p) => ageOn(p.birth) >= 18).map((p) => [p.id, `${p.first} ${p.last}`]                    )]))}`,
      onSubmit: (fd) => { const n = String(fd.get('name') || '').trim(); if (n.length < 2) return { name: 'Nazwa: 2–80 znaków.' }; if (db.sections.some((s) => s.name.toLowerCase() === n.toLowerCase())) return { name: 'Sekcja o tej nazwie już istnieje (409).' }; const id = uid('s'); db.sections.push({ id, name: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), short: '', description: '', isPublic: false, conditions: '', contactName: '', contactEmail: '', contactPhone: '', materials: [], active: true, color: 'dodat', updatedAt: 1 }); if (fd.get('coordinator')) db.roles.push({ id: uid('ra'), person: String(fd.get('coordinator')), role: 'coordinator', section: id }); toast('Dodano sekcję.'); render() } }),
    'deactivate-section': (el) => { const s = section(el.dataset.id          ); const gs = db.groups.filter((g) => g.section === s.id); if (gs.length) { openModal({ title: 'Nie można dezaktywować sekcji', submitLabel: 'Rozumiem', body: `<div class="alert error"><strong>409 — sekcja ma aktywne grupy</strong>${gs.map((g) => esc(g.name)).join(', ')}. Zakończ lub przenieś grupy.</div>`, onSubmit: () => undefined }); return } s.active = false; render() },
    'add-coordinator': (el) => openModal({ title: 'Przypisz koordynatora', body: fld('person', 'Osoba', sel('person', [['', '— wybierz —'], ...db.persons.filter((p) => ageOn(p.birth) >= 18).map((p) => [p.id, `${p.first} ${p.last}`]                    )]), { req: true }), onSubmit: (fd) => { if (!fd.get('person')) return { person: 'Wybierz osobę.' }; db.roles.push({ id: uid('ra'), person: String(fd.get('person')), role: 'coordinator', section: el.dataset.section }); toast('Przypisano koordynatora — rola w systemie nadana.'); render() } }),
    'end-role': (el) => { db.roles = db.roles.filter((r) => r.id !== el.dataset.id); toast('Zakończono przypisanie — rola odebrana.'); render() },
    'new-person': () => openModal({ title: 'Nowa osoba', body: `<div class="fields">${fld('first', 'Imię', inp('first'), { req: true })}${fld('last', 'Nazwisko', inp('last'), { req: true })}${fld('birth', 'Data urodzenia', inp('birth', 'date'), { req: true })}${fld('email', 'E-mail', inp('email', 'email'))}${fld('phone', 'Telefon', inp('phone', 'tel'))}${fld('pesel', 'PESEL (opcjonalnie)', inp('pesel', 'text', '', 'maxlength="11" inputmode="numeric"'))}</div>`,
      onSubmit: (fd) => { const errs         = {}; required(fd, ['first', 'last', 'birth'], errs); const e = String(fd.get('email') || ''); if (e && !emailOk(e)) errs.email = 'Nieprawidłowy e-mail.'; const ph = String(fd.get('phone') || ''); if (ph && !phoneOk(ph)) errs.phone = 'Telefon w formacie 600 100 200.'; const pe = String(fd.get('pesel') || ''); if (pe && !/^\d{11}$/.test(pe)) errs.pesel = 'PESEL: 11 cyfr.'; if (String(fd.get('birth')) > TODAY) errs.birth = 'Data z przyszłości.'; if (Object.keys(errs).length) return errs; const id = uid('p'); db.persons.push(P(id, String(fd.get('first')), String(fd.get('last')), String(fd.get('birth')), { email: e || undefined, phone: ph || undefined, pesel: pe || undefined })); toast('Dodano osobę.'); go(`/backend/people/persons/${id}?tab=opieka`) } }),
    'add-ward': (el) => openModal({ title: 'Dodaj podopiecznego', body: `${fld('ward', 'Podopieczny', sel('ward', [['', '— wybierz —'], ...db.persons.filter((p) => ageOn(p.birth) < 18 && p.id !== el.dataset.guardian).map((p) => [p.id, `${p.first} ${p.last} (${ageOn(p.birth)} l.)`]                    )]), { req: true })}${fld('relation', 'Relacja', sel('relation', [['rodzic', 'rodzic'], ['dziadek/babcia', 'dziadek/babcia'], ['opiekun prawny', 'opiekun prawny'], ['inna', 'inna']]))}${chk('payer', 'Główny płatnik')}<div class="section-title">Zgody</div>${chk('regulations', 'Regulamin klubu', true)}${chk('image', 'Wizerunek')}${chk('trips', 'Wyjazdy')}`,
      onSubmit: (fd) => { const w = String(fd.get('ward') || ''); if (!w) return { ward: 'Wybierz osobę.' }; if (fd.get('payer') && db.guardianships.some((g) => g.ward === w && g.primaryPayer)) return { payer: 'Podopieczny ma już głównego płatnika (409).' }; db.guardianships.push({ id: uid('gs'), guardian: el.dataset.guardian          , ward: w, relation: String(fd.get('relation')), primaryPayer: !!fd.get('payer'), consents: { regulations: !!fd.get('regulations'), image: !!fd.get('image'), trips: !!fd.get('trips') } }); toast('Dodano podopiecznego.'); render() } }),
    'add-role': (el) => openModal({ title: 'Przypisz rolę', body: `<div class="fields">${fld('role', 'Rola', sel('role', [['coach', 'trener / instruktor'], ['coordinator', 'koordynator sekcji'], ['facility_operator', 'animator obiektu'], ['club_admin', 'administrator klubu']]), { req: true })}${fld('section', 'Sekcja (dla koordynatora)', sel('section', [['', '—'], ...db.sections.map((s) => [s.id, s.name]                    )]))}${fld('place', 'Miejsce (dla animatora)', sel('place', [['', '—'], ...db.places.map((p) => [p.id, p.name]                    )]))}</div>`,
      onSubmit: (fd) => { const r = String(fd.get('role')); if (r === 'coordinator' && !fd.get('section')) return { section: 'Koordynator wymaga sekcji (422).' }; if (r === 'facility_operator' && !fd.get('place')) return { place: 'Animator wymaga miejsca (422).' }; db.roles.push({ id: uid('ra'), person: el.dataset.person          , role: r                          , section: String(fd.get('section') || '') || undefined, place: String(fd.get('place') || '') || undefined }); toast('Przypisano rolę.'); render() } }),
    'create-account': (el) => { const p = personById(db, el.dataset.id          ); openModal({ title: `Załóż konto: ${p.first} ${p.last}`, submitLabel: 'Załóż i wyślij e-mail', body: fld('email', 'E-mail logowania', inp('email', 'email', p.email || ''), { req: true }),
      onSubmit: (fd) => { const e = String(fd.get('email') || '').trim(); if (!emailOk(e)) return { email: 'Nieprawidłowy e-mail.' }; if (db.persons.some((x) => x.id !== p.id && x.email === e && x.account)) return { email: 'Ten e-mail ma już konto (409).' }; p.email = e; p.account = true; mail(e, 'Zaproszenie do aplikacji LKS Gwiazda', 'Ustaw hasło, aby się zalogować. Link ważny 48 h.', '/login', 'Ustaw hasło'); toast('Konto założone — wysłano e-mail z ustawieniem hasła.'); render() } }) },
    'simulate-conflict': (el) => { const p = personById(db, el.dataset.id          ); p.updatedAt++; toast('Ktoś inny zapisał ten rekord — zapisz formularz, aby zobaczyć konflikt 409.') },
    'add-member': (el) => { const g = group(el.dataset.group          ); openModal({ title: `Dodaj do składu: ${g.name}`, body: `<div class="fields">${fld('person', 'Osoba', sel('person', [['', '— wybierz —'], ...db.persons.filter((p) => !g.members.includes(p.id)).map((p) => [p.id, `${p.first} ${p.last} (${ageOn(p.birth)} l.)`]                    )]), { req: true })}${fld('role', 'Rola', sel('role', [['participant', 'uczestnik'], ['coach', g.kind === 'team' ? 'trener' : 'instruktor'], ['assistant', 'asystent']]))}${fld('from', 'Od', inp('from', 'date', TODAY), { req: true })}</div>`,
      onSubmit: (fd) => { const pid = String(fd.get('person') || ''); if (!pid) return { person: 'Wybierz osobę.' }; if (fd.get('role') === 'participant') g.members.push(pid); else g.coaches.push(pid); toast('Dodano do składu.'); render() } }) },
    'end-member': (el) => { const g = group(el.dataset.group          ); g.members = g.members.filter((m) => m !== el.dataset.person); g.coaches = g.coaches.filter((m) => m !== el.dataset.person); toast('Zakończono członkostwo (historia zachowana).'); render() },
  }

  function csvModal(name        , csv        )       {
    openModal({ title: `Eksport: ${name}`, submitLabel: 'Zamknij', body: `<p class="small muted">W aplikacji: pobranie pliku ${esc(name)}. W makiecie: skopiuj treść i wklej do arkusza.</p><textarea id="csv-text" readonly rows="8" style="width:100%;font-family:ui-monospace,monospace">${esc(csv)}</textarea><p>${btn('Kopiuj CSV', 'copy-csv')}</p>`, onSubmit: () => undefined })
  }

  function slotModal(placeId        , date        , hour        )       {
    const place = db.places.find((p) => p.id === placeId)         
    const backend = location.hash.includes('/backend/')
    const pid = me()
    const myGroups = db.groups.filter((g) => g.coaches.includes(pid) || coordSections(pid).includes(g.section))
    const zone = zonesFor(placeId, date).find((z) => hour * 60 >= z.from && hour * 60 < z.to)
    const startT = fromMin(hour * 60), endT = fromMin(Math.min(hour * 60 + 90, (openingFor(placeId, date) || [0, 1320])[1]))
    const modes                     = [...(backend && can('facilities.rentals.manage') ? [['rental', 'Wynajem zewnętrzny']]                       : []), ...(myGroups.length && can('activities.events.create') ? [['group', 'Dla grupy (wydarzenie)']]                       : []), ['general', 'Cel ogólny (rezerwacja klubu)']]
    const teams = myGroups.filter((g) => g.kind === 'team')
    openModal({ title: `Rezerwuj: ${place.name}, ${dShort(date)}`, submitLabel: 'Rezerwuj', wide: true,
      body: `<p class="small muted">Strefa: <b>${zone ? zoneLabel(zone.zone) : '—'}</b>. ${backend ? '' : 'Rezerwacja personelu jest ważna od razu, bez akceptacji (Q-022).'}</p>
        ${fld('mode', 'Rodzaj', sel('mode', modes, modes[0][0], 'data-change="slot-mode"'), { req: true })}
        <div class="fields">${fld('start', 'Od', inp('start', 'time', startT), { req: true })}${fld('end', 'Do', inp('end', 'time', endT), { req: true })}</div>
        <div data-mode="group" ${modes[0][0] === 'group' ? '' : 'hidden'}><div class="fields" style="margin-top:10px">${fld('group', 'Grupa', sel('group', myGroups.map((g) => [g.id, `${g.name}${g.kind === 'class_group' ? ' (grupa zajęciowa)' : ''}`]                    ), teams[0]?.id || myGroups[0]?.id), { req: true })}${fld('type', 'Typ', sel('type', [['tournament', 'turniej / zawody'], ['other', 'inne wydarzenie']], 'tournament'), { req: true })}${fld('name', 'Nazwa', inp('name', 'text', 'Turniej o Puchar Gwiazdy'), { req: true })}</div>
          <div class="field" style="margin-top:10px"><span>Zaproszone drużyny</span><div class="chips">${db.externalTeams.map((t) => `<label class="chip"><input type="checkbox" name="invited" value="${t.id}" class="sr-only" data-change="chip">${esc(t.name)}</label>`).join('')}</div></div></div>
        <div data-mode="general" ${modes[0][0] === 'general' ? '' : 'hidden'} style="margin-top:10px">${fld('purpose', 'Cel', inp('purpose', 'text', '', 'maxlength="120" placeholder="np. Szkolenie instruktorów"'), { req: true, hint: '3–120 znaków; widoczny dla personelu' })}${fld('section', 'Sekcja', sel('section', db.sections.map((s) => [s.id, s.name]                    ), myGroups[0]?.section || coordSections(pid)[0] || 's-akad'))}</div>
        <div data-mode="rental" ${modes[0][0] === 'rental' ? '' : 'hidden'} style="margin-top:10px"><div class="fields">${fld('renter', 'Najemca', sel('renter', db.institutions.filter((i) => i.type !== 'gmina').map((i) => [i.id, i.name]                    )), { req: true })}${fld('category', 'Kategoria', sel('category', db.rates.filter((r) => r.place === placeId).map((r) => [r.category, r.label]                    )))}${fld('units', 'Jednostki × 90 min', inp('units', 'number', '1', 'min="1" max="4"'), { req: true })}${fld('contact', 'Kontakt (osoba, telefon)', inp('contact'), { req: true })}</div>${chk('regs', 'Najemca zaakceptował regulamin (telefonicznie)', true)}</div>`,
      onSubmit: (fd) => {
        const mode = String(fd.get('mode'))
        const s = toMin(String(fd.get('start'))), e0 = toMin(String(fd.get('end')))
        const e = mode === 'rental' ? s + 90 * Number(fd.get('units') || 1) : e0
        const errs         = {}
        if (mode !== 'rental' && e <= s) errs.end = 'Koniec musi być po początku.'
        const op = openingFor(placeId, date)
        if (!op || s < op[0] || e > op[1]) errs.start = `Poza godzinami otwarcia${op ? ` (${fromMin(op[0])}–${fromMin(op[1])})` : ''} — 409 place_closed.`
        if (mode === 'group') { const g = group(String(fd.get('group'))); if (String(fd.get('name') || '').trim().length < 3) errs.name = 'Podaj nazwę.' }
        if (mode === 'general' && String(fd.get('purpose') || '').trim().length < 3) errs.purpose = 'Cel: 3–120 znaków.'
        if (mode === 'rental') { const u = Number(fd.get('units')); if (!(u >= 1 && u <= 4)) errs.units = 'Od 1 do 4 jednostek.'; const zs = zonesFor(placeId, date).filter((z) => overlap(s, e, z.from, z.to)); if (zs.some((z) => z.zone !== 'reservable_paid')) errs.start = 'Wynajem tylko w strefie „do rezerwacji” (409 zone_not_reservable).'; if (!String(fd.get('contact') || '').trim()) errs.contact = 'Pole wymagane'; const ren = db.institutions.find((i) => i.id === fd.get('renter')); if (ren && db.bans.some((b) => b.subject === ren.name && b.to >= date)) errs.renter = 'Najemca ma aktywny zakaz wstępu (409 entry_ban_active).' }
        if (Object.keys(errs).length) return errs
        const conf = conflicts(placeId, date, s, e, { capacity: mode === 'group' })
        if (conf.length) return { _: `<strong>Termin zajęty (409)</strong><ul style="margin:4px 0 0;padding-left:18px">${conf.map((c) => `<li>${fromMin(c.from)}–${fromMin(c.to)} ${esc(c.label)}</li>`).join('')}</ul>` }
        // Zgłoszenia zewnętrzne czekające w tym czasie — przebite.
        const sup = db.rentals.filter((r) => r.status === 'pending_approval' && placeFamily(placeId).includes(r.place) && r.date === date && overlap(s, e, toMin(r.start), toMin(r.end)))
        for (const r of sup) { r.status = 'superseded'; mail(r.email, 'Zgłoszenie rezerwacji — termin zajęty przez klub', `Termin ${dShort(r.date)} ${r.start} został zajęty przez wydarzenie klubu. Wybierz inny termin w kalendarzu obiektu.`, `/p/gwiazda/places/${place.slug || ''}`, 'Kalendarz obiektu') }
        if (mode === 'group') {
          const g = group(String(fd.get('group')))
          const a           = { id: uid('a'), group: g.id, name: String(fd.get('name')), type: String(fd.get('type'))           , weekdays: [weekday(date)], start: fromMin(s), end: fromMin(e), place: placeId, coach: pid, from: date, to: date, oneOff: true, invited: fd.getAll('invited').map(String) }
          db.activities.push(a); generateOccurrences(db, a, date, date)
          toast(`Zarezerwowano: ${a.name}, ${dShort(date)} ${a.start}–${a.end} — w kalendarzach grupy ${g.name}.${sup.length ? ` Przebito ${sup.length} zgłoszenie zewnętrzne (e-mail wysłany).` : ''}`)
        } else if (mode === 'general') {
          db.bookings.push({ id: uid('b'), place: placeId, date, start: fromMin(s), end: fromMin(e), purpose: String(fd.get('purpose')), by: pid, section: String(fd.get('section')), status: 'confirmed' })
          toast(`Zarezerwowano: ${placeName(db, placeId)}, ${dShort(date)} ${fromMin(s)}–${fromMin(e)}.${sup.length ? ' Przebito zgłoszenie zewnętrzne.' : ''}`)
        } else {
          const ren = db.institutions.find((i) => i.id === fd.get('renter'))                                
          const rate = db.rates.find((r) => r.place === placeId && r.category === fd.get('category'))                                       
          const units = Number(fd.get('units'))
          const r         = { id: uid('r'), place: placeId, renter: ren.name, renterId: ren.id, category: rate.category, contact: String(fd.get('contact')), email: 'najemca@example.pl', phone: '', date, start: fromMin(s), end: fromMin(e), units, amount: rate.price * units, status: 'requested', via: 'telefon' }
          db.rentals.push(r); rentalCharge(db, r)
          toast(`Wynajem zapisany: ${zl(r.amount)}, wpłata do ${dShort(addDays(date, -3))}, bezpłatne odwołanie do ${dShort(addDays(date, -1))} ${r.start}.`)
        }
        render()
      } })
  }

  function publicRequestModal(placeId        , date        , from        , to        )       {
    const place = db.places.find((p) => p.id === placeId)         
    const maxUnits = Math.max(1, Math.floor((to - from) / 90))
    openModal({ title: `Zgłoś rezerwację: ${place.name}`, submitLabel: 'Wyślij zgłoszenie', wide: true,
      body: `<div class="alert info"><strong>${esc(dLong(date))}, od ${fromMin(from)}</strong>Zgłoszenie jest ważne dopiero po akceptacji administratora klubu. Najpierw potwierdzisz je linkiem z e-maila (ważny 1 h).</div>
        <div class="fields">${fld('org', 'Organizacja lub osoba', inp('org', 'text', '', 'maxlength="120"'), { req: true })}${fld('contact', 'Imię i nazwisko kontaktu', inp('contact', 'text', '', 'autocomplete="name"'), { req: true })}${fld('phone', 'Telefon', inp('phone', 'tel', '', 'autocomplete="tel"'), { req: true })}${fld('email', 'E-mail', inp('email', 'email', '', 'autocomplete="email"'), { req: true })}
        ${fld('category', 'Kategoria', sel('category', db.rates.filter((r) => r.place === placeId && r.category !== 'municipal_club').map((r) => [r.category, r.label]                    )), { req: true })}${fld('units', `Liczba jednostek × 90 min (max ${maxUnits})`, inp('units', 'number', '1', `min="1" max="${maxUnits}"`), { req: true })}</div>
        ${fld('purpose', 'Cel (opcjonalnie)', area('purpose', '', 'maxlength="300"'))}<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        ${chk('regs', `Akceptuję <a href="#" data-action="todo" data-what="Regulamin obiektu (PDF)">regulamin obiektu</a> <b class="req">*</b>`)}<p class="small muted">Dane przetwarzamy wyłącznie w celu obsługi zgłoszenia (administrator: LKS Gwiazda; polityka prywatności).</p>`,
      onSubmit: (fd) => {
        const errs         = {}
        required(fd, ['org', 'contact', 'phone', 'email', 'category'], errs)
        const org = String(fd.get('org') || '').trim(); if (org && (org.length < 2)) errs.org = 'Nazwa: 2–120 znaków.'
        const em = String(fd.get('email') || ''); if (em && !emailOk(em)) errs.email = 'Nieprawidłowy e-mail.'
        const ph = String(fd.get('phone') || ''); if (ph && !phoneOk(ph)) errs.phone = 'Telefon w formacie 600 100 200.'
        const u = Number(fd.get('units')); if (!(u >= 1 && u <= maxUnits)) errs.units = `Od 1 do ${maxUnits} jednostek w tym slocie.`
        if (!fd.get('regs')) errs.regs = 'Akceptacja regulaminu jest wymagana.'
        if (String(fd.get('website') || '')) errs._ = 'Zgłoszenie odrzucone (pole-pułapka).'
        if (Object.keys(errs).length) return errs
        const s = from, e = from + 90 * u
        if (conflicts(placeId, date, s, e, { pendingBlocks: true }).length) return { _: '<strong>Ten termin jest już zgłoszony lub zajęty (409 slot_unavailable)</strong>Wybierz inny termin.' }
        const rate = db.rates.find((r) => r.place === placeId && r.category === fd.get('category'))                                       
        const token = uid('vt')
        const r         = { id: uid('r'), place: placeId, renter: org, category: rate.category, contact: String(fd.get('contact')), email: em, phone: ph, date, start: fromMin(s), end: fromMin(e), units: u, amount: rate.price * u, status: 'pending_verification', via: 'online', purpose: String(fd.get('purpose') || ''), token, holdUntil: '' }
        db.rentals.push(r)
        mail(em, 'Potwierdź zgłoszenie rezerwacji', `Kliknij link, aby potwierdzić zgłoszenie: ${place.name}, ${dShort(date)} ${r.start}–${r.end}. Link ważny 1 godzinę.`, `/p/gwiazda/verify/${token}`, 'Potwierdź zgłoszenie')
        openModal({ title: 'Sprawdź skrzynkę', submitLabel: 'Zamknij', body: `<div class="alert success"><strong>Wysłaliśmy link na ${esc(em)}</strong>Potwierdź zgłoszenie w ciągu 1 godziny. Bez potwierdzenia zgłoszenie zostanie usunięte.</div><p class="small">W mockupie: <a href="#" data-action="drawer" data-which="mail">otwórz Skrzynkę testową</a>.</p>`, onSubmit: () => undefined })
        render()
        return { __keep: '' }
      } })
  }

  // ═══════════════════════════════════════════════════════════════════
  // Formularze
  // ═══════════════════════════════════════════════════════════════════
  const FORMS                                                                                                              = {
    'cash-mobile': (fd) => { const res = recordCash(fd); if (res) return res; render() },
    'kit-order': (fd, form) => {
      const c = kitCampaign(form.dataset.campaign          )               
      const token = form.dataset.token || ''
      const guardian = token ? db.kitTokens[token].guardian : me()
      const child = form.dataset.child          
      if (c.status !== 'open' || TODAY > c.closes) return { _: 'Zamówienia są już zamknięte (409).' }
      if (!kitKids(c, guardian).includes(child)) return { _: 'To dziecko nie należy do grup tej zbiórki (403).' }
      const choice                         = Object.fromEntries(c.products.filter((p) => p.kind === 'item').map((p) => [p.id, String(fd.get(`p-${p.id}`) || '')]))
      const priced = kitPrice(c, choice, !!fd.get('set'))
      const errs         = { ...priced.errs }
      const email = String(fd.get('email') || '').trim(), phone = String(fd.get('phone') || '').trim()
      if (!email) errs.email = 'Podaj e-mail.'; else if (!emailOk(email)) errs.email = 'Nieprawidłowy e-mail.'
      if (!phone) errs.phone = 'Podaj telefon.'; else if (!phoneOk(phone)) errs.phone = 'Nieprawidłowy numer, np. 600 100 200.'
      const existing = kitOrderOf(c, child)
      const printName = String(fd.get('printName') || '').trim().toUpperCase(), num = String(fd.get('printNumber') || '').trim()
      if (printName.length > 12) errs.printName = 'Do 12 znaków.'
      if (c.printNumber && num) {
        const n = Number(num), g = kitGroupOf(c, child)
        const taken = kitOrders(c).find((o) => o !== existing && o.printNumber === String(n) && kitGroupOf(c, o.child) === g)
        if (!Number.isInteger(n) || n < 1 || n > 99) errs.printNumber = 'Numer od 1 do 99.'
        else if (taken) errs.printNumber = `Numer ${n} ma już ${personById(db, taken.child).first} w grupie ${group(g).name} — wybierz inny.`
      }
      if (Object.keys(errs).length) return errs
      const notes = String(fd.get('notes') || '').trim()
      let o          
      if (existing) {
        const ch = chargeById(existing.chargeId)
        if (priced.total < paidOf(ch)) return { _: `Wpłacono już ${zl(paidOf(ch))}, a nowe zamówienie kosztuje ${zl(priced.total)}. Zmniejszenie zamówienia uzgodnij z klubem (409).` }
        Object.assign(existing, { lines: priced.lines, email, phone, printName, printNumber: num ? String(Number(num)) : '', notes })
        ch.amount = priced.total; ch.status = paidOf(ch) >= ch.amount ? 'paid' : paidOf(ch) > 0 ? 'partially_paid' : 'open'; ch.updatedAt++
        o = existing
      } else {
        o = { id: uid('ko'), campaign: c.id, child, by: guardian, email, phone, printName, printNumber: num ? String(Number(num)) : '', notes, lines: priced.lines, chargeId: '', at: `${TODAY.slice(8)}.${TODAY.slice(5, 7)} ${NOW}`, status: 'submitted', via: token ? 'link z e-maila' : 'aplikacja' }
        o.chargeId = kitCharge(db, c, o).id
        db.kitOrders.push(o)
      }
      mail(email, `${existing ? 'Zmiana zamówienia' : 'Kopia zamówienia'} — ${c.name}`, `${pName(child)}:\n${o.lines.map((l) => `• ${kitLineLabel(c, l)} — ${zl(l.price)}`).join('\n')}\nRazem: ${zl(kitTotal(o))}${printName || num ? `\nNadruk: ${printName} ${num}` : ''}\n\nPłatność do ${dShort(c.payDue)}: online w aplikacji, przelewem z kodem ${payerCode(guardian)} w tytule albo gotówką u trenera. Zmiany możliwe do ${dShort(c.closes)}.`, token ? `/club/o/${token}?child=${child}` : `/club/orders/${c.id}?child=${child}`, 'Zobacz zamówienie')
      toast(existing ? 'Zapisano zmiany — należność zaktualizowana.' : `Zamówienie złożone: ${zl(kitTotal(o))}. Kopia poszła na ${email}.`)
      go(`${token ? `/club/o/${token}` : `/club/orders/${c.id}`}?child=${child}`)
    },
    'kit-link': (fd, form) => {
      const e = String(fd.get('email') || '').trim()
      if (!e) return { email: 'Podaj e-mail.' }
      if (!emailOk(e)) return { email: 'Nieprawidłowy e-mail.' }
      const c = kitCampaign(form.dataset.campaign          )               
      const p = db.persons.find((x) => (x.email || '').toLowerCase() === e.toLowerCase())
      // Odpowiedź zawsze ta sama — nie zdradzamy, czy adres jest w klubie.
      if (p && c.status === 'open' && kitKids(c, p.id).length) { const tok = uid('kit'); db.kitTokens[tok] = { guardian: p.id, campaign: c.id }; mail(e, `Twój link do zamówienia — ${c.name}`, `Link jest osobisty i ważny do ${dShort(c.closes)}. Nie przekazuj go dalej.`, `/club/o/${tok}`, 'Otwórz formularz zamówienia') }
      ui.kitLinkSent = e; render()
    },
    'kit-campaign': (_fd, form, submitter) => {
      const d = readKitDraft(form); ui.kitDraft = JSON.stringify(d)
      const errs         = {}
      if (d.name.length < 3) errs.name = 'Nazwa: co najmniej 3 znaki.'
      if (!d.groups.length) errs.groups = 'Zaznacz co najmniej jedną grupę.'
      if (!d.closes) errs.closes = 'Pole wymagane'; else if (d.closes < TODAY) errs.closes = 'Termin zamknięcia nie może być w przeszłości.'
      if (!d.payDue) errs.payDue = 'Pole wymagane'; else if (d.closes && d.payDue < d.closes) errs.payDue = 'Termin płatności nie może być wcześniejszy niż zamknięcie zamówień.'
      if (!d.products.length) errs._ = 'Dodaj co najmniej jeden produkt.'
      if (d.products.filter((x) => x.kind === 'set').length > 1) errs._ = 'Formularz może mieć jeden komplet.'
      d.products.forEach((x, i) => {
        if (!x.name) errs[`pn-${i}`] = 'Podaj nazwę.'
        if (!(x.priceChild > 0)) errs[`pc-${i}`] = 'Cena musi być większa od zera.'
        if (x.kind === 'set' && (x.components || []).length < 2) errs[`pcomp-${i}`] = 'Komplet musi mieć co najmniej dwa produkty.'
        if (x.kind === 'item' && x.priceAdult !== undefined && !(x.priceAdult > 0)) errs[`pp-${i}`] = 'Cena musi być większa od zera.'
      })
      if (Object.keys(errs).length) return errs
      const intent = submitter?.value || 'draft'
      let c = d.id ? kitCampaign(d.id) : undefined
      if (c) Object.assign(c, d, { status: intent === 'open' && c.status === 'draft' ? 'open' : c.status })
      else { c = { ...d, id: uid('oc'), status: intent === 'open' ? 'open' : 'draft', createdBy: me() }; db.kitCampaigns.unshift(c) }
      const id = c.id
      delete ui.kitDraft; delete ui.kitDraftFor
      toast(intent === 'open' ? 'Zapisano i otwarto zbieranie zamówień.' : intent === 'save' ? 'Zapisano zmiany formularza.' : 'Zapisano szkic formularza.')
      go(`/backend/payments/orders/${id}`)
      if (intent === 'open') setTimeout(() => kitShareModal(id), 320)
    },
    login: (fd) => {
      const errs         = {}
      const e = String(fd.get('email') || '').trim(), pw = String(fd.get('password') || '')
      if (!e) errs.email = 'Podaj e-mail.'; else if (!emailOk(e)) errs.email = 'Nieprawidłowy e-mail.'
      if (!pw) errs.password = 'Podaj hasło.'
      if (Object.keys(errs).length) return errs
      const p = PERSONAS.find((x) => x.email === e)
      if (!p || pw.length < 4) return { _: 'Nieprawidłowy e-mail lub hasło.' }
      setPersona(p.id); toast(`Zalogowano: ${p.label}`)
      go(hasMemberRole(p.person          ) || p.features.includes('activities.coach') || p.features.includes('facilities.log.write') ? p.home : '/backend')
    },
    checkout: (fd) => {
      const ids = fd.getAll('charge').map(String)
      if (!ids.length) return { _: 'Zaznacz co najmniej jedną należność.' }
      go(`/stripe?ids=${ids.join(',')}`)
    },
    reply: (fd, form) => {
      const body = String(fd.get('body') || '').trim()
      if (!body) return { body: 'Wpisz treść odpowiedzi.' }
      const t = db.threads.find((x) => x.id === form.dataset.thread)          
      t.messages.push({ id: uid('m'), author: me(), role: isAdmin() ? 'administrator' : isCoachPersona() ? 'trener' : 'opiekun', body, at: `${TODAY} ${NOW}`, delivered: 3, failed: 0 })
      toast('Wysłano odpowiedź.'); render()
    },
    profile: (fd) => {
      const errs         = {}
      const e = String(fd.get('email') || ''), ph = String(fd.get('phone') || '')
      if (!e) errs.email = 'Pole wymagane'; else if (!emailOk(e)) errs.email = 'Nieprawidłowy e-mail.'
      if (ph && !phoneOk(ph)) errs.phone = 'Telefon w formacie 600 100 200.'
      if (Object.keys(errs).length) return errs
      const p = personById(db, me()); p.email = e; p.phone = ph; p.publishConsent = !!fd.get('publish')
      toast('Zapisano.'); render()
    },
    'link-request': (fd, form) => {
      const e = String(fd.get('email') || '').trim()
      if (!emailOk(e)) return { email: 'Nieprawidłowy e-mail.' }
      const occ = form.dataset.occ          
      const g = occ ? group((occById(occ)              ).group) : null
      const guardian = db.persons.find((p) => p.email === e && g && wardsOf(p.id).some((w) => g.members.includes(w)))
      if (guardian && occ) { const tok = uid('tok'); db.tokens[tok] = { guardian: guardian.id, occ }; mail(e, 'Twój link do deklaracji obecności', `Termin: ${(occById(occ)              ).name}. Link jest osobisty — nie przekazuj go dalej.`, `/club/d/${tok}`, 'Zadeklaruj obecność') }
      const formEl = document.querySelector('[data-form="link-request"]')               
      formEl.outerHTML = `<div class="alert success" role="status" style="margin-top:12px"><strong>Sprawdź skrzynkę</strong>Jeśli adres jest zapisany w klubie, wysłaliśmy osobisty link. (W mockupie: Skrzynka testowa w pasku u góry.)</div>`
      return { __keep: '' }
    },
    settings: (fd) => {
      const errs         = {}
      required(fd, ['name', 'short', 'slug'], errs)
      const slug = String(fd.get('slug') || '')
      if (slug && !/^[a-z0-9-]{3,40}$/.test(slug)) errs.slug = 'Małe litery, cyfry i myślniki, 3–40 znaków.'
      const age = Number(fd.get('minAge')); if (!(age >= 13 && age <= 18)) errs.minAge = 'Próg 13–18 lat.'
      if (Object.keys(errs).length) return errs
      Object.assign(db.settings, { name: String(fd.get('name')), short: String(fd.get('short')), slug, phone: String(fd.get('phone') || ''), minAge: age, description: String(fd.get('description') || '') })
      toast('Zapisano ustawienia.'); render()
    },
    publication: (fd) => {
      const keys = ['enabled', 'description_schedule', 'conditions', 'prices', 'coaches', 'materials', 'contact', 'places_calendar', 'online_requests']
      const next                          = Object.fromEntries(keys.map((k) => [k, !!fd.get(k)]))
      if (next.online_requests && !next.places_calendar) return { online_requests: 'Zgłoszenia online wymagają włączonego kalendarza obiektów.' }
      db.settings.publication = next; toast('Zapisano. Strona publiczna pokazuje teraz tylko włączone bloki.'); render()
    },
    section: (fd, form) => { const s = section(form.dataset.id          ); const n = String(fd.get('name') || s.name).trim(); if (n.length < 2) return { name: 'Nazwa: 2–80 znaków.' }; s.name = n; s.short = String(fd.get('short') || ''); s.description = String(fd.get('description') || ''); toast('Zapisano sekcję.'); render() },
    'section-public': (fd, form) => {
      const s = section(form.dataset.id          ); const errs         = {}
      const slug = String(fd.get('slug') || ''); if (!/^[a-z0-9-]{2,40}$/.test(slug)) errs.slug = 'Małe litery, cyfry, myślniki.'
      const ce = String(fd.get('contactEmail') || ''); if (ce && !emailOk(ce)) errs.contactEmail = 'Nieprawidłowy e-mail.'
      const cp = String(fd.get('contactPhone') || ''); if (cp && !phoneOk(cp)) errs.contactPhone = 'Telefon w formacie 600 100 200.'
      if (Object.keys(errs).length) return errs
      Object.assign(s, { isPublic: !!fd.get('isPublic'), slug, description: String(fd.get('description') || ''), conditions: String(fd.get('conditions') || ''), contactName: String(fd.get('contactName') || ''), contactEmail: ce, contactPhone: cp })
      toast('Zapisano treści publiczne sekcji.'); render()
    },
    group: (fd, form) => { const g = group(form.dataset.id          ); const kind = String(fd.get('kind')); if (kind === 'class_group' && (String(fd.get('category') || '') || String(fd.get('league') || ''))) return { category: 'Kategoria i liga tylko dla drużyny (422).' }; if (g.kind === 'team' && kind === 'class_group' && db.occurrences.some((o) => o.group === g.id && o.type === 'match')) return { kind: 'Grupa ma mecze — nie można zmienić rodzaju (409).' }; Object.assign(g, { name: String(fd.get('name')), kind, category: String(fd.get('category') || '') || undefined, league: String(fd.get('league') || '') || undefined, level: String(fd.get('level') || '') || undefined }); toast('Zapisano grupę.'); render() },
    'group-public': (fd, form) => { const g = group(form.dataset.id          ); const a = Number(fd.get('ageFrom')), b = Number(fd.get('ageTo')); if (fd.get('ageFrom') && fd.get('ageTo') && a > b) return { ageTo: 'Wiek „do” musi być ≥ wiek „od”.' }; Object.assign(g, { isPublic: !!fd.get('isPublic'), publicDescription: String(fd.get('publicDescription') || ''), conditions: String(fd.get('conditions') || ''), ageFrom: a || undefined, ageTo: b || undefined, level: String(fd.get('level') || '') || undefined }); toast('Zapisano.'); render() },
    person: (fd, form) => {
      const p = personById(db, form.dataset.id          )
      if (Number(form.dataset.version) !== p.updatedAt) { openModal({ title: 'Rekord zmienił się w międzyczasie (409)', submitLabel: 'Odśwież dane', body: '<p>Ktoś inny zapisał zmiany tej osoby po otwarciu formularza. Odśwież, aby zobaczyć aktualną wersję — Twoje niezapisane zmiany pokażemy obok.</p>', onSubmit: () => { render() } }); return { __keep: '' } }
      const errs         = {}; required(fd, ['first', 'last', 'birth'], errs)
      const pe = String(fd.get('pesel') || ''); if (can('people.pesel.view') && pe && !/^\d{11}$/.test(pe)) errs.pesel = 'PESEL: 11 cyfr; suma kontrolna i data urodzenia muszą się zgadzać.'
      const e = String(fd.get('email') || ''); if (e && !emailOk(e)) errs.email = 'Nieprawidłowy e-mail.'
      if (Object.keys(errs).length) return errs
      Object.assign(p, { first: String(fd.get('first')), last: String(fd.get('last')), birth: String(fd.get('birth')), phone: String(fd.get('phone') || ''), email: e }); if (can('people.pesel.view')) p.pesel = pe; p.updatedAt++
      toast('Zapisano.'); render()
    },
    wizard: (fd, _form, submitter) => {
      const f = { group: String(fd.get('group')), type: String(fd.get('type')), name: String(fd.get('name') || ''), place: String(fd.get('place')), coach: String(fd.get('coach') || ''), days: fd.getAll('days').map(String), start: String(fd.get('start') || ''), end: String(fd.get('end') || ''), from: String(fd.get('from') || ''), to: String(fd.get('to') || '') }
      ui.wizard = JSON.stringify(f)
      const errs         = {}
      required(fd, ['group', 'type', 'name', 'place', 'start', 'end', 'from', 'to'], errs)
      if (!f.days.length) errs.days = 'Wybierz co najmniej jeden dzień.'
      if (f.start && f.end && toMin(f.end) <= toMin(f.start)) errs.end = 'Koniec musi być po początku.'
      if (f.from && f.to && f.to < f.from) errs.to = 'Data „do” musi być ≥ data „od”.'
      if (['match', 'sparring'].includes(f.type) && group(f.group).kind !== 'team') errs.type = 'Mecz i sparing tylko dla drużyny (422).'
      if (Object.keys(errs).length) { delete ui.preview; return errs }
      const dates           = []
      for (let d = f.from; d <= f.to && dates.length < 60; d = addDays(d, 1)) if (f.days.includes(String(weekday(d)))) dates.push(d)
      if (!dates.length) { delete ui.preview; return { _: 'Reguła nie daje żadnego terminu w wybranym okresie.' } }
      const confl           = []
      for (const d of dates) for (const c of conflicts(f.place, d, toMin(f.start), toMin(f.end), { capacity: true })) confl.push(`${dShort(d)} ${fromMin(c.from)}–${fromMin(c.to)} — ${c.label}`)
      ui.preview = JSON.stringify({ dates, conflicts: confl.slice(0, 8) })
      if (submitter?.value === 'create') {
        if (confl.length) { render(); return }
        const a           = { id: uid('a'), group: f.group, name: f.name, type: f.type           , weekdays: f.days.map(Number), start: f.start, end: f.end, place: f.place, coach: f.coach || null, from: f.from, to: f.to }
        db.activities.push(a); const created = generateOccurrences(db, a, f.from, addDays(TODAY, 16 * 7))
        delete ui.preview; delete ui.wizard
        toast(`Utworzono serię — wygenerowano ${created.length} terminów na horyzont 16 tygodni.`)
        go(`/backend/activities/occurrences?activity=${a.id}&view=all`)
        return
      }
      render()
    },
    modal: (fd, form) => {
      if (!modal?.onSubmit) { closeModal(); return }
      const res = modal.onSubmit(fd, form)
      if (res && Object.keys(res).length && !('__keep' in res)) return res
      if (!res || !('__keep' in res)) closeModal()
    },
  }

  // ═══════════════════════════════════════════════════════════════════
  // Zdarzenia
  // ═══════════════════════════════════════════════════════════════════
  document.addEventListener('click', (ev) => {
    const el = (ev.target               ).closest('[data-action]')                      
    if (!el) return
    const fn = ACTIONS[el.dataset.action          ]
    if (fn) fn(el, ev)
  })
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { if (modal) closeModal(); else if (drawer) { drawer = null; renderDrawer() } }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter' && modal) { const f = document.querySelector('[data-form="modal"]')                          ; f?.requestSubmit() }
    const t = ev.target               
    if ((ev.key === 'Enter' || ev.key === ' ') && t.dataset.action === 'slot') { ev.preventDefault(); t.click() }
  })
  document.addEventListener('submit', (ev) => {
    const form = ev.target                   
    const name = form.dataset.form
    if (!name || !FORMS[name]) return
    ev.preventDefault()
    const submitter = (ev               ).submitter                            
    const fd = new FormData(form)
    const res = FORMS[name](fd, form, submitter)
    if (res && Object.keys(res).length && !('__keep' in res)) applyErrors(form, res)
  })
  document.addEventListener('change', (ev) => {
    const el = ev.target                                        
    const k = el.dataset.change
    if (!k) return
    if (k === 'persona') { setPersona(el.value             ); drawer = null; go(persona().home) }
    if (k === 'demo') { demoState = el.value             ; render() }
    if (k === 'ctx') { coachCtx = el.value === 'coach'; render() }
    if (k === 'consent') { const g = db.guardianships.find((x) => x.id === el.dataset.gs)                ; (g.consents                           )[el.dataset.key          ] = (el                    ).checked; toast('Zapisano zgodę.') }
    if (k === 'chip') { (el.closest('.chip')               ).classList.toggle('on', (el                    ).checked) }
    if (k === 'wizard-group') { const form = el.closest('form')                   ; const fd = new FormData(form); ui.wizard = JSON.stringify({ group: el.value, type: String(fd.get('type')), name: String(fd.get('name')), place: String(fd.get('place')), coach: String(fd.get('coach')), days: fd.getAll('days').map(String), start: String(fd.get('start')), end: String(fd.get('end')), from: String(fd.get('from')), to: String(fd.get('to')) }); delete ui.preview; render() }
    if (k === 'cash-payer') { ui.cashPayer = el.value; const body = el.closest('.modal-body') || el.closest('form'); if (body) { const keepModal = !!el.closest('.modal-body'); (keepModal ? body : body).innerHTML = (keepModal ? '<div class="form-general"></div>' : '') + cashForm(el.value, keepModal) } }
    if (k === 'cash-sum') { const form = el.closest('form')                   ; const ids = new FormData(form).getAll('charges').map(String); const sum = db.charges.filter((c) => ids.includes(c.id)).reduce((a, c) => a + remaining(c), 0); (document.getElementById('cash-amount')                    ).value = String(sum / 100) }
    if (k === 'autobook') { db.settings.autoBook = (el                    ).checked; toast((el                    ).checked ? 'Pewne dopasowania będą księgowane automatycznie.' : 'Każdy przelew będzie wymagał potwierdzenia.') }
    if (k === 'bank-file') { const f = (el                    ).files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => { try { const rows = parseCsv(String(reader.result)); if (!rows.length) throw new Error('Plik nie zawiera pozycji.'); const imp = importStatement(f.name, rows); toast(`Zaimportowano ${imp.total} pozycji: automatycznie ${imp.booked}, do potwierdzenia ${imp.suggested}, niedopasowane ${imp.unmatched}, pominięte ${imp.skipped}.`); render() } catch (e) { const field = (el               ).closest('[data-field]')               ; field.classList.add('invalid'); field.querySelector('.field-error')?.remove(); const pe = document.createElement('p'); pe.className = 'field-error'; pe.textContent = `Nie udało się wczytać pliku: ${(e         ).message}`; field.appendChild(pe) } }; reader.readAsText(f, 'utf-8') }
    if (k === 'avail-mode') { document.querySelectorAll('#modal [data-am]').forEach((d) => { (d               ).hidden = (d               ).dataset.am !== el.value }) }
    if (k === 'slot-mode') { document.querySelectorAll('#modal [data-mode]').forEach((d) => { (d               ).hidden = (d               ).dataset.mode !== el.value }) }
    if (k === 'pay-sum') { const form = el.closest('form')                   ; const ids = new FormData(form).getAll('charge').map(String); const sum = db.charges.filter((c) => ids.includes(c.id)).reduce((s, c) => s + remaining(c), 0); (document.getElementById('pay-btn')                     ).textContent = `Zapłać ${zl(sum)}` }
    if (k === 'logo-upload') {
      const input = el                    
      const f = input.files ? input.files[0] : undefined
      const field = input.closest('[data-field]')               
      const fail = (m        )       => { field.classList.add('invalid'); field.querySelector('.field-error')?.remove(); const pe = document.createElement('p'); pe.className = 'field-error'; pe.textContent = m; field.appendChild(pe); input.value = '' }
      if (!f) return
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) { fail('Dozwolone formaty: PNG, JPG, WebP. Plik SVG lub inny jest odrzucany (422).'); return }
      if (f.size > 2 * 1024 * 1024) { fail(`Plik ma ${(f.size / 1048576).toFixed(1)} MB — limit to 2 MB (422).`); return }
      const reader = new FileReader()
      reader.onload = () => { const url = String(reader.result); const t = input.dataset.target          ; if (t === 'club') db.settings.logo = url; else section(t).logo = url; toast(t === 'club' ? 'Wgrano logo klubu.' : 'Wgrano logo sekcji.'); render() }
      reader.readAsDataURL(f)
    }
    if (k === 'kit-recalc') { const form = el.closest('form')                   ; const c = kitCampaign(form.dataset.campaign          )               ; const fd = new FormData(form); const res = kitPrice(c, Object.fromEntries(c.products.filter((p) => p.kind === 'item').map((p) => [p.id, String(fd.get(`p-${p.id}`) || '')])), !!fd.get('set')); (document.getElementById('kit-total')               ).textContent = zl(res.total) }
    if (k === 'kit-redraw') kitDraftEdit(() => undefined)
    if (k === 'kit-section') kitDraftEdit((d) => { d.groups = [] })
    if (k === 'units-month') go(`/backend/activities/units?month=${el.value}`)
    if (k === 'report-place') go(`/backend/facilities/report?place=${el.value}`)
  })
  document.addEventListener('input', (ev) => {
    const el = ev.target                    
    if (el.dataset.input === 'person-search') { ui.personSearch = el.value; const pos = el.selectionStart; render(); const n = document.getElementById('person-search')                    ; n.focus(); n.setSelectionRange(pos, pos) }
  })
  window.addEventListener('hashchange', () => { if (modal) closeModal(); render() })
  render()
})()
