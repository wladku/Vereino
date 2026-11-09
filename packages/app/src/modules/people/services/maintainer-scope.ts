// The optional `facilities` contribution to the person scope and the role sync (facilities spec DD-36; #128): the
// places a person maintains (`facilities_place_maintainers`). `facilities` requires `people`, never the reverse, so
// `people` declares the contract and reads it through DI with `hasRegistration`, like `groups.membershipContribution`.
// Without `facilities` the contribution is absent: no `maintenance_planner` grant and no
// `vereino_maintenance_planner` role (fail closed).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'

/** DI token under which `facilities` registers its `MaintainerScopeProvider` (`facilities/di.ts`). */
export const FACILITIES_MAINTAINER_SCOPE_PROVIDER = 'facilities.maintainerScopeProvider'

export type MaintainerScopeProvider = {
  /**
   * Ids of the places the person is assigned to maintain, in the trusted tenant and organization. Reads with `em`, the
   * caller's EntityManager, so a caller inside a transaction sees its own writes.
   */
  placeIdsFor(
    em: EntityManager,
    subject: { tenantId: string; organizationId: string; personId: string },
  ): Promise<string[]>
}

/** The registered provider, or null when `facilities` is not enabled. */
export function maintainerScopeProvider(container: AwilixContainer): MaintainerScopeProvider | null {
  if (!container.hasRegistration(FACILITIES_MAINTAINER_SCOPE_PROVIDER)) return null
  return container.resolve<MaintainerScopeProvider>(FACILITIES_MAINTAINER_SCOPE_PROVIDER)
}
