import { asFunction } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { SCOPE_PROVIDER_TOKEN } from '@/modules/foundation'
import type { ClubScope } from './services/club-clock'
import { PEOPLE_PAYMENTS_GATE, createPaymentsGate } from './services/payments-gate'
import { createPersonDirectory } from './services/person-directory'
import { syncPersonRoles, type PersonRoleSyncOutcome } from './services/role-sync'
import { createPeopleScopeService } from './services/scope-service'

/** `people.scopeService` (club spec DD-06): the record-scope provider, also registered as `vereino.scopeProvider`. */
export const PEOPLE_SCOPE_SERVICE = 'people.scopeService' as const

/**
 * `people.personDirectory`: the decrypted names of persons of one organization (`findPersons(scope, ids, em?)`), for
 * the modules that require `people` (the `groups` roster, #30).
 */
export const PEOPLE_PERSON_DIRECTORY = 'people.personDirectory' as const

/**
 * `people.roleSync`: `syncPerson(scope, personId)` recomputes one person's `auth` roles in its own transaction, for a
 * module whose records change a derived role (a `groups` participant membership makes an adult a payer, #30).
 */
export const PEOPLE_ROLE_SYNC = 'people.roleSync' as const

/**
 * `people.paymentsGate` (#27, R10): `check(subject)` / `assert(subject)` on the caller's own payments — a minor never
 * sees them, even with a manually granted `payments.view_own`. The phase 4 `payments` routes call `assert`.
 */
export { PEOPLE_PAYMENTS_GATE }

export type PeopleRoleSync = {
  syncPerson(scope: ClubScope, personId: string): Promise<PersonRoleSyncOutcome>
}

export function register(container: AppContainer) {
  // Registrars run for every request and job container, so the services close over that container; the factories
  // take no parameters, which keeps them independent of CLASSIC parameter-name injection.
  const scopeService = asFunction(() => createPeopleScopeService(container)).scoped()
  const roleSync: PeopleRoleSync = { syncPerson: (scope, personId) => syncPersonRoles(container, scope, personId) }
  container.register({
    [PEOPLE_SCOPE_SERVICE]: scopeService,
    [SCOPE_PROVIDER_TOKEN]: asFunction(() => createPeopleScopeService(container)).scoped(),
    // `.proxy()` resolves `em` by property name, which survives bundler renaming under CLASSIC injection.
    [PEOPLE_PERSON_DIRECTORY]: asFunction((cradle: { em: EntityManager }) => createPersonDirectory(() => cradle.em))
      .scoped()
      .proxy(),
    [PEOPLE_ROLE_SYNC]: asFunction(() => roleSync).scoped(),
    [PEOPLE_PAYMENTS_GATE]: asFunction(() => createPaymentsGate(container)).scoped(),
  })
}
