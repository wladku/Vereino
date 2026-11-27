// Server side of Vereino Enterprise licence keys (enterprise package spec DD-E04, DD-E05, DD-E11; #649): the trusted
// public keys, the `node:crypto` Ed25519 check behind `parseLicenceKey`, reading the installed keys from the
// environment, and the registry the `enterpriseFeatures` gate and `foundation licence-status` answer from. Nothing here
// prints or logs a key: only its `lid`, or its position when no `lid` is readable.
import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import {
  featureStatus,
  graceEndOf,
  parseLicenceKey,
  type FeatureState,
  type Licence,
  type LicenceRejection,
  type VerifySignature,
} from '@vereino/core'
import { LICENCE_PUBLIC_KEYS, TEST_LICENCE_KID_PREFIX } from './licence-public-keys'

/** The environment variables of the licence gate (`BACKWARD_COMPATIBILITY.md`: protected). */
export const LICENCE_ENV = {
  instance: 'VEREINO_INSTANCE_ID',
  keys: 'VEREINO_LICENCE_KEYS',
  keysFile: 'VEREINO_LICENCE_KEYS_FILE',
  ci: 'VEREINO_CI',
} as const

export type LicenceEnv = Readonly<Record<string, string | undefined>>

export function isTestKid(kid: string): boolean {
  return kid.startsWith(TEST_LICENCE_KID_PREFIX)
}

export type TrustedLicenceKeys = { keys: Map<string, KeyObject>; warnings: string[] }

/**
 * The public keys to verify with: every compiled production key, plus the `extra` keys (the test pair a CI overlay
 * build adds, spec phase 1b) only when each is a `test-` kid and `VEREINO_CI=true`. A trusted test kid always warns.
 */
export function trustedLicenceKeys(
  production: Readonly<Record<string, string>>,
  extra: Readonly<Record<string, string>>,
  env: LicenceEnv,
): TrustedLicenceKeys {
  const keys = new Map<string, KeyObject>()
  const warnings: string[] = []
  for (const [kid, pem] of Object.entries(production)) {
    if (isTestKid(kid)) throw new Error('[internal] a test licence kid is in the production key list')
    keys.set(kid, createPublicKey(pem))
  }
  for (const [kid, pem] of Object.entries(extra)) {
    if (!isTestKid(kid)) {
      warnings.push(`refused licence kid ${kid}: only test kids may be trusted outside the compiled key list`)
    } else if (env[LICENCE_ENV.ci] !== 'true') {
      warnings.push(`refused test licence kid ${kid}: ${LICENCE_ENV.ci} is not true`)
    } else {
      keys.set(kid, createPublicKey(pem))
      warnings.push(`trusting TEST licence kid ${kid}: keys it signs are valid on this instance (CI only)`)
    }
  }
  return { keys, warnings }
}

/** The Ed25519 check `parseLicenceKey` calls; a signature of the wrong length is `invalid` (Node returns false). */
export function signatureVerifier(keys: ReadonlyMap<string, KeyObject>): VerifySignature {
  return (message, signature, kid) => {
    const key = keys.get(kid)
    if (!key) return 'unknown_kid'
    return verify(null, Buffer.from(message, 'ascii'), key, signature) ? 'valid' : 'invalid'
  }
}

/**
 * The installed keys: `VEREINO_LICENCE_KEYS` and the file `VEREINO_LICENCE_KEYS_FILE`, each newline-, space- or
 * comma-separated, without duplicates. An unreadable file is a warning: its keys are simply not installed.
 */
export function readLicenceKeys(
  env: LicenceEnv,
  readFile: (path: string) => string,
): { keys: string[]; warnings: string[] } {
  const warnings: string[] = []
  const sources = [env[LICENCE_ENV.keys] ?? '']
  const file = env[LICENCE_ENV.keysFile]?.trim()
  if (file) {
    try {
      sources.push(readFile(file))
    } catch {
      warnings.push(`cannot read ${LICENCE_ENV.keysFile}; its licence keys are not installed`)
    }
  }
  const keys = sources.flatMap((source) => source.split(/[\s,]+/)).filter((key) => key.length > 0)
  return { keys: [...new Set(keys)], warnings }
}

/**
 * The trust file `scripts/enterprise-overlay.mjs --ci` writes (DD-E11), relative to the app directory: the committed
 * TEST key pair's kid and public key, which `trustedLicenceKeys` accepts only with `VEREINO_CI=true`. The Dockerfile
 * never writes it.
 */
export const CI_TRUST_FILE = '.mercato/enterprise-ci-trust.json'

/**
 * The `extra` keys of the CI trust file: kid → SPKI PEM. A missing file is no extra key; an unreadable or malformed one
 * is a warning and no extra key, so a broken file never trusts anything.
 */
export function readCiTrust(
  path: string,
  exists: (path: string) => boolean,
  readFile: (path: string) => string,
): { extra: Record<string, string>; warnings: string[] } {
  if (!exists(path)) return { extra: {}, warnings: [] }
  try {
    const parsed: unknown = JSON.parse(readFile(path))
    const entries = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.entries(parsed) : null
    if (!entries || entries.some(([, pem]) => typeof pem !== 'string'))
      throw new Error('[internal] not a kid to PEM object')
    return { extra: Object.fromEntries(entries as Array<[string, string]>), warnings: [] }
  } catch {
    return { extra: {}, warnings: [`ignored ${CI_TRUST_FILE}: it is not a JSON object of kid to public key`] }
  }
}

export type RejectedLicenceKey = {
  reason: LicenceRejection | 'wrong_instance'
  lid: string | null
  /** 1-based position among the installed keys, to find a key without a readable `lid`. */
  position: number
}

export type LicenceRegistry = {
  instance: string | null
  /** Valid keys bound to this instance. */
  licences: Licence[]
  rejected: RejectedLicenceKey[]
  installed: number
  trustedKids: string[]
  warnings: string[]
}

export type BuildLicenceRegistryInput = {
  env: LicenceEnv
  readFile: (path: string) => string
  production?: Readonly<Record<string, string>>
  extra?: Readonly<Record<string, string>>
}

export function buildLicenceRegistry({
  env,
  readFile,
  production = LICENCE_PUBLIC_KEYS,
  extra = {},
}: BuildLicenceRegistryInput): LicenceRegistry {
  const trusted = trustedLicenceKeys(production, extra, env)
  const installed = readLicenceKeys(env, readFile)
  const instance = env[LICENCE_ENV.instance]?.trim() || null
  const verifySignature = signatureVerifier(trusted.keys)
  const licences: Licence[] = []
  const rejected: RejectedLicenceKey[] = []
  installed.keys.forEach((key, index) => {
    const parsed = parseLicenceKey(key, verifySignature)
    if (!parsed.ok) {
      rejected.push({ reason: parsed.reason, lid: parsed.lid ?? null, position: index + 1 })
    } else if (parsed.licence.instance !== instance) {
      rejected.push({ reason: 'wrong_instance', lid: parsed.licence.lid, position: index + 1 })
    } else {
      licences.push(parsed.licence)
    }
  })
  const warnings = [...trusted.warnings, ...installed.warnings]
  if (installed.keys.length > 0 && !instance) {
    warnings.push(`${LICENCE_ENV.instance} is not set: no licence key applies on this instance`)
  }
  return {
    instance,
    licences,
    rejected,
    installed: installed.keys.length,
    trustedKids: [...trusted.keys.keys()],
    warnings,
  }
}

/** The boot log line: the count of valid keys and the `lid`s (or positions) of rejected ones, never a key. */
export function licenceBootLine(registry: LicenceRegistry): string {
  const rejected = registry.rejected.map((entry) => `${entry.lid ?? `#${String(entry.position)}`} (${entry.reason})`)
  return `[foundation] licence keys: ${String(registry.licences.length)} valid of ${String(registry.installed)} installed${
    rejected.length > 0 ? `; rejected: ${rejected.join(', ')}` : ''
  }`
}

export const NO_LICENCE_KEYS_MESSAGE = 'no licence keys installed'

export type LicenceStatusReport = {
  instance: string | null
  message?: typeof NO_LICENCE_KEYS_MESSAGE
  keys: Array<{
    lid: string
    tenantId: string
    issuedAt: string
    expiresAt: string
    graceEndsAt: string
    features: Array<{ id: string; state: FeatureState; renewalNotice: boolean }>
  }>
  rejected: RejectedLicenceKey[]
  warnings: string[]
}

/** What `foundation licence-status` prints: per valid key its tenant, features, state and expiry; never the key. */
export function licenceStatusReport(registry: LicenceRegistry, now: Date): LicenceStatusReport {
  const keys = registry.licences.map((licence) => {
    const scope = { instance: registry.instance, tenantId: licence.tenantId }
    const features = licence.features.map((id) => {
      const status = featureStatus([licence], scope, id, now)
      return { id, state: status.state, renewalNotice: status.renewalNotice }
    })
    return {
      lid: licence.lid,
      tenantId: licence.tenantId,
      issuedAt: licence.issuedAt,
      expiresAt: licence.expiresAt,
      graceEndsAt: graceEndOf(licence).toISOString(),
      features,
    }
  })
  return {
    instance: registry.instance,
    ...(registry.installed === 0 ? { message: NO_LICENCE_KEYS_MESSAGE } : {}),
    keys,
    rejected: registry.rejected,
    warnings: registry.warnings,
  }
}
