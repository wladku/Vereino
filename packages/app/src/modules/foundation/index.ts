import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'foundation',
  title: 'Vereino foundation',
  version: '0.1.0',
  description:
    'Shared Vereino primitives: scoped command authorization, scope contract, role sync, accounts, encrypted fields, module schedules, localized rendering, error codes, recurrence parsing, status transitions, the occupancy contract, the audience, dispatch and e-mail template primitives, and the token-link service.',
  author: 'Vereino',
  license: 'MIT',
}

// Public entry (foundation spec REQ-F16): other Vereino modules import these helpers from `@/modules/foundation`,
// never the foundation's internal files (the boundaries lint enforces it). The foundation owns the dispatch outbox
// tables (foundation III P-30); no business module reads them directly.
export { foundationErrors } from './api/errors'
export {
  calendarDateSchema,
  codedIssueErrorCode,
  refineValidity,
  validityShape,
  type CodedIssueParams,
} from './lib/validity-schema'
export { accountEmail, createAccount, type CreateAccountInput, type CreateAccountResult } from './services/accounts'
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
export {
  OCCUPANCY_PROVIDER_TOKEN,
  occupancyProvider,
  type BlockingInterval,
  type OccupancyContext,
  type OccupancyProvider,
  type OccupancyReason,
} from './services/occupancy'
export { parseRecurrence, type ParseRecurrenceInput } from './services/recurrence'
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
export { advanceWhere, assertTransition, type AdvanceWhereSpec, type AdvanceableEntity } from './services/transitions'
export { auditedRead, type AuditedReadLogRow, type AuditedReadSpec } from './services/audited-read'
export {
  audienceProvider,
  contactResolver,
  resolveAudience,
  type AudienceContext,
  type AudienceProvider,
  type AudienceProviderContext,
  type ClubFacts,
  type ContactResolver,
  type ResolvedAudience,
} from './services/audience'
export {
  DISPATCH_QUEUE,
  createDispatchService,
  type DeliveryCounts,
  type DeliveryView,
  type DispatchJob,
  type DispatchRequest,
  type DispatchService,
  type EnqueueResult,
  type PagedDeliveries,
} from './services/dispatch'
export { EMAIL_SENDER_TOKEN, defaultEmailSender, type EmailSender } from './services/email-sender'
export {
  clubText,
  defineEmailTemplate,
  registerEmailTemplate,
  resolveEmailTemplate,
  type EmailRenderContext,
  type EmailTemplate,
} from './services/email-templates'
export { registerAppendOnlyGuard } from './services/append-only-guard'
export {
  createTokenLinkService,
  type IssueOptions,
  type IssuedTokenLink,
  type LookupOptions,
  type TokenLinkEntity,
  type TokenLinkScope,
  type TokenLinkService,
  type TokenLinkServiceOptions,
  type TokenLinkSubject,
  type TokenLinkView,
} from './services/token-link'
