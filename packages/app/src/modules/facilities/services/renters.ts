// The renter search of the slot dialog (facilities parity spec DD-R07, the `GET /api/facilities/renters` row of *API*;
// REQ-R14; #277). The sources are read inside the caller's scope before any matching: the rentals of the last 24
// months on the caller's places (at most 500 rows, newest first, decrypted and matched in memory — the renter's name
// and contact are encrypted at rest), the club's institutions by name through `clubCoreDirectory` (name and type
// only), and persons through the people register only for a caller with `people.view` — no `people` row is read for
// anyone else. `lib/renters.ts` merges them.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Rental } from '../data/entities'
import {
  RENTER_HISTORY_ROWS,
  RENTER_RESULTS_MAX,
  mergeRenterOptions,
  renterHistoryStart,
  type RenterHistoryRow,
  type RenterOption,
} from '../lib/renters'
import { searchInstitutions, searchPersons, type FacilitiesScope } from './directory'

export type RenterSearchInput = {
  search: string
  /** The places whose rentals the caller may read (null = every club place, the club administrator). */
  placeIds: readonly string[] | null
  /** Whether the caller holds `people.view` (only then persons are searched). */
  canViewPeople: boolean
  now: Date
}

/** Statuses whose renter is not offered: an online request whose e-mail was never confirmed. */
const UNOFFERED_STATUSES = ['pending_verification'] as const

async function rentalHistory(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeIds: readonly string[] | null,
  now: Date,
): Promise<RenterHistoryRow[]> {
  if (placeIds !== null && placeIds.length === 0) return []
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await findWithDecryption(
    em,
    Rental,
    {
      ...scope,
      deletedAt: null,
      startsAt: { $gte: renterHistoryStart(now) },
      status: { $nin: [...UNOFFERED_STATUSES] },
      ...(placeIds === null ? {} : { placeId: { $in: [...placeIds] } }),
    },
    { orderBy: { startsAt: 'desc', id: 'asc' }, limit: RENTER_HISTORY_ROWS },
    scope,
  )
  return rows.map((row) => ({
    renterType: row.renterType,
    renterId: row.renterId ?? null,
    renterDisplayName: row.renterDisplayName,
    renterCategory: row.renterCategory,
    contactName: row.contactName ?? null,
    contactPhone: row.contactPhone ?? null,
    contactEmail: row.contactEmail ?? null,
    startsAt: row.startsAt,
  }))
}

/** At most 20 renter options for `search` in the caller's scope. */
export async function searchRenters(
  container: AwilixContainer,
  scope: FacilitiesScope,
  input: RenterSearchInput,
): Promise<RenterOption[]> {
  const history = await rentalHistory(container, scope, input.placeIds, input.now)
  const institutions = await searchInstitutions(container, scope, input.search, RENTER_RESULTS_MAX)
  const persons = input.canViewPeople ? await searchPersons(container, scope, input.search, RENTER_RESULTS_MAX) : []
  return mergeRenterOptions({ history, institutions, persons }, input.search)
}
