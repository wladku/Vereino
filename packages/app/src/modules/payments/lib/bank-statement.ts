// Pure reading of a bank statement, phase 4 step 7 (payments spec REQ-030, TEST-042; issue #113 E07-S06; B-29): the
// file's bytes become a list of entries — the day the money was booked, the amount in grosz (negative for a debit),
// the sender, their account and the transfer title. Two formats: CSV in the bank's own column layout (the columns are
// recognised by their header, or named by the treasurer's column mapping) and MT940. Nothing here reads the database;
// the matching of the entries to payers lives in `bank-matching.ts`.
//
// CSV: `;`, `,` or a tab, detected from the header line; quoted fields with doubled quotes; the header may follow a
// preamble (account number, period), so the first of the first rows that names every required column is the header.
// Amounts take a decimal comma or point and a space, a non-breaking space, a point or a comma as the thousands
// separator; dates are `YYYY-MM-DD`, `DD.MM.YYYY`, `DD-MM-YYYY`, `DD/MM/YYYY` or `YYYYMMDD`. A line whose date or
// amount cannot be read (a closing balance, a note) is reported by its number rather than dropped silently.
//
// MT940: every `:61:` statement line with its `:86:` details; the Polish structured details (`~20`…`~25` title,
// `~32`/`~33` name, `~38` account; `<` and `?` separators too) or, without them, the whole text as the title.
import { isCalendarDate, type CalendarDate } from '@vereino/core'

export const BANK_FORMATS = ['csv', 'mt940'] as const
export type BankFormat = (typeof BANK_FORMATS)[number]

/** The largest statement file accepted (a year of a club account is far smaller). */
export const MAX_STATEMENT_BYTES = 2 * 1024 * 1024

/** The most entries one import takes; a larger file is split by period. */
export const MAX_STATEMENT_ENTRIES = 2000

/** How many leading rows may precede the CSV header (the bank's preamble). */
export const MAX_PREAMBLE_ROWS = 20

/** The longest text kept of a sender, an account or a title. */
export const MAX_ENTRY_TEXT = 500

export const STATEMENT_COLUMNS = ['date', 'amount', 'sender', 'title', 'account'] as const
export type StatementColumn = (typeof STATEMENT_COLUMNS)[number]

/** Without these a transfer cannot be matched; the sender and the account are read when present. */
export const REQUIRED_STATEMENT_COLUMNS: readonly StatementColumn[] = ['date', 'amount', 'title']

/** The treasurer's column mapping: the header text of each column in the bank's file. */
export type ColumnProfile = Partial<Record<StatementColumn, string>>

/** Header texts (without diacritics, lower case) that name each column in Polish and English bank exports. */
const COLUMN_ALIASES: Record<StatementColumn, readonly string[]> = {
  date: [
    'data',
    'data operacji',
    'data ksiegowania',
    'data transakcji',
    'data waluty',
    'date',
    'booking date',
    'transaction date',
    'value date',
  ],
  amount: ['kwota', 'kwota operacji', 'kwota transakcji', 'amount', 'value'],
  sender: [
    'nadawca',
    'kontrahent',
    'nazwa kontrahenta',
    'nadawca odbiorca',
    'dane kontrahenta',
    'sender',
    'counterparty',
    'payer',
    'name',
  ],
  title: ['tytul', 'tytul operacji', 'tytul przelewu', 'opis', 'opis operacji', 'title', 'reference', 'description'],
  account: [
    'rachunek',
    'numer rachunku',
    'rachunek kontrahenta',
    'nr rachunku',
    'konto',
    'account',
    'account number',
    'iban',
  ],
}

export type StatementEntry = {
  /** The line of the file (CSV record number, or the `:61:` line of MT940), shown when something is wrong. */
  line: number
  bookedOn: CalendarDate
  /** Grosz; negative for a debit. */
  amount: number
  counterpartyName: string
  counterpartyAccount: string
  title: string
}

export type StatementProblem =
  'empty' | 'too_large' | 'format_unsupported' | 'columns_missing' | 'too_many_entries' | 'nothing_readable'

export type StatementResult =
  | {
      ok: true
      format: BankFormat
      entries: StatementEntry[]
      /** The lines that look like data but whose date or amount could not be read. */
      unreadable: number[]
      /** The CSV columns used, by header text; null for MT940. */
      columnProfile: ColumnProfile | null
    }
  | { ok: false; problem: StatementProblem; missing?: StatementColumn[] }

// --- Text ---

/**
 * The statement's text: strict UTF-8 (a byte-order mark dropped), or Windows-1250 — what Polish banks still export —
 * when the bytes are not UTF-8; null for binary content (a NUL byte).
 */
export function decodeStatement(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null
  // The UTF-8 decoder drops a byte-order mark itself.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1250').decode(bytes)
  }
}

/** MT940 when the text has a statement reference (`:20:`) and a statement line (`:61:`); CSV otherwise. */
export function detectStatementFormat(text: string): BankFormat {
  return /^:20:/m.test(text) && /^:61:/m.test(text) ? 'mt940' : 'csv'
}

/** Lower case without Polish diacritics and with every run of other characters as one space. */
export function foldText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function clip(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_ENTRY_TEXT)
}

// --- Values ---

/**
 * An amount as grosz, or null: `1 234,56`, `-150,00`, `150.5`, `1.234,56`, `1,234.56`, `+80 PLN`, `80,00 zł`, `-`
 * leading or trailing. The last `,` or `.` is the decimal separator when one or two digits follow it.
 */
export function parseAmount(raw: string): number | null {
  let text = raw.replace(/[\s  ]/g, '').replace(/(pln|zł|zl)$/i, '')
  let negative = false
  if (/^[-+]/.test(text)) {
    negative = text.startsWith('-')
    text = text.slice(1)
  } else if (text.endsWith('-')) {
    negative = true
    text = text.slice(0, -1)
  }
  if (!/^\d[\d.,]*$/.test(text)) return null
  const last = Math.max(text.lastIndexOf(','), text.lastIndexOf('.'))
  let whole = text
  let fraction = ''
  if (last >= 0 && text.length - last - 1 <= 2) {
    whole = text.slice(0, last)
    fraction = text.slice(last + 1)
  }
  // What is left of the separators must group thousands: 1.234.567 or 1,234 — never 12,34,5.
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(whole)) return null
  const grosz = Number(whole.replace(/[.,]/g, '')) * 100 + Number(fraction.padEnd(2, '0'))
  return negative ? -grosz : grosz
}

/** A booking date as `YYYY-MM-DD`, or null: `2026-11-03`, `03.11.2026`, `03-11-2026`, `03/11/2026`, `20261103`. */
export function parseStatementDate(raw: string): CalendarDate | null {
  const text = raw.trim()
  let date: string | null = null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  const european = /^(\d{2})[./-](\d{2})[./-](\d{4})/.exec(text)
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text)
  if (iso) date = `${iso[1]}-${iso[2]}-${iso[3]}`
  else if (european) date = `${european[3]}-${european[2]}-${european[1]}`
  else if (compact) date = `${compact[1]}-${compact[2]}-${compact[3]}`
  return date !== null && isCalendarDate(date) ? date : null
}

// --- CSV ---

/** `;`, a tab or `,` — whichever occurs most often outside quotes on the first line with content (`;` on a tie). */
function detectDelimiter(text: string): string {
  const counts = new Map<string, number>([
    [';', 0],
    ['\t', 0],
    [',', 0],
  ])
  let inQuotes = false
  let seenContent = false
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (seenContent) break
      continue
    } else if (!inQuotes && counts.has(ch)) counts.set(ch, (counts.get(ch) as number) + 1)
    seenContent = true
  }
  let best = ';'
  for (const [delimiter, count] of counts) if (count > (counts.get(best) as number)) best = delimiter
  return best
}

/** The CSV records with their line numbers, or null for an unclosed quote. */
export function readCsvRecords(text: string): { line: number; cells: string[] }[] | null {
  const delimiter = detectDelimiter(text)
  const records: { line: number; cells: string[] }[] = []
  let cells: string[] = []
  let field = ''
  let atFieldStart = true
  let inQuotes = false
  let line = 1
  let recordLine = 1
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '\n') line += 1
      if (ch !== '"') field += ch
      else if (text[i + 1] === '"') {
        field += '"'
        i += 1
      } else inQuotes = false
    } else if (ch === '"' && atFieldStart) {
      inQuotes = true
      atFieldStart = false
    } else if (ch === delimiter) {
      cells.push(field)
      field = ''
      atFieldStart = true
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      cells.push(field)
      records.push({ line: recordLine, cells })
      line += 1
      recordLine = line
      cells = []
      field = ''
      atFieldStart = true
    } else {
      field += ch
      atFieldStart = false
    }
  }
  if (inQuotes) return null
  if (!atFieldStart || cells.length > 0) {
    cells.push(field)
    records.push({ line: recordLine, cells })
  }
  return records.filter((record) => record.cells.some((cell) => cell.trim() !== ''))
}

type ColumnIndexes = Record<StatementColumn, number>

/**
 * The index of each column in a header row: by the mapping's header text when given (exact after folding), otherwise
 * by the known aliases. -1 for a column the row does not name.
 */
export function resolveColumns(header: readonly string[], profile?: ColumnProfile | null): ColumnIndexes {
  const folded = header.map(foldText)
  const indexes = {} as ColumnIndexes
  for (const column of STATEMENT_COLUMNS) {
    const named = profile?.[column]
    const wanted = named ? [foldText(named)] : COLUMN_ALIASES[column]
    indexes[column] = folded.findIndex(
      (text, index) => wanted.includes(text) && !Object.values(indexes).includes(index),
    )
  }
  return indexes
}

function missingColumns(indexes: ColumnIndexes): StatementColumn[] {
  return REQUIRED_STATEMENT_COLUMNS.filter((column) => indexes[column] < 0)
}

/** Reads a CSV statement: finds the header (after a preamble), then reads every data record. */
export function parseCsvStatement(text: string, profile?: ColumnProfile | null): StatementResult {
  const records = readCsvRecords(text)
  if (records === null) return { ok: false, problem: 'format_unsupported' }
  if (records.length === 0) return { ok: false, problem: 'empty' }
  let headerAt = -1
  let fewestMissing: StatementColumn[] = missingColumns(resolveColumns(records[0].cells, profile))
  for (let index = 0; index < Math.min(records.length, MAX_PREAMBLE_ROWS); index += 1) {
    const missing = missingColumns(resolveColumns(records[index].cells, profile))
    if (missing.length === 0) {
      headerAt = index
      break
    }
    if (missing.length < fewestMissing.length) fewestMissing = missing
  }
  if (headerAt < 0) return { ok: false, problem: 'columns_missing', missing: fewestMissing }
  const header = records[headerAt].cells
  const indexes = resolveColumns(header, profile)
  const cell = (cells: readonly string[], column: StatementColumn): string =>
    indexes[column] >= 0 ? (cells[indexes[column]] ?? '') : ''
  const entries: StatementEntry[] = []
  const unreadable: number[] = []
  for (const record of records.slice(headerAt + 1)) {
    const bookedOn = parseStatementDate(cell(record.cells, 'date'))
    const amount = parseAmount(cell(record.cells, 'amount'))
    if (bookedOn === null || amount === null) {
      unreadable.push(record.line)
      continue
    }
    entries.push({
      line: record.line,
      bookedOn,
      amount,
      counterpartyName: clip(cell(record.cells, 'sender')),
      counterpartyAccount: clip(cell(record.cells, 'account')),
      title: clip(cell(record.cells, 'title')),
    })
  }
  const columnProfile: ColumnProfile = {}
  for (const column of STATEMENT_COLUMNS) {
    if (indexes[column] >= 0) columnProfile[column] = header[indexes[column]].trim()
  }
  return { ok: true, format: 'csv', entries, unreadable, columnProfile }
}

// --- MT940 ---

/** The `:tag:` fields of an MT940 text, each with its line and its value (continuation lines joined by `\n`). */
function mt940Fields(text: string): { tag: string; line: number; value: string }[] {
  const fields: { tag: string; line: number; value: string }[] = []
  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const tagged = /^:(\d{2}[A-Z]?):(.*)$/.exec(raw)
    if (tagged) fields.push({ tag: tagged[1], line: index + 1, value: tagged[2] })
    else if (fields.length > 0 && raw !== '-' && !raw.startsWith('-}')) {
      fields[fields.length - 1].value += '\n' + raw
    }
  })
  return fields
}

/** The details of a `:86:` field: the structured Polish subfields when present, else the whole text as the title. */
export function mt940Details(value: string): { title: string; name: string; account: string } {
  const flat = value.replace(/\n/g, '')
  const parts = flat.split(/[~<?^](\d{2})/)
  if (parts.length < 3) return { title: clip(value.replace(/\n/g, ' ')), name: '', account: '' }
  const sub = new Map<number, string>()
  for (let index = 1; index < parts.length; index += 2) {
    const code = Number(parts[index])
    sub.set(code, (sub.get(code) ?? '') + parts[index + 1])
  }
  const join = (codes: readonly number[]) =>
    codes
      .map((code) => sub.get(code) ?? '')
      .join('')
      .trim()
  return {
    title: clip(join([20, 21, 22, 23, 24, 25])),
    name: clip(join([32, 33])),
    account: clip(join([38]).replace(/^PL/i, '')),
  }
}

/** Reads an MT940 statement: one entry per `:61:` line, with the `:86:` that follows it. */
export function parseMt940Statement(text: string): StatementResult {
  const fields = mt940Fields(text)
  const entries: StatementEntry[] = []
  const unreadable: number[] = []
  fields.forEach((field, index) => {
    if (field.tag !== '61') return
    const match = /^(\d{2})(\d{2})(\d{2})(?:\d{4})?(R?[CD])[A-Z]?(\d+,\d{0,2})/.exec(field.value)
    const bookedOn = match ? parseStatementDate(`20${match[1]}-${match[2]}-${match[3]}`) : null
    if (!match || bookedOn === null) {
      unreadable.push(field.line)
      return
    }
    const grosz = parseAmount(match[5]) as number
    const credit = match[4] === 'C' || match[4] === 'RD'
    const next = index + 1 < fields.length ? fields[index + 1] : null
    const details = next && next.tag === '86' ? mt940Details(next.value) : { title: '', name: '', account: '' }
    entries.push({
      line: field.line,
      bookedOn,
      amount: credit ? grosz : -grosz,
      counterpartyName: details.name,
      counterpartyAccount: details.account,
      title: details.title,
    })
  })
  return { ok: true, format: 'mt940', entries, unreadable, columnProfile: null }
}

// --- Entry point ---

/**
 * Reads a statement file: the size, the text, the format (given, or detected from the content — never from the file
 * name) and the entries. Refuses an empty or oversized file, binary content, a CSV without the required columns, a
 * file with nothing readable and one with more than `MAX_STATEMENT_ENTRIES` entries.
 */
export function parseStatement(
  bytes: Uint8Array,
  options: { format?: BankFormat | null; columnProfile?: ColumnProfile | null } = {},
): StatementResult {
  if (bytes.length === 0) return { ok: false, problem: 'empty' }
  if (bytes.length > MAX_STATEMENT_BYTES) return { ok: false, problem: 'too_large' }
  const text = decodeStatement(bytes)
  if (text === null) return { ok: false, problem: 'format_unsupported' }
  if (text.trim() === '') return { ok: false, problem: 'empty' }
  const format = options.format ?? detectStatementFormat(text)
  const result = format === 'mt940' ? parseMt940Statement(text) : parseCsvStatement(text, options.columnProfile)
  if (!result.ok) return result
  if (result.entries.length === 0) return { ok: false, problem: 'nothing_readable' }
  if (result.entries.length > MAX_STATEMENT_ENTRIES) return { ok: false, problem: 'too_many_entries' }
  return result
}
