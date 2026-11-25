import { expect, test } from '@playwright/test'
import { familyFor } from '../_fixtures/attendance'
import { call, createClub, mercato, type Club } from '../_fixtures/club'
import { publicGet } from '../_fixtures/publication'
import {
  ensureLibrary,
  ownOutline,
  publishOutline,
  readEntry,
  setLibraryLevel,
  uniqueTopic,
} from '../_fixtures/library'

// Training outlines spec TEST-O13 (REQ-O15, AC-O12; DD-O14, Q-O04; #685): reports from two people of one club, and a
// report from the public page, do not hide an entry; a report from a third different club does — the entry answers
// 404 to every reader until the operator decides. `training library-moderate list` shows it; `restore` lists it again
// (its reports settled), `remove` takes it out for good. One report per coach (409 the second time).
test.describe.configure({ timeout: 600_000 })

type Moderation = { entries: { id: string; status: string; reportCount: number }[] }

async function report(request: Parameters<typeof call>[0], token: string, entryId: string) {
  return call<{ code?: string }>(request, 'POST', `/api/training/library/${entryId}/report`, token, {
    data: { reason: 'copyright', note: 'Skan z książki' },
  })
}

test('TEST-O13 reports from three clubs hide an entry and the operator restores or removes it', async ({ request }) => {
  ensureLibrary()
  const clubs: Club[] = []
  try {
    for (const label of ['a', 'b', 'c', 'd']) clubs.push(await createClub(request, `test-o13-${label}`))
    const [author, first, second, third] = await Promise.all(clubs.map((club) => familyFor(request, club)))
    await setLibraryLevel(request, clubs[0], 'public')
    const topic = uniqueTopic('Zgłoszenia')
    const outline = await ownOutline(request, author.coach.token, topic)
    const shared = await publishOutline(request, author.coach.token, outline.id, {
      visibility: 'public',
      acceptTerms: true,
    })
    expect(shared.status, JSON.stringify(shared.body)).toBe(201)
    const entryId = String(shared.body?.entryId)

    // Two people of one club and a guest: still listed.
    expect((await report(request, first.coach.token, entryId)).status).toBe(201)
    const twice = await report(request, first.coach.token, entryId)
    expect(twice.status, JSON.stringify(twice.body)).toBe(409)
    expect(twice.body?.code).toBe('library_report_exists')
    expect((await report(request, first.academyCoordinator.token, entryId)).status).toBe(201)
    const guest = await publicGet(request, `/api/training/public/library/${entryId}`)
    expect(guest.status).toBe(200)
    expect((await report(request, second.coach.token, entryId)).status).toBe(201)
    expect((await readEntry(request, third.coach.token, entryId)).status).toBe(200)

    // The third club hides it.
    expect((await report(request, third.coach.token, entryId)).status).toBe(201)
    expect((await readEntry(request, third.coach.token, entryId)).status).toBe(404)
    expect((await readEntry(request, author.coach.token, entryId)).status).toBe(404)
    expect((await publicGet(request, `/api/training/public/library/${entryId}`)).status).toBe(404)

    // The operator lists it, restores it (the reports are settled) and the entry is back.
    const listed = mercato(['training', 'library-moderate', 'list']) as Moderation
    expect(listed.entries.find((entry) => entry.id === entryId)).toMatchObject({
      status: 'hidden_reported',
      reportCount: 4,
    })
    expect(mercato(['training', 'library-moderate', 'restore', '--entry', entryId])).toMatchObject({
      id: entryId,
      status: 'listed',
      reportCount: 0,
    })
    expect((await readEntry(request, third.coach.token, entryId)).status).toBe(200)
    expect((await readEntry(request, third.coach.token, entryId)).body?.mine?.reported).toBe(false)

    // `remove` takes it out for good.
    expect(mercato(['training', 'library-moderate', 'remove', '--entry', entryId])).toMatchObject({ status: 'removed' })
    expect((await readEntry(request, first.coach.token, entryId)).status).toBe(404)
  } finally {
    for (const club of clubs.reverse()) await club.cleanup()
  }
})
