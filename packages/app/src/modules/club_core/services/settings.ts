// The `club_core` settings service (foundation spec DD-F16, club spec DD-37): the one way other modules read club
// settings, registered in DI as `clubCoreSettings`. Values come with their Zod-typed defaults; an invalid stored
// value is replaced by its default and reported with the fingerprint `club_core.settings.invalid`.
import type { EntityManager } from '@mikro-orm/postgresql'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { ClubSettings } from '../data/entities'
import { parseConsentTexts, type ConsentTexts } from '../lib/consent-texts'
import { clubAccent } from '@vereino/core'
import { staffLogoUrl } from '../lib/files'
import { resolvePublication, type Publication } from '../lib/publication'
import {
  resolveClubSettings,
  storedNumber,
  type ClubSettingKey,
  type ClubSettingsValues,
  type ResolvedClubSettings,
} from '../lib/settings'

const logger = createLogger('club_core').child({ component: 'settings' })

export type ClubSettingsScope = { tenantId: string; organizationId: string }

/** The club's public page settings and logo (#29); kept apart from the DD-37 values. */
export type ClubPublicSettings = {
  publicSlug: string | null
  publicDescription: string | null
  contactPhone: string | null
  /** The club's own bank account (26 digits, #111), shown in the payer's transfer instructions. */
  bankAccount: string | null
  /** The URLs of the club's rules and privacy policy in the public page footer (#195). */
  rulesUrl: string | null
  privacyPolicyUrl: string | null
  /** The club's own colour (`#rrggbb`, #486), or null for the default. */
  accentColor: string | null
  logoAttachmentId: string | null
  /** The logo through the platform's authenticated image route (same organization only); null without a logo. */
  logoUrl: string | null
  publication: Publication
}

export type ClubSettingsSnapshot = {
  values: ClubSettingsValues
  publicSettings: ClubPublicSettings
  /**
   * The club's own consent texts with the instant of their last change (#309, DD-L11); a key without an entry uses the
   * built-in text. Members read them on their profile, so they are not limited to the club administrator.
   */
  consentTexts: ConsentTexts
  /** Settings whose stored value was invalid and was replaced by the default. */
  defaultsApplied: ClubSettingKey[]
  /** The row's lock token, or null while the club has no stored row. */
  updatedAt: Date | null
}

export type ClubCoreSettingsService = {
  /**
   * The club's settings, read with `em` when given — the caller's, e.g. a command's transactional one, so the read
   * runs on the connection the caller holds (#728) — otherwise on a fork of the request's EntityManager.
   */
  get(scope: ClubSettingsScope, em?: EntityManager): Promise<ClubSettingsSnapshot>
  /** The name of the club's platform organization (`clubName` on B-02, #87), or null when it cannot be read. */
  organizationName(scope: ClubSettingsScope): Promise<string | null>
}

/** The stored columns of a row, keyed by setting (decimals read as numbers). */
export function storedSettingsOf(row: ClubSettings): Record<ClubSettingKey, unknown> {
  return {
    ownAccountMinAge: row.ownAccountMinAge,
    defaultLocale: row.defaultLocale,
    timezone: row.timezone,
    shortName: row.shortName ?? null,
    currency: row.currency,
    declarationKinds: row.declarationKinds,
    onlineFeeMode: row.onlineFeeMode,
    onlineFeePercent: storedNumber(row.onlineFeePercent),
    onlineFeeFixed: row.onlineFeeFixed,
    coachSettlementModel: row.coachSettlementModel,
    showCalledUpChildren: row.showCalledUpChildren,
    coachMayCancel: row.coachMayCancel,
    orderSalesDocument: row.orderSalesDocument,
    formerParticipantRetentionMonths: row.formerParticipantRetentionMonths,
    outlineLibraryMaxVisibility: row.outlineLibraryMaxVisibility,
  }
}

/** The public page settings of a row (or none). */
export function publicSettingsOf(row: ClubSettings | null): ClubPublicSettings {
  const logoAttachmentId = row?.logoAttachmentId ?? null
  return {
    publicSlug: row?.publicSlug ?? null,
    publicDescription: row?.publicDescription ?? null,
    contactPhone: row?.contactPhone ?? null,
    bankAccount: row?.bankAccount ?? null,
    rulesUrl: row?.rulesUrl ?? null,
    privacyPolicyUrl: row?.privacyPolicyUrl ?? null,
    accentColor: clubAccent(row?.accentColor)?.color ?? null,
    logoAttachmentId,
    logoUrl: staffLogoUrl(logoAttachmentId),
    publication: resolvePublication(row?.publication ?? null),
  }
}

/** Resolves a row (or none) and reports invalid stored values. */
export function resolveStoredSettings(row: ClubSettings | null, organizationId: string): ResolvedClubSettings {
  const resolved = resolveClubSettings(row ? storedSettingsOf(row) : null)
  if (resolved.invalidKeys.length > 0) {
    const error = new Error(`[internal] invalid stored club settings: ${resolved.invalidKeys.join(', ')}`)
    logger.warn('Invalid stored club settings replaced by their defaults', {
      organizationId,
      keys: resolved.invalidKeys,
    })
    getTelemetryRuntime()?.reportError(error, { module: 'club_core', code: 'club_core.settings.invalid' })
  }
  return resolved
}

/** Reads the stored row of the organization; `em` is the caller's (or the request's) EntityManager. */
export async function readClubSettings(em: EntityManager, scope: ClubSettingsScope): Promise<ClubSettingsSnapshot> {
  const row = await em.findOne(ClubSettings, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
  })
  const { values, invalidKeys } = resolveStoredSettings(row, scope.organizationId)
  return {
    values,
    publicSettings: publicSettingsOf(row),
    consentTexts: parseConsentTexts(row?.consentTexts ?? null),
    defaultsApplied: invalidKeys,
    updatedAt: row?.updatedAt ?? null,
  }
}

export function createClubCoreSettingsService(getEm: () => EntityManager): ClubCoreSettingsService {
  return {
    get: (scope, em) => readClubSettings(em ? em.fork({ keepTransactionContext: true }) : getEm().fork(), scope),
    async organizationName(scope) {
      const organization = await findOneWithDecryption(
        getEm().fork(),
        Organization,
        { id: scope.organizationId, tenant: scope.tenantId, deletedAt: null },
        undefined,
        scope,
      )
      return organization?.name ?? null
    },
  }
}
