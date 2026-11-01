// The rules of the family import (club spec REQ-036, DD-38, Q-044; #28): a sheet row becomes up to three people (the
// participant and up to two guardians) and a group label; each row is classified `new` / `matched` / `review` /
// `error`, and the same plan drives the commit, so a preview and a commit agree by construction. A person is matched
// to the club only by the PESEL or the external identifier (compared through their lookup hashes by the caller);
// a person without an identifier is matched only through a matched relative of the same row (a guardian of the
// matched participant with the same name, or the other way round) — never by name alone. A row without any
// identifier waits for the administrator's decision. Pure.
import { isCalendarDate, type CalendarDate } from '@vereino/core'
import type { ImportCell, ImportRow } from './import-file'
import {
  GUARDIAN_SLOTS,
  IMPORT_PERSON_FIELDS,
  IMPORT_SLOTS,
  slotField,
  type GuardianSlot,
  type ImportField,
  type ImportMapping,
  type ImportPersonField,
  type ImportSlot,
} from './import-mapping'
import { isValidPesel } from './people-rules'

export const IMPORT_CLASSIFICATIONS = ['new', 'matched', 'review', 'error'] as const
export type ImportClassification = (typeof IMPORT_CLASSIFICATIONS)[number]

export const IMPORT_DECISIONS = ['match', 'create', 'skip'] as const
export type ImportDecisionAction = (typeof IMPORT_DECISIONS)[number]
export type ImportDecision = { action: 'match'; personId: string } | { action: 'create' } | { action: 'skip' }

/** Why a row is `error` (stored as `error_code`; `error_column` names the column, never the cell value). */
export const IMPORT_ROW_ERRORS = [
  'import_name_missing',
  'import_date_invalid',
  'import_pesel_invalid',
  'import_email_invalid',
  'import_value_too_long',
  'import_row_duplicate',
  'import_identifier_conflict',
] as const
export type ImportRowError = (typeof IMPORT_ROW_ERRORS)[number]

/** Why a row is `review`. */
export type ImportReviewReason = 'identifier_missing'

/** A group label kept for the `groups` membership hook (D-026): no membership is created by the import itself. */
export const GROUPS_NOT_ENABLED = 'groups_not_enabled'

/**
 * `membership_status` of a committed row with a group (D-026, #65). A waiting value is also the reason the row waits:
 * `groups_not_enabled` (no `groups.membershipImporter` hook), `group_not_found` (no active group of the club has the
 * name), `group_ambiguous` (more than one has it). A waiting row outlives the purge with its ids and group label and
 * is picked up by a re-run of the commit. A done value ends the row's membership part: `membership_created`,
 * `membership_existed` (the participant already had an open participant membership of the group) or
 * `participant_missing` (the participant was deleted before the hook ran: nothing to attach).
 */
export const MEMBERSHIP_WAITING_STATUSES = [GROUPS_NOT_ENABLED, 'group_not_found', 'group_ambiguous'] as const
export type MembershipWaitingStatus = (typeof MEMBERSHIP_WAITING_STATUSES)[number]
export const MEMBERSHIP_DONE_STATUSES = ['membership_created', 'membership_existed', 'participant_missing'] as const
export type MembershipDoneStatus = (typeof MEMBERSHIP_DONE_STATUSES)[number]
export type MembershipStatus = MembershipWaitingStatus | MembershipDoneStatus

/** Whether a row's membership still waits for the hook (null = the row has no group). */
export function isMembershipWaiting(status: string | null | undefined): boolean {
  return (MEMBERSHIP_WAITING_STATUSES as readonly (string | null | undefined)[]).includes(status)
}

/** What the hook answered for one row: the group's resolution, or the outcome of the membership write. */
export type MembershipHookAnswer = 'group_not_found' | 'group_ambiguous' | 'created' | 'existed' | 'person_missing'

/** The row's `membership_status` for the hook's answer. */
export function membershipStatusOf(answer: MembershipHookAnswer): MembershipStatus {
  switch (answer) {
    case 'created':
      return 'membership_created'
    case 'existed':
      return 'membership_existed'
    case 'person_missing':
      return 'participant_missing'
    case 'group_not_found':
    case 'group_ambiguous':
      return answer
  }
}

export type MembershipSummary = { membershipsCreated: number; membershipsExisting: number; membershipsPending: number }

/**
 * The import's membership counts after a run: the earlier runs' created and existing counts plus this run's, and the
 * rows still waiting. Every waiting row of the import takes part in each run, so this run's waiting count is the total.
 */
export function membershipSummary(
  previous: Partial<MembershipSummary>,
  statuses: readonly (string | null | undefined)[],
): MembershipSummary {
  const count = (status: MembershipStatus) => statuses.filter((value) => value === status).length
  return {
    membershipsCreated: (previous.membershipsCreated ?? 0) + count('membership_created'),
    membershipsExisting: (previous.membershipsExisting ?? 0) + count('membership_existed'),
    membershipsPending: statuses.filter(isMembershipWaiting).length,
  }
}

const MAX_LENGTH: Record<ImportPersonField | 'group', number> = {
  firstName: 200,
  lastName: 200,
  birthDate: 10,
  pesel: 11,
  externalId: 100,
  email: 320,
  phone: 50,
  group: 200,
}

export type ImportPersonValues = { [field in ImportPersonField]: string | null }

export type NormalizedImportRow = {
  rowNo: number
  /** The participant always; a guardian only when the row has a value for one of its mapped fields. */
  persons: Partial<Record<ImportSlot, ImportPersonValues>>
  group: string | null
  error: { code: ImportRowError; column: string | null } | null
}

export type NormalizeOptions = {
  header: readonly string[]
  mapping: ImportMapping
  /** The workbook counts serial dates from 1904 (`ImportSheet.date1904`). */
  date1904: boolean
  /** The club's today: a birth date after it is refused. */
  today: CalendarDate
}

/** The header of a mapped column (what `error_column` stores), or null for an unnamed column. */
export function columnName(options: Pick<NormalizeOptions, 'header' | 'mapping'>, field: ImportField): string | null {
  const column = options.mapping[field]
  return column === undefined ? null : options.header[column] || null
}

function cellText(cell: ImportCell): string | null {
  if (cell === null) return null
  const text = String(cell).trim()
  return text === '' ? null : text
}

const DAY_MS = 86_400_000
const EXCEL_1900_EPOCH = Date.UTC(1899, 11, 30)
const EXCEL_1904_EPOCH = Date.UTC(1904, 0, 1)

function isoDay(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10)
}

/**
 * A birth date from a cell: an Excel serial number (1900 or 1904 system; serials before 1900-03-01 fall into Excel's
 * fictitious 1900-02-29 and are refused), `YYYY-MM-DD` (optionally with a time) or the day-first `D.M.YYYY`,
 * `D-M-YYYY`, `D/M/YYYY`. Null when the cell is not a real date between 1900-01-01 and `today`.
 */
export function parseImportDate(cell: ImportCell, date1904: boolean, today: CalendarDate): CalendarDate | null {
  let candidate: string | null = null
  if (typeof cell === 'number') {
    const days = Math.floor(cell)
    if (date1904) candidate = isoDay(EXCEL_1904_EPOCH + days * DAY_MS)
    else if (days >= 61) candidate = isoDay(EXCEL_1900_EPOCH + days * DAY_MS)
  } else if (typeof cell === 'string') {
    const text = cell.trim()
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text)
    const dayFirst = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text)
    const parts = iso ? [iso[1], iso[2], iso[3]] : dayFirst ? [dayFirst[3], dayFirst[2], dayFirst[1]] : null
    if (parts) candidate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
  }
  if (!candidate || !isCalendarDate(candidate)) return null
  return candidate >= '1900-01-01' && candidate <= today ? candidate : null
}

/** A PESEL from a cell: a number keeps its leading zeros (an XLSX numeric cell drops them), spaces are removed. */
export function importPesel(cell: ImportCell): string | null {
  if (typeof cell === 'number') return String(Math.trunc(cell)).padStart(11, '0')
  const text = cellText(cell)
  return text === null ? null : text.replace(/\s+/g, '')
}

/** The e-mail rule of the person commands' schema (Zod 4 `z.email()`), so a row that passes here is not refused there. */
const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/

type FieldResult = { value: string | null; error: ImportRowError | null }

function readField(cell: ImportCell, field: ImportPersonField, options: NormalizeOptions): FieldResult {
  if (field === 'birthDate') {
    if (cellText(cell) === null) return { value: null, error: null }
    const date = parseImportDate(cell, options.date1904, options.today)
    return date ? { value: date, error: null } : { value: null, error: 'import_date_invalid' }
  }
  const value = field === 'pesel' ? importPesel(cell) : cellText(cell)
  if (value === null) return { value: null, error: null }
  if (field === 'pesel') return isValidPesel(value) ? { value, error: null } : { value, error: 'import_pesel_invalid' }
  if (value.length > MAX_LENGTH[field]) return { value, error: 'import_value_too_long' }
  if (field === 'email' && !EMAIL_PATTERN.test(value)) return { value, error: 'import_email_invalid' }
  return { value, error: null }
}

/**
 * The persons and the group of one sheet row under the mapping, and its first problem: a value that does not parse
 * (with the column that holds it) or a missing first or last name of a person the row names.
 */
export function normalizeImportRow(row: ImportRow, options: NormalizeOptions): NormalizedImportRow {
  let error: NormalizedImportRow['error'] = null
  const fail = (code: ImportRowError, field: ImportField) => {
    error ??= { code, column: columnName(options, field) }
  }
  const persons: NormalizedImportRow['persons'] = {}
  for (const slot of IMPORT_SLOTS) {
    const values = Object.fromEntries(IMPORT_PERSON_FIELDS.map((field) => [field, null])) as ImportPersonValues
    let present = slot === 'participant'
    for (const field of IMPORT_PERSON_FIELDS) {
      const column = options.mapping[slotField(slot, field)]
      if (column === undefined) continue
      const result = readField(row.cells[column] ?? null, field, options)
      if (result.error) fail(result.error, slotField(slot, field))
      values[field] = result.value
      present ||= cellText(row.cells[column] ?? null) !== null
    }
    if (!present) continue
    for (const field of ['firstName', 'lastName'] as const) {
      if (values[field] === null) fail('import_name_missing', slotField(slot, field))
    }
    persons[slot] = values
  }
  const groupColumn = options.mapping.group
  const group = groupColumn === undefined ? null : cellText(row.cells[groupColumn] ?? null)
  if (group !== null && group.length > MAX_LENGTH.group) fail('import_value_too_long', 'group')
  return { rowNo: row.rowNo, persons, group, error }
}

// --- Plan --------------------------------------------------------------------------------------------------------

/** A relative linked to an existing person through an active guardianship. */
export type ExistingRelative = { personId: string; firstName: string; lastName: string; isPrimaryPayer: boolean }

/** An existing person of the club as the import compares it (decrypted by the caller). */
export type ExistingPerson = {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  email: string | null
  phone: string | null
  hasPesel: boolean
  hasExternalId: boolean
  /** The version the plan was read at (ISO): the commit updates the person against it, so a newer edit is a 409. */
  updatedAt: string
  /** Active guardians of the person (the person is the ward). */
  guardians: readonly ExistingRelative[]
  /** Active wards of the person (the person is the guardian). */
  wards: readonly ExistingRelative[]
}

/** What the club already holds: identity key (`identityKeys`) → person id, and the persons by id. */
export type ExistingDirectory = {
  byIdentity: ReadonlyMap<string, string>
  persons: ReadonlyMap<string, ExistingPerson>
}

/** The identity keys of a person's values: `pesel:<number>` and `ext:<identifier>`, the PESEL first. */
export function identityKeys(values: Pick<ImportPersonValues, 'pesel' | 'externalId'>): string[] {
  return [
    ...(values.pesel ? [`pesel:${values.pesel}`] : []),
    ...(values.externalId ? [`ext:${values.externalId}`] : []),
  ]
}

export type PersonRef = { kind: 'existing'; personId: string } | { kind: 'new'; key: string }

/** Fields an update of a matched person changes: only values the file has and the record lacks or differs in. */
export type PersonPatch = Partial<ImportPersonValues>

export type PlannedPerson = {
  slot: ImportSlot
  ref: PersonRef
  /** Set on the first row that creates the in-file person; later rows reuse it. */
  create: ImportPersonValues | null
  update: PersonPatch | null
}

export type PlannedLink = { guardianSlot: GuardianSlot; guardian: PersonRef; ward: PersonRef; isPrimaryPayer: boolean }

export type RowPlan = {
  rowNo: number
  classification: ImportClassification
  errorCode: ImportRowError | null
  errorColumn: string | null
  reviewReason: ImportReviewReason | null
  /** The participant's existing person, when there is one. */
  matchedPersonId: string | null
  /** Nothing is written for the row: an error, a skip, or a review row without a usable decision. */
  idle: boolean
  /** A review row whose decision is missing or names a person the club no longer has. */
  needsDecision: boolean
  persons: PlannedPerson[]
  links: PlannedLink[]
  group: string | null
}

const lower = (value: string | null): string => (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

function sameName(a: { firstName: string | null; lastName: string | null }, b: typeof a): boolean {
  return lower(a.firstName) === lower(b.firstName) && lower(a.lastName) === lower(b.lastName)
}

function fingerprint(row: NormalizedImportRow): string {
  const persons = IMPORT_SLOTS.map((slot) => {
    const values = row.persons[slot]
    return values ? IMPORT_PERSON_FIELDS.map((field) => lower(values[field])) : null
  })
  return JSON.stringify([persons, lower(row.group)])
}

/** The patch that brings an existing person in line with the file; null when nothing differs. */
export function personPatch(existing: ExistingPerson, values: ImportPersonValues): PersonPatch | null {
  const patch: PersonPatch = {}
  for (const field of ['firstName', 'lastName', 'birthDate', 'email', 'phone'] as const) {
    const value = values[field]
    if (value !== null && value !== existing[field]) patch[field] = value
  }
  if (values.pesel && !existing.hasPesel) patch.pesel = values.pesel
  if (values.externalId && !existing.hasExternalId) patch.externalId = values.externalId
  return Object.keys(patch).length > 0 ? patch : null
}

export type PlanOptions = Pick<NormalizeOptions, 'header' | 'mapping'>

type PlanState = {
  directory: ExistingDirectory
  fingerprints: Set<string>
  /** First-seen name and birth date of each identity key in the file. */
  facts: Map<string, { firstName: string | null; lastName: string | null; birthDate: string | null }>
  /** Identity or contact key → the in-file key of the person planned for it. */
  aliases: Map<string, string>
  created: Set<string>
  links: Set<string>
  payers: Set<string>
}

const refKey = (ref: PersonRef): string => (ref.kind === 'existing' ? `p:${ref.personId}` : `n:${ref.key}`)

function errorPlan(row: NormalizedImportRow, code: ImportRowError, column: string | null): RowPlan {
  return {
    rowNo: row.rowNo,
    classification: 'error',
    errorCode: code,
    errorColumn: column,
    reviewReason: null,
    matchedPersonId: null,
    idle: true,
    needsDecision: false,
    persons: [],
    links: [],
    group: row.group,
  }
}

/** The first identity key of the row seen earlier with another name or birth date, with its column. */
function identityConflict(row: NormalizedImportRow, state: PlanState): ImportField | null {
  for (const slot of IMPORT_SLOTS) {
    const values = row.persons[slot]
    if (!values) continue
    for (const key of identityKeys(values)) {
      const seen = state.facts.get(key)
      const birthDiffers = seen?.birthDate && values.birthDate && seen.birthDate !== values.birthDate
      if (seen && (!sameName(seen, values) || birthDiffers)) {
        return slotField(slot, key.startsWith('pesel:') ? 'pesel' : 'externalId')
      }
    }
    // The PESEL names one club member and the external identifier another.
    const matches = new Set(identityKeys(values).map((key) => state.directory.byIdentity.get(key)))
    matches.delete(undefined)
    if (matches.size > 1) return slotField(slot, 'externalId')
  }
  return null
}

function rememberFacts(row: NormalizedImportRow, state: PlanState): void {
  for (const values of Object.values(row.persons)) {
    for (const key of identityKeys(values)) {
      if (!state.facts.has(key)) state.facts.set(key, values)
    }
  }
}

/** An in-file person: the alias of any of its keys, else a new in-file key registered for all of them. */
function inFileRef(keys: readonly string[], state: PlanState): PersonRef {
  const known = keys.map((key) => state.aliases.get(key)).find((alias) => alias !== undefined)
  const key = known ?? keys[0]
  for (const alias of keys) state.aliases.set(alias, key)
  return { kind: 'new', key }
}

function identifiedRef(values: ImportPersonValues, state: PlanState): PersonRef {
  const keys = identityKeys(values)
  const existing = keys.map((key) => state.directory.byIdentity.get(key)).find((id) => id !== undefined)
  return existing ? { kind: 'existing', personId: existing } : inFileRef(keys, state)
}

/** An existing relative of `anchor` with the same name (the only way a person without an identifier is matched). */
function anchoredRef(
  anchor: PersonRef | undefined,
  relation: 'guardians' | 'wards',
  values: ImportPersonValues,
  state: PlanState,
): PersonRef | null {
  if (anchor?.kind !== 'existing') return null
  const relatives = state.directory.persons.get(anchor.personId)?.[relation] ?? []
  const relative = relatives.find((candidate) => sameName(candidate, values))
  return relative ? { kind: 'existing', personId: relative.personId } : null
}

/** In-file key of a person without an identifier: names plus birth date (participant) or contact (guardian). */
function unidentifiedRef(slot: ImportSlot, values: ImportPersonValues, rowNo: number, state: PlanState): PersonRef {
  const names = `${lower(values.firstName)}|${lower(values.lastName)}`
  const detail = slot === 'participant' ? values.birthDate : (values.email ?? values.phone)
  return detail
    ? inFileRef([`same:${slot === 'participant' ? 'p' : 'g'}:${names}|${lower(detail)}`], state)
    : {
        kind: 'new',
        key: `row:${String(rowNo)}:${slot}`,
      }
}

function resolveRow(
  row: NormalizedImportRow,
  decision: ImportDecision | null,
  state: PlanState,
): Partial<Record<ImportSlot, PersonRef>> {
  const refs: Partial<Record<ImportSlot, PersonRef>> = {}
  for (const slot of IMPORT_SLOTS) {
    const values = row.persons[slot]
    if (values && identityKeys(values).length > 0) refs[slot] = identifiedRef(values, state)
  }
  const participant = row.persons.participant as ImportPersonValues
  if (decision?.action === 'match') refs.participant = { kind: 'existing', personId: decision.personId }
  else if (decision?.action === 'create')
    refs.participant = { kind: 'new', key: `row:${String(row.rowNo)}:participant` }
  if (!refs.participant) {
    const anchored = GUARDIAN_SLOTS.map((slot) => anchoredRef(refs[slot], 'wards', participant, state)).find(Boolean)
    refs.participant = anchored ?? unidentifiedRef('participant', participant, row.rowNo, state)
  }
  for (const slot of GUARDIAN_SLOTS) {
    const values = row.persons[slot]
    if (!values || refs[slot]) continue
    refs[slot] =
      anchoredRef(refs.participant, 'guardians', values, state) ?? unidentifiedRef(slot, values, row.rowNo, state)
  }
  return refs
}

function plannedPersons(
  row: NormalizedImportRow,
  refs: Partial<Record<ImportSlot, PersonRef>>,
  state: PlanState,
): PlannedPerson[] {
  const planned: PlannedPerson[] = []
  for (const slot of IMPORT_SLOTS) {
    const ref = refs[slot]
    const values = row.persons[slot]
    if (!ref || !values) continue
    if (ref.kind === 'existing') {
      const existing = state.directory.persons.get(ref.personId)
      planned.push({ slot, ref, create: null, update: existing ? personPatch(existing, values) : null })
      continue
    }
    const first = !state.created.has(ref.key)
    state.created.add(ref.key)
    planned.push({ slot, ref, create: first ? values : null, update: null })
  }
  return planned
}

function plannedLinks(refs: Partial<Record<ImportSlot, PersonRef>>, state: PlanState): PlannedLink[] {
  const ward = refs.participant as PersonRef
  const wardRecord = ward.kind === 'existing' ? state.directory.persons.get(ward.personId) : undefined
  const links: PlannedLink[] = []
  for (const guardianSlot of GUARDIAN_SLOTS) {
    const guardian = refs[guardianSlot]
    if (!guardian || refKey(guardian) === refKey(ward)) continue
    const linkKey = `${refKey(guardian)}>${refKey(ward)}`
    const linked =
      guardian.kind === 'existing' && wardRecord?.guardians.some((item) => item.personId === guardian.personId)
    if (linked || state.links.has(linkKey)) continue
    state.links.add(linkKey)
    const hasPayer = wardRecord?.guardians.some((item) => item.isPrimaryPayer) ?? false
    const isPrimaryPayer = guardianSlot === 'guardian1' && !hasPayer && !state.payers.has(refKey(ward))
    if (isPrimaryPayer) state.payers.add(refKey(ward))
    links.push({ guardianSlot, guardian, ward, isPrimaryPayer })
  }
  return links
}

/**
 * Classifies every row and plans what a commit writes, in row order: rows with a problem, repeated rows and rows
 * whose identifier says another person than an earlier row are `error`; rows without any identifier are `review`
 * and are written only with a decision (`create`, or `match` to an existing person); the others are `matched` when
 * every person of the row exists, else `new`. A `skip` decision keeps the classification and writes nothing.
 */
export function planImport(
  rows: readonly NormalizedImportRow[],
  directory: ExistingDirectory,
  decisions: ReadonlyMap<number, ImportDecision>,
  options: PlanOptions,
): RowPlan[] {
  const state: PlanState = {
    directory,
    fingerprints: new Set(),
    facts: new Map(),
    aliases: new Map(),
    created: new Set(),
    links: new Set(),
    payers: new Set(),
  }
  return [...rows]
    .sort((a, b) => a.rowNo - b.rowNo)
    .map((row) => {
      if (row.error) return errorPlan(row, row.error.code, row.error.column)
      const print = fingerprint(row)
      if (state.fingerprints.has(print)) return errorPlan(row, 'import_row_duplicate', null)
      state.fingerprints.add(print)
      const conflict = identityConflict(row, state)
      if (conflict) return errorPlan(row, 'import_identifier_conflict', columnName(options, conflict))
      rememberFacts(row, state)

      const identified = Object.values(row.persons).some((values) => identityKeys(values).length > 0)
      const decision = decisions.get(row.rowNo) ?? null
      const matchMissing = decision?.action === 'match' && !directory.persons.has(decision.personId)
      // A review row is resolved only through its decision; an identified row always (its classification), but a
      // skipped one writes nothing.
      const resolvable = identified || (decision !== null && decision.action !== 'skip' && !matchMissing)
      const refs = resolvable ? resolveRow(row, identified ? null : decision, state) : null
      const writes = refs !== null && decision?.action !== 'skip'
      const participant = refs?.participant
      const anyNew = refs ? Object.values(refs).some((ref) => ref.kind === 'new') : false
      const classification: ImportClassification = !identified ? 'review' : anyNew ? 'new' : 'matched'
      return {
        rowNo: row.rowNo,
        classification,
        errorCode: null,
        errorColumn: null,
        reviewReason: identified ? null : 'identifier_missing',
        matchedPersonId: participant?.kind === 'existing' ? participant.personId : null,
        idle: !writes,
        needsDecision: !identified && (decision === null || matchMissing),
        persons: refs && writes ? plannedPersons(row, refs, state) : [],
        links: refs && writes ? plannedLinks(refs, state) : [],
        group: row.group,
      }
    })
}

/** Counts per classification (the import's `summary`). */
export function classificationCounts(plans: readonly Pick<RowPlan, 'classification'>[]) {
  const counts: Record<ImportClassification, number> = { new: 0, matched: 0, review: 0, error: 0 }
  for (const plan of plans) counts[plan.classification] += 1
  return counts
}

/** The staged rows and the file of an import are kept this long after its commit or cancellation (REQ-036). */
export const IMPORT_RETENTION_DAYS = 30

/** Imports committed, cancelled (or left open) at or before this instant are due for the purge. */
export function importPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - IMPORT_RETENTION_DAYS * DAY_MS)
}
