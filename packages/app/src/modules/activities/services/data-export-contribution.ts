// The `activities` data export contributor (person data export spec `.ai/specs/2026-11-21-vereino-person-data-export.md`,
// DD-X01, DD-X03, DD-X06, *Contributor inventory* → `activities`; phase X2, #527): `people` declares the contract
// (`people/services/data-export.ts`) and reads it with `hasRegistration`; `activities` registers it in `di.ts` under
// `people.dataExport.activities`. Read only, in the caller's EntityManager: every query filters by the subject's tenant
// and organization (and `deleted_at` where the table has one; the contact log and the substitution entries are
// append-only and have none). The substitution reason is decrypted with `findWithDecryption`; the coaches' names come
// from `people.personDirectory` (`services/directory.ts`), never from `people` entities. The declaration token hash and
// the contact reader's user id are never selected into a row. The mapping is `lib/data-export.ts`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { PersonDataExportContributor, PersonDataExportSubject } from '../../people/services/data-export'
import {
  Activity,
  Attendance,
  ContactAccessLog,
  DeclarationToken,
  Occurrence,
  SubstitutionEntry,
} from '../data/entities'
import { activitiesExportPart, attendedCoachIds, exportSessionIds, type ExportSession } from '../lib/data-export'
import { findPersons } from './directory'

/** The token `people` reads (`dataExportContributorToken('activities')` in `people/services/data-export.ts`). */
export const ACTIVITIES_DATA_EXPORT_CONTRIBUTOR = 'people.dataExport.activities'

type Scope = { tenantId: string; organizationId: string }

/** The ids of the contact reads whose `resource_ids` include the subject, in the subject's tenant and organization. */
async function contactReadIds(em: EntityManager, scope: Scope, personId: string): Promise<string[]> {
  const rows = await em.getConnection().execute<Array<{ id: string }>>(
    `select id from activities_contact_access_log
      where tenant_id = ? and organization_id = ? and ?::uuid = any(resource_ids)`,
    [scope.tenantId, scope.organizationId, personId],
  )
  return rows.map((row) => row.id)
}

/** The other persons' rows only: `column` is null or not the subject. */
function notSubject(column: 'previousCoachPersonId' | 'newCoachPersonId', personId: string) {
  return { $or: [{ [column]: null }, { [column]: { $ne: personId } }] }
}

async function exportActivities(container: AwilixContainer, em: EntityManager, subject: PersonDataExportSubject) {
  const scope: Scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
  const live = { ...scope, deletedAt: null }
  const personId = subject.personId
  const byCreation = { orderBy: { createdAt: 'asc', id: 'asc' } } as const
  // One query at a time: `em` may be a single connection.
  const attendances = await em.find(Attendance, { ...live, personId }, byCreation)
  const tokens = await em.find(DeclarationToken, { ...live, guardianPersonId: personId }, byCreation)
  const readIds = await contactReadIds(em, scope, personId)
  const contactReads =
    readIds.length > 0 ? await em.find(ContactAccessLog, { ...scope, id: { $in: readIds } }, byCreation) : []
  const substitutions = await findWithDecryption(
    em,
    SubstitutionEntry,
    { ...scope, $or: [{ previousCoachPersonId: personId }, { newCoachPersonId: personId }] },
    byCreation,
    scope,
  )
  const sessionIds = exportSessionIds([...attendances, ...tokens, ...contactReads, ...substitutions])
  const sessionRows =
    sessionIds.length > 0
      ? await em.find(
          Occurrence,
          { ...live, id: { $in: sessionIds } },
          { fields: ['id', 'activityId', 'groupId', 'occurrenceDate', 'startAt', 'coachPersonId'] },
        )
      : []
  const sessions = new Map<string, ExportSession>(sessionRows.map((row) => [row.id, row]))
  const coachIds = attendedCoachIds(personId, attendances, sessions)
  const coaches = await findPersons(container, scope, coachIds, em)
  const coachNames = new Map([...coaches].map(([id, entry]) => [id, `${entry.firstName} ${entry.lastName}`]))

  const sessionsCoached = await em.count(Occurrence, { ...live, coachPersonId: personId })
  const defaultCoachActivities = await em.count(Activity, { ...live, defaultCoachPersonId: personId })
  const attendanceMarked = await em.count(Attendance, {
    ...live,
    markedByPersonId: personId,
    personId: { $ne: personId },
  })
  const substitutionsDecided = await em.count(SubstitutionEntry, {
    ...scope,
    decidedByPersonId: personId,
    $and: [notSubject('previousCoachPersonId', personId), notSubject('newCoachPersonId', personId)],
  })
  const contactReadsByUser = subject.userId
    ? await em.count(ContactAccessLog, { ...scope, actorUserId: subject.userId })
    : 0

  return activitiesExportPart({
    personId,
    attendances,
    tokens,
    contactReads,
    substitutions,
    sessions,
    coachNames,
    counts: {
      sessionsCoached,
      defaultCoachActivities,
      attendanceMarked,
      substitutionsDecided,
      contactReads: contactReadsByUser,
    },
  })
}

export function createDataExportContribution(container: AwilixContainer): PersonDataExportContributor {
  return {
    export: (em, subject) => exportActivities(container, em, subject),
  }
}
