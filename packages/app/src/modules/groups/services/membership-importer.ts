// The `groups` side of the bulk import's group column (club spec REQ-036, DD-38, D-026; #65). `people` owns the contract
// (`people/services/membership-importer.ts`) and resolves it with `hasRegistration`; `groups` registers it in `di.ts`
// under the token `people` names, so the dependency stays `groups` → `people`. A name resolves to a live, active group
// of the club only when exactly one has it (`matchGroupNames`); a group is never created. A membership is written
// through the `groups.memberships.create` command nested in the import's transaction, so its scope check, overlap
// rule, audit entry and (deferred) events are the command's own.
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { ImportMembershipOutcome, MembershipImporter } from '../../people/services/membership-importer'
import type { MembershipCommandResult } from '../commands/memberships'
import { emitGroupsSideEffects, lockGroup, membershipEvents } from '../commands/shared'
import { Group, GroupMembership } from '../data/entities'
import { firstOverlapping, matchGroupNames } from '../lib/groups-rules'
import { findPersons } from './directory'

/** The token `people` reads (`GROUPS_MEMBERSHIP_IMPORTER` in `people/services/membership-importer.ts`). */
export const GROUPS_MEMBERSHIP_IMPORTER = 'groups.membershipImporter'

export const membershipImporter: MembershipImporter = {
  async resolveGroups(em, scope, names) {
    if (names.length === 0) return new Map()
    const groups = await em.find(
      Group,
      { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null, isActive: true },
      { fields: ['id', 'name'] },
    )
    return matchGroupNames(names, groups)
  },

  async ensureParticipantMemberships(ctx, scope, items) {
    const em = ctx.transactionalEm
    if (!em) throw new Error('[internal] the membership import runs inside the caller transaction')
    const bus = ctx.container.resolve<CommandBus>('commandBus')
    const persons = await findPersons(ctx.container, scope, [...new Set(items.map((item) => item.personId))], em)
    const created: GroupMembership[] = []
    const outcomes = new Map<string, ImportMembershipOutcome>()
    for (const item of items) {
      if (!persons.has(item.personId)) {
        outcomes.set(item.key, { status: 'person_missing' })
        continue
      }
      // The group's row lock first, as every membership write takes it, so the check below cannot race a write.
      const group = await lockGroup(em, scope, item.groupId)
      if (!group) {
        outcomes.set(item.key, { status: 'group_not_found' })
        continue
      }
      // The command refuses an overlapping live membership of the same person, group and role (409); such a
      // membership already places the participant in the group, so it counts as done.
      const live = await em.find(
        GroupMembership,
        { ...scope, groupId: item.groupId, personId: item.personId, role: 'participant', deletedAt: null },
        { fields: ['id', 'validFrom', 'validTo'] },
      )
      const existing = firstOverlapping(
        { validFrom: item.validFrom, validTo: null },
        live.map((row) => ({ id: row.id, validFrom: row.validFrom, validTo: row.validTo ?? null })),
      )
      if (existing) {
        outcomes.set(item.key, { status: 'existed', membershipId: existing.id })
        continue
      }
      const { result } = await bus.execute<unknown, MembershipCommandResult>('groups.memberships.create', {
        input: { groupId: item.groupId, personId: item.personId, role: 'participant', validFrom: item.validFrom },
        ctx,
      })
      created.push(result.entity)
      outcomes.set(item.key, { status: 'created', membershipId: result.entity.id })
    }
    return {
      outcomes,
      async emitSideEffects() {
        for (const row of created) await emitGroupsSideEffects(ctx, row, 'created', membershipEvents)
      },
    }
  },
}
