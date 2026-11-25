// Registers a module's club tables (many clubs spec phase 4, DD-M09; #632) under both optional tokens
// `club_core.clubExport.<module>` and `club_core.clubDelete.<module>`, which `club_core` reads with `hasRegistration`.
import type { EntityManager } from '@mikro-orm/postgresql'
import { asValue, type AwilixContainer } from 'awilix'
import {
  clubDataContributor,
  clubDeleteBeyondTenantToken,
  clubDeleteContributorToken,
  clubExportContributorToken,
  type ClubDataContributor,
} from '../lib/club-data'

/** Registers `tables` of `module` as the module's club export and deletion contributor. */
export function registerClubDataContributor(
  container: AwilixContainer,
  module: string,
  tables: readonly string[],
): ClubDataContributor {
  const contributor = clubDataContributor(module, tables)
  container.register({
    [clubExportContributorToken(module)]: asValue(contributor),
    [clubDeleteContributorToken(module)]: asValue(contributor),
  })
  return contributor
}

/** A club's rows a module holds outside the club's tenant, counted or deleted by `club_core delete-club` (#685). */
export type ClubDeleteBeyondTenant = {
  module: string
  /** Rows per table the deletion would remove (a dry run); only tables with rows need to be listed. */
  count(
    em: EntityManager,
    scope: { tenantId: string; organizationId: string },
  ): Promise<{ table: string; rows: number }[]>
  /**
   * Deletes them in the caller's transaction (the club deletion's own); `afterCommit` runs once it committed (files).
   */
  delete(
    em: EntityManager,
    scope: { tenantId: string; organizationId: string },
  ): Promise<{ tables: { table: string; rows: number }[]; afterCommit?: () => Promise<void> }>
}

/** Registers a module's deletion of a club's rows held outside the club's tenant (optional token, read with `hasRegistration`). */
export function registerClubDeleteBeyondTenant(container: AwilixContainer, hook: ClubDeleteBeyondTenant): void {
  container.register({ [clubDeleteBeyondTenantToken(hook.module)]: asValue(Object.freeze({ ...hook })) })
}
