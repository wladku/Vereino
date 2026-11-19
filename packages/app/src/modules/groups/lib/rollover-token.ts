// The season rollover preview token (people life-cycle spec *Security → Tenant isolation*: bound to the tenant, the
// organization, the actor and the input, valid 15 minutes; phase L9, #311). Server only (`node:crypto`). Not a secret:
// it proves the applied plan is the one previewed — the command rebuilds the preview in its transaction and compares,
// so a group, activity or fee changed in between answers 409 `rollover_plan_stale`. The same shape as the departure
// token of `people` (`people/lib/departure-token.ts`), kept per module because a module never imports another's lib.
import { createHash } from 'node:crypto'

/** A preview token is valid this long (*Security*: 15 minutes). */
export const ROLLOVER_PREVIEW_TTL_MS = 15 * 60 * 1000

/** JSON with object keys in a fixed order, so the same value always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** What a rollover token binds: the scope, the actor, the plan as sent and what the preview showed. */
export type RolloverBinding = {
  tenantId: string
  organizationId: string
  actorUserId: string
  plan: unknown
  content: unknown
}

function bindingHash(binding: RolloverBinding, expiresAt: number): string {
  return createHash('sha256')
    .update(canonicalJson({ ...binding, expiresAt }))
    .digest('base64url')
}

/** A token `<expiresAt>.<hash>`. */
export function issueRolloverToken(binding: RolloverBinding, now: number): string {
  const expiresAt = now + ROLLOVER_PREVIEW_TTL_MS
  return `${String(expiresAt)}.${bindingHash(binding, expiresAt)}`
}

/** `valid`, or why the token cannot confirm this plan (each answers 409 `rollover_plan_stale`). */
export function checkRolloverToken(
  token: string,
  binding: RolloverBinding,
  now: number,
): 'valid' | 'expired' | 'stale' | 'malformed' {
  const match = /^(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(token)
  if (!match) return 'malformed'
  const expiresAt = Number(match[1])
  if (now > expiresAt) return 'expired'
  return bindingHash(binding, expiresAt) === match[2] ? 'valid' : 'stale'
}
