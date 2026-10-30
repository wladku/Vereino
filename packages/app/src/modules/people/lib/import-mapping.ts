// The column mapping of the family import (club spec REQ-036, DD-38; #28): which column of the club's sheet holds
// which field of the participant, of up to two guardians and the group. The administrator maps the columns once per
// import; the suggestion reads the header in English and Polish (diacritics and punctuation ignored). Pure.

export const IMPORT_SLOTS = ['participant', 'guardian1', 'guardian2'] as const
export type ImportSlot = (typeof IMPORT_SLOTS)[number]
export type GuardianSlot = Exclude<ImportSlot, 'participant'>
export const GUARDIAN_SLOTS: readonly GuardianSlot[] = ['guardian1', 'guardian2']

export const IMPORT_PERSON_FIELDS = [
  'firstName',
  'lastName',
  'birthDate',
  'pesel',
  'externalId',
  'email',
  'phone',
] as const
export type ImportPersonField = (typeof IMPORT_PERSON_FIELDS)[number]

export type ImportField = `${ImportSlot}.${ImportPersonField}` | 'group'

export const IMPORT_FIELDS: readonly ImportField[] = [
  ...IMPORT_SLOTS.flatMap((slot) => IMPORT_PERSON_FIELDS.map((field): ImportField => `${slot}.${field}`)),
  'group',
]

/** Field → 0-based column index of the header. A field left out is not imported. */
export type ImportMapping = Partial<Record<ImportField, number>>

export function slotField(slot: ImportSlot, field: ImportPersonField): ImportField {
  return `${slot}.${field}`
}

/** Lower case, Polish letters without diacritics, every run of other characters as one space. */
export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const PERSON_SYNONYMS: Record<ImportPersonField, readonly string[]> = {
  firstName: ['first name', 'firstname', 'given name', 'name', 'imie'],
  lastName: ['last name', 'lastname', 'surname', 'family name', 'nazwisko'],
  birthDate: ['birth date', 'birthdate', 'date of birth', 'dob', 'data urodzenia', 'data ur', 'urodzony', 'urodzona'],
  pesel: ['pesel'],
  externalId: ['external id', 'id', 'identifier', 'member id', 'member number', 'identyfikator', 'nr', 'numer'],
  email: ['email', 'e mail', 'mail', 'adres email', 'adres e mail'],
  phone: ['phone', 'phone number', 'mobile', 'telephone', 'telefon', 'tel', 'nr telefonu', 'komorka'],
}

const PARTICIPANT_QUALIFIERS = ['', 'child', 'participant', 'player', 'member', 'dziecka', 'uczestnika', 'zawodnika']
const GUARDIAN_QUALIFIERS = ['guardian', 'parent', 'opiekuna', 'rodzica']
const GROUP_SYNONYMS = ['group', 'team', 'class', 'grupa', 'druzyna', 'zespol', 'rocznik']

function qualified(base: string, qualifier: string): string[] {
  if (!qualifier) return [base]
  // "child first name", "first name child", "imie dziecka", "dziecka imie"
  return [`${qualifier} ${base}`, `${base} ${qualifier}`]
}

function guardianHeaders(base: string, slot: GuardianSlot): string[] {
  const number = slot === 'guardian1' ? '1' : '2'
  return GUARDIAN_QUALIFIERS.flatMap((qualifier) => [
    ...qualified(base, `${qualifier} ${number}`),
    ...qualified(base, `${number} ${qualifier}`),
    ...(slot === 'guardian1' ? qualified(base, qualifier) : []),
  ])
}

/** Every normalized header that suggests the field, most specific first. */
function synonymsOf(field: ImportField): string[] {
  if (field === 'group') return GROUP_SYNONYMS
  const [slot, personField] = field.split('.') as [ImportSlot, ImportPersonField]
  const bases = PERSON_SYNONYMS[personField]
  if (slot === 'participant') return bases.flatMap((base) => PARTICIPANT_QUALIFIERS.flatMap((q) => qualified(base, q)))
  return bases.flatMap((base) => guardianHeaders(base, slot))
}

const SYNONYMS: ReadonlyMap<ImportField, ReadonlySet<string>> = new Map(
  IMPORT_FIELDS.map((field) => [field, new Set(synonymsOf(field))]),
)

/** Unqualified contact columns ("E-mail", "Telefon") in a family sheet belong to the first guardian. */
const CONTACT_FIELDS: readonly ImportPersonField[] = ['email', 'phone']

/**
 * The suggested mapping for a header: each field takes the first unused column whose normalized header is one of
 * its synonyms. An unqualified e-mail or phone column goes to the first guardian when the sheet names one, because a
 * club's family sheet lists the parent's contact.
 */
export function suggestMapping(header: readonly string[]): ImportMapping {
  const normalized = header.map(normalizeHeader)
  const used = new Set<number>()
  const mapping: ImportMapping = {}
  for (const field of IMPORT_FIELDS) {
    const synonyms = SYNONYMS.get(field) as ReadonlySet<string>
    const index = normalized.findIndex((name, column) => !used.has(column) && synonyms.has(name))
    if (index < 0) continue
    mapping[field] = index
    used.add(index)
  }
  const moved = new Set<string>()
  if (mapping['guardian1.firstName'] !== undefined) {
    for (const field of CONTACT_FIELDS) {
      const participantField = slotField('participant', field)
      const guardianField = slotField('guardian1', field)
      const column = mapping[participantField]
      if (column === undefined || mapping[guardianField] !== undefined) continue
      if (!PERSON_SYNONYMS[field].includes(normalized[column])) continue
      moved.add(participantField)
      mapping[guardianField] = column
    }
  }
  return Object.fromEntries(Object.entries(mapping).filter(([field]) => !moved.has(field)))
}

export type MappingProblem =
  'column_out_of_range' | 'column_reused' | 'participant_name_required' | 'guardian_name_required'

export type MappingCheck = { ok: true } | { ok: false; problem: MappingProblem; field: ImportField }

/**
 * A mapping the import can work with: every column exists and is used once, the participant's first and last name
 * are mapped, and a guardian with any mapped field has both names mapped.
 */
export function checkMapping(mapping: ImportMapping, columnCount: number): MappingCheck {
  const used = new Set<number>()
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field]
    if (column === undefined) continue
    if (!Number.isInteger(column) || column < 0 || column >= columnCount) {
      return { ok: false, problem: 'column_out_of_range', field }
    }
    if (used.has(column)) return { ok: false, problem: 'column_reused', field }
    used.add(column)
  }
  for (const field of ['participant.firstName', 'participant.lastName'] as const) {
    if (mapping[field] === undefined) return { ok: false, problem: 'participant_name_required', field }
  }
  for (const slot of GUARDIAN_SLOTS) {
    const mapped = IMPORT_PERSON_FIELDS.some((field) => mapping[slotField(slot, field)] !== undefined)
    if (!mapped) continue
    for (const field of ['firstName', 'lastName'] as const) {
      const key = slotField(slot, field)
      if (mapping[key] === undefined) return { ok: false, problem: 'guardian_name_required', field: key }
    }
  }
  return { ok: true }
}
