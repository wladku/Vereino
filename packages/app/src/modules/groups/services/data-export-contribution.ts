// The `groups` person data export contributor (person data export spec `.ai/specs/implemented/2026-11-21-vereino-person-data-export.md`,
// DD-X01, *Contributor inventory* → `groups`; #527, phase X2): `people` declares the contract
// (`people/services/data-export.ts`) and reads it with `hasRegistration`; `groups` registers it in `di.ts` under
// `people.dataExport.groups`. The part is the subject's own memberships, live ones only, each with its group's name
// and its status on the club's day. Every query filters by the subject's tenant and organization.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { PersonDataExportContributor } from '../../people/services/data-export'
import { Group, GroupMembership } from '../data/entities'
import {
  GROUPS_EXPORT_MODULE,
  GROUPS_MEMBERSHIPS_ACTIVITY,
  GROUPS_MEMBERSHIPS_TABLE,
  membershipExportRow,
} from '../lib/data-export'
import { clubToday } from './club-clock'

/** The token `people` reads (`dataExportContributorToken('groups')` in `people/services/data-export.ts`). */
export const GROUPS_DATA_EXPORT_CONTRIBUTOR = 'people.dataExport.groups'

export function createDataExportContribution(container: AwilixContainer): PersonDataExportContributor {
  return {
    async export(em: EntityManager, subject) {
      const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
      const memberships = await em.find(
        GroupMembership,
        { ...scope, personId: subject.personId, deletedAt: null },
        { orderBy: { validFrom: 'asc', id: 'asc' } },
      )
      const groupIds = [...new Set(memberships.map((row) => row.groupId))]
      const groups =
        groupIds.length > 0
          ? await em.find(Group, { ...scope, id: { $in: groupIds }, deletedAt: null }, { fields: ['id', 'name'] })
          : []
      const names = new Map(groups.map((group) => [group.id, group.name]))
      const today = await clubToday(container, scope)
      return {
        sections: [
          {
            module: GROUPS_EXPORT_MODULE,
            table: GROUPS_MEMBERSHIPS_TABLE,
            activity: GROUPS_MEMBERSHIPS_ACTIVITY,
            portable: false,
            rows: memberships.map((row) => membershipExportRow(row, names.get(row.groupId), today)),
          },
        ],
        actorCounts: [],
      }
    },
  }
}
