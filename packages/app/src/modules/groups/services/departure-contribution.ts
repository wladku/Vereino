// The `groups` departure contributor (people life-cycle spec DD-L03, the `groups` row of the contributor table; phase
// L4, #306): `people` declares the contract (`people/services/departure.ts`) and reads it with `hasRegistration`;
// `groups` registers it in `di.ts` under `people.departure.groups`. A leaving person's memberships active after the
// last day end on it with the rule of "end on a chosen last day" (REQ-A03: `valid_to` = the last day); one that would
// only start after the last day is removed under REQ-A03's delete rule (a soft delete — allowed before the start). The
// undo restores each membership only where the departure's value is still in place. After the commit the
// `groups.membership.updated|deleted` events run, as `groups.memberships.end|delete` would emit them (the role sync and
// the `activities` subscriber that drops later declarations listen to them).
import type { EntityManager } from '@mikro-orm/postgresql'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type {
  DepartureChange,
  DepartureContributor,
  DepartureItem,
  DepartureSubject,
} from '../../people/services/departure'
import { membershipEvents } from '../commands/shared'
import { Group, GroupMembership } from '../data/entities'

/** The token `people` reads (`departureContributorToken('groups')` in `people/services/departure.ts`). */
export const GROUPS_DEPARTURE_CONTRIBUTOR = 'people.departure.groups'

type MembershipUndo = { id: string; validTo: string | null; removed: boolean }

function activeAfter(row: GroupMembership, lastDay: string): boolean {
  return row.validTo === null || row.validTo === undefined || row.validTo > lastDay
}

async function liveMemberships(em: EntityManager, subject: DepartureSubject): Promise<GroupMembership[]> {
  const rows = await em.find(GroupMembership, {
    tenantId: subject.tenantId,
    organizationId: subject.organizationId,
    personId: { $in: [...subject.personIds] },
    deletedAt: null,
  })
  return rows.filter((row) => activeAfter(row, subject.lastDay))
}

export const departureContribution: DepartureContributor = {
  async preview(em, subject) {
    const rows = await liveMemberships(em, subject)
    const groupIds = [...new Set(rows.map((row) => row.groupId))]
    const groups =
      groupIds.length > 0
        ? await em.find(Group, {
            id: { $in: groupIds },
            tenantId: subject.tenantId,
            organizationId: subject.organizationId,
          })
        : []
    const names = new Map(groups.map((group) => [group.id, group.name]))
    const items: DepartureItem[] = rows.map((row) => {
      const remove = row.validFrom > subject.lastDay
      return {
        module: 'groups',
        kind: 'membership',
        recordId: row.id,
        personId: row.personId,
        action: remove ? 'remove' : 'end',
        until: remove ? null : subject.lastDay,
        label: { groupId: row.groupId, groupName: names.get(row.groupId) ?? null, role: row.role },
      }
    })
    return { items, warnings: [], blockers: [] }
  },

  async apply(em, subject) {
    const rows = await liveMemberships(em, subject)
    const snapshot: MembershipUndo[] = []
    const changes: DepartureChange[] = []
    for (const row of rows) {
      const removed = row.validFrom > subject.lastDay
      snapshot.push({ id: row.id, validTo: row.validTo ?? null, removed })
      if (removed) row.deletedAt = new Date()
      else row.validTo = subject.lastDay
      row.updatedAt = new Date()
      changes.push({ kind: 'membership', recordId: row.id, action: removed ? 'deleted' : 'updated' })
    }
    await em.flush()
    return { snapshot, changes }
  },

  async undo(em, subject, snapshot) {
    const entries = Array.isArray(snapshot) ? (snapshot as MembershipUndo[]) : []
    if (entries.length === 0) return []
    const rows = await em.find(GroupMembership, {
      tenantId: subject.tenantId,
      organizationId: subject.organizationId,
      id: { $in: entries.map((entry) => entry.id) },
    })
    const changes: DepartureChange[] = []
    for (const row of rows) {
      const entry = entries.find((candidate) => candidate.id === row.id) as MembershipUndo
      // Only where the departure's value is still in place; a membership changed since is left alone.
      if (entry.removed ? row.deletedAt === null : row.validTo !== subject.lastDay || row.deletedAt !== null) continue
      if (entry.removed) row.deletedAt = null
      else row.validTo = entry.validTo
      row.updatedAt = new Date()
      changes.push({ kind: 'membership', recordId: row.id, action: entry.removed ? 'created' : 'updated' })
    }
    await em.flush()
    return changes
  },

  async afterCommit(changes, ctx, undo) {
    const ids = changes.filter((change) => change.kind === 'membership').map((change) => change.recordId)
    if (ids.length === 0) return
    // Inside the replay transaction on undo/redo: its connection, not a second pooled one (#836).
    const em = ctx.em
      ? ctx.em.fork({ keepTransactionContext: true })
      : ctx.container.resolve<EntityManager>('em').fork()
    const rows = await em.find(GroupMembership, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      id: { $in: ids },
    })
    const dataEngine = ctx.container.resolve<DataEngine>('dataEngine')
    for (const row of rows) {
      const change = changes.find((entry) => entry.recordId === row.id) as DepartureChange
      const args = {
        dataEngine,
        action: change.action,
        entity: row,
        identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
        events: membershipEvents,
      }
      if (undo) await emitCrudUndoSideEffects(args)
      else await emitCrudSideEffects(args)
    }
  },

  async hasHistory(em, subject) {
    const count = await em.count(GroupMembership, {
      tenantId: subject.tenantId,
      organizationId: subject.organizationId,
      personId: subject.personId,
    })
    return count > 0
  },
}
