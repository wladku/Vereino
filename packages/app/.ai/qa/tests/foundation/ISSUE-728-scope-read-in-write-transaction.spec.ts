import { expect, test } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, birthDateTurning, call, createClub, getPerson } from '../_fixtures/club'

// ISSUE-728 (issue #728, after #549 and #726): `authorizeScoped` read the caller's grants through the scope provider
// on a second pooled connection while the command's write transaction held one. The ephemeral app runs with
// `DB_POOL_MAX=20`, so from about 20 concurrent writes of one command every request waited for a second connection
// until the acquire timeout. `people.persons.create` and `people.persons.update` never prefetched the scope (#549's
// workaround for "Accept cash"): they rely on `authorizeScoped` reading the grants on the transaction's own
// connection. Fifty creates and then fifty updates sent at once all succeed.
test.describe.configure({ timeout: 300_000 })

const WRITES = 50

type Outcome = { status: number; body: unknown }

function failuresOf(results: Outcome[], expected: number): string[] {
  return results
    .filter((result) => result.status !== expected)
    .map((result) => `${String(result.status)} ${JSON.stringify(result.body)}`)
}

test('ISSUE-728 fifty concurrent person creates and fifty concurrent updates all succeed', async ({ request }) => {
  const club = await createClub(request, 'issue-728')
  try {
    const admin = club.adminToken
    const created = await Promise.all(
      Array.from({ length: WRITES }, (_, index) =>
        call<{ id?: string }>(request, 'POST', '/api/people/persons', admin, {
          data: { firstName: 'Ola', lastName: `Równoległa ${String(index + 1)}`, birthDate: birthDateTurning(25) },
        }),
      ),
    )
    expect(failuresOf(created, 201)).toEqual([])
    const ids = created.map((result) => String(result.body?.id))
    expect(new Set(ids).size).toBe(WRITES)

    const versions = await Promise.all(
      ids.map(async (id) => {
        const read = await getPerson(request, admin, id)
        expect(read.status, JSON.stringify(read.body)).toBe(200)
        return String((read.body as { updatedAt?: string } | null)?.updatedAt)
      }),
    )
    const updated = await Promise.all(
      ids.map((id, index) =>
        call(request, 'PUT', '/api/people/persons', admin, {
          data: { id, notes: `Zapis ${String(index + 1)}` },
          headers: { [OPTIMISTIC_LOCK_HEADER]: versions[index] },
        }),
      ),
    )
    expect(failuresOf(updated, 200)).toEqual([])

    for (const [index, id] of ids.entries()) {
      const read = await getPerson(request, admin, id)
      expect((read.body as { notes?: string } | null)?.notes).toBe(`Zapis ${String(index + 1)}`)
    }
  } finally {
    await club.cleanup()
  }
})
