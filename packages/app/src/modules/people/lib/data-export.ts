// The person data export document (person data export spec `.ai/specs/implemented/2026-11-21-vereino-person-data-export.md`,
// DD-X02, DD-X03, DD-X05, *Domain Vocabulary*; #527): pure rules for the art. 15/20 file — how another person is
// shown (`redactPerson`), which parts are left out and why (`omittedParts`), which free-text fields the administrator
// checks before sending (`reviewRequiredOf`), the secret keys no row may carry (`withoutSecrets`) and the assembly of
// the versioned document (`assembleDataExport`).

export const DATA_EXPORT_FORMAT = 'vereino.person-data-export' as const
export const DATA_EXPORT_VERSION = 1 as const

/** The feature that reads a PESEL (DD-X08). */
export const PESEL_FEATURE = 'people.pesel.view'

/**
 * The PESEL value for a caller without `people.pesel.view` (DD-X08): "withheld:" and the feature id in square
 * brackets. Built from parts because `yarn ds:check` reads a bracketed `word:` literal as a Tailwind arbitrary value.
 */
export const PESEL_WITHHELD = '[' + `withheld: ${PESEL_FEATURE}` + ']'

/** The audit log row's purpose and resource kind (DD-X04). */
export const DATA_EXPORT_PURPOSE = 'data_subject_export' as const
export const DATA_EXPORT_RESOURCE_KIND = 'people:person' as const

export type DataExportRow = Record<string, unknown>

/** One table's rows about the subject (*Section*). */
export type DataExportSection = {
  module: string
  table: string
  /** The RoPA activity id (`docs/compliance/ropa.md`, A1–A13). */
  activity: string
  /** Art. 20 data the person provided (J-X02). */
  portable: boolean
  rows: DataExportRow[]
  /** `communication_thread_messages` only: messages of other authors left out. */
  omittedOtherAuthors?: number
  /** Free-text fields to check for third-party data before sending (A-9). */
  reviewFields?: string[]
}

/** Rows where the subject only acted as staff, counted per table (DD-X06). */
export type DataExportActorCount = { module: string; table: string; count: number }

export type DataExportOmittedReason =
  'module_not_enabled' | 'no_contributor' | 'security_audit_not_subject_data' | 'attachment_binary'

export type DataExportOmitted = { module?: string; category?: string; reason: DataExportOmittedReason }

export type DataExportReviewItem = { module: string; table: string; recordId: string; field: string }

/** What one module adds: its sections and its actor counts. */
export type DataExportPart = { sections: DataExportSection[]; actorCounts: DataExportActorCount[] }

export type PersonDataExportDocument = {
  format: typeof DATA_EXPORT_FORMAT
  version: typeof DATA_EXPORT_VERSION
  generatedAt: string
  subject: DataExportRow
  sections: DataExportSection[]
  actorCounts: DataExportActorCount[]
  reviewRequired: DataExportReviewItem[]
  omitted: DataExportOmitted[]
}

/** Another person as the file shows them: the relation, plus the name only where the link is the subject's data. */
export type OtherPersonRef = { relation: string; name?: string }

/**
 * The relations whose display name the file keeps (DD-X03): the guardian or ward of a guardianship, the payer or
 * debtor of a charge, the orderer of a ward's order, the coach of a session the subject attended.
 */
export const NAMED_RELATIONS: ReadonlySet<string> = new Set(['guardian', 'ward', 'payer', 'debtor', 'orderer', 'coach'])

/** Another person, never by id (art. 15(4)): the relation, and the name only for a `NAMED_RELATIONS` link. */
export function redactPerson(relation: string, name?: string | null): OtherPersonRef {
  const trimmed = name?.trim()
  return NAMED_RELATIONS.has(relation) && trimmed ? { relation, name: trimmed } : { relation }
}

type ConsentEntryView = { readonly granted: boolean; readonly at: string | null; readonly byPersonId: string | null }

/**
 * Consents as the file shows them: the state and date, and who gave them as `subject` or `other` — never another
 * person's id (DD-X03).
 */
export function redactConsents(
  view: Readonly<Record<string, ConsentEntryView>>,
  subjectId: string,
): Record<string, { granted: boolean; at: string | null; by: 'subject' | 'other' | null }> {
  return Object.fromEntries(
    Object.entries(view).map(([kind, entry]) => [
      kind,
      {
        granted: entry.granted,
        at: entry.at,
        by: entry.byPersonId === null ? null : entry.byPersonId === subjectId ? 'subject' : 'other',
      },
    ]),
  )
}

/** The DD-X05 categories, always left out with the same reason. */
export const SECURITY_AUDIT_CATEGORIES = ['action_logs', 'access_log', 'application_logs', 'backups'] as const

/** Attachment binaries are listed by metadata only (A-7). */
export const ATTACHMENT_BINARY_CATEGORY = 'attachment_binaries' as const

export type ContributorState = { module: string; enabled: boolean; registered: boolean }

/**
 * The `omitted` block: each contributing module that is not enabled or registers no contributor, then the DD-X05
 * categories and the attachment binaries.
 */
export function omittedParts(states: readonly ContributorState[]): DataExportOmitted[] {
  const modules = states.flatMap((state): DataExportOmitted[] => {
    if (!state.enabled) return [{ module: state.module, reason: 'module_not_enabled' }]
    if (!state.registered) return [{ module: state.module, reason: 'no_contributor' }]
    return []
  })
  return [
    ...modules,
    ...SECURITY_AUDIT_CATEGORIES.map((category): DataExportOmitted => ({
      category,
      reason: 'security_audit_not_subject_data',
    })),
    { category: ATTACHMENT_BINARY_CATEGORY, reason: 'attachment_binary' },
  ]
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

/** Every `reviewFields` field that holds a value, per row (`recordId` = the row's `id`). */
export function reviewRequiredOf(sections: readonly DataExportSection[]): DataExportReviewItem[] {
  return sections.flatMap((section) =>
    (section.reviewFields ?? []).flatMap((field) =>
      section.rows
        .filter((row) => hasValue(row[field]))
        .map((row) => ({
          module: section.module,
          table: section.table,
          recordId: typeof row.id === 'string' ? row.id : '',
          field,
        })),
    ),
  )
}

/** Keys no exported row may carry: lookup and token hashes, delivery and dispatch parameters. */
const SECRET_KEYS: ReadonlySet<string> = new Set(['secretParams', 'secret_params', 'params', 'token', 'tokenHash'])

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key) || /hash$/i.test(key)
}

/** The value without secret keys, at any depth (a safety net behind each contributor's own choice of columns). */
export function withoutSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecrets)
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !isSecretKey(key))
        .map(([key, item]) => [key, withoutSecrets(item)]),
    )
  }
  return value
}

export type DataExportInput = {
  generatedAt: Date
  subject: DataExportRow
  parts: readonly DataExportPart[]
  omitted: readonly DataExportOmitted[]
}

/** The version 1 document: secrets dropped, empty actor counts dropped, the review list computed. */
export function assembleDataExport(input: DataExportInput): PersonDataExportDocument {
  const sections = input.parts
    .flatMap((part) => part.sections)
    .map((section) => ({ ...section, rows: section.rows.map((row) => withoutSecrets(row) as DataExportRow) }))
  return {
    format: DATA_EXPORT_FORMAT,
    version: DATA_EXPORT_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    subject: withoutSecrets(input.subject) as DataExportRow,
    sections,
    actorCounts: input.parts.flatMap((part) => part.actorCounts).filter((entry) => entry.count > 0),
    reviewRequired: reviewRequiredOf(sections),
    omitted: [...input.omitted],
  }
}

/** The download's file name: the date only, never a name (*Security*). */
export function dataExportFileName(generatedAt: Date): string {
  return `person-data-${generatedAt.toISOString().slice(0, 10)}.json`
}
