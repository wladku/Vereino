// The module seeds of the cross-club isolation guard (#628), in dependency order. Each adds the records its module's
// inventory probes address (`inventory/<module>.json`) to both clubs, on top of the base seed (`seed.ts`).
import { inModules } from './probe'
import type { ModuleSeed } from './seed'
import { seedActivities } from './seed-activities'
import { seedClubCore } from './seed-club_core'
import { seedCommunication } from './seed-communication'
import { seedFacilities } from './seed-facilities'
import { seedFoundation } from './seed-foundation'
import { seedGroups } from './seed-groups'
import { seedPayments } from './seed-payments'
import { seedPaymentsOrders } from './seed-payments-orders'
import { seedPeople } from './seed-people'
import { seedTraining } from './seed-training'

export const MODULE_SEEDS: Record<string, ModuleSeed> = {
  foundation: seedFoundation,
  club_core: seedClubCore,
  people: seedPeople,
  groups: seedGroups,
  activities: seedActivities,
  communication: seedCommunication,
  facilities: seedFacilities,
  payments: seedPayments,
  'payments-orders': seedPaymentsOrders,
  training: seedTraining,
}

/** The seeds of the given modules (all when `modules` is null; `payments` includes `payments-orders`), in order. */
export function moduleSeedsFor(modules: readonly string[] | null): ModuleSeed[] {
  return Object.entries(MODULE_SEEDS)
    .filter(([id]) => !modules || inModules(id, modules))
    .map(([, seed]) => seed)
}
