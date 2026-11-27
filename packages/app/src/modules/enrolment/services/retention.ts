// The anonymisation of applications (sign-up form spec *Anonymised application*, R23, REQ-J18; #799, #800), shared by
// the daily job (closed 30 days ago) and the erasure of a person (`people.departure.enrolment`): every encrypted
// column, the keys, the locale, the duplicates and the person links are cleared, the birth date keeps its year; the
// confirmation and status links are deleted. Kept for statistics: state, dates, section, group, kind, age fit, trial
// outcome, `accepted_membership_id` and the acknowledgement times with the text version. In the caller's transaction;
// no command file is imported here, so `di.ts` may load it (lesson `di-reaches-no-command-file`).
import type { EntityManager } from '@mikro-orm/postgresql'
import { Application, ApplicationLink, ConfirmationLink } from '../data/entities'
import { anonymisedBirthDate } from '../lib/applications'
import type { EnrolmentScope } from './directory'

/** Anonymises the not yet anonymised applications among `ids`; returns how many changed. */
export async function anonymiseApplications(
  em: EntityManager,
  scope: EnrolmentScope,
  ids: readonly string[],
  at: Date,
): Promise<number> {
  if (ids.length === 0) return 0
  const rows = await em.find(
    Application,
    { ...scope, id: { $in: [...ids] }, anonymizedAt: null },
    { fields: ['id', 'participantBirthDate'] },
  )
  for (const row of rows) {
    await em.nativeUpdate(
      Application,
      { ...scope, id: row.id, anonymizedAt: null },
      {
        participantFirstName: null,
        participantLastName: null,
        guardianFirstName: null,
        guardianLastName: null,
        guardianEmail: null,
        guardianPhone: null,
        note: null,
        decisionReason: null,
        participantBirthDate: anonymisedBirthDate(row.participantBirthDate ?? null),
        applicantKey: null,
        emailKey: null,
        locale: null,
        duplicateCandidates: null,
        acceptedChildPersonId: null,
        acceptedGuardianPersonId: null,
        anonymizedAt: at,
        updatedAt: at,
      },
    )
  }
  const changed = rows.map((row) => row.id)
  if (changed.length > 0) {
    await em.nativeDelete(ConfirmationLink, { ...scope, applicationId: { $in: changed } })
    await em.nativeDelete(ApplicationLink, { ...scope, applicationId: { $in: changed } })
  }
  return changed.length
}

/** The live applications that became `personId` (as the participant or the guardian), not yet anonymised. */
export function applicationsOfPerson(em: EntityManager, scope: EnrolmentScope, personId: string) {
  return em.find(
    Application,
    {
      ...scope,
      deletedAt: null,
      anonymizedAt: null,
      $or: [{ acceptedChildPersonId: personId }, { acceptedGuardianPersonId: personId }],
    },
    { fields: ['id'], orderBy: { createdAt: 'asc', id: 'asc' } },
  )
}
