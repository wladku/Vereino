// The `enrolment` contributions to `people` (sign-up form spec *Events* → Data export / Erasure, REQ-J18; Ask First
// approved on #788, 2026-11-26: `enrolment` in the allow-lists of `people.dataExport.*` and `people.departure.*`;
// phase 3, #800). `people` declares both contracts and reads them with `hasRegistration`; `enrolment` registers them
// in `di.ts`. An application links to a person only once it is accepted (`accepted_child_person_id`,
// `accepted_guardian_person_id`) and only until it is anonymised 30 days after closing (R23).
// - export: the subject's applications (A17), decrypted, the other person of a child's application by name only;
// - departure: a departure ends nothing here; `erase` anonymises the subject's applications in the anonymisation's
//   transaction. A mistaken person has no history here (the application is not the person's club record).
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { AwilixContainer } from 'awilix'
import type { DataExportRow, PersonDataExportContributor } from '../../people/services/data-export'
import type { DepartureContributor } from '../../people/services/departure'
import { Application } from '../data/entities'
import {
  ENROLMENT_APPLICATIONS_ACTIVITY,
  ENROLMENT_APPLICATIONS_TABLE,
  ENROLMENT_EXPORT_MODULE,
  applicationExportRow,
} from '../lib/data-export'
import { sectionNames } from './directory'
import { anonymiseApplications, applicationsOfPerson } from './retention'

/** The tokens `people` reads (`dataExportContributorToken('enrolment')`, `departureContributorToken('enrolment')`). */
export const ENROLMENT_DATA_EXPORT_CONTRIBUTOR = 'people.dataExport.enrolment'
export const ENROLMENT_DEPARTURE_CONTRIBUTOR = 'people.departure.enrolment'

export function createDataExportContribution(container: AwilixContainer): PersonDataExportContributor {
  return {
    async export(em, subject) {
      const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
      const ids = (await applicationsOfPerson(em, scope, subject.personId)).map((row) => row.id)
      const rows =
        ids.length === 0
          ? []
          : await findWithDecryption(
              em,
              Application,
              { ...scope, id: { $in: ids } },
              { orderBy: { createdAt: 'asc', id: 'asc' } },
              scope,
            )
      const names = await sectionNames(container, scope, [...new Set(rows.map((row) => row.sectionId))], em)
      return {
        sections: [
          {
            module: ENROLMENT_EXPORT_MODULE,
            table: ENROLMENT_APPLICATIONS_TABLE,
            activity: ENROLMENT_APPLICATIONS_ACTIVITY,
            // Data the applicant provided to enter the membership (art. 20(1)(a)).
            portable: true,
            rows: rows.map(
              (row) =>
                applicationExportRow(
                  {
                    id: row.id,
                    kind: row.kind,
                    state: row.state,
                    sectionName: names.get(row.sectionId) ?? null,
                    participantFirstName: row.participantFirstName ?? null,
                    participantLastName: row.participantLastName ?? null,
                    participantBirthDate: row.participantBirthDate ?? null,
                    guardianFirstName: row.guardianFirstName ?? null,
                    guardianLastName: row.guardianLastName ?? null,
                    email: row.guardianEmail ?? null,
                    phone: row.guardianPhone ?? null,
                    wantsTrial: row.wantsTrial,
                    experience: row.experience ?? null,
                    rulesAcceptedAt: row.rulesAcceptedAt,
                    privacyAcknowledgedAt: row.privacyAcknowledgedAt,
                    createdAt: row.createdAt,
                    confirmedAt: row.confirmedAt ?? null,
                    decidedAt: row.decidedAt ?? null,
                    closedAt: row.closedAt ?? null,
                    acceptedChildPersonId: row.acceptedChildPersonId ?? null,
                    acceptedGuardianPersonId: row.acceptedGuardianPersonId ?? null,
                  },
                  subject.personId,
                ) as unknown as DataExportRow,
            ),
          },
        ],
        actorCounts: [],
      }
    },
  }
}

export const departureContribution: DepartureContributor = {
  preview: () => Promise.resolve({ items: [], warnings: [], blockers: [] }),
  apply: () => Promise.resolve({ snapshot: null, changes: [] }),
  undo: () => Promise.resolve([]),
  afterCommit: () => Promise.resolve(),
  hasHistory: () => Promise.resolve(false),
  async erase(em, subject) {
    const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
    const ids = (await applicationsOfPerson(em, scope, subject.personId)).map((row) => row.id)
    const rows = await anonymiseApplications(em, scope, ids, new Date())
    return { touched: rows > 0 ? [{ table: ENROLMENT_APPLICATIONS_TABLE, rows }] : [], kept: [] }
  },
}
