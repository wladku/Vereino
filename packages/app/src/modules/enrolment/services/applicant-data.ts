// The applicant's data subject request (sign-up form spec *Users* → Instance operator, *API* → applicant CLI, REQ-J18;
// phase 3, #800): an applicant who never became a member has no person record, so the operator finds the applications
// by the keyed hash of the address (`email_key`) inside one club given on the command line. Read only; the erasure is
// the command `enrolment.applications.erase_applicant`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Application } from '../data/entities'
import type { EnrolmentScope } from './directory'
import { emailKey } from './links'

export type ApplicantApplicationView = {
  id: string
  sectionId: string
  groupId: string | null
  kind: string
  state: string
  participantFirstName: string | null
  participantLastName: string | null
  participantBirthDate: string | null
  guardianFirstName: string | null
  guardianLastName: string | null
  email: string | null
  phone: string | null
  note: string | null
  decisionReason: string | null
  wantsTrial: boolean
  experience: string | null
  createdAt: string
  confirmedAt: string | null
  decidedAt: string | null
  closedAt: string | null
  acceptedChildPersonId: string | null
  acceptedGuardianPersonId: string | null
}

/** The address's applications in the club, decrypted, oldest first (anonymised ones have no key and are not found). */
export async function applicantApplications(
  container: AwilixContainer,
  scope: EnrolmentScope,
  email: string,
): Promise<ApplicantApplicationView[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await findWithDecryption(
    em,
    Application,
    { ...scope, emailKey: emailKey(scope, email), deletedAt: null },
    { orderBy: { createdAt: 'asc', id: 'asc' } },
    scope,
  )
  const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null)
  return rows.map((row) => ({
    id: row.id,
    sectionId: row.sectionId,
    groupId: row.groupId ?? null,
    kind: row.kind,
    state: row.state,
    participantFirstName: row.participantFirstName ?? null,
    participantLastName: row.participantLastName ?? null,
    participantBirthDate: row.participantBirthDate ?? null,
    guardianFirstName: row.guardianFirstName ?? null,
    guardianLastName: row.guardianLastName ?? null,
    email: row.guardianEmail ?? null,
    phone: row.guardianPhone ?? null,
    note: row.note ?? null,
    decisionReason: row.decisionReason ?? null,
    wantsTrial: row.wantsTrial,
    experience: row.experience ?? null,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: iso(row.confirmedAt),
    decidedAt: iso(row.decidedAt),
    closedAt: iso(row.closedAt),
    acceptedChildPersonId: row.acceptedChildPersonId ?? null,
    acceptedGuardianPersonId: row.acceptedGuardianPersonId ?? null,
  }))
}
