import { asFunction, asValue } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { audienceProviderToken } from '@vereino/core'
import { groupAudienceProvider, sectionAudienceProvider } from './services/audience'
import { createGroupDirectory } from './services/group-directory'
import { GROUPS_MEMBERSHIP_CONTRIBUTION, membershipContribution } from './services/membership-contribution'
import { GROUPS_MEMBERSHIP_IMPORTER, membershipImporter } from './services/membership-importer'
import { GROUPS_SECTION_USAGE, sectionUsage } from './services/section-usage'

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
 *
 * `vereino.audience.section` and `vereino.audience.group` (foundation III P-29, #71): the audience providers of the kinds
 * `groups` owns — participants and coaches of the groups, active on the club's date. The foundation resolves them with
 * `hasRegistration`. Stateless values: every call takes the caller's context.
 *
 * `groups.sectionUsage` (UX parity spec REQ-U02, DD-U04): the active groups of a section, which `club_core` reads with
 * `hasRegistration` before it deactivates or deletes a section (`club_core/services/section-usage.ts`). Stateless: it
 * reads with the caller's EntityManager inside the command's transaction.
 */
export function register(container: AppContainer) {
  container.register({
    [GROUPS_MEMBERSHIP_CONTRIBUTION]: asValue(membershipContribution),
    [GROUPS_MEMBERSHIP_IMPORTER]: asValue(membershipImporter),
    [GROUPS_SECTION_USAGE]: asValue(sectionUsage),
    [audienceProviderToken('section')]: asValue(sectionAudienceProvider),
    [audienceProviderToken('group')]: asValue(groupAudienceProvider),
    // `.proxy()` resolves `em` by property name, which survives bundler renaming under CLASSIC injection.
    [GROUPS_DIRECTORY]: asFunction((cradle: { em: EntityManager }) => createGroupDirectory(() => cradle.em))
      .scoped()
      .proxy(),
  })
}
