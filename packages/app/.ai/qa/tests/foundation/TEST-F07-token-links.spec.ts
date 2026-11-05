import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClub, createSecondOrganization } from '../_fixtures/club'
import {
  runTokenProbe,
  tokenOutput,
  type TokenProbeStep,
  type TokenProbeStored,
  type TokenProbeView,
} from '../_fixtures/token-links'

// TEST-F07 (foundation spec REQ-F07, phase C step 1, #157; integration + security): the P-10 token-link service on two
// probe tables, one per use policy. A link is stored only as the HMAC of its raw token; a peek (the GET path) spends
// nothing; a redemption spends it in the caller's transaction (a rolled-back one spends nothing); an `until_expiry` link
// counts every redemption; of two concurrent redemptions of a `single` link exactly one wins and the other answers 410
// `token_link_used`; an expired link answers 410 `token_link_expired`; a link of another organization or tenant, an
// unknown and a malformed token answer `null` (the route's 404) without detail; no event, log line or step output carries
// a raw token or its hash. The declaration-link oracles of TEST-F07 (scope after an ended guardianship, `acting_role`,
// the link request) land with the first consumer, #105.
test.describe.configure({ timeout: 600_000 })

type Redeemed = { results: TokenProbeView[] }

test('TEST-F07 token links: hashed storage, free peek, one-time and counted redemption, expiry and isolation', async ({
  request,
}) => {
  const club = await createClub(request, 'test-f07')
  try {
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const second = await createSecondOrganization(request, club)
    const otherOrganization = { tenantId: scope.tenantId, organizationId: second.organizationId }
    const otherTenant = { tenantId: randomUUID(), organizationId: scope.organizationId }
    const guardian = randomUUID()
    const targets = [randomUUID(), randomUUID()]

    const steps: TokenProbeStep[] = []
    const step = (entry: TokenProbeStep) => steps.push(entry) - 1
    const issueDeclaration = step({ op: 'issue', use: 'until_expiry', subjectId: guardian, targets, as: 'declaration' })
    const issueSingle = step({ op: 'issue', use: 'single', subjectId: guardian, targets: [targets[0]], as: 'single' })
    const storedFresh = step({ op: 'stored', token: 'declaration' })
    const peeks = [1, 2, 3].map(() => step({ op: 'peek', token: 'declaration' }))
    const afterPeeks = step({ op: 'stored', token: 'declaration' })
    const rolledBack = step({ op: 'redeem', token: 'declaration', rollback: true })
    const afterRollback = step({ op: 'stored', token: 'declaration' })
    const firstDeclare = step({ op: 'redeem', token: 'declaration' })
    const secondDeclare = step({ op: 'redeem', token: 'declaration' })
    const afterDeclares = step({ op: 'stored', token: 'declaration' })
    const race = step({ op: 'redeem', token: 'single', times: 2 })
    const afterRace = step({ op: 'stored', token: 'single' })
    const peekUsed = step({ op: 'peek', token: 'single' })
    const replay = step({ op: 'redeem', token: 'single' })
    const otherOrgPeek = step({ op: 'peek', token: 'declaration', scope: otherOrganization })
    const otherOrgRedeem = step({ op: 'redeem', token: 'declaration', scope: otherOrganization })
    const otherTenantPeek = step({ op: 'peek', token: 'declaration', scope: otherTenant })
    const ownScopePeek = step({ op: 'peek', token: 'declaration', scope })
    const unknownPeek = step({ op: 'peek', token: 'unknown', use: 'until_expiry' })
    const unknownRedeem = step({ op: 'redeem', token: 'unknown', use: 'single' })
    const malformedPeek = step({ op: 'peek', token: 'malformed', use: 'single' })
    step({ op: 'expire', token: 'declaration' })
    const expiredPeek = step({ op: 'peek', token: 'declaration' })
    const expiredRedeem = step({ op: 'redeem', token: 'declaration' })
    const afterExpiry = step({ op: 'stored', token: 'declaration' })
    const shortLived = step({
      op: 'issue',
      use: 'single',
      subjectId: guardian,
      targets,
      expiresInMs: 60_000,
      as: 'short',
    })
    const tooLong = step({
      op: 'issue',
      use: 'single',
      ttlMs: 60_000,
      subjectId: guardian,
      targets,
      expiresInMs: 120_000,
      as: 'too-long',
    })

    const run = runTokenProbe(scope, steps)
    expect(run.result.failure).toBeNull()

    // Issued: a 64-character raw token, stored only as its HMAC (`hashAuthToken`), in the issuing club.
    for (const index of [issueDeclaration, issueSingle, shortLived]) {
      expect((tokenOutput(run, index) as { rawTokenLength: number }).rawTokenLength).toBe(64)
    }
    const fresh = tokenOutput(run, storedFresh) as TokenProbeStored
    expect(fresh).toMatchObject({ ...scope, hashIsHmacOfRaw: true, rowContainsRaw: false, usedCount: 0 })
    expect(fresh.lastUsedAt).toBeNull()

    // A peek (the GET path) finds the link, narrowed to its club, and spends nothing — three times over.
    for (const index of peeks) {
      const peeked = tokenOutput(run, index) as TokenProbeView
      expect(peeked.found).toMatchObject({ ...scope, subjectId: guardian, targets, usedCount: 0 })
    }
    expect(tokenOutput(run, afterPeeks) as TokenProbeStored).toMatchObject({ usedCount: 0, lastUsedAt: null })

    // A redemption in a transaction that rolls back spends nothing.
    expect((tokenOutput(run, rolledBack) as Redeemed).results[0]).toMatchObject({ rolledBack: true })
    expect(tokenOutput(run, afterRollback) as TokenProbeStored).toMatchObject({ usedCount: 0, lastUsedAt: null })

    // An `until_expiry` link: both declarations are accepted and counted.
    expect((tokenOutput(run, firstDeclare) as Redeemed).results[0].found).toMatchObject({ usedCount: 1 })
    expect((tokenOutput(run, secondDeclare) as Redeemed).results[0].found).toMatchObject({ usedCount: 2 })
    const declared = tokenOutput(run, afterDeclares) as TokenProbeStored
    expect(declared.usedCount).toBe(2)
    expect(declared.lastUsedAt).not.toBeNull()

    // A `single` link redeemed twice at once: exactly one wins, the other answers 410 token_link_used.
    const racers = (tokenOutput(run, race) as Redeemed).results
    expect(racers.filter((result) => result.found?.used === true)).toHaveLength(1)
    const losers = racers.filter((result) => result.error)
    expect(losers).toHaveLength(1)
    expect(losers[0].error).toMatchObject({ status: 410, code: 'token_link_used' })
    expect((tokenOutput(run, afterRace) as TokenProbeStored).usedAt).not.toBeNull()
    expect((tokenOutput(run, peekUsed) as TokenProbeView).error).toMatchObject({ status: 410, code: 'token_link_used' })
    expect((tokenOutput(run, replay) as Redeemed).results[0].error).toMatchObject({
      status: 410,
      code: 'token_link_used',
    })

    // Another organization or tenant, an unknown and a malformed token: `null` (the route's 404), no detail.
    for (const index of [otherOrgPeek, otherTenantPeek, unknownPeek, malformedPeek]) {
      expect(tokenOutput(run, index) as TokenProbeView).toEqual({ found: null })
    }
    for (const index of [otherOrgRedeem, unknownRedeem]) {
      expect((tokenOutput(run, index) as Redeemed).results).toEqual([{ found: null }])
    }
    expect((tokenOutput(run, ownScopePeek) as TokenProbeView).found).toMatchObject(scope)

    // After its expiry the link answers 410 token_link_expired to a peek and a redemption, and is not spent.
    expect((tokenOutput(run, expiredPeek) as TokenProbeView).error).toMatchObject({
      status: 410,
      code: 'token_link_expired',
    })
    expect((tokenOutput(run, expiredRedeem) as Redeemed).results[0].error).toMatchObject({
      status: 410,
      code: 'token_link_expired',
    })
    expect((tokenOutput(run, afterExpiry) as TokenProbeStored).usedCount).toBe(2)

    // An own expiry is accepted within the time to live and refused beyond it (a programming error, not a 4xx).
    expect((tokenOutput(run, shortLived) as { error?: unknown }).error).toBeUndefined()
    expect((tokenOutput(run, tooLong) as { error: { status: number; message: string } }).error).toMatchObject({
      status: 500,
      message: expect.stringContaining('within the time to live'),
    })

    // No raw token or hash in any event, log line or step output (foundation III REQ-M03's rule for link secrets).
    const secrets = run.result.secrets
    expect(secrets).toHaveLength(6)
    const leaks = (value: unknown) => secrets.some((secret) => JSON.stringify(value ?? null).includes(secret))
    expect(leaks(run.result.events)).toBe(false)
    expect(leaks(run.result.outputs)).toBe(false)
    expect(secrets.some((secret) => run.log.includes(secret))).toBe(false)
  } finally {
    await club.cleanup()
  }
})
