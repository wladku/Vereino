// Vereino — clickable mockups (UX concept v0.1).
// Source: docs/ux-concept/README.md + .ai/specs/2026-10-20-vereino-club-management.md
// Build: node docs/ux-concept/mockups/build.mjs  →  app.js (TypeScript with type annotations only) + i18n.js (UI catalogs from i18n/*.json).
// UI text lives in i18n/<lang>.json (English is the source catalog); club content (seed data) stays in the club's language.

(() => {
  // ═══════════════════════════════════════════════════════════════════
  // Types
  // ═══════════════════════════════════════════════════════════════════
  type DemoState = 'normal' | 'loading' | 'empty' | 'error'
  type PersonaId = 'kasia' | 'ola' | 'wojtek' | 'anna' | 'aneta' | 'beata' | 'tomek' | 'guest'
  type ShellKind = 'member' | 'backend' | 'public' | 'bare'
  type Errors = Record<string, string>
  type OccType = 'training' | 'match' | 'sparring' | 'tournament' | 'camp' | 'other'
  type Zone = 'public_free' | 'club_training' | 'reservable_paid' | 'closed'
  // Deferred UI text: stored system-generated text (charge descriptions, mails, thread labels, bank match reasons)
  // keeps the catalog key + params and is translated at render time with txt(), so switching the language re-translates it.
  type TxtArg = string | number | { date: string; fmt?: 'short' | 'long' } | { money: number } | Txt
  type Txt = string | { k: string; p?: Record<string, TxtArg> } | Txt[]

  interface Person { id: string; first: string; last: string; birth: string; email?: string; phone?: string; account?: boolean; publishConsent?: boolean; pesel?: string; updatedAt: number }
  interface Guardianship { id: string; guardian: string; ward: string; relation: string; primaryPayer: boolean; consents: { regulations: boolean; image: boolean; trips: boolean } }
  interface RoleAssignment { id: string; person: string; role: 'club_admin' | 'treasurer' | 'coordinator' | 'coach' | 'facility_operator'; section?: string; place?: string }
  interface Section { id: string; name: string; slug: string; short: string; description: string; isPublic: boolean; conditions: string; contactName: string; contactEmail: string; contactPhone: string; materials: string[]; active: boolean; color: string; logo?: string; updatedAt: number }
  interface Place { id: string; parent?: string; name: string; kind: string; slug?: string; publicSchedule: boolean; acceptsRequests: boolean; capacity: number; address: string; surface?: string; external?: boolean }
  interface Group { id: string; section: string; name: string; kind: 'team' | 'class_group'; category?: string; league?: string; season?: string; ageFrom?: number; ageTo?: number; level?: string; isPublic: boolean; publicDescription: string; conditions: string; members: string[]; coaches: string[] }
  interface Activity { id: string; group: string; name: string; type: OccType; weekdays: number[]; start: string; end: string; place: string; coach: string | null; from: string; to: string; opponent?: string; oneOff?: boolean; invited?: string[]; info?: string[]; gather?: string; confirmBy?: string }
  interface Occurrence { id: string; activity: string; group: string; name: string; type: OccType; date: string; start: string; end: string; place: string; coach: string | null; defaultCoach: string | null; status: 'planned' | 'done' | 'cancelled'; cancelReason?: string; opponent?: string; invited?: string[]; detached?: boolean; gather?: string; confirmBy?: string; updatedAt: number }
  interface Attendance { declared: 'yes' | 'no' | 'unknown'; status: 'final' | 'pending_guardian' | 'rejected_by_guardian'; actual?: 'present' | 'absent' | 'late' | null; by?: string }
  interface Substitution { occ: string; prev: string | null; next: string | null; kind: string; at: string; by: string; reason?: string }
  interface Msg { id: string; author: string; role: 'coach' | 'guardian' | 'admin'; body: Txt; at: string; delivered: number; failed: number }
  interface Thread { id: string; scope: 'club' | 'section' | 'group' | 'occurrence' | 'direct'; scopeId: string; scopeLabel: Txt; subject: Txt; isCase: boolean; messages: Msg[]; readBy: string[] }
  interface Fee { id: string; name: string; group: string; amount: number; dueDay: number; period: string }
  interface Charge { id: string; source: 'fee' | 'rental' | 'order'; sourceId: string; person?: string; payerPerson?: string; payerInstitution?: string; payerMissing?: boolean; description: Txt; period?: string; amount: number; discount: number; discountName?: Txt; due: string; payee: 'club' | 'owner_institution'; status: 'open' | 'partially_paid' | 'paid' | 'cancelled' | 'forfeited'; payments: Pay[]; updatedAt: number }
  // method: 'cash' | 'transfer' | 'online' (label: t(`pay.method.${method}`)); the payee (club / owner institution) comes from the charge.
  // settled: 'club_cash' (taken directly by the club cash desk) or the cash handover (RG) number.
  interface Pay { amount: number; method: 'cash' | 'transfer' | 'online'; date: string; ref?: string; by?: string; receipt?: string; bankTx?: string; settled?: string }
  interface BankTx { id: string; importId: string; date: string; amount: number; sender: string; title: string; hash: string; status: 'booked' | 'suggested' | 'unmatched' | 'ignored'; payer?: string; alloc: { chargeId: string; amount: number }[]; reason: Txt; auto?: boolean }
  interface BankImport { id: string; file: string; at: string; by: string; total: number; booked: number; suggested: number; unmatched: number; skipped: number }
  // Order campaigns (e.g. kit) — REQ-032, REQ-033.
  interface KitProduct { id: string; name: string; kind: 'item' | 'set'; components?: string[]; sizesChild: string[]; sizesAdult: string[]; priceChild: number; priceAdult?: number; required: boolean }
  interface KitCampaign { id: string; name: string; description: string; section: string; groups: string[]; closes: string; payDue: string; status: 'draft' | 'open' | 'closed' | 'ordered' | 'delivered' | 'completed'; printName: boolean; printNumber: boolean; notesLabel: string; products: KitProduct[]; supplier: string; createdBy: string }
  interface KitLine { product: string; size: string; sizes?: Record<string, string>; price: number }
  interface KitOrder { id: string; campaign: string; child: string; by: string; email: string; phone: string; printName: string; printNumber: string; notes: string; lines: KitLine[]; chargeId: string; at: string; status: 'submitted' | 'cancelled'; via: 'app' | 'email_link'; handedAt?: string; handedBy?: string }
  interface CashHandover { id: string; number: string; collector: string; at: string; by: string; amount: number; count: number }
  interface Rental { id: string; place: string; renter: string; renterId?: string; category: string; contact: string; email: string; phone: string; date: string; start: string; end: string; units: number; amount: number; status: string; via: string; holdUntil?: string; purpose?: string; token?: string; chargeId?: string; reason?: string; banMatch?: boolean }
  interface Booking { id: string; place: string; date: string; start: string; end: string; purpose: string; by: string; section: string; status: 'confirmed' | 'cancelled' }
  interface Closure { id: string; place: string; date: string; start: string; end: string; reason: string; note: string }
  interface Mail { id: number; to: string; subject: Txt; body: Txt; link?: string; linkLabel?: Txt }
  // label: the person's name (club data); the guest label and all role descriptions come from the catalog (personaLabel / personaRole).
  interface Persona { id: PersonaId; person?: string; label: string; roleKey: string; features: string[]; home: string; email?: string }
  interface ModalSpec { title: string; body: string; submitLabel?: string; danger?: boolean; wide?: boolean; onSubmit?: (fd: FormData, form: HTMLFormElement) => Errors | void; noFooter?: boolean }
  interface RouteDef { pattern: string; id: string; name: string; shell: ShellKind; api: string[]; render: (p: Record<string, string>, q: URLSearchParams) => string; empty?: [string, string]; persona?: boolean; feature?: string; back?: string; guestOk?: boolean }

  // ═══════════════════════════════════════════════════════════════════
  // Internationalization
  // ═══════════════════════════════════════════════════════════════════
  // Catalogs: i18n/<lang>.json → build.mjs → i18n.js (window.VEREINO_I18N = { en: {...}, pl: {...} }).
  // Flat keys ("nav.today"); "_meta": { "name": "English" } names the language in the switcher.
  // A value is a string with {placeholders} or a plural object ({ one, few, many, other }) selected by params.n (Intl.PluralRules).
  // Never call t() at module load time for text that is displayed later — store a key (or a Txt via lt()) and translate at render time.
  type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>
  type Catalog = Record<string, string | PluralForms>
  const CATALOGS = ((window as unknown as { VEREINO_I18N?: Record<string, Catalog> }).VEREINO_I18N || {}) as Record<string, Catalog>
  const FALLBACK_LANG = 'en'
  const LANGS = Object.keys(CATALOGS)
  const langName = (code: string): string => ((CATALOGS[code] || {})._meta as { name?: string } | undefined)?.name || code
  function detectLang(): string {
    let saved: string | null = null
    try { saved = localStorage.getItem('vereino.lang') } catch { /* storage unavailable */ }
    if (saved && CATALOGS[saved]) return saved
    const nav = (navigator.language || '').toLowerCase()
    return nav.startsWith('pl') && CATALOGS.pl ? 'pl' : FALLBACK_LANG
  }
  let lang = detectLang()
  let pluralRules = new Intl.PluralRules(lang)
  document.documentElement.lang = lang
  const lookup = (key: string): string | PluralForms | undefined => (key === '_meta' ? undefined : CATALOGS[lang]?.[key] ?? CATALOGS[FALLBACK_LANG]?.[key])
  // Translate a UI key. Params are inserted verbatim (escape HTML-bound values with esc() before passing them).
  function t(key: string, params?: Record<string, unknown>): string {
    const v = lookup(key)
    if (v === undefined) return key
    let s: string
    if (typeof v === 'string') s = v
    else { const n = Number(params?.n ?? 0); s = v[pluralRules.select(n)] ?? v.other ?? v.many ?? v.one ?? key }
    return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s
  }
  // Deferred text: lt(key, params) stores a key; ld(date) / lm(grosze) are params formatted in the current language.
  const lt = (k: string, p?: Record<string, TxtArg>): Txt => (p ? { k, p } : { k })
  const ld = (date: string, fmt: 'short' | 'long' = 'short'): TxtArg => ({ date, fmt })
  const lm = (money: number): TxtArg => ({ money })
  function txtArg(a: TxtArg): string | number {
    if (typeof a === 'string' || typeof a === 'number') return a
    if (Array.isArray(a)) return txt(a)
    if ('date' in a) return a.fmt === 'long' ? dLong(a.date) : dShort(a.date)
    if ('money' in a) return zl(a.money)
    return txt(a)
  }
  // Resolve stored text (plain string = content, kept as is; {k, p} = catalog key; array = concatenation).
  function txt(v: Txt | null | undefined): string {
    if (v == null) return ''
    if (typeof v === 'string') return v
    if (Array.isArray(v)) return v.map(txt).join('')
    if (!v.p) return t(v.k)
    const p: Record<string, unknown> = {}
    for (const [k, a] of Object.entries(v.p)) p[k] = txtArg(a)
    return t(v.k, p)
  }
  const tList = (key: string): string[] => t(key).split('|')

  // ═══════════════════════════════════════════════════════════════════
  // Demo time
  // ═══════════════════════════════════════════════════════════════════
  const TODAY = '2026-11-10' // Tuesday
  const NOW = '15:30'
  // Weekday names: index 0 = Sunday … 6 = Saturday (Date.getUTCDay); weekday() below returns 1 = Monday … 7 = Sunday.
  const wdShort = (i: number): string => tList('date.weekdaysShort')[i % 7]
  const wdLong = (i: number): string => tList('date.weekdaysLong')[i % 7]
  const numLocale = (): string => t('locale.number')

  const toMin = (hm: string): number => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
  const fromMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const parseDate = (d: string): Date => new Date(`${d}T12:00:00Z`)
  const iso = (dt: Date): string => dt.toISOString().slice(0, 10)
  const addDays = (d: string, n: number): string => { const x = parseDate(d); x.setUTCDate(x.getUTCDate() + n); return iso(x) }
  const weekday = (d: string): number => { const w = parseDate(d).getUTCDay(); return w === 0 ? 7 : w } // 1 = Monday … 7 = Sunday
  // Date patterns come from the catalog (date.fmtShort / date.fmtLong / date.fmtMonth), e.g. pl "wt 10.11", en "Tue 10 Nov".
  function fmtDate(d: string, key: string): string {
    const x = parseDate(d); const day = x.getUTCDate(); const mon = x.getUTCMonth()
    return t(key, { wd: wdShort(x.getUTCDay()), wdl: wdLong(x.getUTCDay()), d: day, dd: String(day).padStart(2, '0'), m: mon + 1, mm: String(mon + 1).padStart(2, '0'), mon: tList('date.monthsShort')[mon], month: tList('date.monthsLong')[mon], yyyy: x.getUTCFullYear() })
  }
  const dShort = (d: string): string => fmtDate(d, 'date.fmtShort')
  const dLong = (d: string): string => fmtDate(d, 'date.fmtLong')
  const fmtMonth = (ym: string): string => fmtDate(`${ym}-01`, 'date.fmtMonth') // 'YYYY-MM' → e.g. "listopad 2026" / "November 2026"
  const mondayOf = (d: string): string => addDays(d, 1 - weekday(d))
  const ageOn = (birth: string, on: string = TODAY): number => {
    const b = parseDate(birth); const o = parseDate(on)
    let a = o.getUTCFullYear() - b.getUTCFullYear()
    if (o.getUTCMonth() < b.getUTCMonth() || (o.getUTCMonth() === b.getUTCMonth() && o.getUTCDate() < b.getUTCDate())) a--
    return a
  }
  // Money is always PLN; the pattern follows the UI language (pl "120 zł", en "PLN 120").
  const zl = (grosze: number): string => t('money.pln', { amount: (grosze / 100).toLocaleString(numLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 }) })
  const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  const uid = (p: string): string => `${p}-${Math.random().toString(36).slice(2, 8)}`
  const overlap = (a1: number, a2: number, b1: number, b2: number): boolean => a1 < b2 && b1 < a2

  // ═══════════════════════════════════════════════════════════════════
  // Demo data (club content stays in Polish — it is the club's own data, not UI text)
  // ═══════════════════════════════════════════════════════════════════
  // Club logo: file logo-klubu.(png|jpg|webp) next to the mockups → logo.js (window.VEREINO_LOGO); without a file — a sample star.
  const LOGO_CLUB = (window as unknown as { VEREINO_LOGO?: string }).VEREINO_LOGO || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1f6f43"/><path d="M32 12l5.9 12 13.1 1.9-9.5 9.3 2.2 13.1L32 42.1l-11.7 6.2 2.2-13.1-9.5-9.3 13.1-1.9z" fill="#ffd34d"/></svg>')
  const LOGO_BASEN = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1d5fa8"/><path d="M8 38c6 0 6-5 12-5s6 5 12 5 6-5 12-5 6 5 12 5M8 48c6 0 6-5 12-5s6 5 12 5 6-5 12-5 6 5 12 5" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="40" cy="20" r="6" fill="#fff"/></svg>')
  const LOGO_ZUMBA = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#b8478f"/><path d="M27 45V19l19-5v26" stroke="#fff" stroke-width="4" fill="none" stroke-linejoin="round"/><path d="M27 19l19-5" stroke="#fff" stroke-width="7" stroke-linecap="round"/><ellipse cx="21.5" cy="45" rx="6.5" ry="5" fill="#fff"/><ellipse cx="40.5" cy="40" rx="6.5" ry="5" fill="#fff"/><path d="M10 24c-3 4-3 9 0 13M54 30c3 4 3 9 0 13" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>')
  const LOGO_SZACHY = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#4a5060"/><path d="M22 47c0-8 4-12 9-17l-6 2-4 3-4-3 3-9 7-7 2-5 3 4c8 1 13 7 13 16 0 7-2 10-1 16z" fill="#fff"/><rect x="17" y="47" width="30" height="7" rx="2.5" fill="#fff"/><circle cx="29" cy="20" r="2" fill="#4a5060"/></svg>')
  const LOGO_CHEER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#d47a1f"/><path d="M24 33l4 18M40 33l-4 18" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="21" cy="24" r="8" fill="none" stroke="#fff" stroke-width="9" stroke-dasharray="2.6 1.6"/><circle cx="43" cy="24" r="8" fill="none" stroke="#fff" stroke-width="9" stroke-dasharray="2.6 1.6"/><circle cx="21" cy="24" r="4" fill="#fff"/><circle cx="43" cy="24" r="4" fill="#fff"/></svg>')

  interface ZoneRule { days: number[]; from: string; to: string; zone: Zone; priority: number; validFrom?: string; validTo?: string; source?: 'rules' | 'availability' }
  // Opening hours from the Orlik rules — the outer bound for booking availability.
  const OPENING: Record<string, { weekday: [string, string]; weekend: [string, string] }> = { 'pl-boisko': { weekday: ['08:00', '22:00'], weekend: ['09:00', '20:30'] }, 'pl-multi': { weekday: ['08:00', '22:00'], weekend: ['09:00', '20:30'] } }

  interface Db {
    settings: { name: string; short: string; slug: string; tz: string; minAge: number; phone: string; description: string; publication: Record<string, boolean>; logo?: string; autoBook?: boolean; coachFees?: 'none' | 'view' | 'collect'; onlineFee: { mode: 'club_pays' | 'payer_pays'; fixed: number }; updatedAt: number }
    persons: Person[]; guardianships: Guardianship[]; roles: RoleAssignment[]
    sections: Section[]; places: Place[]; institutions: { id: string; name: string; type: string; contact: string; bank?: string }[]
    contracts: { id: string; party: string; kind: string; from: string; base: number; unit: number; match: number; travel: number; note?: string }[]
    groups: Group[]; externalTeams: { id: string; name: string }[]
    activities: Activity[]; occurrences: Occurrence[]; attendance: Record<string, Record<string, Attendance>>; substitutions: Substitution[]
    policies: { id: string; scope: string; target: string; mode: string; hours: number; after: string }[]
    threads: Thread[]; fees: Fee[]; discounts: { id: string; name: string; kind: string; percent: number }[]; charges: Charge[]
    zones: Record<string, ZoneRule[]>
    rates: { place: string; category: string; label: string; price: number }[]
    rentals: Rental[]; bookings: Booking[]; closures: Closure[]
    logs: { id: string; date: string; operator: string; opened?: string; closed?: string; before?: string; after?: string; remarks?: string }[]
    incidents: { id: string; date: string; place: string; kind: string; description: string; action: string; by: string }[]
    bans: { id: string; subject: string; from: string; to: string; reason: string; by: string }[]
    maintenance: { id: string; place: string; kind: string; responsible: string; due: string; done?: string }[]
    mails: Mail[]; tokens: Record<string, { guardian: string; occ: string; expired?: boolean }>
    bankImports: BankImport[]; bankTx: BankTx[]; receiptSeq: number
    kitCampaigns: KitCampaign[]; kitOrders: KitOrder[]; kitTokens: Record<string, { guardian: string; campaign: string }>; cashHandovers: CashHandover[]
    log: { opened: boolean; closed: boolean; before: string; after: string; openedAt?: string }
  }

  const P = (id: string, first: string, last: string, birth: string, extra: Partial<Person> = {}): Person => ({ id, first, last, birth, updatedAt: 1, ...extra })

  function seed(): Db {
    const db: Db = {
      settings: {
        name: 'LKS Gwiazda Ściejowice', short: 'Gwiazda', slug: 'gwiazda', tz: 'Europe/Warsaw', minAge: 13, phone: '600 000 000', logo: LOGO_CLUB,
        description: 'Klub sportowy z Ściejowic: akademia piłkarska dla dzieci i młodzieży, sekcja pływacka i zajęcia ruchowe dla dorosłych. Administrujemy Orlikiem 2024 w imieniu Gminy Liszki.',
        publication: { enabled: true, description_schedule: true, conditions: true, prices: true, coaches: true, materials: true, contact: true, places_calendar: true, online_requests: true },
        // Online payment fee (R13): the club pays it by default; the example operator fee is the ~PLN 2 per payment a parent named in an interview.
        coachFees: 'collect', onlineFee: { mode: 'club_pays', fixed: 200 }, updatedAt: 1,
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
        P('p-beata', 'Beata', 'Zając', '1978-03-15', { email: 'skarbnik@gwiazda.example', phone: '603 444 555', account: true }),
      ],
      guardianships: [
        { id: 'gs-1', guardian: 'p-kasia', ward: 'p-jas', relation: 'parent', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-2', guardian: 'p-kasia', ward: 'p-ola', relation: 'parent', primaryPayer: true, consents: { regulations: true, image: false, trips: true } },
        { id: 'gs-3', guardian: 'p-marek', ward: 'p-adam', relation: 'parent', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-4', guardian: 'p-marek', ward: 'p-zosia', relation: 'parent', primaryPayer: true, consents: { regulations: true, image: true, trips: false } },
        { id: 'gs-5', guardian: 'p-ewelina', ward: 'p-bartek', relation: 'parent', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-6', guardian: 'p-robert', ward: 'p-lena', relation: 'parent', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-7', guardian: 'p-iwona', ward: 'p-kuba', relation: 'parent', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-8', guardian: 'p-iwona', ward: 'p-maja', relation: 'parent', primaryPayer: true, consents: { regulations: true, image: true, trips: true } },
        { id: 'gs-9', guardian: 'p-robert', ward: 'p-filip', relation: 'other', primaryPayer: false, consents: { regulations: true, image: false, trips: false } },
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
        { id: 'ra-14', person: 'p-ewa', role: 'coordinator', section: 's-zumba' }, { id: 'ra-16', person: 'p-beata', role: 'treasurer' }, { id: 'ra-15', person: 'p-natalia', role: 'coordinator', section: 's-cheer' },
      ],
      sections: [
        { id: 's-akad', name: 'Akademia piłkarska', slug: 'akademia', short: 'Piłka nożna dla dzieci i młodzieży od 4 lat — osiem grup rocznikowych, od Kids do Trampkarza.', description: 'Akademia Gwiazdy: treningi na boisku Gwiazdy Ściejowice według programu PZPN „Grassroots” — radość z gry, technika i współpraca. Drużyny grają w ligach OZPN.', isPublic: true, conditions: 'Deklaracja członkowska, badania lekarskie (od kategorii Trampkarz), strój sportowy, obuwie na sztuczną murawę.', contactName: 'Akademia Gwiazdy', contactEmail: 'akademiagwiazdy@gmail.com', contactPhone: '608 07 29 29', materials: ['Regulamin akademii (PDF)', 'Deklaracja członkowska (PDF)', 'Grafik treningów (PDF)'], active: true, color: 'akad', updatedAt: 1 },
        { id: 's-basen', logo: LOGO_BASEN, name: 'Basen', slug: 'basen', short: 'Nauka i doskonalenie pływania dla dzieci 6–12 lat.', description: 'Zajęcia w małych grupach na basenie zewnętrznym, z instruktorkami pływania. Zimą zajęcia na krytej pływalni partnerskiej.', isPublic: true, conditions: 'Strój kąpielowy, czepek, klapki, ręcznik. Dziecko musi być zdrowe — zaświadczenie lekarskie przy zapisie.', contactName: 'Aneta Wiśniewska — koordynatorka', contactEmail: 'basen@gwiazda.example', contactPhone: '602 333 444', materials: ['Regulamin sekcji pływackiej (PDF)'], active: true, color: 'basen', updatedAt: 1 },
        { id: 's-zumba', logo: LOGO_ZUMBA, name: 'Zumba', slug: 'zumba', short: 'Taniec fitness przy muzyce latino dla młodzieży i dorosłych.', description: 'Godzina dobrej energii w salce klubowej — bez wymagań, w przyjaznej atmosferze.', isPublic: true, conditions: 'Wygodny strój i buty sportowe, woda. Od 16 lat.', contactName: 'Ewa Dąbrowska — instruktorka', contactEmail: 'zumba@gwiazda.example', contactPhone: '600 000 000', materials: [], active: true, color: 'zumba', updatedAt: 1 },
        { id: 's-szachy', logo: LOGO_SZACHY, name: 'Szachy', slug: 'szachy', short: 'Nauka gry w szachy dla dzieci od 7 lat i dorosłych.', description: 'Zasady, taktyka i turnieje klubowe. Zajęcia w salce klubowej.', isPublic: true, conditions: 'Bez wymagań — szachownice zapewnia klub.', contactName: 'Biuro klubu', contactEmail: 'biuro@gwiazda.example', contactPhone: '600 000 000', materials: ['Regulamin turnieju klubowego (PDF)'], active: true, color: 'szachy', updatedAt: 1 },
        { id: 's-cheer', logo: LOGO_CHEER, name: 'Cheerleader', slug: 'cheerleader', short: 'Taniec, akrobatyka i doping na meczach klubu dla dziewcząt i chłopców 8–14 lat.', description: 'Układy taneczne z pomponami, elementy akrobatyki i występy podczas meczów Gwiazdy.', isPublic: true, conditions: 'Strój sportowy, obuwie na halę. Pompony zapewnia klub.', contactName: 'Natalia Krawczyk — trenerka', contactEmail: 'cheer@gwiazda.example', contactPhone: '600 000 000', materials: [], active: true, color: 'cheer', updatedAt: 1 },
      ],
      places: [
        { id: 'pl-orlik', name: 'Orlik 2024', kind: 'complex', publicSchedule: false, acceptsRequests: false, capacity: 1, address: 'ul. Sportowa 1, Ściejowice' },
        { id: 'pl-boisko', parent: 'pl-orlik', name: 'Boisko piłkarskie', kind: 'pitch', slug: 'orlik-boisko', publicSchedule: true, acceptsRequests: true, capacity: 2, address: 'ul. Sportowa 1, Ściejowice', surface: 'sztuczna trawa' },
        { id: 'pl-multi', parent: 'pl-orlik', name: 'Boisko wielofunkcyjne', kind: 'multi_pitch', slug: 'orlik-wielofunkcyjne', publicSchedule: true, acceptsRequests: true, capacity: 2, address: 'ul. Sportowa 1, Ściejowice', surface: 'poliuretan' },
        { id: 'pl-salka', name: 'Salka w budynku klubowym', kind: 'hall', slug: 'salka', publicSchedule: true, acceptsRequests: false, capacity: 1, address: 'Budynek klubowy, Ściejowice' },
        { id: 'pl-basen', name: 'Basen zewnętrzny', kind: 'pool', slug: 'basen', publicSchedule: false, acceptsRequests: false, capacity: 2, address: 'Pływalnia partnerska, Liszki' },
        { id: 'pl-liszki', name: 'Boisko Wisły Liszki', kind: 'pitch', publicSchedule: false, acceptsRequests: false, capacity: 1, address: 'Boisko sportowe, Liszki', external: true },
      ],
      institutions: [
        { id: 'i-gmina', name: 'Gmina Liszki', type: 'municipality', contact: 'Referat Sportu, 12 000 00 00', bank: 'PL 12 1240 0000 0000 0000 1234 5678' },
        { id: 'i-sasiedzi', name: 'KS Sąsiedzi', type: 'club', contact: 'Jan Nowicki, 603 000 111' },
        { id: 'i-abak', name: 'Abak sp. z o.o.', type: 'company', contact: 'Recepcja, 12 345 67 89' },
        { id: 'i-szkola', name: 'SP Ściejowice', type: 'school', contact: 'Sekretariat, 12 111 22 33' },
      ],
      contracts: [
        { id: 'k-1', party: 'p-wojtek', kind: 'coach', from: '2026-09-01', base: 120000, unit: 6000, match: 10000, travel: 5000 },
        { id: 'k-2', party: 'p-piotr', kind: 'coach', from: '2026-09-01', base: 80000, unit: 5500, match: 10000, travel: 5000 },
        { id: 'k-3', party: 'p-anna', kind: 'coach', from: '2026-09-01', base: 0, unit: 7000, match: 0, travel: 0 },
        { id: 'k-4', party: 'p-ewa', kind: 'coach', from: '2026-09-01', base: 0, unit: 8000, match: 0, travel: 0 },
        { id: 'k-6', party: 'p-michal', kind: 'coach', from: '2026-09-01', base: 60000, unit: 5500, match: 10000, travel: 5000 },
        { id: 'k-7', party: 'p-kamil', kind: 'coach', from: '2026-09-01', base: 0, unit: 5000, match: 0, travel: 0 },
        { id: 'k-8', party: 'p-lukasz', kind: 'coach', from: '2026-09-01', base: 60000, unit: 5500, match: 10000, travel: 5000 },
        { id: 'k-9', party: 'p-marcin', kind: 'coach', from: '2026-09-01', base: 0, unit: 6000, match: 0, travel: 0 },
        { id: 'k-10', party: 'p-natalia', kind: 'coach', from: '2026-09-01', base: 0, unit: 6500, match: 0, travel: 0 },
        { id: 'k-5', party: 'i-gmina', kind: 'management', from: '2026-01-01', base: 0, unit: 0, match: 0, travel: 0, note: 'Wpłata 3 dni przed terminem; bez automatycznego wygaszania' },
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
        { id: 'a-mecz', group: 'g-tramp', name: 'Mecz ligowy: Gwiazda — LKS Rzeszotary', type: 'match', weekdays: [7], start: '10:00', end: '11:30', gather: '09:15', confirmBy: '2026-11-13 12:00', place: 'pl-boisko', coach: 'p-piotr', from: '2026-11-15', to: '2026-11-15', opponent: 'et-rzesz', oneOff: true },
        { id: 'a-sparing', group: 'g-orlm', name: 'Sparing: Wisła Liszki — Gwiazda', type: 'sparring', weekdays: [6], start: '09:00', end: '10:30', gather: '08:30', confirmBy: '2026-11-10 12:00', place: 'pl-liszki', coach: 'p-wojtek', from: '2026-11-14', to: '2026-11-14', opponent: 'et-liszki', oneOff: true },
      ],
      occurrences: [], attendance: {}, substitutions: [],
      policies: [
        { id: 'po-1', scope: 'club', target: 'club', mode: 'immediate', hours: 24, after: 'declared' },
        { id: 'po-2', scope: 'activity_type', target: 'match', mode: 'guardian_confirm', hours: 24, after: 'declared' },
        { id: 'po-3', scope: 'activity_type', target: 'tournament', mode: 'guardian_confirm', hours: 24, after: 'declared' },
        { id: 'po-4', scope: 'activity_type', target: 'camp', mode: 'guardian_confirm', hours: 48, after: 'rejected' },
      ],
      threads: [],
      fees: [
        { id: 'f-orlm', name: 'Składka Orlik młodszy', group: 'g-orlm', amount: 15000, dueDay: 10, period: 'monthly' },
        { id: 'f-tramp', name: 'Składka Trampkarz', group: 'g-tramp', amount: 16000, dueDay: 10, period: 'monthly' },
        { id: 'f-basen', name: 'Składka Basen — początkujący', group: 'g-basen1', amount: 12000, dueDay: 10, period: 'monthly' },
        { id: 'f-zumba', name: 'Karnet Zumba', group: 'g-zumba', amount: 10000, dueDay: 10, period: 'monthly' },
        { id: 'f-szachy', name: 'Składka Szachy', group: 'g-szachy', amount: 8000, dueDay: 10, period: 'monthly' },
        { id: 'f-cheer', name: 'Składka Cheerleader', group: 'g-cheer', amount: 9000, dueDay: 10, period: 'monthly' },
      ],
      discounts: [{ id: 'd-sib', name: 'Rodzeństwo', kind: 'sibling', percent: 30 }],
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
        { id: 'r-abak', place: 'pl-boisko', renter: 'Abak sp. z o.o.', renterId: 'i-abak', category: 'external_commercial', contact: 'Marta Abak', email: 'marta@abak.example', phone: '605 111 222', date: '2026-11-10', start: '19:30', end: '21:00', units: 1, amount: 30000, status: 'confirmed', via: 'phone' },
        { id: 'r-sas', place: 'pl-boisko', renter: 'KS Sąsiedzi', renterId: 'i-sasiedzi', category: 'municipal_club_winter_lighting', contact: 'Jan Nowicki', email: 'jan@sasiedzi.example', phone: '603 000 111', date: '2026-11-11', start: '19:30', end: '21:00', units: 1, amount: 18000, status: 'requested', via: 'phone' },
        { id: 'r-myd', place: 'pl-boisko', renter: 'UKS Mydlniki', category: 'municipal_club_winter_lighting', contact: 'Paweł Mydlnicki', email: 'kontakt@mydlniki.example', phone: '604 222 333', date: '2026-11-13', start: '19:30', end: '21:00', units: 1, amount: 18000, status: 'pending_approval', via: 'online', holdUntil: '2026-11-11 14:00', purpose: 'Sparing seniorów' },
        { id: 'r-xyz', place: 'pl-boisko', renter: 'Akademia Ruchu Kraków', category: 'external_commercial', contact: 'Ewa Ruch', email: 'biuro@akademiaruchu.example', phone: '606 333 444', date: '2026-11-14', start: '09:00', end: '10:30', units: 1, amount: 30000, status: 'pending_approval', via: 'online', holdUntil: '2026-11-12 09:00', purpose: 'Zajęcia ogólnorozwojowe', banMatch: false },
        { id: 'r-old', place: 'pl-boisko', renter: 'SP Ściejowice', renterId: 'i-szkola', category: 'municipal_club', contact: 'Sekretariat', email: 'sp@sciejowice.example', phone: '12 111 22 33', date: '2026-11-02', start: '19:30', end: '21:00', units: 1, amount: 18000, status: 'done', via: 'phone' },
      ],
      bookings: [
        { id: 'b-szk', place: 'pl-salka', date: '2026-11-12', start: '20:00', end: '21:30', purpose: 'Szkolenie trenerów (UEFA Grassroots)', by: 'p-aneta', section: 's-akad', status: 'confirmed' },
      ],
      closures: [
        { id: 'cl-1', place: 'pl-boisko', date: '2026-11-18', start: '08:00', end: '22:00', reason: 'maintenance', note: 'Szczotkowanie i uzupełnienie granulatu' },
      ],
      logs: [
        { id: 'lg-1', date: '2026-11-09', operator: 'p-tomek', opened: '15:55', closed: '21:10', before: 'Boisko suche, siatki OK', after: 'Bez uwag', remarks: '' },
      ],
      incidents: [
        { id: 'in-1', date: '2026-11-07', place: 'pl-boisko', kind: 'damage', description: 'Rozerwana siatka w bramce północnej po zajęciach grupy wynajmującej.', action: 'warning', by: 'p-tomek' },
      ],
      bans: [
        { id: 'bn-1', subject: 'Grupa „Orły” (nieformalna)', from: '2026-10-15', to: '2026-12-31', reason: 'Wielokrotne wejście na boisko w obuwiu z wkrętami', by: 'p-aneta' },
      ],
      maintenance: [
        { id: 'mt-1', place: 'pl-boisko', kind: 'przegląd roczny', responsible: 'owner', due: '2026-11-30' },
        { id: 'mt-2', place: 'pl-boisko', kind: 'szczotkowanie nawierzchni', responsible: 'club', due: '2026-11-18' },
      ],
      mails: [], bankImports: [], bankTx: [], receiptSeq: 6,
      kitCampaigns: [], kitOrders: [], kitTokens: { 'kit-robert': { guardian: 'p-robert', campaign: 'oc-akad' } }, cashHandovers: [],
      tokens: { 'tok-expired': { guardian: 'p-kasia', occ: 'a-orlm-2026-11-10', expired: true } },
      log: { opened: false, closed: false, before: '', after: '' },
    }

    const weekdays: [Zone, string, string, number][] = [['public_free', '08:00', '16:00', 1], ['club_training', '16:00', '19:30', 2], ['reservable_paid', '19:30', '22:00', 2]]
    const weekend: [Zone, string, string, number][] = [['reservable_paid', '09:00', '13:00', 2], ['public_free', '13:00', '20:30', 1]]
    for (const pid of ['pl-boisko', 'pl-multi']) {
      db.zones[pid] = [
        ...weekdays.map(([zone, from, to, priority]) => ({ days: [1, 2, 3, 4, 5], from, to, zone, priority })),
        ...weekend.map(([zone, from, to, priority]) => ({ days: [6, 7], from, to, zone, priority })),
      ]
    }
    db.zones['pl-salka'] = [{ days: [1, 2, 3, 4, 5, 6, 7], from: '08:00', to: '22:00', zone: 'club_training', priority: 2 }]
    db.zones['pl-basen'] = [{ days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '20:00', zone: 'club_training', priority: 2 }]

    // Sessions from activity rules: from early November to the end of the year (generator horizon).
    for (const a of db.activities) generateOccurrences(db, a, a.oneOff && a.from < '2026-11-02' ? a.from : '2026-11-02', '2026-12-31')
    const occ = (id: string): Occurrence => db.occurrences.find((o) => o.id === id) as Occurrence
    for (const o of db.occurrences) if (o.date < TODAY && o.id !== 'a-tramp-2026-11-09') o.status = 'done'
    for (const o of db.occurrences) if (o.date === '2026-11-11') { o.status = 'cancelled'; o.cancelReason = 'Święto Niepodległości' }
    occ('a-orlm-2026-11-05').coach = 'p-piotr'
    db.substitutions.push({ occ: 'a-orlm-2026-11-05', prev: 'p-wojtek', next: 'p-piotr', kind: 'substitute_assigned', at: '2026-11-04 20:10', by: 'p-wojtek', reason: 'Kurs trenerski' })
    occ('a-orlm-2026-11-12').coach = null
    db.substitutions.push({ occ: 'a-orlm-2026-11-12', prev: 'p-wojtek', next: null, kind: 'absence_reported', at: '2026-11-09 21:40', by: 'p-wojtek', reason: 'Wyjazd służbowy' })
    for (const o of db.occurrences) if (o.status === 'done') {
      const g = db.groups.find((x) => x.id === o.group) as Group
      db.attendance[o.id] = Object.fromEntries(g.members.map((m, i) => [m, { declared: 'yes', status: 'final', actual: i === 1 ? 'absent' : 'present' } as Attendance]))
    }
    db.attendance['a-orlm-2026-11-10'] = {
      'p-adam': { declared: 'yes', status: 'final', by: 'p-marek' },
      'p-bartek': { declared: 'yes', status: 'final', by: 'p-ewelina' },
      'p-lena': { declared: 'no', status: 'final', by: 'p-robert' },
    }
    db.attendance['a-sparing-2026-11-14'] = { 'p-adam': { declared: 'yes', status: 'final', by: 'p-marek' }, 'p-bartek': { declared: 'yes', status: 'final', by: 'p-ewelina' }, 'p-lena': { declared: 'no', status: 'final', by: 'p-robert' } }
    db.attendance['a-mecz-2026-11-15'] = { 'p-ola': { declared: 'yes', status: 'pending_guardian', by: 'p-ola' }, 'p-kuba': { declared: 'yes', status: 'final', by: 'p-iwona' } }

    db.threads = [
      { id: 't-orlm', scope: 'group', scopeId: 'g-orlm', scopeLabel: lt('thread.scope.group', { name: 'Orlik młodszy' }), subject: 'Czwartkowy trening — zmiana trenera', isCase: false, readBy: [], messages: [
        { id: 'm1', author: 'p-wojtek', role: 'coach', body: 'Dzień dobry! W czwartek 12.11 nie poprowadzę treningu — koordynator wskaże zastępstwo, godzina bez zmian (17:00).', at: '2026-11-09 21:45', delivered: 6, failed: 0 },
      ] },
      { id: 't-cancel', scope: 'occurrence', scopeId: 'a-tramp-2026-11-11', scopeLabel: lt('thread.scope.occurrence', { name: 'Trening Trampkarzy', date: ld('2026-11-11') }), subject: 'Trening odwołany — Święto Niepodległości', isCase: false, readBy: ['p-kasia'], messages: [
        { id: 'm2', author: 'p-piotr', role: 'coach', body: 'Trening w środę 11.11 jest odwołany (święto). Widzimy się w poniedziałek.', at: '2026-11-05 10:00', delivered: 4, failed: 1 },
      ] },
      { id: 't-uwagi', scope: 'group', scopeId: 'g-tramp', scopeLabel: lt('thread.scope.group', { name: 'Trampkarz' }), subject: 'Uwagi do składu na mecz', isCase: false, readBy: ['p-kasia'], messages: [
        { id: 'm3', author: 'p-iwona', role: 'guardian', body: 'Kuba trzeci mecz z rzędu siedzi na ławce, a trenuje najczęściej z całej grupy. Proszę o wyjaśnienie zasad wyboru składu.', at: '2026-11-08 19:12', delivered: 2, failed: 0 },
        { id: 'm4', author: 'p-piotr', role: 'coach', body: 'Dziękuję za wiadomość. Zapraszam na rozmowę po poniedziałkowym treningu — omówimy plan rotacji.', at: '2026-11-08 20:30', delivered: 2, failed: 0 },
      ] },
      { id: 't-walne', scope: 'club', scopeId: 'club', scopeLabel: lt('thread.scope.club'), subject: 'Walne zebranie członków 28.11', isCase: false, readBy: [], messages: [
        { id: 'm5', author: 'p-aneta', role: 'admin', body: 'Zapraszamy na walne zebranie 28.11 o 18:00 w salce klubowej. Porządek obrad w załączniku.', at: '2026-11-06 12:00', delivered: 41, failed: 2 },
      ] },
    ]

    // Charges for October and November (generator with the sibling discount).
    generateCharges(db, '2026-10')
    generateCharges(db, '2026-11')
    for (const c of db.charges) if (c.period === '2026-10') { c.status = 'paid'; c.payments = [{ amount: c.amount - c.discount, method: 'transfer', date: '2026-10-08' }] }
    const oct = (person: string): Charge | undefined => db.charges.find((c) => c.period === '2026-10' && c.person === person)
    const mazur = oct('p-bartek'); if (mazur) { mazur.status = 'open'; mazur.payments = [] }
    const adam = oct('p-adam'); if (adam) { adam.status = 'partially_paid'; adam.payments = [{ amount: 5000, method: 'cash', date: '2026-10-12' }] }
    for (const c of db.charges) if (c.payerMissing) { c.status = 'open'; c.payments = [] }
    // Rentals: charges payable to the municipality.
    for (const r of db.rentals) if (['requested', 'confirmed', 'done'].includes(r.status)) {
      const ch = rentalCharge(db, r)
      if (r.status !== 'requested') { ch.status = 'paid'; ch.payments = [{ amount: ch.amount, method: 'transfer', date: addDays(r.date, -3) }] }
    }
    seedKit(db)
    return db
  }

  function generateOccurrences(db: Db, a: Activity, from: string, to: string): Occurrence[] {
    const created: Occurrence[] = []
    const start = a.from > from ? a.from : from
    const end = a.to < to ? a.to : to
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (!a.weekdays.includes(weekday(d))) continue
      const id = `${a.id}-${d}`
      if (db.occurrences.some((o) => o.id === id)) continue
      const o: Occurrence = { id, activity: a.id, group: a.group, name: a.name, type: a.type, date: d, start: a.start, end: a.end, place: a.place, coach: a.coach, defaultCoach: a.coach, status: 'planned', opponent: a.opponent, invited: a.invited, gather: a.gather, confirmBy: a.confirmBy, updatedAt: 1 }
      db.occurrences.push(o); created.push(o)
    }
    return created
  }

  function generateCharges(db: Db, period: string): { created: number; skipped: number; missing: number } {
    let created = 0, skipped = 0, missing = 0
    const due = `${period}-10`
    const rows: { fee: Fee; person: string }[] = []
    for (const fee of db.fees) {
      const g = db.groups.find((x) => x.id === fee.group)
      if (!g) continue
      for (const m of g.members) rows.push({ fee, person: m })
    }
    const payerOf = (person: string): string | undefined => {
      const gs = db.guardianships.find((x) => x.ward === person && x.primaryPayer)
      if (gs) return gs.guardian
      const p = db.persons.find((x) => x.id === person)
      if (p && ageOn(p.birth) >= 18) return person
      return undefined
    }
    // Sibling ranking per payer: the oldest child pays the full rate.
    const byPayer: Record<string, string[]> = {}
    for (const r of rows) { const pay = payerOf(r.person); if (pay && pay !== r.person) (byPayer[pay] ||= []).includes(r.person) || byPayer[pay].push(r.person) }
    for (const pay of Object.keys(byPayer)) byPayer[pay].sort((a, b) => (personById(db, a).birth < personById(db, b).birth ? -1 : 1))
    for (const r of rows) {
      if (db.charges.some((c) => c.source === 'fee' && c.sourceId === r.fee.id && c.person === r.person && c.period === period)) { skipped++; continue }
      const payer = payerOf(r.person)
      const rank = payer && byPayer[payer] ? byPayer[payer].indexOf(r.person) : 0
      const discount = rank >= 1 ? Math.round(r.fee.amount * 0.3) : 0
      const p = personById(db, r.person)
      db.charges.push({ id: uid('ch'), source: 'fee', sourceId: r.fee.id, person: r.person, payerPerson: payer, payerMissing: !payer, description: `${r.fee.name} — ${p.first} ${p.last}`, period, amount: r.fee.amount, discount, discountName: discount ? lt('charge.discountSibling', { percent: 30 }) : undefined, due, payee: 'club', status: 'open', payments: [], updatedAt: 1 })
      created++
      if (!payer) missing++
    }
    return { created, skipped, missing }
  }

  function rentalCharge(db: Db, r: Rental): Charge {
    const ch: Charge = { id: uid('ch'), source: 'rental', sourceId: r.id, payerInstitution: r.renter, description: lt('charge.rentalDesc', { place: placeName(db, r.place), date: ld(r.date), start: r.start, end: r.end }), amount: r.amount, discount: 0, due: addDays(r.date, -3), payee: 'owner_institution', status: 'open', payments: [], updatedAt: 1 }
    db.charges.push(ch); r.chargeId = ch.id
    return ch
  }

  // Academy kit order form template (like the club's current Google Form). Product names are club content.
  const KIT_CHILD = ['104', '116', '128', '140', '152', '164']
  const KIT_DESC = 'Zamawiamy stroje meczowe i treningowe dla dzieci z Akademii. Komplet meczowy z nadrukiem herbu, numeru i imienia kosztuje 120 zł; elementy można też zamówić osobno. Stroje odbierzecie u trenera po dostawie (ok. 3 tygodnie od zamknięcia zamówień).'
  function kitTemplate(): KitProduct[] {
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

  // Order pricing: a set replaces the prices of its items; an adult size may have a different price.
  function kitPrice(c: KitCampaign, choice: Record<string, string>, set: boolean): { lines: KitLine[]; total: number; errs: Errors } {
    const errs: Errors = {}, lines: KitLine[] = []
    const setP = c.products.find((p) => p.kind === 'set')
    const inSet = new Set(set && setP ? setP.components || [] : [])
    if (set && setP) {
      const sizes: Record<string, string> = {}
      for (const id of inSet) { const v = choice[id] || ''; if (!v || v === 'none' || v === 'yes') errs[`p-${id}`] = t('kit.err.setNeedsSize'); else sizes[id] = v }
      lines.push({ product: setP.id, size: '', sizes, price: setP.priceChild })
    }
    for (const p of c.products) {
      if (p.kind === 'set' || inSet.has(p.id)) continue
      const v = choice[p.id] || ''
      if (!v) { if (p.required) errs[`p-${p.id}`] = t('kit.err.chooseSize'); continue }
      if (v === 'none') continue
      lines.push({ product: p.id, size: v === 'yes' ? '' : v, price: p.sizesAdult.includes(v) ? (p.priceAdult ?? p.priceChild) : p.priceChild })
    }
    if (!lines.length && !Object.keys(errs).length) errs._ = t('kit.err.empty')
    return { lines, total: lines.reduce((a, l) => a + l.price, 0), errs }
  }

  // An order creates a charge for the payer = the person placing the order (source_type "order").
  function kitCharge(dbx: Db, c: KitCampaign, o: KitOrder): Charge {
    const kid = personById(dbx, o.child)
    const ch: Charge = { id: uid('ch'), source: 'order', sourceId: o.id, person: o.child, payerPerson: o.by, description: lt('charge.kitDesc', { campaign: c.name, child: `${kid.first} ${kid.last}` }), amount: o.lines.reduce((a, l) => a + l.price, 0), discount: 0, due: c.payDue, payee: 'club', status: 'open', payments: [], updatedAt: 1 }
    dbx.charges.push(ch)
    return ch
  }

  function seedKit(dbx: Db): void {
    const c: KitCampaign = { id: 'oc-akad', name: 'Stroje Akademii — zima 2026', description: KIT_DESC, section: 's-akad', groups: dbx.groups.filter((g) => g.section === 's-akad').map((g) => g.id), closes: '2026-11-20', payDue: '2026-12-04', status: 'open', printName: true, printNumber: true, notesLabel: 'Dodatkowe prośby (np. strój bramkarski, ochraniacze, rękawice)', products: kitTemplate(), supplier: 'Hummel — hurtownia Sport-Team', createdBy: 'p-aneta' }
    dbx.kitCampaigns.push(c)
    const add = (child: string, by: string, choice: Record<string, string>, set: boolean, printNumber: string, at: string, pay?: Pay): void => {
      const priced = kitPrice(c, choice, set)
      const p = personById(dbx, by)
      const o: KitOrder = { id: `ko-${child.slice(2)}`, campaign: c.id, child, by, email: p.email || '', phone: p.phone || '600 000 000', printName: personById(dbx, child).first.toUpperCase(), printNumber, notes: '', lines: priced.lines, chargeId: '', at, status: 'submitted', via: p.account ? 'app' : 'email_link' }
      const ch = kitCharge(dbx, c, o)
      o.chargeId = ch.id
      if (pay) { ch.payments.push(pay); ch.status = pay.amount >= ch.amount ? 'paid' : 'partially_paid' }
      dbx.kitOrders.push(o)
    }
    const none = { 'kp-dres': 'none', 'kp-ortalion': 'none' }
    add('p-adam', 'p-marek', { ...none, 'kp-koszulka': '128', 'kp-spodenki': '128', 'kp-getry': '31–34', 'kp-dres': '128' }, true, '9', '2026-11-06 20:14', { amount: 30000, method: 'cash', date: '2026-11-05', by: 'p-wojtek', receipt: 'KP/2026/11/005' })
    add('p-bartek', 'p-ewelina', { ...none, 'kp-koszulka': '128', 'kp-spodenki': 'none', 'kp-getry': '31–34' }, false, '10', '2026-11-07 08:40')
    add('p-lena', 'p-robert', { ...none, 'kp-koszulka': '128', 'kp-spodenki': '128', 'kp-getry': '31–34', 'kp-czapka': 'yes' }, true, '7', '2026-11-07 21:02', { amount: 15000, method: 'online', date: '2026-11-07', ref: 'pi_3Q…' })
    add('p-kuba', 'p-iwona', { ...none, 'kp-koszulka': '164', 'kp-spodenki': '164', 'kp-getry': '39–42', 'kp-ortalion': '164' }, true, '14', '2026-11-08 18:30', { amount: 22000, method: 'cash', date: '2026-11-09', by: 'p-piotr', receipt: 'KP/2026/11/006' })
  }

  const personById = (db: Db, id: string): Person => db.persons.find((p) => p.id === id) as Person
  const placeName = (db: Db, id: string): string => (db.places.find((p) => p.id === id) || { name: '—' }).name
  // Map link built from the venue's name and address (the spec's place also carries coordinates).
  const mapUrl = (db: Db, id: string): string => { const p = db.places.find((x) => x.id === id); return p ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.address}`)}` : '#' }

  // ═══════════════════════════════════════════════════════════════════
  // Mockup application state
  // ═══════════════════════════════════════════════════════════════════
  const PERSONAS: Persona[] = [
    { id: 'kasia', person: 'p-kasia', label: 'Kasia Nowak', roleKey: 'persona.role.guardian', features: ['people.self', 'activities.attendance.declare', 'communication.view', 'payments.view_own', 'payments.pay_online', 'payments.orders.place'], home: '/club', email: 'kasia.nowak@example.pl' },
    { id: 'ola', person: 'p-ola', label: 'Ola Nowak', roleKey: 'persona.role.participant', features: ['people.self', 'activities.attendance.declare', 'communication.view'], home: '/club', email: 'ola.nowak@example.pl' },
    { id: 'wojtek', person: 'p-wojtek', label: 'Wojtek Malinowski', roleKey: 'persona.role.coachCoordinator', features: ['people.self', 'activities.attendance.declare', 'communication.view', 'activities.coach', 'activities.events.create', 'communication.post', 'activities.reports.view_own', 'facilities.view', 'facilities.bookings.create', 'backend', 'club_core.view', 'club_core.sections.public_content', 'people.view', 'groups.view', 'groups.manage', 'activities.view', 'activities.manage', 'activities.reports.view', 'communication.cases.manage', 'payments.groups.view', 'payments.groups.collect'], home: '/club', email: 'wojtek@gwiazda.example' },
    { id: 'anna', person: 'p-anna', label: 'Anna Kowalczyk', roleKey: 'persona.role.swimInstructor', features: ['people.self', 'communication.view', 'activities.coach', 'activities.events.create', 'communication.post', 'activities.reports.view_own', 'facilities.view', 'facilities.bookings.create', 'payments.groups.view', 'payments.groups.collect'], home: '/club', email: 'anna@gwiazda.example' },
    { id: 'aneta', person: 'p-aneta', label: 'Aneta Wiśniewska', roleKey: 'persona.role.admin', features: ['*'], home: '/backend', email: 'aneta@gwiazda.example' },
    { id: 'beata', person: 'p-beata', label: 'Beata Zając', roleKey: 'persona.role.treasurer', features: ['people.self', 'backend', 'payments.view', 'payments.manage', 'payments.bank.import', 'payments.cash.record', 'payments.cash.settle', 'payments.orders.manage'], home: '/backend', email: 'skarbnik@gwiazda.example' },
    { id: 'tomek', person: 'p-tomek', label: 'Tomek Lis', roleKey: 'persona.role.attendant', features: ['people.self', 'facilities.view', 'facilities.rentals.manage', 'facilities.log.write', 'facilities.incidents.manage', 'backend'], home: '/club/facility', email: 'tomek@gwiazda.example' },
    { id: 'guest', label: '', roleKey: 'persona.role.guest', features: [], home: '/p/gwiazda' },
  ]

  let db: Db = seed()
  let personaId: PersonaId = 'kasia'
  let demoState: DemoState = 'normal'
  let transientLoading = false
  let modal: ModalSpec | null = null
  let drawer: 'flows' | 'screens' | 'mail' | null = null
  let coachCtx = true // "as coach" context for people with several roles
  const ui: Record<string, string> = {}
  try { personaId = (sessionStorage.getItem('vereino.persona') as PersonaId) || 'kasia'; const th = localStorage.getItem('vereino.theme'); if (th) document.documentElement.dataset.theme = th } catch { /* storage unavailable */ }

  const persona = (): Persona => PERSONAS.find((p) => p.id === personaId) as Persona
  const me = (): string => persona().person || ''
  const can = (f: string): boolean => persona().features.includes('*') || persona().features.includes(f)
  const isAdmin = (): boolean => persona().features.includes('*')
  const pName = (id: string | null | undefined): string => { if (!id) return '—'; const p = db.persons.find((x) => x.id === id); return p ? `${p.first} ${p.last}` : id }
  const group = (id: string): Group => db.groups.find((g) => g.id === id) as Group
  const section = (id: string): Section => db.sections.find((s) => s.id === id) as Section
  const occById = (id: string): Occurrence | undefined => db.occurrences.find((o) => o.id === id)
  // Effective section logo = section logo ?? club logo ?? initial (REQ-028).
  const sectionLogo = (s: Section): string | undefined => s.logo || db.settings.logo
  function logoBox(src: string | undefined, alt: string, size: number): string {
    const rad = Math.round(size / 4)
    return src
      ? `<img class="logo-img" src="${esc(src)}" alt="${esc(alt)}" width="${size}" height="${size}" style="border-radius:${rad}px">`
      : `<span class="logo-fallback" role="img" aria-label="${esc(alt)}" style="width:${size}px;height:${size}px;border-radius:${rad}px;font-size:${Math.round(size * 0.45)}px">${esc((db.settings.short || 'K').slice(0, 1))}</span>`
  }
  const wardsOf = (pid: string): string[] => db.guardianships.filter((g) => g.guardian === pid).map((g) => g.ward)
  const coachedGroups = (pid: string): string[] => db.groups.filter((g) => g.coaches.includes(pid)).map((g) => g.id)
  const coordSections = (pid: string): string[] => isAdmin() ? db.sections.map((s) => s.id) : db.roles.filter((r) => r.person === pid && r.role === 'coordinator').map((r) => r.section as string)
  const hasMemberRole = (pid: string): boolean => wardsOf(pid).length > 0 || db.groups.some((g) => g.members.includes(pid))
  const isCoachPersona = (): boolean => can('activities.coach')
  // Confirmation deadline ("YYYY-MM-DD HH:MM") set by the coach for matches, friendlies and tournaments; the session stays visible after it.
  const confirmPassed = (o: { confirmBy?: string }): boolean => !!o.confirmBy && `${TODAY} ${NOW}` > o.confirmBy
  const deadlineLabel = (v: string): string => `${dShort(v.slice(0, 10))}, ${v.slice(11)}`
  const started = (o: { date: string; start: string }): boolean => o.date < TODAY || (o.date === TODAY && toMin(o.start) <= toMin(NOW))
  const ended = (o: { date: string; end: string }): boolean => o.date < TODAY || (o.date === TODAY && toMin(o.end) <= toMin(NOW))
  // Activity type label (lower case); a class group's "training" is shown as "class".
  const typeLabel = (type: OccType, kind?: string): string => t(type === 'training' && kind === 'class_group' ? 'occType.classes' : `occType.${type}`)
  // Persona name / role description for the demo chrome (the guest has no person record).
  const personaLabel = (p: Persona): string => p.person ? p.label : t('persona.guest')
  const personaRole = (p: Persona): string => t(p.roleKey)
  // Build flavour set by build-artifact.mjs (window.VEREINO_BUILD = 'fictional' | 'real'); plain index.html is 'dev'.
  const BUILD = (window as unknown as { VEREINO_BUILD?: string }).VEREINO_BUILD || 'dev'
  const brandLabel = (): string => t(`chrome.brand.${BUILD}`, { club: db.settings.name })

  // System e-mail to the test mailbox; subject/body/linkLabel are Txt so they follow the UI language.
  function mail(to: string, subject: Txt, body: Txt, link?: string, linkLabel?: Txt): void {
    db.mails.unshift({ id: db.mails.length + 1, to, subject, body, link, linkLabel })
  }

  // ═══════════════════════════════════════════════════════════════════
  // HTML components
  // ═══════════════════════════════════════════════════════════════════
  // Line icons: lucide paths (ISC licence), the icon set of Open Mercato. Decorative only — the label carries the meaning.
  const ICONS: Record<string, string> = {
    house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'calendar-days': '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M8 13h.01"/><path d="M12 13h.01"/><path d="M16 13h.01"/><path d="M8 17h.01"/><path d="M12 17h.01"/><path d="M16 17h.01"/>',
    'message-square': '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    menu: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>',
    'file-text': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  }
  const icon = (name: string): string => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`
  const badge = (text: string, kind: 'neutral' | 'success' | 'warning' | 'error' | 'info' = 'neutral'): string => `<span class="badge ${kind}">${esc(text)}</span>`
  const btn = (label: string, action: string, attrs: Record<string, string> = {}, cls = ''): string =>
    `<button type="button" class="btn ${cls}" data-action="${action}" ${Object.entries(attrs).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${label}</button>`
  const link = (label: string, href: string, cls = 'btn'): string => `<a class="${cls}" href="#${href}">${label}</a>`
  const fld = (name: string, label: string, control: string, opts: { req?: boolean; hint?: string } = {}): string =>
    `<label class="field" data-field="${name}"><span>${esc(label)}${opts.req ? ' <b class="req">*</b>' : ''}</span>${control}${opts.hint ? `<small>${esc(opts.hint)}</small>` : ''}</label>`
  const inp = (name: string, type = 'text', value = '', extra = ''): string => `<input type="${type}" name="${name}" value="${esc(value)}" ${extra}>`
  const sel = (name: string, options: [string, string][], value = '', extra = ''): string =>
    `<select name="${name}" ${extra}>${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
  const area = (name: string, value = '', extra = ''): string => `<textarea name="${name}" ${extra}>${esc(value)}</textarea>`
  const chk = (name: string, label: string, checked = false, extra = ''): string => `<label class="check" data-field="${name}"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''} ${extra}><span>${label}</span></label>`

  function empty(title: string, text: string, action = '', ico = 'inbox'): string {
    return `<div class="empty"><div class="ico">${icon(ico)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`
  }
  function errorView(text = t('ui.errorView.default')): string {
    return `<div class="alert error" role="alert"><strong>${esc(t('ui.errorView.title'))}</strong>${esc(text)}</div><div class="row">${btn(esc(t('ui.errorView.retry')), 'retry', {}, 'primary')}</div>`
  }
  function skeleton(kind: ShellKind): string {
    const lines = '<div class="skeleton sk-line" style="width:60%"></div><div class="skeleton sk-line" style="width:85%"></div>'
    return kind === 'backend'
      ? `<div class="skeleton sk-line" style="width:30%;height:22px"></div>${lines}<div class="skeleton sk-card" style="height:260px;margin-top:16px"></div><span class="sr-only">${esc(t('ui.skeleton.loading'))}</span>`
      : `${lines}<div class="skeleton sk-card"></div><div class="skeleton sk-card"></div><div class="skeleton sk-card"></div><span class="sr-only">${esc(t('ui.skeleton.loading'))}</span>`
  }

  // Page size shown in the table footer; the mockup renders every row, so it must not be smaller than the longest list.
  const PAGE_SIZE = 50
  interface Col { label: string; num?: boolean; cell: (r: any) => string }
  function table(opts: { cols: Col[]; rows: any[]; toolbar?: string; tabs?: [string, string, boolean][]; empty?: [string, string]; footer?: boolean }): string {
    const tabs = opts.tabs ? `<div class="dt-tabs">${opts.tabs.map(([l, h, a]) => `<a href="#${h}" class="${a ? 'active' : ''}">${l}</a>`).join('')}</div>` : ''
    const toolbar = opts.toolbar ? `<div class="dt-toolbar">${opts.toolbar}</div>` : ''
    const body = opts.rows.length
      ? `<div class="dt-scroll"><table><thead><tr>${opts.cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${opts.rows.map((r) => `<tr>${opts.cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.cell(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : empty(opts.empty ? opts.empty[0] : t('ui.table.emptyTitle'), opts.empty ? opts.empty[1] : t('ui.table.emptyText'))
    const foot = opts.footer === false || !opts.rows.length ? '' : `<div class="dt-foot"><span>${esc(t('ui.table.records', { n: opts.rows.length }))}</span><span>${esc(t('ui.table.pagination', { pages: Math.ceil(opts.rows.length / PAGE_SIZE), size: PAGE_SIZE }))}</span></div>`
    return `<div class="dt">${tabs}${toolbar}${body}${foot}</div>`
  }

  function pageHead(title: string, sub: string, actions = ''): string {
    return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="row">${actions}</div></div>`
  }

  function statusBadge(s: string): string {
    // Status → badge colour; the label is t(`ui.statusBadge.${status}`).
    const map: Record<string, 'neutral' | 'success' | 'warning' | 'error' | 'info'> = {
      planned: 'neutral', done: 'success', cancelled: 'error',
      open: 'warning', partially_paid: 'warning', paid: 'success', forfeited: 'error',
      pending_verification: 'neutral', pending_approval: 'warning', requested: 'info',
      confirmed: 'success', rejected: 'error', expired: 'neutral', superseded: 'neutral',
      cancelled_free: 'neutral', cancelled_late: 'error', no_show: 'error',
    }
    return map[s] ? badge(t(`ui.statusBadge.${s}`), map[s]) : badge(s, 'neutral')
  }

  function declBadge(a?: Attendance): string {
    if (!a || a.declared === 'unknown') return badge(t('ui.declBadge.none'), 'neutral')
    if (a.status === 'pending_guardian') return badge(t('ui.declBadge.pendingGuardian'), 'warning')
    if (a.status === 'rejected_by_guardian') return badge(t('ui.declBadge.rejectedByGuardian'), 'error')
    return a.declared === 'yes' ? badge(t('ui.declBadge.yes'), 'success') : badge(t('ui.declBadge.no'), 'error')
  }

  // ═══════════════════════════════════════════════════════════════════
  // Mockup domain logic
  // ═══════════════════════════════════════════════════════════════════
  function placeFamily(pid: string): string[] {
    const ids = new Set<string>([pid])
    let p = db.places.find((x) => x.id === pid)
    while (p && p.parent) { ids.add(p.parent); p = db.places.find((x) => x.id === p!.parent) }
    for (const c of db.places) if (c.parent === pid) ids.add(c.id)
    return [...ids]
  }

  function zonesFor(pid: string, date: string): { from: number; to: number; zone: Zone }[] {
    const rules = (db.zones[pid] || []).filter((r) => r.days.includes(weekday(date)) && (!r.validFrom || r.validFrom <= date) && (!r.validTo || date <= r.validTo))
    const cuts = [...new Set(rules.flatMap((r) => [toMin(r.from), toMin(r.to)]))].sort((a, b) => a - b)
    const out: { from: number; to: number; zone: Zone }[] = []
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1]
      const cover = rules.filter((r) => toMin(r.from) <= a && toMin(r.to) >= b)
      if (!cover.length) continue
      const top = cover.reduce((x, y) => (y.priority > x.priority ? y : x)) // higher priority wins
      const last = out[out.length - 1]
      if (last && last.zone === top.zone && last.to === a) last.to = b
      else out.push({ from: a, to: b, zone: top.zone })
    }
    return out
  }
  const openingFor = (pid: string, date: string): [number, number] | null => {
    const z = zonesFor(pid, date); if (!z.length) return null
    return [Math.min(...z.map((x) => x.from)), Math.max(...z.map((x) => x.to))]
  }

  interface Occ { kind: 'occ' | 'int' | 'rent' | 'pend' | 'closed'; from: number; to: number; label: string; publicLabel: string; ref: string; own?: boolean }
  function occupancy(pid: string, date: string, opts: { includePending?: boolean } = {}): Occ[] {
    const fam = placeFamily(pid)
    const out: Occ[] = []
    for (const o of db.occurrences) if (o.date === date && o.status !== 'cancelled' && fam.includes(o.place)) out.push({ kind: 'occ', from: toMin(o.start), to: toMin(o.end), label: `${o.name} (${group(o.group).name})`, publicLabel: t('ui.occupancy.clubTaken'), ref: o.id })
    for (const b of db.bookings) if (b.date === date && b.status === 'confirmed' && fam.includes(b.place)) out.push({ kind: 'int', from: toMin(b.start), to: toMin(b.end), label: `${b.purpose} — ${pName(b.by)}`, publicLabel: t('ui.occupancy.clubTaken'), ref: b.id, own: b.by === me() })
    for (const r of db.rentals) if (r.date === date && fam.includes(r.place)) {
      if (['requested', 'confirmed', 'done'].includes(r.status)) out.push({ kind: 'rent', from: toMin(r.start), to: toMin(r.end), label: t('ui.occupancy.rentalLabel', { renter: r.renter }), publicLabel: t('ui.occupancy.booked'), ref: r.id })
      else if (r.status === 'pending_approval' && opts.includePending !== false) out.push({ kind: 'pend', from: toMin(r.start), to: toMin(r.end), label: t('ui.occupancy.requestLabel', { renter: r.renter }), publicLabel: t('ui.occupancy.requestedPending'), ref: r.id })
    }
    for (const c of db.closures) if (c.date === date && fam.includes(c.place)) out.push({ kind: 'closed', from: toMin(c.start), to: toMin(c.end), label: t('ui.occupancy.closedLabel', { note: c.note }), publicLabel: t('ui.occupancy.closed'), ref: c.id })
    return out.sort((a, b) => a.from - b.from)
  }

  function conflicts(pid: string, date: string, from: number, to: number, opts: { ignore?: string; pendingBlocks?: boolean; capacity?: boolean } = {}): Occ[] {
    const occ = occupancy(pid, date).filter((o) => o.ref !== opts.ignore && overlap(from, to, o.from, o.to))
    const blocking = occ.filter((o) => o.kind !== 'pend' || opts.pendingBlocks)
    if (opts.capacity) {
      const place = db.places.find((p) => p.id === pid) as Place
      const clubOcc = blocking.filter((o) => o.kind === 'occ')
      const other = blocking.filter((o) => o.kind !== 'occ')
      return clubOcc.length >= place.capacity ? blocking : other
    }
    return blocking
  }

  function declare(occId: string, personId: string, value: 'yes' | 'no'): void {
    const o = occById(occId) as Occurrence
    if (started(o)) { toast(t('ui.declare.closed'), true); return }
    if (confirmPassed(o)) { toast(t('ui.declare.deadlinePassed', { at: deadlineLabel(o.confirmBy as string) }), true); return }
    const actor = me()
    const p = personById(db, personId)
    const isWardSelf = actor === personId && ageOn(p.birth) < 18
    const needsConfirm = isWardSelf && ['match', 'tournament', 'camp'].includes(o.type)
    db.attendance[occId] ||= {}
    db.attendance[occId][personId] = { declared: value, status: needsConfirm ? 'pending_guardian' : 'final', by: actor }
    if (needsConfirm) {
      toast(t('ui.declare.savedPending'))
    } else toast(t(value === 'yes' ? 'ui.declare.savedYes' : 'ui.declare.savedNo', { name: p.first }))
    render()
  }

  // ═══════════════════════════════════════════════════════════════════
  // Toast, modal, drawer
  // ═══════════════════════════════════════════════════════════════════
  function toast(text: string, error = false): void {
    const host = document.getElementById('toasts') as HTMLElement
    const el = document.createElement('div')
    el.className = `toast${error ? ' error' : ''}`
    el.textContent = text
    host.appendChild(el)
    setTimeout(() => el.remove(), 4200)
  }

  function openModal(spec: ModalSpec): void { modal = spec; renderModal(); setTimeout(() => { const f = document.querySelector('#modal input, #modal select, #modal textarea') as HTMLElement | null; f?.focus() }, 0) }
  function closeModal(): void { modal = null; renderModal() }
  function renderModal(): void {
    const host = document.getElementById('modal') as HTMLElement
    if (!modal) { host.innerHTML = ''; return }
    host.innerHTML = `<div class="overlay" data-action="overlay"><form class="modal" data-form="modal" role="dialog" aria-modal="true" aria-label="${esc(modal.title)}" style="${modal.wide ? 'width:min(760px,100%)' : ''}" novalidate>
      <div class="modal-head"><h2>${esc(modal.title)}</h2><button type="button" class="btn sm" data-action="close-modal" aria-label="${esc(t('common.close'))}">${icon('x')}</button></div>
      <div class="modal-body"><div class="form-general"></div>${modal.body}</div>
      ${modal.noFooter ? '' : `<div class="modal-foot"><span class="hint">${esc(t('ui.renderModal.hint'))}</span><div class="row"><button type="button" class="btn" data-action="close-modal">${esc(t('common.cancel'))}</button><button type="submit" class="btn ${modal.danger ? 'danger' : 'primary'}">${esc(modal.submitLabel || t('common.save'))}</button></div></div>`}
    </form></div>`
  }

  function applyErrors(form: HTMLElement, errors: Errors): void {
    form.querySelectorAll('.field-error').forEach((e) => e.remove())
    form.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'))
    const general = form.querySelector('.form-general') as HTMLElement | null
    if (general) general.innerHTML = ''
    for (const [name, msg] of Object.entries(errors)) {
      const f = form.querySelector(`[data-field="${name}"]`)
      if (f) { f.classList.add('invalid'); const p = document.createElement('p'); p.className = 'field-error'; p.textContent = msg; f.appendChild(p) }
      else if (general) general.innerHTML += `<div class="alert error" role="alert">${msg}</div>`
    }
    const first = form.querySelector('.invalid input, .invalid select, .invalid textarea') as HTMLElement | null
    first?.focus()
  }

  // ═══════════════════════════════════════════════════════════════════
  // Flows (guide through flows F-01…F-14); title and step labels are catalog keys, translated by renderDrawer
  // ═══════════════════════════════════════════════════════════════════
  const FLOWS: { id: string; title: string; steps: [PersonaId, string, string][] }[] = [
    { id: 'F-01', title: 'flow.F01.title', steps: [['aneta', '/backend/club/sections', 'flow.F01.s1'], ['aneta', '/backend/people/persons', 'flow.F01.s2'], ['aneta', '/backend/people/persons/p-kasia?tab=guardians', 'flow.F01.s3'], ['aneta', '/backend/people/persons/p-jas?tab=account', 'flow.F01.s4'], ['aneta', '/backend/people/persons/p-kuba?tab=account', 'flow.F01.s5'], ['kasia', '/club', 'flow.F01.s6']] },
    { id: 'F-02', title: 'flow.F02.title', steps: [['kasia', '/login', 'flow.F02.s1'], ['kasia', '/club', 'flow.F02.s2'], ['ola', '/club/occurrences/a-mecz-2026-11-15', 'flow.F02.s3'], ['kasia', '/club/occurrences/a-mecz-2026-11-15', 'flow.F02.s4'], ['kasia', '/club/calendar', 'flow.F02.s5']] },
    { id: 'F-03', title: 'flow.F03.title', steps: [['wojtek', '/club/occurrences/a-orlm-2026-11-17', 'flow.F03.s1'], ['wojtek', '/backend', 'flow.F03.s2'], ['wojtek', '/backend/activities/occurrences?view=unassigned', 'flow.F03.s3'], ['wojtek', '/club/occurrences/a-orlm-2026-11-10/attendance', 'flow.F03.s4'], ['aneta', '/backend/activities/reports/coach-units', 'flow.F03.s5']] },
    { id: 'F-04', title: 'flow.F04.title', steps: [['wojtek', '/backend/activities/activities', 'flow.F04.s1'], ['wojtek', '/backend/activities/activities/create', 'flow.F04.s2']] },
    { id: 'F-05', title: 'flow.F05.title', steps: [['wojtek', '/club/occurrences/a-orlm-2026-11-19', 'flow.F05.s1'], ['wojtek', '/club/messages', 'flow.F05.s2'], ['aneta', '/backend/communication/threads/t-uwagi', 'flow.F05.s3']] },
    { id: 'F-06', title: 'flow.F06.title', steps: [['guest', '/club/link?occ=a-orlm-2026-11-12', 'flow.F06.s1'], ['guest', '/club/d/tok-expired', 'flow.F06.s2']] },
    { id: 'F-07', title: 'flow.F07.title', steps: [['aneta', '/backend/payments/fees', 'flow.F07.s1'], ['aneta', '/backend/payments/charges', 'flow.F07.s2'], ['aneta', '/backend/payments/charges?view=overdue', 'flow.F07.s3'], ['kasia', '/club/payments', 'flow.F07.s4']] },
    { id: 'F-08', title: 'flow.F08.title', steps: [['wojtek', '/club/places', 'flow.F08.s1'], ['wojtek', '/club/places/pl-boisko?date=2026-11-14', 'flow.F08.s2'], ['anna', '/club/places/pl-salka?date=2026-11-13', 'flow.F08.s3']] },
    { id: 'F-09', title: 'flow.F09.title', steps: [['guest', '/p/gwiazda', 'flow.F09.s1'], ['guest', '/p/gwiazda/places', 'flow.F09.s2'], ['guest', '/p/gwiazda/places/orlik-boisko', 'flow.F09.s3'], ['guest', '/mail', 'flow.F09.s4'], ['aneta', '/backend/facilities/requests', 'flow.F09.s5']] },
    { id: 'F-10', title: 'flow.F10.title', steps: [['tomek', '/club/facility', 'flow.F10.s1'], ['tomek', '/backend/facilities/calendar', 'flow.F10.s2']] },
    { id: 'F-11', title: 'flow.F11.title', steps: [['guest', '/p/gwiazda/sections/basen', 'flow.F11.s1'], ['aneta', '/backend/club/publication', 'flow.F11.s2'], ['guest', '/p/gwiazda/sections/basen', 'flow.F11.s3'], ['aneta', '/backend/club/sections/s-zumba/edit?tab=public', 'flow.F11.s4'], ['aneta', '/backend/club/sections', 'flow.F11.s5']] },
    { id: 'F-12', title: 'flow.F12.title', steps: [['aneta', '/backend/facilities/reports/owner', 'flow.F12.s1']] },
    { id: 'F-13', title: 'flow.F13.title', steps: [['aneta', '/backend/payments/orders', 'flow.F13.s1'], ['aneta', '/backend/payments/orders/create', 'flow.F13.s2'], ['kasia', '/club/orders/oc-akad', 'flow.F13.s3'], ['guest', '/club/orders/oc-akad', 'flow.F13.s4'], ['guest', '/club/o/kit-robert', 'flow.F13.s5'], ['wojtek', '/club/coach/payments', 'flow.F13.s6'], ['beata', '/backend/payments/cash-custody', 'flow.F13.s7'], ['aneta', '/backend/payments/orders/oc-akad?view=supplier', 'flow.F13.s8'], ['wojtek', '/club/coach/payments', 'flow.F13.s9']] },
    { id: 'F-14', title: 'flow.F14.title', steps: [['aneta', '/backend/payments/fees', 'flow.F14.s1'], ['wojtek', '/club', 'flow.F14.s2'], ['wojtek', '/club/coach/payments?group=g-orlm&due=1', 'flow.F14.s3'], ['anna', '/club/coach/payments', 'flow.F14.s4'], ['beata', '/backend/payments/cash-custody', 'flow.F14.s5'], ['beata', '/backend', 'flow.F14.s6']] },
  ]

  // ═══════════════════════════════════════════════════════════════════
  // Member screens (M)
  // ═══════════════════════════════════════════════════════════════════
  function memberCalendarItems(from: string, to: string, filter = 'all'): { o: Occurrence; who: string[]; asCoach: boolean }[] {
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

  function occCard(x: { o: Occurrence; who: string[]; asCoach: boolean }, withDecl = true): string {
    const o = x.o, g = group(o.group), s = section(g.section)
    const late = !started(o) && confirmPassed(o)
    const closed = started(o) || late
    const place = db.places.find((p) => p.id === o.place)
    const decl = withDecl && o.status === 'planned' ? x.who.map((w) => {
      const a = db.attendance[o.id]?.[w]
      const yes = a?.declared === 'yes', no = a?.declared === 'no'
      const canDecl = !(w === me() && ageOn(personById(db, w).birth) < 13)
      // After the deadline a child without an answer keeps the session, with a plain state instead of the buttons.
      if (late && canDecl && (!a || a.declared === 'unknown')) return `<div class="who"><span>${esc(personById(db, w).first)} ${badge(t('m.occCard.noAnswer'), 'warning')}</span></div>`
      return `<div class="who"><span>${esc(personById(db, w).first)} ${a?.status === 'pending_guardian' ? badge(t('m.occCard.awaitingGuardian'), 'warning') : ''}</span>${canDecl ? `<div class="seg" role="group" aria-label="${esc(t('m.occCard.declAria', { name: personById(db, w).first }))}">
        <button type="button" class="${yes ? 'on-yes' : ''}" data-action="declare" data-occ="${o.id}" data-person="${w}" data-val="yes" ${closed ? 'disabled' : ''} aria-pressed="${yes}">${esc(t('m.occCard.attending'))}</button>
        <button type="button" class="${no ? 'on-no' : ''}" data-action="declare" data-occ="${o.id}" data-person="${w}" data-val="no" ${closed ? 'disabled' : ''} aria-pressed="${no}">${esc(t('m.occCard.notAttending'))}</button></div>` : ''}</div>`
    }).join('') : ''
    const coachLine = x.asCoach && o.status === 'planned' ? `<div class="row" style="margin-top:6px">${link(esc(t('m.occCard.attendanceList')), `/club/occurrences/${o.id}/attendance`, 'btn sm primary')}${o.coach === null ? badge(t('m.occCard.noCoach'), 'warning') : ''}</div>` : ''
    return `<div class="occ"><div class="time">${o.start}<small>${o.end}</small></div><div>
      <a class="title" href="#/club/occurrences/${o.id}"><span class="dot sec-${s.color}" aria-hidden="true"></span>${esc(o.name)}</a>
      ${o.gather && o.status === 'planned' ? `<div class="gather">${icon('clock')}${esc(t('m.occCard.gather', { time: o.gather }))}</div>` : ''}
      <div class="meta">${esc(g.name)} · ${esc(s.name)} · ${esc(placeName(db, o.place))}${place?.external ? ` · <a href="${esc(mapUrl(db, o.place))}" target="_blank" rel="noopener">${icon('map-pin')} ${esc(t('m.occCard.map'))}</a>` : ''}${o.coach && o.coach !== o.defaultCoach ? ` · ${esc(t('m.occCard.substitute', { name: pName(o.coach) }))}` : ''}</div>
      ${o.status === 'cancelled' ? `<div style="margin-top:4px">${badge(t('m.occCard.cancelled', { reason: o.cancelReason || '' }), 'error')}</div>` : ''}
      ${o.confirmBy && o.status === 'planned' && x.who.length && !started(o) ? `<div class="deadline small">${late ? `${badge(t('m.occCard.deadlinePassed', { at: deadlineLabel(o.confirmBy) }), 'neutral')} <span class="muted">${esc(t('m.occCard.deadlinePassedHint'))}</span>` : `<span class="muted">${esc(t('m.occCard.confirmBy', { at: deadlineLabel(o.confirmBy) }))}</span>`}</div>` : ''}
      ${started(o) && o.status === 'planned' && x.who.length ? `<div style="margin-top:4px">${badge(t('m.occCard.declClosed'), 'neutral')}</div>` : ''}
      <div class="decl">${decl}</div>${coachLine}</div></div>`
  }

  function screenToday(): string {
    const pid = me()
    const items = memberCalendarItems(TODAY, addDays(TODAY, 1)).filter((x) => coachCtx || x.who.length)
    const next = memberCalendarItems(addDays(TODAY, 2), addDays(TODAY, 30))[0]
    const pend = Object.entries(db.attendance).flatMap(([occ, map]) => Object.entries(map).filter(([w, a]) => a.status === 'pending_guardian' && wardsOf(pid).includes(w)).map(([w]) => ({ occ, w })))
    const unsettled = isCoachPersona() ? db.occurrences.filter((o) => o.status === 'planned' && ended(o) && (o.coach === pid || coachedGroups(pid).includes(o.group))) : []
    const myThreads = visibleThreads()
    const unread = myThreads.filter((th) => !th.readBy.includes(pid))
    const charges = db.charges.filter((c) => (c.payerPerson === pid || c.person === pid) && ['open', 'partially_paid'].includes(c.status))
    const sum = charges.reduce((s, c) => s + c.amount - c.discount - c.payments.reduce((a, p) => a + p.amount, 0), 0)
    const cal = `<section class="card" aria-labelledby="t-cal"><div class="tile-head"><h2 id="t-cal">${esc(t('m.screenToday.calTitle'))}</h2><a href="#/club/calendar">${esc(t('m.screenToday.fullCalendar'))}</a></div>
      ${items.length ? `<div class="day-head">${dShort(TODAY)} ${esc(t('m.screenToday.todaySuffix'))}</div>${items.filter((x) => x.o.date === TODAY).map((x) => occCard(x)).join('') || `<p class="muted small">${esc(t('m.screenToday.noClassesToday'))}</p>`}<div class="day-head">${dShort(addDays(TODAY, 1))}</div>${items.filter((x) => x.o.date !== TODAY).map((x) => occCard(x)).join('') || `<p class="muted small">${esc(t('m.screenToday.noClassesTomorrow'))}</p>`}`
      : `<p class="muted">${esc(t('m.screenToday.nothingToday'))}${next ? ` ${esc(t('m.screenToday.nextSession'))} <a href="#/club/occurrences/${next.o.id}">${dShort(next.o.date)} ${next.o.start} — ${esc(next.o.name)}</a>.` : ''}</p>`}</section>`
    const att = `<section class="card" aria-labelledby="t-att"><div class="tile-head"><h2 id="t-att">${esc(t('m.screenToday.attTitle'))}</h2></div>
      ${pend.length ? pend.map(({ occ, w }) => { const o = occById(occ) as Occurrence; return `<div class="alert warning"><strong>${esc(t('m.screenToday.wardSignedUp', { name: personById(db, w).first, session: o.name }))}</strong>${dShort(o.date)} ${o.start}. ${esc(t('m.screenToday.confirmQ'))}<div class="row" style="margin-top:6px">${link(esc(t('m.screenToday.seeAndDecide')), `/club/occurrences/${o.id}`, 'btn sm primary')}</div></div>` }).join('') : ''}
      ${unsettled.length ? unsettled.map((o) => `<div class="alert warning"><strong>${esc(t('m.screenToday.unsettled'))}</strong>${esc(o.name)}, ${dShort(o.date)} ${o.start} — ${esc(t('m.screenToday.unsettledHint'))}<div class="row" style="margin-top:6px">${link(esc(t('m.occCard.attendanceList')), `/club/occurrences/${o.id}/attendance`, 'btn sm primary')}</div></div>`).join('') : ''}
      ${!pend.length && !unsettled.length ? `<p class="muted">${esc(t('m.screenToday.nothingPending'))}</p>` : ''}</section>`
    const msg = `<section class="card" aria-labelledby="t-msg"><div class="tile-head"><h2 id="t-msg">${esc(t('m.screenToday.msgTitle'))}</h2><a href="#/club/messages">${esc(t('common.all'))}</a></div>
      ${unread.length ? `<p><b>${unread.length}</b> ${esc(t('m.screenToday.unread', { n: unread.length }))}</p><a href="#/club/messages/${unread[0].id}">${esc(txt(unread[0].subject))}</a>` : `<p class="muted">${esc(t('m.screenToday.noNew'))}</p>`}</section>`
    const pay = can('payments.view_own') ? `<section class="card" aria-labelledby="t-pay"><div class="tile-head"><h2 id="t-pay">${esc(t('m.screenToday.payTitle'))}</h2><a href="#/club/payments">${esc(t('m.screenToday.details'))}</a></div>
      ${sum ? `<div class="kpi">${zl(sum)}</div><p class="muted small">${esc(t('m.screenToday.dueBy', { date: dShort(charges.map((c) => c.due).sort()[0]) }))} · ${esc(t('m.screenToday.chargesCount', { n: charges.length }))}</p>${can('payments.pay_online') ? link(esc(t('m.screenToday.pay')), '/club/payments', 'btn primary block') : `<p class="small muted">${esc(t('m.screenToday.guardianPays'))}</p>`}` : `<p class="muted">${esc(t('m.screenToday.allPaid'))}</p>`}</section>` : ''
    return `<div class="tiles">${cal}${att}${msg}${pay}${kitTodayTiles()}</div>`
  }

  function screenCalendar(q: URLSearchParams): string {
    const pid = me()
    const week = q.get('week') === 'next' ? 1 : 0
    const from = addDays(mondayOf(TODAY), week * 7)
    const filter = q.get('who') || 'all'
    const people = [pid, ...wardsOf(pid)].filter((x) => x === pid ? (hasMemberRole(x) || isCoachPersona()) : true)
    const items = memberCalendarItems(from, addDays(from, 6), filter)
    const chips = people.length > 1 ? `<div class="chips" role="group" aria-label="${esc(t('m.screenCalendar.personFilter'))}"><a class="chip ${filter === 'all' ? 'on' : ''}" href="#/club/calendar?week=${week ? 'next' : 'this'}&who=all">${t('m.screenCalendar.everyone')}</a>${people.map((p) => `<a class="chip ${filter === p ? 'on' : ''}" href="#/club/calendar?week=${week ? 'next' : 'this'}&who=${p}">${esc(p === pid ? t('m.screenCalendar.me') : personById(db, p).first)}</a>`).join('')}</div>` : ''
    let body = ''
    for (let i = 0; i < 7; i++) {
      const d = addDays(from, i)
      const day = items.filter((x) => x.o.date === d)
      if (day.length) body += `<div class="day-head">${dShort(d)}${d === TODAY ? ` (${t('common.todayLower')})` : ''}</div>${day.map((x) => occCard(x)).join('')}`
    }
    return `<div class="row between" style="margin-bottom:8px"><div class="seg" role="group" aria-label="${esc(t('m.screenCalendar.week'))}"><button type="button" class="${week ? '' : 'on'}" data-action="nav" data-href="/club/calendar?week=this&who=${filter}">${t('m.screenCalendar.thisWeek')}</button><button type="button" class="${week ? 'on' : ''}" data-action="nav" data-href="/club/calendar?week=next&who=${filter}">${t('m.screenCalendar.next')}</button></div><span class="small muted">${dShort(from)} – ${dShort(addDays(from, 6))}</span></div>
      ${chips}<div class="legend"><span><span class="dot sec-akad"></span>Akademia</span><span><span class="dot sec-basen"></span>Basen</span><span><span class="dot sec-zumba"></span>Zumba</span><span><span class="dot sec-szachy"></span>Szachy</span><span><span class="dot sec-cheer"></span>Cheerleader</span></div>
      ${body || empty(t('m.screenCalendar.emptyTitle'), t('m.screenCalendar.emptyText'), link(t('m.screenCalendar.nextWeek'), '/club/calendar?week=next', 'btn'))}`
  }

  function screenOccurrence(p: Record<string, string>): string {
    const o = occById(p.id)
    if (!o) return empty(t('m.screenOccurrence.notFoundTitle'), t('m.screenOccurrence.notFoundText'), link(t('m.screenOccurrence.backToToday'), '/club'))
    const g = group(o.group), s = section(g.section), pid = me()
    const who = [pid, ...wardsOf(pid)].filter((x) => g.members.includes(x))
    const isCoach = o.coach === pid || g.coaches.includes(pid) || coordSections(pid).includes(g.section)
    const closed = started(o)
    const pend = who.filter((w) => w !== pid && db.attendance[o.id]?.[w]?.status === 'pending_guardian')
    const subs = db.substitutions.filter((x) => x.occ === o.id)
    return `<div class="card"><div class="row between"><span class="badge info">${esc(typeLabel(o.type, g.kind))}</span>${statusBadge(o.status)}</div>
      <h2 style="margin:8px 0 2px;font-size:18px">${esc(o.name)}</h2>
      <p class="muted" style="margin:0">${esc(dLong(o.date))}, ${o.start}–${o.end}</p>
      <ul class="list small" style="margin-top:8px"><li><b>${t('common.place')}:</b> ${esc(placeName(db, o.place))}, ${esc((db.places.find((x) => x.id === o.place) || { address: '' }).address)} · <a href="${esc(mapUrl(db, o.place))}" target="_blank" rel="noopener">${icon('map-pin')} ${esc(t('m.occCard.map'))}</a></li>
      ${o.gather ? `<li><b>${t('m.screenOccurrence.gather')}:</b> ${o.gather}</li>` : ''}
      ${o.confirmBy ? `<li><b>${t('m.screenOccurrence.confirmBy')}:</b> ${esc(deadlineLabel(o.confirmBy))}${confirmPassed(o) ? ` ${badge(t('m.screenOccurrence.deadlineOver'), 'neutral')}` : ''}</li>` : ''}<li><b>${t('common.group')}:</b> ${esc(g.name)} · ${esc(s.name)}</li><li><b>${g.kind === 'team' ? t('common.coach') : t('m.screenOccurrence.instructor')}:</b> ${o.coach ? esc(pName(o.coach)) : badge(t('m.screenOccurrence.needsCoach'), 'warning')}${o.coach && o.coach !== o.defaultCoach ? ` ${t('m.screenOccurrence.substituteFor', { name: esc(pName(o.defaultCoach)) })}` : ''}</li>
      ${o.opponent ? `<li><b>${t('m.screenOccurrence.opponent')}:</b> ${esc((db.externalTeams.find((et) => et.id === o.opponent) || { name: '' }).name)}</li>` : ''}
      ${o.invited?.length ? `<li><b>${t('m.screenOccurrence.invitedTeams')}:</b> ${o.invited.map((i) => esc((db.externalTeams.find((et) => et.id === i) || { name: i }).name)).join(', ')}</li>` : ''}
      ${o.status === 'cancelled' ? `<li><b>${t('m.screenOccurrence.cancelReason')}:</b> ${esc(o.cancelReason)}</li>` : ''}</ul></div>
      ${pend.map((w) => `<div class="alert warning"><strong>${t('m.screenOccurrence.pendingTitle', { name: esc(personById(db, w).first) })}</strong>${t('m.screenOccurrence.pendingText')}
        <div class="row" style="margin-top:8px">${btn(t('common.confirm'), 'guardian-decide', { occ: o.id, person: w, val: 'yes' }, 'primary sm')}${btn(t('m.screenOccurrence.disagree'), 'guardian-decide', { occ: o.id, person: w, val: 'no' }, 'sm')}</div></div>`).join('')}
      ${who.length && o.status === 'planned' ? `<div class="section-title">${t('m.screenOccurrence.attendance')}</div>${occCard({ o, who, asCoach: false }).replace('class="occ"', 'class="occ" style="grid-template-columns:0 1fr"')}` : ''}
      ${closed && o.status === 'planned' && who.length ? `<p class="small muted">${t('m.screenOccurrence.declarationsClosed')}</p>` : ''}
      ${isCoach && o.status === 'planned' ? `<div class="section-title">${t('m.screenOccurrence.leading')}</div><div class="stack">
        ${link(t('m.screenOccurrence.attendanceList'), `/club/occurrences/${o.id}/attendance`, 'btn primary block')}
        ${o.coach === pid ? btn(t('m.screenOccurrence.reportAbsence'), 'absence', { occ: o.id }, 'block') : ''}
        ${btn(t('m.screenOccurrence.cancelSession'), 'cancel-occ', { occ: o.id }, 'block danger')}
        ${can('communication.post') ? btn(t('m.screenOccurrence.messageGroup'), 'new-thread', { scope: `occurrence:${o.id}` }, 'block') : ''}</div>` : ''}
      ${subs.length && isCoach ? `<div class="section-title">${t('m.screenOccurrence.substitutionHistory')}</div><ul class="list small">${subs.map((x) => `<li>${esc(x.at)} — ${x.kind === 'absence_reported' ? t('m.screenOccurrence.reportedAbsence', { name: esc(pName(x.prev)) }) : t('m.screenOccurrence.substituteEntry', { next: esc(pName(x.next)), prev: esc(pName(x.prev)) })}${x.reason ? ` (${esc(x.reason)})` : ''}</li>`).join('')}</ul>` : ''}`
  }

  function screenAttendance(p: Record<string, string>): string {
    const o = occById(p.id)
    if (!o) return empty(t('m.screenAttendance.notFoundTitle'), '404')
    const g = group(o.group)
    if (!(o.coach === me() || g.coaches.includes(me()) || coordSections(me()).includes(g.section))) return `<div class="alert error" role="alert"><strong>${t('m.screenAttendance.deniedTitle')}</strong>${t('m.screenAttendance.deniedText')}</div>`
    const att = db.attendance[o.id] || {}
    const ids = [...new Set([...g.members, ...Object.keys(att)])]
    const counts = { yes: 0, no: 0, unknown: 0 }
    for (const m of ids) { const a = att[m]; if (!a || a.declared === 'unknown') counts.unknown++; else if (a.declared === 'yes') counts.yes++; else counts.no++ }
    if (o.status === 'cancelled') return `<div class="alert error"><strong>${t('m.screenAttendance.cancelledTitle')}</strong>${t('m.screenAttendance.cancelledText')}</div>`
    const rows = ids.map((m) => {
      const a = att[m]; const v = a?.actual || ''
      const opt = (val: string, l: string): string => `<button type="button" class="${v === val ? 'on' : ''}" data-action="mark" data-occ="${o.id}" data-person="${m}" data-val="${val}" aria-pressed="${v === val}" ${o.status === 'done' ? 'disabled' : ''}>${l}</button>`
      return `<li><div class="row between"><div><div class="item-title">${esc(pName(m))}</div><div class="small">${declBadge(a)}</div></div><div class="seg" role="group" aria-label="${esc(t('m.screenAttendance.rowLabel', { name: pName(m) }))}">${opt('present', t('m.screenAttendance.present'))}${opt('absent', t('m.screenAttendance.absent'))}${opt('late', t('m.screenAttendance.late'))}</div></div></li>`
    }).join('')
    return `<div class="card"><div class="item-title">${esc(o.name)}</div><div class="small muted">${dShort(o.date)} ${o.start}–${o.end} · ${esc(placeName(db, o.place))} · ${o.coach ? esc(pName(o.coach)) : t('m.screenAttendance.noCoach')}</div>
      <div class="row" style="margin-top:8px">${badge(t('m.screenAttendance.countYes', { n: counts.yes }), 'success')}${badge(t('m.screenAttendance.countNo', { n: counts.no }), 'error')}${badge(t('m.screenAttendance.countUnknown', { n: counts.unknown }), 'neutral')}</div></div>
      ${o.status === 'done' ? `<div class="alert success" style="margin-top:12px"><strong>${t('m.screenAttendance.closedTitle')}</strong>${t('m.screenAttendance.closedText')}</div>` : ''}
      ${ids.length ? `<ul class="list">${rows}</ul>` : empty(t('m.screenAttendance.noMembersTitle'), t('m.screenAttendance.noMembersText'))}
      ${o.status === 'planned' && ids.length ? `<div class="stack" style="margin-top:12px">${btn(t('m.screenAttendance.markDeclared'), 'mark-declared', { occ: o.id })}${btn(t('m.screenAttendance.closeSession'), 'complete-occ', { occ: o.id }, 'primary block')}</div>` : ''}`
  }

  function visibleThreads(): Thread[] {
    const pid = me()
    const myGroups = new Set([...db.groups.filter((g) => g.members.includes(pid) || g.members.some((m) => wardsOf(pid).includes(m)) || g.coaches.includes(pid)).map((g) => g.id)])
    const mySections = new Set([...coordSections(pid), ...[...myGroups].map((g) => group(g).section)])
    return db.threads.filter((th) => isAdmin() || th.scope === 'club' || (th.scope === 'group' && myGroups.has(th.scopeId)) || (th.scope === 'section' && mySections.has(th.scopeId)) || (th.scope === 'occurrence' && myGroups.has((occById(th.scopeId) as Occurrence)?.group)) || th.messages.some((m) => m.author === pid))
  }

  function screenMessages(): string {
    const list = visibleThreads()
    const items = list.map((th) => `<li><a href="#/club/messages/${th.id}" style="text-decoration:none"><div class="row between"><span class="item-title">${esc(txt(th.subject))}${!th.readBy.includes(me()) ? ` ${badge(t('m.screenMessages.unread'), 'info')}` : ''}</span>${th.isCase ? badge(t('m.screenMessages.case'), 'warning') : ''}</div>
      <div class="small muted">${esc(txt(th.scopeLabel))} · ${esc(pName(th.messages[th.messages.length - 1].author))} · ${esc(th.messages[th.messages.length - 1].at)}</div></a></li>`).join('')
    return `${can('communication.post') ? `<div style="margin-bottom:8px">${btn(t('m.screenMessages.newAnnouncement'), 'new-thread', {}, 'primary block')}</div>` : ''}
      ${list.length ? `<ul class="list">${items}</ul>` : empty(t('m.screenMessages.emptyTitle'), t('m.screenMessages.emptyText'))}`
  }

  function threadView(th: Thread, backend: boolean): string {
    if (!th.readBy.includes(me())) th.readBy.push(me())
    const canCase = can('communication.cases.manage')
    return `${th.isCase ? `<div class="alert warning"><strong>${t('m.threadView.caseTitle')}</strong>${t('m.threadView.caseText')}</div>` : ''}
      <div class="small muted" style="margin-bottom:8px">${esc(txt(th.scopeLabel))}</div>
      ${th.messages.map((m) => `<div class="card"><div class="row between"><span class="item-title">${esc(pName(m.author))} <span class="small muted">· ${esc(t(`msgRole.${m.role}`))}</span></span><span class="small muted">${esc(m.at)}</span></div><p style="margin:6px 0 0">${esc(txt(m.body))}</p>
        ${backend || m.author === me() ? `<div class="small muted" style="margin-top:6px">${t('m.threadView.delivered', { n: m.delivered })}${m.failed ? ` · <span style="color:var(--destructive)">${t('m.threadView.failed', { n: m.failed })}</span>` : ''}</div>` : ''}
        ${backend && !th.isCase ? `<div style="margin-top:6px">${btn(t('m.threadView.deleteMessage'), 'delete-msg', { thread: th.id, msg: m.id }, 'sm danger')}</div>` : ''}</div>`).join('')}
      <form class="form" data-form="reply" data-thread="${th.id}" style="margin-top:12px" novalidate>${fld('body', t('m.threadView.reply'), area('body', '', `rows="3" placeholder="${esc(t('m.threadView.replyPlaceholder'))}"`), { req: true })}
        <div class="form-actions">${can('communication.post') ? btn(t('m.threadView.copyText'), 'share-text', { thread: th.id }) : ''}${backend && canCase && !th.isCase ? btn(t('m.threadView.markCase'), 'mark-case', { thread: th.id }) : ''}<button class="btn primary" type="submit">${t('common.send')}</button></div></form>`
  }

  function screenThread(p: Record<string, string>): string {
    const th = db.threads.find((x) => x.id === p.id)
    if (!th || !visibleThreads().includes(th)) return `<div class="alert error"><strong>${t('m.screenThread.deniedTitle')}</strong>${t('m.screenThread.deniedText')}</div>`
    return threadView(th, false)
  }

  function myCharges(): Charge[] {
    return db.charges.filter((c) => c.source !== 'rental' && c.status !== 'cancelled' && (c.payerPerson === me() || c.person === me()))
  }
  const remaining = (c: Charge): number => c.amount - c.discount - c.payments.reduce((s, p) => s + p.amount, 0)
  // The payer sees the full amount, fee included, before paying (interview: the commission in another club's app annoyed a parent).
  const onlineFeeFor = (sum: number): number => db.settings.onlineFee.mode === 'payer_pays' && sum > 0 ? db.settings.onlineFee.fixed : 0
  function paySummary(sum: number): string {
    const fee = onlineFeeFor(sum)
    return `<dl class="pay-sum" id="pay-summary"><dt>${esc(t('m.screenPayments.sumCharges'))}</dt><dd>${zl(sum)}</dd>
      <dt>${esc(t('m.screenPayments.sumFee'))}</dt><dd>${db.settings.onlineFee.mode === 'club_pays' ? esc(t('m.screenPayments.sumFeeClub', { amount: zl(0) })) : zl(fee)}</dd>
      <dt class="total">${esc(t('m.screenPayments.sumTotal'))}</dt><dd class="total">${zl(sum + fee)}</dd></dl>`
  }

  function screenPayments(): string {
    const list = myCharges()
    const open = list.filter((c) => ['open', 'partially_paid'].includes(c.status))
    const paid = list.filter((c) => c.status === 'paid')
    const payer = can('payments.pay_online')
    const row = (c: Charge, selectable: boolean): string => `<li><label class="check" style="width:100%">${selectable ? `<input type="checkbox" name="charge" value="${c.id}" ${c.payerMissing ? 'disabled' : 'checked'} data-change="pay-sum">` : ''}<span style="flex:1">
      <span class="row between"><span class="item-title">${esc(txt(c.description))}</span><b>${zl(remaining(c) > 0 && c.status !== 'paid' ? remaining(c) : c.amount - c.discount)}</b></span>
      <span class="small muted">${c.period ? `${t('m.screenPayments.period', { period: esc(c.period) })} · ` : ''}${t('m.screenPayments.due', { date: dShort(c.due) })}${c.discount ? ` · ${t('m.screenPayments.discount', { name: esc(txt(c.discountName)), amount: zl(c.discount) })}` : ''}</span>
      <span class="row" style="margin-top:4px">${statusBadge(c.status)}${c.due < TODAY && c.status !== 'paid' ? badge(t('m.screenPayments.overdue'), 'error') : ''}${c.payerMissing ? badge(t('m.screenPayments.noPayer'), 'warning') : ''}</span></span></label></li>`
    const openSum = open.filter((c) => !c.payerMissing).reduce((s, c) => s + remaining(c), 0)
    return `${kitPayHint()}${open.length ? `<form data-form="checkout" novalidate><div class="section-title">${t('m.screenPayments.toPay')}</div><ul class="list">${open.map((c) => row(c, payer)).join('')}</ul>
      ${payer ? `<div class="form-general"></div>${paySummary(openSum)}<button class="btn primary block" type="submit" id="pay-btn">${t('m.screenPayments.payButton', { amount: zl(openSum + onlineFeeFor(openSum)) })}</button><p class="small muted">${t('m.screenPayments.payHint', { code: esc(payerCode(me())) })}</p>` : `<p class="small muted">${t('m.screenPayments.guardianPays')}</p>`}</form>`
      : empty(t('m.screenPayments.allPaidTitle'), t('m.screenPayments.allPaidText'), '', 'circle-check')}
      ${paid.length ? `<div class="section-title">${t('m.screenPayments.paid')}</div><ul class="list">${paid.slice(0, 6).map((c) => row(c, false)).join('')}</ul>` : ''}`
  }

  function screenPayReturn(q: URLSearchParams): string {
    const st = q.get('status')
    const ids = (q.get('ids') || '').split(',').filter(Boolean)
    const list = db.charges.filter((c) => ids.includes(c.id))
    if (st === 'cancelled') return `<div class="alert warning" role="alert"><strong>${t('m.screenPayReturn.interruptedTitle')}</strong>${t('m.screenPayReturn.interruptedText')}</div>${link(t('m.screenPayReturn.backToPayments'), '/club/payments', 'btn primary block')}`
    if (st === 'pending') return `<div class="alert info" role="status"><strong>${t('m.screenPayReturn.pendingTitle')}</strong>${t('m.screenPayReturn.pendingText')}</div>${btn(t('m.screenPayReturn.refresh'), 'pay-refresh', { ids: ids.join(',') }, 'primary block')}`
    return `<div class="alert success" role="status"><strong>${t('m.screenPayReturn.receivedTitle')}</strong>${t('m.screenPayReturn.receivedText')}</div><ul class="list">${list.map((c) => `<li><div class="row between"><span>${esc(txt(c.description))}</span>${statusBadge(c.status)}</div></li>`).join('')}</ul>${link(t('m.screenPayReturn.backToToday'), '/club', 'btn block')}`
  }

  function screenProfile(): string {
    const pid = me(); const p = personById(db, pid)
    const wards = db.guardianships.filter((g) => g.guardian === pid)
    const guardOf = db.guardianships.filter((g) => g.ward === pid)
    const consentLabel: Record<string, string> = { regulations: t('m.screenProfile.consentRegulations'), image: t('m.screenProfile.consentImage'), trips: t('m.screenProfile.consentTrips') }
    return `<form class="form" data-form="profile" novalidate><div class="form-group"><h3>${t('m.screenProfile.myDetails')}</h3><div class="fields">
        ${fld('phone', t('common.phone'), inp('phone', 'tel', p.phone || ''), { hint: t('m.screenProfile.phoneHint') })}${fld('email', t('m.screenProfile.contactEmail'), inp('email', 'email', p.email || ''), { req: true })}
        ${fld('lang', t('m.screenProfile.language'), sel('lang', LANGS.map((c) => [c, langName(c)] as [string, string]), lang, 'data-change="lang" id="profile-lang"'), { hint: t('m.screenProfile.languageHint') })}</div>
        ${isCoachPersona() ? `<div style="margin-top:10px">${chk('publish', t('m.screenProfile.publishConsent'), !!p.publishConsent)}</div>` : ''}
        <div class="form-actions" style="margin-top:10px"><button class="btn primary" type="submit">${t('common.save')}</button></div></div></form>
      ${wards.length ? `<div class="section-title">${t('m.screenProfile.wardsAndConsents')}</div>${wards.map((g) => { const w = personById(db, g.ward); const grs = db.groups.filter((x) => x.members.includes(w.id)); return `<div class="card"><div class="row between"><span class="item-title">${esc(w.first)} ${esc(w.last)}</span><span class="small muted">${t('m.screenProfile.age', { n: ageOn(w.birth) })}${w.account ? ` · ${t('m.screenProfile.hasAccount')}` : ''}</span></div>
        <div class="small muted">${grs.map((x) => `${esc(x.name)} (${esc(section(x.section).name)})`).join(' · ') || t('m.screenProfile.noGroups')}</div>
        <div class="stack" style="margin-top:8px">${(['regulations', 'image', 'trips'] as const).map((k) => `<label class="check"><input type="checkbox" data-change="consent" data-gs="${g.id}" data-key="${k}" ${g.consents[k] ? 'checked' : ''}><span>${consentLabel[k]}</span></label>`).join('')}</div>
        ${g.primaryPayer ? `<div style="margin-top:6px">${badge(t('m.screenProfile.primaryPayer'), 'info')}</div>` : ''}</div>` }).join('')}` : ''}
      ${guardOf.length ? `<div class="section-title">${t('m.screenProfile.myGuardians')}</div><div class="card small">${t('m.screenProfile.guardiansNote', { names: guardOf.map((g) => esc(pName(g.guardian))).join(', ') })}</div>` : ''}
      <div class="section-title">${t('m.screenProfile.more')}</div><div class="stack">
        ${can('facilities.view') ? link(t('m.screenProfile.facilities'), '/club/places', 'btn block') : ''}
        ${can('facilities.log.write') ? link(t('m.screenProfile.facilityToday'), '/club/facility', 'btn block') : ''}
        ${can('payments.orders.place') ? link(t('m.screenProfile.orders'), '/club/orders', 'btn block') : ''}
        ${can('payments.groups.view') ? link(t('m.screenProfile.groupPayments'), '/club/coach/payments', 'btn block') : ''}
        ${can('payments.cash.record') ? link(t('m.screenProfile.acceptCash'), '/club/cash', 'btn block') : ''}
        ${can('backend') ? link(t('m.screenProfile.adminPanel'), '/backend', 'btn block') : ''}
        ${btn(t('m.screenProfile.signOut'), 'logout', {}, 'block')}</div>`
  }

  function timeline(pid: string, date: string, opts: { clickable: boolean; showNames: boolean }): string {
    const open = openingFor(pid, date)
    const startH = 8, endH = 22
    const zones = zonesFor(pid, date)
    const occ = occupancy(pid, date)
    const rows = Array.from({ length: endH - startH }, (_, i) => {
      const h = startH + i
      const isOpen = !!open && h * 60 >= open[0] && h * 60 < open[1]
      return `<div class="tl-row"><div class="tl-hour">${String(h).padStart(2, '0')}:00</div><div class="${opts.clickable && isOpen ? 'tl-slot' : ''}" ${opts.clickable && isOpen ? `data-action="slot" data-place="${pid}" data-date="${date}" data-hour="${h}" role="button" tabindex="0" aria-label="${esc(t('ui.timeline.bookFrom', { hour: h }))}"` : ''}></div></div>`
    }).join('')
    const pos = (m: number): string => `${((m - startH * 60) / 60) * 40}px`
    const hgt = (a: number, b: number): string => `${((b - a) / 60) * 40 - 2}px`
    const zoneEls = zones.map((z) => `<div class="tl-zone z-${z.zone}" style="top:${pos(z.from)};height:${hgt(z.from, z.to)}" title="${esc(zoneLabel(z.zone))}"></div>`).join('')
    // Entries overlapping in time (e.g. two groups on the two halves of the pitch) are laid out side by side.
    const laneEnds: number[] = []
    const lanes = occ.map((o) => { let l = laneEnds.findIndex((end) => end <= o.from); if (l < 0) { l = laneEnds.length; laneEnds.push(0) } laneEnds[l] = o.to; return l })
    const nl = Math.max(1, laneEnds.length)
    const blocks = occ.map((o, i) => `<div class="tl-block blk-${o.kind}" style="top:${pos(o.from)};height:${hgt(o.from, o.to)};left:calc(16px + (100% - 24px) * ${lanes[i]} / ${nl});right:auto;width:calc((100% - 24px) / ${nl} - 4px)"><strong>${fromMin(o.from)}–${fromMin(o.to)}</strong>${esc(opts.showNames ? o.label : o.publicLabel)}${o.own ? ` <button type="button" class="btn sm" data-action="cancel-booking" data-id="${o.ref}">${t('common.cancel')}</button>` : ''}</div>`).join('')
    return `<div class="legend"><span><i class="z-public_free"></i>${zoneLabel('public_free')}</span><span><i class="z-club_training"></i>${zoneLabel('club_training')}</span><span><i class="z-reservable_paid"></i>${zoneLabel('reservable_paid')}</span><span><i class="blk-occ"></i>${t('ui.timeline.legendSessions')}</span><span><i class="blk-int"></i>${t('ui.timeline.legendClubBooking')}</span><span><i class="blk-rent"></i>${t('ui.timeline.legendRental')}</span><span><i class="blk-pend"></i>${t('ui.timeline.legendRequest')}</span></div>
      <div class="timeline">${rows}<div class="tl-layer">${zoneEls}${blocks}</div></div>${!open ? `<p class="small muted">${t('ui.timeline.closedDay')}</p>` : ''}`
  }
  const zoneLabel = (z: Zone): string => t(({ public_free: 'ui.zoneLabel.publicFree', club_training: 'ui.zoneLabel.clubTraining', reservable_paid: 'ui.zoneLabel.bookable', closed: 'ui.zoneLabel.closed' } as Record<string, string>)[z])

  function dateChips(hrefFor: (d: string) => string, current: string, n = 7): string {
    return `<div class="chips" role="group" aria-label="${esc(t('common.day'))}">${Array.from({ length: n }, (_, i) => addDays(TODAY, i)).map((d) => `<a class="chip ${d === current ? 'on' : ''}" href="#${hrefFor(d)}" ${d === current ? 'aria-current="date"' : ''}>${dShort(d)}</a>`).join('')}</div>`
  }

  function screenPlaces(): string {
    const leaves = db.places.filter((p) => !p.external && !db.places.some((c) => c.parent === p.id))
    return `<p class="small muted">${t('m.screenPlaces.intro')}</p>
      ${leaves.map((p) => { const today = occupancy(p.id, TODAY); return `<a class="card" href="#/club/places/${p.id}?date=${TODAY}" style="display:block;text-decoration:none"><div class="row between"><span class="item-title">${esc(p.name)}</span>${p.parent ? `<span class="small muted">${esc(placeName(db, p.parent))}</span>` : ''}</div>
        <div class="small muted">${esc(t(`place.kind.${p.kind}`))}${p.surface ? ` · ${esc(p.surface)}` : ''} · ${t('m.screenPlaces.today', { state: today.length ? t('m.screenPlaces.entries', { n: today.length }) : t('m.screenPlaces.free') })}</div></a>` }).join('')}`
  }

  function screenPlace(p: Record<string, string>, q: URLSearchParams, backend = false): string {
    const place = db.places.find((x) => x.id === p.id) || db.places.find((x) => x.id === (q.get('place') || 'pl-boisko')) as Place
    const date = q.get('date') || TODAY
    const day = occupancy(place.id, date)
    // The page opens with facilities.view; booking a free hour (M-11 / B-23) requires facilities.bookings.create.
    const canBook = can('facilities.bookings.create')
    const hrefFor = (d: string): string => backend ? `/backend/facilities/calendar?place=${place.id}&date=${d}` : `/club/places/${place.id}?date=${d}`
    const placeSel = backend ? `<div class="chips" style="margin-bottom:8px" role="group" aria-label="${esc(t('common.place'))}">${db.places.filter((x) => !x.external && !db.places.some((c) => c.parent === x.id)).map((x) => `<a class="chip ${x.id === place.id ? 'on' : ''}" href="#/backend/facilities/calendar?place=${x.id}&date=${date}">${esc(x.name)}</a>`).join('')}</div>` : ''
    return `${backend ? pageHead(t('m.screenPlace.title'), t('m.screenPlace.subtitle'), can('facilities.manage') ? btn(t('m.screenPlace.setAvailability'), 'availability', { place: place.id }, 'primary') : '') : ''}${placeSel}
      ${backend && can('facilities.manage') ? availabilityCard(place) : ''}
      <div class="row between"><div><div class="item-title">${esc(place.name)}</div><div class="small muted">${esc(dLong(date))} · ${t('m.screenPlace.capacity', { n: place.capacity })}</div></div></div>
      ${dateChips(hrefFor, date)}
      ${canBook ? `<p class="small muted">${backend ? t('m.screenPlace.clickHintBackend') : t('m.screenPlace.clickHintMember')}</p>` : ''}
      ${timeline(place.id, date, { clickable: canBook, showNames: true })}
      ${day.length ? `<div class="section-title">${t('m.screenPlace.dayEntries')}</div><ul class="list small">${day.map((o) => `<li>${fromMin(o.from)}–${fromMin(o.to)} · ${esc(o.label)}${o.own ? ` ${btn(t('common.cancel'), 'cancel-booking', { id: o.ref }, 'sm')}` : ''}</li>`).join('')}</ul>` : ''}`
  }

  // Weekly availability for outside booking requests (rules of "bookable" zones) for a facility.
  function availabilityCard(place: Place): string {
    const rules = (db.zones[place.id] || []).filter((x) => x.zone === 'reservable_paid')
    const rows = [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const win = rules.filter((x) => x.days.includes(d))
      return `<tr><td><b>${wdLong(d % 7)}</b></td><td>${win.length ? win.map((x) => `${x.from}–${x.to}${x.validTo ? ` <span class="small muted">${t('ui.availabilityCard.until', { date: esc(x.validTo) })}</span>` : ''}${x.source === 'availability' ? '' : ` <span class="small muted">(${t('zone.source.rules')})</span>`}`).join(', ') : `<span class="muted">${t('ui.availabilityCard.none')}</span>`}</td><td>${win.length ? btn(t('common.remove'), 'availability-clear-day', { place: place.id, day: String(d) }, 'sm') : ''}</td></tr>`
    }).join('')
    return `<details class="card" style="margin-bottom:12px" ${rules.length ? '' : 'open'}><summary><b>${t('ui.availabilityCard.title')}</b> <span class="small muted">${t('ui.availabilityCard.summary', { state: place.acceptsRequests ? t('ui.availabilityCard.acceptsOnline') : t('ui.availabilityCard.noOnline') })}</span></summary>
      <div class="dt" style="margin-top:10px"><div class="dt-scroll"><table><thead><tr><th>${t('common.day')}</th><th>${t('ui.availabilityCard.available')}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <p class="small muted" style="margin:8px 0 0">${t('ui.availabilityCard.note')}</p></details>`
  }

  function availabilityModal(placeId: string): void {
    const places = db.places.filter((x) => !db.places.some((c) => c.parent === x.id) && db.zones[x.id])
    const dayChip = (d: number): string => `<label class="chip ${d <= 5 ? 'on' : ''}"><input type="checkbox" name="days" value="${d}" class="sr-only" data-change="chip" ${d <= 5 ? 'checked' : ''}>${wdShort(d % 7)}</label>`
    const perDay = [1, 2, 3, 4, 5, 6, 7].map((d) => `<tr data-field="pd-${d}"><td><label class="check"><input type="checkbox" name="pd-on-${d}" ${d <= 5 ? 'checked' : ''}><span>${wdLong(d % 7)}</span></label></td><td><input type="time" name="pd-from-${d}" value="${d <= 5 ? '16:00' : '09:00'}" aria-label="${esc(t('ui.availabilityModal.fromDay', { day: wdLong(d % 7) }))}"></td><td><input type="time" name="pd-to-${d}" value="${d <= 5 ? '22:00' : '13:00'}" aria-label="${esc(t('ui.availabilityModal.toDay', { day: wdLong(d % 7) }))}"></td></tr>`).join('')
    openModal({ title: t('ui.availabilityModal.title'), submitLabel: t('ui.availabilityModal.submit'), wide: true,
      body: `<p class="small muted" style="margin-top:0">${t('ui.availabilityModal.intro')}</p>
        <div class="field" data-field="places"><span>${t('ui.availabilityModal.places')} <b class="req">*</b></span><div class="chips">${places.map((x) => `<label class="chip ${x.id === placeId ? 'on' : ''}"><input type="checkbox" name="places" value="${x.id}" class="sr-only" data-change="chip" ${x.id === placeId ? 'checked' : ''}>${esc(x.name)}${x.acceptsRequests ? '' : ` ${t('ui.availabilityModal.noOnline')}`}</label>`).join('')}</div></div>
        <div style="margin-top:12px">${fld('am', t('ui.availabilityModal.mode'), sel('am', [['same', t('ui.availabilityModal.modeSame')], ['perday', t('ui.availabilityModal.modePerDay')]], 'same', 'data-change="avail-mode"'))}</div>
        <div data-am="same" style="margin-top:10px">
          <div class="field" data-field="days"><span>${t('ui.availabilityModal.weekdays')} <b class="req">*</b></span><div class="chips">${[1, 2, 3, 4, 5, 6, 7].map(dayChip).join('')}</div>
          <div class="row" style="margin-top:6px">${btn(t('ui.availabilityModal.monFri'), 'avail-days', { set: '1,2,3,4,5' }, 'sm')}${btn(t('ui.availabilityModal.weekend'), 'avail-days', { set: '6,7' }, 'sm')}${btn(t('ui.availabilityModal.everyDay'), 'avail-days', { set: '1,2,3,4,5,6,7' }, 'sm')}${btn(t('ui.availabilityModal.clear'), 'avail-days', { set: '' }, 'sm')}</div></div>
          <div class="fields" style="margin-top:10px">${fld('from', t('ui.availabilityModal.fromTime'), inp('from', 'time', '16:00'), { req: true })}${fld('to', t('ui.availabilityModal.toTime'), inp('to', 'time', '22:00'), { req: true })}</div>
        </div>
        <div data-am="perday" hidden style="margin-top:10px"><div class="dt"><div class="dt-scroll"><table><thead><tr><th>${t('common.day')}</th><th>${t('common.from')}</th><th>${t('common.to')}</th></tr></thead><tbody>${perDay}</tbody></table></div></div></div>
        <div class="fields" style="margin-top:12px">${fld('validFrom', t('ui.availabilityModal.validFrom'), inp('validFrom', 'date', TODAY), { req: true })}${fld('validTo', t('ui.availabilityModal.validTo'), inp('validTo', 'date', ''), { hint: t('ui.availabilityModal.validToHint') })}</div>
        ${chk('replace', t('ui.availabilityModal.replace'), true)}
        <p class="small muted">${t('ui.availabilityModal.openingNote')}</p>`,
      onSubmit: (fd) => {
        const errs: Errors = {}
        const placeIds = fd.getAll('places').map(String)
        if (!placeIds.length) errs.places = t('ui.availabilityModal.errPlaces')
        const windows: { d: number; from: string; to: string }[] = []
        const check = (d: number, from: string, to: string, key: string): void => {
          if (!from || !to) { errs[key] = t('ui.availabilityModal.errHours'); return }
          if (toMin(to) <= toMin(from)) { errs[key] = t('ui.availabilityModal.errOrder', { day: wdLong(d % 7) }); return }
          if (toMin(to) - toMin(from) < 90) { errs[key] = t('ui.availabilityModal.errMin', { day: wdLong(d % 7) }); return }
          const o = OPENING[placeIds[0] || placeId] || { weekday: ['08:00', '22:00'], weekend: ['09:00', '20:30'] }
          const [oa, ob] = d >= 6 ? o.weekend : o.weekday
          if (toMin(from) < toMin(oa) || toMin(to) > toMin(ob)) { errs[key] = t('ui.availabilityModal.errOpening', { day: wdLong(d % 7), from: oa, to: ob }); return }
          windows.push({ d, from, to })
        }
        if (fd.get('am') === 'perday') {
          for (let d = 1; d <= 7; d++) if (fd.get(`pd-on-${d}`)) check(d, String(fd.get(`pd-from-${d}`) || ''), String(fd.get(`pd-to-${d}`) || ''), `pd-${d}`)
          if (!windows.length && !Object.keys(errs).some((k) => k.startsWith('pd-'))) errs._ = t('ui.availabilityModal.errSelectDay')
        } else {
          const ds = fd.getAll('days').map(Number)
          if (!ds.length) errs.days = t('ui.availabilityModal.errChooseDay')
          for (const d of ds) { check(d, String(fd.get('from') || ''), String(fd.get('to') || ''), 'to'); if (errs.to) break }
        }
        const vf = String(fd.get('validFrom') || ''), vt = String(fd.get('validTo') || '')
        if (!vf) errs.validFrom = t('ui.availabilityModal.errDate')
        if (vt && vt < vf) errs.validTo = t('ui.availabilityModal.errDateOrder')
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
          const byHours: Record<string, number[]> = {}
          for (const w of windows) (byHours[`${w.from}-${w.to}`] ||= []).push(w.d)
          for (const [k, ds] of Object.entries(byHours)) { const [from, to] = k.split('-'); db.zones[pid].push({ days: ds, from, to, zone: 'reservable_paid', priority: 3, validFrom: vf, validTo: vt || undefined, source: 'availability' }); created += ds.length }
        }
        // Warnings: club sessions inside the new windows (they stay taken), requests outside the new availability
        let clubBusy = 0
        for (let i = 0; i < 28; i++) { const d = addDays(TODAY, i); for (const pid of placeIds) for (const w of windows.filter((x) => x.d === weekday(d))) clubBusy += occupancy(pid, d).filter((o) => (o.kind === 'occ' || o.kind === 'int') && overlap(toMin(w.from), toMin(w.to), o.from, o.to)).length }
        const pendingOutside = db.rentals.filter((x) => x.status === 'pending_approval' && placeIds.includes(x.place) && !zonesFor(x.place, x.date).some((z) => z.zone === 'reservable_paid' && z.from <= toMin(x.start) && z.to >= toMin(x.end))).length
        toast(`${t('ui.availabilityModal.saved', { places: t('ui.availabilityModal.nPlaces', { n: placeIds.length }), days: t('ui.availabilityModal.nDays', { n: days.length }), entries: t('ui.availabilityModal.nEntries', { n: created }) })}${clubBusy ? ` ${t('ui.availabilityModal.clubBusy', { n: clubBusy })}` : ''}${pendingOutside ? ` ${t('ui.availabilityModal.pendingOutside', { n: pendingOutside })}` : ''}`)
        render()
      } })
  }

  function screenFacilityToday(): string {
    const fam = placeFamily('pl-orlik')
    const occ = db.occurrences.filter((o) => o.date === TODAY && fam.includes(o.place) && o.status !== 'cancelled')
    const rent = db.rentals.filter((r) => r.date === TODAY && fam.includes(r.place) && ['requested', 'confirmed', 'no_show'].includes(r.status))
    const L = db.log
    const items = [...occ.map((o) => ({ at: o.start, html: `<b>${o.start}–${o.end}</b> ${esc(o.name)} · ${esc(placeName(db, o.place))}<div class="small muted">${esc(t('m.screenFacilityToday.clubGroup'))} · ${esc(pName(o.coach))}</div>` })),
      ...rent.map((r) => ({ at: r.start, html: `<b>${r.start}–${r.end}</b> ${t('m.screenFacilityToday.rental', { renter: esc(r.renter), place: esc(placeName(db, r.place)) })} ${statusBadge(r.status)}<div class="small muted">${t('m.screenFacilityToday.contact', { contact: esc(r.contact), phone: esc(r.phone) })}</div>${r.status !== 'no_show' ? `<div class="row" style="margin-top:6px">${btn(t('m.screenFacilityToday.noShow'), 'no-show', { id: r.id }, 'sm')}</div>` : ''}` }))].sort((a, b) => a.at.localeCompare(b.at))
    return `<div class="card"><div class="row between"><span class="item-title">${esc(placeName(db, 'pl-orlik'))} — ${esc(dShort(TODAY))}</span>${L.closed ? badge(t('m.screenFacilityToday.closed'), 'neutral') : L.opened ? badge(t('m.screenFacilityToday.opened', { time: L.openedAt }), 'success') : badge(t('m.screenFacilityToday.notOpened'), 'warning')}</div>
      <div class="stack" style="margin-top:10px">${!L.opened ? btn(t('m.screenFacilityToday.openFacility'), 'open-facility', {}, 'primary block') : !L.closed ? btn(t('m.screenFacilityToday.closeFacility'), 'close-facility', {}, 'block') : ''}${btn(t('m.screenFacilityToday.reportIncident'), 'incident', {}, 'block danger')}</div></div>
      <div class="section-title">${esc(t('m.screenFacilityToday.onSiteToday'))}</div>
      ${items.length ? `<ul class="list">${items.map((i) => `<li>${i.html}${L.opened ? `<div class="row" style="margin-top:6px"><input type="number" min="0" placeholder="${esc(t('m.screenFacilityToday.headcountPlaceholder'))}" aria-label="${esc(t('m.screenFacilityToday.headcountAria'))}" style="width:120px">${chk('adult', esc(t('m.screenFacilityToday.adultPresent')))}</div>` : ''}</li>`).join('')}</ul>` : empty(t('m.screenFacilityToday.emptyTitle'), t('m.screenFacilityToday.emptyText'))}
      ${L.opened ? `<div class="small muted">${t('m.screenFacilityToday.stateBefore', { text: esc(L.before) })}</div>` : ''}`
  }

  function screenLink(q: URLSearchParams): string {
    const o = occById(q.get('occ') || '')
    return `${o ? `<div class="card"><div class="item-title">${esc(o.name)}</div><div class="small muted">${dShort(o.date)} ${o.start} · ${esc(placeName(db, o.place))}</div></div>` : ''}
      <form class="form" data-form="link-request" data-occ="${o ? o.id : ''}" style="margin-top:12px" novalidate><p>${esc(t('m.screenLink.intro'))}</p>
      ${fld('email', t('common.email'), inp('email', 'email', '', 'autocomplete="email"'), { req: true })}<button class="btn primary block" type="submit">${esc(t('m.screenLink.sendLink'))}</button></form>
      <p class="small muted" style="margin-top:12px">${t('m.screenLink.haveAccount', { link: link(esc(t('m.screenLink.signIn')), '/login', '') })}</p>`
  }

  function screenTokenDeclare(p: Record<string, string>): string {
    const tok = db.tokens[p.token]
    if (!tok) return `<div class="alert error"><strong>${esc(t('m.screenTokenDeclare.invalidTitle'))}</strong>${esc(t('m.screenTokenDeclare.invalidText'))}</div>`
    const o = occById(tok.occ) as Occurrence
    if (tok.expired || started(o)) return `<div class="alert error" role="alert"><strong>${esc(t('m.screenTokenDeclare.expiredTitle'))}</strong>${esc(t('m.screenTokenDeclare.expiredText'))}</div>${link(esc(t('m.screenTokenDeclare.requestNew')), `/club/link?occ=${o.id}`, 'btn primary block')}`
    const g = group(o.group)
    const kids = wardsOf(tok.guardian).filter((w) => g.members.includes(w))
    return `<div class="card"><div class="item-title">${esc(o.name)}</div><div class="small muted">${esc(dLong(o.date))}, ${o.start}–${o.end} · ${esc(placeName(db, o.place))}</div></div>
      <div class="section-title">${esc(t('m.screenTokenDeclare.yourKids'))}</div>
      ${kids.map((w) => { const a = db.attendance[o.id]?.[w]; return `<div class="row between card"><span class="item-title">${esc(personById(db, w).first)}</span><div class="seg"><button type="button" class="${a?.declared === 'yes' ? 'on-yes' : ''}" data-action="token-declare" data-token="${p.token}" data-person="${w}" data-val="yes">${esc(t('m.screenTokenDeclare.attending'))}</button><button type="button" class="${a?.declared === 'no' ? 'on-no' : ''}" data-action="token-declare" data-token="${p.token}" data-person="${w}" data-val="no">${esc(t('m.screenTokenDeclare.notAttending'))}</button></div></div>` }).join('')}
      <p class="small muted">${t('m.screenTokenDeclare.signInForCalendar', { link: link(esc(t('m.screenLink.signIn')), '/login', '') })}</p>`
  }

  function screenLogin(): string {
    return `<form class="form" data-form="login" novalidate style="margin-top:12px"><div style="text-align:center;margin-bottom:8px">${logoBox(db.settings.logo, t('m.screenLogin.logoAlt'), 52)}<h2 style="margin:8px 0 0">${esc(db.settings.name)}</h2><p class="muted small">${esc(t('m.screenLogin.tagline'))}</p></div>
      <div class="form-general"></div>${fld('email', t('common.email'), inp('email', 'email', '', 'autocomplete="username"'), { req: true })}${fld('password', t('m.screenLogin.password'), inp('password', 'password', '', 'autocomplete="current-password"'), { req: true })}
      <button class="btn primary block" type="submit">${esc(t('m.screenLogin.signIn'))}</button><a href="#/login" class="small muted" style="text-align:center">${esc(t('m.screenLogin.forgotPassword'))}</a></form>
      <div class="card small" style="margin-top:16px">${t('m.screenLogin.demoAccounts')}<ul style="margin:6px 0 0;padding-left:18px">${PERSONAS.filter((x) => x.email).map((x) => `<li><a href="#" data-action="fill-login" data-email="${x.email}">${esc(x.email)}</a> — ${esc(personaRole(x))}</li>`).join('')}</ul></div>`
  }

  // ═══════════════════════════════════════════════════════════════════
  // Panel screens (B)
  // ═══════════════════════════════════════════════════════════════════
  function screenDashboard(): string {
    const pid = me()
    const secs = coordSections(pid)
    const inScope = (o: Occurrence): boolean => secs.includes(group(o.group).section)
    const unassigned = db.occurrences.filter((o) => o.status === 'planned' && !o.coach && o.date >= TODAY && o.date <= addDays(TODAY, 14) && inScope(o))
    const unsettled = db.occurrences.filter((o) => o.status === 'planned' && ended(o) && inScope(o))
    const overdue = db.charges.filter((c) => c.source === 'fee' && c.due < TODAY && ['open', 'partially_paid'].includes(c.status))
    const missing = db.charges.filter((c) => c.payerMissing && c.status !== 'paid')
    const pend = db.rentals.filter((r) => r.status === 'pending_approval')
    const noCoord = db.sections.filter((s) => s.active && !db.roles.some((r) => r.role === 'coordinator' && r.section === s.id))
    const w = (title: string, body: string, href: string, count?: number): string => `<section class="card"><div class="tile-head"><h2>${esc(title)}${count !== undefined ? ` <span class="count">${count}</span>` : ''}</h2><a href="#${href}">${esc(t('b.screenDashboard.open'))}</a></div>${body}</section>`
    const widgets: string[] = []
    if (can('activities.view')) {
      widgets.push(w(t('b.screenDashboard.unassignedTitle'), unassigned.length ? `<ul class="list small">${unassigned.map((o) => `<li><a href="#/backend/activities/occurrences?view=unassigned">${dShort(o.date)} ${o.start} — ${esc(o.name)}</a></li>`).join('')}</ul>` : `<p class="muted small">${esc(t('b.screenDashboard.unassignedNone'))}</p>`, '/backend/activities/occurrences?view=unassigned', unassigned.length))
      widgets.push(w(t('b.screenDashboard.unsettledTitle'), unsettled.length ? `<ul class="list small">${unsettled.map((o) => `<li>${dShort(o.date)} ${o.start} — ${esc(o.name)} · ${esc(pName(o.coach))}</li>`).join('')}</ul>` : `<p class="muted small">${esc(t('b.screenDashboard.unsettledNone'))}</p>`, '/backend/activities/occurrences?view=unsettled', unsettled.length))
    }
    if (can('payments.view')) {
      const sum = overdue.reduce((s, c) => s + remaining(c), 0)
      const toConfirm = db.bankTx.filter((bt) => bt.status === 'suggested' || bt.status === 'unmatched').length
      widgets.push(w(t('b.screenDashboard.bankTitle'), `<p class="small" style="margin:0 0 8px">${toConfirm ? t('b.screenDashboard.toConfirm', { n: toConfirm }) : esc(t('b.screenDashboard.allSettled'))}</p><div class="row">${link(esc(t('b.screenDashboard.importStatement')), '/backend/payments/bank', 'btn sm')}${btn(esc(t('b.screenDashboard.acceptCash')), 'cash', {}, 'sm')}</div>`, '/backend/payments/bank', toConfirm))
      widgets.push(w(t('b.screenDashboard.overdueTitle'), `<div class="kpi">${zl(sum)}</div><p class="muted small">${esc(t('b.screenDashboard.overdueCount', { n: overdue.length }))} · ${esc(t('b.screenDashboard.families', { n: new Set(overdue.filter((c) => !c.payerMissing).map((c) => c.payerPerson)).size }))}${overdue.some((c) => c.payerMissing) ? ` · ${esc(t('b.screenDashboard.withoutPayer', { n: overdue.filter((c) => c.payerMissing).length }))}` : ''}</p>`, '/backend/payments/charges?view=overdue', overdue.length))
      widgets.push(w(t('b.screenDashboard.missingTitle'), missing.length ? `<ul class="list small">${missing.map((c) => `<li>${esc(txt(c.description))}${c.period ? ` · ${esc(t('m.screenPayments.period', { period: c.period }))}` : ''}</li>`).join('')}</ul>` : `<p class="muted small">${esc(t('b.screenDashboard.missingNone'))}</p>`, '/backend/payments/charges?view=missing', missing.length))
    }
    if (can('payments.orders.manage')) widgets.push(kitDashboardWidget(w))
    if (can('facilities.rentals.approve')) widgets.push(w(t('b.screenDashboard.requestsTitle'), pend.length ? `<ul class="list small">${pend.map((r) => `<li>${esc(r.renter)} — ${dShort(r.date)} ${r.start} · ${esc(t('b.screenDashboard.expires', { at: r.holdUntil }))}</li>`).join('')}</ul>` : `<p class="muted small">${esc(t('b.screenDashboard.noRequests'))}</p>`, '/backend/facilities/requests', pend.length))
    if (can('facilities.view')) { const today = occupancy('pl-boisko', TODAY).concat(occupancy('pl-multi', TODAY)); widgets.push(w(t('b.screenDashboard.todayTitle'), `<ul class="list small">${today.map((o) => `<li>${fromMin(o.from)}–${fromMin(o.to)} ${esc(o.label)}</li>`).join('') || `<li class="muted">${esc(t('b.screenDashboard.nothingScheduled'))}</li>`}</ul>`, '/backend/facilities/calendar')) }
    if (isAdmin()) widgets.push(w(t('b.screenDashboard.noCoordTitle'), noCoord.length ? `<ul class="list small">${noCoord.map((s) => `<li><a href="#/backend/club/sections/${s.id}/edit?tab=coord">${esc(s.name)}</a></li>`).join('')}</ul>` : `<p class="muted small">${esc(t('b.screenDashboard.noCoordNone'))}</p>`, '/backend/club/sections', noCoord.length))
    return `${pageHead(t('b.screenDashboard.greeting', { name: personById(db, pid).first }), t('b.screenDashboard.subtitle', { date: dLong(TODAY) }))}<div class="grid2">${widgets.join('')}</div>`
  }

  function screenSettings(): string {
    const s = db.settings
    return `${pageHead(t('b.screenSettings.title'), t('b.screenSettings.subtitle'))}
      <form class="form" data-form="settings" novalidate><div class="form-group"><h3>${esc(t('b.screenSettings.clubHeading'))}</h3><div class="fields">
      ${fld('name', t('common.name'), inp('name', 'text', s.name), { req: true })}${fld('short', t('b.screenSettings.shortName'), inp('short', 'text', s.short), { req: true })}
      ${fld('slug', t('b.screenSettings.slug'), inp('slug', 'text', s.slug), { req: true, hint: t('b.screenSettings.slugHint') })}${fld('phone', t('b.screenSettings.phone'), inp('phone', 'tel', s.phone))}
      ${fld('tz', t('b.screenSettings.timeZone'), sel('tz', [['Europe/Warsaw', 'Europe/Warsaw']], s.tz))}${fld('minAge', t('b.screenSettings.minAge'), inp('minAge', 'number', String(s.minAge), 'min="13" max="18"'), { req: true, hint: t('b.screenSettings.minAgeHint') })}
      </div>${fld('description', t('b.screenSettings.description'), area('description', s.description))}</div>
      <div class="form-group"><h3>${esc(t('b.screenSettings.logoHeading'))}</h3><div class="row" style="gap:16px;align-items:flex-start">${logoBox(s.logo, t('b.screenSettings.logoHeading'), 72)}<div class="stack" style="flex:1;min-width:200px">
        <label class="field" data-field="logo"><span>${esc(s.logo ? t('b.screenSettings.replaceLogo') : t('b.screenSettings.uploadLogo'))}</span><input type="file" accept="image/png,image/jpeg,image/webp" data-change="logo-upload" data-target="club"><small>${esc(t('b.screenSettings.logoHint'))}</small></label>
        ${s.logo ? btn(esc(t('b.screenSettings.removeLogo')), 'logo-remove', { target: 'club' }, 'sm danger') : `<p class="small muted" style="margin:0">${esc(t('b.screenSettings.noLogo'))}</p>`}</div></div></div>
      <div class="form-actions"><button class="btn primary" type="submit">${esc(t('common.save'))}</button></div></form>`
  }

  function screenPublication(): string {
    const pub = db.settings.publication
    // Publication blocks: [setting key, label, description] — labels resolved at render time.
    const rows: [string, string, string][] = ['description_schedule', 'conditions', 'prices', 'coaches', 'materials', 'contact', 'places_calendar', 'online_requests']
      .map((k) => [k, t(`b.screenPublication.${k}.label`), t(`b.screenPublication.${k}.desc`)])
    return `${pageHead(t('b.screenPublication.title'), t('b.screenPublication.subtitle'), link(esc(t('b.screenPublication.preview')), '/p/gwiazda', 'btn'))}
      <form class="form" data-form="publication" novalidate><div class="form-group">
      <div class="toggle-row"><div><b>${esc(t('b.screenPublication.enabled'))}</b><div class="small muted">${esc(t('b.screenPublication.address', { path: `/p/${db.settings.slug}` }))}</div></div><input type="checkbox" name="enabled" ${pub.enabled ? 'checked' : ''} aria-label="${esc(t('b.screenPublication.enabled'))}"></div>
      ${rows.map(([k, l, d]) => `<div class="toggle-row" data-field="${k}"><div><b>${esc(l)}</b><div class="small muted">${esc(d)}</div></div><input type="checkbox" name="${k}" ${pub[k] ? 'checked' : ''} aria-label="${esc(l)}"></div>`).join('')}
      </div><div class="form-general"></div><div class="form-actions"><button class="btn primary" type="submit">${esc(t('common.save'))}</button></div></form>`
  }

  // Lower-case yes/no badges shared by the panel tables in this part.
  const yesNoBadge = (v: boolean): string => v ? badge(t('b.screenSections.yes'), 'success') : badge(t('b.screenSections.no'), 'neutral')

  function screenSections(): string {
    return `${pageHead(t('b.screenSections.title'), t('b.screenSections.subtitle'), isAdmin() ? btn(esc(t('b.screenSections.add')), 'new-section', {}, 'primary') : '')}
      ${table({ cols: [
        { label: t('b.screenSections.logo'), cell: (s: Section) => `<span class="row" style="gap:6px">${logoBox(sectionLogo(s), t('b.screenSections.logoAlt', { name: s.name }), 28)}${s.logo ? '' : `<span class="small muted">${esc(t('b.screenSections.clubLogo'))}</span>`}</span>` },
        { label: t('common.section'), cell: (s: Section) => `<a class="row-link" href="#/backend/club/sections/${s.id}/edit">${esc(s.name)}</a>` },
        { label: t('b.screenSections.coordinators'), cell: (s: Section) => { const c = db.roles.filter((r) => r.role === 'coordinator' && r.section === s.id).map((r) => esc(pName(r.person))); return c.length ? c.join(', ') : badge(t('b.screenSections.noCoordinator'), 'warning') } },
        { label: t('common.groups'), num: true, cell: (s: Section) => String(db.groups.filter((g) => g.section === s.id).length) },
        { label: t('b.screenSections.public'), cell: (s: Section) => yesNoBadge(s.isPublic) },
        { label: t('common.status'), cell: (s: Section) => s.active ? badge(t('b.screenSections.active'), 'success') : badge(t('b.screenSections.inactive'), 'neutral') },
        { label: '', cell: (s: Section) => isAdmin() ? btn(esc(t('b.screenSections.deactivate')), 'deactivate-section', { id: s.id }, 'sm') : '' },
      ], rows: db.sections, toolbar: `<input type="search" placeholder="${esc(t('b.screenSections.searchPlaceholder'))}" aria-label="${esc(t('b.screenSections.searchAria'))}">`, empty: [t('b.screenSections.emptyTitle'), t('b.screenSections.emptyText')] })}`
  }

  function screenSection(p: Record<string, string>, q: URLSearchParams): string {
    const s = section(p.id)
    if (!s) return empty(t('b.screenSection.notFound'), '404')
    const tab = q.get('tab') || 'data'
    const canEdit = isAdmin() || (can('club_core.sections.public_content') && coordSections(me()).includes(s.id))
    const tabs = `<div class="tabs">${[['data', t('b.screenSection.tabDetails')], ['coord', t('b.screenSection.tabCoordinators')], ['public', t('b.screenSection.tabPublic')]].map(([k, l]) => `<a class="${tab === k ? 'active' : ''}" href="#/backend/club/sections/${s.id}/edit?tab=${k}">${esc(l)}</a>`).join('')}</div>`
    let body = ''
    if (tab === 'data') body = `<form class="form" data-form="section" data-id="${s.id}" novalidate><div class="form-group"><div class="fields">${fld('name', t('common.name'), inp('name', 'text', s.name, isAdmin() ? '' : 'disabled'), { req: true })}${fld('short', t('b.screenSection.shortDescription'), inp('short', 'text', s.short))}</div>${fld('description', t('b.screenSection.internalDescription'), area('description', s.description))}</div>
      <div class="form-group"><h3>${esc(t('b.screenSection.logoHeading'))}</h3><div class="row" style="gap:16px;align-items:flex-start">${logoBox(sectionLogo(s), t('b.screenSections.logoAlt', { name: s.name }), 72)}<div class="stack" style="flex:1;min-width:200px">
        <p class="small muted" style="margin:0">${esc(s.logo ? t('b.screenSection.ownLogo') : t('b.screenSection.noOwnLogo'))}</p>
        ${canEdit ? `<label class="field" data-field="logo"><span>${esc(s.logo ? t('b.screenSection.replaceLogo') : t('b.screenSection.uploadLogo'))}</span><input type="file" accept="image/png,image/jpeg,image/webp" data-change="logo-upload" data-target="${s.id}"><small>${esc(t('b.screenSection.logoHint'))}</small></label>${s.logo ? btn(esc(t('b.screenSection.removeLogo')), 'logo-remove', { target: s.id }, 'sm') : ''}` : ''}</div></div></div>
      <div class="form-actions"><button class="btn primary" type="submit" ${canEdit ? '' : 'disabled'}>${esc(t('common.save'))}</button></div></form>`
    if (tab === 'coord') {
      const rows = db.roles.filter((r) => r.role === 'coordinator' && r.section === s.id)
      body = `${!rows.length ? `<div class="alert warning">${t('b.screenSection.noCoordinatorAlert')}</div>` : ''}${table({ cols: [{ label: t('common.person'), cell: (r: RoleAssignment) => esc(pName(r.person)) }, { label: t('common.from'), cell: () => '2026-09-01' }, { label: '', cell: (r: RoleAssignment) => isAdmin() ? btn(esc(t('b.screenSection.endRole')), 'end-role', { id: r.id }, 'sm') : '' }], rows, empty: [t('b.screenSection.emptyCoordTitle'), t('b.screenSection.emptyCoordText')], toolbar: isAdmin() ? btn(esc(t('b.screenSection.assignCoordinator')), 'add-coordinator', { section: s.id }, 'primary sm') : '' })}`
    }
    if (tab === 'public') body = `<form class="form" data-form="section-public" data-id="${s.id}" novalidate><div class="form-group"><h3>${esc(t('b.screenSection.publicHeading'))}</h3>
      ${chk('isPublic', esc(t('b.screenSection.visible')), s.isPublic)}<div class="fields" style="margin-top:10px">${fld('slug', t('b.screenSection.slug'), inp('slug', 'text', s.slug), { req: true, hint: t('b.screenSection.slugHint', { slug: db.settings.slug }) })}</div>
      ${fld('description', t('b.screenSection.publicDescription'), area('description', s.description))}${fld('conditions', t('b.screenSection.conditions'), area('conditions', s.conditions))}
      <div class="fields">${fld('contactName', t('b.screenSection.contactName'), inp('contactName', 'text', s.contactName))}${fld('contactEmail', t('b.screenSection.contactEmail'), inp('contactEmail', 'email', s.contactEmail))}${fld('contactPhone', t('b.screenSection.contactPhone'), inp('contactPhone', 'tel', s.contactPhone))}</div>
      <div class="field" style="margin-top:8px"><span>${esc(t('b.screenSection.materials'))}</span><ul class="list small">${s.materials.map((m) => `<li>${icon('file-text')} ${esc(m)}</li>`).join('') || `<li class="muted">${esc(t('b.screenSection.noFiles'))}</li>`}</ul><small>${esc(t('b.screenSection.materialsHint'))}</small></div></div>
      <div class="form-actions">${link(esc(t('b.screenSection.preview')), `/p/gwiazda/sections/${s.slug}`, 'btn')}<button class="btn primary" type="submit" ${canEdit ? '' : 'disabled'}>${esc(t('common.save'))}</button></div></form>`
    return `${pageHead(s.name, t('b.screenSection.subtitle'))}${tabs}${body}`
  }

  function screenPlacesAdmin(): string {
    return `${pageHead(t('b.screenPlacesAdmin.title'), t('b.screenPlacesAdmin.subtitle'), isAdmin() ? btn(esc(t('b.screenPlacesAdmin.add')), 'todo', { what: t('b.screenPlacesAdmin.todoForm') }, 'primary') : '')}
      ${table({ cols: [
        { label: t('common.place'), cell: (x: Place) => `${x.parent ? '↳ ' : ''}<b>${esc(x.name)}</b>${x.external ? ` ${badge(t('place.external'))}` : ''}` },
        { label: t('common.kind'), cell: (x: Place) => esc(t(`place.kind.${x.kind}`)) },
        { label: t('b.screenPlacesAdmin.parent'), cell: (x: Place) => esc(x.parent ? placeName(db, x.parent) : '—') },
        { label: t('b.screenPlacesAdmin.capacity'), num: true, cell: (x: Place) => String(x.capacity) },
        { label: t('b.screenPlacesAdmin.publicSchedule'), cell: (x: Place) => yesNoBadge(x.publicSchedule) },
        { label: t('b.screenPlacesAdmin.onlineRequests'), cell: (x: Place) => yesNoBadge(x.acceptsRequests) },
      ], rows: db.places })}`
  }

  function screenInstitutions(q: URLSearchParams): string {
    const tab = q.get('tab') || 'inst'
    const tabs = `<div class="tabs"><a class="${tab === 'inst' ? 'active' : ''}" href="#/backend/club/institutions?tab=inst">${esc(t('b.screenInstitutions.tabInstitutions'))}</a><a class="${tab === 'contracts' ? 'active' : ''}" href="#/backend/club/institutions?tab=contracts">${esc(t('b.screenInstitutions.tabContracts'))}</a></div>`
    const body = tab === 'inst' ? table({ cols: [{ label: t('common.name'), cell: (i: any) => `<b>${esc(i.name)}</b>` }, { label: t('common.type'), cell: (i: any) => esc(t(`institution.type.${i.type}`)) }, { label: t('common.contact'), cell: (i: any) => esc(i.contact) }, { label: t('b.screenInstitutions.bankAccount'), cell: (i: any) => esc(i.bank || '—') }], rows: db.institutions })
      : table({ cols: [{ label: t('b.screenInstitutions.party'), cell: (c: any) => esc(c.party.startsWith('p-') ? pName(c.party) : (db.institutions.find((i) => i.id === c.party) || { name: c.party }).name) }, { label: t('common.kind'), cell: (c: any) => esc(t(`contract.kind.${c.kind}`)) }, { label: t('common.from'), cell: (c: any) => esc(c.from) }, { label: t('b.screenInstitutions.base'), num: true, cell: (c: any) => c.kind === 'coach' ? zl(c.base) : '—' }, { label: t('b.screenInstitutions.perUnit'), num: true, cell: (c: any) => c.kind === 'coach' ? zl(c.unit) : '—' }, { label: t('b.screenInstitutions.match'), num: true, cell: (c: any) => c.kind === 'coach' ? zl(c.match) : '—' }, { label: t('common.notes'), cell: (c: any) => esc(c.note || '') }], rows: db.contracts })
    return `${pageHead(t('b.screenInstitutions.title'), t('b.screenInstitutions.subtitle'))}${tabs}${body}`
  }

  function screenPersons(q: URLSearchParams): string {
    const term = (ui.personSearch || '').toLowerCase()
    const filter = q.get('f') || 'all'
    const rows = db.persons.filter((p) => `${p.first} ${p.last}`.toLowerCase().includes(term)).filter((p) => filter === 'all' || (filter === 'staff' ? db.roles.some((r) => r.person === p.id) : filter === 'kids' ? ageOn(p.birth) < 18 : filter === 'noaccount' ? !p.account : true))
    return `${pageHead(t('b.screenPersons.title'), t('b.screenPersons.subtitle'), can('people.manage') ? btn(esc(t('b.screenPersons.add')), 'new-person', {}, 'primary') : '')}
      ${table({ tabs: [[t('b.screenPersons.tabAll'), '/backend/people/persons?f=all', filter === 'all'], [t('b.screenPersons.tabStaff'), '/backend/people/persons?f=staff', filter === 'staff'], [t('b.screenPersons.tabKids'), '/backend/people/persons?f=kids', filter === 'kids'], [t('b.screenPersons.tabNoAccount'), '/backend/people/persons?f=noaccount', filter === 'noaccount']],
        toolbar: `<input type="search" id="person-search" placeholder="${esc(t('b.screenPersons.searchPlaceholder'))}" aria-label="${esc(t('b.screenPersons.searchAria'))}" value="${esc(ui.personSearch || '')}" data-input="person-search">`,
        cols: [
          { label: t('common.person'), cell: (p: Person) => `<a class="row-link" href="#/backend/people/persons/${p.id}">${esc(p.last)} ${esc(p.first)}</a>` },
          { label: t('common.age'), num: true, cell: (p: Person) => String(ageOn(p.birth)) },
          { label: t('common.roles'), cell: (p: Person) => [...new Set(db.roles.filter((r) => r.person === p.id).map((r) => t(`b.screenPersons.role.${r.role}`)))].map((r) => badge(r, 'info')).join(' ') + (wardsOf(p.id).length ? ` ${badge(t('b.screenPersons.guardian'), 'neutral')}` : '') },
          { label: t('common.groups'), cell: (p: Person) => esc(db.groups.filter((g) => g.members.includes(p.id)).map((g) => g.name).join(', ')) },
          { label: t('b.screenPersons.account'), cell: (p: Person) => yesNoBadge(!!p.account) },
          { label: t('b.screenPersons.guardians'), cell: (p: Person) => esc(db.guardianships.filter((g) => g.ward === p.id).map((g) => pName(g.guardian)).join(', ')) },
        ], rows, empty: [t('b.screenPersons.emptyTitle'), t('b.screenPersons.emptyText')] })}`
  }

  function screenPerson(p: Record<string, string>, q: URLSearchParams): string {
    const person = db.persons.find((x) => x.id === p.id)
    if (!person) return empty(t('b.screenPerson.notFound'), '404')
    const tab = q.get('tab') || 'details'
    const age = ageOn(person.birth)
    const tabs = `<div class="tabs">${['details', 'guardians', 'roles', 'account', 'groups', 'charges'].map((k) => `<a class="${tab === k ? 'active' : ''}" href="#/backend/people/persons/${person.id}?tab=${k}">${esc(t(`b.screenPerson.tab.${k}`))}</a>`).join('')}</div>`
    let body = ''
    if (tab === 'details') body = `<form class="form" data-form="person" data-id="${person.id}" data-version="${person.updatedAt}" novalidate><div class="form-group"><div class="fields">
      ${fld('first', t('b.screenPerson.firstName'), inp('first', 'text', person.first), { req: true })}${fld('last', t('b.screenPerson.lastName'), inp('last', 'text', person.last), { req: true })}${fld('birth', t('b.screenPerson.birth'), inp('birth', 'date', person.birth), { req: true })}
      ${fld('pesel', 'PESEL', can('people.pesel.view') ? inp('pesel', 'text', person.pesel || '', 'inputmode="numeric" maxlength="11"') : inp('pesel', 'text', person.pesel ? '•••••••••••' : '', 'disabled'), { hint: can('people.pesel.view') ? t('b.screenPerson.peselHintAdmin') : t('b.screenPerson.peselHintOther') })}
      ${fld('phone', t('common.phone'), inp('phone', 'tel', person.phone || ''))}${fld('email', t('common.email'), inp('email', 'email', person.email || ''))}</div></div>
      <div class="form-actions">${btn(esc(t('b.screenPerson.simulateConflict')), 'simulate-conflict', { id: person.id }, 'sm')}<button class="btn primary" type="submit">${esc(t('common.save'))}</button></div></form>`
    if (tab === 'guardians') {
      const asG = db.guardianships.filter((g) => g.guardian === person.id), asW = db.guardianships.filter((g) => g.ward === person.id)
      const consent = (g: Guardianship): string => (['regulations', 'image', 'trips'] as const).map((k) => g.consents[k] ? badge(t(`b.screenPerson.consent.${k}`), 'success') : badge(t('b.screenPerson.consentMissing', { what: t(`b.screenPerson.consent.${k}`) }), 'neutral')).join(' ')
      body = `${asG.length || !asW.length ? `<div class="section-title">${esc(t('b.screenPerson.wards'))}</div>${table({ cols: [{ label: t('b.screenPerson.ward'), cell: (g: Guardianship) => `<a class="row-link" href="#/backend/people/persons/${g.ward}">${esc(pName(g.ward))}</a> <span class="muted small">${esc(t('b.screenPerson.years', { n: ageOn(personById(db, g.ward).birth) }))}</span>` }, { label: t('b.screenPerson.relation'), cell: (g: Guardianship) => esc(t(`relation.${g.relation}`)) }, { label: t('common.payer'), cell: (g: Guardianship) => g.primaryPayer ? badge(t('b.screenPerson.primaryPayer'), 'info') : '—' }, { label: t('b.screenPerson.consents'), cell: consent }], rows: asG, toolbar: can('people.manage') ? btn(esc(t('b.screenPerson.addWard')), 'add-ward', { guardian: person.id }, 'primary sm') : '', empty: [t('b.screenPerson.emptyWardsTitle'), t('b.screenPerson.emptyWardsText')] })}` : ''}
        ${asW.length ? `<div class="section-title">${esc(t('b.screenPerson.guardians'))}</div>${table({ cols: [{ label: t('b.screenPerson.guardian'), cell: (g: Guardianship) => `<a class="row-link" href="#/backend/people/persons/${g.guardian}">${esc(pName(g.guardian))}</a>` }, { label: t('b.screenPerson.relation'), cell: (g: Guardianship) => esc(t(`relation.${g.relation}`)) }, { label: t('common.payer'), cell: (g: Guardianship) => g.primaryPayer ? badge(t('b.screenPerson.primaryPayer'), 'info') : '—' }, { label: t('b.screenPerson.consents'), cell: consent }], rows: asW })}` : ''}`
    }
    if (tab === 'roles') body = table({ cols: [{ label: t('common.role'), cell: (r: RoleAssignment) => esc(t(`b.screenPerson.role.${r.role}`)) }, { label: t('b.screenPerson.scope'), cell: (r: RoleAssignment) => esc(r.section ? section(r.section).name : r.place ? placeName(db, r.place) : t('b.screenPerson.wholeClub')) }, { label: t('common.from'), cell: () => '2026-09-01' }], rows: db.roles.filter((r) => r.person === person.id), empty: [t('b.screenPerson.emptyRolesTitle'), t('b.screenPerson.emptyRolesText')], toolbar: can('people.roles.manage') ? btn(esc(t('b.screenPerson.assignRole')), 'add-role', { person: person.id }, 'primary sm') : '' })
    if (tab === 'account') body = person.account ? `<div class="alert success">${t('b.screenPerson.accountActive', { email: esc(person.email) })}</div>`
      : age < db.settings.minAge ? `<div class="alert info">${t('b.screenPerson.accountUnavailable', { name: esc(person.first), age: esc(t('b.screenPerson.years', { n: age })), min: db.settings.minAge })}</div><button class="btn" disabled title="${esc(t('b.screenPerson.belowThreshold'))}">${esc(t('b.screenPerson.createAccount'))}</button>`
      : `<div class="card"><p>${esc(t('b.screenPerson.noAccount'))}${age < 18 ? esc(t('b.screenPerson.minorNote')) : ''}</p>${btn(esc(t('b.screenPerson.createAccount')), 'create-account', { id: person.id }, 'primary')}</div>`
    if (tab === 'groups') body = table({ cols: [{ label: t('common.group'), cell: (g: Group) => esc(g.name) }, { label: t('common.section'), cell: (g: Group) => esc(section(g.section).name) }, { label: t('common.role'), cell: (g: Group) => esc(g.coaches.includes(person.id) ? t('b.screenPerson.groupCoach') : t('b.screenPerson.groupParticipant')) }, { label: t('common.from'), cell: () => '2026-09-01' }], rows: db.groups.filter((g) => g.members.includes(person.id) || g.coaches.includes(person.id)), empty: [t('b.screenPerson.emptyGroupsTitle'), t('b.screenPerson.emptyGroupsText')] })
    if (tab === 'charges') body = chargesTable(db.charges.filter((c) => c.person === person.id || c.payerPerson === person.id))
    return `${pageHead(`${person.first} ${person.last}`, `${t('b.screenPerson.years', { n: age })}${person.account ? t('b.screenPerson.hasAccount') : ''}`)}${tabs}${body}`
  }

  function screenGroups(q: URLSearchParams): string {
    const kind = q.get('kind') || 'all'
    const secs = coordSections(me())
    const rows = db.groups.filter((g) => (isAdmin() || secs.includes(g.section) || g.coaches.includes(me())) && (kind === 'all' || g.kind === kind))
    return `${pageHead(t('b.screenGroups.title'), t('b.screenGroups.sub'), can('groups.manage') ? btn(t('b.screenGroups.addGroup'), 'todo', { what: t('b.screenGroups.addGroupTodo') }, 'primary') : '')}
      ${table({ tabs: [[t('common.all'), '/backend/groups/groups?kind=all', kind === 'all'], [t('b.screenGroups.tabTeams'), '/backend/groups/groups?kind=team', kind === 'team'], [t('b.screenGroups.tabClassGroups'), '/backend/groups/groups?kind=class_group', kind === 'class_group']],
        cols: [
          { label: t('common.group'), cell: (g: Group) => `<a class="row-link" href="#/backend/groups/groups/${g.id}">${esc(g.name)}</a>` },
          { label: t('common.section'), cell: (g: Group) => esc(section(g.section).name) },
          { label: t('common.kind'), cell: (g: Group) => g.kind === 'team' ? badge(t('b.screenGroups.kindTeam'), 'info') : badge(t('b.screenGroups.kindClassGroup'), 'neutral') },
          { label: t('b.screenGroups.colCategoryLevel'), cell: (g: Group) => esc(g.category || g.level || '—') },
          { label: t('common.coach'), cell: (g: Group) => esc(g.coaches.map(pName).join(', ')) },
          { label: t('b.screenGroups.colParticipants'), num: true, cell: (g: Group) => String(g.members.length) },
          { label: t('b.screenGroups.colPublic'), cell: (g: Group) => g.isPublic ? badge(t('b.screenGroups.yes'), 'success') : badge(t('b.screenGroups.no'), 'neutral') },
        ], rows, empty: [t('b.screenGroups.emptyTitle'), t('b.screenGroups.emptyText')] })}`
  }

  function screenGroup(p: Record<string, string>, q: URLSearchParams): string {
    const g = group(p.id)
    if (!g) return empty(t('b.screenGroup.notFound'), '404')
    const tab = q.get('tab') || 'roster'
    const tabs = `<div class="tabs">${[['details', t('b.screenGroup.tabDetails')], ['roster', t('b.screenGroup.tabRoster')], ['public', t('b.screenGroup.tabPublic')]].map(([k, l]) => `<a class="${tab === k ? 'active' : ''}" href="#/backend/groups/groups/${g.id}?tab=${k}">${l}</a>`).join('')}</div>`
    const kindLabel = (k: string): string => k === 'team' ? t('b.screenGroups.kindTeam') : t('b.screenGroups.kindClassGroup')
    let body = ''
    if (tab === 'details') body = `<form class="form" data-form="group" data-id="${g.id}" novalidate><div class="form-group"><div class="fields">${fld('name', t('common.name'), inp('name', 'text', g.name), { req: true })}${fld('kind', t('common.kind'), sel('kind', [['team', kindLabel('team')], ['class_group', kindLabel('class_group')]], g.kind))}${fld('category', t('b.screenGroup.category'), inp('category', 'text', g.category || ''), { hint: t('b.screenGroup.teamOnly') })}${fld('league', t('b.screenGroup.league'), inp('league', 'text', g.league || ''), { hint: t('b.screenGroup.teamOnly') })}${fld('level', t('b.screenGroup.level'), inp('level', 'text', g.level || ''))}</div></div><div class="form-actions"><button class="btn primary" type="submit">${t('common.save')}</button></div></form>`
    if (tab === 'roster') body = table({ cols: [{ label: t('common.person'), cell: (id: string) => `<a class="row-link" href="#/backend/people/persons/${id}">${esc(pName(id))}</a>` }, { label: t('b.screenGroup.colGroupRole'), cell: (id: string) => g.coaches.includes(id) ? badge(g.kind === 'team' ? t('b.screenGroup.roleCoach') : t('b.screenGroup.roleInstructor'), 'info') : t('b.screenGroup.roleParticipant') }, { label: t('common.age'), num: true, cell: (id: string) => String(ageOn(personById(db, id).birth)) }, { label: t('common.from'), cell: () => '2026-09-01' }, { label: '', cell: (id: string) => can('groups.manage') ? btn(t('b.screenGroup.endMembership'), 'end-member', { group: g.id, person: id }, 'sm') : '' }], rows: [...g.coaches, ...g.members], toolbar: can('groups.manage') ? btn(t('b.screenGroup.addToRoster'), 'add-member', { group: g.id }, 'primary sm') : '', empty: [t('b.screenGroup.rosterEmptyTitle'), t('b.screenGroup.rosterEmptyText')] })
    if (tab === 'public') body = `<form class="form" data-form="group-public" data-id="${g.id}" novalidate><div class="form-group">${chk('isPublic', t('b.screenGroup.isPublic'), g.isPublic)}${fld('publicDescription', t('b.screenGroup.publicDescription'), area('publicDescription', g.publicDescription))}${fld('conditions', t('b.screenGroup.conditions'), area('conditions', g.conditions))}<div class="fields">${fld('ageFrom', t('b.screenGroup.ageFrom'), inp('ageFrom', 'number', String(g.ageFrom ?? '')))}${fld('ageTo', t('b.screenGroup.ageTo'), inp('ageTo', 'number', String(g.ageTo ?? '')))}${fld('level', t('b.screenGroup.level'), inp('level', 'text', g.level || ''))}</div></div><div class="form-actions"><button class="btn primary" type="submit">${t('common.save')}</button></div></form>`
    return `${pageHead(g.name, `${section(g.section).name} · ${kindLabel(g.kind)}`)}${tabs}${body}`
  }

  const ruleText = (a: Activity): string => a.oneOff
    ? t('b.ruleText.oneOff', { date: dShort(a.from), start: a.start, end: a.end })
    : t('b.ruleText.weekly', { days: a.weekdays.map((d) => wdShort(d % 7)).join(', '), start: a.start, end: a.end, until: fmtDate(a.to, 'b.ruleText.untilDate') })

  function screenActivities(): string {
    const secs = coordSections(me())
    const rows = db.activities.filter((a) => isAdmin() || secs.includes(group(a.group).section))
    return `${pageHead(t('b.screenActivities.title'), t('b.screenActivities.sub'), can('activities.manage') ? link(t('b.screenActivities.newActivity'), '/backend/activities/activities/create', 'btn primary') : '')}
      ${table({ cols: [
        { label: t('common.name'), cell: (a: Activity) => `<b>${esc(a.name)}</b>` },
        { label: t('common.group'), cell: (a: Activity) => esc(group(a.group).name) },
        { label: t('common.type'), cell: (a: Activity) => badge(typeLabel(a.type, group(a.group).kind), 'info') },
        { label: t('b.screenActivities.colRule'), cell: (a: Activity) => esc(ruleText(a)) },
        { label: t('common.place'), cell: (a: Activity) => esc(placeName(db, a.place)) },
        { label: t('common.coach'), cell: (a: Activity) => esc(pName(a.coach)) },
        { label: '', cell: (a: Activity) => link(t('b.screenActivities.sessions'), `/backend/activities/occurrences?activity=${a.id}`, 'btn sm') },
      ], rows, toolbar: `<input type="search" placeholder="${esc(t('b.screenActivities.search'))}" aria-label="${esc(t('b.screenActivities.searchAria'))}">` })}`
  }

  function screenActivityCreate(): string {
    const secs = coordSections(me())
    const groups = db.groups.filter((g) => isAdmin() || secs.includes(g.section))
    // Demo prefill: the activity name is club content (Polish).
    const f = ui.wizard ? JSON.parse(ui.wizard) : { group: 'g-orlm', type: 'training', name: 'Trening dodatkowy Orlików młodszych', place: 'pl-boisko', coach: 'p-wojtek', days: ['2'], start: '17:00', end: '18:00', from: '2026-11-17', to: '2026-12-15' }
    const g = group(f.group)
    const types: [string, string][] = g.kind === 'team'
      ? [['training', t('occType.training')], ['match', t('occType.match')], ['sparring', t('occType.sparring')], ['tournament', t('occType.tournament')], ['camp', t('occType.camp')], ['other', t('b.screenActivityCreate.typeOther')]]
      : [['training', t('occType.classes')], ['tournament', t('b.screenActivityCreate.typeTournamentContest')], ['camp', t('occType.camp')], ['other', t('b.screenActivityCreate.typeOther')]]
    const leaves = db.places.filter((p) => !p.external && !db.places.some((c) => c.parent === p.id))
    const coaches = db.persons.filter((p) => db.roles.some((r) => r.person === p.id && r.role === 'coach'))
    const preview = ui.preview ? JSON.parse(ui.preview) as { dates: string[]; conflicts: string[] } : null
    return `${pageHead(t('b.screenActivityCreate.title'), t('b.screenActivityCreate.sub'), link(t('common.cancel'), '/backend/activities/activities', 'btn'))}
      <form class="form" data-form="wizard" novalidate>
      <div class="form-group"><h3>${t('b.screenActivityCreate.basics')}</h3><div class="fields">
        ${fld('group', t('common.group'), sel('group', groups.map((x) => [x.id, `${x.name} (${section(x.section).name})`]), f.group, 'data-change="wizard-group"'), { req: true })}
        ${fld('type', t('common.type'), sel('type', types, types.some((ty) => ty[0] === f.type) ? f.type : 'training'), { req: true, hint: g.kind === 'class_group' ? t('b.screenActivityCreate.typeHint') : '' })}
        ${fld('name', t('common.name'), inp('name', 'text', f.name), { req: true })}
        ${fld('place', t('common.place'), sel('place', leaves.map((p) => [p.id, p.name]), f.place), { req: true })}
        ${fld('coach', t('b.screenActivityCreate.defaultCoach'), sel('coach', [['', t('b.screenActivityCreate.noCoach')], ...coaches.map((p) => [p.id, `${p.first} ${p.last}`] as [string, string])], f.coach))}
      </div></div>
      <div class="form-group"><h3>${t('b.screenActivityCreate.recurrence')}</h3>
        <div class="field" data-field="days"><span>${t('b.screenActivityCreate.weekdays')} <b class="req">*</b></span><div class="chips">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label class="chip ${f.days.includes(String(d)) ? 'on' : ''}"><input type="checkbox" name="days" value="${d}" ${f.days.includes(String(d)) ? 'checked' : ''} class="sr-only" data-change="chip">${wdShort(d % 7)}</label>`).join('')}</div></div>
        <div class="fields" style="margin-top:10px">${fld('start', t('b.screenActivityCreate.startTime'), inp('start', 'time', f.start), { req: true })}${fld('end', t('b.screenActivityCreate.endTime'), inp('end', 'time', f.end), { req: true })}${fld('from', t('b.screenActivityCreate.dateFrom'), inp('from', 'date', f.from), { req: true })}${fld('to', t('b.screenActivityCreate.dateTo'), inp('to', 'date', f.to), { req: true })}</div>
      </div>
      <div class="form-general"></div>
      ${preview ? `<div class="form-group"><h3>${t('b.screenActivityCreate.preview', { n: preview.dates.length })}</h3>${preview.conflicts.length ? `<div class="alert error" role="alert"><strong>${t('b.screenActivityCreate.conflictTitle')}</strong><ul style="margin:4px 0 0;padding-left:18px">${preview.conflicts.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>${t('b.screenActivityCreate.conflictText')}</div>` : `<div class="alert success"><strong>${t('b.screenActivityCreate.noConflictTitle')}</strong>${t('b.screenActivityCreate.noConflictText')}</div>`}
        <div class="chips">${preview.dates.slice(0, 12).map((d) => `<span class="chip">${dShort(d)}</span>`).join('')}${preview.dates.length > 12 ? `<span class="chip">+${preview.dates.length - 12}</span>` : ''}</div></div>` : ''}
      <div class="form-actions"><button type="submit" class="btn" name="mode" value="preview">${t('b.screenActivityCreate.previewButton')}</button><button type="submit" class="btn primary" name="mode" value="create" ${preview && !preview.conflicts.length ? '' : `disabled title="${esc(t('b.screenActivityCreate.previewFirst'))}"`}>${t('common.create')}</button></div></form>`
  }

  function screenOccurrences(q: URLSearchParams): string {
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
    return `${pageHead(t('b.screenOccurrences.title'), t('b.screenOccurrences.sub'))}
      ${table({ tabs: [[t('b.screenOccurrences.tabUpcoming'), `${base}view=all`, view === 'all'], [t('b.screenOccurrences.tabUnassigned'), `${base}view=unassigned`, view === 'unassigned'], [t('b.screenOccurrences.tabUnsettled'), `${base}view=unsettled`, view === 'unsettled'], [t('b.screenOccurrences.tabCancelled'), `${base}view=cancelled`, view === 'cancelled']],
        cols: [
          { label: t('common.date'), cell: (o: Occurrence) => `${dShort(o.date)} ${o.start}` },
          { label: t('b.screenOccurrences.colActivity'), cell: (o: Occurrence) => `<a class="row-link" href="#/club/occurrences/${o.id}">${esc(o.name)}</a>${o.detached ? ` ${badge(t('b.screenOccurrences.edited'), 'neutral')}` : ''}` },
          { label: t('common.group'), cell: (o: Occurrence) => esc(group(o.group).name) },
          { label: t('common.place'), cell: (o: Occurrence) => esc(placeName(db, o.place)) },
          { label: t('common.coach'), cell: (o: Occurrence) => o.coach ? `${esc(pName(o.coach))}${o.coach !== o.defaultCoach ? ` <span class="small muted">(${t('b.screenOccurrences.substitution')})</span>` : ''}` : badge(t('b.screenOccurrences.needsCoach'), 'warning') },
          { label: t('common.status'), cell: (o: Occurrence) => o.status === 'planned' && ended(o) ? badge(t('b.screenOccurrences.unsettled'), 'warning') : statusBadge(o.status) },
          { label: '', cell: (o: Occurrence) => o.status === 'planned' ? `<div class="row">${btn(o.coach ? t('b.screenOccurrences.changeCoach') : t('b.screenOccurrences.assignSubstitute'), 'assign-coach', { occ: o.id }, 'sm' + (o.coach ? '' : ' primary'))}${ended(o) ? link(t('b.screenOccurrences.attendance'), `/club/occurrences/${o.id}/attendance`, 'btn sm') : btn(t('b.screenOccurrences.cancelSession'), 'cancel-occ', { occ: o.id }, 'sm danger')}</div>` : '' },
        ], rows, empty: view === 'unassigned' ? [t('b.screenOccurrences.emptyUnassignedTitle'), t('b.screenOccurrences.emptyUnassignedText')] : view === 'unsettled' ? [t('b.screenOccurrences.emptyUnsettledTitle'), t('b.screenOccurrences.emptyUnsettledText')] : [t('b.screenOccurrences.emptyTitle'), t('b.screenOccurrences.emptyText')] })}`
  }

  function unitsReport(month: string): { coach: string; planned: number; given: number; taken: number; balance: number; matches: number; amount: number | null; occs: Occurrence[] }[] {
    const done = db.occurrences.filter((o) => o.status === 'done' && o.date.startsWith(month))
    const coaches = [...new Set([...done.map((o) => o.coach), ...done.map((o) => o.defaultCoach)].filter(Boolean) as string[])]
    return coaches.map((c) => {
      const tr = done.filter((o) => o.type === 'training')
      const planned = tr.filter((o) => o.defaultCoach === c).length
      const given = tr.filter((o) => o.defaultCoach === c && o.coach !== c).length
      const taken = tr.filter((o) => o.coach === c && o.defaultCoach !== c).length
      const balance = tr.filter((o) => o.coach === c).length
      const matches = done.filter((o) => ['match', 'sparring'].includes(o.type) && o.coach === c).length
      const k = db.contracts.find((x) => x.party === c && x.kind === 'coach')
      return { coach: c, planned, given, taken, balance, matches, amount: k ? k.base + balance * k.unit + matches * k.match : null, occs: done.filter((o) => o.coach === c || o.defaultCoach === c) }
    }).filter((r) => isAdmin() || can('activities.reports.view') || r.coach === me())
  }

  function screenUnits(q: URLSearchParams): string {
    const month = q.get('month') || '2026-11'
    const rows = unitsReport(month)
    const showAmount = isAdmin()
    const unsettled = db.occurrences.filter((o) => o.status === 'planned' && ended(o) && o.date.startsWith(month)).length
    return `${pageHead(t('b.screenUnits.title'), t('b.screenUnits.sub'), `${sel('month', [['2026-11', fmtMonth('2026-11')], ['2026-10', fmtMonth('2026-10')]], month, `data-change="units-month" aria-label="${esc(t('b.screenUnits.monthAria'))}"`)}${btn(t('b.screenUnits.exportCsv'), 'units-csv', { month }, 'primary')}`)}
      ${unsettled ? `<div class="alert warning"><strong>${t('b.screenUnits.unsettledTitle', { n: unsettled })}</strong>${t('b.screenUnits.unsettledText')} ${link(t('common.show'), '/backend/activities/occurrences?view=unsettled', '')}</div>` : ''}
      ${table({ cols: [
        { label: t('common.coach'), cell: (r) => `<b>${esc(pName(r.coach))}</b>` },
        { label: t('b.screenUnits.colPlanned'), num: true, cell: (r) => String(r.planned) },
        { label: t('b.screenUnits.colGiven'), num: true, cell: (r) => String(r.given) },
        { label: t('b.screenUnits.colTaken'), num: true, cell: (r) => String(r.taken) },
        { label: t('b.screenUnits.colBalance'), num: true, cell: (r) => `<b>${r.balance}</b>` },
        { label: t('b.screenUnits.colMatches'), num: true, cell: (r) => String(r.matches) },
        ...(showAmount ? [{ label: t('common.amount'), num: true, cell: (r: any) => r.amount === null ? badge(t('b.screenUnits.noContract'), 'warning') : zl(r.amount) }] : []),
        { label: t('b.screenUnits.colSessions'), cell: (r) => `<details><summary class="small">${t('b.screenUnits.sessionCount', { n: r.occs.length })}</summary><ul class="small" style="margin:4px 0;padding-left:16px">${r.occs.map((o: Occurrence) => `<li>${dShort(o.date)} ${esc(group(o.group).name)} — ${esc(pName(o.coach))}${o.coach !== o.defaultCoach ? ` (${t('b.screenOccurrences.substitution')})` : ''}</li>`).join('')}</ul></details>` },
      ], rows, empty: [t('b.screenUnits.emptyTitle'), t('b.screenUnits.emptyText')] })}`
  }

  function screenPolicies(): string {
    const modeKey: Record<string, string> = { immediate: 'b.screenPolicies.modeImmediate', guardian_confirm: 'b.screenPolicies.modeGuardianConfirm', guardian_only: 'b.screenPolicies.modeGuardianOnly' }
    return `${pageHead(t('b.screenPolicies.title'), t('b.screenPolicies.sub'), btn(t('b.screenPolicies.addPolicy'), 'todo', { what: t('b.screenPolicies.addPolicyTodo') }, 'primary'))}
      ${table({ cols: [{ label: t('b.screenPolicies.colScope'), cell: (p: any) => esc(t(`policy.scope.${p.scope}`)) }, { label: t('b.screenPolicies.colTarget'), cell: (p: any) => esc(p.target === 'club' ? t('policy.target.club') : typeLabel(p.target as OccType)) }, { label: t('b.screenPolicies.colMode'), cell: (p: any) => esc(t(modeKey[p.mode])) }, { label: t('b.screenPolicies.colLimit'), num: true, cell: (p: any) => t('b.screenPolicies.hours', { n: p.hours }) }, { label: t('b.screenPolicies.colAfter'), cell: (p: any) => p.after === 'declared' ? t('b.screenPolicies.afterAccepted') : t('b.screenPolicies.afterRejected') }], rows: db.policies })}`
  }

  function screenThreadsAdmin(q: URLSearchParams): string {
    const onlyCases = q.get('cases') === '1'
    const rows = visibleThreads().filter((th) => !onlyCases || th.isCase)
    return `${pageHead(t('b.screenThreadsAdmin.title'), t('b.screenThreadsAdmin.sub'), btn(t('b.screenThreadsAdmin.newAnnouncement'), 'new-thread', {}, 'primary'))}
      ${table({ tabs: [[t('common.all'), '/backend/communication/threads', !onlyCases], [t('b.screenThreadsAdmin.tabCases'), '/backend/communication/threads?cases=1', onlyCases]],
        cols: [
          { label: t('b.screenThreadsAdmin.colSubject'), cell: (th: Thread) => `<a class="row-link" href="#/backend/communication/threads/${th.id}">${esc(txt(th.subject))}</a>` },
          { label: t('b.screenThreadsAdmin.colScope'), cell: (th: Thread) => esc(txt(th.scopeLabel)) },
          { label: t('b.screenThreadsAdmin.colLastMessage'), cell: (th: Thread) => `${esc(pName(th.messages[th.messages.length - 1].author))}, ${esc(th.messages[th.messages.length - 1].at)}` },
          { label: t('b.screenThreadsAdmin.colMessages'), num: true, cell: (th: Thread) => String(th.messages.length) },
          { label: '', cell: (th: Thread) => th.isCase ? badge(t('b.screenThreadsAdmin.case'), 'warning') : '' },
        ], rows, empty: onlyCases ? [t('b.screenThreadsAdmin.emptyCasesTitle'), t('b.screenThreadsAdmin.emptyCasesText')] : [t('b.screenThreadsAdmin.emptyTitle'), t('b.screenThreadsAdmin.emptyText')] })}`
  }

  function screenThreadAdmin(p: Record<string, string>): string {
    const th = db.threads.find((x) => x.id === p.id)
    if (!th) return empty(t('b.screenThreadAdmin.notFound'), '404')
    return `${pageHead(txt(th.subject), txt(th.scopeLabel), link(t('b.screenThreadAdmin.allThreads'), '/backend/communication/threads', 'btn'))}<div style="max-width:760px">${threadView(th, true)}</div>`
  }

  function screenFees(): string {
    return `${pageHead(t('b.screenFees.title'), t('b.screenFees.sub'), btn(t('b.screenFees.addFee'), 'new-fee', {}, 'primary'))}
      ${table({ cols: [{ label: t('common.name'), cell: (f: Fee) => `<b>${esc(f.name)}</b>` }, { label: t('b.screenFees.colAppliesTo'), cell: (f: Fee) => esc(t('b.screenFees.appliesToGroup', { name: group(f.group).name })) }, { label: t('common.period'), cell: (f: Fee) => esc(t(`fee.period.${f.period}`)) }, { label: t('common.amount'), num: true, cell: (f: Fee) => zl(f.amount) }, { label: t('b.screenFees.colDueDay'), num: true, cell: (f: Fee) => String(f.dueDay) }], rows: db.fees })}
      <div class="section-title">${t('b.screenFees.discounts')}</div>
      ${table({ cols: [{ label: t('common.name'), cell: (d: any) => `<b>${esc(d.name)}</b>` }, { label: t('common.kind'), cell: (d: any) => esc(t(`discount.kind.${d.kind}`)) }, { label: t('b.screenFees.colValue'), num: true, cell: (d: any) => `−${d.percent}%` }, { label: t('b.screenFees.colRule'), cell: () => t('b.screenFees.siblingRule') }], rows: db.discounts })}
      <div class="section-title">${t('b.screenFees.coachesAndPayments')}</div>
      <div class="card"><label class="field" data-field="coachFees"><span>${t('b.screenFees.coachSees')}</span>${sel('coachFees', [['collect', t('b.screenFees.coachFeesCollect')], ['view', t('b.screenFees.coachFeesView')], ['none', t('b.screenFees.coachFeesNone')]], db.settings.coachFees || 'collect', 'data-change="coach-fees"')}<small>${t('b.screenFees.coachFeesHint')}</small></label></div>
      <div class="card"><label class="field" data-field="onlineFee"><span>${t('b.screenFees.onlineFee')}</span>${sel('onlineFee', [['club_pays', t('b.screenFees.onlineFeeClub')], ['payer_pays', t('b.screenFees.onlineFeePayer')]], db.settings.onlineFee.mode, 'data-change="online-fee"')}<small>${t('b.screenFees.onlineFeeHint', { amount: zl(db.settings.onlineFee.fixed) })}</small></label></div>`
  }

  function chargesTable(rows: Charge[], toolbar = '', tabs?: [string, string, boolean][]): string {
    return table({ tabs, toolbar, cols: [
      { label: t('b.chargesTable.colCharge'), cell: (c: Charge) => `<a class="row-link" href="#/backend/payments/charges/${c.id}">${esc(txt(c.description))}</a>` },
      { label: t('common.payer'), cell: (c: Charge) => c.payerMissing ? badge(t('b.chargesTable.noPayer'), 'warning') : esc(c.payerPerson ? pName(c.payerPerson) : c.payerInstitution) },
      { label: t('common.period'), cell: (c: Charge) => esc(c.period || '—') },
      { label: t('common.amount'), num: true, cell: (c: Charge) => `${zl(c.amount - c.discount)}${c.discount ? `<div class="small muted">${t('b.chargesTable.discount', { amount: zl(c.discount) })}</div>` : ''}` },
      { label: t('b.chargesTable.colRemaining'), num: true, cell: (c: Charge) => ['paid', 'cancelled', 'forfeited'].includes(c.status) ? '—' : zl(remaining(c)) },
      { label: t('common.due'), cell: (c: Charge) => `${dShort(c.due)}${c.due < TODAY && ['open', 'partially_paid'].includes(c.status) ? ` ${badge(t('b.chargesTable.overdue'), 'error')}` : ''}` },
      { label: t('b.chargesTable.colPayee'), cell: (c: Charge) => c.payee === 'club' ? t('b.chargesTable.payeeClub') : badge(t('b.chargesTable.payeeOwner'), 'info') },
      { label: t('common.status'), cell: (c: Charge) => statusBadge(c.status) },
    ], rows, empty: [t('b.chargesTable.emptyTitle'), t('b.chargesTable.emptyText')] })
  }

  // Fixed payer code for the transfer title (e.g. GW-K7Q2).
  function payerCode(pid: string): string {
    let h = 7
    for (const ch of pid) h = (h * 31 + ch.charCodeAt(0)) % 1679616
    return 'GW-' + h.toString(36).toUpperCase().padStart(4, '0').slice(-4)
  }
  const payers = (): string[] => [...new Set(db.charges.filter((c) => c.source !== 'rental' && c.payerPerson).map((c) => c.payerPerson as string))]
  const openOf = (pid: string): Charge[] => db.charges.filter((c) => c.source !== 'rental' && c.payerPerson === pid && ['open', 'partially_paid'].includes(c.status)).sort((a, b) => a.due.localeCompare(b.due))

  // Matching: code in the title → payer; the amount is allocated from the oldest charge. Without a code — surname + amount (to confirm).
  function matchTx(tx: BankTx): void {
    const code = (tx.title.toUpperCase().match(/GW-[A-Z0-9]{4}/) || [])[0]
    let payer = code ? payers().find((x) => payerCode(x) === code) : undefined
    let byName = false
    if (!payer) {
      // Whole words only ("Lis" ≠ "listopad"); the letter class covers Polish surnames in bank data.
      const words = new Set(`${tx.sender} ${tx.title}`.toLowerCase().split(/[^a-z\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c]+/).filter(Boolean))
      const cands = payers().filter((x) => [x, ...wardsOf(x)].some((y) => words.has(personById(db, y).last.toLowerCase())))
      if (cands.length === 1) { payer = cands[0]; byName = true }
    }
    tx.alloc = []; tx.payer = payer
    if (!payer) { tx.status = 'unmatched'; tx.reason = lt('b.matchTx.noPayer'); return }
    let left = tx.amount
    for (const c of openOf(payer)) { if (left <= 0) break; const a = Math.min(left, remaining(c)); tx.alloc.push({ chargeId: c.id, amount: a }); left -= a }
    const owed = openOf(payer).reduce((sum, c) => sum + remaining(c), 0)
    const exactPrefix = left === 0 && tx.alloc.every((a) => a.amount === remaining(db.charges.find((c) => c.id === a.chargeId) as Charge))
    if (!tx.alloc.length) { tx.status = 'suggested'; tx.reason = lt('b.matchTx.noOpenCharges', { payer: pName(payer), amount: lm(tx.amount) }) }
    else if (byName) { tx.status = 'suggested'; tx.reason = lt(tx.amount === owed ? 'b.matchTx.byNameAndAmount' : 'b.matchTx.byName') }
    else if (left > 0) { tx.status = 'suggested'; tx.reason = lt('b.matchTx.overpaid', { amount: lm(left), code: code as string }) }
    else if (!exactPrefix) { tx.status = 'suggested'; tx.reason = lt('b.matchTx.underpaid', { code: code as string }) }
    else { tx.status = 'booked'; tx.reason = lt('b.matchTx.exact', { code: code as string }); tx.auto = true }
  }

  function bookTx(tx: BankTx): void {
    for (const a of tx.alloc) {
      const c = db.charges.find((x) => x.id === a.chargeId) as Charge
      c.payments.push({ amount: a.amount, method: 'transfer', date: tx.date, ref: tx.title, bankTx: tx.id })
      c.status = remaining(c) <= 0 ? 'paid' : 'partially_paid'
    }
    tx.status = 'booked'
  }
  function unbookTx(tx: BankTx): void {
    for (const c of db.charges) { const before = c.payments.length; c.payments = c.payments.filter((x) => x.bankTx !== tx.id); if (c.payments.length !== before) c.status = c.payments.length ? 'partially_paid' : 'open' }
  }

  function importStatement(file: string, rows: { date: string; amount: number; sender: string; title: string }[]): BankImport {
    const imp: BankImport = { id: uid('imp'), file, at: `${TODAY} ${NOW}`, by: me(), total: rows.length, booked: 0, suggested: 0, unmatched: 0, skipped: 0 }
    for (const row of rows) {
      if (row.amount <= 0) { imp.skipped++; continue } // account debits are skipped
      const hash = `${row.date}|${row.amount}|${row.sender}|${row.title}`
      if (db.bankTx.some((x) => x.hash === hash)) { imp.skipped++; continue } // repeated import — no duplicates
      const tx: BankTx = { id: uid('tx'), importId: imp.id, date: row.date, amount: row.amount, sender: row.sender, title: row.title, hash, status: 'unmatched', alloc: [], reason: '' }
      matchTx(tx)
      if (tx.status === 'booked') { if (db.settings.autoBook !== false) bookTx(tx); else tx.status = 'suggested' }
      db.bankTx.push(tx)
      imp[tx.status === 'booked' ? 'booked' : tx.status === 'suggested' ? 'suggested' : 'unmatched']++
    }
    db.bankImports.unshift(imp)
    return imp
  }

  // Sample bank statement built from the current charges (to demonstrate matching). Rows are bank data (Polish).
  function sampleStatement(): { date: string; amount: number; sender: string; title: string }[] {
    const sum = (pid: string): number => openOf(pid).reduce((a, c) => a + remaining(c), 0)
    const rows: { date: string; amount: number; sender: string; title: string }[] = []
    const add = (pid: string, amount: number, title: string, sender?: string): void => { if (amount > 0) rows.push({ date: '2026-11-09', amount, sender: sender || pName(pid).toUpperCase(), title }) }
    add('p-marek', sum('p-marek'), `${payerCode('p-marek')} składki Zosia i Adam`)
    add('p-ewelina', (openOf('p-ewelina')[0] ? remaining(openOf('p-ewelina')[0]) : 0), `${payerCode('p-ewelina')} składka październik`)
    add('p-iwona', sum('p-iwona'), 'Składka Kuba i Maja Pawlak listopad')
    add('p-dorota', sum('p-dorota'), 'zumba listopad', 'DOROTA WÓJCIK')
    add('p-teresa', sum('p-teresa') + 2000, `${payerCode('p-teresa')} zumba`)
    rows.push({ date: '2026-11-08', amount: 50000, sender: 'JAN KOWALCZYK', title: 'Darowizna na stroje dla dzieci' })
    rows.push({ date: '2026-11-08', amount: -12000, sender: 'ENERGIA SA', title: 'Opłata za prąd — obciążenie' })
    return rows
  }

  // Simple CSV parser: columns date; amount; sender; title (the header is recognised by column names).
  function parseCsv(text: string): { date: string; amount: number; sender: string; title: string }[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (!lines.length) return []
    const sep = lines[0].includes(';') ? ';' : ','
    const head = lines[0].toLowerCase().split(sep).map((x) => x.replace(/"/g, '').trim())
    const col = (names: string[]): number => head.findIndex((h) => names.some((n) => h.includes(n)))
    // Header names accepted in bank exports (Polish and English column names) — input matching, not UI text.
    const ci = { date: col(['data', 'date']), amount: col(['kwota', 'amount']), sender: col(['nadawca', 'kontrahent', 'nazwa', 'sender']), title: col(['tytuł', 'tytul', 'opis', 'title']) }
    if (Object.values(ci).some((v) => v < 0)) throw new Error(t('b.parseCsv.errColumns'))
    return lines.slice(1).map((l) => { const c = l.split(sep).map((x) => x.replace(/^"|"$/g, '').trim()); const d = c[ci.date]; const iso = /^\d{2}[.-]\d{2}[.-]\d{4}$/.test(d) ? `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}` : d; return { date: iso, amount: Math.round(Number(c[ci.amount].replace(/\s/g, '').replace(',', '.')) * 100), sender: c[ci.sender] || '', title: c[ci.title] || '' } }).filter((x) => !Number.isNaN(x.amount))
  }

  function screenBank(q: URLSearchParams): string {
    const view = q.get('view') || 'suggested'
    const rows = db.bankTx.filter((bt) => view === 'all' || bt.status === view).sort((a, b) => b.date.localeCompare(a.date))
    const cnt = (st: string): number => db.bankTx.filter((bt) => bt.status === st).length
    const last = db.bankImports[0]
    return `${pageHead(t('b.screenBank.title'), t('b.screenBank.subtitle'), `${btn(t('b.cashForm.acceptCash'), 'cash', {}, '')}`)}
      <div class="card"><div class="row between" style="align-items:flex-start"><div style="flex:1;min-width:240px"><h3 style="margin:0 0 4px">${t('b.screenBank.importTitle')}</h3><p class="small muted" style="margin:0 0 8px">${t('b.screenBank.importHint')}</p>
        <label class="field" data-field="statement"><span>${t('b.screenBank.statementFile')}</span><input type="file" accept=".csv,.txt,.sta,.mt940" data-change="bank-file"></label></div>
        <div class="stack">${btn(t('b.screenBank.loadSample'), 'bank-sample', {}, 'primary')}<label class="check small"><input type="checkbox" data-change="autobook" ${db.settings.autoBook !== false ? 'checked' : ''}><span>${t('b.screenBank.autoBook')}</span></label></div></div>
        ${last ? `<div class="alert success" style="margin:12px 0 0"><strong>${t('b.screenBank.lastImport', { file: esc(last.file), at: esc(last.at) })}</strong>${t('b.screenBank.lastImportSummary', { n: last.total, booked: last.booked, suggested: last.suggested, unmatched: last.unmatched, skipped: last.skipped })}</div>` : ''}</div>
      <div style="margin-top:12px">${table({ tabs: [[t('b.screenBank.tabSuggested', { count: cnt('suggested') }), '/backend/payments/bank?view=suggested', view === 'suggested'], [t('b.screenBank.tabUnmatched', { count: cnt('unmatched') }), '/backend/payments/bank?view=unmatched', view === 'unmatched'], [t('b.screenBank.tabBooked', { count: cnt('booked') }), '/backend/payments/bank?view=booked', view === 'booked'], [t('b.screenBank.tabIgnored', { count: cnt('ignored') }), '/backend/payments/bank?view=ignored', view === 'ignored'], [t('common.all'), '/backend/payments/bank?view=all', view === 'all']],
        cols: [
          { label: t('common.date'), cell: (bt: BankTx) => dShort(bt.date) },
          { label: t('common.amount'), num: true, cell: (bt: BankTx) => `<b>${zl(bt.amount)}</b>` },
          { label: t('b.screenBank.colSenderTitle'), cell: (bt: BankTx) => `<b>${esc(bt.sender)}</b><div class="small muted">${esc(bt.title)}</div>` },
          { label: t('b.screenBank.colMatch'), cell: (bt: BankTx) => `${bt.payer ? `<b>${esc(pName(bt.payer))}</b> <span class="small muted">${payerCode(bt.payer)}</span>` : '—'}${bt.alloc.length ? `<div class="small">${bt.alloc.map((a) => `${esc(txt((db.charges.find((c) => c.id === a.chargeId) as Charge).description))} — ${zl(a.amount)}`).join('<br>')}</div>` : ''}<div class="small muted">${esc(txt(bt.reason))}</div>` },
          { label: t('common.status'), cell: (bt: BankTx) => bt.status === 'booked' ? badge(bt.auto ? t('b.screenBank.statusBookedAuto') : t('b.screenBank.statusBooked'), 'success') : bt.status === 'suggested' ? badge(t('b.screenBank.statusSuggested'), 'warning') : bt.status === 'unmatched' ? badge(t('b.screenBank.statusUnmatched'), 'error') : badge(t('b.screenBank.statusIgnored'), 'neutral') },
          { label: '', cell: (bt: BankTx) => bt.status === 'suggested' ? `<div class="row">${bt.alloc.length ? btn(t('common.confirm'), 'tx-confirm', { id: bt.id }, 'sm primary') : ''}${btn(t('b.screenBank.change'), 'tx-assign', { id: bt.id }, 'sm')}${btn(t('b.screenBank.skip'), 'tx-ignore', { id: bt.id }, 'sm')}</div>` : bt.status === 'unmatched' ? `<div class="row">${btn(t('b.screenBank.assign'), 'tx-assign', { id: bt.id }, 'sm primary')}${btn(t('b.screenBank.skip'), 'tx-ignore', { id: bt.id }, 'sm')}</div>` : bt.status === 'booked' ? btn(t('b.screenBank.undo'), 'tx-undo', { id: bt.id }, 'sm') : btn(t('b.screenBank.restore'), 'tx-undo', { id: bt.id }, 'sm') },
        ], rows, empty: view === 'suggested' ? [t('b.screenBank.emptySuggestedTitle'), t('b.screenBank.emptySuggestedText')] : [t('b.screenBank.emptyTitle'), t('b.screenBank.emptyText')] })}</div>
      ${db.bankImports.length ? `<div class="section-title">${t('b.screenBank.importHistory')}</div>${table({ cols: [{ label: t('b.screenBank.colFile'), cell: (i: BankImport) => esc(i.file) }, { label: t('common.when'), cell: (i: BankImport) => esc(i.at) }, { label: t('b.screenBank.colWho'), cell: (i: BankImport) => esc(pName(i.by)) }, { label: t('b.screenBank.colItems'), num: true, cell: (i: BankImport) => String(i.total) }, { label: t('b.screenBank.colAuto'), num: true, cell: (i: BankImport) => String(i.booked) }, { label: t('b.screenBank.colToConfirm'), num: true, cell: (i: BankImport) => String(i.suggested) }, { label: t('b.screenBank.colUnmatched'), num: true, cell: (i: BankImport) => String(i.unmatched) }, { label: t('b.screenBank.colSkipped'), num: true, cell: (i: BankImport) => String(i.skipped) }], rows: db.bankImports })}` : ''}`
  }

  // Cash acceptance form — shared by the panel (modal) and the phone (M-15).
  function cashForm(pre = '', inModal = true, only = ''): string {
    const ps = payers().filter((x) => openOf(x).length).sort((a, b) => personById(db, a).last.localeCompare(personById(db, b).last, 'pl'))
    const sel0 = pre || ui.cashPayer || ''
    const charges = sel0 ? openOf(sel0) : []
    const picked = charges.filter((c) => !only || c.id === only)
    return `${fld('payer', t('b.cashForm.payer'), sel('payer', [['', t('common.choose')], ...ps.map((x) => [x, t('b.cashForm.payerOption', { name: `${personById(db, x).last} ${personById(db, x).first}`, wards: wardsOf(x).filter((w) => db.charges.some((c) => c.person === w)).map((w) => personById(db, w).first).join(', ') || t('b.cashForm.self'), amount: zl(openOf(x).reduce((a, c) => a + remaining(c), 0)) })] as [string, string])], sel0, 'data-change="cash-payer"'), { req: true })}
      <div class="field" data-field="charges" style="margin-top:10px"><span>${t('b.cashForm.forWhat')} <b class="req">*</b></span>${charges.length ? charges.map((c) => `<label class="check"><input type="checkbox" name="charges" value="${c.id}" ${picked.includes(c) ? 'checked' : ''} data-change="cash-sum"><span>${esc(txt(c.description))} · ${esc(c.period || '')} — <b>${zl(remaining(c))}</b>${c.due < TODAY ? ' ' + badge(t('b.cashForm.overdue'), 'error') : ''}</span></label>`).join('') : `<p class="small muted" style="margin:0">${t('b.cashForm.choosePayerFirst')}</p>`}</div>
      <div class="fields" style="margin-top:10px">${fld('amount', t('b.cashForm.amountTaken'), inp('amount', 'number', picked.length ? String(picked.reduce((a, c) => a + remaining(c), 0) / 100) : '', 'step="0.01" min="0.01" id="cash-amount"'), { req: true, hint: t('b.cashForm.amountHint') })}${fld('date', t('common.date'), inp('date', 'date', TODAY), { req: true })}</div>
      ${chk('notify', t('b.cashForm.notify'), true)}
      <p class="small muted">${t('b.cashForm.takenBy', { name: esc(pName(me())) })}</p>
      ${inModal ? '' : `<div class="form-general"></div><button class="btn primary block" type="submit">${t('b.cashForm.acceptCash')}</button>`}`
  }

  function recordCash(fd: FormData): Errors | void {
    const errs: Errors = {}
    const payer = String(fd.get('payer') || '')
    const ids = fd.getAll('charges').map(String)
    const amt = Math.round(Number(fd.get('amount')) * 100)
    if (!payer) errs.payer = t('b.recordCash.errPayer')
    if (payer && !ids.length) errs.charges = t('b.recordCash.errCharges')
    const chosen = openOf(payer).filter((c) => ids.includes(c.id))
    const max = chosen.reduce((a, c) => a + remaining(c), 0)
    if (!(amt > 0)) errs.amount = t('b.recordCash.errAmountZero')
    else if (amt > max) errs.amount = t('b.recordCash.errAmountTooHigh', { max: zl(max) })
    if (String(fd.get('date')) > TODAY) errs.date = t('b.recordCash.errFutureDate')
    if (Object.keys(errs).length) return errs
    const receipt = `KP/2026/11/${String(++db.receiptSeq).padStart(3, '0')}`
    let left = amt
    for (const c of chosen) { if (left <= 0) break; const a = Math.min(left, remaining(c)); c.payments.push({ amount: a, method: 'cash', date: String(fd.get('date')), by: me(), receipt, settled: can('payments.cash.settle') ? 'club_cash' : undefined }); c.status = remaining(c) <= 0 ? 'paid' : 'partially_paid'; left -= a }
    // The e-mail keeps catalog keys (Txt), so the test mailbox follows the UI language.
    if (fd.get('notify')) mail(personById(db, payer).email || '', lt('b.recordCash.mailSubject', { receipt }), lt('b.recordCash.mailBody', { amount: lm(amt), items: chosen.flatMap((c, i) => (i ? [', ', c.description] : [c.description])), by: pName(me()) }))
    delete ui.cashPayer
    toast(t('b.recordCash.toast', { amount: zl(amt), payer: pName(payer), receipt, mailNote: fd.get('notify') ? t('b.recordCash.toastMailSent') : '' }))
  }

  function screenCashMobile(): string {
    const today = db.charges.flatMap((c) => c.payments.filter((x) => x.method === 'cash' && x.date === TODAY && x.by === me()).map((x) => ({ x, c })))
    return `<form class="form" data-form="cash-mobile" novalidate>${cashForm('', false)}</form>
      <div class="section-title">${t('b.screenCashMobile.takenToday')}</div>${today.length ? `<ul class="list small">${today.map(({ x, c }) => `<li class="row between"><span>${esc(txt(c.description))}<br><span class="muted">${esc(x.receipt)}</span></span><b>${zl(x.amount)}</b></li>`).join('')}<li class="row between"><b>${t('b.screenCashMobile.totalToHandOver')}</b><b>${zl(today.reduce((a, row) => a + row.x.amount, 0))}</b></li></ul>` : `<p class="small muted">${t('b.screenCashMobile.nothingYet')}</p>`}`
  }

  function screenCharges(q: URLSearchParams): string {
    const view = q.get('view') || 'all'
    let rows = db.charges
    if (view === 'all') rows = rows.filter((c) => c.source === 'fee')
    if (view === 'orders') rows = rows.filter((c) => c.source === 'order')
    if (view === 'overdue') rows = rows.filter((c) => c.source === 'fee' && c.due < TODAY && ['open', 'partially_paid'].includes(c.status))
    if (view === 'missing') rows = rows.filter((c) => c.payerMissing && c.status !== 'paid')
    if (view === 'owner') rows = rows.filter((c) => c.payee === 'owner_institution')
    rows = [...rows].sort((a, b) => (b.period || b.due).localeCompare(a.period || a.due))
    if (view === 'cash') rows = db.charges.filter((c) => c.payments.some((x) => x.method === 'cash'))
    const gen = ui.genResult ? JSON.parse(ui.genResult) : null
    return `${pageHead(t('b.screenCharges.title'), t('b.screenCharges.subtitle'), `${btn(t('b.cashForm.acceptCash'), 'cash', {}, '')}${link(t('b.screenCharges.importStatement'), '/backend/payments/bank', 'btn')}${btn(t('b.screenCharges.generatePeriod'), 'generate', {}, 'primary')}`)}
      ${gen ? `<div class="alert success" role="status"><strong>${t('b.screenCharges.generatedTitle', { period: esc(gen.period) })}</strong>${t('b.screenCharges.generatedText', { created: gen.created, skipped: gen.skipped, missing: gen.missing })}</div>` : ''}
      ${chargesTable(rows, `<input type="search" placeholder="${esc(t('b.screenCharges.searchPlaceholder'))}" aria-label="${esc(t('b.screenCharges.search'))}">${btn(t('b.screenCharges.exportCsv'), 'todo', { what: t('b.screenCharges.exportWhat') }, 'sm')}`, [[t('b.screenCharges.tabFees'), '/backend/payments/charges?view=all', view === 'all'], [t('b.screenCharges.tabOverdue'), '/backend/payments/charges?view=overdue', view === 'overdue'], [t('b.screenCharges.tabOrders'), '/backend/payments/charges?view=orders', view === 'orders'], [t('b.screenCharges.tabMissing'), '/backend/payments/charges?view=missing', view === 'missing'], [t('b.screenCharges.tabOwner'), '/backend/payments/charges?view=owner', view === 'owner'], [t('b.screenCharges.tabCash'), '/backend/payments/charges?view=cash', view === 'cash']])}`
  }

  // Name of the facility owner (municipality) — club data, used as a parameter in UI text.
  const ownerName = (): string => (db.institutions.find((i) => i.type === 'municipality') || { name: '—' }).name

  function screenCharge(p: Record<string, string>): string {
    const c = db.charges.find((x) => x.id === p.id)
    if (!c) return empty(t('b.screenCharge.notFound'), '404')
    return `${pageHead(txt(c.description), `${c.period ? `${t('b.screenCharge.periodPrefix', { period: c.period })} · ` : ''}${t('b.screenCharge.dueOn', { date: dShort(c.due) })}`, `${['open', 'partially_paid'].includes(c.status) && c.payerPerson ? btn(t('b.cashForm.acceptCash'), 'cash', { payer: c.payerPerson }, '') : ''}${['open', 'partially_paid'].includes(c.status) ? btn(t('b.screenCharge.recordPayment'), 'record-payment', { id: c.id }, 'primary') : ''}${c.status === 'open' && !c.payments.length ? btn(t('b.screenCharge.cancelCharge'), 'cancel-charge', { id: c.id }, 'danger') : ''}`)}
      <div class="grid3"><div class="card"><div class="sub">${t('b.screenCharge.toPay')}</div><div class="kpi">${zl(c.amount - c.discount)}</div>${c.discount ? `<div class="small muted">${t('b.screenCharge.discountLine', { name: esc(txt(c.discountName)), discount: zl(c.discount), amount: zl(c.amount) })}</div>` : ''}</div>
      <div class="card"><div class="sub">${t('b.screenCharge.remaining')}</div><div class="kpi">${zl(Math.max(0, remaining(c)))}</div>${statusBadge(c.status)}</div>
      <div class="card"><div class="sub">${t('b.screenCharge.payerPayee')}</div><div class="item-title">${c.payerMissing ? badge(t('b.screenCharge.noPayer'), 'warning') : esc(c.payerPerson ? pName(c.payerPerson) : c.payerInstitution)}</div><div class="small muted">${c.payee === 'club' ? t('b.screenCharge.toClubAccount') : t('b.screenCharge.toOwnerAccount', { owner: esc(ownerName()) })}</div></div></div>
      <div class="section-title">${t('b.screenCharge.payments')}</div>${table({ cols: [{ label: t('common.date'), cell: (x: any) => esc(x.date) }, { label: t('b.screenCharge.colMethod'), cell: (x: any) => `${esc(t(`pay.method.${x.method}`))}${x.method === 'transfer' && c.payee === 'owner_institution' ? ` <span class="small muted">(${t('b.screenCharge.toOwnerAccount', { owner: esc(ownerName()) })})</span>` : ''}` }, { label: t('b.screenCharge.colReference'), cell: (x: any) => esc(x.receipt || x.ref || '—') }, { label: t('b.screenCharge.colTakenBy'), cell: (x: any) => x.by ? esc(pName(x.by)) : x.bankTx ? t('b.screenCharge.bankStatement') : '—' }, { label: t('common.amount'), num: true, cell: (x: any) => zl(x.amount) }], rows: c.payments, empty: [t('b.screenCharge.emptyTitle'), t('b.screenCharge.emptyText')] })}`
  }

  function screenRentals(q: URLSearchParams): string {
    const st = q.get('status') || 'active'
    const rows = db.rentals.filter((r) => st === 'all' || (st === 'active' ? ['requested', 'confirmed'].includes(r.status) : r.status === st)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    return `${pageHead(t('b.screenRentals.title'), t('b.screenRentals.subtitle'), link(t('b.screenRentals.newRental'), '/backend/facilities/calendar?place=pl-boisko', 'btn primary'))}
      ${table({ tabs: [[t('b.screenRentals.tabActive'), '/backend/facilities/rentals?status=active', st === 'active'], [t('b.screenRentals.tabPending'), '/backend/facilities/rentals?status=pending_approval', st === 'pending_approval'], [t('common.all'), '/backend/facilities/rentals?status=all', st === 'all']],
        cols: [
          { label: t('b.screenRentals.colSession'), cell: (r: Rental) => `${dShort(r.date)} ${r.start}–${r.end}` },
          { label: t('common.place'), cell: (r: Rental) => esc(placeName(db, r.place)) },
          { label: t('b.screenRentals.colRenter'), cell: (r: Rental) => `<b>${esc(r.renter)}</b><div class="small muted">${esc(r.contact)} · ${esc(r.phone)}</div>` },
          { label: t('b.screenRentals.colSource'), cell: (r: Rental) => esc(t(`rental.via.${r.via}`)) },
          { label: t('common.amount'), num: true, cell: (r: Rental) => zl(r.amount) },
          { label: t('common.status'), cell: (r: Rental) => statusBadge(r.status) },
          { label: '', cell: (r: Rental) => r.status === 'requested' ? `<div class="row">${btn(t('b.screenRentals.confirmPayment'), 'rental-confirm', { id: r.id }, 'sm')}${btn(t('b.screenRentals.cancel'), 'rental-cancel', { id: r.id }, 'sm danger')}</div>` : r.status === 'confirmed' ? btn(t('b.screenRentals.cancel'), 'rental-cancel', { id: r.id }, 'sm danger') : r.status === 'pending_approval' ? link(t('b.screenRentals.decision'), '/backend/facilities/requests', 'btn sm primary') : '' },
        ], rows, empty: [t('b.screenRentals.emptyTitle'), t('b.screenRentals.emptyText')] })}`
  }

  function screenRequests(): string {
    const rows = db.rentals.filter((r) => r.status === 'pending_approval')
    return `${pageHead(t('b.screenRequests.title'), t('b.screenRequests.subtitle'))}
      ${rows.length ? rows.map((r) => { const conf = conflicts(r.place, r.date, toMin(r.start), toMin(r.end), { ignore: r.id }); return `<div class="card"><div class="row between"><div><div class="item-title">${esc(r.renter)} — ${esc(placeName(db, r.place))}</div><div class="small muted">${esc(dLong(r.date))}, ${r.start}–${r.end} · ${r.units} × 90 min · ${esc((db.rates.find((x) => x.category === r.category) || { label: r.category }).label)}</div></div>${badge(t('b.screenRequests.expires', { at: r.holdUntil }), 'warning')}</div>
        <div class="grid3" style="margin-top:10px"><div><div class="sub">${t('common.contact')}</div>${esc(r.contact)}<br>${esc(r.email)}<br>${esc(r.phone)}</div><div><div class="sub">${t('b.screenRequests.purpose')}</div>${esc(r.purpose || '—')}</div><div><div class="sub">${t('b.screenRequests.estimatedAmount')}</div><b>${zl(r.amount)}</b><div class="small muted">${t('b.screenCharge.toOwnerAccount', { owner: esc(ownerName()) })}</div></div></div>
        <div style="margin-top:10px">${conf.length ? `<div class="alert error"><strong>${t('b.screenRequests.conflict')}</strong>${conf.map((c) => esc(c.label)).join('; ')}</div>` : badge(t('b.screenRequests.noConflict'), 'success')} ${r.banMatch ? badge(t('b.screenRequests.banMatch'), 'error') : badge(t('b.screenRequests.noBan'), 'success')} ${badge(t('b.screenRequests.rulesAccepted'), 'neutral')} ${badge(t('b.screenRequests.emailConfirmed'), 'neutral')}</div>
        <div class="row" style="margin-top:12px">${btn(t('common.approve'), 'approve', { id: r.id }, 'primary')}${btn(t('common.reject'), 'reject', { id: r.id }, 'danger')}</div></div>` }).join('') : empty(t('b.screenRequests.emptyTitle'), t('b.screenRequests.emptyText'), '', 'circle-check')}`
  }

  function screenZones(q: URLSearchParams): string {
    const tab = q.get('tab') || 'zones'
    const tabs = `<div class="tabs">${[['zones', t('b.screenZones.tabZones')], ['closures', t('b.screenZones.tabClosures')], ['rates', t('b.screenZones.tabRates')]].map(([k, l]) => `<a class="${tab === k ? 'active' : ''}" href="#/backend/facilities/zones?tab=${k}">${l}</a>`).join('')}</div>`
    let body = ''
    if (tab === 'zones') body = table({ cols: [{ label: t('common.place'), cell: (r: any) => esc(placeName(db, r.place)) }, { label: t('b.screenZones.colDays'), cell: (r: any) => r.days.map((d: number) => wdShort(d % 7)).join(', ') }, { label: t('b.screenZones.colHours'), cell: (r: any) => `${r.from}–${r.to}` }, { label: t('b.screenZones.colZone'), cell: (r: any) => `<i class="z-${r.zone}" style="display:inline-block;width:10px;height:10px;border-radius:2px"></i> ${zoneLabel(r.zone)}` }, { label: t('b.screenZones.colPriority'), num: true, cell: (r: any) => String(r.priority) }, { label: t('b.screenZones.colValid'), cell: (r: any) => r.validFrom || r.validTo ? `${esc(r.validFrom || '…')} – ${esc(r.validTo || t('b.screenZones.openEnded'))}` : t('b.screenZones.permanent') }, { label: t('b.screenZones.colSource'), cell: (r: any) => esc(t(`zone.source.${r.source || 'rules'}`)) }], rows: Object.entries(db.zones).flatMap(([place, rules]) => rules.map((r) => ({ ...r, place }))), toolbar: `${btn(t('b.screenZones.setAvailability'), 'availability', { place: 'pl-boisko' }, 'primary sm')}${btn(t('b.screenZones.addRule'), 'todo', { what: t('b.screenZones.addRuleWhat') }, 'sm')}` })
    if (tab === 'closures') body = table({ cols: [{ label: t('common.place'), cell: (c: Closure) => esc(placeName(db, c.place)) }, { label: t('common.when'), cell: (c: Closure) => `${dShort(c.date)} ${c.start}–${c.end}` }, { label: t('common.reason'), cell: (c: Closure) => esc(t(`closure.reason.${c.reason}`)) }, { label: t('common.description'), cell: (c: Closure) => esc(c.note) }], rows: db.closures, toolbar: btn(t('b.screenZones.addClosure'), 'new-closure', {}, 'primary sm') })
    if (tab === 'rates') body = table({ cols: [{ label: t('common.place'), cell: (r: any) => esc(placeName(db, r.place)) }, { label: t('b.screenZones.colRenterCategory'), cell: (r: any) => esc(r.label) }, { label: t('b.screenZones.colPrice'), num: true, cell: (r: any) => zl(r.price) }], rows: db.rates })
    return `${pageHead(t('b.screenZones.title'), t('b.screenZones.subtitle'))}${tabs}${body}`
  }

  function screenLogs(q: URLSearchParams): string {
    const tab = q.get('tab') || 'logs'
    const tabs = `<div class="tabs">${[['logs', t('b.screenLogs.tabLog')], ['incidents', t('b.screenLogs.tabIncidents')], ['bans', t('b.screenLogs.tabBans')], ['maint', t('b.screenLogs.tabMaintenance')]].map(([k, l]) => `<a class="${tab === k ? 'active' : ''}" href="#/backend/facilities/logs?tab=${k}">${l}</a>`).join('')}</div>`
    let body = ''
    if (tab === 'logs') body = table({ cols: [{ label: t('common.day'), cell: (l: any) => dShort(l.date) }, { label: t('b.screenLogs.colAttendant'), cell: (l: any) => esc(pName(l.operator)) }, { label: t('b.screenLogs.colOpened'), cell: (l: any) => esc(l.opened || '—') }, { label: t('b.screenLogs.colClosed'), cell: (l: any) => esc(l.closed || '—') }, { label: t('b.screenLogs.colBefore'), cell: (l: any) => esc(l.before || '') }, { label: t('b.screenLogs.colAfter'), cell: (l: any) => esc(l.after || '') }], rows: db.logs })
    if (tab === 'incidents') body = table({ cols: [{ label: t('common.date'), cell: (i: any) => dShort(i.date) }, { label: t('common.place'), cell: (i: any) => esc(placeName(db, i.place)) }, { label: t('common.kind'), cell: (i: any) => esc(t(`incident.kind.${i.kind}`)) }, { label: t('common.description'), cell: (i: any) => esc(i.description) }, { label: t('b.screenLogs.colAction'), cell: (i: any) => esc(t(`incident.action.${i.action}`)) }, { label: t('b.screenLogs.colReportedBy'), cell: (i: any) => esc(pName(i.by)) }], rows: db.incidents, toolbar: `<span class="small muted">${t('b.screenLogs.incidentsNoDelete')}</span>` })
    if (tab === 'bans') body = table({ cols: [{ label: t('b.screenLogs.colSubject'), cell: (b: any) => `<b>${esc(b.subject)}</b>` }, { label: t('common.from'), cell: (b: any) => esc(b.from) }, { label: t('common.to'), cell: (b: any) => esc(b.to || t('b.screenLogs.permanent')) }, { label: t('common.reason'), cell: (b: any) => esc(b.reason) }, { label: t('b.screenLogs.colIssuedBy'), cell: (b: any) => esc(pName(b.by)) }], rows: db.bans, toolbar: btn(t('b.screenLogs.issueBan'), 'todo', { what: t('b.screenLogs.issueBanWhat') }, 'primary sm') })
    if (tab === 'maint') body = table({ cols: [{ label: t('common.place'), cell: (m: any) => esc(placeName(db, m.place)) }, { label: t('common.kind'), cell: (m: any) => esc(m.kind) }, { label: t('b.screenLogs.colResponsible'), cell: (m: any) => esc(t(`maint.responsible.${m.responsible}`)) }, { label: t('common.due'), cell: (m: any) => dShort(m.due) }, { label: t('common.status'), cell: (m: any) => m.done ? badge(t('b.screenLogs.done'), 'success') : badge(t('b.screenLogs.todo'), 'warning') }], rows: db.maintenance })
    return `${pageHead(t('b.screenLogs.title'), t('b.screenLogs.subtitle'))}${tabs}${body}`
  }

  function ownerReport(pid: string, month: string): { zones: Record<string, number>; clubHours: number; rentals: Rental[]; paid: number; incidents: number; maintenance: number } {
    const zones: Record<string, number> = { public_free: 0, club_training: 0, reservable_paid: 0 }
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

  function screenOwnerReport(q: URLSearchParams): string {
    const pid = q.get('place') || 'pl-boisko'
    const month = q.get('month') || '2026-11'
    const r = ownerReport(pid, month)
    return `${pageHead(t('b.screenOwnerReport.title'), t('b.screenOwnerReport.subtitle', { owner: esc(ownerName()) }), `${sel('place', [['pl-boisko', placeName(db, 'pl-boisko')], ['pl-multi', placeName(db, 'pl-multi')]], pid, `data-change="report-place" aria-label="${esc(t('b.screenOwnerReport.facility'))}"`)}${btn(t('b.screenOwnerReport.exportCsv'), 'report-csv', { place: pid, month }, 'primary')}`)}
      <div class="grid3"><div class="card"><div class="sub">${t('b.screenOwnerReport.publicHours')}</div><div class="kpi">${Math.round(r.zones.public_free)} h</div></div>
      <div class="card"><div class="sub">${t('b.screenOwnerReport.clubTrainingHours')}</div><div class="kpi">${Math.round(r.zones.club_training)} h</div><div class="small muted">${t('b.screenOwnerReport.actualClubTime', { hours: r.clubHours.toLocaleString(numLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</div></div>
      <div class="card"><div class="sub">${t('b.screenOwnerReport.reservableHours')}</div><div class="kpi">${Math.round(r.zones.reservable_paid)} h</div></div>
      <div class="card"><div class="sub">${t('b.screenOwnerReport.rentals')}</div><div class="kpi">${r.rentals.length}</div><div class="small muted">${t('b.screenOwnerReport.rentalsValue', { amount: zl(r.rentals.reduce((s, x) => s + x.amount, 0)) })}</div></div>
      <div class="card"><div class="sub">${t('b.screenOwnerReport.paidToOwner')}</div><div class="kpi">${zl(r.paid)}</div></div>
      <div class="card"><div class="sub">${t('b.screenOwnerReport.incidentsMaintenance')}</div><div class="kpi">${r.incidents} / ${r.maintenance}</div></div></div>
      <div class="section-title">${t('b.screenOwnerReport.rentalsInPeriod')}</div>${table({ cols: [{ label: t('b.screenRentals.colSession'), cell: (x: Rental) => `${dShort(x.date)} ${x.start}–${x.end}` }, { label: t('b.screenRentals.colRenter'), cell: (x: Rental) => esc(x.renter) }, { label: t('common.amount'), num: true, cell: (x: Rental) => zl(x.amount) }, { label: t('common.status'), cell: (x: Rental) => statusBadge(x.status) }], rows: r.rentals, empty: [t('b.screenOwnerReport.emptyTitle'), ''] })}`
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public pages (P)
  // ═══════════════════════════════════════════════════════════════════
  const pub = (): Record<string, boolean> => db.settings.publication
  // Facility owner (municipality) name from the institutions register — club data, passed as a param into UI text.
  const facilityOwnerName = (): string => (db.institutions.find((i) => i.type === 'municipality') || { name: '' }).name

  function eventsList(sectionId?: string): string {
    const evs = db.activities.filter((a) => a.oneOff && (!sectionId || group(a.group).section === sectionId) && a.from >= addDays(TODAY, -60)).sort((a, b) => a.from.localeCompare(b.from))
    if (!evs.length) return ''
    return `<div class="section-title">${esc(t('p.eventsList.title'))}</div><div class="stack">${evs.map((a) => { const past = a.to < TODAY; const g = group(a.group); return `<div class="card"><div class="row between"><div class="row" style="gap:10px">${logoBox(sectionLogo(section(g.section)), t('p.eventsList.sectionLogo', { name: section(g.section).name }), 36)}<div><div class="item-title">${esc(a.name)}</div><div class="small muted">${esc(t('p.eventsList.start', { date: dLong(a.from), time: a.start }))} · ${esc(placeName(db, a.place))} · ${esc(section(g.section).name)}</div></div></div>${past ? badge(t('p.eventsList.past'), 'neutral') : badge(typeLabel(a.type, g.kind), 'info')}</div>${a.info?.length ? `<ul class="small" style="margin:8px 0 0;padding-left:18px">${a.info.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>` }).join('')}</div>`
  }

  function screenClubPage(): string {
    if (!pub().enabled) return empty(t('p.screenClubPage.notPublished'), t('p.screenClubPage.callClub'), '', 'ban')
    const secs = db.sections.filter((s) => s.isPublic && s.active)
    return `<div class="hero"><div class="row" style="gap:14px;align-items:center;margin-bottom:6px">${logoBox(db.settings.logo, t('p.screenClubPage.clubLogo'), 56)}<h1 style="margin:0">${esc(db.settings.name)}</h1></div><p>${esc(db.settings.description)}</p></div>
      <div class="section-title">${esc(t('p.screenClubPage.sections'))}</div>
      ${secs.length ? `<div class="grid3">${secs.map((s) => `<a class="card" href="#/p/gwiazda/sections/${s.slug}" style="text-decoration:none;display:block"><div class="row" style="gap:10px;margin-bottom:6px">${logoBox(sectionLogo(s), t('p.eventsList.sectionLogo', { name: s.name }), 40)}<h3 style="margin:0">${esc(s.name)}</h3></div><p class="muted small" style="margin:0 0 8px">${esc(s.short)}</p><span class="small">${esc(t('p.screenClubPage.groupsSeeClasses', { n: db.groups.filter((g) => g.section === s.id && g.isPublic).length }))}</span></a>`).join('')}</div>` : empty(t('p.screenClubPage.noSections'), '')}
      ${pub().description_schedule ? eventsList() : ''}
      ${pub().places_calendar ? `<div class="section-title">${esc(t('p.screenClubPage.facilities'))}</div><div class="card"><div class="row between"><div><b>${esc(t('p.screenClubPage.placesTitle', { orlik: placeName(db, 'pl-orlik') }))}</b><div class="small muted">${esc(t(pub().online_requests ? 'p.screenClubPage.checkFreeOnline' : 'p.screenClubPage.checkFree'))}</div></div>${link(t('p.screenClubPage.placeCalendars'), '/p/gwiazda/places', 'btn primary')}</div></div>` : ''}`
  }

  function screenSectionPage(p: Record<string, string>): string {
    const s = db.sections.find((x) => x.slug === p.slug)
    if (!pub().enabled || !s || !s.isPublic) return empty(t('p.screenSectionPage.notFound'), t('p.screenSectionPage.notFoundText'), link(t('p.screenSectionPage.clubPage'), '/p/gwiazda'), 'ban')
    const P = pub()
    const groups = db.groups.filter((g) => g.section === s.id && g.isPublic)
    const card = (g: Group): string => {
      const acts = db.activities.filter((a) => a.group === g.id && !a.oneOff)
      const next = db.occurrences.filter((o) => o.group === g.id && o.date >= TODAY).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 3)
      const fee = db.fees.find((f) => f.group === g.id)
      const coaches = g.coaches.map((c) => personById(db, c)).map((c) => c.publishConsent ? `${c.first} ${c.last[0]}.` : null)
      // Weekly rule without the "every week until …" part (recurring activities only).
      const weekly = (a: Activity): string => `${a.weekdays.map((d) => wdShort(d % 7)).join(', ')} ${a.start}–${a.end}`
      return `<div class="card"><div class="row between"><h3 style="margin:0">${esc(g.name)}</h3>${badge(g.ageTo && g.ageTo < 99 ? t('p.screenSectionPage.ageRange', { from: g.ageFrom, to: g.ageTo }) : t('p.screenSectionPage.ageFrom', { from: g.ageFrom }), 'info')}</div>
        ${P.description_schedule ? `<p class="small" style="margin:6px 0">${esc(g.publicDescription)}</p>${acts.map((a) => `<div class="small"><b>${esc(weekly(a))}</b> · ${esc(placeName(db, a.place))}</div>`).join('')}
          <div class="small muted" style="margin-top:4px">${esc(t('p.screenSectionPage.upcoming'))} ${next.map((o) => o.status === 'cancelled' ? `<s>${dShort(o.date)}</s> ${esc(t('p.screenSectionPage.cancelled'))}` : dShort(o.date)).join(', ') || '—'}</div>` : ''}
        ${P.conditions && g.conditions ? `<div class="small" style="margin-top:6px"><b>${esc(t('p.screenSectionPage.requirements'))}</b> ${esc(g.conditions)}${g.category ? ` · ${esc(t('p.screenSectionPage.category', { category: g.category }))}` : ''}${g.level ? ` · ${esc(t('p.screenSectionPage.level', { level: g.level }))}` : ''}</div>` : ''}
        ${P.prices && fee ? `<div class="small" style="margin-top:6px">${t('p.screenSectionPage.fee', { amount: esc(zl(fee.amount)) })}</div>` : ''}
        ${P.coaches ? `<div class="small" style="margin-top:6px"><b>${esc(t('p.screenSectionPage.ledBy'))}</b> ${coaches.map((c) => esc(c || t(g.kind === 'team' ? 'p.screenSectionPage.sectionCoach' : 'p.screenSectionPage.sectionInstructor'))).join(', ')}</div>` : ''}</div>`
    }
    return `<div class="crumbs small"><a href="#/p/gwiazda">${esc(db.settings.short)}</a> › ${esc(t('p.screenClubPage.sections'))} › ${esc(s.name)}</div>
      <div class="hero" style="margin-top:8px"><div class="row" style="gap:14px;align-items:center;margin-bottom:6px">${logoBox(sectionLogo(s), t('p.eventsList.sectionLogo', { name: s.name }), 56)}<h1 style="margin:0">${esc(s.name)}</h1></div>${P.description_schedule ? `<p>${esc(s.description)}</p>` : ''}</div>
      ${P.conditions && s.conditions ? `<div class="alert info"><strong>${esc(t('p.screenSectionPage.participation'))}</strong>${esc(s.conditions)}</div>` : ''}
      ${P.description_schedule ? eventsList(s.id) : ''}
      <div class="section-title">${esc(t('p.screenSectionPage.classes'))}</div>${groups.length ? `<div class="grid2">${groups.map(card).join('')}</div>` : empty(t('p.screenSectionPage.noClasses'), t('p.screenSectionPage.noClassesText'))}
      ${P.materials && s.materials.length ? `<div class="section-title">${esc(t('p.screenSectionPage.materials'))}</div><ul class="list">${s.materials.map((m) => `<li>${icon('file-text')} <a href="#" data-action="todo" data-what="${esc(t('p.screenSectionPage.todoDownload'))}">${esc(m)}</a></li>`).join('')}</ul>` : ''}
      ${P.contact ? `<div class="section-title">${esc(t('common.contact'))}</div><div class="card"><b>${esc(s.contactName)}</b><div class="small">${esc(s.contactEmail)} · ${esc(s.contactPhone)}</div></div>` : ''}`
  }

  function screenPublicPlaces(): string {
    if (!pub().enabled || !pub().places_calendar) return empty(t('p.screenPublicPlaces.noCalendars'), t('p.screenPublicPlaces.noCalendarsText'), '', 'ban')
    const list = db.places.filter((p) => p.publicSchedule)
    return `<div class="hero"><h1>${esc(t('p.screenPublicPlaces.title'))}</h1><p>${esc(t(pub().online_requests ? 'p.screenPublicPlaces.introOnline' : 'p.screenPublicPlaces.intro'))}</p></div>
      <div class="grid3">${list.map((p) => `<a class="card" href="#/p/gwiazda/places/${p.slug}" style="text-decoration:none;display:block"><h3>${esc(p.name)}</h3><div class="small muted">${esc(p.address)}${p.surface ? ` · ${esc(p.surface)}` : ''}</div><div style="margin-top:8px">${p.acceptsRequests && pub().online_requests ? badge(t('p.screenPublicPlaces.onlineRequests'), 'success') : badge(t('p.screenPublicPlaces.phoneBooking'), 'neutral')}</div></a>`).join('')}</div>`
  }

  function publicSegments(pid: string, date: string): { from: number; to: number; label: string; canRequest: boolean; kind: string }[] {
    const zones = zonesFor(pid, date)
    const occ = occupancy(pid, date)
    const out: { from: number; to: number; label: string; canRequest: boolean; kind: string }[] = []
    for (const z of zones) {
      const cuts = [z.from, z.to, ...occ.flatMap((o) => [o.from, o.to]).filter((m) => m > z.from && m < z.to)].sort((a, b) => a - b)
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1]; if (a === b) continue
        const hit = occ.find((o) => overlap(a, b, o.from, o.to))
        if (hit) out.push({ from: a, to: b, label: hit.publicLabel, canRequest: false, kind: hit.kind })
        else out.push({ from: a, to: b, label: zoneLabel(z.zone), canRequest: z.zone === 'reservable_paid', kind: z.zone })
      }
    }
    // merge adjacent segments with the same label
    return out.reduce((acc, s) => { const last = acc[acc.length - 1]; if (last && last.label === s.label && last.to === s.from) last.to = s.to; else acc.push({ ...s }); return acc }, [] as typeof out)
  }

  function screenPublicPlace(p: Record<string, string>, q: URLSearchParams): string {
    const place = db.places.find((x) => x.slug === p.slug && x.publicSchedule)
    if (!pub().enabled || !pub().places_calendar || !place) return empty(t('p.screenSectionPage.notFound'), t('p.screenPublicPlace.notFoundText'), link(t('p.screenPublicPlaces.title'), '/p/gwiazda/places'), 'ban')
    const start = q.get('from') || TODAY
    const days = Array.from({ length: 10 }, (_, i) => addDays(start, i))
    const canReq = pub().online_requests && place.acceptsRequests
    return `<div class="crumbs small"><a href="#/p/gwiazda">${esc(db.settings.short)}</a> › <a href="#/p/gwiazda/places">${esc(t('p.screenClubPage.facilities'))}</a> › ${esc(place.name)}</div>
      <div class="hero" style="margin-top:8px"><h1>${esc(place.name)}</h1><p>${esc(place.address)} · ${esc(t(canReq ? 'p.screenPublicPlace.bookingsOnline' : 'p.screenPublicPlace.bookings', { phone: db.settings.phone }))}</p></div>
      ${canReq ? `<div class="alert info">${t('p.screenPublicPlace.onlineNotice', { owner: esc(facilityOwnerName()) })}</div>` : ''}
      <div class="row between"><div class="seg"><button type="button" data-action="nav" data-href="/p/gwiazda/places/${place.slug}?from=${addDays(start, -10) < TODAY ? TODAY : addDays(start, -10)}" ${start <= TODAY ? 'disabled' : ''}>${esc(t('p.screenPublicPlace.earlier'))}</button><button type="button" data-action="nav" data-href="/p/gwiazda/places/${place.slug}?from=${addDays(start, 10)}">${esc(t('p.screenPublicPlace.later'))}</button></div><span class="small muted">${dShort(days[0])} – ${dShort(days[9])}</span></div>
      <div class="legend"><span><i class="z-public_free"></i>${esc(t('p.screenPublicPlace.legendPublic'))}</span><span><i class="z-club_training"></i>${esc(t('p.screenPublicPlace.legendClub'))}</span><span><i class="z-reservable_paid"></i>${esc(t('p.screenPublicPlace.legendBookable'))}</span><span><i class="blk-rent"></i>${esc(t('p.screenPublicPlace.legendBooked'))}</span><span><i class="blk-pend"></i>${esc(t('p.screenPublicPlace.legendPending'))}</span><span><i class="z-closed"></i>${esc(t('p.screenPublicPlace.legendClosed'))}</span></div>
      ${days.map((d) => { const segs = publicSegments(place.id, d); return `<div class="day-head">${dShort(d)}${d === TODAY ? ` (${esc(t('common.todayLower'))})` : ''}</div>${segs.length ? `<ul class="slotlist">${segs.map((s) => { const cls = s.kind === 'rent' ? 'blk-rent' : s.kind === 'pend' ? 'blk-pend' : s.kind === 'closed' ? 'z-closed' : s.kind === 'occ' || s.kind === 'int' ? 'z-club_training' : `z-${s.kind}`; const past = d === TODAY && s.from < toMin(NOW); return `<li class="${cls}"><b>${fromMin(s.from)}–${fromMin(s.to)}</b><span>${esc(s.label)}</span>${s.canRequest && canReq && !past && s.to - s.from >= 90 ? btn(t('p.screenPublicPlace.requestBooking'), 'public-request', { place: place.id, date: d, from: String(s.from), to: String(s.to) }, 'sm primary') : '<span></span>'}</li>` }).join('')}</ul>` : `<p class="small muted">${esc(t('p.screenPublicPlace.closed'))}</p>`}` }).join('')}
      <div class="section-title">${esc(t('p.screenPublicPlace.rates'))}</div><ul class="list small">${db.rates.filter((r) => r.place === place.id).map((r) => `<li class="row between"><span>${esc(r.label)}</span><b>${zl(r.price)}</b></li>`).join('') || `<li class="muted">${esc(t('p.screenPublicPlace.noRates'))}</li>`}</ul>`
  }

  function screenVerify(p: Record<string, string>): string {
    const r = db.rentals.find((x) => x.token === p.token)
    if (!r || p.token === 'expired') return `<div class="alert error" role="alert"><strong>${esc(t('p.screenVerify.expired'))}</strong>${esc(t('p.screenVerify.expiredText'))}</div>${link(t('p.screenPublicPlaces.title'), '/p/gwiazda/places', 'btn primary')}`
    if (r.status === 'superseded') return `<div class="alert error"><strong>${esc(t('p.screenVerify.taken'))}</strong>${esc(t('p.screenVerify.takenText'))}</div>${link(t('p.screenVerify.backToCalendar'), `/p/gwiazda/places/${(db.places.find((x) => x.id === r.place) as Place).slug}`, 'btn primary')}`
    return `<div class="alert success" role="status"><strong>${esc(t('p.screenVerify.confirmed'))}</strong>${esc(t('p.screenVerify.confirmedText', { until: r.holdUntil }))}</div>
      <div class="card"><div class="item-title">${esc(placeName(db, r.place))}</div><div class="small muted">${esc(dLong(r.date))}, ${r.start}–${r.end} · ${r.units} × 90 min</div><div class="small" style="margin-top:6px">${esc(r.renter)} · ${esc(r.contact)} · ${esc(r.email)}</div><div class="small" style="margin-top:6px">${t('p.screenVerify.estimate', { amount: esc(zl(r.amount)), owner: esc(facilityOwnerName()) })}</div></div>`
  }

  function screenStripe(q: URLSearchParams): string {
    const ids = (q.get('ids') || '').split(',')
    const list = db.charges.filter((c) => ids.includes(c.id))
    const sum = list.reduce((s, c) => s + remaining(c), 0)
    return `<div class="stripe"><div class="small" style="color:#697386">${esc(t('p.screenStripe.header'))}</div><h1>${esc(db.settings.name)}</h1><div class="amt">${zl(sum + onlineFeeFor(sum))}</div>
      <ul style="padding-left:18px;color:#425466">${list.map((c) => `<li>${esc(txt(c.description))}</li>`).join('')}${onlineFeeFor(sum) ? `<li>${esc(t('m.screenPayments.sumFee'))}: ${zl(onlineFeeFor(sum))}</li>` : ''}</ul>
      <div class="stack">${btn(t('p.screenStripe.payTestCard'), 'stripe-pay', { ids: ids.join(','), mode: 'paid' }, 'primary block')}${btn(t('p.screenStripe.payDelayed'), 'stripe-pay', { ids: ids.join(','), mode: 'pending' }, 'block')}${btn(t('p.screenStripe.cancel'), 'stripe-pay', { ids: ids.join(','), mode: 'cancelled' }, 'block')}</div></div>`
  }

  // ═══════════════════════════════════════════════════════════════════
  // Routes
  // ═══════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  // Order campaigns — kit (REQ-032, REQ-033)
  // ═══════════════════════════════════════════════════════════════════
  // Status → [catalog key, badge kind]; translated at render time (kitBadge, campaign stepper).
  const KIT_STATUS: Record<KitCampaign['status'], [string, 'neutral' | 'success' | 'warning' | 'error' | 'info']> = { draft: ['kit.kitStatus.draft', 'neutral'], open: ['kit.kitStatus.open', 'info'], closed: ['kit.kitStatus.closed', 'warning'], ordered: ['kit.kitStatus.ordered', 'info'], delivered: ['kit.kitStatus.delivered', 'success'], completed: ['kit.kitStatus.completed', 'neutral'] }
  const kitBadge = (s: KitCampaign['status']): string => badge(t(KIT_STATUS[s][0]), KIT_STATUS[s][1])
  const kitCampaign = (id: string): KitCampaign | undefined => db.kitCampaigns.find((c) => c.id === id)
  const kitOrders = (c: KitCampaign): KitOrder[] => db.kitOrders.filter((o) => o.campaign === c.id && o.status === 'submitted')
  const kitOrderOf = (c: KitCampaign, child: string): KitOrder | undefined => kitOrders(c).find((o) => o.child === child)
  const kitTotal = (o: KitOrder): number => o.lines.reduce((a, l) => a + l.price, 0)
  const chargeById = (id: string): Charge => db.charges.find((c) => c.id === id) as Charge
  const kitGroupOf = (c: KitCampaign, child: string): string => c.groups.find((g) => group(g).members.includes(child)) || ''
  const kitKids = (c: KitCampaign, guardian: string): string[] => wardsOf(guardian).filter((w) => !!kitGroupOf(c, w))
  // Coach scope: coached groups + groups of the sections they coordinate.
  const kitScope = (pid: string): string[] => [...new Set([...coachedGroups(pid), ...db.groups.filter((g) => coordSections(pid).includes(g.section)).map((g) => g.id)])]
  const paidOf = (c: Charge): number => c.payments.reduce((a, p) => a + p.amount, 0)
  // "group" / "groups" for a count (plural from the catalog).
  const groupsWord = (n: number): string => t('kit.groupsWord.word', { n })
  // Cash taken by a coach (or another person) and not yet handed over to the treasurer.
  const custodyOf = (pid: string): { c: Charge; x: Pay }[] => db.charges.flatMap((c) => c.payments.filter((x) => x.method === 'cash' && x.by === pid && !x.settled).map((x) => ({ c, x })))
  const custodians = (): string[] => [...new Set(db.charges.flatMap((c) => c.payments.filter((x) => x.method === 'cash' && x.by && !x.settled).map((x) => x.by as string)))]
  const kitPayBadge = (ch: Charge): string => ch.status === 'paid' ? badge(t('kit.kitPayBadge.paid'), 'success') : ch.status === 'cancelled' ? badge(t('kit.kitPayBadge.cancelled'), 'neutral') : badge(t('kit.kitPayBadge.toPay', { amount: zl(remaining(ch)) }), ch.due < TODAY ? 'error' : 'warning')

  function kitLineLabel(c: KitCampaign, l: KitLine): string {
    const p = c.products.find((x) => x.id === l.product)
    if (!p) return '—'
    if (p.kind === 'set') return `${p.name.split(':')[0]} (${Object.entries(l.sizes || {}).map(([id, s]) => `${(c.products.find((x) => x.id === id) || { name: '?' }).name.split(' ')[0].toLowerCase()} ${s}`).join(', ')})`
    return `${p.name}${l.size ? ` — ${l.size}` : ''}`
  }

  function kitStats(c: KitCampaign): { orders: number; kids: number; value: number; paid: number; handed: number } {
    const os = kitOrders(c)
    return { orders: os.length, kids: new Set(c.groups.flatMap((g) => group(g).members)).size, value: os.reduce((a, o) => a + chargeById(o.chargeId).amount, 0), paid: os.reduce((a, o) => a + paidOf(chargeById(o.chargeId)), 0), handed: os.filter((o) => o.handedAt).length }
  }

  // Supplier summary: pieces per product and size; items of sets are counted under their own products.
  function kitSupplier(c: KitCampaign): { product: KitProduct; size: string; qty: number; inSet: number }[] {
    const out: { product: KitProduct; size: string; qty: number; inSet: number }[] = []
    const add = (pid: string, size: string, inSet: boolean): void => {
      const product = c.products.find((x) => x.id === pid); if (!product) return
      let e = out.find((x) => x.product === product && x.size === size)
      if (!e) { e = { product, size, qty: 0, inSet: 0 }; out.push(e) }
      e.qty++; if (inSet) e.inSet++
    }
    for (const o of kitOrders(c)) for (const l of o.lines) {
      const p = c.products.find((x) => x.id === l.product)
      if (p?.kind === 'set') for (const [id, s] of Object.entries(l.sizes || {})) add(id, s, true)
      else add(l.product, l.size || t('kit.kitSupplier.noSize'), false)
    }
    const rank = (x: { product: KitProduct; size: string }): number => c.products.indexOf(x.product) * 100 + [...x.product.sizesChild, ...x.product.sizesAdult].indexOf(x.size)
    return out.sort((a, b) => rank(a) - rank(b))
  }

  function kitShareModal(id: string): void {
    const c = kitCampaign(id) as KitCampaign
    const setP = c.products.find((p) => p.kind === 'set')
    const text = `${c.name}\n${c.description}\n\n${t('kit.kitShareModal.ordersUntil', { date: dShort(c.closes) })}${setP ? t('kit.kitShareModal.setPrice', { price: zl(setP.priceChild) }) : ''}.\n${t('kit.kitShareModal.form', { url: `https://${db.settings.slug}.vereino.example/club/orders/${c.id}` })}\n${t('kit.kitShareModal.hint')}`
    try { navigator.clipboard.writeText(text).catch(() => undefined) } catch { /* clipboard unavailable */ }
    openModal({ title: t('kit.kitShareModal.title'), submitLabel: t('kit.kitShareModal.done'), body: `<div class="alert success"><strong>${esc(t('kit.kitShareModal.copied'))}</strong>${esc(t('kit.kitShareModal.copiedText'))}</div><textarea readonly rows="8" style="width:100%">${esc(text)}</textarea><p class="small"><a href="#" data-action="goto" data-persona="guest" data-href="/club/orders/${c.id}">${esc(t('kit.kitShareModal.preview'))}</a></p>`, onSubmit: () => undefined })
  }

  // ── Member interface ────────────────────────────────────────────────
  function kitTodayTiles(): string {
    const pid = me(), out: string[] = []
    if (can('payments.orders.place')) for (const c of db.kitCampaigns.filter((x) => x.status === 'open')) {
      const kids = kitKids(c, pid); if (!kids.length) continue
      out.push(`<section class="card" aria-labelledby="t-kit-${c.id}"><div class="tile-head"><h2 id="t-kit-${c.id}">${esc(t('kit.kitTodayTiles.order'))}</h2><a href="#/club/orders/${c.id}">${esc(t('kit.kitTodayTiles.open'))}</a></div><p class="small" style="margin:0 0 6px">${esc(c.name)} · ${t('kit.kitTodayTiles.ordersUntil', { date: esc(dShort(c.closes)) })}</p>
        <ul class="list small">${kids.map((k) => { const o = kitOrderOf(c, k); return `<li class="row between"><span>${esc(personById(db, k).first)}</span>${o ? badge(t('kit.kitTodayTiles.ordered', { amount: zl(kitTotal(o)) }), 'success') : badge(t('kit.kitTodayTiles.notOrdered'), 'warning')}</li>` }).join('')}</ul></section>`)
    }
    if (can('payments.groups.view') && coachCtx) {
      const mine = coachedGroups(pid)
      const cash = custodyOf(pid).reduce((a, e) => a + e.x.amount, 0)
      const rows = mine.flatMap((g) => group(g).members.map((m) => groupCharges(g, m)))
      const dueKids = rows.filter((chs) => chs.some(isOpen)).length
      const lateKids = rows.filter((chs) => chs.some((c) => isOpen(c) && c.due < TODAY)).length
      const toHand = db.kitCampaigns.filter((c) => c.status === 'delivered').flatMap((c) => kitOrders(c).filter((o) => mine.includes(kitGroupOf(c, o.child)) && !o.handedAt)).length
      if (dueKids || cash || toHand) out.push(`<section class="card" aria-labelledby="t-grp-pay"><div class="tile-head"><h2 id="t-grp-pay">${esc(t('kit.kitTodayTiles.groupPayments'))}</h2><a href="#/club/coach/payments">${esc(t('kit.kitTodayTiles.open'))}</a></div><p class="small" style="margin:0">${dueKids ? `${t('kit.kitTodayTiles.dueKids', { n: dueKids })}${lateKids ? t('kit.kitTodayTiles.lateKids', { n: lateKids }) : ''}` : esc(t('kit.kitTodayTiles.allPaid'))}${toHand ? t('kit.kitTodayTiles.toHand', { n: toHand }) : ''}</p>${cash ? `<p class="small" style="margin:6px 0 0">${t('kit.kitTodayTiles.cashWithYou', { amount: esc(zl(cash)) })}</p>` : ''}</section>`)
    }
    return out.join('')
  }

  function kitPayHint(): string {
    if (!can('payments.orders.place')) return ''
    const c = db.kitCampaigns.find((x) => x.status === 'open' && kitKids(x, me()).length)
    if (!c) return ''
    const todo = kitKids(c, me()).filter((k) => !kitOrderOf(c, k)).length
    return `<a class="card" href="#/club/orders/${c.id}" style="display:block;text-decoration:none;margin-bottom:12px"><div class="row between"><span class="item-title">${esc(c.name)}</span>${badge(t('kit.kitPayHint.until', { date: dShort(c.closes) }), 'info')}</div><div class="small muted">${esc(t(todo ? 'kit.kitPayHint.orderForChild' : 'kit.kitPayHint.seeOrders'))}</div></a>`
  }

  function screenKitList(): string {
    const pid = me()
    const camps = db.kitCampaigns.filter((c) => c.status !== 'draft' && kitKids(c, pid).length && (c.status === 'open' || kitKids(c, pid).some((k) => kitOrderOf(c, k))))
    if (!camps.length) return empty(t('kit.screenKitList.noOrders'), t('kit.screenKitList.noOrdersText'))
    return camps.map((c) => `<a class="card" href="#/club/orders/${c.id}" style="display:block;text-decoration:none"><div class="row between"><span class="item-title">${esc(c.name)}</span>${kitBadge(c.status)}</div>
      <div class="small muted">${esc(c.status === 'open' ? t('kit.screenKitList.ordersUntil', { date: dShort(c.closes) }) : c.status === 'delivered' ? t('kit.screenKitList.readyForPickup') : t('kit.screenKitList.closedOn', { date: dShort(c.closes) }))} · ${esc(t('kit.screenKitList.paymentDue', { date: dShort(c.payDue) }))}</div>
      <ul class="list small" style="margin-top:6px">${kitKids(c, pid).map((k) => { const o = kitOrderOf(c, k); return `<li class="row between"><span>${esc(personById(db, k).first)}</span><span>${o ? `${kitPayBadge(chargeById(o.chargeId))}${o.handedAt ? ' ' + badge(t('kit.screenKitList.pickedUp'), 'success') : ''}` : badge(t('kit.kitTodayTiles.notOrdered'), 'neutral')}</span></li>` }).join('')}</ul></a>`).join('')
  }

  function screenKitOrder(p: Record<string, string>, q: URLSearchParams): string {
    const c = kitCampaign(p.id)
    if (!c || c.status === 'draft') return empty(t('kit.screenKitOrder.notFound'), t('kit.screenKitOrder.notFoundText'))
    if (personaId === 'guest') return kitGuestView(c)
    return kitOrderPage(c, me(), q, '')
  }

  function kitGuestView(c: KitCampaign): string {
    const sent = ui.kitLinkSent
    return `<div class="card"><div class="row" style="gap:10px">${logoBox(sectionLogo(section(c.section)), t('kit.kitGuestView.sectionLogo'), 40)}<div><div class="item-title">${esc(c.name)}</div><div class="small muted">${esc(section(c.section).name)} · ${esc(t('kit.screenKitList.ordersUntil', { date: dShort(c.closes) }))}</div></div></div><p class="small" style="margin:8px 0 0">${esc(c.description)}</p></div>
      ${c.status !== 'open' ? `<div class="alert warning"><strong>${esc(t('kit.kitGuestView.closed'))}</strong>${esc(t('kit.kitGuestView.closedText'))}</div>` : ''}
      <div class="alert info"><strong>${esc(t('kit.kitGuestView.whoOrders'))}</strong>${esc(t('kit.kitGuestView.whoOrdersText'))}</div>
      ${link(t('kit.kitGuestView.signIn'), '/login', 'btn primary block')}
      ${sent ? `<div class="alert success" role="status" style="margin-top:12px"><strong>${esc(t('kit.kitGuestView.checkInbox'))}</strong>${esc(t('kit.kitGuestView.checkInboxText', { email: sent, date: dShort(c.closes) }))}</div>` : `<form class="form" data-form="kit-link" data-campaign="${c.id}" style="margin-top:12px" novalidate><div class="form-general"></div>${fld('email', t('kit.kitGuestView.yourEmail'), inp('email', 'email', '', 'autocomplete="email"'), { req: true })}<button class="btn block" type="submit">${esc(t('kit.kitGuestView.sendLink'))}</button></form>`}`
  }

  function screenKitToken(p: Record<string, string>, q: URLSearchParams): string {
    const tok = db.kitTokens[p.token]
    const c = tok ? kitCampaign(tok.campaign) : undefined
    if (!tok || !c || c.status === 'completed') return `<div class="alert error" role="alert"><strong>${t('kit.screenKitToken.expiredTitle')}</strong>${t('kit.screenKitToken.expiredText')}</div>${link(t('kit.screenKitToken.signIn'), '/login', 'btn primary block')}`
    delete ui.kitLinkSent
    return `<div class="alert info"><strong>${t('kit.screenKitToken.personalLink', { name: esc(pName(tok.guardian)) })}</strong>${t('kit.screenKitToken.personalLinkText')}</div>${kitOrderPage(c, tok.guardian, q, p.token)}`
  }

  function kitOrderPage(c: KitCampaign, guardian: string, q: URLSearchParams, token: string): string {
    const base = token ? `/club/o/${token}` : `/club/orders/${c.id}`
    const kids = kitKids(c, guardian)
    const head = `<div class="card"><div class="row between"><span class="item-title">${esc(c.name)}</span>${kitBadge(c.status)}</div><p class="small" style="margin:6px 0 0">${esc(c.description)}</p><p class="small muted" style="margin:6px 0 0">${t('kit.kitOrderPage.deadlines', { closes: dShort(c.closes), payDue: dShort(c.payDue) })}</p></div>`
    if (!kids.length) return head + empty(t('kit.kitOrderPage.noKidsTitle'), t('kit.kitOrderPage.noKidsText'))
    const child = kids.includes(q.get('child') || '') ? (q.get('child') as string) : kids[0]
    const chips = kids.length > 1 ? `<div class="chips" role="group" aria-label="${esc(t('kit.kitOrderPage.childAria'))}" style="margin-top:12px">${kids.map((k) => `<a class="chip ${k === child ? 'on' : ''}" href="#${base}?child=${k}" ${k === child ? 'aria-current="true"' : ''}>${esc(personById(db, k).first)}${kitOrderOf(c, k) ? ` ${icon('circle-check')}<span class="sr-only">${esc(t('kit.kitOrderPage.childOrdered'))}</span>` : ''}</a>`).join('')}</div>` : ''
    const o = kitOrderOf(c, child)
    const sub = `<div class="section-title">${esc(pName(child))} · ${esc(group(kitGroupOf(c, child)).name)}</div>`
    if (o && q.get('edit') !== '1') return head + chips + sub + kitOrderSummary(c, o, base, !token)
    if (c.status !== 'open') return head + chips + sub + `<div class="alert warning"><strong>${t('kit.kitOrderPage.closedTitle')}</strong>${o ? '' : t('kit.kitOrderPage.closedNoOrder')}</div>`
    return head + chips + sub + kitOrderForm(c, guardian, child, o, token)
  }

  function kitOrderSummary(c: KitCampaign, o: KitOrder, base: string, loggedIn: boolean): string {
    const ch = chargeById(o.chargeId)
    const rest = ['paid', 'cancelled'].includes(ch.status) ? 0 : remaining(ch)
    return `<div class="card"><div class="row between"><span class="item-title">${t('kit.kitOrderSummary.orderOf', { at: esc(o.at) })}</span>${kitPayBadge(ch)}</div>
      <ul class="list small">${o.lines.map((l) => `<li class="row between"><span>${esc(kitLineLabel(c, l))}</span><b>${zl(l.price)}</b></li>`).join('')}<li class="row between"><b>${t('common.total')}</b><b>${zl(kitTotal(o))}</b></li></ul>
      ${o.printName || o.printNumber ? `<p class="small" style="margin:6px 0 0">${t('kit.kitOrderSummary.print', { name: esc(o.printName || '—'), number: esc(o.printNumber || '—') })}</p>` : ''}
      ${o.notes ? `<p class="small muted" style="margin:6px 0 0">${t('kit.kitOrderSummary.notes', { notes: esc(o.notes) })}</p>` : ''}
      ${o.handedAt ? `<div class="alert success" style="margin:8px 0 0"><strong>${t('kit.kitOrderSummary.pickedUp')}</strong>${t('kit.kitOrderSummary.handedBy', { at: esc(o.handedAt), by: esc(pName(o.handedBy)) })}</div>` : c.status === 'delivered' ? `<div class="alert success" style="margin:8px 0 0"><strong>${t('kit.kitOrderSummary.readyTitle')}</strong>${t('kit.kitOrderSummary.readyText')}</div>` : ''}</div>
      ${rest > 0 ? `<div class="section-title">${t('kit.kitOrderSummary.paymentTitle', { amount: zl(rest), due: dShort(ch.due) })}</div><div class="stack">${loggedIn && can('payments.pay_online') ? link(t('kit.kitOrderSummary.payOnline', { amount: zl(rest) }), `/stripe?ids=${ch.id}`, 'btn primary block') : ''}<p class="small muted" style="margin:0">${t('kit.kitOrderSummary.transferHint', { account: 'PL 00 1020 0000 0000 0000 0000 0000', code: payerCode(o.by) })}</p></div>` : ''}
      ${c.status === 'open' ? `<div class="stack" style="margin-top:12px">${link(t('kit.kitOrderSummary.changeOrder'), `${base}?child=${o.child}&edit=1`, 'btn block')}${btn(t('kit.kitOrderSummary.cancelOrder'), 'kit-cancel-order', { order: o.id }, 'block danger')}<p class="small muted" style="margin:0">${t('kit.kitOrderSummary.changesUntil', { date: dShort(c.closes) })}</p></div>` : ''}`
  }

  function kitOrderForm(c: KitCampaign, guardian: string, child: string, o: KitOrder | undefined, token: string): string {
    const gp = personById(db, guardian)
    const setP = c.products.find((p) => p.kind === 'set')
    const setLine = setP ? o?.lines.find((l) => l.product === setP.id) : undefined
    const comps = setP?.components || []
    const val = (pid: string): string => {
      if (!o) return ''
      if (setLine?.sizes?.[pid]) return setLine.sizes[pid]
      const l = o.lines.find((x) => x.product === pid)
      const p = c.products.find((x) => x.id === pid) as KitProduct
      return l ? (l.size || 'yes') : (p.required ? 'none' : '')
    }
    const setSum = comps.reduce((a, id) => a + (c.products.find((x) => x.id === id) as KitProduct).priceChild, 0)
    const g = kitGroupOf(c, child)
    const taken = kitOrders(c).filter((x) => x !== o && kitGroupOf(c, x.child) === g && x.printNumber).map((x) => Number(x.printNumber)).sort((a, b) => a - b)
    const items = c.products.filter((p) => p.kind === 'item').map((p) => {
      const price = (s: string): number => p.sizesAdult.includes(s) ? (p.priceAdult ?? p.priceChild) : p.priceChild
      const sized = p.sizesChild.length + p.sizesAdult.length > 0
      const opts: [string, string][] = sized
        ? [['', p.required ? t('common.choose') : t('kit.kitOrderForm.notOrderingOpt')], ...(p.required ? [['none', t('kit.notOrdering')] as [string, string]] : []), ...[...p.sizesChild, ...p.sizesAdult].map((s) => [s, `${s} — ${zl(price(s))}`] as [string, string])]
        : [['', t('kit.kitOrderForm.notOrderingOpt')], ['yes', t('kit.kitOrderForm.ordering', { price: zl(p.priceChild) })]]
      return fld(`p-${p.id}`, p.name, sel(`p-${p.id}`, opts, val(p.id), 'data-change="kit-recalc"'), { req: p.required, hint: comps.includes(p.id) ? t('kit.kitOrderForm.inSetHint', { price: zl(p.priceChild) }) : '' })
    }).join('')
    const total = kitPrice(c, Object.fromEntries(c.products.filter((p) => p.kind === 'item').map((p) => [p.id, val(p.id)])), !!setLine).total
    return `<form class="form" data-form="kit-order" data-campaign="${c.id}" data-child="${child}" data-token="${esc(token)}" novalidate><div class="form-general"></div>
      ${setP ? `<div class="card">${chk('set', t('kit.kitOrderForm.setChoice', { name: esc(setP.name.split(':')[0]), price: zl(setP.priceChild), separate: zl(setSum), extra: setP.name.includes(':') ? ` — ${esc(setP.name.split(':')[1].trim())}` : '' }), !!setLine, 'data-change="kit-recalc"')}</div>` : ''}
      <div class="form-group"><h3>${t('kit.kitOrderForm.whatTitle')}</h3><div class="stack">${items}</div></div>
      ${c.printName || c.printNumber ? `<div class="form-group"><h3>${t('kit.kitOrderForm.printTitle')}</h3><div class="fields">${c.printName ? fld('printName', t('kit.kitOrderForm.printName'), inp('printName', 'text', o ? o.printName : personById(db, child).first.toUpperCase(), 'maxlength="12"'), { hint: t('kit.kitOrderForm.printNameHint') }) : ''}${c.printNumber ? fld('printNumber', t('kit.kitOrderForm.printNumber'), inp('printNumber', 'number', o?.printNumber || '', 'min="1" max="99"'), { hint: taken.length ? t('kit.kitOrderForm.takenNumbers', { list: taken.join(', ') }) : t('kit.kitOrderForm.uniqueNumbers') }) : ''}</div></div>` : ''}
      <div class="form-group"><h3>${t('kit.kitOrderForm.contactTitle')}</h3><div class="fields">${fld('email', t('kit.kitOrderForm.email'), inp('email', 'email', o?.email || gp.email || ''), { req: true })}${fld('phone', t('common.phone'), inp('phone', 'tel', o?.phone || gp.phone || ''), { req: true })}</div><div style="margin-top:10px">${fld('notes', c.notesLabel, area('notes', o?.notes || '', 'rows="2" maxlength="500"'))}</div></div>
      <div class="card row between"><b>${t('common.total')}</b><b id="kit-total">${zl(total)}</b></div>
      <button class="btn primary block" type="submit">${o ? t('common.saveChanges') : t('kit.kitOrderForm.placeOrder')}</button>
      <p class="small muted" style="margin:0">${t('kit.kitOrderForm.footer', { date: dShort(c.closes) })}</p></form>`
  }

  // My groups' payments (coach / coordinator): the group's membership fees and the children's orders — REQ-033.
  // The coach sees the amount and status, not the discount reason; membership fees only when the club allows it (coachFees).
  const CUR_PERIOD = TODAY.slice(0, 7)
  const orderOfCharge = (c: Charge): KitOrder | undefined => c.source === 'order' ? db.kitOrders.find((o) => o.id === c.sourceId) : undefined
  function groupCharges(gid: string, child: string): Charge[] {
    const out: Charge[] = []
    const fee = db.fees.find((f) => f.group === gid)
    if (fee && db.settings.coachFees !== 'none') out.push(...db.charges.filter((c) => c.source === 'fee' && c.sourceId === fee.id && c.person === child && (['open', 'partially_paid'].includes(c.status) || (c.period === CUR_PERIOD && c.status === 'paid'))))
    for (const k of db.kitCampaigns.filter((x) => x.status !== 'draft' && x.groups.includes(gid))) {
      const o = kitOrderOf(k, child); if (!o) continue
      const ch = chargeById(o.chargeId)
      if (k.status !== 'completed' || ch.status !== 'paid') out.push(ch)
    }
    return out.sort((a, b) => a.due.localeCompare(b.due))
  }
  const isOpen = (c: Charge): boolean => ['open', 'partially_paid'].includes(c.status)
  const coachMayCollect = (c: Charge): boolean => isOpen(c) && !c.payerMissing && (c.source === 'order' || db.settings.coachFees === 'collect')
  const chargeLabel = (c: Charge): string => { const o = orderOfCharge(c); return o ? t('charge.kitLabel', { campaign: (kitCampaign(o.campaign) as KitCampaign).name }) : t('charge.feeLabel', { period: c.period }) }

  function screenGroupPayments(q: URLSearchParams): string {
    const pid = me(), mine = coachedGroups(pid)
    const groups = kitScope(pid).filter((g) => group(g).members.length).sort((a, b) => Number(!mine.includes(a)) - Number(!mine.includes(b)))
    const cash = custodyOf(pid)
    const cashBox = cash.length ? `<div class="alert info"><strong>${t('m.screenGroupPayments.cashWithYou', { amount: zl(cash.reduce((a, it) => a + it.x.amount, 0)), count: t('m.screenGroupPayments.payments', { n: cash.length }) })}</strong>${t('m.screenGroupPayments.cashHint')}<ul class="list small" style="margin-top:6px">${cash.map((it) => `<li class="row between"><span>${esc(it.x.receipt || '')} · ${esc(txt(it.c.description))}</span><b>${zl(it.x.amount)}</b></li>`).join('')}</ul></div>` : ''
    if (!groups.length) return cashBox + empty(t('m.screenGroupPayments.noMembersTitle'), t('m.screenGroupPayments.noMembersText'))
    const gid = groups.includes(q.get('group') || '') ? (q.get('group') as string) : groups[0]
    const due = q.get('due') === '1'
    const restOf = (m: string, g: string): number => groupCharges(g, m).filter(isOpen).reduce((a, c) => a + remaining(c), 0)
    const chips = `<div class="chips" role="group" aria-label="${esc(t('common.group'))}">${groups.map((x) => { const n = group(x).members.filter((m) => restOf(m, x) > 0).length; return `<a class="chip ${x === gid ? 'on' : ''}" href="#/club/coach/payments?group=${x}${due ? '&due=1' : ''}">${esc(group(x).name)}${mine.includes(x) ? '' : ` ${t('m.screenGroupPayments.sectionSuffix')}`}${n ? ` · ${t('m.screenGroupPayments.toPayCount', { n })}` : ''}</a>` }).join('')}</div>`
    const filter = `<div class="seg" role="group" aria-label="${esc(t('m.screenGroupPayments.filterAria'))}" style="margin-top:8px"><button type="button" class="${due ? '' : 'on'}" data-action="nav" data-href="/club/coach/payments?group=${gid}">${t('m.screenGroupPayments.everyone')}</button><button type="button" class="${due ? 'on' : ''}" data-action="nav" data-href="/club/coach/payments?group=${gid}&due=1">${t('m.screenGroupPayments.toPay')}</button></div>`
    const members = group(gid).members
    const total = members.reduce((a, m) => a + restOf(m, gid), 0)
    const late = members.filter((m) => groupCharges(gid, m).some((c) => isOpen(c) && c.due < TODAY)).length
    const rows = members.filter((m) => !due || restOf(m, gid) > 0).map((m) => {
      const chs = groupCharges(gid, m)
      const rest = restOf(m, gid)
      const lateM = chs.some((c) => isOpen(c) && c.due < TODAY)
      const missing = chs.some((c) => c.payerMissing && isOpen(c))
      const orders = chs.map(orderOfCharge).filter(Boolean) as KitOrder[]
      return `<li><div class="row between"><span class="item-title">${esc(pName(m))}</span>${rest ? badge(t('m.screenGroupPayments.toPayAmount', { amount: zl(rest) }), lateM ? 'error' : 'warning') : chs.length ? badge(t('m.screenGroupPayments.paid'), 'success') : badge(t('m.screenGroupPayments.noCharges'), 'neutral')}</div>
        ${chs.length ? `<ul class="small" style="margin:4px 0 0;padding-left:18px">${chs.map((c) => `<li>${esc(chargeLabel(c))} — ${isOpen(c) ? `${zl(remaining(c))}${c.due < TODAY ? ` <b style="color:var(--destructive)">${t('m.screenGroupPayments.overdue')}</b>` : ` ${t('m.screenGroupPayments.dueBy', { date: dShort(c.due) })}`}` : t('m.screenGroupPayments.paid')}${orderOfCharge(c) ? `<span class="muted"> · ${(orderOfCharge(c) as KitOrder).lines.map((l) => esc(kitLineLabel(kitCampaign((orderOfCharge(c) as KitOrder).campaign) as KitCampaign, l))).join(', ')}</span>` : ''}</li>`).join('')}</ul>` : ''}
        ${missing ? `<div class="small" style="margin-top:4px">${badge(t('m.screenGroupPayments.noPayer'), 'warning')}</div>` : ''}
        <div class="row" style="margin-top:6px">${chs.some(coachMayCollect) && can('payments.groups.collect') ? btn(t('m.screenGroupPayments.acceptCash'), 'grp-cash', { child: m, group: gid }, 'sm primary') : ''}${lateM && !missing ? btn(t('m.screenGroupPayments.remind'), 'grp-remind', { child: m, group: gid }, 'sm') : ''}${orders.map((o) => { const k = kitCampaign(o.campaign) as KitCampaign; return o.handedAt ? badge(t('m.screenGroupPayments.kitHanded', { at: o.handedAt }), 'success') : k.status === 'delivered' ? btn(t('m.screenGroupPayments.handOverKit'), 'kit-hand', { order: o.id }, 'sm') : '' }).join('')}</div></li>`
    }).join('')
    const camps = db.kitCampaigns.filter((k) => k.status === 'open' && k.groups.includes(gid))
    const campBox = camps.map((k) => { const n = members.filter((m) => !kitOrderOf(k, m)).length; return `<div class="card"><div class="row between"><span class="item-title">${esc(k.name)}</span>${kitBadge(k.status)}</div><div class="small muted">${t('m.screenGroupPayments.campProgress', { date: dShort(k.closes), ordered: members.length - n, total: members.length })}</div><div class="row" style="margin-top:8px">${n ? btn(t('m.screenGroupPayments.remindGuardians', { n }), 'kit-remind', { c: k.id, group: gid }, 'sm') : ''}${btn(t('m.screenGroupPayments.shareText'), 'kit-share', { id: k.id }, 'sm')}</div></div>` }).join('')
    return `${cashBox}${chips}${filter}
      <div class="card" style="margin-top:12px"><div class="row between"><span class="item-title">${esc(group(gid).name)}</span><b>${zl(total)}</b></div><div class="small muted">${t('m.screenGroupPayments.groupToPay')}${late ? ` · ${t('m.screenGroupPayments.lateCount', { n: late })}` : ''} · ${db.settings.coachFees === 'none' ? t('m.screenGroupPayments.modeNone') : db.settings.coachFees === 'view' ? t('m.screenGroupPayments.modeView') : t('m.screenGroupPayments.modeCollect')}</div></div>
      ${rows ? `<ul class="list">${rows}</ul>` : empty(t('m.screenGroupPayments.allPaidTitle'), t('m.screenGroupPayments.allPaidText'), '', 'circle-check')}
      ${campBox ? `<div class="section-title">${t('m.screenGroupPayments.campaigns')}</div>${campBox}` : ''}`
  }

  // ── Panel ─────────────────────────────────────────────────────────────
  function screenKitCampaigns(): string {
    return `${pageHead(t('kit.screenKitCampaigns.title'), t('kit.screenKitCampaigns.subtitle'), link(t('kit.screenKitCampaigns.newForm'), '/backend/payments/orders/create', 'btn primary'))}
      ${table({ cols: [
        { label: t('kit.screenKitCampaigns.colCampaign'), cell: (c: KitCampaign) => `<a class="row-link" href="#/backend/payments/orders/${c.id}">${esc(c.name)}</a><div class="small muted">${esc(section(c.section).name)} · ${c.groups.length} ${groupsWord(c.groups.length)}</div>` },
        { label: t('kit.screenKitCampaigns.colCloses'), cell: (c: KitCampaign) => dShort(c.closes) },
        { label: t('common.status'), cell: (c: KitCampaign) => kitBadge(c.status) },
        { label: t('kit.screenKitCampaigns.colOrders'), num: true, cell: (c: KitCampaign) => { const s = kitStats(c); return `${s.orders} / ${s.kids}` } },
        { label: t('kit.screenKitCampaigns.colValue'), num: true, cell: (c: KitCampaign) => zl(kitStats(c).value) },
        { label: t('kit.screenKitCampaigns.colPaid'), num: true, cell: (c: KitCampaign) => zl(kitStats(c).paid) },
        { label: t('kit.screenKitCampaigns.colHanded'), num: true, cell: (c: KitCampaign) => String(kitStats(c).handed) },
      ], rows: db.kitCampaigns, empty: [t('kit.screenKitCampaigns.emptyTitle'), t('kit.screenKitCampaigns.emptyText')] })}`
  }

  function blankKit(): KitCampaign {
    return { id: '', name: '', description: '', section: 's-akad', groups: [], closes: addDays(TODAY, 10), payDue: addDays(TODAY, 24), status: 'draft', printName: false, printNumber: false, notesLabel: t('kit.blankKit.notesLabel'), products: [{ id: uid('kp'), name: '', kind: 'item', sizesChild: [], sizesAdult: [], priceChild: 0, required: true }], supplier: '', createdBy: me() }
  }

  function readKitDraft(form: HTMLFormElement): KitCampaign {
    const fd = new FormData(form)
    const base: KitCampaign = ui.kitDraft ? JSON.parse(ui.kitDraft) : blankKit()
    const list = (v: unknown): string[] => String(v || '').split(',').map((x) => x.trim()).filter(Boolean)
    const money = (v: unknown): number => Math.round(Number(String(v || '').replace(',', '.')) * 100) || 0
    const products: KitProduct[] = []
    for (let i = 0; i < Number(fd.get('pcount')); i++) {
      const kind = String(fd.get(`pk-${i}`)) === 'set' ? 'set' : 'item'
      const adult = String(fd.get(`pp-${i}`) || '').trim()
      products.push({ id: String(fd.get(`pid-${i}`)), name: String(fd.get(`pn-${i}`) || '').trim(), kind, components: kind === 'set' ? fd.getAll(`pcomp-${i}`).map(String) : undefined, sizesChild: kind === 'set' ? [] : list(fd.get(`ps-${i}`)), sizesAdult: kind === 'set' ? [] : list(fd.get(`pa-${i}`)), priceChild: money(fd.get(`pc-${i}`)), priceAdult: kind === 'item' && adult ? money(adult) : undefined, required: kind === 'item' && !!fd.get(`pr-${i}`) })
    }
    return { ...base, name: String(fd.get('name') || '').trim(), description: String(fd.get('description') || '').trim(), section: String(fd.get('section') || base.section), groups: fd.getAll('groups').map(String), closes: String(fd.get('closes') || ''), payDue: String(fd.get('payDue') || ''), supplier: String(fd.get('supplier') || '').trim(), printName: !!fd.get('printName'), printNumber: !!fd.get('printNumber'), notesLabel: String(fd.get('notesLabel') || '').trim() || t('kit.blankKit.notesLabel'), products }
  }
  function kitDraftEdit(fn: (d: KitCampaign) => void): void {
    const d = readKitDraft(document.querySelector('[data-form="kit-campaign"]') as HTMLFormElement)
    fn(d); ui.kitDraft = JSON.stringify(d); render()
  }

  function screenKitBuilder(p: Record<string, string>): string {
    const key = p.id || 'new'
    const src = p.id ? kitCampaign(p.id) : undefined
    if (p.id && !src) return empty(t('kit.screenKitBuilder.notFound'), '404', link(t('kit.screenKitBuilder.campaigns'), '/backend/payments/orders'))
    if (src && !['draft', 'open'].includes(src.status)) return `<div class="alert warning"><strong>${t('kit.screenKitBuilder.lockedTitle')}</strong>${t('kit.screenKitBuilder.lockedText')}</div>${link(t('kit.screenKitBuilder.backToCampaign'), `/backend/payments/orders/${src.id}`)}`
    if (ui.kitDraftFor !== key || !ui.kitDraft) { ui.kitDraft = JSON.stringify(src || blankKit()); ui.kitDraftFor = key }
    const d: KitCampaign = JSON.parse(ui.kitDraft)
    const used = new Set(src ? kitOrders(src).flatMap((o) => o.lines.flatMap((l) => [l.product, ...Object.keys(l.sizes || {})])) : [])
    const items = d.products.filter((x) => x.kind === 'item')
    const money = (v: number | undefined): string => v ? String(v / 100) : ''
    const prow = (x: KitProduct, i: number): string => `<div class="card"><input type="hidden" name="pid-${i}" value="${esc(x.id)}">
      <div class="row between" style="margin-bottom:8px"><b>${i + 1}. ${x.kind === 'set' ? t('kit.screenKitBuilder.set') : t('kit.screenKitBuilder.product')}${x.name ? ` — ${esc(x.name.split(':')[0])}` : ''}</b>${used.has(x.id) ? badge(t('kit.screenKitBuilder.inOrders'), 'info') : btn(t('common.remove'), 'kit-remove-product', { i: String(i) }, 'sm')}</div>
      <div class="fields">${fld(`pk-${i}`, t('common.kind'), sel(`pk-${i}`, [['item', t('kit.screenKitBuilder.kindItem')], ['set', t('kit.screenKitBuilder.kindSet')]], x.kind, `data-change="kit-redraw" ${used.has(x.id) ? 'disabled' : ''}`))}${fld(`pn-${i}`, t('common.name'), inp(`pn-${i}`, 'text', x.name, 'maxlength="140"'), { req: true })}</div>
      ${used.has(x.id) ? `<input type="hidden" name="pk-${i}" value="${x.kind}">` : ''}
      ${x.kind === 'set'
        ? `<div class="fields" style="margin-top:10px">${fld(`pc-${i}`, t('kit.screenKitBuilder.setPrice'), inp(`pc-${i}`, 'number', money(x.priceChild), 'step="0.01" min="0"'), { req: true })}</div>
          <div class="field" data-field="pcomp-${i}" style="margin-top:10px"><span>${t('kit.screenKitBuilder.setItems')} <b class="req">*</b></span><div class="chips">${items.map((it) => `<label class="chip ${x.components?.includes(it.id) ? 'on' : ''}"><input type="checkbox" class="sr-only" name="pcomp-${i}" value="${esc(it.id)}" data-change="chip" ${x.components?.includes(it.id) ? 'checked' : ''}>${esc(it.name || t('kit.screenKitBuilder.unnamed'))}</label>`).join('')}</div><small>${t('kit.screenKitBuilder.setHint')}</small></div>`
        : `<div class="fields" style="margin-top:10px">${fld(`ps-${i}`, t('kit.screenKitBuilder.sizesChild'), inp(`ps-${i}`, 'text', x.sizesChild.join(', '), `placeholder="${esc(t('kit.screenKitBuilder.sizesChildPh'))}"`), { hint: t('kit.screenKitBuilder.sizesChildHint') })}${fld(`pa-${i}`, t('kit.screenKitBuilder.sizesAdult'), inp(`pa-${i}`, 'text', x.sizesAdult.join(', '), `placeholder="${esc(t('kit.screenKitBuilder.sizesAdultPh'))}"`))}${fld(`pc-${i}`, t('kit.screenKitBuilder.price'), inp(`pc-${i}`, 'number', money(x.priceChild), 'step="0.01" min="0"'), { req: true })}${fld(`pp-${i}`, t('kit.screenKitBuilder.priceAdult'), inp(`pp-${i}`, 'number', money(x.priceAdult), 'step="0.01" min="0"'), { hint: t('kit.screenKitBuilder.priceAdultHint') })}</div>
          <div style="margin-top:8px">${chk(`pr-${i}`, t('kit.screenKitBuilder.required'), x.required)}</div>`}
      ${used.has(x.id) ? `<p class="small muted" style="margin:8px 0 0">${t('kit.screenKitBuilder.usedHint')}</p>` : ''}</div>`
    const secGroups = db.groups.filter((g) => g.section === d.section)
    return `${pageHead(src ? t('kit.screenKitBuilder.editTitle', { name: src.name }) : t('kit.screenKitBuilder.newTitle'), t('kit.screenKitBuilder.subtitle'), '')}
      <form class="form" data-form="kit-campaign" novalidate><div class="form-general"></div>
      ${src && src.status === 'open' ? `<div class="alert info"><strong>${t('kit.screenKitBuilder.collectingTitle', { n: kitOrders(src).length })}</strong>${t('kit.screenKitBuilder.collectingText')}</div>` : ''}
      <div class="form-group"><h3>${t('kit.screenKitBuilder.campaignTitle')}</h3><div class="fields">${fld('name', t('common.name'), inp('name', 'text', d.name, `maxlength="120" placeholder="${esc(t('kit.screenKitBuilder.namePh'))}"`), { req: true })}${fld('section', t('common.section'), sel('section', db.sections.map((s) => [s.id, s.name] as [string, string]), d.section, 'data-change="kit-section"'), { req: true })}</div>
        <div style="margin-top:10px">${fld('description', t('kit.screenKitBuilder.description'), area('description', d.description, 'rows="3" maxlength="1000"'), { hint: t('kit.screenKitBuilder.descriptionHint') })}</div>
        <div class="field" data-field="groups" style="margin-top:10px"><span>${t('kit.screenKitBuilder.groups')} <b class="req">*</b></span><div class="chips">${secGroups.map((g) => `<label class="chip ${d.groups.includes(g.id) ? 'on' : ''}"><input type="checkbox" class="sr-only" name="groups" value="${g.id}" data-change="chip" ${d.groups.includes(g.id) ? 'checked' : ''}>${esc(g.name)}</label>`).join('')}</div><div style="margin-top:6px">${btn(t('kit.screenKitBuilder.selectAll'), 'kit-all-groups', {}, 'sm')}</div></div>
        <div class="fields" style="margin-top:10px">${fld('closes', t('kit.screenKitBuilder.closes'), inp('closes', 'date', d.closes), { req: true, hint: t('kit.screenKitBuilder.closesHint') })}${fld('payDue', t('kit.screenKitBuilder.payDue'), inp('payDue', 'date', d.payDue), { req: true, hint: t('kit.screenKitBuilder.payDueHint') })}${fld('supplier', t('kit.screenKitBuilder.supplier'), inp('supplier', 'text', d.supplier))}</div></div>
      <div class="form-group"><h3>${t('kit.screenKitBuilder.personalTitle')}</h3><div class="stack">${chk('printName', t('kit.screenKitBuilder.askPrintName'), d.printName)}${chk('printNumber', t('kit.screenKitBuilder.askPrintNumber'), d.printNumber)}</div><div style="margin-top:10px">${fld('notesLabel', t('kit.screenKitBuilder.notesQuestion'), inp('notesLabel', 'text', d.notesLabel))}</div></div>
      <div class="form-group"><div class="row between" style="margin-bottom:10px"><h3 style="margin:0">${t('kit.screenKitBuilder.products')}</h3><div class="row">${used.size ? '' : btn(t('kit.screenKitBuilder.loadTemplate'), 'kit-template', {}, 'sm')}${btn(t('kit.screenKitBuilder.addProduct'), 'kit-add-product', {}, 'sm primary')}</div></div><input type="hidden" name="pcount" value="${d.products.length}"><div class="stack">${d.products.map(prow).join('')}</div></div>
      <div class="form-actions">${link(t('common.cancel'), src ? `/backend/payments/orders/${src.id}` : '/backend/payments/orders')}${!src || src.status === 'draft' ? `<button class="btn" type="submit" value="draft">${t('kit.screenKitBuilder.saveDraft')}</button><button class="btn primary" type="submit" value="open">${t('kit.screenKitBuilder.saveOpen')}</button>` : `<button class="btn primary" type="submit" value="save">${t('common.saveChanges')}</button>`}</div></form>`
  }

  function screenKitCampaignAdmin(p: Record<string, string>, q: URLSearchParams): string {
    const c = kitCampaign(p.id)
    if (!c) return empty(t('kit.screenKitCampaignAdmin.notFound'), '404', link(t('kit.screenKitCampaignAdmin.campaigns'), '/backend/payments/orders'))
    const view = q.get('view') || 'orders'
    const s = kitStats(c), os = kitOrders(c)
    const steps: KitCampaign['status'][] = ['draft', 'open', 'closed', 'ordered', 'delivered', 'completed']
    const stepper = `<div class="chips" aria-label="${esc(t('kit.screenKitCampaignAdmin.stepsAria'))}" style="margin-bottom:12px">${steps.map((st) => `<span class="chip ${st === c.status ? 'on' : ''}" ${st === c.status ? 'aria-current="step"' : ''}>${esc(t(KIT_STATUS[st][0]))}</span>`).join('')}</div>`
    const next: Partial<Record<KitCampaign['status'], [string, string]>> = { draft: ['open', 'kit.screenKitCampaignAdmin.next.open'], open: ['closed', 'kit.screenKitCampaignAdmin.next.closed'], closed: ['ordered', 'kit.screenKitCampaignAdmin.next.ordered'], ordered: ['delivered', 'kit.screenKitCampaignAdmin.next.delivered'], delivered: ['completed', 'kit.screenKitCampaignAdmin.next.completed'] }
    const nx = next[c.status]
    const actions = `${['draft', 'open'].includes(c.status) ? link(t('kit.screenKitCampaignAdmin.editForm'), `/backend/payments/orders/${c.id}/edit`) : ''}${c.status === 'open' ? btn(t('kit.screenKitCampaignAdmin.shareText'), 'kit-share', { id: c.id }) : ''}${nx ? btn(t(nx[1]), 'kit-status', { id: c.id, to: nx[0] }, 'primary') : ''}`
    const kpis = `<div class="grid3"><div class="card"><div class="sub">${esc(t('kit.screenKitCampaignAdmin.kpiOrders'))}</div><div class="kpi">${s.orders} / ${s.kids}</div><div class="small muted">${esc(t('kit.screenKitCampaignAdmin.kpiOrdersHint'))}</div></div><div class="card"><div class="sub">${esc(t('kit.screenKitCampaignAdmin.kpiPaid'))}</div><div class="kpi">${zl(s.paid)}</div><div class="small muted">${esc(t('kit.screenKitCampaignAdmin.kpiPaidHint', { value: zl(s.value), date: dShort(c.payDue) }))}</div></div><div class="card"><div class="sub">${esc(t('kit.screenKitCampaignAdmin.kpiHanded'))}</div><div class="kpi">${s.handed} / ${s.orders}</div><div class="small muted">${esc(c.supplier || t('kit.screenKitCampaignAdmin.noSupplier'))}</div></div></div>`
    const missingRows = c.groups.flatMap((gid) => group(gid).members.filter((m) => !kitOrderOf(c, m)).map((m) => ({ m, gid })))
    const tabs: [string, string, boolean][] = [[t('kit.screenKitCampaignAdmin.tabOrders', { n: os.length }), `/backend/payments/orders/${c.id}?view=orders`, view === 'orders'], [t('kit.screenKitCampaignAdmin.tabSupplier'), `/backend/payments/orders/${c.id}?view=supplier`, view === 'supplier'], [t('kit.screenKitCampaignAdmin.tabMissing', { n: missingRows.length }), `/backend/payments/orders/${c.id}?view=missing`, view === 'missing']]
    let body = ''
    if (view === 'supplier') {
      const agg = kitSupplier(c)
      const prints = os.filter((o) => o.printName || o.printNumber)
      const first = c.products.find((x) => x.kind === 'item')
      const shirt = (o: KitOrder): string => { if (!first) return '—'; for (const l of o.lines) { if (l.sizes?.[first.id]) return l.sizes[first.id]; if (l.product === first.id) return l.size } return '—' }
      const csv = [t('kit.screenKitCampaignAdmin.csvProducts'), ...agg.map((a) => `${a.product.name};${a.size};${a.qty};${a.inSet}`), '', t('kit.screenKitCampaignAdmin.csvPrints'), ...prints.map((o) => `${pName(o.child)};${group(kitGroupOf(c, o.child)).name};${o.printName};${o.printNumber};${shirt(o)}`)].join('\n')
      body = `${c.status === 'open' ? `<div class="alert warning"><strong>${esc(t('kit.screenKitCampaignAdmin.collectingTitle'))}</strong>${esc(t('kit.screenKitCampaignAdmin.collectingText'))}</div>` : ''}${table({ tabs, cols: [
          { label: t('kit.screenKitCampaignAdmin.colProduct'), cell: (a: { product: KitProduct }) => esc(a.product.name) },
          { label: t('kit.screenKitCampaignAdmin.colSize'), cell: (a: { size: string }) => `<b>${esc(a.size)}</b>` },
          { label: t('kit.screenKitCampaignAdmin.colQty'), num: true, cell: (a: { qty: number }) => `<b>${a.qty}</b>` },
          { label: t('kit.screenKitCampaignAdmin.colInSets'), num: true, cell: (a: { inSet: number }) => a.inSet ? String(a.inSet) : '—' },
        ], rows: agg, empty: [t('kit.screenKitCampaignAdmin.noItemsTitle'), t('kit.screenKitCampaignAdmin.noItemsText')] })}
        <div class="section-title">${esc(t('kit.screenKitCampaignAdmin.prints', { n: prints.length }))}</div>${table({ cols: [{ label: t('kit.screenKitCampaignAdmin.colChild'), cell: (o: KitOrder) => esc(pName(o.child)) }, { label: t('common.group'), cell: (o: KitOrder) => esc(group(kitGroupOf(c, o.child)).name) }, { label: t('kit.screenKitCampaignAdmin.colPrintName'), cell: (o: KitOrder) => `<b>${esc(o.printName || '—')}</b>` }, { label: t('kit.screenKitCampaignAdmin.colNumber'), num: true, cell: (o: KitOrder) => `<b>${esc(o.printNumber || '—')}</b>` }, { label: t('kit.screenKitCampaignAdmin.colShirt'), cell: (o: KitOrder) => esc(shirt(o)) }], rows: prints, empty: [t('kit.screenKitCampaignAdmin.noPrints'), ''] })}
        <div class="section-title">${esc(t('kit.screenKitCampaignAdmin.csvTitle'))}</div><textarea id="csv-text" readonly rows="8" style="width:100%">${esc(csv)}</textarea><div class="row" style="margin-top:8px">${btn(t('kit.screenKitCampaignAdmin.copyCsv'), 'copy-csv', {}, 'primary')}</div>`
    } else if (view === 'missing') {
      body = table({ tabs, toolbar: c.status === 'open' && missingRows.length ? btn(t('kit.screenKitCampaignAdmin.remindAll', { n: missingRows.length }), 'kit-remind', { c: c.id }, 'sm primary') : '', cols: [
        { label: t('kit.screenKitCampaignAdmin.colChild'), cell: (r: { m: string }) => `<b>${esc(pName(r.m))}</b>` },
        { label: t('common.group'), cell: (r: { gid: string }) => esc(group(r.gid).name) },
        { label: t('kit.screenKitCampaignAdmin.colGuardians'), cell: (r: { m: string }) => esc(db.guardianships.filter((x) => x.ward === r.m).map((x) => `${pName(x.guardian)}${personById(db, x.guardian).email ? '' : t('kit.screenKitCampaignAdmin.noEmail')}`).join(', ') || t('kit.screenKitCampaignAdmin.noGuardian')) },
      ], rows: missingRows, empty: [t('kit.screenKitCampaignAdmin.allOrderedTitle'), t('kit.screenKitCampaignAdmin.allOrderedText')] })
    } else {
      body = table({ tabs, cols: [
        { label: t('kit.screenKitCampaignAdmin.colChild'), cell: (o: KitOrder) => `<b>${esc(pName(o.child))}</b><div class="small muted">${esc(group(kitGroupOf(c, o.child)).name)}</div>` },
        { label: t('kit.screenKitCampaignAdmin.colOrderedBy'), cell: (o: KitOrder) => `${esc(pName(o.by))}<div class="small muted">${esc(o.phone)} · ${esc(t(`kit.via.${o.via}`))}</div>` },
        { label: t('kit.screenKitCampaignAdmin.colItems'), cell: (o: KitOrder) => `<div class="small">${o.lines.map((l) => esc(kitLineLabel(c, l))).join('<br>')}</div>${o.notes ? `<div class="small muted">${esc(t('kit.screenKitCampaignAdmin.notes', { notes: o.notes }))}</div>` : ''}` },
        { label: t('kit.screenKitCampaignAdmin.colPrint'), cell: (o: KitOrder) => esc([o.printName, o.printNumber].filter(Boolean).join(' ') || '—') },
        { label: t('common.amount'), num: true, cell: (o: KitOrder) => zl(kitTotal(o)) },
        { label: t('kit.screenKitCampaignAdmin.colPayment'), cell: (o: KitOrder) => { const ch = chargeById(o.chargeId); return `${kitPayBadge(ch)}${ch.payments.length ? `<div class="small muted">${ch.payments.map((x) => `${esc(t(`pay.method.${x.method}`))}${x.by ? ` — ${esc(pName(x.by))}${x.settled ? '' : esc(t('kit.screenKitCampaignAdmin.withCollector'))}` : ''}`).join(', ')}</div>` : ''}` } },
        { label: t('kit.screenKitCampaignAdmin.colHandover'), cell: (o: KitOrder) => o.handedAt ? `${badge(t('kit.screenKitCampaignAdmin.handed'), 'success')}<div class="small muted">${esc(pName(o.handedBy))}</div>` : '—' },
        { label: '', cell: (o: KitOrder) => { const ch = chargeById(o.chargeId); return `<div class="row">${ch.status !== 'paid' ? btn(t('kit.screenKitCampaignAdmin.cashBtn'), 'cash', { payer: o.by, charge: ch.id }, 'sm') : ''}${c.status === 'delivered' && !o.handedAt ? btn(t('kit.screenKitCampaignAdmin.handBtn'), 'kit-hand', { order: o.id }, 'sm') : ''}<a class="btn sm" href="#/backend/payments/charges/${ch.id}">${esc(t('kit.screenKitCampaignAdmin.chargeLink'))}</a></div>` } },
      ], rows: os, empty: [t('kit.screenKitCampaignAdmin.noOrdersTitle'), c.status === 'draft' ? t('kit.screenKitCampaignAdmin.noOrdersDraft') : t('kit.screenKitCampaignAdmin.noOrdersOpen')] })
    }
    return `${pageHead(c.name, t('kit.screenKitCampaignAdmin.subtitle', { section: section(c.section).name, groups: t('kit.screenKitCampaignAdmin.groupsCount', { n: c.groups.length }), closes: dShort(c.closes), payDue: dShort(c.payDue) }), actions)}${stepper}${kpis}<div style="margin-top:12px">${body}</div>`
  }

  function screenCashCustody(): string {
    return `${pageHead(t('b.screenCashCustody.title'), t('b.screenCashCustody.subtitle'), '')}
      ${table({ cols: [
        { label: t('common.person'), cell: (pid: string) => `<b>${esc(pName(pid))}</b>` },
        { label: t('b.screenCashCustody.colPayments'), cell: (pid: string) => `<div class="small">${custodyOf(pid).map((it) => `${esc(it.x.receipt || '—')} · ${esc(txt(it.c.description))} · ${dShort(it.x.date)} — ${zl(it.x.amount)}`).join('<br>')}</div>` },
        { label: t('b.screenCashCustody.colOldest'), cell: (pid: string) => dShort(custodyOf(pid).map((it) => it.x.date).sort()[0]) },
        { label: t('common.total'), num: true, cell: (pid: string) => `<b>${zl(custodyOf(pid).reduce((a, it) => a + it.x.amount, 0))}</b>` },
        { label: '', cell: (pid: string) => btn(t('b.screenCashCustody.settle'), 'cash-settle', { person: pid }, 'sm primary') },
      ], rows: custodians(), empty: [t('b.screenCashCustody.emptyTitle'), t('b.screenCashCustody.emptyText')] })}
      ${db.cashHandovers.length ? `<div class="section-title">${esc(t('b.screenCashCustody.handovers'))}</div>${table({ cols: [{ label: t('b.screenCashCustody.colNumber'), cell: (h: CashHandover) => `<b>${esc(h.number)}</b>` }, { label: t('common.from'), cell: (h: CashHandover) => esc(pName(h.collector)) }, { label: t('common.when'), cell: (h: CashHandover) => esc(h.at) }, { label: t('b.screenCashCustody.colAcceptedBy'), cell: (h: CashHandover) => esc(pName(h.by)) }, { label: t('b.screenCashCustody.colCount'), num: true, cell: (h: CashHandover) => String(h.count) }, { label: t('common.amount'), num: true, cell: (h: CashHandover) => zl(h.amount) }], rows: db.cashHandovers })}` : ''}`
  }

  function kitDashboardWidget(w: (title: string, body: string, href: string, count?: number) => string): string {
    const camps = db.kitCampaigns.filter((c) => !['draft', 'completed'].includes(c.status))
    const held = custodians().reduce((a, pid) => a + custodyOf(pid).reduce((b, it) => b + it.x.amount, 0), 0)
    return w(t('kit.kitDashboardWidget.title'), `${camps.length ? `<ul class="list small">${camps.map((c) => { const s = kitStats(c); return `<li><a href="#/backend/payments/orders/${c.id}">${esc(c.name)}</a> ${kitBadge(c.status)}<br><span class="muted">${esc(t('kit.kitDashboardWidget.progress', { orders: s.orders, kids: s.kids, paid: zl(s.paid), value: zl(s.value) }))}</span></li>` }).join('')}</ul>` : `<p class="muted small">${esc(t('kit.kitDashboardWidget.none'))}</p>`}${held ? `<p class="small" style="margin:8px 0 0">${esc(t('kit.kitDashboardWidget.cashHeld'))} <b>${zl(held)}</b> — <a href="#/backend/payments/cash-custody">${esc(t('kit.kitDashboardWidget.settle'))}</a></p>` : ''}`, '/backend/payments/orders', camps.length)
  }

  // Route table. name = catalog key (displayed with t(route.name)); empty = [titleKey, textKey] for the "Empty" demo state;
  // api entries starting with "api." are catalog keys for captions, the rest are literal API paths.
  const R = (pattern: string, id: string, name: string, shell: ShellKind, api: string[], render: RouteDef['render'], extra: Partial<RouteDef> = {}): RouteDef => ({ pattern, id, name, shell, api, render, ...extra })
  const ROUTES: RouteDef[] = [
    R('/login', 'M-01', 'route.M-01', 'member', ['api.authLogin', 'GET /api/people/me'], () => screenLogin(), { persona: false }),
    R('/club', 'M-02', 'route.M-02', 'member', ['GET /api/people/me', 'GET /api/activities/calendar?as=self', 'POST /api/activities/attendance/declare', 'GET /api/communication/threads?unread=1', 'GET /api/payments/my-charges?status=open'], () => screenToday(), { empty: ['route.M-02.emptyTitle', 'route.M-02.emptyText'] }),
    R('/club/calendar', 'M-03', 'route.M-03', 'member', ['GET /api/activities/calendar?as=guardian&from&to'], (_p, q) => screenCalendar(q), { empty: ['route.M-03.emptyTitle', 'route.M-03.emptyText'] }),
    R('/club/occurrences/:id', 'M-04', 'route.M-04', 'member', ['GET /api/activities/occurrences/{id}', 'POST /api/activities/attendance/declare', 'POST /api/activities/attendance/{id}/guardian-decision', 'POST /api/activities/occurrences/{id}/absence', 'POST /api/activities/occurrences/{id}/cancel'], (p) => screenOccurrence(p), { back: '/club/calendar' }),
    R('/club/occurrences/:id/attendance', 'M-05', 'route.M-05', 'member', ['GET /api/activities/occurrences/{id}/attendance', 'PUT /api/activities/occurrences/{id}/attendance'], (p) => screenAttendance(p), { empty: ['route.M-05.emptyTitle', 'route.M-05.emptyText'], back: '/club' }),
    R('/club/messages', 'M-06', 'route.M-06', 'member', ['GET /api/communication/threads', 'POST /api/communication/threads'], () => screenMessages(), { empty: ['route.M-06.emptyTitle', 'route.M-06.emptyText'] }),
    R('/club/messages/:id', 'M-07', 'route.M-07', 'member', ['GET /api/communication/threads/{id}', 'POST /api/communication/threads/{id}/replies', 'GET /api/communication/share-text'], (p) => screenThread(p), { back: '/club/messages' }),
    R('/club/payments', 'M-08', 'route.M-08', 'member', ['GET /api/payments/my-charges', 'POST /api/payments/checkout'], () => screenPayments(), { empty: ['route.M-08.emptyTitle', 'route.M-08.emptyText'] }),
    R('/club/payments/return', 'M-09', 'route.M-09', 'member', ['GET /api/payments/my-charges'], (_p, q) => screenPayReturn(q), { back: '/club/payments' }),
    R('/club/profile', 'M-10', 'route.M-10', 'member', ['GET /api/people/me', 'PUT /api/people/me', 'PUT /api/people/persons/{id}', 'PUT /api/people/guardianships/{id}'], () => screenProfile()),
    R('/club/places', 'M-11', 'route.M-11', 'member', ['GET /api/facilities/calendar'], () => screenPlaces(), { empty: ['route.M-11.emptyTitle', 'route.M-11.emptyText'] }),
    R('/club/places/:id', 'M-11', 'route.M-11.place', 'member', ['GET /api/facilities/calendar?placeId&from&to', 'POST /api/facilities/internal-bookings', 'DELETE /api/facilities/internal-bookings/{id}', 'POST /api/activities/events'], (p, q) => screenPlace(p, q), { empty: ['route.M-11.place.emptyTitle', 'route.M-11.place.emptyText'], back: '/club/places' }),
    R('/club/facility', 'M-12', 'route.M-12', 'member', ['GET /api/facilities/today', 'POST/PUT /api/facilities/logs', 'POST /api/facilities/incidents', 'POST /api/facilities/rentals/{id}/no-show'], () => screenFacilityToday(), { empty: ['route.M-12.emptyTitle', 'route.M-12.emptyText'] }),
    R('/club/link', 'M-13', 'route.M-13', 'member', ['POST /api/activities/declaration-links'], (_p, q) => screenLink(q), { persona: false }),
    R('/club/cash', 'M-15', 'route.M-15', 'member', ['GET /api/payments/charges?payer=&status=open', 'POST /api/payments/cash'], () => screenCashMobile(), { back: '/club/profile' }),
    R('/club/orders', 'M-16', 'route.M-16', 'member', ['GET /api/payments/order-campaigns?for=me'], () => screenKitList(), { empty: ['route.M-16.emptyTitle', 'route.M-16.emptyText'], back: '/club/payments' }),
    R('/club/orders/:id', 'M-17', 'route.M-17', 'member', ['GET /api/payments/order-campaigns/{id}/form', 'POST /api/payments/orders', 'PUT /api/payments/orders/{id}', 'POST /api/payments/orders/{id}/cancel', 'POST /api/payments/public/order-campaigns/{id}/link-request'], (p, q) => screenKitOrder(p, q), { back: '/club/orders', guestOk: true }),
    R('/club/coach/payments', 'M-18', 'route.M-18', 'member', ['GET /api/payments/group-charges?groupId=&due=', 'POST /api/payments/cash', 'POST /api/payments/group-charges/remind', 'POST /api/payments/orders/{id}/hand-over', 'POST /api/payments/order-campaigns/{id}/remind'], (_p, q) => screenGroupPayments(q), { empty: ['route.M-18.emptyTitle', 'route.M-18.emptyText'], back: '/club/profile' }),
    R('/club/o/:token', 'M-19', 'route.M-19', 'member', ['GET /api/payments/order-links/{token}', 'POST /api/payments/order-links/{token}/orders'], (p, q) => screenKitToken(p, q), { persona: false }),
    R('/club/d/:token', 'M-14', 'route.M-14', 'member', ['GET /api/activities/declaration-links/{token}', 'POST /api/activities/declaration-links/{token}'], (p) => screenTokenDeclare(p), { persona: false }),
    R('/stripe', '—', 'route.stripe', 'bare', ['POST /api/payments/checkout → redirectUrl', 'webhook → payment_gateways.payment.captured'], (_p, q) => screenStripe(q)),
    R('/backend', 'B-01', 'route.B-01', 'backend', ['GET /api/activities/occurrences?unassigned=1', 'GET /api/activities/occurrences?unsettled=1', 'GET /api/payments/overdue', 'GET /api/payments/charges?payerMissing=1', 'GET /api/club_core/sections', 'GET /api/facilities/rentals?status=pending_approval', 'GET /api/facilities/today'], () => screenDashboard()),
    R('/backend/club/settings', 'B-02', 'route.B-02', 'backend', ['GET/PUT /api/club_core/settings'], () => screenSettings()),
    R('/backend/club/publication', 'B-03', 'route.B-03', 'backend', ['GET/PUT /api/club_core/settings (publication)'], () => screenPublication()),
    R('/backend/club/sections', 'B-04', 'route.B-04', 'backend', ['GET /api/club_core/sections'], () => screenSections(), { empty: ['route.B-04.emptyTitle', 'route.B-04.emptyText'] }),
    R('/backend/club/sections/:id/edit', 'B-05', 'route.B-05', 'backend', ['GET/PUT /api/club_core/sections/{id}', 'POST/DELETE /api/people/role-assignments'], (p, q) => screenSection(p, q)),
    R('/backend/club/places', 'B-06', 'route.B-06', 'backend', ['/api/club_core/places'], () => screenPlacesAdmin()),
    R('/backend/club/institutions', 'B-07', 'route.B-07', 'backend', ['/api/club_core/institutions', '/api/club_core/contracts'], (_p, q) => screenInstitutions(q)),
    R('/backend/people/persons', 'B-09', 'route.B-09', 'backend', ['GET /api/people/persons'], (_p, q) => screenPersons(q), { empty: ['route.B-09.emptyTitle', 'route.B-09.emptyText'] }),
    R('/backend/people/persons/:id', 'B-10', 'route.B-10', 'backend', ['GET/PUT /api/people/persons/{id}', '/api/people/guardianships', '/api/people/role-assignments', 'POST /api/people/persons/{id}/account'], (p, q) => screenPerson(p, q)),
    R('/backend/groups/groups', 'B-11', 'route.B-11', 'backend', ['GET /api/groups/groups'], (_p, q) => screenGroups(q)),
    R('/backend/groups/groups/:id', 'B-12', 'route.B-12', 'backend', ['/api/groups/groups/{id}', '/api/groups/memberships'], (p, q) => screenGroup(p, q)),
    R('/backend/activities/activities', 'B-13', 'route.B-13', 'backend', ['GET /api/activities/activities'], () => screenActivities()),
    R('/backend/activities/activities/create', 'B-14', 'route.B-14', 'backend', ['POST /api/activities/activities/preview', 'POST /api/activities/activities'], () => screenActivityCreate()),
    R('/backend/activities/occurrences', 'B-15', 'route.B-15', 'backend', ['GET /api/activities/occurrences', 'POST /api/activities/occurrences/{id}/coach', 'POST /api/activities/occurrences/{id}/cancel'], (_p, q) => screenOccurrences(q)),
    R('/backend/activities/reports/coach-units', 'B-16', 'route.B-16', 'backend', ['GET /api/activities/reports/coach-units?month&format=csv'], (_p, q) => screenUnits(q), { empty: ['route.B-16.emptyTitle', ''] }),
    R('/backend/activities/policies', 'B-17', 'route.B-17', 'backend', ['/api/activities/attendance-policies'], () => screenPolicies()),
    R('/backend/communication/threads', 'B-18', 'route.B-18', 'backend', ['GET/POST /api/communication/threads'], (_p, q) => screenThreadsAdmin(q)),
    R('/backend/communication/threads/:id', 'B-19', 'route.B-19', 'backend', ['GET /api/communication/threads/{id}', 'POST …/replies', 'POST …/case'], (p) => screenThreadAdmin(p)),
    R('/backend/payments/fees', 'B-20', 'route.B-20', 'backend', ['/api/payments/fees', '/api/payments/discount-rules', 'GET/PUT /api/payments/settings'], () => screenFees()),
    R('/backend/payments/charges', 'B-21', 'route.B-21', 'backend', ['GET /api/payments/charges', 'GET /api/payments/overdue', 'POST /api/payments/charges/generate'], (_p, q) => screenCharges(q)),
    R('/backend/payments/bank', 'B-29', 'route.B-29', 'backend', ['api.bankImportsFile', 'GET /api/payments/bank-transactions?status=', 'POST /api/payments/bank-transactions/{id}/confirm|assign|ignore|undo', 'POST /api/payments/cash', 'GET/PUT /api/payments/settings'], (_p, q) => screenBank(q)),
    R('/backend/payments/orders', 'B-30', 'route.B-30', 'backend', ['GET /api/payments/order-campaigns'], () => screenKitCampaigns(), { empty: ['route.B-30.emptyTitle', 'route.B-30.emptyText'] }),
    R('/backend/payments/orders/create', 'B-31', 'route.B-31', 'backend', ['POST /api/payments/order-campaigns'], (p) => screenKitBuilder(p)),
    R('/backend/payments/orders/:id/edit', 'B-31', 'route.B-31.edit', 'backend', ['GET/PUT /api/payments/order-campaigns/{id}'], (p) => screenKitBuilder(p)),
    R('/backend/payments/orders/:id', 'B-32', 'route.B-32', 'backend', ['GET /api/payments/order-campaigns/{id}', 'GET /api/payments/orders?campaignId', 'GET /api/payments/order-campaigns/{id}/summary?format=csv', 'POST /api/payments/order-campaigns/{id}/open|close|mark-ordered|mark-delivered|complete', 'GET /api/payments/order-campaigns/{id}/share-text', 'POST /api/payments/orders/{id}/hand-over'], (p, q) => screenKitCampaignAdmin(p, q)),
    R('/backend/payments/cash-custody', 'B-33', 'route.B-33', 'backend', ['GET /api/payments/cash-custody', 'POST /api/payments/cash-handovers', 'GET /api/payments/cash-handovers'], () => screenCashCustody(), { empty: ['route.B-33.emptyTitle', 'route.B-33.emptyText'] }),
    R('/backend/payments/charges/:id', 'B-22', 'route.B-22', 'backend', ['GET /api/payments/charges/{id}', 'POST /api/payments/charges/{id}/payments', 'POST /api/payments/charges/{id}/cancel'], (p) => screenCharge(p)),
    R('/backend/facilities/calendar', 'B-23', 'route.B-23', 'backend', ['GET /api/facilities/calendar', 'POST /api/facilities/rentals', 'POST /api/facilities/rentals/quote', 'POST /api/facilities/zone-rules/bulk'], (p, q) => screenPlace({ id: q.get('place') || 'pl-boisko' }, q, true)),
    R('/backend/facilities/rentals', 'B-24', 'route.B-24', 'backend', ['/api/facilities/rentals', 'POST …/{id}/confirm|cancel|move|no-show'], (_p, q) => screenRentals(q)),
    R('/backend/facilities/requests', 'B-25', 'route.B-25', 'backend', ['GET /api/facilities/rentals?status=pending_approval', 'POST /api/facilities/rentals/{id}/approve', 'POST /api/facilities/rentals/{id}/reject'], () => screenRequests(), { empty: ['route.B-25.emptyTitle', ''] }),
    R('/backend/facilities/zones', 'B-26', 'route.B-26', 'backend', ['/api/facilities/zone-rules', '/api/facilities/closures', '/api/facilities/rental-rates'], (_p, q) => screenZones(q)),
    R('/backend/facilities/logs', 'B-27', 'route.B-27', 'backend', ['/api/facilities/logs', '/api/facilities/incidents', '/api/facilities/entry-bans'], (_p, q) => screenLogs(q)),
    R('/backend/facilities/reports/owner', 'B-28', 'route.B-28', 'backend', ['GET /api/facilities/reports/owner?placeId&from&to&format=csv'], (_p, q) => screenOwnerReport(q)),
    R('/p/gwiazda', 'P-01', 'route.P-01', 'public', ['GET /api/club_core/public/{clubSlug}'], () => screenClubPage(), { persona: false, empty: ['route.P-01.emptyTitle', ''] }),
    R('/p/gwiazda/sections/:slug', 'P-02', 'route.P-02', 'public', ['GET /api/club_core/public/{clubSlug}/sections/{sectionSlug}'], (p) => screenSectionPage(p), { persona: false, empty: ['route.P-02.emptyTitle', ''] }),
    R('/p/gwiazda/places', 'P-03', 'route.P-03', 'public', ['GET /api/facilities/public/{clubSlug}/places'], () => screenPublicPlaces(), { persona: false }),
    R('/p/gwiazda/places/:slug', 'P-04', 'route.P-04', 'public', ['GET /api/facilities/public/{clubSlug}/places/{placeSlug}/schedule', 'POST …/places/{placeSlug}/requests'], (p, q) => screenPublicPlace(p, q), { persona: false, empty: ['route.P-04.emptyTitle', ''] }),
    R('/p/gwiazda/requests/verify/:token', 'P-05', 'route.P-05', 'public', ['POST /api/facilities/public/requests/verify/{token}'], (p) => screenVerify(p), { persona: false }),
  ]
  // ACL features required by the pages (requireFeatures in page.meta.ts).
  const ROUTE_FEATURES: Record<string, string> = {
    'M-08': 'payments.view_own', 'M-09': 'payments.view_own', 'M-11': 'facilities.view', 'M-12': 'facilities.log.write',
    'B-02': 'club_core.manage', 'B-03': 'club_core.publication.manage', 'B-04': 'club_core.view', 'B-05': 'club_core.view', 'B-06': 'club_core.manage', 'B-07': 'club_core.manage',
    'B-09': 'people.view', 'B-10': 'people.view', 'B-11': 'groups.view', 'B-12': 'groups.view', 'B-13': 'activities.manage', 'B-14': 'activities.manage', 'B-15': 'activities.view',
    'B-16': 'activities.reports.view', 'B-17': 'activities.manage', 'B-18': 'communication.view', 'B-19': 'communication.view',
    'B-20': 'payments.manage', 'B-21': 'payments.view', 'B-22': 'payments.view', 'B-29': 'payments.bank.import', 'M-15': 'payments.cash.record', 'M-16': 'payments.orders.place', 'M-17': 'payments.orders.place', 'M-18': 'payments.groups.view', 'B-30': 'payments.orders.manage', 'B-31': 'payments.orders.manage', 'B-32': 'payments.orders.manage', 'B-33': 'payments.cash.settle', 'B-23': 'facilities.view', 'B-24': 'facilities.rentals.manage', 'B-25': 'facilities.rentals.approve',
    'B-26': 'facilities.manage', 'B-27': 'facilities.log.write', 'B-28': 'facilities.reports.view',
  }
  for (const r of ROUTES) if (ROUTE_FEATURES[r.id]) r.feature = ROUTE_FEATURES[r.id]

  function match(path: string): { route: RouteDef; params: Record<string, string> } | null {
    for (const route of ROUTES) {
      const pp = route.pattern.split('/'), xp = path.split('/')
      if (pp.length !== xp.length) continue
      const params: Record<string, string> = {}
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
  // Shells
  // ═══════════════════════════════════════════════════════════════════
  function memberShell(route: RouteDef, content: string, path: string): string {
    const loggedIn = personaId !== 'guest'
    const multi = isCoachPersona() && (hasMemberRole(me()) || can('backend'))
    const ctxSel = loggedIn && multi && path === '/club' ? `<label class="small">${esc(t('shell.memberShell.context'))} ${sel('ctx', [['coach', isAdmin() || coordSections(me()).length ? t('shell.memberShell.asCoachCoordinator') : t('shell.memberShell.asCoach')], ['member', t('shell.memberShell.asMember')]], coachCtx ? 'coach' : 'member', 'data-change="ctx"')}</label>` : ''
    const title = path === '/club' && loggedIn ? t('shell.memberShell.greeting', { name: personById(db, me()).first }) : t(route.name)
    const tab = (href: string, ico: string, label: string, active: boolean): string => `<a href="#${href}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}><span class="ico">${icon(ico)}</span>${esc(label)}</a>`
    // Payments only for adults (payments.view_own); an underage participant has 4 tabs.
    const fourth = can('payments.view_own') ? tab('/club/payments', 'wallet', t('shell.memberShell.tabPayments'), path.startsWith('/club/payments') || path.startsWith('/club/orders')) : can('facilities.view') ? tab('/club/places', 'map-pin', t('shell.memberShell.tabFacilities'), path.startsWith('/club/places')) : ''
    const tabList = [tab('/club', 'house', t('shell.memberShell.tabToday'), path === '/club'), tab('/club/calendar', 'calendar-days', t('shell.memberShell.tabCalendar'), path.startsWith('/club/calendar') || path.startsWith('/club/occurrences')), tab('/club/messages', 'message-square', t('shell.memberShell.tabMessages'), path.startsWith('/club/messages')), fourth, tab('/club/profile', 'menu', t('shell.memberShell.tabMore'), path.startsWith('/club/profile') || path.startsWith('/club/facility') || path.startsWith('/club/coach') || (can('payments.view_own') && path.startsWith('/club/places')))].filter(Boolean)
    const tabs = loggedIn && route.persona !== false ? `<nav class="tabbar" aria-label="${esc(t('shell.memberShell.navAria'))}" style="grid-template-columns:repeat(${tabList.length},1fr)">${tabList.join('')}</nav>` : ''
    return `<div class="phone"><header class="phone-header"><div class="row">${route.back ? `<a class="back" href="#${route.back}">${esc(t('common.back'))}</a>` : '<span></span>'}<span class="row small muted" style="gap:6px">${logoBox(db.settings.logo, t('shell.memberShell.clubLogo'), 20)}${esc(db.settings.name)}</span></div><div class="row"><h1 class="phone-title">${esc(title)}</h1>${ctxSel}</div></header>
      <div class="phone-body" id="phone-body">${content}${apiFoot(route)}</div>${tabs}</div>`
  }

  function backendShell(route: RouteDef, content: string, path: string): string {
    // Menu entries: [label key, href, required feature, badge count?]
    const groups: [string, [string, string, string, number?][]][] = [
      ['', [['shell.backendShell.dashboard', '/backend', 'backend']]],
      ['shell.backendShell.groupClub', [['shell.backendShell.sections', '/backend/club/sections', 'club_core.view'], ['shell.backendShell.places', '/backend/club/places', 'club_core.manage'], ['shell.backendShell.institutions', '/backend/club/institutions', 'club_core.manage'], ['shell.backendShell.settings', '/backend/club/settings', 'club_core.manage'], ['shell.backendShell.publication', '/backend/club/publication', 'club_core.publication.manage']]],
      ['shell.backendShell.groupPeople', [['shell.backendShell.persons', '/backend/people/persons', 'people.view']]],
      ['shell.backendShell.groupClasses', [['shell.backendShell.groups', '/backend/groups/groups', 'groups.view'], ['shell.backendShell.activities', '/backend/activities/activities', 'activities.manage'], ['shell.backendShell.occurrences', '/backend/activities/occurrences', 'activities.view', db.occurrences.filter((o) => o.status === 'planned' && !o.coach && o.date >= TODAY).length], ['shell.backendShell.units', '/backend/activities/reports/coach-units', 'activities.reports.view'], ['shell.backendShell.policies', '/backend/activities/policies', 'activities.manage']]],
      ['shell.backendShell.groupCommunication', [['shell.backendShell.threads', '/backend/communication/threads', 'communication.view']]],
      ['shell.backendShell.groupFinance', [['shell.backendShell.fees', '/backend/payments/fees', 'payments.manage'], ['shell.backendShell.charges', '/backend/payments/charges', 'payments.view'], ['shell.backendShell.bank', '/backend/payments/bank', 'payments.manage', db.bankTx.filter((bt) => bt.status === 'suggested' || bt.status === 'unmatched').length], ['shell.backendShell.orders', '/backend/payments/orders', 'payments.orders.manage', db.kitCampaigns.filter((c) => ['open', 'closed', 'ordered', 'delivered'].includes(c.status)).length], ['shell.backendShell.cashCustody', '/backend/payments/cash-custody', 'payments.cash.settle', custodians().length]]],
      ['shell.backendShell.groupFacility', [['shell.backendShell.calendar', '/backend/facilities/calendar', 'facilities.view'], ['shell.backendShell.rentals', '/backend/facilities/rentals', 'facilities.rentals.manage'], ['shell.backendShell.requests', '/backend/facilities/requests', 'facilities.rentals.approve', db.rentals.filter((r) => r.status === 'pending_approval').length], ['shell.backendShell.zones', '/backend/facilities/zones', 'facilities.manage'], ['shell.backendShell.logs', '/backend/facilities/logs', 'facilities.log.write'], ['shell.backendShell.report', '/backend/facilities/reports/owner', 'facilities.reports.view']]],
    ]
    const nav = groups.map(([g, items]) => { const vis = items.filter(([, , f]) => can(f)); return vis.length ? `<div class="nav-group">${g ? `<span>${esc(t(g))}</span>` : ''}${vis.map(([l, h, , n]) => `<a href="#${h}" class="${path === h || (h !== '/backend' && path.startsWith(h)) ? 'active' : ''}">${esc(t(l))}${n ? `<span class="count">${n}</span>` : ''}</a>`).join('')}</div>` : '' }).join('')
    return `<div class="backend"><aside class="sidebar"><div class="club">${logoBox(db.settings.logo, t('shell.backendShell.clubLogo'), 28)}<span>${esc(db.settings.name)}</span></div><nav aria-label="${esc(t('shell.backendShell.menuLabel'))}">${nav}</nav></aside>
      <div class="main"><div class="topbar"><span class="crumbs">${esc(t('shell.backendShell.crumbs', { name: t(route.name) }))}</span><div class="row small">${hasMemberRole(me()) || isCoachPersona() ? link(esc(t('shell.backendShell.memberUi')), '/club', 'btn sm') : ''}<span>${esc(personaLabel(persona()))}</span></div></div><div class="page">${content}${apiFoot(route)}</div></div></div>`
  }

  function publicShell(route: RouteDef, content: string, path: string): string {
    return `<div class="public"><header class="public-head"><a href="#/p/gwiazda" style="text-decoration:none;font-weight:700;display:flex;gap:8px;align-items:center">${logoBox(db.settings.logo, t('shell.backendShell.clubLogo'), 32)}${esc(db.settings.name)}</a>
      <nav aria-label="${esc(t('shell.publicShell.navLabel'))}"><a href="#/p/gwiazda" class="${path === '/p/gwiazda' ? 'active' : ''}">${esc(t('shell.publicShell.club'))}</a><a href="#/p/gwiazda/sections/akademia" class="${path.includes('/sections/') ? 'active' : ''}">${esc(t('shell.publicShell.sections'))}</a>${pub().places_calendar ? `<a href="#/p/gwiazda/places" class="${path.includes('/places') ? 'active' : ''}">${esc(t('shell.publicShell.facilities'))}</a>` : ''}<a href="#/login">${esc(t('shell.publicShell.signIn'))}</a></nav></header>
      <div class="public-body">${content}${apiFoot(route)}</div><footer class="public-foot"><span>${esc(t('shell.publicShell.footer', { club: db.settings.name, phone: db.settings.phone }))}</span><a href="#" data-action="todo" data-what="${esc(t('shell.publicShell.rulesTodo'))}">${esc(t('shell.publicShell.rules'))}</a><a href="#" data-action="todo" data-what="${esc(t('shell.publicShell.privacyTodo'))}">${esc(t('shell.publicShell.privacy'))}</a></footer></div>`
  }

  // API captions that are not plain endpoints are catalog keys starting with "api.".
  const apiFoot = (route: RouteDef): string => `<div class="api-foot"><b>${esc(route.id)}</b> · API: ${route.api.map((a) => `<code>${esc(a.startsWith('api.') ? t(a) : a)}</code>`).join('')}</div>`

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════
  function currentPath(): [string, URLSearchParams] {
    const h = decodeURIComponent(location.hash.slice(1)) || persona().home
    const [path, query] = h.split('?')
    return [path, new URLSearchParams(query || '')]
  }

  function render(): void {
    const [path, q] = currentPath()
    if (path === '/mail') { drawer = 'mail'; history.replaceState(null, '', `#${persona().home}`); render(); return }
    // P-05: opening the link from the e-mail confirms the request (POST …/verify/{token}).
    const vm = path.match(/^\/p\/gwiazda\/requests\/verify\/(.+)$/)
    if (vm) {
      const r = db.rentals.find((x) => x.token === vm[1])
      if (r && r.status === 'pending_verification') {
        if (conflicts(r.place, r.date, toMin(r.start), toMin(r.end), { ignore: r.id, pendingBlocks: true }).length) r.status = 'superseded'
        else { r.status = 'pending_approval'; r.holdUntil = '2026-11-12 15:30' }
      }
    }
    const m = match(path)
    const chromeEl = document.getElementById('chrome') as HTMLElement
    const stage = document.getElementById('stage') as HTMLElement
    if (!m) { stage.className = 'stage'; stage.innerHTML = `<div class="public"><div class="public-body">${empty(t('shell.render.notFound'), path, link(esc(t('shell.render.start')), persona().home))}</div></div>`; renderChrome(null); return }
    const { route, params } = m
    renderChrome(route)
    const shell = route.shell
    // Screens that require signing in
    let content: string
    const guestOk = !!route.guestOk && personaId === 'guest'
    if (route.persona !== false && !guestOk && personaId === 'guest' && shell !== 'public') content = `<div class="alert info"><strong>${esc(t('shell.render.signInTitle'))}</strong>${esc(t('shell.render.signInText'))}</div>${screenLogin()}`
    else if (shell === 'backend' && !can('backend') && !isAdmin()) content = `<div class="alert error" role="alert"><strong>${esc(t('shell.render.deniedTitle'))}</strong>${esc(t('shell.render.deniedPanel'))}</div>`
    else if (route.feature && !guestOk && !can(route.feature)) content = `<div class="alert error" role="alert"><strong>${esc(t('shell.render.deniedTitle'))}</strong>${t('shell.render.deniedFeature', { feature: `<code>${esc(route.feature)}</code>` })}</div>`
    else if (demoState === 'loading' || transientLoading) content = skeleton(shell)
    else if (demoState === 'error') content = errorView()
    else if (demoState === 'empty') { const e = route.empty || ['shell.render.emptyTitle', 'shell.render.emptyText']; content = empty(t(e[0]), t(e[1]), '', 'inbox') }
    else content = route.render(params, q)
    stage.className = `stage ${shell === 'member' ? 'member' : ''}`
    const scroll = (document.getElementById('phone-body') as HTMLElement | null)?.scrollTop || 0
    stage.innerHTML = shell === 'member' ? memberShell(route, content, path) : shell === 'backend' ? backendShell(route, content, path) : shell === 'public' ? publicShell(route, content, path) : content
    const pb = document.getElementById('phone-body'); if (pb && !navigated) pb.scrollTop = scroll
    navigated = false
    renderDrawer()
    document.title = t('shell.render.docTitle', { id: route.id, name: t(route.name) })
  }
  let navigated = false

  function renderChrome(route: RouteDef | null): void {
    const el = document.getElementById('chrome') as HTMLElement
    const [path] = currentPath()
    el.innerHTML = `<header class="chrome"><div class="chrome-row"><span class="brand">${esc(brandLabel())}</span>
      <label>${esc(t('chrome.renderChrome.persona'))} ${sel('persona', PERSONAS.map((p) => [p.id, `${personaLabel(p)} — ${personaRole(p)}`] as [string, string]), personaId, 'data-change="persona" id="persona-select"')}</label>
      <label>${esc(t('chrome.renderChrome.screenState'))} ${sel('demo', [['normal', t('chrome.renderChrome.stateNormal')], ['loading', t('chrome.renderChrome.stateLoading')], ['empty', t('chrome.renderChrome.stateEmpty')], ['error', t('chrome.renderChrome.stateError')]], demoState, 'data-change="demo"')}</label>
      <label>${esc(t('chrome.language'))} ${sel('lang', LANGS.map((c) => [c, langName(c)] as [string, string]), lang, 'data-change="lang" id="lang-select"')}</label>
      <span class="spacer"></span>
      <button type="button" data-action="drawer" data-which="flows">${esc(t('chrome.renderChrome.flows'))}</button><button type="button" data-action="drawer" data-which="screens">${esc(t('chrome.renderChrome.screens'))}</button><button type="button" data-action="drawer" data-which="mail">${esc(t('chrome.renderChrome.mailbox', { n: db.mails.length }))}</button>
      <button type="button" data-action="theme">${esc(t('chrome.renderChrome.theme'))}</button><button type="button" data-action="reset">${esc(t('chrome.renderChrome.reset'))}</button></div>
      <div class="chrome-row">${route ? `<span class="screen-id">${esc(route.id)}</span><span>${esc(t(route.name))}</span><code>${esc(path)}</code><span class="api-list">${esc(t('chrome.renderChrome.demoToday', { date: dLong(TODAY), time: NOW }))}</span>` : `<span>${esc(t('chrome.renderChrome.unknownScreen'))}</span>`}</div></header>`
    // Single-file artifact builds (build-artifact.mjs) show a mockup banner above the chrome, in the current UI language.
    const mb = document.getElementById('mock-banner')
    if (mb) mb.innerHTML = BUILD === 'dev' ? '' : t(BUILD === 'real' ? 'artifact.bannerReal' : 'artifact.bannerFictional', { club: esc(db.settings.name) })
  }

  function renderDrawer(): void {
    const host = document.getElementById('drawer') as HTMLElement
    if (!drawer) { host.innerHTML = ''; return }
    let title = '', body = ''
    if (drawer === 'flows') { title = t('drawer.renderDrawer.flowsTitle'); body = FLOWS.map((f) => `<div class="flow"><h3>${f.id} ${esc(t(f.title))}</h3><ol>${f.steps.map(([pp, href, l]) => `<li><a href="#" data-action="goto" data-persona="${pp}" data-href="${href}">${esc(t(l))}</a> <span class="small muted">— ${esc(personaLabel(PERSONAS.find((x) => x.id === pp) as Persona).split(' ')[0])}</span></li>`).join('')}</ol></div>`).join('') }
    if (drawer === 'screens') { title = t('drawer.renderDrawer.screensTitle'); const groups: [string, string][] = [['M', 'drawer.renderDrawer.groupMember'], ['B', 'drawer.renderDrawer.groupPanel'], ['P', 'drawer.renderDrawer.groupPublic']]; body = groups.map(([k, l]) => `<div class="section-title">${esc(t(l))}</div><ul class="list">${ROUTES.filter((r) => r.id.startsWith(k)).map((r) => { const sample = r.pattern.replace(':id', r.id === 'M-04' || r.id === 'M-05' ? 'a-orlm-2026-11-10' : r.id === 'M-07' ? 't-orlm' : r.id === 'M-11' ? 'pl-boisko' : r.id === 'B-05' ? 's-akad' : r.id === 'B-10' ? 'p-kasia' : r.id === 'B-12' ? 'g-orlm' : r.id === 'B-19' ? 't-uwagi' : r.id === 'M-17' || r.id === 'B-31' || r.id === 'B-32' ? 'oc-akad' : r.id === 'B-22' ? (db.charges[0] || { id: '' }).id : 'x').replace(':token', r.id === 'M-14' ? 'tok-expired' : r.id === 'M-19' ? 'kit-robert' : 'expired').replace(':slug', r.id === 'P-02' ? 'basen' : 'orlik-boisko'); const pp: PersonaId = k === 'P' ? 'guest' : k === 'B' ? 'aneta' : r.id === 'M-12' ? 'tomek' : r.id === 'M-18' ? 'wojtek' : r.id === 'M-19' ? 'guest' : r.id === 'M-15' ? 'aneta' : r.id === 'M-05' || r.id === 'M-11' ? 'wojtek' : 'kasia'; return `<li><a href="#" data-action="goto" data-persona="${pp}" data-href="${sample}"><b>${r.id}</b> ${esc(t(r.name))}</a> <code class="small">${esc(r.pattern)}</code></li>` }).join('')}</ul>`).join('') }
    if (drawer === 'mail') { title = t('drawer.renderDrawer.mailTitle', { n: db.mails.length }); body = db.mails.length ? db.mails.map((m) => `<div class="mail"><div class="small muted">${esc(t('drawer.renderDrawer.mailTo', { to: m.to }))}</div><div class="subj">${esc(txt(m.subject))}</div><pre>${esc(txt(m.body))}</pre>${m.link ? `<a class="btn sm primary" href="#" data-action="mail-link" data-href="${m.link}">${esc(m.linkLabel ? txt(m.linkLabel) : t('drawer.renderDrawer.openLink'))}</a>` : ''}</div>`).join('') : empty(t('drawer.renderDrawer.mailEmptyTitle'), t('drawer.renderDrawer.mailEmptyText')) }
    host.innerHTML = `<aside class="drawer" aria-label="${esc(title)}"><div class="drawer-head"><h2>${esc(title)}</h2><button type="button" class="btn sm" data-action="drawer-close" aria-label="${esc(t('common.close'))}">${icon('x')}</button></div><div class="drawer-body">${body}</div></aside>`
  }

  function go(href: string): void { navigated = true; transientLoading = demoState === 'normal'; if (location.hash === `#${href}`) render(); else location.hash = href; setTimeout(() => { transientLoading = false; render() }, 260) }
  function setPersona(id: PersonaId): void { personaId = id; coachCtx = true; try { sessionStorage.setItem('vereino.persona', id) } catch { /* */ } }
  // Switch the UI language: re-renders the current screen; demo data stays as it is (stored system text is Txt and re-translates).
  function setLang(code: string): void {
    if (!CATALOGS[code] || code === lang) return
    lang = code; pluralRules = new Intl.PluralRules(code); document.documentElement.lang = code
    try { localStorage.setItem('vereino.lang', code) } catch { /* storage unavailable */ }
    if (modal) closeModal()
    render()
  }

  // ═══════════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════════
  const required = (fd: FormData, names: string[], errs: Errors): void => { for (const n of names) if (!String(fd.get(n) || '').trim()) errs[n] = t('validation.required') }
  const emailOk = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
  const phoneOk = (v: string): boolean => /^(\+48)?[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}$|^\d{2}\s?\d{3}\s?\d{2}\s?\d{2}$/.test(v.trim())
  // Deferred charge label for e-mails (follows the UI language in the test mailbox), same text as chargeLabel().
  const chargeLabelTxt = (c: Charge): Txt => { const o = orderOfCharge(c); return o ? lt('charge.kitLabel', { campaign: (kitCampaign(o.campaign) as KitCampaign).name }) : lt('charge.feeLabel', { period: c.period || '' }) }

  const ACTIONS: Record<string, (el: HTMLElement, ev: Event) => void> = {
    retry: () => { demoState = 'normal'; render() },
    nav: (el) => go(el.dataset.href as string),
    goto: (el, ev) => { ev.preventDefault(); setPersona(el.dataset.persona as PersonaId); drawer = null; go(el.dataset.href as string) },
    'mail-link': (el, ev) => { ev.preventDefault(); drawer = null; go(el.dataset.href as string) },
    drawer: (el) => { const w = el.dataset.which as typeof drawer; drawer = drawer === w ? null : w; renderDrawer() },
    'drawer-close': () => { drawer = null; renderDrawer() },
    availability: (el) => availabilityModal(el.dataset.place as string),
    cash: (el) => { ui.cashPayer = el.dataset.payer || ''; openModal({ title: t('action.cash.title'), submitLabel: t('action.cash.title'), wide: true, body: cashForm(el.dataset.payer || '', true, el.dataset.charge || ''), onSubmit: (fd) => { const res = recordCash(fd); if (res) return res; render() } }) },
    'bank-sample': () => { const imp = importStatement(t('action.bankSample.file'), sampleStatement()); toast(t('action.bankSample.toast', { n: imp.total, booked: imp.booked, suggested: imp.suggested, unmatched: imp.unmatched, skipped: imp.skipped })); go('/backend/payments/bank?view=suggested') },
    'kit-share': (el) => kitShareModal(el.dataset.id as string),
    // Template = the club's own current form (campaign name, description and notes label are club content).
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
    'kit-all-groups': () => { document.querySelectorAll('[data-form="kit-campaign"] input[name="groups"]').forEach((i) => { (i as HTMLInputElement).checked = true; (i.closest('.chip') as HTMLElement).classList.add('on') }) },
    'kit-status': (el) => {
      const c = kitCampaign(el.dataset.id as string) as KitCampaign
      const to = el.dataset.to as KitCampaign['status']
      const os = kitOrders(c)
      const msgs: Record<string, string> = { open: t('action.kitStatus.open'), closed: t('action.kitStatus.closed'), ordered: t('action.kitStatus.ordered'), delivered: t('action.kitStatus.delivered', { n: os.length }), completed: t('action.kitStatus.completed') }
      const apply = (): void => {
        c.status = to
        if (to === 'delivered') for (const o of os) { const ch = chargeById(o.chargeId); mail(o.email, lt('action.kitStatus.mailSubject', { campaign: c.name }), [lt('action.kitStatus.mailBody', { child: pName(o.child) }), ch.status !== 'paid' ? lt('action.kitStatus.mailBodyDue', { amount: lm(remaining(ch)) }) : ''], `/club/orders/${c.id}`, lt('action.kitStatus.mailLink')) }
        toast(msgs[to]); render()
        if (to === 'open') setTimeout(() => kitShareModal(c.id), 50)
      }
      const missing = c.groups.flatMap((g) => group(g).members.filter((m) => !kitOrderOf(c, m))).length
      if (to === 'closed') openModal({ title: t('action.kitStatus.closeTitle'), submitLabel: t('action.kitStatus.closeSubmit'), body: `<p>${esc(t('action.kitStatus.closeIntro'))} ${missing ? t('action.kitStatus.closeMissing', { n: missing }) : esc(t('action.kitStatus.closeAllOrdered'))} ${esc(t('action.kitStatus.closeDue', { date: dShort(c.payDue) }))}</p><p class="small muted">${esc(t('action.kitStatus.closeAuto', { date: dShort(c.closes) }))}</p>`, onSubmit: () => apply() })
      else if (to === 'completed' && os.some((o) => !o.handedAt)) openModal({ title: t('action.kitStatus.completeTitle'), danger: true, submitLabel: t('action.kitStatus.completeSubmit'), body: `<div class="alert warning"><strong>${esc(t('action.kitStatus.completeNotHanded', { n: os.filter((o) => !o.handedAt).length }))}</strong>${esc(t('action.kitStatus.completeText'))}</div>`, onSubmit: () => apply() })
      else apply()
    },
    'grp-cash': (el) => {
      const child = el.dataset.child as string, gid = el.dataset.group as string
      if (!isAdmin() && !kitScope(me()).includes(gid)) { toast(t('action.grpCash.outOfScope'), true); return }
      const chs = groupCharges(gid, child).filter(coachMayCollect)
      const sum = chs.reduce((a, c) => a + remaining(c), 0)
      const settle = can('payments.cash.settle')
      openModal({ title: t('action.grpCash.title', { name: pName(child) }), submitLabel: t('action.cash.title'), body: `<div class="field" data-field="charges"><span>${esc(t('action.grpCash.forWhat'))} <b class="req">*</b></span>${chs.map((c) => `<label class="check"><input type="checkbox" name="charges" value="${c.id}" checked data-change="grp-cash-sum"><span>${esc(chargeLabel(c))} — <b>${zl(remaining(c))}</b>${c.due < TODAY ? ' ' + badge(t('action.grpCash.overdue'), 'error') : ''}<br><span class="small muted">${esc(t('action.grpCash.payer', { name: pName(c.payerPerson) }))}</span></span></label>`).join('')}</div>
        <div class="fields" style="margin-top:10px">${fld('amount', t('action.grpCash.amount'), inp('amount', 'number', String(sum / 100), 'step="0.01" min="0.01" id="grp-cash-amount"'), { req: true, hint: t('action.grpCash.amountHint') })}${fld('date', t('common.date'), inp('date', 'date', TODAY), { req: true })}</div>
        ${chk('notify', t('action.grpCash.notify'), true)}<p class="small muted">${t('action.grpCash.receivedBy', { name: `<b>${esc(pName(me()))}</b>` })} ${esc(settle ? t('action.grpCash.toClub') : t('action.grpCash.withYou'))}</p>`,
        onSubmit: (fd) => {
          const ids = fd.getAll('charges').map(String)
          const chosen = chs.filter((c) => ids.includes(c.id))
          const amt = Math.round(Number(fd.get('amount')) * 100)
          const max = chosen.reduce((a, c) => a + remaining(c), 0)
          if (!chosen.length) return { charges: t('action.grpCash.errNoCharge') }
          if (!(amt > 0)) return { amount: t('action.grpCash.errAmountZero') }
          if (amt > max) return { amount: t('action.grpCash.errAmountMax', { max: zl(max) }) }
          if (String(fd.get('date')) > TODAY) return { date: t('action.grpCash.errFutureDate') }
          const receipt = `KP/2026/11/${String(++db.receiptSeq).padStart(3, '0')}`
          let left = amt
          const paid: Record<string, Txt[]> = {}
          for (const c of chosen) {
            if (left <= 0) break
            const a = Math.min(left, remaining(c))
            c.payments.push({ amount: a, method: 'cash', date: String(fd.get('date')), by: me(), receipt, settled: settle ? 'club_cash' : undefined })
            c.status = remaining(c) <= 0 ? 'paid' : 'partially_paid'; left -= a
            ;(paid[c.payerPerson as string] ||= []).push(lt('action.grpCash.mailLine', { label: chargeLabelTxt(c), amount: lm(a) }))
          }
          if (fd.get('notify')) for (const [payer, lines] of Object.entries(paid)) { const e = personById(db, payer).email; if (e) mail(e, lt('action.grpCash.mailSubject', { receipt }), [lt('action.grpCash.mailIntro', { child: pName(child) }), '\n', ...lines.flatMap((l) => [l, '\n']), lt('action.grpCash.mailBy', { name: pName(me()) })]) }
          toast(t('action.grpCash.toast', { amount: zl(amt), child: pName(child), receipt, mailed: fd.get('notify') ? t('action.grpCash.toastMailed') : '' })); render()
        } })
    },
    'grp-remind': (el) => {
      const child = el.dataset.child as string
      const late = groupCharges(el.dataset.group as string, child).filter((c) => isOpen(c) && c.due < TODAY)
      const payers = [...new Set(late.map((c) => c.payerPerson as string))]
      for (const p of payers) { const e = personById(db, p).email; if (e) mail(e, lt('action.grpRemind.mailSubject', { child: pName(child) }), [...late.filter((c) => c.payerPerson === p).flatMap((c, i) => [i ? '\n' : '', lt('action.grpRemind.mailLine', { label: chargeLabelTxt(c), amount: lm(remaining(c)), due: ld(c.due) })]), '\n\n', lt('action.grpRemind.mailFooter', { code: payerCode(p) })], '/club/payments', lt('action.grpRemind.mailLink')) }
      toast(t('action.grpRemind.toast', { names: payers.map((p) => pName(p)).join(', ') }))
    },
    'kit-hand': (el) => {
      const o = db.kitOrders.find((x) => x.id === el.dataset.order) as KitOrder
      const c = kitCampaign(o.campaign) as KitCampaign
      if (c.status !== 'delivered') { toast(t('action.kitHand.notDelivered'), true); return }
      const ch = chargeById(o.chargeId)
      const done = (): void => { o.handedAt = `${TODAY.slice(8)}.${TODAY.slice(5, 7)} ${NOW}`; o.handedBy = me(); toast(t('action.kitHand.toast', { name: pName(o.child) })); render() }
      if (ch.status !== 'paid') openModal({ title: t('action.kitHand.unpaidTitle'), danger: true, submitLabel: t('action.kitHand.unpaidSubmit'), body: `<div class="alert warning"><strong>${esc(t('action.kitHand.unpaidDue', { amount: zl(remaining(ch)) }))}</strong>${esc(t('action.kitHand.unpaidText', { due: dShort(ch.due) }))}</div>`, onSubmit: () => done() })
      else done()
    },
    'kit-remind': (el) => {
      const c = kitCampaign(el.dataset.c as string) as KitCampaign
      const kids = (el.dataset.group ? [el.dataset.group] : c.groups).flatMap((g) => group(g).members.filter((m) => !kitOrderOf(c, m)))
      const gs = [...new Set(kids.flatMap((k) => db.guardianships.filter((x) => x.ward === k).map((x) => x.guardian)))].filter((g) => personById(db, g).email)
      for (const g of gs) mail(personById(db, g).email as string, lt('action.kitRemind.mailSubject', { campaign: c.name }), lt('action.kitRemind.mailBody', { date: ld(c.closes) }), `/club/orders/${c.id}`, lt('action.kitRemind.mailLink'))
      toast(t('action.kitRemind.toast', { guardians: t('action.kitRemind.guardians', { n: gs.length }), kids: t('action.kitRemind.kids', { n: kids.length }) }))
    },
    'kit-cancel-order': (el) => {
      const o = db.kitOrders.find((x) => x.id === el.dataset.order) as KitOrder
      const ch = chargeById(o.chargeId)
      if (paidOf(ch) > 0) { toast(t('action.kitCancelOrder.alreadyPaid', { amount: zl(paidOf(ch)) }), true); return }
      openModal({ title: t('action.kitCancelOrder.title'), danger: true, submitLabel: t('action.kitCancelOrder.submit'), body: `<p>${esc(t('action.kitCancelOrder.text', { child: personById(db, o.child).first, amount: zl(ch.amount), date: dShort((kitCampaign(o.campaign) as KitCampaign).closes) }))}</p>`, onSubmit: () => { o.status = 'cancelled'; ch.status = 'cancelled'; toast(t('action.kitCancelOrder.toast')); render() } })
    },
    'cash-settle': (el) => {
      const person = el.dataset.person as string
      const items = custodyOf(person)
      openModal({ title: t('action.cashSettle.title', { name: pName(person) }), submitLabel: t('action.cashSettle.submit'), wide: true, body: `<p class="small">${esc(t('action.cashSettle.intro'))}</p><div class="field" data-field="pays"><span>${esc(t('action.cashSettle.payments'))} <b class="req">*</b></span>${items.map((it, i) => `<label class="check"><input type="checkbox" name="pays" value="${i}" checked><span>${esc(it.x.receipt || '—')} · ${esc(txt(it.c.description))} · ${dShort(it.x.date)} — <b>${zl(it.x.amount)}</b></span></label>`).join('')}</div>`,
        onSubmit: (fd) => {
          const idx = fd.getAll('pays').map(Number)
          if (!idx.length) return { pays: t('action.cashSettle.errNone') }
          const number = `RG/2026/11/${String(db.cashHandovers.length + 1).padStart(3, '0')}`
          const amount = idx.reduce((a, i) => a + items[i].x.amount, 0)
          for (const i of idx) items[i].x.settled = number
          db.cashHandovers.unshift({ id: uid('rg'), number, collector: person, at: `${TODAY} ${NOW}`, by: me(), amount, count: idx.length })
          toast(t('action.cashSettle.toast', { number, amount: zl(amount), name: pName(person) })); render()
        } })
    },
    'tx-confirm': (el) => { const bt = db.bankTx.find((x) => x.id === el.dataset.id) as BankTx; bookTx(bt); bt.auto = false; toast(t('action.txConfirm.toast', { amount: zl(bt.amount), payer: pName(bt.payer) })); render() },
    'tx-ignore': (el) => { const bt = db.bankTx.find((x) => x.id === el.dataset.id) as BankTx; openModal({ title: t('action.txIgnore.title'), submitLabel: t('action.txIgnore.submit'), body: `<p class="small">${t('action.txIgnore.intro', { sender: esc(bt.sender), amount: zl(bt.amount), title: esc(bt.title) })}</p>${fld('reason', t('common.reason'), sel('reason', (['donation', 'grant', 'refund', 'other'] as const).map((r) => [r, t(`action.txIgnore.reason.${r}`)] as [string, string])))}`, onSubmit: (fd) => { bt.status = 'ignored'; bt.reason = lt('action.txIgnore.reasonText', { reason: lt(`action.txIgnore.reason.${String(fd.get('reason'))}`) }); toast(t('action.txIgnore.toast')); render() } }) },
    'tx-undo': (el) => { const bt = db.bankTx.find((x) => x.id === el.dataset.id) as BankTx; if (bt.status === 'booked') unbookTx(bt); matchTx(bt); if (bt.status === 'booked') bt.status = 'suggested'; bt.auto = false; toast(t('action.txUndo.toast')); render() },
    'tx-assign': (el) => {
      const bt = db.bankTx.find((x) => x.id === el.dataset.id) as BankTx
      const ps = payers().sort((a, b) => personById(db, a).last.localeCompare(personById(db, b).last, 'pl'))
      openModal({ title: t('action.txAssign.title', { amount: zl(bt.amount) }), submitLabel: t('action.txAssign.submit'), wide: true, body: `<p class="small"><b>${esc(bt.sender)}</b> — „${esc(bt.title)}”, ${dShort(bt.date)}</p>${fld('payer', t('common.payer'), sel('payer', [['', t('common.choose')], ...ps.map((x) => [x, t('action.txAssign.payerOption', { last: personById(db, x).last, first: personById(db, x).first, code: payerCode(x), open: zl(openOf(x).reduce((a, c) => a + remaining(c), 0)) })] as [string, string])], bt.payer || ''), { req: true, hint: t('action.txAssign.payerHint') })}`,
        onSubmit: (fd) => { const pid = String(fd.get('payer') || ''); if (!pid) return { payer: t('action.txAssign.errChoosePayer') }; if (!openOf(pid).length) return { payer: t('action.txAssign.errNoOpen') }; bt.payer = pid; bt.alloc = []; let left = bt.amount; for (const c of openOf(pid)) { if (left <= 0) break; const a = Math.min(left, remaining(c)); bt.alloc.push({ chargeId: c.id, amount: a }); left -= a } bookTx(bt); bt.auto = false; bt.reason = left > 0 ? [lt('action.txAssign.reasonManual'), lt('action.txAssign.reasonOverpay', { amount: lm(left) })] : lt('action.txAssign.reasonManual'); toast(left > 0 ? t('action.txAssign.toastOverpay', { amount: zl(bt.amount - left), overpay: zl(left) }) : t('action.txAssign.toast', { amount: zl(bt.amount - left) })); render() } })
    },
    'avail-days': (el) => { const set = (el.dataset.set || '').split(',').filter(Boolean); document.querySelectorAll('#modal input[name="days"]').forEach((i) => { const c = i as HTMLInputElement; c.checked = set.includes(c.value); (c.closest('.chip') as HTMLElement).classList.toggle('on', c.checked) }) },
    'availability-clear-day': (el) => { const pid = el.dataset.place as string, d = Number(el.dataset.day); for (const rule of db.zones[pid]) if (rule.zone === 'reservable_paid') rule.days = rule.days.filter((x) => x !== d); db.zones[pid] = db.zones[pid].filter((rule) => rule.days.length); toast(t('action.availabilityClearDay.toast', { day: wdLong(d % 7) })); render() },
    'logo-remove': (el) => { const target = el.dataset.target as string; if (target === 'club') { db.settings.logo = undefined; toast(t('action.logoRemove.toastClub')) } else { section(target).logo = undefined; toast(t('action.logoRemove.toastSection')) } render() },
    'copy-csv': () => { const ta = document.getElementById('csv-text') as HTMLTextAreaElement; const fallback = (): void => { ta.focus(); ta.select(); toast(t('action.copyCsv.selected')) }; try { navigator.clipboard.writeText(ta.value).then(() => toast(t('action.copyCsv.copied')), fallback) } catch { fallback() } },
    theme: () => { const cur = document.documentElement.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); const next = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; try { localStorage.setItem('vereino.theme', next) } catch { /* */ } },
    reset: () => { db = seed(); for (const k of Object.keys(ui)) delete ui[k]; toast(t('action.reset.toast')); render() },
    'close-modal': () => closeModal(),
    overlay: (el, ev) => { if (ev.target === el) closeModal() },
    todo: (el, ev) => { ev.preventDefault(); toast(t('action.todo.toast', { what: el.dataset.what || t('action.todo.defaultWhat') })) },
    logout: () => { setPersona('guest'); go('/login') },
    'fill-login': (el, ev) => { ev.preventDefault(); const f = document.querySelector('[data-form="login"]') as HTMLFormElement; (f.elements.namedItem('email') as HTMLInputElement).value = el.dataset.email as string; (f.elements.namedItem('password') as HTMLInputElement).value = 'demo1234'; (f.elements.namedItem('password') as HTMLInputElement).focus() },
    declare: (el) => declare(el.dataset.occ as string, el.dataset.person as string, el.dataset.val as 'yes' | 'no'),
    'guardian-decide': (el) => {
      const a = db.attendance[el.dataset.occ as string][el.dataset.person as string]
      a.status = el.dataset.val === 'yes' ? 'final' : 'rejected_by_guardian'
      toast(el.dataset.val === 'yes' ? t('action.guardianDecide.confirmed') : t('action.guardianDecide.rejected')); render()
    },
    absence: (el) => {
      const o = occById(el.dataset.occ as string) as Occurrence
      openModal({ title: t('action.absence.title'), submitLabel: t('action.absence.submit'), body: `<p class="small">${t('action.absence.intro', { name: esc(o.name), date: dShort(o.date), start: o.start })}</p>${fld('reason', t('action.absence.reasonOptional'), area('reason', '', 'maxlength="200"'))}`,
        onSubmit: (fd) => { db.substitutions.push({ occ: o.id, prev: o.coach, next: null, kind: 'absence_reported', at: `${TODAY} ${NOW}`, by: me(), reason: String(fd.get('reason') || '') }); o.coach = null; o.updatedAt++; toast(t('action.absence.toast')); render() } })
    },
    'cancel-occ': (el) => {
      const o = occById(el.dataset.occ as string) as Occurrence
      openModal({ title: t('action.cancelOcc.title'), danger: true, submitLabel: t('action.cancelOcc.title'), body: `<div class="alert warning"><strong>${esc(o.name)}, ${dShort(o.date)} ${o.start}</strong>${t('action.cancelOcc.notice')}</div>${fld('reason', t('common.reason'), area('reason', '', 'maxlength="200"'), { req: true, hint: t('action.cancelOcc.reasonHint') })}`,
        onSubmit: (fd) => {
          const reason = String(fd.get('reason') || '').trim()
          if (reason.length < 3) return { reason: t('action.cancelOcc.errReason') }
          o.status = 'cancelled'; o.cancelReason = reason; o.updatedAt++
          const g = group(o.group)
          const recips = [...new Set([...g.members.flatMap((m) => { const p = personById(db, m); return ageOn(p.birth) >= 13 && p.account ? [m] : [] }), ...g.members.flatMap((m) => db.guardianships.filter((x) => x.ward === m).map((x) => x.guardian)), ...g.coaches])]
          db.threads.unshift({ id: uid('t'), scope: 'occurrence', scopeId: o.id, scopeLabel: lt('thread.scope.occurrence', { name: o.name, date: ld(o.date) }), subject: lt('action.cancelOcc.threadSubject', { name: o.name, date: ld(o.date), start: o.start }), isCase: false, readBy: [me()], messages: [{ id: uid('m'), author: me(), role: 'coach', body: lt('action.cancelOcc.threadBody', { date: ld(o.date), start: o.start, reason }), at: `${TODAY} ${NOW}`, delivered: recips.length, failed: 0 }] })
          mail('kasia.nowak@example.pl', lt('action.cancelOcc.mailSubject', { name: o.name, date: ld(o.date), start: o.start }), lt('action.cancelOcc.mailBody', { reason }), '/club/messages', lt('action.cancelOcc.mailLink'))
          toast(t('action.cancelOcc.toast', { n: recips.length })); render()
        } })
    },
    mark: (el) => {
      const occ = el.dataset.occ as string, p = el.dataset.person as string
      db.attendance[occ] ||= {}
      db.attendance[occ][p] = { ...(db.attendance[occ][p] || { declared: 'unknown', status: 'final' }), actual: el.dataset.val as 'present' }
      render()
    },
    'mark-declared': (el) => {
      const occ = el.dataset.occ as string
      const g = group((occById(occ) as Occurrence).group)
      db.attendance[occ] ||= {}
      for (const m of g.members) { const a = db.attendance[occ][m]; if (a?.declared === 'yes' && !a.actual) a.actual = 'present' }
      toast(t('action.markDeclared.toast')); render()
    },
    'complete-occ': (el) => {
      const o = occById(el.dataset.occ as string) as Occurrence
      const att = db.attendance[o.id] || {}
      const missing = group(o.group).members.filter((m) => !att[m]?.actual).length
      openModal({ title: t('action.completeOcc.title'), submitLabel: t('action.completeOcc.submit'), body: `<p>${missing ? `${t('action.completeOcc.missing', { n: missing })} ` : ''}${!ended(o) ? `${t('action.completeOcc.notEnded')} ` : ''}${t('action.completeOcc.unitCredited', { coach: esc(pName(o.coach)) })}</p>`,
        onSubmit: () => { for (const m of group(o.group).members) { db.attendance[o.id] ||= {}; db.attendance[o.id][m] = { ...(db.attendance[o.id][m] || { declared: 'unknown', status: 'final' }), actual: db.attendance[o.id][m]?.actual || 'absent' } } o.status = 'done'; o.updatedAt++; const present = Object.values(db.attendance[o.id]).filter((a) => a.actual !== 'absent').length; toast(t('action.completeOcc.toast', { n: present })); go('/club') } })
    },
    'new-thread': (el) => {
      const pid = me()
      // Scope options keep a Txt label: it becomes the thread's scope label and follows the UI language.
      const opts: [string, Txt][] = []
      const pre = el.dataset.scope || ''
      for (const gid of coachedGroups(pid)) opts.push([`group:${gid}`, lt('thread.scope.group', { name: group(gid).name })])
      for (const sid of coordSections(pid)) opts.push([`section:${sid}`, lt('thread.scope.section', { name: section(sid).name })])
      if (isAdmin()) opts.push(['club:club', lt('thread.scope.club')])
      if (pre.startsWith('occurrence:')) { const o = occById(pre.split(':')[1]) as Occurrence; opts.unshift([pre, lt('thread.scope.occurrence', { name: o.name, date: ld(o.date) })]) }
      openModal({ title: t('action.newThread.title'), submitLabel: t('common.send'), body: `${fld('scope', t('action.newThread.to'), sel('scope', [['', t('common.choose')], ...opts.map(([v, l]) => [v, txt(l)] as [string, string])], pre), { req: true, hint: t('action.newThread.toHint') })}${fld('subject', t('action.newThread.subject'), inp('subject', 'text', '', 'maxlength="120"'), { req: true })}${fld('body', t('action.newThread.body'), area('body', '', 'maxlength="5000"'), { req: true })}`,
        onSubmit: (fd) => {
          const errs: Errors = {}; required(fd, ['scope', 'subject', 'body'], errs)
          if (String(fd.get('subject') || '').trim().length && String(fd.get('subject')).trim().length < 3) errs.subject = t('action.newThread.errSubject')
          if (Object.keys(errs).length) return errs
          const [kind, id] = String(fd.get('scope')).split(':')
          const label: Txt = opts.find((o) => o[0] === fd.get('scope'))?.[1] || ''
          const count = kind === 'club' ? 41 : kind === 'section' ? db.groups.filter((g) => g.section === id).reduce((s, g) => s + g.members.length + 2, 0) : kind === 'group' ? group(id).members.length + 2 : 8
          const th: Thread = { id: uid('t'), scope: kind as Thread['scope'], scopeId: id, scopeLabel: label, subject: String(fd.get('subject')), isCase: false, readBy: [pid], messages: [{ id: uid('m'), author: pid, role: isAdmin() ? 'admin' : 'coach', body: String(fd.get('body')), at: `${TODAY} ${NOW}`, delivered: count, failed: 0 }] }
          db.threads.unshift(th)
          mail('kasia.nowak@example.pl', String(fd.get('subject')), String(fd.get('body')), `/club/messages/${th.id}`, lt('action.newThread.mailLink'))
          toast(t('action.newThread.toast', { n: count }))
          go(location.hash.includes('/backend') ? `/backend/communication/threads/${th.id}` : `/club/messages/${th.id}`)
        } })
    },
    'share-text': (el) => {
      const th = db.threads.find((x) => x.id === el.dataset.thread) as Thread
      const occId = th.scope === 'occurrence' ? th.scopeId : (db.occurrences.find((o) => o.group === th.scopeId && o.date >= TODAY && o.status === 'planned') || { id: '' }).id
      // One source of truth: the session's date, gathering time, place and map link come from the session, not from the message.
      // Only for a thread about one session: a group thread's "next session" may not be the one the message is about.
      const so = th.scope === 'occurrence' ? occById(occId) : undefined
      const whenWhere = so ? `\n${t('action.shareText.whenWhere', { name: so.name, date: dShort(so.date), gather: so.gather ? `${t('m.occCard.gather', { time: so.gather })} · ` : '', start: so.start, place: placeName(db, so.place), map: mapUrl(db, so.place) })}` : ''
      const text = `${txt(th.subject)}\n${txt(th.messages[th.messages.length - 1].body)}\n${whenWhere}\n${t('action.shareText.detailsLine', { url: `https://gwiazda.vereino.example/club/link?occ=${occId}` })}`
      try { navigator.clipboard.writeText(text).catch(() => undefined) } catch { /* clipboard unavailable */ }
      openModal({ title: t('action.shareText.title'), submitLabel: t('action.shareText.done'), body: `<div class="alert success"><strong>${t('action.shareText.copied')}</strong>${t('action.shareText.copiedText')}</div><textarea readonly rows="6" style="width:100%">${esc(text)}</textarea><p class="small"><a href="#/club/link?occ=${occId}" data-action="close-modal">${t('action.shareText.preview')}</a></p>`, onSubmit: () => undefined })
    },
    'mark-case': (el) => {
      const th = db.threads.find((x) => x.id === el.dataset.thread) as Thread
      openModal({ title: t('action.markCase.title'), danger: true, submitLabel: t('action.markCase.submit'), body: `<div class="alert warning"><strong>${t('action.markCase.irreversible')}</strong>${t('action.markCase.text')}</div>`,
        onSubmit: () => { th.isCase = true; toast(t('action.markCase.toast')); render() } })
    },
    'delete-msg': (el) => {
      const th = db.threads.find((x) => x.id === el.dataset.thread) as Thread
      if (th.isCase) { toast(t('action.deleteMsg.immutable'), true); return }
      th.messages = th.messages.filter((m) => m.id !== el.dataset.msg)
      if (!th.messages.length) db.threads = db.threads.filter((x) => x !== th)
      toast(t('action.deleteMsg.toast')); th.messages.length ? render() : go('/backend/communication/threads')
    },
    'stripe-pay': (el) => {
      const ids = (el.dataset.ids as string).split(',')
      const mode = el.dataset.mode as string
      if (mode === 'paid') { for (const c of db.charges.filter((x) => ids.includes(x.id))) { c.payments.push({ amount: remaining(c), method: 'online', date: TODAY, ref: 'pi_3Q…' }); c.status = 'paid' } mail(persona().email || '', lt('action.stripePay.mailSubject'), lt('action.stripePay.mailBody', { n: ids.length })) }
      go(`/club/payments/return?status=${mode}&ids=${ids.join(',')}`)
    },
    'pay-refresh': (el) => { const ids = (el.dataset.ids as string).split(','); for (const c of db.charges.filter((x) => ids.includes(x.id))) { c.payments.push({ amount: remaining(c), method: 'online', date: TODAY }); c.status = 'paid' } go(`/club/payments/return?status=paid&ids=${ids.join(',')}`) },
    slot: (el) => slotModal(el.dataset.place as string, el.dataset.date as string, Number(el.dataset.hour)),
    'cancel-booking': (el, ev) => { ev.stopPropagation(); const b = db.bookings.find((x) => x.id === el.dataset.id) as Booking; b.status = 'cancelled'; toast(t('action.cancelBooking.toast')); render() },
    'open-facility': () => openModal({ title: t('action.openFacility.title'), submitLabel: t('action.openFacility.submit'), body: fld('before', t('action.openFacility.before'), area('before', '', `placeholder="${esc(t('action.openFacility.beforePlaceholder'))}"`), { req: true }), onSubmit: (fd) => { const v = String(fd.get('before') || '').trim(); if (v.length < 3) return { before: t('action.openFacility.errState') }; db.log.opened = true; db.log.before = v; db.log.openedAt = NOW; db.logs.unshift({ id: uid('lg'), date: TODAY, operator: me(), opened: NOW, before: v }); toast(t('action.openFacility.toast', { time: NOW })); render() } }),
    'close-facility': () => openModal({ title: t('action.closeFacility.title'), submitLabel: t('common.close'), body: `${fld('after', t('action.closeFacility.after'), area('after'), { req: true })}${fld('remarks', t('common.notes'), area('remarks'))}`, onSubmit: (fd) => { const v = String(fd.get('after') || '').trim(); if (v.length < 3) return { after: t('action.openFacility.errState') }; db.log.closed = true; db.logs[0].closed = '21:15'; db.logs[0].after = v; toast(t('action.closeFacility.toast')); render() } }),
    incident: () => openModal({ title: t('action.incident.title'), submitLabel: t('action.incident.submit'), body: `<div class="fields">${fld('kind', t('common.kind'), sel('kind', [['', t('common.choose')], ...(['rules_violation', 'damage', 'injury', 'other'] as const).map((k) => [k, t(`incident.kind.${k}`)] as [string, string])]), { req: true })}${fld('action', t('action.incident.actionTaken'), sel('action', (['warning', 'removal', 'booking_cancelled', 'police_called'] as const).map((k) => [k, t(`incident.action.${k}`)] as [string, string])))}</div>${fld('description', t('common.description'), area('description'), { req: true, hint: t('action.incident.descriptionHint') })}${fld('photo', t('action.incident.photo'), inp('photo', 'file', '', 'accept="image/*"'))}`,
      onSubmit: (fd) => { const errs: Errors = {}; required(fd, ['kind'], errs); if (String(fd.get('description') || '').trim().length < 10) errs.description = t('action.incident.errDescription'); if (Object.keys(errs).length) return errs; db.incidents.unshift({ id: uid('in'), date: TODAY, place: 'pl-boisko', kind: String(fd.get('kind')), description: String(fd.get('description')), action: String(fd.get('action')), by: me() }); toast(t('action.incident.toast')); render() } }),
    'no-show': (el) => { const r = db.rentals.find((x) => x.id === el.dataset.id) as Rental; if (!started(r)) { toast(t('action.noShow.tooEarly'), true); return } r.status = 'no_show'; toast(t('action.noShow.toast')); render() },
    'token-declare': (el) => { const tok = db.tokens[el.dataset.token as string]; db.attendance[tok.occ] ||= {}; db.attendance[tok.occ][el.dataset.person as string] = { declared: el.dataset.val as 'yes', status: 'final', by: tok.guardian }; toast(t('action.tokenDeclare.toast')); render() },
    'public-request': (el) => publicRequestModal(el.dataset.place as string, el.dataset.date as string, Number(el.dataset.from), Number(el.dataset.to)),
    approve: (el) => {
      const r = db.rentals.find((x) => x.id === el.dataset.id) as Rental
      // The facility owner (municipality) and its bank account come from the institutions register.
      const owner = db.institutions.find((i) => i.type === 'municipality') || { name: '—', bank: '—' }
      openModal({ title: t('action.approve.title', { renter: r.renter }), submitLabel: t('action.approve.submit'), body: `<p class="small">${t('action.approve.intro', { place: esc(placeName(db, r.place)), date: dShort(r.date), start: r.start, end: r.end, owner: esc(owner.name) })}</p>
        ${fld('renterId', t('action.approve.renterRecord'), sel('renterId', [['new', t('action.approve.createInstitution', { name: r.renter })], ...db.institutions.map((i) => [i.id, i.name] as [string, string])], 'new'), { req: true })}
        <div class="fields">${fld('amount', t('common.amountPln'), inp('amount', 'number', String(r.amount / 100), 'min="0" step="1"'), { hint: t('action.approve.fromRates', { amount: zl(r.amount) }) })}${fld('note', t('action.approve.note'), inp('note', 'text'), { hint: t('action.approve.noteHint') })}</div>`,
        onSubmit: (fd) => {
          const amt = Math.round(Number(fd.get('amount')) * 100)
          if (!(amt >= 0)) return { amount: t('action.approve.errAmount') }
          if (amt !== r.amount && !String(fd.get('note') || '').trim()) return { note: t('action.approve.errNote') }
          if (conflicts(r.place, r.date, toMin(r.start), toMin(r.end), { ignore: r.id }).length) return { _: t('action.approve.errConflict') }
          if (fd.get('renterId') === 'new') db.institutions.push({ id: uid('i'), name: r.renter, type: 'club', contact: `${r.contact}, ${r.phone}` })
          r.amount = amt; r.status = 'requested'; r.renterId = String(fd.get('renterId')); rentalCharge(db, r)
          mail(r.email, lt('action.approve.mailSubject', { place: placeName(db, r.place), date: ld(r.date) }), lt('action.approve.mailBody', { amount: lm(r.amount), owner: owner.name, account: owner.bank || '—', payBy: ld(addDays(r.date, -3)), freeCancel: ld(addDays(r.date, -1)), start: r.start }))
          toast(t('action.approve.toast')); render()
        } })
    },
    reject: (el) => {
      const r = db.rentals.find((x) => x.id === el.dataset.id) as Rental
      openModal({ title: t('action.reject.title', { renter: r.renter }), danger: true, submitLabel: t('action.reject.submit'), body: fld('reason', t('action.reject.reason'), area('reason', '', 'maxlength="500"'), { req: true, hint: t('action.reject.reasonHint') }),
        onSubmit: (fd) => { const v = String(fd.get('reason') || '').trim(); if (v.length < 5) return { reason: t('action.reject.errReason') }; r.status = 'rejected'; r.reason = v; mail(r.email, lt('action.reject.mailSubject'), lt('action.reject.mailBody', { reason: v })); toast(t('action.reject.toast')); render() } })
    },
    'rental-confirm': (el) => { const r = db.rentals.find((x) => x.id === el.dataset.id) as Rental; const c = db.charges.find((x) => x.id === r.chargeId); if (c) { c.payments.push({ amount: remaining(c), method: 'transfer', date: TODAY }); c.status = 'paid' } r.status = 'confirmed'; toast(t('action.rentalConfirm.toast')); render() },
    'rental-cancel': (el) => {
      const r = db.rentals.find((x) => x.id === el.dataset.id) as Rental
      const deadline = addDays(r.date, -1)
      const late = TODAY > deadline || (TODAY === deadline && toMin(NOW) > toMin(r.start))
      openModal({ title: t('action.rentalCancel.title'), danger: true, submitLabel: t('action.rentalCancel.submit'), body: `<div class="alert ${late ? 'error' : 'info'}"><strong>${late ? t('action.rentalCancel.lateTitle') : t('action.rentalCancel.freeTitle')}</strong>${late ? t('action.rentalCancel.lateText') : t('action.rentalCancel.freeText')}</div>`,
        onSubmit: () => { r.status = late ? 'cancelled_late' : 'cancelled_free'; const c = db.charges.find((x) => x.id === r.chargeId); if (c) c.status = late ? 'forfeited' : 'cancelled'; toast(t('action.rentalCancel.toast')); render() } })
    },
    'assign-coach': (el) => {
      const o = occById(el.dataset.occ as string) as Occurrence
      const coaches = db.persons.filter((p) => db.roles.some((r) => r.person === p.id && r.role === 'coach') && p.id !== o.coach)
      const busy = (pid: string): string | null => { const c = db.occurrences.find((x) => x.id !== o.id && x.coach === pid && x.date === o.date && x.status !== 'cancelled' && overlap(toMin(o.start), toMin(o.end), toMin(x.start), toMin(x.end))); return c ? `${c.name} ${c.start}` : null }
      openModal({ title: t('action.assignCoach.title', { name: o.name, date: dShort(o.date), start: o.start }), submitLabel: t('action.assignCoach.submit'), body: `<div class="stack" role="radiogroup" aria-label="${esc(t('action.assignCoach.coach'))}">${coaches.map((p) => { const b = busy(p.id); return `<label class="check card" style="margin:0"><input type="radio" name="coach" value="${p.id}" ${b ? 'disabled' : ''}><span><b>${esc(p.first)} ${esc(p.last)}</b><br><span class="small muted">${b ? t('action.assignCoach.busy', { what: esc(b) }) : t('action.assignCoach.free')}</span></span></label>` }).join('')}</div><div data-field="coach"></div>${fld('reason', t('action.absence.reasonOptional'), inp('reason'))}`,
        onSubmit: (fd) => { const c = String(fd.get('coach') || ''); if (!c) return { coach: t('action.assignCoach.errChoose') }; db.substitutions.push({ occ: o.id, prev: o.coach, next: c, kind: 'substitute_assigned', at: `${TODAY} ${NOW}`, by: me(), reason: String(fd.get('reason') || '') }); o.coach = c; o.updatedAt++; toast(t('action.assignCoach.toast', { name: pName(c) })); render() } })
    },
    'units-csv': (el) => { const rows = unitsReport(el.dataset.month as string); const csv = [t('action.unitsCsv.header'), ...rows.map((r) => `${pName(r.coach)};${r.planned};${r.given};${r.taken};${r.balance};${r.matches};${r.amount === null ? '' : (r.amount / 100).toFixed(2)}`)].join('\n'); csvModal(t('action.unitsCsv.fileName', { month: el.dataset.month as string }), csv) },
    'report-csv': (el) => { const r = ownerReport(el.dataset.place as string, el.dataset.month as string); const csv = [t('action.reportCsv.header'), `${t('action.reportCsv.publicHours')};${Math.round(r.zones.public_free)}`, `${t('action.reportCsv.clubTrainingHours')};${Math.round(r.zones.club_training)}`, `${t('action.reportCsv.actualClubTime')};${r.clubHours.toFixed(1)}`, `${t('action.reportCsv.rentableHours')};${Math.round(r.zones.reservable_paid)}`, `${t('action.reportCsv.rentals')};${r.rentals.length}`, `${t('action.reportCsv.ownerPayments')};${(r.paid / 100).toFixed(2)}`, `${t('action.reportCsv.incidents')};${r.incidents}`, `${t('action.reportCsv.maintenance')};${r.maintenance}`].join('\n'); csvModal(t('action.reportCsv.fileName'), csv) },
    generate: () => openModal({ title: t('action.generate.title'), submitLabel: t('action.generate.submit'), body: `<p class="small">${t('action.generate.intro')}</p>${fld('period', t('common.period'), inp('period', 'month', '2026-12'), { req: true })}`,
      onSubmit: (fd) => { const p = String(fd.get('period') || ''); if (!/^\d{4}-\d{2}$/.test(p)) return { period: t('action.generate.errMonth') }; if (p < '2025-11') return { period: t('action.generate.errTooOld') }; const res = generateCharges(db, p); ui.genResult = JSON.stringify({ period: p, ...res }); toast(t('action.generate.toast', { period: p, created: res.created, skipped: res.skipped })); render() } }),
    'record-payment': (el) => {
      const c = db.charges.find((x) => x.id === el.dataset.id) as Charge
      openModal({ title: t('action.recordPayment.title'), submitLabel: t('action.recordPayment.submit'), body: `<p class="small">${t('action.recordPayment.remaining', { amount: zl(remaining(c)) })}</p><div class="fields">${fld('amount', t('common.amountPln'), inp('amount', 'number', String(remaining(c) / 100), 'step="0.01" min="0.01"'), { req: true })}${fld('method', t('action.recordPayment.method'), sel('method', [['cash', t('pay.method.cash')], ['transfer', t('pay.method.transfer')]]), { req: true })}${fld('date', t('action.recordPayment.date'), inp('date', 'date', TODAY), { req: true })}${fld('ref', t('action.recordPayment.ref'), inp('ref'))}</div>`,
        onSubmit: (fd) => { const amt = Math.round(Number(fd.get('amount')) * 100); const errs: Errors = {}; if (!(amt > 0)) errs.amount = t('action.recordPayment.errPositive'); else if (amt > remaining(c)) errs.amount = t('action.recordPayment.errTooMuch', { amount: zl(remaining(c)) }); if (String(fd.get('date')) > TODAY) errs.date = t('action.recordPayment.errFuture'); if (Object.keys(errs).length) return errs; c.payments.push({ amount: amt, method: String(fd.get('method')) as Pay['method'], date: String(fd.get('date')), ref: String(fd.get('ref') || '') }); c.status = remaining(c) <= 0 ? 'paid' : 'partially_paid'; c.updatedAt++; toast(c.status === 'paid' ? t('action.recordPayment.toastPaid') : t('action.recordPayment.toastPartial')); render() } })
    },
    'cancel-charge': (el) => { const c = db.charges.find((x) => x.id === el.dataset.id) as Charge; openModal({ title: t('action.cancelCharge.title'), danger: true, submitLabel: t('action.cancelCharge.submit'), body: `<p>${esc(t('action.cancelCharge.body'))}</p>`, onSubmit: () => { c.status = 'cancelled'; toast(t('action.cancelCharge.done')); render() } }) },
    'new-fee': () => openModal({ title: t('action.newFee.title'), body: `<div class="fields">${fld('name', t('common.name'), inp('name'), { req: true })}${fld('group', t('common.group'), sel('group', [['', '—'], ...db.groups.map((g) => [g.id, g.name] as [string, string])]))}${fld('activity', t('action.newFee.orActivity'), sel('activity', [['', '—'], ...db.activities.map((a) => [a.id, a.name] as [string, string])]))}${fld('amount', t('common.amountPln'), inp('amount', 'number', '', 'min="1"'), { req: true })}${fld('dueDay', t('action.newFee.dueDay'), inp('dueDay', 'number', '10', 'min="1" max="28"'), { req: true })}</div>`,
      onSubmit: (fd) => { const errs: Errors = {}; required(fd, ['name', 'amount'], errs); const g = String(fd.get('group')), a = String(fd.get('activity')); if (!!g === !!a) errs.group = t('action.newFee.errGroupOrActivity'); if (Number(fd.get('amount')) <= 0) errs.amount = t('action.newFee.errAmount'); const d = Number(fd.get('dueDay')); if (!(d >= 1 && d <= 28)) errs.dueDay = t('action.newFee.errDueDay'); if (Object.keys(errs).length) return errs; db.fees.push({ id: uid('f'), name: String(fd.get('name')), group: g || db.activities.find((x) => x.id === a)!.group, amount: Number(fd.get('amount')) * 100, dueDay: d, period: 'monthly' }); toast(t('action.newFee.done')); render() } }),
    'new-closure': () => openModal({ title: t('action.newClosure.title'), body: `<div class="fields">${fld('place', t('common.place'), sel('place', [['pl-boisko', placeName(db, 'pl-boisko')], ['pl-multi', placeName(db, 'pl-multi')]]), { req: true })}${fld('date', t('common.day'), inp('date', 'date', '2026-11-12'), { req: true })}${fld('start', t('common.from'), inp('start', 'time', '08:00'), { req: true })}${fld('end', t('common.to'), inp('end', 'time', '22:00'), { req: true })}${fld('reason', t('common.reason'), sel('reason', [['snow', t('closure.reason.snow')], ['maintenance', t('closure.reason.maintenance')], ['municipal_event', t('closure.reason.municipal_event')], ['school', t('closure.reason.school')], ['other', t('closure.reason.other')]]))}</div>${fld('note', t('common.description'), inp('note'))}`,
      onSubmit: (fd) => { const s = String(fd.get('start')), e = String(fd.get('end')); if (toMin(e) <= toMin(s)) return { end: t('action.newClosure.errEndAfterStart') }; const pl = String(fd.get('place')), d = String(fd.get('date')); const hit = occupancy(pl, d).filter((o) => overlap(toMin(s), toMin(e), o.from, o.to)); db.closures.push({ id: uid('cl'), place: pl, date: d, start: s, end: e, reason: String(fd.get('reason')), note: String(fd.get('note') || '') }); toast(t('action.newClosure.saved', { sessions: t('action.newClosure.sessions', { n: hit.filter((h) => h.kind === 'occ').length }), rentals: t('action.newClosure.rentals', { n: hit.filter((h) => h.kind === 'rent').length }) })); render() } }),
    'new-section': () => openModal({ title: t('action.newSection.title'), body: `${fld('name', t('common.name'), inp('name'), { req: true, hint: t('action.newSection.nameHint') })}${fld('coordinator', t('action.newSection.coordinator'), sel('coordinator', [['', t('action.newSection.later')], ...db.persons.filter((p) => ageOn(p.birth) >= 18).map((p) => [p.id, `${p.first} ${p.last}`] as [string, string])]))}`,
      onSubmit: (fd) => { const n = String(fd.get('name') || '').trim(); if (n.length < 2) return { name: t('action.newSection.errName') }; if (db.sections.some((s) => s.name.toLowerCase() === n.toLowerCase())) return { name: t('action.newSection.errExists') }; const id = uid('s'); db.sections.push({ id, name: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), short: '', description: '', isPublic: false, conditions: '', contactName: '', contactEmail: '', contactPhone: '', materials: [], active: true, color: 'dodat', updatedAt: 1 }); if (fd.get('coordinator')) db.roles.push({ id: uid('ra'), person: String(fd.get('coordinator')), role: 'coordinator', section: id }); toast(t('action.newSection.done')); render() } }),
    'deactivate-section': (el) => { const s = section(el.dataset.id as string); const gs = db.groups.filter((g) => g.section === s.id); if (gs.length) { openModal({ title: t('action.deactivateSection.title'), submitLabel: t('action.deactivateSection.ok'), body: `<div class="alert error"><strong>${esc(t('action.deactivateSection.conflict'))}</strong>${t('action.deactivateSection.body', { groups: gs.map((g) => esc(g.name)).join(', ') })}</div>`, onSubmit: () => undefined }); return } s.active = false; render() },
    'add-coordinator': (el) => openModal({ title: t('action.addCoordinator.title'), body: fld('person', t('common.person'), sel('person', [['', t('common.choose')], ...db.persons.filter((p) => ageOn(p.birth) >= 18).map((p) => [p.id, `${p.first} ${p.last}`] as [string, string])]), { req: true }), onSubmit: (fd) => { if (!fd.get('person')) return { person: t('action.addCoordinator.errPerson') }; db.roles.push({ id: uid('ra'), person: String(fd.get('person')), role: 'coordinator', section: el.dataset.section }); toast(t('action.addCoordinator.done')); render() } }),
    'end-role': (el) => { db.roles = db.roles.filter((r) => r.id !== el.dataset.id); toast(t('action.endRole.done')); render() },
    'new-person': () => openModal({ title: t('action.newPerson.title'), body: `<div class="fields">${fld('first', t('action.newPerson.first'), inp('first'), { req: true })}${fld('last', t('action.newPerson.last'), inp('last'), { req: true })}${fld('birth', t('action.newPerson.birth'), inp('birth', 'date'), { req: true })}${fld('email', t('common.email'), inp('email', 'email'))}${fld('phone', t('common.phone'), inp('phone', 'tel'))}${fld('pesel', t('action.newPerson.pesel'), inp('pesel', 'text', '', 'maxlength="11" inputmode="numeric"'))}</div>`,
      onSubmit: (fd) => { const errs: Errors = {}; required(fd, ['first', 'last', 'birth'], errs); const e = String(fd.get('email') || ''); if (e && !emailOk(e)) errs.email = t('action.newPerson.errEmail'); const ph = String(fd.get('phone') || ''); if (ph && !phoneOk(ph)) errs.phone = t('action.newPerson.errPhone'); const pe = String(fd.get('pesel') || ''); if (pe && !/^\d{11}$/.test(pe)) errs.pesel = t('action.newPerson.errPesel'); if (String(fd.get('birth')) > TODAY) errs.birth = t('action.newPerson.errBirthFuture'); if (Object.keys(errs).length) return errs; const id = uid('p'); db.persons.push(P(id, String(fd.get('first')), String(fd.get('last')), String(fd.get('birth')), { email: e || undefined, phone: ph || undefined, pesel: pe || undefined })); toast(t('action.newPerson.done')); go(`/backend/people/persons/${id}?tab=guardians`) } }),
    'add-ward': (el) => openModal({ title: t('action.addWard.title'), body: `${fld('ward', t('action.addWard.ward'), sel('ward', [['', t('common.choose')], ...db.persons.filter((p) => ageOn(p.birth) < 18 && p.id !== el.dataset.guardian).map((p) => [p.id, `${p.first} ${p.last} (${t('common.ageShort', { n: ageOn(p.birth) })})`] as [string, string])]), { req: true })}${fld('relation', t('action.addWard.relation'), sel('relation', [['parent', t('relation.parent')], ['grandparent', t('relation.grandparent')], ['legal_guardian', t('relation.legal_guardian')], ['other', t('relation.other')]]))}${chk('payer', esc(t('action.addWard.primaryPayer')))}<div class="section-title">${esc(t('action.addWard.consents'))}</div>${chk('regulations', esc(t('action.addWard.consentRegulations')), true)}${chk('image', esc(t('action.addWard.consentImage')))}${chk('trips', esc(t('action.addWard.consentTrips')))}`,
      onSubmit: (fd) => { const w = String(fd.get('ward') || ''); if (!w) return { ward: t('action.addWard.errPerson') }; if (fd.get('payer') && db.guardianships.some((g) => g.ward === w && g.primaryPayer)) return { payer: t('action.addWard.errPayerExists') }; db.guardianships.push({ id: uid('gs'), guardian: el.dataset.guardian as string, ward: w, relation: String(fd.get('relation')), primaryPayer: !!fd.get('payer'), consents: { regulations: !!fd.get('regulations'), image: !!fd.get('image'), trips: !!fd.get('trips') } }); toast(t('action.addWard.done')); render() } }),
    'add-role': (el) => openModal({ title: t('action.addRole.title'), body: `<div class="fields">${fld('role', t('common.role'), sel('role', [['coach', t('action.addRole.coach')], ['coordinator', t('action.addRole.coordinator')], ['facility_operator', t('action.addRole.facilityOperator')], ['treasurer', t('action.addRole.treasurer')], ['club_admin', t('action.addRole.clubAdmin')]]), { req: true })}${fld('section', t('action.addRole.sectionForCoordinator'), sel('section', [['', '—'], ...db.sections.map((s) => [s.id, s.name] as [string, string])]))}${fld('place', t('action.addRole.placeForAttendant'), sel('place', [['', '—'], ...db.places.map((p) => [p.id, p.name] as [string, string])]))}</div>`,
      onSubmit: (fd) => { const r = String(fd.get('role')); if (r === 'coordinator' && !fd.get('section')) return { section: t('action.addRole.errSection') }; if (r === 'facility_operator' && !fd.get('place')) return { place: t('action.addRole.errPlace') }; db.roles.push({ id: uid('ra'), person: el.dataset.person as string, role: r as RoleAssignment['role'], section: String(fd.get('section') || '') || undefined, place: String(fd.get('place') || '') || undefined }); toast(t('action.addRole.done')); render() } }),
    'create-account': (el) => { const p = personById(db, el.dataset.id as string); openModal({ title: t('action.createAccount.title', { name: `${p.first} ${p.last}` }), submitLabel: t('action.createAccount.submit'), body: fld('email', t('action.createAccount.loginEmail'), inp('email', 'email', p.email || ''), { req: true }),
      onSubmit: (fd) => { const e = String(fd.get('email') || '').trim(); if (!emailOk(e)) return { email: t('action.createAccount.errEmail') }; if (db.persons.some((x) => x.id !== p.id && x.email === e && x.account)) return { email: t('action.createAccount.errExists') }; p.email = e; p.account = true; mail(e, lt('action.createAccount.mailSubject', { club: db.settings.name }), lt('action.createAccount.mailBody'), '/login', lt('action.createAccount.mailLink')); toast(t('action.createAccount.done')); render() } }) },
    'simulate-conflict': (el) => { const p = personById(db, el.dataset.id as string); p.updatedAt++; toast(t('action.simulateConflict.done')) },
    'add-member': (el) => { const g = group(el.dataset.group as string); openModal({ title: t('action.addMember.title', { group: g.name }), body: `<div class="fields">${fld('person', t('common.person'), sel('person', [['', t('common.choose')], ...db.persons.filter((p) => !g.members.includes(p.id)).map((p) => [p.id, `${p.first} ${p.last} (${t('common.ageShort', { n: ageOn(p.birth) })})`] as [string, string])]), { req: true })}${fld('role', t('common.role'), sel('role', [['participant', t('action.addMember.participant')], ['coach', g.kind === 'team' ? t('action.addMember.coach') : t('action.addMember.instructor')], ['assistant', t('action.addMember.assistant')]]))}${fld('from', t('common.from'), inp('from', 'date', TODAY), { req: true })}</div>`,
      onSubmit: (fd) => { const pid = String(fd.get('person') || ''); if (!pid) return { person: t('action.addMember.errPerson') }; if (fd.get('role') === 'participant') g.members.push(pid); else g.coaches.push(pid); toast(t('action.addMember.done')); render() } }) },
    'end-member': (el) => { const g = group(el.dataset.group as string); g.members = g.members.filter((m) => m !== el.dataset.person); g.coaches = g.coaches.filter((m) => m !== el.dataset.person); toast(t('action.endMember.done')); render() },
  }

  function csvModal(name: string, csv: string): void {
    openModal({ title: t('ui.csvModal.title', { name }), submitLabel: t('common.close'), body: `<p class="small muted">${t('ui.csvModal.body', { file: esc(name) })}</p><textarea id="csv-text" readonly rows="8" style="width:100%;font-family:ui-monospace,monospace">${esc(csv)}</textarea><p>${btn(esc(t('ui.csvModal.copy')), 'copy-csv')}</p>`, onSubmit: () => undefined })
  }

  function slotModal(placeId: string, date: string, hour: number): void {
    const place = db.places.find((p) => p.id === placeId) as Place
    const backend = location.hash.includes('/backend/')
    const pid = me()
    const myGroups = db.groups.filter((g) => g.coaches.includes(pid) || coordSections(pid).includes(g.section))
    const zone = zonesFor(placeId, date).find((z) => hour * 60 >= z.from && hour * 60 < z.to)
    const startT = fromMin(hour * 60), endT = fromMin(Math.min(hour * 60 + 90, (openingFor(placeId, date) || [0, 1320])[1]))
    const modes: [string, string][] = [...(backend && can('facilities.rentals.manage') ? [['rental', t('ui.slotModal.modeRental')]] as [string, string][] : []), ...(myGroups.length && can('activities.events.create') ? [['group', t('ui.slotModal.modeGroup')]] as [string, string][] : []), ['general', t('ui.slotModal.modeGeneral')]]
    const teams = myGroups.filter((g) => g.kind === 'team')
    openModal({ title: t('ui.slotModal.title', { place: place.name, date: dShort(date) }), submitLabel: t('ui.slotModal.submit'), wide: true,
      body: `<p class="small muted">${esc(t('ui.slotModal.zone'))} <b>${zone ? zoneLabel(zone.zone) : '—'}</b>. ${backend ? '' : esc(t('ui.slotModal.staffImmediate'))}</p>
        ${fld('mode', t('common.kind'), sel('mode', modes, modes[0][0], 'data-change="slot-mode"'), { req: true })}
        <div class="fields">${fld('start', t('common.from'), inp('start', 'time', startT), { req: true })}${fld('end', t('common.to'), inp('end', 'time', endT), { req: true })}</div>
        <div data-mode="group" ${modes[0][0] === 'group' ? '' : 'hidden'}><div class="fields" style="margin-top:10px">${fld('group', t('common.group'), sel('group', myGroups.map((g) => [g.id, `${g.name}${g.kind === 'class_group' ? ` (${t('ui.slotModal.classGroup')})` : ''}`] as [string, string]), teams[0]?.id || myGroups[0]?.id), { req: true })}${fld('type', t('common.type'), sel('type', [['tournament', t('ui.slotModal.typeTournament')], ['other', t('ui.slotModal.typeOther')]], 'tournament'), { req: true })}${fld('name', t('common.name'), inp('name', 'text', 'Turniej o Puchar Gwiazdy'), { req: true })}</div>
          <div class="field" style="margin-top:10px"><span>${esc(t('ui.slotModal.invitedTeams'))}</span><div class="chips">${db.externalTeams.map((et) => `<label class="chip"><input type="checkbox" name="invited" value="${et.id}" class="sr-only" data-change="chip">${esc(et.name)}</label>`).join('')}</div></div></div>
        <div data-mode="general" ${modes[0][0] === 'general' ? '' : 'hidden'} style="margin-top:10px">${fld('purpose', t('ui.slotModal.purpose'), inp('purpose', 'text', '', `maxlength="120" placeholder="${esc(t('ui.slotModal.purposePlaceholder'))}"`), { req: true, hint: t('ui.slotModal.purposeHint') })}${fld('section', t('common.section'), sel('section', db.sections.map((s) => [s.id, s.name] as [string, string]), myGroups[0]?.section || coordSections(pid)[0] || 's-akad'))}</div>
        <div data-mode="rental" ${modes[0][0] === 'rental' ? '' : 'hidden'} style="margin-top:10px"><div class="fields">${fld('renter', t('ui.slotModal.renter'), sel('renter', db.institutions.filter((i) => i.type !== 'municipality').map((i) => [i.id, i.name] as [string, string])), { req: true })}${fld('category', t('ui.slotModal.category'), sel('category', db.rates.filter((r) => r.place === placeId).map((r) => [r.category, r.label] as [string, string])))}${fld('units', t('ui.slotModal.units'), inp('units', 'number', '1', 'min="1" max="4"'), { req: true })}${fld('contact', t('ui.slotModal.contact'), inp('contact'), { req: true })}</div>${chk('regs', esc(t('ui.slotModal.renterAcceptedRules')), true)}</div>`,
      onSubmit: (fd) => {
        const mode = String(fd.get('mode'))
        const s = toMin(String(fd.get('start'))), e0 = toMin(String(fd.get('end')))
        const e = mode === 'rental' ? s + 90 * Number(fd.get('units') || 1) : e0
        const errs: Errors = {}
        if (mode !== 'rental' && e <= s) errs.end = t('ui.slotModal.errEndAfterStart')
        const op = openingFor(placeId, date)
        if (!op || s < op[0] || e > op[1]) errs.start = t('ui.slotModal.errClosed', { hours: op ? ` (${fromMin(op[0])}–${fromMin(op[1])})` : '' })
        if (mode === 'group') { const g = group(String(fd.get('group'))); if (String(fd.get('name') || '').trim().length < 3) errs.name = t('ui.slotModal.errName') }
        if (mode === 'general' && String(fd.get('purpose') || '').trim().length < 3) errs.purpose = t('ui.slotModal.errPurpose')
        if (mode === 'rental') { const u = Number(fd.get('units')); if (!(u >= 1 && u <= 4)) errs.units = t('ui.slotModal.errUnits'); const zs = zonesFor(placeId, date).filter((z) => overlap(s, e, z.from, z.to)); if (zs.some((z) => z.zone !== 'reservable_paid')) errs.start = t('ui.slotModal.errZone'); if (!String(fd.get('contact') || '').trim()) errs.contact = t('validation.required'); const ren = db.institutions.find((i) => i.id === fd.get('renter')); if (ren && db.bans.some((b) => b.subject === ren.name && b.to >= date)) errs.renter = t('ui.slotModal.errBan') }
        if (Object.keys(errs).length) return errs
        const conf = conflicts(placeId, date, s, e, { capacity: mode === 'group' })
        if (conf.length) return { _: `<strong>${esc(t('ui.slotModal.slotTaken'))}</strong><ul style="margin:4px 0 0;padding-left:18px">${conf.map((c) => `<li>${fromMin(c.from)}–${fromMin(c.to)} ${esc(c.label)}</li>`).join('')}</ul>` }
        // External requests waiting in this time slot are superseded.
        const sup = db.rentals.filter((r) => r.status === 'pending_approval' && placeFamily(placeId).includes(r.place) && r.date === date && overlap(s, e, toMin(r.start), toMin(r.end)))
        for (const r of sup) { r.status = 'superseded'; mail(r.email, lt('ui.slotModal.mailSupersededSubject'), lt('ui.slotModal.mailSupersededBody', { date: ld(r.date), start: r.start }), `/p/gwiazda/places/${place.slug || ''}`, lt('ui.slotModal.mailSupersededLink')) }
        if (mode === 'group') {
          const g = group(String(fd.get('group')))
          const a: Activity = { id: uid('a'), group: g.id, name: String(fd.get('name')), type: String(fd.get('type')) as OccType, weekdays: [weekday(date)], start: fromMin(s), end: fromMin(e), place: placeId, coach: pid, from: date, to: date, oneOff: true, invited: fd.getAll('invited').map(String) }
          db.activities.push(a); generateOccurrences(db, a, date, date)
          toast(`${t('ui.slotModal.bookedGroup', { name: a.name, date: dShort(date), start: a.start, end: a.end, group: g.name })}${sup.length ? ` ${t('ui.slotModal.supersededN', { n: sup.length })}` : ''}`)
        } else if (mode === 'general') {
          db.bookings.push({ id: uid('b'), place: placeId, date, start: fromMin(s), end: fromMin(e), purpose: String(fd.get('purpose')), by: pid, section: String(fd.get('section')), status: 'confirmed' })
          toast(`${t('ui.slotModal.bookedGeneral', { place: placeName(db, placeId), date: dShort(date), start: fromMin(s), end: fromMin(e) })}${sup.length ? ` ${t('ui.slotModal.supersededOne')}` : ''}`)
        } else {
          const ren = db.institutions.find((i) => i.id === fd.get('renter')) as { id: string; name: string }
          const rate = db.rates.find((r) => r.place === placeId && r.category === fd.get('category')) as { price: number; category: string }
          const units = Number(fd.get('units'))
          const r: Rental = { id: uid('r'), place: placeId, renter: ren.name, renterId: ren.id, category: rate.category, contact: String(fd.get('contact')), email: 'najemca@example.pl', phone: '', date, start: fromMin(s), end: fromMin(e), units, amount: rate.price * units, status: 'requested', via: 'phone' }
          db.rentals.push(r); rentalCharge(db, r)
          toast(t('ui.slotModal.rentalSaved', { amount: zl(r.amount), payBy: dShort(addDays(date, -3)), cancelBy: dShort(addDays(date, -1)), start: r.start }))
        }
        render()
      } })
  }

  function publicRequestModal(placeId: string, date: string, from: number, to: number): void {
    const place = db.places.find((p) => p.id === placeId) as Place
    const maxUnits = Math.max(1, Math.floor((to - from) / 90))
    openModal({ title: t('ui.publicRequestModal.title', { place: place.name }), submitLabel: t('ui.publicRequestModal.submit'), wide: true,
      body: `<div class="alert info"><strong>${esc(t('ui.publicRequestModal.when', { date: dLong(date), from: fromMin(from) }))}</strong>${esc(t('ui.publicRequestModal.info'))}</div>
        <div class="fields">${fld('org', t('ui.publicRequestModal.org'), inp('org', 'text', '', 'maxlength="120"'), { req: true })}${fld('contact', t('ui.publicRequestModal.contactName'), inp('contact', 'text', '', 'autocomplete="name"'), { req: true })}${fld('phone', t('common.phone'), inp('phone', 'tel', '', 'autocomplete="tel"'), { req: true })}${fld('email', t('common.email'), inp('email', 'email', '', 'autocomplete="email"'), { req: true })}
        ${fld('category', t('ui.publicRequestModal.category'), sel('category', db.rates.filter((r) => r.place === placeId && r.category !== 'municipal_club').map((r) => [r.category, r.label] as [string, string])), { req: true })}${fld('units', t('ui.publicRequestModal.units', { max: maxUnits }), inp('units', 'number', '1', `min="1" max="${maxUnits}"`), { req: true })}</div>
        ${fld('purpose', t('ui.publicRequestModal.purpose'), area('purpose', '', 'maxlength="300"'))}<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        ${chk('regs', `${t('ui.publicRequestModal.acceptRules', { link: `<a href="#" data-action="todo" data-what="${esc(t('ui.publicRequestModal.rulesDoc'))}">${esc(t('ui.publicRequestModal.rulesLink'))}</a>` })} <b class="req">*</b>`)}<p class="small muted">${esc(t('ui.publicRequestModal.privacy', { club: db.settings.name }))}</p>`,
      onSubmit: (fd) => {
        const errs: Errors = {}
        required(fd, ['org', 'contact', 'phone', 'email', 'category'], errs)
        const org = String(fd.get('org') || '').trim(); if (org && (org.length < 2)) errs.org = t('ui.publicRequestModal.errOrg')
        const em = String(fd.get('email') || ''); if (em && !emailOk(em)) errs.email = t('ui.publicRequestModal.errEmail')
        const ph = String(fd.get('phone') || ''); if (ph && !phoneOk(ph)) errs.phone = t('ui.publicRequestModal.errPhone')
        const u = Number(fd.get('units')); if (!(u >= 1 && u <= maxUnits)) errs.units = t('ui.publicRequestModal.errUnits', { max: maxUnits })
        if (!fd.get('regs')) errs.regs = t('ui.publicRequestModal.errRules')
        if (String(fd.get('website') || '')) errs._ = t('ui.publicRequestModal.errHoneypot')
        if (Object.keys(errs).length) return errs
        const s = from, e = from + 90 * u
        if (conflicts(placeId, date, s, e, { pendingBlocks: true }).length) return { _: `<strong>${esc(t('ui.publicRequestModal.slotTaken'))}</strong>${esc(t('ui.publicRequestModal.chooseOther'))}` }
        const rate = db.rates.find((r) => r.place === placeId && r.category === fd.get('category')) as { price: number; category: string }
        const token = uid('vt')
        const r: Rental = { id: uid('r'), place: placeId, renter: org, category: rate.category, contact: String(fd.get('contact')), email: em, phone: ph, date, start: fromMin(s), end: fromMin(e), units: u, amount: rate.price * u, status: 'pending_verification', via: 'online', purpose: String(fd.get('purpose') || ''), token, holdUntil: '' }
        db.rentals.push(r)
        mail(em, lt('ui.publicRequestModal.mailSubject'), lt('ui.publicRequestModal.mailBody', { place: place.name, date: ld(date), start: r.start, end: r.end }), `/p/gwiazda/requests/verify/${token}`, lt('ui.publicRequestModal.mailLink'))
        openModal({ title: t('ui.publicRequestModal.checkInboxTitle'), submitLabel: t('common.close'), body: `<div class="alert success"><strong>${t('ui.publicRequestModal.sentTo', { email: esc(em) })}</strong>${esc(t('ui.publicRequestModal.confirmWithin'))}</div><p class="small">${esc(t('ui.publicRequestModal.inMockup'))} <a href="#" data-action="drawer" data-which="mail">${esc(t('ui.publicRequestModal.openMailbox'))}</a>.</p>`, onSubmit: () => undefined })
        render()
        return { __keep: '' }
      } })
  }

  // ═══════════════════════════════════════════════════════════════════
  // Forms
  // ═══════════════════════════════════════════════════════════════════
  const FORMS: Record<string, (fd: FormData, form: HTMLFormElement, submitter: HTMLButtonElement | null) => Errors | void> = {
    'cash-mobile': (fd) => { const res = recordCash(fd); if (res) return res; render() },
    'kit-order': (fd, form) => {
      const c = kitCampaign(form.dataset.campaign as string) as KitCampaign
      const token = form.dataset.token || ''
      const guardian = token ? db.kitTokens[token].guardian : me()
      const child = form.dataset.child as string
      if (c.status !== 'open' || TODAY > c.closes) return { _: t('form.kitOrder.errClosed') }
      if (!kitKids(c, guardian).includes(child)) return { _: t('form.kitOrder.errNotInGroups') }
      const choice: Record<string, string> = Object.fromEntries(c.products.filter((p) => p.kind === 'item').map((p) => [p.id, String(fd.get(`p-${p.id}`) || '')]))
      const priced = kitPrice(c, choice, !!fd.get('set'))
      const errs: Errors = { ...priced.errs }
      const email = String(fd.get('email') || '').trim(), phone = String(fd.get('phone') || '').trim()
      if (!email) errs.email = t('form.kitOrder.errEmailMissing'); else if (!emailOk(email)) errs.email = t('form.kitOrder.errEmail')
      if (!phone) errs.phone = t('form.kitOrder.errPhoneMissing'); else if (!phoneOk(phone)) errs.phone = t('form.kitOrder.errPhone')
      const existing = kitOrderOf(c, child)
      const printName = String(fd.get('printName') || '').trim().toUpperCase(), num = String(fd.get('printNumber') || '').trim()
      if (printName.length > 12) errs.printName = t('form.kitOrder.errPrintName')
      if (c.printNumber && num) {
        const n = Number(num), g = kitGroupOf(c, child)
        const taken = kitOrders(c).find((o) => o !== existing && o.printNumber === String(n) && kitGroupOf(c, o.child) === g)
        if (!Number.isInteger(n) || n < 1 || n > 99) errs.printNumber = t('form.kitOrder.errPrintNumber')
        else if (taken) errs.printNumber = t('form.kitOrder.errNumberTaken', { number: n, child: personById(db, taken.child).first, group: group(g).name })
      }
      if (Object.keys(errs).length) return errs
      const notes = String(fd.get('notes') || '').trim()
      let o: KitOrder
      if (existing) {
        const ch = chargeById(existing.chargeId)
        if (priced.total < paidOf(ch)) return { _: t('form.kitOrder.errReduce', { paid: zl(paidOf(ch)), total: zl(priced.total) }) }
        Object.assign(existing, { lines: priced.lines, email, phone, printName, printNumber: num ? String(Number(num)) : '', notes })
        ch.amount = priced.total; ch.status = paidOf(ch) >= ch.amount ? 'paid' : paidOf(ch) > 0 ? 'partially_paid' : 'open'; ch.updatedAt++
        o = existing
      } else {
        o = { id: uid('ko'), campaign: c.id, child, by: guardian, email, phone, printName, printNumber: num ? String(Number(num)) : '', notes, lines: priced.lines, chargeId: '', at: `${TODAY.slice(8)}.${TODAY.slice(5, 7)} ${NOW}`, status: 'submitted', via: token ? 'email_link' : 'app' }
        o.chargeId = kitCharge(db, c, o).id
        db.kitOrders.push(o)
      }
      // Order confirmation e-mail: kit line labels are rendered when the e-mail is sent; the rest follows the UI language.
      const body: Txt = [`${pName(child)}:\n`, ...o.lines.map((l): Txt => [lt('form.kitOrder.mailLine', { item: kitLineLabel(c, l), price: lm(l.price) }), '\n']), lt('form.kitOrder.mailTotal', { total: lm(kitTotal(o)) }), ...(printName || num ? ['\n', lt('form.kitOrder.mailPrint', { name: printName, number: num })] : []), '\n\n', lt('form.kitOrder.mailPayment', { due: ld(c.payDue), code: payerCode(guardian), closes: ld(c.closes) })]
      mail(email, lt(existing ? 'form.kitOrder.mailSubjectChange' : 'form.kitOrder.mailSubjectCopy', { campaign: c.name }), body, token ? `/club/o/${token}?child=${child}` : `/club/orders/${c.id}?child=${child}`, lt('form.kitOrder.mailLink'))
      toast(existing ? t('form.kitOrder.savedChanges') : t('form.kitOrder.placed', { total: zl(kitTotal(o)), email }))
      go(`${token ? `/club/o/${token}` : `/club/orders/${c.id}`}?child=${child}`)
    },
    'kit-link': (fd, form) => {
      const e = String(fd.get('email') || '').trim()
      if (!e) return { email: t('form.login.emailRequired') }
      if (!emailOk(e)) return { email: t('form.login.emailInvalid') }
      const c = kitCampaign(form.dataset.campaign as string) as KitCampaign
      const p = db.persons.find((x) => (x.email || '').toLowerCase() === e.toLowerCase())
      // Always the same response — we never reveal whether the address is known to the club.
      if (p && c.status === 'open' && kitKids(c, p.id).length) { const tok = uid('kit'); db.kitTokens[tok] = { guardian: p.id, campaign: c.id }; mail(e, lt('form.kitLink.mailSubject', { campaign: c.name }), lt('form.kitLink.mailBody', { date: ld(c.closes) }), `/club/o/${tok}`, lt('form.kitLink.mailLink')) }
      ui.kitLinkSent = e; render()
    },
    'kit-campaign': (_fd, form, submitter) => {
      const d = readKitDraft(form); ui.kitDraft = JSON.stringify(d)
      const errs: Errors = {}
      if (d.name.length < 3) errs.name = t('form.kitCampaign.nameMin')
      if (!d.groups.length) errs.groups = t('form.kitCampaign.groupsMin')
      if (!d.closes) errs.closes = t('validation.required'); else if (d.closes < TODAY) errs.closes = t('form.kitCampaign.closesPast')
      if (!d.payDue) errs.payDue = t('validation.required'); else if (d.closes && d.payDue < d.closes) errs.payDue = t('form.kitCampaign.payDueBeforeClose')
      if (!d.products.length) errs._ = t('form.kitCampaign.productsMin')
      if (d.products.filter((x) => x.kind === 'set').length > 1) errs._ = t('form.kitCampaign.oneSet')
      d.products.forEach((x, i) => {
        if (!x.name) errs[`pn-${i}`] = t('form.kitCampaign.productName')
        if (!(x.priceChild > 0)) errs[`pc-${i}`] = t('form.kitCampaign.pricePositive')
        if (x.kind === 'set' && (x.components || []).length < 2) errs[`pcomp-${i}`] = t('form.kitCampaign.setComponents')
        if (x.kind === 'item' && x.priceAdult !== undefined && !(x.priceAdult > 0)) errs[`pp-${i}`] = t('form.kitCampaign.pricePositive')
      })
      if (Object.keys(errs).length) return errs
      const intent = submitter?.value || 'draft'
      let c = d.id ? kitCampaign(d.id) : undefined
      if (c) Object.assign(c, d, { status: intent === 'open' && c.status === 'draft' ? 'open' : c.status })
      else { c = { ...d, id: uid('oc'), status: intent === 'open' ? 'open' : 'draft', createdBy: me() }; db.kitCampaigns.unshift(c) }
      const id = c.id
      delete ui.kitDraft; delete ui.kitDraftFor
      toast(t(intent === 'open' ? 'form.kitCampaign.savedOpened' : intent === 'save' ? 'form.kitCampaign.savedChanges' : 'form.kitCampaign.savedDraft'))
      go(`/backend/payments/orders/${id}`)
      if (intent === 'open') setTimeout(() => kitShareModal(id), 320)
    },
    login: (fd) => {
      const errs: Errors = {}
      const e = String(fd.get('email') || '').trim(), pw = String(fd.get('password') || '')
      if (!e) errs.email = t('form.login.emailRequired'); else if (!emailOk(e)) errs.email = t('form.login.emailInvalid')
      if (!pw) errs.password = t('form.login.passwordRequired')
      if (Object.keys(errs).length) return errs
      const p = PERSONAS.find((x) => x.email === e)
      if (!p || pw.length < 4) return { _: t('form.login.badCredentials') }
      setPersona(p.id); toast(t('form.login.signedIn', { name: personaLabel(p) }))
      go(hasMemberRole(p.person as string) || p.features.includes('activities.coach') || p.features.includes('facilities.log.write') ? p.home : '/backend')
    },
    checkout: (fd) => {
      const ids = fd.getAll('charge').map(String)
      if (!ids.length) return { _: t('form.checkout.selectCharge') }
      go(`/stripe?ids=${ids.join(',')}`)
    },
    reply: (fd, form) => {
      const body = String(fd.get('body') || '').trim()
      if (!body) return { body: t('form.reply.bodyRequired') }
      const th = db.threads.find((x) => x.id === form.dataset.thread) as Thread
      th.messages.push({ id: uid('m'), author: me(), role: isAdmin() ? 'admin' : isCoachPersona() ? 'coach' : 'guardian', body, at: `${TODAY} ${NOW}`, delivered: 3, failed: 0 })
      toast(t('form.reply.sent')); render()
    },
    profile: (fd) => {
      const errs: Errors = {}
      const e = String(fd.get('email') || ''), ph = String(fd.get('phone') || '')
      if (!e) errs.email = t('validation.required'); else if (!emailOk(e)) errs.email = t('form.login.emailInvalid')
      if (ph && !phoneOk(ph)) errs.phone = t('form.profile.phoneFormat')
      if (Object.keys(errs).length) return errs
      const p = personById(db, me()); p.email = e; p.phone = ph; p.publishConsent = !!fd.get('publish')
      const l = String(fd.get('lang') || ''); if (l && CATALOGS[l]) setLang(l) // PUT /api/people/me { preferredLocale }
      toast(t('form.profile.saved')); render()
    },
    'link-request': (fd, form) => {
      const e = String(fd.get('email') || '').trim()
      if (!emailOk(e)) return { email: t('form.login.emailInvalid') }
      const occ = form.dataset.occ as string
      const g = occ ? group((occById(occ) as Occurrence).group) : null
      const guardian = db.persons.find((p) => p.email === e && g && wardsOf(p.id).some((w) => g.members.includes(w)))
      if (guardian && occ) { const tok = uid('tok'); db.tokens[tok] = { guardian: guardian.id, occ }; mail(e, lt('form.linkRequest.mailSubject'), lt('form.linkRequest.mailBody', { name: (occById(occ) as Occurrence).name }), `/club/d/${tok}`, lt('form.linkRequest.mailLink')) }
      const formEl = document.querySelector('[data-form="link-request"]') as HTMLElement
      formEl.outerHTML = `<div class="alert success" role="status" style="margin-top:12px"><strong>${esc(t('form.linkRequest.sentTitle'))}</strong>${esc(t('form.linkRequest.sentText'))}</div>`
      return { __keep: '' }
    },
    settings: (fd) => {
      const errs: Errors = {}
      required(fd, ['name', 'short', 'slug'], errs)
      const slug = String(fd.get('slug') || '')
      if (slug && !/^[a-z0-9-]{3,40}$/.test(slug)) errs.slug = t('form.settings.slugFormat')
      const age = Number(fd.get('minAge')); if (!(age >= 13 && age <= 18)) errs.minAge = t('form.settings.minAge')
      if (Object.keys(errs).length) return errs
      Object.assign(db.settings, { name: String(fd.get('name')), short: String(fd.get('short')), slug, phone: String(fd.get('phone') || ''), minAge: age, description: String(fd.get('description') || '') })
      toast(t('form.settings.saved')); render()
    },
    publication: (fd) => {
      const keys = ['enabled', 'description_schedule', 'conditions', 'prices', 'coaches', 'materials', 'contact', 'places_calendar', 'online_requests']
      const next: Record<string, boolean> = Object.fromEntries(keys.map((k) => [k, !!fd.get(k)]))
      if (next.online_requests && !next.places_calendar) return { online_requests: t('form.publication.requestsNeedCalendar') }
      db.settings.publication = next; toast(t('form.publication.saved')); render()
    },
    section: (fd, form) => { const s = section(form.dataset.id as string); const n = String(fd.get('name') || s.name).trim(); if (n.length < 2) return { name: t('form.section.nameLength') }; s.name = n; s.short = String(fd.get('short') || ''); s.description = String(fd.get('description') || ''); toast(t('form.section.saved')); render() },
    'section-public': (fd, form) => {
      const s = section(form.dataset.id as string); const errs: Errors = {}
      const slug = String(fd.get('slug') || ''); if (!/^[a-z0-9-]{2,40}$/.test(slug)) errs.slug = t('form.sectionPublic.slugFormat')
      const ce = String(fd.get('contactEmail') || ''); if (ce && !emailOk(ce)) errs.contactEmail = t('form.login.emailInvalid')
      const cp = String(fd.get('contactPhone') || ''); if (cp && !phoneOk(cp)) errs.contactPhone = t('form.profile.phoneFormat')
      if (Object.keys(errs).length) return errs
      Object.assign(s, { isPublic: !!fd.get('isPublic'), slug, description: String(fd.get('description') || ''), conditions: String(fd.get('conditions') || ''), contactName: String(fd.get('contactName') || ''), contactEmail: ce, contactPhone: cp })
      toast(t('form.sectionPublic.saved')); render()
    },
    group: (fd, form) => { const g = group(form.dataset.id as string); const kind = String(fd.get('kind')); if (kind === 'class_group' && (String(fd.get('category') || '') || String(fd.get('league') || ''))) return { category: t('form.group.categoryTeamOnly') }; if (g.kind === 'team' && kind === 'class_group' && db.occurrences.some((o) => o.group === g.id && o.type === 'match')) return { kind: t('form.group.hasMatches') }; Object.assign(g, { name: String(fd.get('name')), kind, category: String(fd.get('category') || '') || undefined, league: String(fd.get('league') || '') || undefined, level: String(fd.get('level') || '') || undefined }); toast(t('form.group.saved')); render() },
    'group-public': (fd, form) => { const g = group(form.dataset.id as string); const a = Number(fd.get('ageFrom')), b = Number(fd.get('ageTo')); if (fd.get('ageFrom') && fd.get('ageTo') && a > b) return { ageTo: t('form.groupPublic.ageRange') }; Object.assign(g, { isPublic: !!fd.get('isPublic'), publicDescription: String(fd.get('publicDescription') || ''), conditions: String(fd.get('conditions') || ''), ageFrom: a || undefined, ageTo: b || undefined, level: String(fd.get('level') || '') || undefined }); toast(t('form.profile.saved')); render() },
    person: (fd, form) => {
      const p = personById(db, form.dataset.id as string)
      if (Number(form.dataset.version) !== p.updatedAt) { openModal({ title: t('form.person.conflictTitle'), submitLabel: t('form.person.refresh'), body: `<p>${esc(t('form.person.conflictBody'))}</p>`, onSubmit: () => { render() } }); return { __keep: '' } }
      const errs: Errors = {}; required(fd, ['first', 'last', 'birth'], errs)
      const pe = String(fd.get('pesel') || ''); if (can('people.pesel.view') && pe && !/^\d{11}$/.test(pe)) errs.pesel = t('form.person.pesel')
      const e = String(fd.get('email') || ''); if (e && !emailOk(e)) errs.email = t('form.login.emailInvalid')
      if (Object.keys(errs).length) return errs
      Object.assign(p, { first: String(fd.get('first')), last: String(fd.get('last')), birth: String(fd.get('birth')), phone: String(fd.get('phone') || ''), email: e }); if (can('people.pesel.view')) p.pesel = pe; p.updatedAt++
      toast(t('form.profile.saved')); render()
    },
    wizard: (fd, _form, submitter) => {
      const f = { group: String(fd.get('group')), type: String(fd.get('type')), name: String(fd.get('name') || ''), place: String(fd.get('place')), coach: String(fd.get('coach') || ''), days: fd.getAll('days').map(String), start: String(fd.get('start') || ''), end: String(fd.get('end') || ''), from: String(fd.get('from') || ''), to: String(fd.get('to') || '') }
      ui.wizard = JSON.stringify(f)
      const errs: Errors = {}
      required(fd, ['group', 'type', 'name', 'place', 'start', 'end', 'from', 'to'], errs)
      if (!f.days.length) errs.days = t('form.wizard.daysMin')
      if (f.start && f.end && toMin(f.end) <= toMin(f.start)) errs.end = t('form.wizard.endAfterStart')
      if (f.from && f.to && f.to < f.from) errs.to = t('form.wizard.dateRange')
      if (['match', 'sparring'].includes(f.type) && group(f.group).kind !== 'team') errs.type = t('form.wizard.matchTeamOnly')
      if (Object.keys(errs).length) { delete ui.preview; return errs }
      const dates: string[] = []
      for (let d = f.from; d <= f.to && dates.length < 60; d = addDays(d, 1)) if (f.days.includes(String(weekday(d)))) dates.push(d)
      if (!dates.length) { delete ui.preview; return { _: t('form.wizard.noDates') } }
      const confl: string[] = []
      for (const d of dates) for (const c of conflicts(f.place, d, toMin(f.start), toMin(f.end), { capacity: true })) confl.push(`${dShort(d)} ${fromMin(c.from)}–${fromMin(c.to)} — ${c.label}`)
      ui.preview = JSON.stringify({ dates, conflicts: confl.slice(0, 8) })
      if (submitter?.value === 'create') {
        if (confl.length) { render(); return }
        const a: Activity = { id: uid('a'), group: f.group, name: f.name, type: f.type as OccType, weekdays: f.days.map(Number), start: f.start, end: f.end, place: f.place, coach: f.coach || null, from: f.from, to: f.to }
        db.activities.push(a); const created = generateOccurrences(db, a, f.from, addDays(TODAY, 16 * 7))
        delete ui.preview; delete ui.wizard
        toast(t('form.wizard.created', { n: created.length }))
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
  // Events
  // ═══════════════════════════════════════════════════════════════════
  document.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null
    if (!el) return
    const fn = ACTIONS[el.dataset.action as string]
    if (fn) fn(el, ev)
  })
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { if (modal) closeModal(); else if (drawer) { drawer = null; renderDrawer() } }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter' && modal) { const f = document.querySelector('[data-form="modal"]') as HTMLFormElement | null; f?.requestSubmit() }
    const target = ev.target as HTMLElement
    if ((ev.key === 'Enter' || ev.key === ' ') && target.dataset.action === 'slot') { ev.preventDefault(); target.click() }
  })
  document.addEventListener('submit', (ev) => {
    const form = ev.target as HTMLFormElement
    const name = form.dataset.form
    if (!name || !FORMS[name]) return
    ev.preventDefault()
    const submitter = (ev as SubmitEvent).submitter as HTMLButtonElement | null
    const fd = new FormData(form)
    const res = FORMS[name](fd, form, submitter)
    if (res && Object.keys(res).length && !('__keep' in res)) applyErrors(form, res)
  })
  document.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement | HTMLSelectElement
    const k = el.dataset.change
    if (!k) return
    if (k === 'persona') { setPersona(el.value as PersonaId); drawer = null; go(persona().home) }
    if (k === 'demo') { demoState = el.value as DemoState; render() }
    if (k === 'lang') setLang(el.value)
    if (k === 'ctx') { coachCtx = el.value === 'coach'; render() }
    if (k === 'consent') { const g = db.guardianships.find((x) => x.id === el.dataset.gs) as Guardianship; (g.consents as Record<string, boolean>)[el.dataset.key as string] = (el as HTMLInputElement).checked; toast(t('ui.onChange.consentSaved')) }
    if (k === 'chip') { (el.closest('.chip') as HTMLElement).classList.toggle('on', (el as HTMLInputElement).checked) }
    if (k === 'wizard-group') { const form = el.closest('form') as HTMLFormElement; const fd = new FormData(form); ui.wizard = JSON.stringify({ group: el.value, type: String(fd.get('type')), name: String(fd.get('name')), place: String(fd.get('place')), coach: String(fd.get('coach')), days: fd.getAll('days').map(String), start: String(fd.get('start')), end: String(fd.get('end')), from: String(fd.get('from')), to: String(fd.get('to')) }); delete ui.preview; render() }
    if (k === 'cash-payer') { ui.cashPayer = el.value; const body = el.closest('.modal-body') || el.closest('form'); if (body) { const keepModal = !!el.closest('.modal-body'); (keepModal ? body : body).innerHTML = (keepModal ? '<div class="form-general"></div>' : '') + cashForm(el.value, keepModal) } }
    if (k === 'cash-sum') { const form = el.closest('form') as HTMLFormElement; const ids = new FormData(form).getAll('charges').map(String); const sum = db.charges.filter((c) => ids.includes(c.id)).reduce((a, c) => a + remaining(c), 0); (document.getElementById('cash-amount') as HTMLInputElement).value = String(sum / 100) }
    if (k === 'autobook') { db.settings.autoBook = (el as HTMLInputElement).checked; toast(t((el as HTMLInputElement).checked ? 'ui.onChange.autobookOn' : 'ui.onChange.autobookOff')) }
    if (k === 'bank-file') { const f = (el as HTMLInputElement).files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => { try { const rows = parseCsv(String(reader.result)); if (!rows.length) throw new Error(t('ui.onChange.fileNoRows')); const imp = importStatement(f.name, rows); toast(t('ui.onChange.imported', { n: imp.total, booked: imp.booked, suggested: imp.suggested, unmatched: imp.unmatched, skipped: imp.skipped })); render() } catch (e) { const field = (el as HTMLElement).closest('[data-field]') as HTMLElement; field.classList.add('invalid'); field.querySelector('.field-error')?.remove(); const pe = document.createElement('p'); pe.className = 'field-error'; pe.textContent = t('ui.onChange.fileReadFailed', { error: (e as Error).message }); field.appendChild(pe) } }; reader.readAsText(f, 'utf-8') }
    if (k === 'avail-mode') { document.querySelectorAll('#modal [data-am]').forEach((d) => { (d as HTMLElement).hidden = (d as HTMLElement).dataset.am !== el.value }) }
    if (k === 'slot-mode') { document.querySelectorAll('#modal [data-mode]').forEach((d) => { (d as HTMLElement).hidden = (d as HTMLElement).dataset.mode !== el.value }) }
    if (k === 'pay-sum') { const form = el.closest('form') as HTMLFormElement; const ids = new FormData(form).getAll('charge').map(String); const sum = db.charges.filter((c) => ids.includes(c.id)).reduce((s, c) => s + remaining(c), 0); (document.getElementById('pay-summary') as HTMLElement).outerHTML = paySummary(sum); (document.getElementById('pay-btn') as HTMLButtonElement).textContent = t('ui.onChange.payAmount', { amount: zl(sum + onlineFeeFor(sum)) }) }
    if (k === 'logo-upload') {
      const input = el as HTMLInputElement
      const f = input.files ? input.files[0] : undefined
      const field = input.closest('[data-field]') as HTMLElement
      const fail = (m: string): void => { field.classList.add('invalid'); field.querySelector('.field-error')?.remove(); const pe = document.createElement('p'); pe.className = 'field-error'; pe.textContent = m; field.appendChild(pe); input.value = '' }
      if (!f) return
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) { fail(t('ui.onChange.logoFormats')); return }
      if (f.size > 2 * 1024 * 1024) { fail(t('ui.onChange.logoTooBig', { size: (f.size / 1048576).toLocaleString(numLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })); return }
      const reader = new FileReader()
      reader.onload = () => { const url = String(reader.result); const target = input.dataset.target as string; if (target === 'club') db.settings.logo = url; else section(target).logo = url; toast(t(target === 'club' ? 'ui.onChange.clubLogoUploaded' : 'ui.onChange.sectionLogoUploaded')); render() }
      reader.readAsDataURL(f)
    }
    if (k === 'kit-recalc') { const form = el.closest('form') as HTMLFormElement; const c = kitCampaign(form.dataset.campaign as string) as KitCampaign; const fd = new FormData(form); const res = kitPrice(c, Object.fromEntries(c.products.filter((p) => p.kind === 'item').map((p) => [p.id, String(fd.get(`p-${p.id}`) || '')])), !!fd.get('set')); (document.getElementById('kit-total') as HTMLElement).textContent = zl(res.total) }
    if (k === 'kit-redraw') kitDraftEdit(() => undefined)
    if (k === 'coach-fees') { db.settings.coachFees = el.value as 'none' | 'view' | 'collect'; toast(t('ui.onChange.coachFeesSaved')) }
    if (k === 'online-fee') { db.settings.onlineFee.mode = el.value as 'club_pays' | 'payer_pays'; toast(t('ui.onChange.onlineFeeSaved')) }
    if (k === 'grp-cash-sum') { const form = el.closest('form') as HTMLFormElement; const ids = new FormData(form).getAll('charges').map(String); const sum = db.charges.filter((c) => ids.includes(c.id)).reduce((a, c) => a + remaining(c), 0); (document.getElementById('grp-cash-amount') as HTMLInputElement).value = String(sum / 100) }
    if (k === 'kit-section') kitDraftEdit((d) => { d.groups = [] })
    if (k === 'units-month') go(`/backend/activities/reports/coach-units?month=${el.value}`)
    if (k === 'report-place') go(`/backend/facilities/reports/owner?place=${el.value}`)
  })
  document.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement
    if (el.dataset.input === 'person-search') { ui.personSearch = el.value; const pos = el.selectionStart; render(); const n = document.getElementById('person-search') as HTMLInputElement; n.focus(); n.setSelectionRange(pos, pos) }
  })
  window.addEventListener('hashchange', () => { if (modal) closeModal(); render() })
  render()
})()
