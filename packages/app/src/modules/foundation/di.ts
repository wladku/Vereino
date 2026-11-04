import { asFunction, asValue } from 'awilix'
import type { EntityManager } from '@mikro-orm/core'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { foundationErrors } from './api/errors'
import { createAccount } from './services/accounts'
import { registerAppendOnlyGuard } from './services/append-only-guard'
import { auditedRead } from './services/audited-read'
import { resolveAudience } from './services/audience'
import { assertInScope, authorizeScoped, jobCommandContext } from './services/authorize-scoped'
import { createDispatchService } from './services/dispatch'
import { EMAIL_SENDER_TOKEN, defaultEmailSender } from './services/email-sender'
import { clubText, defineEmailTemplate, registerEmailTemplate, resolveEmailTemplate } from './services/email-templates'
import { encryptedField } from './services/encrypted-field'
import { assertSupportedLocale, localeForPerson, renderLocalized } from './services/localized'
import { OCCUPANCY_PROVIDER_TOKEN } from './services/occupancy'
import { parseRecurrence } from './services/recurrence'
import { registerModuleSchedule } from './services/register-module-schedule'
import { desiredRoles, rolesForAssignments, seedRoles, syncAuthRoles } from './services/roles'
import { SCOPE_PROVIDER_TOKEN, scopeContract } from './services/scope-contract'
import { advanceWhere, assertTransition } from './services/transitions'

/**
 * DI token of the record-scope provider. The foundation does not register it: the `people` module registers its
 * `scopeService` here (`asFunction(...).scoped()`), implementing `ScopeProvider` from
 * `services/scope-contract.ts`. Absent → only the `self_user` grant (fail closed).
 */
export const VEREINO_SCOPE_PROVIDER = SCOPE_PROVIDER_TOKEN

/**
 * DI token of the optional occupancy provider (foundation II P-26, DD-G05). The foundation does not register it: the
 * `facilities` module registers its implementation in phase 5; `activities` resolves it with `hasRegistration`.
 */
export const VEREINO_OCCUPANCY_PROVIDER = OCCUPANCY_PROVIDER_TOKEN

/** DI tokens of the foundation's stateless services (singletons; each call takes its context explicitly). */
export const FOUNDATION_SCOPE_CONTRACT = 'foundationScopeContract' as const
export const FOUNDATION_AUTHORIZATION = 'foundationAuthorization' as const
export const FOUNDATION_ROLES = 'foundationRoles' as const
export const FOUNDATION_ACCOUNTS = 'foundationAccounts' as const
export const FOUNDATION_ENCRYPTED_FIELDS = 'foundationEncryptedFields' as const
export const FOUNDATION_SCHEDULES = 'foundationSchedules' as const
export const FOUNDATION_LOCALIZED = 'foundationLocalized' as const
export const FOUNDATION_ERRORS = 'foundationErrors' as const
export const FOUNDATION_SCHEDULING = 'foundationScheduling' as const
export const FOUNDATION_AUDITED_READ = 'foundationAuditedRead' as const

/**
 * Foundation III (#71). `foundationAudience`: `resolveAudience(spec, ctx, { exclude })` over the optional providers
 * `vereino.audience.<kind>` and the contact resolver `vereino.contactResolver` (registered by `people`, `groups` and
 * `activities`, never here). `foundationDispatch`: `enqueue(em, request, ctx)`, `publish(dispatchId, scope)`,
 * `deliveriesOf(dispatchId, page, ctx)`, `countsOf(dispatchIds, ctx, { channel? })`. `foundationEmailTemplates`: `defineEmailTemplate`, `registerEmailTemplate`
 * (a template lives under `vereino.emailTemplate.<id>`), `resolveEmailTemplate`, `clubText`. `foundation.emailSender`: the seam
 * every e-mail goes through — the platform's `sendEmail` by default; tests and a staging allowlist replace it.
 */
export const FOUNDATION_AUDIENCE = 'foundationAudience' as const
export const FOUNDATION_DISPATCH = 'foundationDispatch' as const
export const FOUNDATION_EMAIL_TEMPLATES = 'foundationEmailTemplates' as const
export const FOUNDATION_EMAIL_SENDER = EMAIL_SENDER_TOKEN

/** The request container's `em` when the platform registered it before the module registrars (CLI contexts may not). */
function containerEm(container: AppContainer): EntityManager | null {
  try {
    return container.resolve<EntityManager>('em')
  } catch {
    return null
  }
}

export function register(container: AppContainer) {
  container.register({
    [FOUNDATION_SCOPE_CONTRACT]: asValue(scopeContract),
    [FOUNDATION_AUTHORIZATION]: asValue({ authorizeScoped, assertInScope, jobCommandContext }),
    [FOUNDATION_ROLES]: asValue({ seedRoles, syncAuthRoles, desiredRoles, rolesForAssignments }),
    [FOUNDATION_ACCOUNTS]: asValue({ createAccount }),
    [FOUNDATION_ENCRYPTED_FIELDS]: asValue({ encryptedField }),
    [FOUNDATION_SCHEDULES]: asValue({ registerModuleSchedule }),
    [FOUNDATION_LOCALIZED]: asValue({ renderLocalized, localeForPerson, assertSupportedLocale }),
    [FOUNDATION_ERRORS]: asValue(foundationErrors),
    [FOUNDATION_SCHEDULING]: asValue({ parseRecurrence, assertTransition, advanceWhere }),
    [FOUNDATION_AUDITED_READ]: asValue({ auditedRead }),
    [FOUNDATION_AUDIENCE]: asValue({ resolveAudience }),
    [FOUNDATION_DISPATCH]: asFunction(() => createDispatchService(container)).scoped(),
    [FOUNDATION_EMAIL_TEMPLATES]: asValue({
      defineEmailTemplate,
      registerEmailTemplate,
      resolveEmailTemplate,
      clubText,
    }),
  })
  // The default sender; a later registration (a test harness, a staging allowlist) replaces it.
  if (!container.hasRegistration(EMAIL_SENDER_TOKEN)) {
    container.register({ [EMAIL_SENDER_TOKEN]: asValue(defaultEmailSender) })
  }
  // P-28: every request `em` (fresh event manager per container) refuses updates and deletes of append-only rows.
  registerAppendOnlyGuard(containerEm(container))
}
