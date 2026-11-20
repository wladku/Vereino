// The `activities` side of the group kind guard and of the roster's Remove (groups and activities parity spec REQ-A02,
// REQ-A03; #266, #267). `groups` owns the
// contract (`groups/services/group-usage.ts`) and resolves it with `hasRegistration`; `activities` registers it in
// `di.ts` under the token `groups` names, so the dependency stays `activities` → `groups`. A match is a live
// (`deleted_at IS NULL`) activity of a team-only type (`match`, `sparring`), active or not. A membership is used when
// the person has a live attendance row in a live session of the group whose slot day lies within its period. A group
// move (people life-cycle spec REQ-L11, REQ-L15; #383) reads, drops and on undo restores the person's unmarked rows
// of the group's later sessions in the move's own transaction.
import type { GroupUsageContract } from '../../groups/services/group-usage'
import { Activity, Attendance } from '../data/entities'
import { TEAM_ONLY_TYPES } from '../lib/activities-rules'

/** The token `groups` reads (`ACTIVITIES_GROUP_USAGE` in `groups/services/group-usage.ts`). */
export const ACTIVITIES_GROUP_USAGE = 'activities.groupUsage'

/** The columns `membershipUsed` reads, typed for the Kysely query. */
type GroupUsageDatabase = {
  activities_attendances: {
    id: string
    tenant_id: string
    organization_id: string
    occurrence_id: string
    person_id: string
    actual: string | null
    deleted_at: Date | null
  }
  activities_occurrences: {
    id: string
    tenant_id: string
    organization_id: string
    group_id: string
    occurrence_date: string
    deleted_at: Date | null
  }
}

export const groupUsage: GroupUsageContract = {
  matchActivityCount(em, { tenantId, organizationId, groupId }) {
    return em.count(Activity, {
      tenantId,
      organizationId,
      groupId,
      type: { $in: [...TEAM_ONLY_TYPES] },
      deletedAt: null,
    })
  },
  async membershipUsed(em, { tenantId, organizationId, groupId, personId, from, to }) {
    // One indexed query (#359): the person's live attendance joined to the group's live sessions in the period. Read
    // through the EntityManager's Kysely client, which stays on the command's transaction.
    let query = em
      .getKysely<GroupUsageDatabase>()
      .selectFrom('activities_attendances as a')
      .innerJoin('activities_occurrences as o', 'o.id', 'a.occurrence_id')
      .select('a.id')
      .where('a.tenant_id', '=', tenantId)
      .where('a.organization_id', '=', organizationId)
      .where('a.person_id', '=', personId)
      .where('a.deleted_at', 'is', null)
      .where('o.tenant_id', '=', tenantId)
      .where('o.organization_id', '=', organizationId)
      .where('o.group_id', '=', groupId)
      .where('o.deleted_at', 'is', null)
      .where('o.occurrence_date', '>=', from)
    if (to) query = query.where('o.occurrence_date', '<=', to)
    const used = await query.limit(1).executeTakeFirst()
    return used !== undefined
  },
  async pendingDeclarations(em, { tenantId, organizationId, groupId, personIds, from }) {
    const byPerson = new Map<string, string[]>()
    if (personIds.length === 0) return byPerson
    const rows = await em
      .getKysely<GroupUsageDatabase>()
      .selectFrom('activities_attendances as a')
      .innerJoin('activities_occurrences as o', 'o.id', 'a.occurrence_id')
      .select(['a.id', 'a.person_id'])
      .where('a.tenant_id', '=', tenantId)
      .where('a.organization_id', '=', organizationId)
      .where('a.person_id', 'in', [...personIds])
      .where('a.actual', 'is', null)
      .where('a.deleted_at', 'is', null)
      .where('o.tenant_id', '=', tenantId)
      .where('o.organization_id', '=', organizationId)
      .where('o.group_id', '=', groupId)
      .where('o.deleted_at', 'is', null)
      .where('o.occurrence_date', '>=', from)
      .orderBy('a.id')
      .execute()
    for (const row of rows) byPerson.set(row.person_id, [...(byPerson.get(row.person_id) ?? []), row.id])
    return byPerson
  },
  async dropDeclarations(em, scope, attendanceIds) {
    if (attendanceIds.length === 0) return []
    const rows = await em.find(
      Attendance,
      { ...scope, id: { $in: [...attendanceIds] }, actual: null, deletedAt: null },
      { fields: ['id'] },
    )
    const ids = rows.map((row) => row.id)
    if (ids.length === 0) return []
    const droppedAt = new Date()
    await em.nativeUpdate(Attendance, { ...scope, id: { $in: ids } }, { deletedAt: droppedAt, updatedAt: droppedAt })
    return ids
  },
  async restoreDeclarations(em, scope, attendanceIds) {
    if (attendanceIds.length === 0) return 0
    const dropped = await em.find(
      Attendance,
      { ...scope, id: { $in: [...attendanceIds] }, actual: null, deletedAt: { $ne: null } },
      { fields: ['id', 'occurrenceId', 'personId'] },
    )
    if (dropped.length === 0) return 0
    // A session the person declared again since keeps the new row (one live row per session and person).
    const live = await em.find(
      Attendance,
      {
        ...scope,
        occurrenceId: { $in: [...new Set(dropped.map((row) => row.occurrenceId))] },
        deletedAt: null,
      },
      { fields: ['occurrenceId', 'personId'] },
    )
    const taken = new Set(live.map((row) => `${row.occurrenceId}:${row.personId}`))
    const ids = dropped.filter((row) => !taken.has(`${row.occurrenceId}:${row.personId}`)).map((row) => row.id)
    if (ids.length === 0) return 0
    return em.nativeUpdate(Attendance, { ...scope, id: { $in: ids } }, { deletedAt: null, updatedAt: new Date() })
  },
}
