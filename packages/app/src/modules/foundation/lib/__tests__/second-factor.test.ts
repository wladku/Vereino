// Staff second factor rules (#736; spec DD-2F03…DD-2F05): codes, their hash, the marker, the attempt and resend
// rules with an injected clock, the provisional claims and the e-mail hint.
import { describe, expect, it } from '@jest/globals'
import {
  CHALLENGE_CLAIM,
  CHALLENGE_HOURLY_LIMIT,
  CHALLENGE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_RESENDS,
  RESEND_SPACING_MS,
  SECOND_FACTOR_COMPLETION_ROUTES,
  afterWrongCode,
  challengeKey,
  challengeLimit,
  challengeLockKey,
  codeMatches,
  displayCode,
  emailHint,
  hashCode,
  markerMatches,
  newChallengeId,
  newCode,
  nextResendAt,
  normalizeCode,
  parseChallengeMarker,
  provisionalTokenClaims,
  readIssuedClaims,
  readProvisionalClaims,
  resendDecision,
  providerCountsAsSecondFactor,
  secondFactorLoginPath,
  SECOND_FACTOR_USE_GOOGLE_PATH,
  type ChallengeMarker,
} from '../second-factor'

const NOW = 1_800_000_000_000
const ID = 'challenge-id'

function marker(overrides: Partial<ChallengeMarker> = {}): ChallengeMarker {
  return {
    userId: 'u1',
    sessionId: 's1',
    tenantId: 't1',
    organizationId: 'o1',
    codeHash: hashCode(ID, '123456'),
    attempts: 0,
    resends: 0,
    lastSentAt: NOW,
    expiresAt: NOW + CHALLENGE_TTL_MS,
    remember: false,
    redirect: '/backend',
    ...overrides,
  }
}

const CLAIMS = { sub: 'u1', sid: 's1', tenantId: 't1', orgId: 'o1', challengeId: ID }

describe('codes', () => {
  it('draws six-digit codes and 32-byte challenge ids', () => {
    for (let i = 0; i < 50; i += 1) expect(newCode()).toMatch(/^\d{6}$/)
    expect(Buffer.from(newChallengeId(), 'base64url')).toHaveLength(32)
    expect(newChallengeId()).not.toBe(newChallengeId())
  })

  it('hashes with the challenge id and compares in constant time', () => {
    const hash = hashCode(ID, '123456')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashCode('other', '123456')).not.toBe(hash)
    expect(codeMatches(ID, '123456', hash)).toBe(true)
    expect(codeMatches(ID, '654321', hash)).toBe(false)
    expect(codeMatches('other', '123456', hash)).toBe(false)
    expect(codeMatches(ID, '123456', 'abcd')).toBe(false)
  })

  it('normalizes a typed code', () => {
    expect(normalizeCode(' 482 913 ')).toBe('482913')
    expect(normalizeCode('48291')).toBeNull()
    expect(normalizeCode('48291a')).toBeNull()
    expect(normalizeCode(482913)).toBeNull()
    expect(displayCode('482913')).toBe('482 913')
  })
})

describe('keys and limits', () => {
  it('never holds the challenge id or the user id in clear', () => {
    expect(challengeKey(ID)).toMatch(/^foundation:second-factor:[0-9a-f]{64}$/)
    expect(challengeKey(ID)).not.toContain(ID)
    expect(challengeLockKey(ID)).toMatch(/^foundation\.second_factor:[0-9a-f]{64}$/)
    const limit = challengeLimit('u1')
    expect(limit.config).toEqual({ ...CHALLENGE_HOURLY_LIMIT })
    expect(limit.config).toEqual({ points: 5, duration: 3600, keyPrefix: 'vereino_second_factor_challenge' })
    expect(limit.key).not.toContain('u1')
  })

  it('registers the two completion routes for POST', () => {
    expect(SECOND_FACTOR_COMPLETION_ROUTES.map((route) => route.path)).toEqual([
      '/api/foundation/second-factor/verify',
      '/api/foundation/second-factor/resend',
    ])
  })
})

describe('parseChallengeMarker', () => {
  it('reads a stored marker from JSON or an object', () => {
    expect(parseChallengeMarker(JSON.stringify(marker()))).toEqual(marker())
    expect(parseChallengeMarker(marker({ remember: true }))).toEqual(marker({ remember: true }))
  })

  it('refuses anything else', () => {
    expect(parseChallengeMarker('{')).toBeNull()
    expect(parseChallengeMarker(null)).toBeNull()
    expect(parseChallengeMarker('"text"')).toBeNull()
    expect(parseChallengeMarker({ ...marker(), userId: '' })).toBeNull()
    expect(parseChallengeMarker({ ...marker(), attempts: -1 })).toBeNull()
    expect(parseChallengeMarker({ ...marker(), resends: 1.5 })).toBeNull()
    expect(parseChallengeMarker({ ...marker(), remember: 'yes' })).toBeNull()
  })
})

describe('claims', () => {
  const issued = { sub: 'u1', sid: 's1', tenantId: 't1', orgId: 'o1', email: 'e@club.example.test', roles: ['r'] }

  it('builds a provisional token for the same session and reads it back', () => {
    const claims = provisionalTokenClaims(issued, ID)
    expect(claims).toEqual({ ...issued, mfa_pending: true, [CHALLENGE_CLAIM]: ID })
    expect(readProvisionalClaims(claims)).toEqual(CLAIMS)
  })

  it('reads no provisional claims from a full or verified token', () => {
    expect(readProvisionalClaims(issued)).toBeNull()
    expect(readProvisionalClaims({ ...provisionalTokenClaims(issued, ID), mfa_verified: true })).toBeNull()
    expect(readProvisionalClaims({ ...provisionalTokenClaims(issued, ID), [CHALLENGE_CLAIM]: '' })).toBeNull()
    expect(readProvisionalClaims(null)).toBeNull()
  })

  it('reads the issued claims of a platform token', () => {
    expect(readIssuedClaims(issued)).toEqual(issued)
    expect(readIssuedClaims({ ...issued, orgId: null })).toBeNull()
    expect(readIssuedClaims('token')).toBeNull()
  })
})

describe('marker rules', () => {
  it('matches the token user, session and scope until it expires', () => {
    expect(markerMatches(marker(), CLAIMS, NOW)).toBe(true)
    expect(markerMatches(marker(), CLAIMS, NOW + CHALLENGE_TTL_MS)).toBe(false)
    expect(markerMatches(marker({ userId: 'u2' }), CLAIMS, NOW)).toBe(false)
    expect(markerMatches(marker({ sessionId: 's2' }), CLAIMS, NOW)).toBe(false)
    expect(markerMatches(marker({ tenantId: 't2' }), CLAIMS, NOW)).toBe(false)
    expect(markerMatches(marker({ organizationId: 'o2' }), CLAIMS, NOW)).toBe(false)
  })

  it('counts wrong codes down and locks at the fifth', () => {
    let current = marker()
    const left: number[] = []
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const result = afterWrongCode(current)
      current = result.marker
      left.push(result.attemptsLeft)
      expect(result.locked).toBe(i === MAX_ATTEMPTS - 1)
    }
    expect(left).toEqual([4, 3, 2, 1, 0])
    expect(afterWrongCode(current).attemptsLeft).toBe(0)
  })

  it('spaces resends 60 s apart and stops after the third', () => {
    expect(nextResendAt(marker())).toBe(NOW + RESEND_SPACING_MS)
    expect(resendDecision(marker(), ID, '111111', NOW + 59_000)).toEqual({
      allowed: false,
      nextResendAt: NOW + RESEND_SPACING_MS,
    })
    const first = resendDecision(marker({ attempts: 2 }), ID, '111111', NOW + RESEND_SPACING_MS)
    expect(first.allowed).toBe(true)
    if (!first.allowed) throw new Error('unreachable')
    expect(first.marker.resends).toBe(1)
    expect(first.marker.attempts).toBe(2)
    expect(first.marker.lastSentAt).toBe(NOW + RESEND_SPACING_MS)
    expect(first.marker.expiresAt).toBe(NOW + CHALLENGE_TTL_MS)
    expect(codeMatches(ID, '111111', first.marker.codeHash)).toBe(true)
    expect(resendDecision(marker({ resends: MAX_RESENDS }), ID, '111111', NOW + 600_000)).toEqual({
      allowed: false,
      nextResendAt: null,
    })
  })
})

describe('emailHint', () => {
  it('masks the local part', () => {
    expect(emailHint('ewa@klub.example.test')).toBe('e•••@klub.example.test')
    expect(emailHint('broken')).toBe('•••')
    expect(emailHint('@klub.example.test')).toBe('•••')
  })
})

describe('providers and paths', () => {
  it('counts Google only and builds the /login sentences', () => {
    expect(providerCountsAsSecondFactor('google')).toBe(true)
    expect(providerCountsAsSecondFactor('facebook')).toBe(false)
    expect(secondFactorLoginPath('expired')).toBe('/login?second_factor=expired')
    expect(SECOND_FACTOR_USE_GOOGLE_PATH).toBe('/login?second_factor=use_google')
  })
})
