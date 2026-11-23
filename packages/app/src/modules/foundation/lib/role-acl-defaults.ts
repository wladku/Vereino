// Pre-deploy role-ACL sync wrapper (many clubs spec DD-M11, REQ-M09; #673). `auth sync-role-acls` visits every tenant
// (one per club, DD-M01), so the deploy runs it only when the instance's role-feature defaults changed: this file holds
// the fingerprint of those defaults and the decision; `foundation sync-role-acls-if-changed` (cli.ts) does the I/O.
import { createHash } from 'node:crypto'

/** The part of a registered module the fingerprint reads: its `setup.ts` role-feature defaults. */
export type RoleFeatureModule = {
  id: string
  setup?: {
    defaultRoleFeatures?: Record<string, unknown>
    defaultCustomerRoleFeatures?: Record<string, unknown>
  }
}

/** Every role's features over all modules: role keys sorted, features sorted and unique (the sync merges sets). */
export function mergeRoleFeatures(
  modules: readonly RoleFeatureModule[],
  pick: (entry: RoleFeatureModule) => Record<string, unknown> | undefined,
): Record<string, string[]> {
  const merged = new Map<string, Set<string>>()
  for (const entry of modules) {
    for (const [role, features] of Object.entries(pick(entry) ?? {})) {
      if (!Array.isArray(features)) continue
      const set = merged.get(role) ?? new Set<string>()
      for (const feature of features) if (typeof feature === 'string') set.add(feature)
      merged.set(role, set)
    }
  }
  return Object.fromEntries(
    [...merged.keys()].sort().map((role) => [role, [...(merged.get(role) as Set<string>)].sort()]),
  )
}

/**
 * The fingerprint the deploy compares: SHA-256 over the merged staff role defaults (`defaultRoleFeatures`), the merged
 * portal role defaults (`defaultCustomerRoleFeatures`, synced by the same command when `customer_accounts` is on) and
 * the installed `@open-mercato/core` version, because a platform upgrade may change the sync itself (DD-M11).
 */
export function roleAclDefaultsHash(modules: readonly RoleFeatureModule[], coreVersion: string): string {
  const canonical = JSON.stringify({
    coreVersion,
    roles: mergeRoleFeatures(modules, (entry) => entry.setup?.defaultRoleFeatures),
    customerRoles: mergeRoleFeatures(modules, (entry) => entry.setup?.defaultCustomerRoleFeatures),
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export type RoleAclSyncReason = 'forced' | 'first-run' | 'changed' | 'unchanged'

/** Sync when forced, when no hash was stored yet, or when the stored hash differs; skip only on an exact match. */
export function decideRoleAclSync(input: { storedHash: string | null; currentHash: string; force: boolean }): {
  sync: boolean
  reason: RoleAclSyncReason
} {
  if (input.force) return { sync: true, reason: 'forced' }
  if (!input.storedHash) return { sync: true, reason: 'first-run' }
  if (input.storedHash !== input.currentHash) return { sync: true, reason: 'changed' }
  return { sync: false, reason: 'unchanged' }
}

/** The stored value as a hash, or null when the module config holds nothing usable. */
export function storedRoleAclHash(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const hash = (value as { hash?: unknown }).hash
  return typeof hash === 'string' && hash.length > 0 ? hash : null
}

/** `--force` is the only option; anything else is a usage error, so a typo never runs a sync silently. */
export function parseSyncRoleAclsArgs(argv: readonly string[]): { force: boolean } | { error: string } {
  let force = false
  for (const token of argv) {
    if (token === '--force') force = true
    else return { error: `unknown argument ${token}` }
  }
  return { force }
}
