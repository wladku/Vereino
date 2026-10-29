import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'foundation',
  title: 'Vereino foundation',
  version: '0.1.0',
  description:
    'Shared Vereino primitives: scoped command authorization, scope contract, role sync, accounts, encrypted fields, module schedules, localized rendering and error codes.',
  author: 'Vereino',
  license: 'MIT',
}

// Public entry (foundation spec REQ-F16): other Vereino modules import these helpers from `@/modules/foundation`,
// never the foundation's internal files (the boundaries lint enforces it). The foundation owns no entity.
export { foundationErrors } from './api/errors'
export {
  calendarDateSchema,
  codedIssueErrorCode,
  refineValidity,
  validityShape,
  type CodedIssueParams,
} from './lib/validity-schema'
export { createAccount, type CreateAccountInput, type CreateAccountResult } from './services/accounts'
export {
  assertInScope,
  authorizeScoped,
  jobCommandContext,
  trustedScopeOf,
  type AuthorizeScopedOptions,
  type AuthorizeScopedSpec,
  type AuthorizedCommand,
  type ScopeSource,
  type TargetLock,
  type TrustedScope,
} from './services/authorize-scoped'
export {
  encryptedField,
  type HashedEncryptedField,
  type HashedEncryptedFieldDeclaration,
  type PlainEncryptedField,
  type PlainEncryptedFieldDeclaration,
} from './services/encrypted-field'
export { errors, type ErrorDetails, type ModuleErrors } from './services/errors'
export { assertSupportedLocale, localeForPerson, renderLocalized } from './services/localized'
export { registerModuleSchedule, type ModuleScheduleRegistration } from './services/register-module-schedule'
export { commandContextForRequest, errorResponse } from './services/route-context'
export {
  desiredRoles,
  rolesForAssignments,
  seedRoles,
  syncAuthRoles,
  type DesiredRoleList,
  type RoleSyncContext,
  type RoleSyncResult,
} from './services/roles'
export {
  SCOPE_PROVIDER_TOKEN,
  resolveScope,
  scopeContract,
  type ScopeProvider,
  type ScopeResolutionContext,
  type ScopeSubject,
} from './services/scope-contract'
