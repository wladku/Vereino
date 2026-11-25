// The state of one Enterprise feature for one tenant (enterprise package spec DD-E06, DD-E07, REQ-E04, REQ-E05; #649):
// `on` until `expiresAt + graceDays` (with a renewal notice from `expiresAt`), then `read_only` for as long as the
// expired key stays installed; `off` only when no installed key for this instance names the tenant and the feature.
// Several keys may name one tenant (a renewal): the one whose grace period ends last wins.
import type { Licence } from '#src/licence/parse-licence-key'

export type FeatureState = 'on' | 'read_only' | 'off'

export type LicenceScope = {
  /** This deployment's `VEREINO_INSTANCE_ID`; without one no key applies. */
  instance: string | null | undefined
  /** The trusted tenant of the request or command; never taken from a payload. */
  tenantId: string | null | undefined
}

export type FeatureStatus = {
  state: FeatureState
  /** The deciding key's licence id; null when `off`. */
  lid: string | null
  expiresAt: string | null
  graceEndsAt: string | null
  /** True from `expiresAt` until the grace period ends: the module shows a renewal notice. */
  renewalNotice: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The instant a key's grace period ends and its features become read-only. */
export function graceEndOf(licence: Licence): Date {
  return new Date(Date.parse(licence.expiresAt) + licence.graceDays * DAY_MS)
}

/** Whether a key is bound to this instance and tenant (tenant ids compare case-insensitively). */
export function licenceApplies(licence: Licence, scope: LicenceScope): boolean {
  if (!scope.instance || !scope.tenantId) return false
  return licence.instance === scope.instance && licence.tenantId === scope.tenantId.toLowerCase()
}

const OFF: FeatureStatus = { state: 'off', lid: null, expiresAt: null, graceEndsAt: null, renewalNotice: false }

export function featureStatus(
  licences: readonly Licence[],
  scope: LicenceScope,
  featureId: string,
  now: Date,
): FeatureStatus {
  let best: { licence: Licence; graceEnd: Date } | null = null
  for (const licence of licences) {
    if (!licenceApplies(licence, scope) || !licence.features.includes(featureId)) continue
    const graceEnd = graceEndOf(licence)
    if (!best || graceEnd.getTime() > best.graceEnd.getTime()) best = { licence, graceEnd }
  }
  if (!best) return OFF
  const on = now.getTime() < best.graceEnd.getTime()
  return {
    state: on ? 'on' : 'read_only',
    lid: best.licence.lid,
    expiresAt: best.licence.expiresAt,
    graceEndsAt: best.graceEnd.toISOString(),
    renewalNotice: on && now.getTime() >= Date.parse(best.licence.expiresAt),
  }
}

export function featureState(
  licences: readonly Licence[],
  scope: LicenceScope,
  featureId: string,
  now: Date,
): FeatureState {
  return featureStatus(licences, scope, featureId, now).state
}
