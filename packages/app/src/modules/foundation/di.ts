import { asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { foundationErrors } from './api/errors'
import { createAccount } from './services/accounts'
import { assertInScope, authorizeScoped, jobCommandContext } from './services/authorize-scoped'
import { encryptedField } from './services/encrypted-field'
import { localeForPerson, renderLocalized } from './services/localized'
import { registerModuleSchedule } from './services/register-module-schedule'
import { desiredRoles, rolesForAssignments, seedRoles, syncAuthRoles } from './services/roles'
import { SCOPE_PROVIDER_TOKEN, scopeContract } from './services/scope-contract'

/**
 * DI token of the record-scope provider. The foundation does not register it: the `people` module registers its
 * `scopeService` here (`asFunction(...).scoped()`), implementing `ScopeProvider` from
 * `services/scope-contract.ts`. Absent → only the `self_user` grant (fail closed).
 */
export const VEREINO_SCOPE_PROVIDER = SCOPE_PROVIDER_TOKEN

/** DI tokens of the foundation's stateless services (singletons; each call takes its context explicitly). */
export const FOUNDATION_SCOPE_CONTRACT = 'foundationScopeContract' as const
export const FOUNDATION_AUTHORIZATION = 'foundationAuthorization' as const
export const FOUNDATION_ROLES = 'foundationRoles' as const
export const FOUNDATION_ACCOUNTS = 'foundationAccounts' as const
export const FOUNDATION_ENCRYPTED_FIELDS = 'foundationEncryptedFields' as const
export const FOUNDATION_SCHEDULES = 'foundationSchedules' as const
export const FOUNDATION_LOCALIZED = 'foundationLocalized' as const
export const FOUNDATION_ERRORS = 'foundationErrors' as const

export function register(container: AppContainer) {
  container.register({
    [FOUNDATION_SCOPE_CONTRACT]: asValue(scopeContract),
    [FOUNDATION_AUTHORIZATION]: asValue({ authorizeScoped, assertInScope, jobCommandContext }),
    [FOUNDATION_ROLES]: asValue({ seedRoles, syncAuthRoles, desiredRoles, rolesForAssignments }),
    [FOUNDATION_ACCOUNTS]: asValue({ createAccount }),
    [FOUNDATION_ENCRYPTED_FIELDS]: asValue({ encryptedField }),
    [FOUNDATION_SCHEDULES]: asValue({ registerModuleSchedule }),
    [FOUNDATION_LOCALIZED]: asValue({ renderLocalized, localeForPerson }),
    [FOUNDATION_ERRORS]: asValue(foundationErrors),
  })
}
