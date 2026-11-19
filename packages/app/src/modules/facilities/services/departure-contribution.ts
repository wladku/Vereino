// The `facilities` departure contributor (people life-cycle spec REQ-L04, the `facilities` row of the contributor
// table; phase L5, #307): `people` declares the contract (`people/services/departure.ts`) and reads it with
// `hasRegistration`; `facilities` registers it in `di.ts` under `people.departure.facilities`. A leaving person's place
// maintainer rows are removed (a hard delete, as `facilities.place_maintainers.delete` does: the scope ends at once);
// the internal bookings they made stay with their group. The undo re-inserts each removed row with its id unless the
// same person was assigned to the place again since. After the commit `facilities.place_maintainer.deleted` (undo:
// `…created`) runs per row. The person's derived role follows through the `people` role sync, which the departure's own
// `people.*` events start: a synchronous `people.roleSync` call here would wait on the departure's row locks.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { DepartureChange, DepartureContributor, DepartureSubject } from '../../people/services/departure'
import { emitAfterCommit } from '../commands/shared'
import { PlaceMaintainer } from '../data/entities'
import type { PlaceDirectoryEntry } from '../../club_core/services/directory'
import { findPlaces } from './directory'

/** The token `people` reads (`departureContributorToken('facilities')` in `people/services/departure.ts`). */
export const FACILITIES_DEPARTURE_CONTRIBUTOR = 'people.departure.facilities'

type MaintainerUndo = {
  id: string
  placeId: string
  personId: string
  assignedByPersonId: string | null
  assignedAt: string
}

function maintainersOf(em: EntityManager, subject: DepartureSubject): Promise<PlaceMaintainer[]> {
  return em.find(
    PlaceMaintainer,
    {
      tenantId: subject.tenantId,
      organizationId: subject.organizationId,
      personId: { $in: [...subject.personIds] },
    },
    { orderBy: { id: 'asc' } },
  )
}

export function createDepartureContribution(container: AwilixContainer): DepartureContributor {
  return {
    async preview(em, subject) {
      const rows = await maintainersOf(em, subject)
      const places =
        rows.length > 0
          ? await findPlaces(
              container,
              { tenantId: subject.tenantId, organizationId: subject.organizationId },
              rows.map((row) => row.placeId),
              em,
            )
          : new Map<string, PlaceDirectoryEntry>()
      return {
        items: rows.map((row) => ({
          module: 'facilities',
          kind: 'place_maintainer',
          recordId: row.id,
          personId: row.personId,
          action: 'remove' as const,
          until: null,
          label: { placeId: row.placeId, placeName: places.get(row.placeId)?.name ?? null },
        })),
        warnings: [],
        blockers: [],
      }
    },

    async apply(em, subject) {
      const rows = await maintainersOf(em, subject)
      const snapshot: MaintainerUndo[] = rows.map((row) => ({
        id: row.id,
        placeId: row.placeId,
        personId: row.personId,
        assignedByPersonId: row.assignedByPersonId ?? null,
        assignedAt: row.assignedAt.toISOString(),
      }))
      for (const row of rows) em.remove(row)
      await em.flush()
      const changes: DepartureChange[] = rows.map((row) => ({
        kind: 'place_maintainer',
        recordId: row.id,
        action: 'deleted',
        refs: { placeId: row.placeId, personId: row.personId },
      }))
      return { snapshot, changes }
    },

    async undo(em, subject, snapshot) {
      const entries = Array.isArray(snapshot) ? (snapshot as MaintainerUndo[]) : []
      if (entries.length === 0) return []
      const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
      const existing = await em.find(PlaceMaintainer, {
        ...scope,
        personId: { $in: [...new Set(entries.map((entry) => entry.personId))] },
      })
      const changes: DepartureChange[] = []
      for (const entry of entries) {
        // Assigned to the place again since the departure: that row stays and the old one is not brought back.
        if (existing.some((row) => row.placeId === entry.placeId && row.personId === entry.personId)) continue
        em.persist(
          em.create(PlaceMaintainer, {
            id: entry.id,
            ...scope,
            placeId: entry.placeId,
            personId: entry.personId,
            assignedByPersonId: entry.assignedByPersonId,
            assignedAt: new Date(entry.assignedAt),
          }),
        )
        changes.push({
          kind: 'place_maintainer',
          recordId: entry.id,
          action: 'created',
          refs: { placeId: entry.placeId, personId: entry.personId },
        })
      }
      await em.flush()
      return changes
    },

    async afterCommit(changes, ctx, undo) {
      const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
      // A removed row is gone after the commit: its place and person travel in `refs`.
      const rows = changes.filter((change) => change.kind === 'place_maintainer')
      for (const change of rows) {
        await emitAfterCommit(
          undo ? 'facilities.place_maintainer.created' : 'facilities.place_maintainer.deleted',
          scope,
          { id: change.recordId, placeId: change.refs?.placeId ?? null },
        )
      }
    },

    async hasHistory(em, subject) {
      const count = await em.count(PlaceMaintainer, {
        tenantId: subject.tenantId,
        organizationId: subject.organizationId,
        personId: subject.personId,
      })
      return count > 0
    },
  }
}
