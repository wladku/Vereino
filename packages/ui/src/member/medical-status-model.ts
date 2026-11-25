// The model of `MedicalStatusTag` (training outlines and medical expiry spec REQ-O02, REQ-O05, DD-O02, DD-O03, M-O1…M-O3;
// #682): the medical certificate status `GET /api/people/medical-status` answers — red (missing, unreadable or passed),
// orange (valid with at most 30 days left), green (valid) — mapped to a status tone and a translated word, the
// request URLs for a set of people and the tolerant parse of the answer. A person the answer leaves out (outside the
// caller's scope) gets no chip; a caller without `people.medical.view` (403) gets an empty map. Pure.
import type { StatusTagTone } from '#tsx/status/status-tag'

export type MedicalStatus = 'red' | 'orange' | 'green'

export type MedicalState = 'missing' | 'unknown' | 'expired' | 'expiring' | 'valid'

export type MedicalStatusItem = {
  personId: string
  status: MedicalStatus
  state: MedicalState
  /** The last valid day (`YYYY-MM-DD`), or null when none is recorded or it cannot be read. */
  validUntil: string | null
}

/** The words of the chip, translated by the caller; the dated ones take the formatted day. */
export type MedicalStatusLabels = {
  /** "Medical: missing". */
  missing: string
  /** "Medical: unknown" (a date that cannot be read). */
  unknown: string
  /** "Medical expired {date}". */
  expired: (date: string) => string
  /** "Medical until {date}" (under a month left). */
  expiring: (date: string) => string
  /** "Medical until {date}". */
  valid: (date: string) => string
}

/** The status tone of each colour: red is an error, orange a warning, green a success (never `brand`). */
export const MEDICAL_STATUS_TONE: Readonly<Record<MedicalStatus, StatusTagTone>> = {
  red: 'error',
  orange: 'warning',
  green: 'success',
}

/** The most ids one request may carry (`MEDICAL_STATUS_MAX_IDS` of the people route). */
export const MEDICAL_STATUS_BATCH = 200

export const MEDICAL_STATUS_PATH = '/api/people/medical-status'

const STATUSES: ReadonlySet<string> = new Set<MedicalStatus>(['red', 'orange', 'green'])
const STATES: ReadonlySet<string> = new Set<MedicalState>(['missing', 'unknown', 'expired', 'expiring', 'valid'])
const DATED_STATES: ReadonlySet<MedicalState> = new Set<MedicalState>(['expired', 'expiring', 'valid'])

/**
 * The filter "Medical: not valid" (M-O1, M-O2) keeps red only — a missing or passed certificate, the players who may not
 * play today. Orange is still valid (under a month left) and stays out of the filter; its chip already warns.
 */
export function isMedicalNotValid(status: MedicalStatus): boolean {
  return status === 'red'
}

/** The chip's word: the state's label, with the formatted day where the state has one. */
export function medicalStatusText(
  item: Pick<MedicalStatusItem, 'state' | 'validUntil'>,
  labels: MedicalStatusLabels,
  formatDate: (day: string) => string = (day) => day,
): string {
  if (item.state === 'missing') return labels.missing
  if (!DATED_STATES.has(item.state) || !item.validUntil) return labels.unknown
  const date = formatDate(item.validUntil)
  if (item.state === 'expired') return labels.expired(date)
  return item.state === 'expiring' ? labels.expiring(date) : labels.valid(date)
}

/** The request URLs for `personIds`: unique, sorted (a stable cache key) and in batches the route accepts. */
export function medicalStatusUrls(personIds: readonly string[]): string[] {
  const ids = [...new Set(personIds.filter((id) => id.length > 0))].sort()
  const urls: string[] = []
  for (let start = 0; start < ids.length; start += MEDICAL_STATUS_BATCH) {
    const batch = ids.slice(start, start + MEDICAL_STATUS_BATCH)
    urls.push(`${MEDICAL_STATUS_PATH}?personIds=${encodeURIComponent(batch.join(','))}`)
  }
  return urls
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseItem(value: unknown): MedicalStatusItem | null {
  if (!isRecord(value)) return null
  const { personId, status, state, validUntil } = value
  if (typeof personId !== 'string' || typeof status !== 'string' || typeof state !== 'string') return null
  if (!STATUSES.has(status) || !STATES.has(state)) return null
  return {
    personId,
    status: status as MedicalStatus,
    state: state as MedicalState,
    validUntil: typeof validUntil === 'string' ? validUntil : null,
  }
}

/** The statuses by person from one or more answers; anything malformed is skipped, never thrown. */
export function medicalStatusesById(bodies: readonly unknown[]): Map<string, MedicalStatusItem> {
  const byId = new Map<string, MedicalStatusItem>()
  for (const body of bodies) {
    const items = isRecord(body) && Array.isArray(body.items) ? (body.items as unknown[]) : []
    for (const raw of items) {
      const item = parseItem(raw)
      if (item) byId.set(item.personId, item)
    }
  }
  return byId
}

/** The people (in the given order) whose status is not valid (red), for the filter and the match squad's warning. */
export function notValidPersonIds(
  personIds: readonly string[],
  statuses: ReadonlyMap<string, MedicalStatusItem>,
): string[] {
  return personIds.filter((id) => {
    const item = statuses.get(id)
    return item ? isMedicalNotValid(item.status) : false
  })
}
