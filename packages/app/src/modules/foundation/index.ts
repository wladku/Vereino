import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'foundation',
  title: 'Vereino foundation',
  version: '0.1.0',
  description:
    'Shared Vereino primitives: scoped command authorization, scope contract, role sync, accounts, encrypted fields, module schedules, localized rendering, error codes, recurrence parsing, status transitions, the occupancy contract, the audience, dispatch and e-mail template primitives, the token-link service, and social sign-in.',
  author: 'Vereino',
  license: 'AGPL-3.0-only',
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
export {
  accountEmail,
  accountView,
  closeAccount,
  createAccount,
  resendInvitation,
  sendAccountInvitation,
  updateAccount,
  type AccountInvitationResult,
  type AccountView,
  type CreateAccountInput,
  type CreateAccountResult,
  type ResendInvitationResult,
  type UpdateAccountInput,
} from './services/accounts'
export { isUnlinkedScope, scopeDenialCode, type ScopeDenialCode } from './lib/scope-denial'
export {
  clubDataContributor,
  clubDeleteContributorToken,
  clubExportContributorToken,
  type ClubDataContributor,
} from './lib/club-data'
export { registerClubDataContributor } from './services/club-data'
export {
  assertInScope,
  authorizeScoped,
  jobCommandContext,
  prefetchSessionScope,
  trustedScopeOf,
  type AuthorizeScopedOptions,
  type AuthorizeScopedSpec,
  type AuthorizedCommand,
  type PrefetchedSessionScope,
  type ScopeSource,
  type TargetLock,
  type TokenScopeSubject,
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
export {
  enterpriseFeatures,
  type EnterpriseFeatureScope,
  type EnterpriseFeatures,
} from './services/enterprise-features'
export { assertSupportedLocale, localeForPerson, renderLocalized } from './services/localized'
export {
  OCCUPANCY_PROVIDER_TOKEN,
  lockOccupancy,
  occupancyProvider,
  type BlockingInterval,
  type OccupancyContext,
  type OccupancyProvider,
  type OccupancyReason,
} from './services/occupancy'
export { parseRecurrence, type ParseRecurrenceInput } from './services/recurrence'
export { registerModuleSchedule, type ModuleScheduleRegistration } from './services/register-module-schedule'
export {
  clubJobWorker,
  declareClubJobs,
  initClub,
  setUpClubJob,
  wake as wakeClubJob,
  type ClubJobRunResult,
} from './services/club-jobs'
export type { ClubJobDeclaration, ClubJobSchedule } from './lib/club-job-due'
export {
  verifyScheduledJobScope,
  type ScheduledJobRef,
  type ScheduledJobScopeRefusal,
  type ScheduledJobScopeResult,
} from './services/scheduled-job-scope'
export { commandContextForRequest, errorResponse } from './services/route-context'
export {
  loadPublicRoute,
  type PublicRouteAnswer,
  type PublicRouteHandler,
  type PublicRouteLoadInput,
} from './services/public-route-load'
export {
  PASSWORD_RESET_EMAIL_LIMIT,
  SIGN_IN_EMAIL_LIMIT,
  accountEmailLimit,
  emailFromBody,
  linkRequestEmailLimit,
  tokenLimit,
  type SessionlessLimit,
  type SessionlessLimitConfig,
} from './lib/sessionless-limits'
export {
  enforceSessionlessLimits,
  noteClientAddress,
  sessionlessRateLimiter,
  sessionlessSubjectAllowed,
  withAccountEmailLimit,
} from './services/sessionless-limits'
export { watchRateLimitStore } from './services/rate-limit-store-watch'
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
  resolveScopeForPerson,
  scopeContract,
  type PersonScopeSubject,
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
  resolveMembers,
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
  eraseRecipientDeliveries,
  type DeliveryCounts,
  type DeliveryView,
  type DispatchJob,
  type DispatchRequest,
  type DispatchService,
  type EnqueueResult,
  type PagedDeliveries,
} from './services/dispatch'
export { bareAddressKey, type BareAddress } from './lib/dispatch-rules'
export { holdClubImportSlot } from './services/club-limits'
export {
  CLUB_REQUEST_LIMIT_DEFAULTS,
  clubRequestLimitKey,
  readClubRequestLimit,
  routeLimitKey,
  type ClubRequestLimit,
} from './lib/club-limits'
export {
  personDeliveriesForExport,
  type PersonDeliveriesExport,
  type PersonDeliveryExportRow,
} from './services/data-export'
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
