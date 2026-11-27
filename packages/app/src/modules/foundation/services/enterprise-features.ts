// The Vereino Enterprise feature gate (enterprise package spec DD-E06, DD-E07, REQ-E04, REQ-E05; #649). Enterprise
// modules ask it, the core never branches on it: `stateOf(scope, feature)` is `on`, `read_only` or `off` for the
// trusted tenant of the request or command. Every Enterprise read route calls `assertAvailable` (404 when `off`, like
// an unknown route), every command and write route `assertWritable` (also 409 when `read_only`). Without the package
// and without keys every feature is `off`. Keys are read and verified once per process (a variable changes only with
// a restart); the first container registration logs the result.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { featureStatus, type FeatureState, type FeatureStatus } from '@vereino/core'
import { foundationErrors } from '../api/errors'
import {
  CI_TRUST_FILE,
  buildLicenceRegistry,
  licenceBootLine,
  readCiTrust,
  type LicenceRegistry,
} from '../lib/licence-verify'

/** The trusted scope of a request or command; the tenant never comes from a payload. */
export type EnterpriseFeatureScope = { tenantId: string | null | undefined }

export type EnterpriseFeatures = {
  statusOf(scope: EnterpriseFeatureScope, featureId: string): FeatureStatus
  stateOf(scope: EnterpriseFeatureScope, featureId: string): FeatureState
  /** True only when `on`. */
  isEnabled(scope: EnterpriseFeatureScope, featureId: string): boolean
  /** Throws `enterprise_feature_disabled` (404) when `off`; reads stay allowed when `read_only`. */
  assertAvailable(scope: EnterpriseFeatureScope, featureId: string): Promise<void>
  /** Throws `enterprise_feature_disabled` (404) when `off` and `enterprise_feature_read_only` (409) when `read_only`. */
  assertWritable(scope: EnterpriseFeatureScope, featureId: string): Promise<void>
}

const logger = createLogger('foundation').child({ component: 'licence' })

let processRegistry: LicenceRegistry | null = null

/**
 * The keys this environment holds now, verified against the compiled public keys plus — in an overlay build run with
 * `enterprise-overlay.mjs --ci` — the committed test key pair (DD-E11), which is still trusted only with
 * `VEREINO_CI=true`. `foundation licence-status` reports it; the gate keeps one per process.
 */
export function installedLicenceRegistry(env: NodeJS.ProcessEnv = process.env): LicenceRegistry {
  const readFile = (file: string) => readFileSync(file, 'utf8')
  const ciTrust = readCiTrust(path.join(process.cwd(), CI_TRUST_FILE), existsSync, readFile)
  const registry = buildLicenceRegistry({ env, readFile, extra: ciTrust.extra })
  return { ...registry, warnings: [...ciTrust.warnings, ...registry.warnings] }
}

/** The keys installed on this process, read and verified on first use; logs warnings and the boot line once. */
export function licenceRegistry(): LicenceRegistry {
  if (!processRegistry) {
    const registry = installedLicenceRegistry()
    for (const warning of registry.warnings) logger.warn(warning)
    if (registry.installed > 0) logger.info(licenceBootLine(registry))
    processRegistry = registry
  }
  return processRegistry
}

export function createEnterpriseFeatures(
  registry: () => LicenceRegistry,
  clock: () => Date = () => new Date(),
): EnterpriseFeatures {
  const statusOf = (scope: EnterpriseFeatureScope, featureId: string): FeatureStatus => {
    const { instance, licences } = registry()
    return featureStatus(licences, { instance, tenantId: scope.tenantId }, featureId, clock())
  }
  const stateOf = (scope: EnterpriseFeatureScope, featureId: string) => statusOf(scope, featureId).state
  return {
    statusOf,
    stateOf,
    isEnabled: (scope, featureId) => stateOf(scope, featureId) === 'on',
    async assertAvailable(scope, featureId) {
      if (stateOf(scope, featureId) === 'off') await foundationErrors.throw('enterprise_feature_disabled')
    },
    async assertWritable(scope, featureId) {
      const state = stateOf(scope, featureId)
      if (state === 'off') await foundationErrors.throw('enterprise_feature_disabled')
      if (state === 'read_only') await foundationErrors.throw('enterprise_feature_read_only', { feature: featureId })
    },
  }
}

/** The process-wide gate (DI `enterpriseFeatures`, also exported from `@/modules/foundation`). */
export const enterpriseFeatures: EnterpriseFeatures = createEnterpriseFeatures(licenceRegistry)
