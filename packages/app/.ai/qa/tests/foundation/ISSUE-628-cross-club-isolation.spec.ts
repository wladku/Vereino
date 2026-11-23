import { expect, test } from '@playwright/test'
import { createFirstClub, createSecondClub, seedClub } from '../_fixtures/isolation/seed'
import { disposeGuest, loadInventory, runProbes, snapshotReads } from '../_fixtures/isolation/probe'
import { moduleSeedsFor } from '../_fixtures/isolation/seeds'

// ISSUE-628 (E22-S02, D-034: one production instance serves many clubs): one club never sees another club's data.
// Two clubs with lookalike data share one tenant (club B is a second organization, so a route that narrows by tenant
// only fails too). Every route of every Vereino module is in the route inventory (`_fixtures/isolation/inventory`,
// kept complete by `yarn route-isolation:check`); each probe runs as each role of club A: no record, count or file of
// club B comes back, and a club B id answers like an id that exists nowhere (404 for the administrator), so its
// existence does not leak. `VEREINO_ISOLATION_MODULES=people,groups` narrows a local run to some modules.
test.describe.configure({ timeout: 3_600_000, retries: 0 })

test('ISSUE-628 no Vereino route shows one club the data of another club', async ({ request }) => {
  const modules = process.env.VEREINO_ISOLATION_MODULES?.split(',').filter(Boolean) ?? null
  const entries = loadInventory(modules)
  expect(entries.length, 'the route inventory is empty').toBeGreaterThan(0)
  const seeds = moduleSeedsFor(modules)
  const first = await createFirstClub(request)
  try {
    const A = await seedClub(request, first, 'A', seeds)
    const snapshot = await snapshotReads(request, entries, A)
    const B = await seedClub(request, await createSecondClub(request, first), 'B', seeds)
    const { problems, calls } = await runProbes(request, entries, { A, B }, snapshot)
    await test.info().attach('isolation-report.json', {
      body: JSON.stringify({ probes: entries.length, calls, problems }, null, 2),
      contentType: 'application/json',
    })
    expect(problems, `${String(problems.length)} isolation problem(s) in ${String(calls)} calls`).toEqual([])
  } finally {
    await disposeGuest()
    await first.cleanup()
  }
})
