// The `club_core` settings service (foundation spec DD-F16, club spec DD-37): the one way other modules read club
// settings, registered in DI as `clubCoreSettings`. Values come with their Zod-typed defaults; an invalid stored
// value is replaced by its default and reported with the fingerprint `club_core.settings.invalid`.
import type { EntityManager } from '@mikro-orm/postgresql'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { ClubSettings } from '../data/entities'
import {
  resolveClubSettings,
  storedNumber,
  type ClubSettingKey,
  type ClubSettingsValues,
  type ResolvedClubSettings,
} from '../lib/settings'

const logger = createLogger('club_core').child({ component: 'settings' })

export type ClubSettingsScope = { tenantId: string; organizationId: string }

export type ClubSettingsSnapshot = {
  values: ClubSettingsValues
  /** Settings whose stored value was invalid and was replaced by the default. */
  defaultsApplied: ClubSettingKey[]
  /** The row's lock token, or null while the club has no stored row. */
  updatedAt: Date | null
}

export type ClubCoreSettingsService = {
  get(scope: ClubSettingsScope): Promise<ClubSettingsSnapshot>
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
    orderSalesDocument: row.orderSalesDocument,
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
  return { values, defaultsApplied: invalidKeys, updatedAt: row?.updatedAt ?? null }
}

export function createClubCoreSettingsService(getEm: () => EntityManager): ClubCoreSettingsService {
  return {
    get: (scope) => readClubSettings(getEm().fork(), scope),
  }
}
