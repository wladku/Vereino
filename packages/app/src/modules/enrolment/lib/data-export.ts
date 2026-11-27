// The `enrolment` part of the person data export (sign-up form spec *Events* → Data export, REQ-J18; person data export
// spec DD-X01, DD-X03; phase 3, #800): an application that became the subject — as the participant (the child, or the
// adult) or as the guardian of a child — until it is anonymised. The subject's own data is shown in full; the other
// person of a child's application appears by relation and name only (`guardian` / `ward`, the named relations of
// DD-X03), never with that person's contact data. Pure: the decrypted row and the subject's id are passed in.

export const ENROLMENT_EXPORT_MODULE = 'enrolment' as const
export const ENROLMENT_APPLICATIONS_TABLE = 'enrolment_applications' as const
/** RoPA A17 — applications to a section (`docs/compliance/ropa.md`). */
export const ENROLMENT_APPLICATIONS_ACTIVITY = 'A17' as const

export type ApplicationExportSource = {
  id: string
  kind: string
  state: string
  sectionName: string | null
  participantFirstName: string | null
  participantLastName: string | null
  participantBirthDate: string | null
  guardianFirstName: string | null
  guardianLastName: string | null
  email: string | null
  phone: string | null
  wantsTrial: boolean
  experience: string | null
  rulesAcceptedAt: Date
  privacyAcknowledgedAt: Date
  createdAt: Date
  confirmedAt: Date | null
  decidedAt: Date | null
  closedAt: Date | null
  acceptedChildPersonId: string | null
  acceptedGuardianPersonId: string | null
}

/** Another person of the application, as the export shows them: the relation and the name. */
export type ExportedOtherPerson = { relation: 'guardian' | 'ward'; name?: string }

export type ApplicationExportRow = {
  id: string
  /** The subject's part in the application. */
  role: 'participant' | 'guardian'
  kind: string
  state: string
  section: string | null
  participant: { firstName: string | null; lastName: string | null; birthDate: string | null } | ExportedOtherPerson
  contact: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null
  guardian: ExportedOtherPerson | null
  wantsTrial: boolean
  experience: string | null
  rulesAcceptedAt: string
  privacyAcknowledgedAt: string
  sentAt: string
  confirmedAt: string | null
  decidedAt: string | null
  closedAt: string | null
}

function fullName(first: string | null, last: string | null): string | undefined {
  const name = [first, last].filter(Boolean).join(' ').trim()
  return name.length > 0 ? name : undefined
}

function other(relation: ExportedOtherPerson['relation'], name: string | undefined): ExportedOtherPerson {
  return name ? { relation, name } : { relation }
}

const iso = (value: Date | null) => (value ? value.toISOString() : null)

/**
 * One application as the subject's file shows it. The participant of an adult's application, or the participant of a
 * child's application, sees the application's data about themself and the contact they gave (an adult) or the guardian
 * by name (a child); the guardian sees their own contact data and the child by name.
 */
export function applicationExportRow(row: ApplicationExportSource, subjectPersonId: string): ApplicationExportRow {
  const asGuardian = row.kind === 'child' && row.acceptedGuardianPersonId === subjectPersonId
  const participantName = fullName(row.participantFirstName, row.participantLastName)
  const guardianName = fullName(row.guardianFirstName, row.guardianLastName)
  const ownContact = { email: row.email, phone: row.phone }
  return {
    id: row.id,
    role: asGuardian ? 'guardian' : 'participant',
    kind: row.kind,
    state: row.state,
    section: row.sectionName,
    participant: asGuardian
      ? other('ward', participantName)
      : { firstName: row.participantFirstName, lastName: row.participantLastName, birthDate: row.participantBirthDate },
    contact: asGuardian
      ? { firstName: row.guardianFirstName, lastName: row.guardianLastName, ...ownContact }
      : row.kind === 'adult'
        ? { firstName: row.participantFirstName, lastName: row.participantLastName, ...ownContact }
        : null,
    guardian: row.kind === 'child' && !asGuardian ? other('guardian', guardianName) : null,
    wantsTrial: row.wantsTrial,
    experience: row.experience,
    rulesAcceptedAt: row.rulesAcceptedAt.toISOString(),
    privacyAcknowledgedAt: row.privacyAcknowledgedAt.toISOString(),
    sentAt: row.createdAt.toISOString(),
    confirmedAt: iso(row.confirmedAt),
    decidedAt: iso(row.decidedAt),
    closedAt: iso(row.closedAt),
  }
}
