// The departure preview token (people life-cycle spec *Security → Tenant isolation*: bound to the tenant, the
// organization, the actor and the input, valid 15 minutes; phase L4, #306). Server only (`node:crypto`). Not a secret:
// it proves the confirmed departure is the one previewed — the command rebuilds the plan and compares.
import { createHash } from 'node:crypto'
import type { CalendarDate } from '@vereino/core'

/** A preview token is valid this long (*Security*: 15 minutes). */
export const DEPARTURE_PREVIEW_TTL_MS = 15 * 60 * 1000

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

/** What a preview token binds (*Security → Tenant isolation*): scope, actor, input and what the preview showed. */
export type PreviewBinding = {
  tenantId: string
  organizationId: string
  actorUserId: string
  personIds: readonly string[]
  lastDay: CalendarDate
  /** The preview's content: the records it ends, its blockers and choices. A change makes the token stale. */
  content: unknown
}

function bindingHash(binding: PreviewBinding, expiresAt: number): string {
  const body = canonicalJson({ ...binding, personIds: [...new Set(binding.personIds)].sort(), expiresAt })
  return createHash('sha256').update(body).digest('base64url')
}

/** A token `<expiresAt>.<hash>`: not a secret, a check that the confirmed departure is the one previewed. */
export function issuePreviewToken(binding: PreviewBinding, now: number): string {
  const expiresAt = now + DEPARTURE_PREVIEW_TTL_MS
  return `${String(expiresAt)}.${bindingHash(binding, expiresAt)}`
}

/** `valid`, or why the token cannot confirm this departure (both answer 409 `departure_preview_stale`). */
export function checkPreviewToken(
  token: string,
  binding: PreviewBinding,
  now: number,
): 'valid' | 'expired' | 'stale' | 'malformed' {
  const match = /^(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(token)
  if (!match) return 'malformed'
  const expiresAt = Number(match[1])
  if (now > expiresAt) return 'expired'
  return bindingHash(binding, expiresAt) === match[2] ? 'valid' : 'stale'
}
