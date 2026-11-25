import { expect, test } from '@playwright/test'
import { familyFor } from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import { expectNoPageOverflow, scanInColorSchemes } from '../_fixtures/axe'
import { publicGet } from '../_fixtures/publication'
import { ensureLibrary, ownOutline, publishOutline, setLibraryLevel, uniqueTopic } from '../_fixtures/library'

// Training outlines spec TEST-O11 (REQ-O13, AC-O11; P-O1, DD-O15; #685): without a session, an entry shared with the
// public opens on `/library/o/[entryId]` and through its public API (200); an entry shared with clubs only answers 404
// on both, like an id that exists nowhere. The page is `noindex` until the licence is confirmed (Q-O03) and carries the
// licence notice and "Report"; on the phone (375 px) the outline reads without app chrome.
test.describe.configure({ timeout: 300_000 })

test('TEST-O11 a public outline opens without signing in, a clubs-only one does not', async ({
  request,
  browser,
}, testInfo) => {
  ensureLibrary()
  const club = await createClub(request, 'test-o11')
  try {
    const family = await familyFor(request, club)
    await setLibraryLevel(request, club, 'public')
    const topic = uniqueTopic('Strona publiczna')
    const open = await ownOutline(request, family.coach.token, topic)
    const closed = await ownOutline(request, family.coach.token, `${topic} kluby`)
    const shared = await publishOutline(request, family.coach.token, open.id, {
      visibility: 'public',
      acceptTerms: true,
    })
    expect(shared.status, JSON.stringify(shared.body)).toBe(201)
    const clubsOnly = await publishOutline(request, family.coach.token, closed.id, { visibility: 'clubs' })
    expect(clubsOnly.status, JSON.stringify(clubsOnly.body)).toBe(201)
    const publicId = String(shared.body?.entryId)
    const clubsId = String(clubsOnly.body?.entryId)

    // The public API, without a session.
    const api = await publicGet(request, `/api/training/public/library/${publicId}`)
    expect(api.status).toBe(200)
    const body = JSON.parse(api.bytes.toString('utf8')) as { topic: string; mine: unknown; licence: string }
    expect(body.topic).toBe(topic)
    expect(body.mine).toBeNull()
    expect(body.licence).toBe('CC-BY-SA-4.0')
    expect((await publicGet(request, `/api/training/public/library/${clubsId}`)).status).toBe(404)
    expect((await publicGet(request, `/api/training/public/library/${crypto.randomUUID()}`)).status).toBe(404)

    // The page, server-rendered for a guest, noindex.
    const html = await publicGet(request, `/library/o/${publicId}`)
    expect(html.status).toBe(200)
    const text = html.bytes.toString('utf8')
    expect(text).toContain(topic)
    expect(text).toMatch(/<meta name="robots" content="noindex, ?nofollow"/)

    // On a phone, without a session: the outline, the licence notice and "Report"; a clubs-only entry is not found.
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    try {
      const page = await context.newPage()
      await page.goto(`/library/o/${publicId}`)
      await expect(page.getByTestId('training-public-title')).toHaveText(topic)
      await expect(page.getByTestId('training-library-licence')).toBeVisible()
      await expect(page.getByTestId('training-library-report-open')).toBeVisible()
      await expect(page.getByTestId('training-library-stars')).toHaveCount(0)
      expect(
        await scanInColorSchemes(page, testInfo, '/library/o/[entryId]', async () => {
          await expect(page.getByTestId('training-public-title')).toHaveText(topic)
        }),
      ).toEqual({})
      await page.emulateMedia({ colorScheme: 'light' })
      await expectNoPageOverflow(page)
      await page.goto(`/library/o/${clubsId}`)
      await expect(page.getByTestId('training-public-missing')).toBeVisible()
    } finally {
      await context.close()
    }
  } finally {
    await club.cleanup()
  }
})
