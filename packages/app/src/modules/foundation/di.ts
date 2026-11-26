import { asFunction, asValue } from 'awilix'
import type { EntityManager } from '@mikro-orm/core'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { foundationErrors } from './api/errors'
import { createAccount } from './services/accounts'
import { declareClubJobs, initClub, removeClub, wake } from './services/club-jobs'
import { registerAppendOnlyGuard } from './services/append-only-guard'
import { auditedRead } from './services/audited-read'
import { resolveAudience } from './services/audience'
import { assertInScope, authorizeScoped, jobCommandContext } from './services/authorize-scoped'
import { createDispatchService } from './services/dispatch'
import { EMAIL_SENDER_TOKEN, defaultEmailSender } from './services/email-sender'
import { clubText, defineEmailTemplate, registerEmailTemplate, resolveEmailTemplate } from './services/email-templates'
import { encryptedField } from './services/encrypted-field'
import { enterpriseFeatures, licenceRegistry } from './services/enterprise-features'
import { assertSupportedLocale, localeForPerson, renderLocalized } from './services/localized'
import { OCCUPANCY_PROVIDER_TOKEN } from './services/occupancy'
import { parseRecurrence } from './services/recurrence'
import { registerModuleSchedule } from './services/register-module-schedule'
import { desiredRoles, rolesForAssignments, seedRoles, syncAuthRoles } from './services/roles'
import { SCOPE_PROVIDER_TOKEN, scopeContract } from './services/scope-contract'
import { createTokenLinkService } from './services/token-link'
import { advanceWhere, assertTransition } from './services/transitions'
import { registerClubDataContributor } from './services/club-data'
import { FOUNDATION_CLUB_TABLES } from './lib/club-tables'
import { registerSecondFactorRoutes } from './services/second-factor/routes'

// Staff second factor V-2F02 (#736): the completion routes accept a provisional token in every process that loads the
// module registrars, before any request is dispatched.
registerSecondFactorRoutes()

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
/**
 * Many-clubs spec DD-M04, DD-M06 (#629): `declare(jobs)` (a module's per-club jobs, also `declareClubJobs` from
 * `@/modules/foundation`), `wake(container, scope, jobKey, at)`, `initClub(container, scope, keys?)`,
 * `removeClub(container, scope)`.
 */
export const FOUNDATION_CLUB_JOBS = 'foundationClubJobs' as const
export const FOUNDATION_LOCALIZED = 'foundationLocalized' as const
export const FOUNDATION_ERRORS = 'foundationErrors' as const
export const FOUNDATION_SCHEDULING = 'foundationScheduling' as const
export const FOUNDATION_AUDITED_READ = 'foundationAuditedRead' as const
/** Phase C P-10 (#157): `createTokenLinkService(entity, { use, ttlMs })` — a consumer builds one per token table. */
export const FOUNDATION_TOKEN_LINKS = 'foundationTokenLinks' as const

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

/**
 * Enterprise package spec DD-E06 (#649): the licence gate `stateOf`, `statusOf`, `isEnabled`, `assertAvailable`,
 * `assertWritable` that Enterprise modules ask; always registered, every feature `off` without keys.
 */
export const FOUNDATION_ENTERPRISE_FEATURES = 'enterpriseFeatures' as const

/** The request container's `em` when the platform registered it before the module registrars (CLI contexts may not). */
function containerEm(container: AppContainer): EntityManager | null {
  try {
    return container.resolve<EntityManager>('em')
  } catch {
    return null
  }
}

export function register(container: AppContainer) {
  registerClubDataContributor(container, 'foundation', FOUNDATION_CLUB_TABLES)
  container.register({
    [FOUNDATION_SCOPE_CONTRACT]: asValue(scopeContract),
    [FOUNDATION_AUTHORIZATION]: asValue({ authorizeScoped, assertInScope, jobCommandContext }),
    [FOUNDATION_ROLES]: asValue({ seedRoles, syncAuthRoles, desiredRoles, rolesForAssignments }),
    [FOUNDATION_ACCOUNTS]: asValue({ createAccount }),
    [FOUNDATION_ENCRYPTED_FIELDS]: asValue({ encryptedField }),
    [FOUNDATION_SCHEDULES]: asValue({ registerModuleSchedule }),
    [FOUNDATION_CLUB_JOBS]: asValue({ declare: declareClubJobs, wake, initClub, removeClub }),
    [FOUNDATION_LOCALIZED]: asValue({ renderLocalized, localeForPerson, assertSupportedLocale }),
    [FOUNDATION_ERRORS]: asValue(foundationErrors),
    [FOUNDATION_SCHEDULING]: asValue({ parseRecurrence, assertTransition, advanceWhere }),
    [FOUNDATION_AUDITED_READ]: asValue({ auditedRead }),
    [FOUNDATION_TOKEN_LINKS]: asValue({ createTokenLinkService }),
    [FOUNDATION_AUDIENCE]: asValue({ resolveAudience }),
    [FOUNDATION_DISPATCH]: asFunction(() => createDispatchService(container)).scoped(),
    [FOUNDATION_EMAIL_TEMPLATES]: asValue({
      defineEmailTemplate,
      registerEmailTemplate,
      resolveEmailTemplate,
      clubText,
    }),
    [FOUNDATION_ENTERPRISE_FEATURES]: asValue(enterpriseFeatures),
  })
  // DD-E05: the installed licence keys are read and verified once per process; the first registration logs the result.
  licenceRegistry()
  // The default sender; a later registration (a test harness, a staging allowlist) replaces it.
  if (!container.hasRegistration(EMAIL_SENDER_TOKEN)) {
    container.register({ [EMAIL_SENDER_TOKEN]: asValue(defaultEmailSender) })
  }
  // P-28: every request `em` (fresh event manager per container) refuses updates and deletes of append-only rows.
  registerAppendOnlyGuard(containerEm(container))
}
