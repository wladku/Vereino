// The `club_core` departure contributor (people life-cycle spec REQ-L04, the `club_core` row of the contributor table;
// phase L5, #307): `people` declares the contract (`people/services/departure.ts`) and reads it with `hasRegistration`;
// `club_core` registers it in `di.ts` under `people.departure.club_core`. A leaving person's contracts that run after
// the last day end on it (`valid_to` = the last day); one that would only start later is removed (a soft delete, as
// `club_core.contracts.delete` does). The undo restores each contract only where the departure's value is still in
// place and no other contract of the same party and kind starts after the last day (no overlap comes back). After the
// commit `club_core.contract.updated|deleted` (undo: `updated|created`) run as the contract commands emit them.
import type { EntityManager } from '@mikro-orm/postgresql'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type {
  DepartureChange,
  DepartureContributor,
  DepartureItem,
  DepartureSubject,
} from '../../people/services/departure'
import { structureEvents } from '../commands/shared'
import { Contract } from '../data/entities'

/** The token `people` reads (`departureContributorToken('club_core')` in `people/services/departure.ts`). */
export const CLUB_CORE_DEPARTURE_CONTRIBUTOR = 'people.departure.club_core'

const contractEvents = structureEvents<Contract>('contract')

type ContractUndo = { id: string; validTo: string | null; removed: boolean }

async function liveContracts(em: EntityManager, subject: DepartureSubject): Promise<Contract[]> {
  const rows = await em.find(
    Contract,
    {
      tenantId: subject.tenantId,
      organizationId: subject.organizationId,
      partyType: 'person',
      partyId: { $in: [...subject.personIds] },
      deletedAt: null,
    },
    { orderBy: { validFrom: 'asc', id: 'asc' } },
  )
  return rows.filter((row) => row.validTo === null || row.validTo === undefined || row.validTo > subject.lastDay)
}

export const departureContribution: DepartureContributor = {
  async preview(em, subject) {
    const items: DepartureItem[] = (await liveContracts(em, subject)).map((row) => {
      const remove = row.validFrom > subject.lastDay
      return {
        module: 'club_core',
        kind: 'contract',
        recordId: row.id,
        personId: row.partyId,
        action: remove ? 'remove' : 'end',
        until: remove ? null : subject.lastDay,
        label: { contractKind: row.kind, validFrom: row.validFrom },
      }
    })
    return { items, warnings: [], blockers: [] }
  },

  async apply(em, subject) {
    const snapshot: ContractUndo[] = []
    const changes: DepartureChange[] = []
    const now = new Date()
    for (const row of await liveContracts(em, subject)) {
      const removed = row.validFrom > subject.lastDay
      snapshot.push({ id: row.id, validTo: row.validTo ?? null, removed })
      if (removed) row.deletedAt = now
      else row.validTo = subject.lastDay
      row.updatedAt = now
      changes.push({ kind: 'contract', recordId: row.id, action: removed ? 'deleted' : 'updated' })
    }
    await em.flush()
    return { snapshot, changes }
  },

  async undo(em, subject, snapshot) {
    const entries = Array.isArray(snapshot) ? (snapshot as ContractUndo[]) : []
    if (entries.length === 0) return []
    const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
    const rows = await em.find(Contract, { ...scope, id: { $in: entries.map((entry) => entry.id) } })
    const changes: DepartureChange[] = []
    for (const row of rows) {
      const entry = entries.find((candidate) => candidate.id === row.id) as ContractUndo
      // Only where the departure's value is still in place; a contract changed since is left alone.
      if (entry.removed ? row.deletedAt === null : row.validTo !== subject.lastDay || row.deletedAt !== null) continue
      // A contract of the same party and kind made after the departure keeps its period: no overlap comes back.
      const later = await em.count(Contract, {
        ...scope,
        id: { $ne: row.id },
        partyType: row.partyType,
        partyId: row.partyId,
        kind: row.kind,
        deletedAt: null,
        validFrom: { $gt: subject.lastDay },
      })
      if (later > 0) continue
      if (entry.removed) row.deletedAt = null
      else row.validTo = entry.validTo
      row.updatedAt = new Date()
      changes.push({ kind: 'contract', recordId: row.id, action: entry.removed ? 'created' : 'updated' })
    }
    await em.flush()
    return changes
  },

  async afterCommit(changes, ctx, undo) {
    const ids = changes.filter((change) => change.kind === 'contract').map((change) => change.recordId)
    if (ids.length === 0) return
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const rows = await em.find(Contract, {
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
        events: contractEvents,
      }
      if (undo) await emitCrudUndoSideEffects(args)
      else await emitCrudSideEffects(args)
    }
  },

  async hasHistory(em, subject) {
    const count = await em.count(Contract, {
      tenantId: subject.tenantId,
      organizationId: subject.organizationId,
      partyType: 'person',
      partyId: subject.personId,
    })
    return count > 0
  },
}
