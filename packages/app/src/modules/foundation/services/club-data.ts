// Registers a module's club tables (many clubs spec phase 4, DD-M09; #632) under both optional tokens
// `club_core.clubExport.<module>` and `club_core.clubDelete.<module>`, which `club_core` reads with `hasRegistration`.
import { asValue, type AwilixContainer } from 'awilix'
import {
  clubDataContributor,
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
