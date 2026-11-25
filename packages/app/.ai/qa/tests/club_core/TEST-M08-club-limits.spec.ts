import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { createClub } from '../_fixtures/club'
import { csvFile, familiesCsv, familyRows, importAction, previewImport } from '../_fixtures/imports'
import { maxSendsPerWindow, outputOf, runProbe, uniqueAddress } from '../_fixtures/messaging'

// TEST-M08 (many-clubs spec REQ-M07, AC-M07, DD-M10; #633): per-club fairness on the shared instance.
// - E-mail: club A dispatches 200 e-mails, then club B one; one drain of the shared queue sends B's at once, while A's
//   leave at the club pace (2 per second, after a burst of 2), never more than the process's 8 per second.
// - Imports: while one import of club A runs (its import slot held, as a long commit holds it), A's next import commit
//   answers 409 `import_running` and writes nothing; club B's import commits; once the slot is free A's commits.
// Runs on the local queue strategy with the messaging probe's scripted sender (no real e-mail leaves).
test.describe.configure({ timeout: 900_000 })

const emailRecipient = (email: string) => ({
  personId: randomUUID(),
  userId: null,
  email,
  locale: 'pl',
  reasons: ['direct'],
  channels: ['email'],
})

/** One new family, without a group (the clubs of this test have none). */
function oneFamilyCsv() {
  const [row] = familyRows()
  return csvFile(familiesCsv([[...row.slice(0, 6), uniqueAddress('m08-guardian'), row[7], null]]))
}

test('TEST-M08 club limits: a club’s 200 e-mails do not hold up another club’s, one running import per club', async ({
  request,
}) => {
  const clubA = await createClub(request, 'test-m08-a')
  const clubB = await createClub(request, 'test-m08-b')
  try {
    const scopeA = { tenantId: clubA.tenant.tenantId, organizationId: clubA.tenant.organizationId }
    const scopeB = { tenantId: clubB.tenant.tenantId, organizationId: clubB.tenant.organizationId }

    // --- e-mail fairness ---
    const flood = Array.from({ length: 200 }, (_, index) => uniqueAddress(`m08-a-${String(index)}`))
    const otherClub = uniqueAddress('m08-b')
    const message = { template: 'qa_probe.message', params: { subject: 'Trening', body: 'Treść' } }
    const enqueuedAt = Date.now()
    const run = runProbe(scopeA, [
      {
        op: 'enqueue',
        ...message,
        sourceId: randomUUID(),
        recipients: flood.map(emailRecipient),
        idempotencyKey: `test-m08:flood:${randomUUID()}`,
      },
      {
        op: 'enqueue',
        ...message,
        sourceId: randomUUID(),
        recipients: [emailRecipient(otherClub)],
        idempotencyKey: `test-m08:other:${randomUUID()}`,
        scope: scopeB,
      },
      { op: 'drain', concurrency: 5, timeoutMs: 60_000 },
    ])
    expect(run.result.failure).toBeNull()
    expect((outputOf(run, 0) as { created: boolean }).created).toBe(true)
    expect((outputOf(run, 1) as { created: boolean }).created).toBe(true)

    const floodSends = run.result.sends.filter((send) => flood.includes(send.to)).map((send) => send.at)
    const otherSends = run.result.sends.filter((send) => send.to === otherClub).map((send) => send.at)
    expect(floodSends).toHaveLength(200)
    expect(otherSends).toHaveLength(1)
    // Club B's e-mail went out in the first round, ahead of almost all of club A's.
    expect(floodSends.filter((at) => at < otherSends[0]).length).toBeLessThanOrEqual(8)
    expect(otherSends[0] - enqueuedAt).toBeLessThan(60_000)
    // Club A's e-mail left at its pace: at most the burst plus one in any second, about 100 s for 200.
    expect(maxSendsPerWindow(floodSends, 999)).toBeLessThanOrEqual(3)
    expect(Math.max(...floodSends) - Math.min(...floodSends)).toBeGreaterThanOrEqual(95_000)
    expect(maxSendsPerWindow([...floodSends, ...otherSends])).toBeLessThanOrEqual(8)

    // --- one running import per club ---
    const importA = await previewImport(request, clubA.adminToken, oneFamilyCsv())
    const importB = await previewImport(request, clubB.adminToken, oneFamilyCsv())
    await withClient(async (db) => {
      await db.query('begin')
      try {
        // Club A's slot is held, as a running commit holds it until its transaction ends.
        await db.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `vereino.club_import:${scopeA.organizationId}`,
        ])
        const refused = await importAction(request, clubA.adminToken, importA.id, 'commit', importA.updatedAt)
        expect(refused.status, JSON.stringify(refused.body)).toBe(409)
        expect(refused.body?.code).toBe('import_running')
        const otherCommit = await importAction(request, clubB.adminToken, importB.id, 'commit', importB.updatedAt)
        expect(otherCommit.status, JSON.stringify(otherCommit.body)).toBe(200)
        expect(otherCommit.body?.status).toBe('committed')
      } finally {
        await db.query('rollback')
      }
    })
    const committed = await importAction(request, clubA.adminToken, importA.id, 'commit', importA.updatedAt)
    expect(committed.status, JSON.stringify(committed.body)).toBe(200)
    expect(committed.body?.status).toBe('committed')
  } finally {
    await clubB.cleanup()
    await clubA.cleanup()
  }
})
