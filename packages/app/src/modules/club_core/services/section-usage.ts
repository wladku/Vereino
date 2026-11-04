// The optional `groups.sectionUsage` contract (UX parity spec REQ-U02, DD-U04, DD-U08): "the active groups of section
// X". `groups` requires `club_core`, never the reverse, so `club_core` declares the contract and reads it through DI
// with `hasRegistration` — the pattern of `groups.membershipContribution` in `people`. Without `groups` no group can
// reference a section, so an absent contract means no guard.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { SectionUsage } from '../lib/section-usage'

/** DI token under which `groups` registers its `SectionUsageContract` (`groups/di.ts`). */
export const GROUPS_SECTION_USAGE = 'groups.sectionUsage'

export type SectionUsageQuery = { tenantId: string; organizationId: string; sectionId: string; limit: number }

export type SectionUsageContract = {
  /**
   * The live active groups of the section (`is_active`, not soft-deleted), at most `limit` by name, and their total.
   * Reads with `em`, the caller's EntityManager, inside the command's transaction.
   */
  activeGroupsOf(em: EntityManager, query: SectionUsageQuery): Promise<SectionUsage>
}

/** The registered contract, or null when `groups` is not enabled. */
export function sectionUsageContract(container: AwilixContainer): SectionUsageContract | null {
  if (!container.hasRegistration(GROUPS_SECTION_USAGE)) return null
  return container.resolve<SectionUsageContract>(GROUPS_SECTION_USAGE)
}
