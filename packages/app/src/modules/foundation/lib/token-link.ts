// P-10 token-link rules (foundation spec REQ-F07, phase C): the raw-token shape, the expiry of a new link, the
// constant-time hash comparison and the state of a stored link. The ORM half is `services/token-link.ts`.
import { timingSafeEqual } from 'node:crypto'

export type TokenLinkUse = 'single' | 'until_expiry'

/** `active` links can be redeemed; `expired` and `used` answer 410 with their own code. */
export type TokenLinkState = 'active' | 'expired' | 'used'

/** The stored columns the state depends on (`usedAt` for `single`, `usedCount` for `until_expiry`). */
export type StoredTokenLink = { expiresAt: Date; usedAt?: Date | null }

/** The platform's `generateAuthToken` yields 32 random bytes as 64 lower-case hex characters. */
const RAW_TOKEN_PATTERN = /^[0-9a-f]{64}$/

/** A value that cannot be a token is answered like an unknown one, without a database read. */
export function isWellFormedToken(raw: unknown): raw is string {
  return typeof raw === 'string' && RAW_TOKEN_PATTERN.test(raw)
}

/** `now + ttlMs`; the time to live is a positive whole number of milliseconds (a programming error otherwise). */
export function expiryFor(now: Date, ttlMs: number): Date {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new RangeError(
      `[internal] token link ttl must be a positive whole number of milliseconds, got ${String(ttlMs)}`,
    )
  }
  return new Date(now.getTime() + ttlMs)
}

/** Constant-time equality of two hex digests of the same algorithm; a length mismatch is simply unequal. */
export function hashesMatch(stored: string, computed: string): boolean {
  const a = Buffer.from(stored, 'utf8')
  const b = Buffer.from(computed, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** A spent single-use link is `used` even after its expiry, so the page tells the guardian it already worked. */
export function tokenLinkState(link: StoredTokenLink, use: TokenLinkUse, now: Date): TokenLinkState {
  if (use === 'single' && link.usedAt) return 'used'
  return link.expiresAt.getTime() > now.getTime() ? 'active' : 'expired'
}
