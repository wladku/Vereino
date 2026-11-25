import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { familyFor } from '../_fixtures/attendance'
import { call, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import {
  closeSessionWith,
  ensureLibrary,
  ownOutline,
  publishOutline,
  readEntry,
  searchLibrary,
  uniqueTopic,
} from '../_fixtures/library'
import { expectNoPageOverflow, scanInColorSchemes } from '../_fixtures/axe'
import { uiText } from '../_fixtures/ui-text'

// Training outlines spec TEST-O09 (REQ-O11, REQ-O12, AC-O10; DD-O11…DD-O13; #685): two clubs share one library. Club
// A's coach shares two outlines with clubs on Vereino (accepting the terms once). Club B's coach finds them, sees the
// credit but no club A ids, cannot rate before a use (409), copies one (the copy keeps the credit), uses it in a
// closed session and rates it; the ranking puts the rated entry first, "newest" the later one. Sharing the copy again
// keeps the first author's credit. On the phone (375 px) the library lists the entry and its page offers the copy
// and the stars.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('TEST-O09 a coach shares an outline, another club copies, uses and rates it', async ({
  request,
  page,
}, testInfo) => {
  ensureLibrary()
  const clubA = await createClub(request, 'test-o09-a')
  const clubB = await createClub(request, 'test-o09-b')
  try {
    const familyA = await familyFor(request, clubA)
    const familyB = await familyFor(request, clubB)
    const topic = uniqueTopic('Obrona 1×1')

    // --- Club A shares two outlines with clubs on Vereino; the first publication needs the terms ---
    const first = await ownOutline(request, familyA.coach.token, topic)
    const refused = await publishOutline(request, familyA.coach.token, first.id, { visibility: 'clubs' })
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body?.code).toBe('library_terms_required')
    const shared = await publishOutline(request, familyA.coach.token, first.id, {
      visibility: 'clubs',
      acceptTerms: true,
    })
    expect(shared.status, JSON.stringify(shared.body)).toBe(201)
    const entryX = String(shared.body?.entryId)
    const second = await ownOutline(request, familyA.coach.token, `${topic} wariant`)
    const sharedY = await publishOutline(request, familyA.coach.token, second.id, { visibility: 'clubs' })
    expect(sharedY.status, JSON.stringify(sharedY.body)).toBe(201)
    const entryY = String(sharedY.body?.entryId)
    // Publishing again replaces the snapshot and keeps the entry.
    const again = await publishOutline(request, familyA.coach.token, first.id, { visibility: 'clubs' })
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body?.entryId).toBe(entryX)

    // --- Club B finds them: the credit, no club A ids ---
    const found = await searchLibrary(request, familyB.coach.token, { q: topic, sort: 'newest' })
    expect(found.status, JSON.stringify(found.body)).toBe(200)
    expect(found.body?.items?.map((item) => item.id)).toEqual([entryY, entryX])
    expect(found.body?.items?.every((item) => !item.ownClub && item.credit.clubName.length > 0)).toBe(true)
    const viewed = await readEntry(request, familyB.coach.token, entryX)
    expect(viewed.status, JSON.stringify(viewed.body)).toBe(200)
    expect(viewed.body?.mine).toEqual({ used: false, stars: null, reported: false })
    const text = JSON.stringify(viewed.body)
    for (const id of [first.id, familyA.coach.personId, clubA.tenant.organizationId, clubA.tenant.tenantId]) {
      expect(text, 'no club A id in the entry').not.toContain(id)
    }

    // --- No rating before a use (BR-O6) ---
    const early = await call<{ code?: string }>(
      request,
      'PUT',
      `/api/training/library/${entryX}/rating`,
      familyB.coach.token,
      {
        data: { stars: 5 },
      },
    )
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body?.code).toBe('rating_requires_use')

    // --- Club B copies it: the copy keeps the credit ---
    const copy = await call<{ id: string }>(
      request,
      'POST',
      `/api/training/library/${entryX}/copy`,
      familyB.coach.token,
    )
    expect(copy.status, JSON.stringify(copy.body)).toBe(201)
    const copyId = String(copy.body?.id)
    const copied = await call<{ topic: string; origin: { entryId: string; clubName: string } | null }>(
      request,
      'GET',
      `/api/training/outlines/${copyId}`,
      familyB.coach.token,
    )
    expect(copied.status, JSON.stringify(copied.body)).toBe(200)
    expect(copied.body?.topic).toBe(topic)
    expect(copied.body?.origin?.entryId).toBe(entryX)
    expect(copied.body?.origin?.clubName).toBe(viewed.body?.credit.clubName)

    // --- A closed session that used it records the use; then the coach rates, and may change the rating ---
    await closeSessionWith(request, clubB, familyB, copyId)
    await expect
      .poll(async () => (await readEntry(request, familyB.coach.token, entryX)).body?.mine?.used, { timeout: 60_000 })
      .toBe(true)
    const rated = await call<{ stars: number; ratingCount: number }>(
      request,
      'PUT',
      `/api/training/library/${entryX}/rating`,
      familyB.coach.token,
      { data: { stars: 4 } },
    )
    expect(rated.status, JSON.stringify(rated.body)).toBe(200)
    const changed = await call<{ stars: number; averageRating: number; ratingCount: number }>(
      request,
      'PUT',
      `/api/training/library/${entryX}/rating`,
      familyB.coach.token,
      { data: { stars: 5 } },
    )
    expect(changed.body).toEqual({ stars: 5, averageRating: 5, ratingCount: 1 })

    // --- The ranking puts the rated, used entry first; "newest" the later one (DD-O13) ---
    const ranked = await searchLibrary(request, familyB.coach.token, { q: topic, sort: 'ranking' })
    expect(ranked.body?.items?.map((item) => item.id)).toEqual([entryX, entryY])
    const used = await searchLibrary(request, familyB.coach.token, { q: topic, sort: 'used' })
    expect(used.body?.items?.[0]?.userCount).toBeGreaterThanOrEqual(1)
    expect(used.body?.items?.[0]?.id).toBe(entryX)

    // --- Sharing the copy again keeps the first author's credit ---
    const reshared = await publishOutline(request, familyB.coach.token, copyId, {
      visibility: 'clubs',
      acceptTerms: true,
    })
    expect(reshared.status, JSON.stringify(reshared.body)).toBe(201)
    const adapted = await readEntry(request, familyA.coach.token, String(reshared.body?.entryId))
    expect(adapted.body?.credit.adaptedFrom).toMatchObject({ entryId: entryX, clubName: viewed.body?.credit.clubName })

    // --- On the phone: the library lists the entry; its page offers the copy and the stars ---
    await page.setViewportSize({ width: 375, height: 812 })
    const password = await signInBrowser(page, request, clubB, familyB.coach.userId, familyB.coach.email)
    await page.goto('/club/training/library')
    await page.getByTestId('training-library-search').fill(topic)
    const card = page.getByTestId('training-library-card').filter({ hasText: `${topic} wariant` })
    await expect(card).toBeVisible()
    expect(
      await scanInColorSchemes(page, testInfo, '/club/training/library', async () => {
        await expect(card).toBeVisible()
      }),
    ).toEqual({})
    await page.emulateMedia({ colorScheme: 'light' })
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByTestId('training-library-card').filter({ hasNotText: 'wariant' }).first().click()
    await expect(page.getByTestId('training-library-title')).toHaveText(topic)
    await expect(page.getByTestId('training-library-credit')).toBeVisible()
    await expect(page.getByTestId('training-library-copy')).toBeVisible()
    await expect(page.getByTestId('training-library-star-5')).toBeEnabled()
    await expect(page.getByTestId('training-library-star-5')).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page.getByRole('heading', { name: uiText('training.outline.parts.main', { exact: true }) }),
    ).toBeVisible()
    expect(
      await scanInColorSchemes(page, testInfo, '/club/training/library/[entryId]', async () => {
        await expect(page.getByTestId('training-library-title')).toHaveText(topic)
      }),
    ).toEqual({})
    await page.emulateMedia({ colorScheme: 'light' })
    await expectNoPageOverflow(page)
    // Signing in ended the coach's API token: a fresh one still reads the entry.
    const fresh = await getAuthToken(request, familyB.coach.email, password)
    expect((await readEntry(request, fresh, entryX)).status).toBe(200)
  } finally {
    await clubB.cleanup()
    await clubA.cleanup()
  }
})
