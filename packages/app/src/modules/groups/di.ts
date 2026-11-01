import { asFunction, asValue } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createGroupDirectory } from './services/group-directory'
import { GROUPS_MEMBERSHIP_CONTRIBUTION, membershipContribution } from './services/membership-contribution'
import { GROUPS_MEMBERSHIP_IMPORTER, membershipImporter } from './services/membership-importer'

/**
 * `groups.directory` (#31): `findGroups(scope, ids, em?)`, `rosterOn(scope, groupId, date, em?)` and
 * `findExternalTeams(scope, ids, em?)` — the groups, rosters and external teams of a club, for the modules that
 * require `groups` (`activities`).
 */
export const GROUPS_DIRECTORY = 'groups.directory' as const

/**
 * `groups` contributes the coach scope and the participant payer rule to `people` (club spec *Record scope*,
 * *Account payer*; #30) under the optional token `people` reads with `hasRegistration`
 * (`people/services/membership-contribution.ts`). The contribution is stateless: every call takes the caller's
 * EntityManager, so it is a value, not a scoped service.
 *
 * `groups.membershipImporter` (#65, D-026): the hook the `people` bulk import reads with `hasRegistration`
 * (`people/services/membership-importer.ts`) to turn a committed row's group label into a participant membership —
 * `resolveGroups(em, scope, names)` and `ensureParticipantMemberships(ctx, scope, items)`. Stateless as well: it works
 * in the caller's EntityManager and command context.
 */
export function register(container: AppContainer) {
  container.register({
    [GROUPS_MEMBERSHIP_CONTRIBUTION]: asValue(membershipContribution),
    [GROUPS_MEMBERSHIP_IMPORTER]: asValue(membershipImporter),
    // `.proxy()` resolves `em` by property name, which survives bundler renaming under CLASSIC injection.
    [GROUPS_DIRECTORY]: asFunction((cradle: { em: EntityManager }) => createGroupDirectory(() => cradle.em))
      .scoped()
      .proxy(),
  })
}
