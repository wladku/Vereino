// The monthly coach units report (club spec REQ-008, REQ-021, DD-14, glossary *Coach settlement*; README B-16; #96).
// Pure: the service reads the month's closed sessions, their substitution history and the coach contracts, and this
// file counts and prices them.
//
// A unit is one `training` session in status `done`, owed to whoever led it (DD-14, R04). The session's own coach is
// the coach it had before its first substitution entry (the current coach when it has none). Per coach and month:
// planned — own training sessions; handed over — own ones another coach led; taken over — others' ones this coach
// led; balance = planned − handed over + taken over (the units led); matches — `match` / `sparring` sessions led;
// away trips — sessions of an away-trip activity led.
//
// Amounts (R14), in grosz, in the club's model: `units_per_contract` — base + units × unit rate + matches × match rate
// + trips × trip rate; `fixed_base_adjusted` — base − handed over × session amount + taken over × session amount +
// trips × trip amount. Each counted session is priced by the coach contract in force on its own day, so a contract
// that ends mid-month prices the sessions up to its last day and the next one the rest; the monthly base is counted
// once, from the latest contract that overlaps the month. A coach without a contract in the month has no amount
// (`no_contract`); a counted session on a day no contract covers, or a pricing contract that lacks a rate of the
// model, leaves the amount empty too (`incomplete`).
import type { CalendarDate } from '@vereino/core'

export type CoachSettlementModel = 'units_per_contract' | 'fixed_base_adjusted'

export type CoachRates = Partial<
  Record<'baseMonthly' | 'unitRate' | 'matchRate' | 'travelRate' | 'sessionAmount' | 'tripAmount', number>
>

export type CoachContract = { id: string; validFrom: CalendarDate; validTo: CalendarDate | null; terms: CoachRates }

/** A closed session of the month as the report counts it. */
export type ReportSession = {
  id: string
  date: CalendarDate
  type: string
  isAway: boolean
  /** Who led it: the session's coach. */
  leaderPersonId: string | null
  /** The coach it had before its first substitution entry, else its coach. */
  ownPersonId: string | null
}

/** Why a session is in a coach's list. */
export type CoachSessionRole = 'unit' | 'handed_over' | 'taken_over' | 'match' | 'trip'

export type CoachSessionEntry = {
  id: string
  date: CalendarDate
  type: string
  isAway: boolean
  role: CoachSessionRole
}

export type ContractState = 'ok' | 'no_contract' | 'incomplete'

export type CoachUnitsRow = {
  personId: string
  planned: number
  handedOver: number
  takenOver: number
  balance: number
  matches: number
  trips: number
  sessions: CoachSessionEntry[]
  /** Grosz; null without a contract or with an incomplete one. */
  amount: number | null
  contractState: ContractState
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/** The first and last day of a `YYYY-MM` month, or null for anything else. */
export function monthRange(month: string): { from: CalendarDate; to: CalendarDate } | null {
  const match = MONTH_PATTERN.exec(month)
  if (!match) return null
  const year = Number(match[1])
  const monthNumber = Number(match[2])
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from: `${match[1]}-${match[2]}-01`, to: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}` }
}

/** The `YYYY-MM` month `delta` months from `month` (the report's previous / next month buttons). */
export function shiftMonth(month: string, delta: number): string {
  if (!monthRange(month)) return month
  const [year, monthNumber] = month.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  return `${String(shifted.getUTCFullYear())}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The own coach of each session: the previous coach of its first substitution entry, else its current coach. */
export function ownCoachOf(
  current: string | null,
  firstEntry: { previousCoachPersonId: string | null } | undefined,
): string | null {
  return firstEntry ? firstEntry.previousCoachPersonId : current
}

const MATCH_TYPES: ReadonlySet<string> = new Set(['match', 'sparring'])

function emptyRow(personId: string): CoachUnitsRow {
  return {
    personId,
    planned: 0,
    handedOver: 0,
    takenOver: 0,
    balance: 0,
    matches: 0,
    trips: 0,
    sessions: [],
    amount: null,
    contractState: 'no_contract',
  }
}

/** The rows per coach, counted from the month's `done` sessions; each row lists its sessions by date. */
export function countCoachUnits(sessions: readonly ReportSession[]): CoachUnitsRow[] {
  const rows = new Map<string, CoachUnitsRow>()
  const row = (personId: string) => {
    let found = rows.get(personId)
    if (!found) {
      found = emptyRow(personId)
      rows.set(personId, found)
    }
    return found
  }
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  for (const session of ordered) {
    const entry = (role: CoachSessionRole): CoachSessionEntry => ({
      id: session.id,
      date: session.date,
      type: session.type,
      isAway: session.isAway,
      role,
    })
    const leader = session.leaderPersonId
    const own = session.ownPersonId
    if (session.type === 'training') {
      if (own) row(own).planned += 1
      if (own && own !== leader) {
        row(own).handedOver += 1
        row(own).sessions.push(entry('handed_over'))
      }
      if (leader && leader !== own) row(leader).takenOver += 1
      if (leader) row(leader).sessions.push(entry(leader === own ? 'unit' : 'taken_over'))
    } else if (leader && MATCH_TYPES.has(session.type)) {
      row(leader).matches += 1
      row(leader).sessions.push(entry('match'))
    } else if (leader && session.isAway) {
      row(leader).sessions.push(entry('trip'))
    }
    if (leader && session.isAway) row(leader).trips += 1
  }
  for (const found of rows.values()) found.balance = found.planned - found.handedOver + found.takenOver
  return [...rows.values()]
}

function contractOn(contracts: readonly CoachContract[], date: CalendarDate): CoachContract | null {
  return contracts.find((row) => row.validFrom <= date && (row.validTo === null || date <= row.validTo)) ?? null
}

/** What one counted session adds, as a rate name, in the model (the base is added once, apart). */
function sessionRates(
  entry: CoachSessionEntry,
  model: CoachSettlementModel,
): { rate: keyof CoachRates; sign: 1 | -1 }[] {
  const rates: { rate: keyof CoachRates; sign: 1 | -1 }[] = []
  if (model === 'units_per_contract') {
    if (entry.role === 'unit' || entry.role === 'taken_over') rates.push({ rate: 'unitRate', sign: 1 })
    if (entry.role === 'match') rates.push({ rate: 'matchRate', sign: 1 })
  } else {
    if (entry.role === 'handed_over') rates.push({ rate: 'sessionAmount', sign: -1 })
    if (entry.role === 'taken_over') rates.push({ rate: 'sessionAmount', sign: 1 })
  }
  // A trip is a session the coach led; a handed-over session was led by someone else.
  if (entry.isAway && entry.role !== 'handed_over') {
    rates.push({ rate: model === 'units_per_contract' ? 'travelRate' : 'tripAmount', sign: 1 })
  }
  return rates
}

/** The row's amount and contract state in the model (`contracts` oldest first, overlapping the month). */
export function priceCoachRow(
  row: CoachUnitsRow,
  contracts: readonly CoachContract[],
  model: CoachSettlementModel,
): Pick<CoachUnitsRow, 'amount' | 'contractState'> {
  const baseContract = contracts.at(-1)
  if (!baseContract) return { amount: null, contractState: 'no_contract' }
  const base = baseContract.terms.baseMonthly
  if (base === undefined) return { amount: null, contractState: 'incomplete' }
  let amount = base
  for (const entry of row.sessions) {
    const rates = sessionRates(entry, model)
    if (rates.length === 0) continue
    const contract = contractOn(contracts, entry.date)
    if (!contract) return { amount: null, contractState: 'incomplete' }
    for (const { rate, sign } of rates) {
      const value = contract.terms[rate]
      if (value === undefined) return { amount: null, contractState: 'incomplete' }
      amount += sign * value
    }
  }
  return { amount, contractState: 'ok' }
}

/** Grosz as a plain decimal with two places (`199000` → `1990.00`), the CSV amount. */
export function groszToDecimal(grosz: number): string {
  const sign = grosz < 0 ? '-' : ''
  const absolute = Math.abs(grosz)
  return `${sign}${String(Math.floor(absolute / 100))}.${String(absolute % 100).padStart(2, '0')}`
}

/** One CSV field, quoted when it holds a separator, a quote or a line break; a formula prefix is neutralized. */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export type CsvRow = Pick<CoachUnitsRow, 'planned' | 'handedOver' | 'takenOver' | 'balance' | 'matches' | 'trips'> & {
  coach: string
  amount: number | null
}

/**
 * The report as CSV (AC: columns coach, planned, given, taken, balance, matches, trips and — for a holder of
 * `club_core.contracts.manage` — amount; an empty amount for a coach without a complete contract). CRLF line ends.
 */
export function coachUnitsCsv(rows: readonly CsvRow[], withAmount: boolean): string {
  const header = [
    'coach',
    'planned',
    'given',
    'taken',
    'balance',
    'matches',
    'trips',
    ...(withAmount ? ['amount'] : []),
  ]
  const lines = rows.map((row) =>
    [
      csvField(row.coach),
      String(row.planned),
      String(row.handedOver),
      String(row.takenOver),
      String(row.balance),
      String(row.matches),
      String(row.trips),
      ...(withAmount ? [row.amount === null ? '' : groszToDecimal(row.amount)] : []),
    ].join(','),
  )
  return [header.join(','), ...lines].join('\r\n') + '\r\n'
}
