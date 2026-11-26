import { expect, test } from '@playwright/test'
import { familyFor } from '../_fixtures/attendance'
import { call, createClub } from '../_fixtures/club'
import {
  ensureLibrary,
  ownOutline,
  publishOutline,
  readEntry,
  setLibraryLevel,
  uniqueTopic,
} from '../_fixtures/library'

// Training outlines spec TEST-O10 (REQ-O11, AC-O10; BR-O4, BR-O5, B-O1; #685): a club at the level "club" refuses
// every publication (403 `visibility_above_club_level`); at "clubs on Vereino" (a new club's default) only `clubs`;
// at "public" both. Lowering the level withdraws the club's entries above it after the commit: the public one first,
// then — at "club" — every one, and the outlines show "stays in the club" again.
test.describe.configure({ timeout: 300_000 })

type OutlineRead = { publication: { entryId: string; visibility: string } | null; library: { maxVisibility: string } }

test('TEST-O10 the club level caps sharing and lowering it withdraws entries above it', async ({ request }) => {
  ensureLibrary()
  const club = await createClub(request, 'test-o10')
  const reader = await createClub(request, 'test-o10-reader')
  try {
    const family = await familyFor(request, club)
    const other = await familyFor(request, reader)
    const coach = family.coach.token
    const topic = uniqueTopic('Poziom klubu')
    const one = await ownOutline(request, coach, `${topic} jeden`)
    const two = await ownOutline(request, coach, `${topic} dwa`)
    const outline = async (id: string) =>
      (await call<OutlineRead>(request, 'GET', `/api/training/outlines/${id}`, coach)).body as OutlineRead

    // A new club starts at "clubs on Vereino": `public` is above it.
    expect((await outline(one.id)).library.maxVisibility).toBe('clubs')
    const tooWide = await publishOutline(request, coach, one.id, { visibility: 'public', acceptTerms: true })
    expect(tooWide.status, JSON.stringify(tooWide.body)).toBe(403)
    expect(tooWide.body?.code).toBe('visibility_above_club_level')

    // At "club" nothing may be shared.
    await setLibraryLevel(request, club, 'club')
    const none = await publishOutline(request, coach, one.id, { visibility: 'clubs', acceptTerms: true })
    expect(none.status, JSON.stringify(none.body)).toBe(403)
    expect(none.body?.code).toBe('visibility_above_club_level')

    // At "public" both levels.
    await setLibraryLevel(request, club, 'public')
    const publicEntry = await publishOutline(request, coach, one.id, { visibility: 'public', acceptTerms: true })
    expect(publicEntry.status, JSON.stringify(publicEntry.body)).toBe(201)
    const clubsEntry = await publishOutline(request, coach, two.id, { visibility: 'clubs' })
    expect(clubsEntry.status, JSON.stringify(clubsEntry.body)).toBe(201)
    expect((await outline(one.id)).publication?.visibility).toBe('public')

    // Lowering to "clubs" withdraws the public entry only (BR-O5, after the commit).
    await setLibraryLevel(request, club, 'clubs')
    await expect
      .poll(async () => (await readEntry(request, other.coach.token, String(publicEntry.body?.entryId))).status, {
        timeout: 60_000,
      })
      .toBe(404)
    expect((await outline(one.id)).publication).toBeNull()
    expect((await readEntry(request, other.coach.token, String(clubsEntry.body?.entryId))).status).toBe(200)

    // Lowering to "club" withdraws every entry of the club.
    await setLibraryLevel(request, club, 'club')
    await expect
      .poll(async () => (await readEntry(request, other.coach.token, String(clubsEntry.body?.entryId))).status, {
        timeout: 60_000,
      })
      .toBe(404)
    expect((await outline(two.id)).publication).toBeNull()
  } finally {
    await reader.cleanup()
    await club.cleanup()
  }
})
