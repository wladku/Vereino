import { expect, test } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { call } from '../_fixtures/club'
import {
  guardianImageConsent,
  markAndConfirm,
  pictureCommand,
  pictureId,
  picturePath,
  picturesOf,
  pictureScene,
  type PublicPicture,
} from '../_fixtures/pictures'
import { publicGet } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// Event photos spec phase 2 (#872; REQ-I04, REQ-I05, REQ-I12, BR-I01, DD-I11, DD-I12, AC-I05): TEST-I06 — the public
// club event page of "PRZYKŁAD CUP 2026" with four pictures: a published photo of a ward whose guardian gave the image
// consent, a published photo of a child without consent, a published graphic and an unpublished photo. The JSON lists
// exactly the consented photo and the graphic, with their descriptions; their files answer 200 `private, no-store`
// with `nosniff`, the other two 404 like an unknown file, and club B's slug never reaches club A's picture. The pool
// coordinator, who reads the event club-wide but does not manage it, gets no `pictures` and 404 on the content route.
// No other public page shows pictures (P-06 lists the event without them). In the browser at 375 px the gallery shows
// two tiles; the viewer opens on Enter, moves with the arrow keys, and Escape returns focus to the tile (pl and en,
// light and dark, axe). TEST-I09 (public part): club B's slug with club A's picture id answers 404.
test.describe.configure({ timeout: 480_000 })

test('TEST-I06 the public event page shows only the pictures BR-I01 allows; the others answer 404', async ({
  page,
  request,
}, testInfo) => {
  const scene = await pictureScene(request, 'test-i06')
  const other = await pictureScene(request, 'test-i06-b')
  const { club, family, eventId, coordinator } = scene
  try {
    const consented = await pictureId(request, coordinator, eventId, { description: 'Finał Żaków' })
    await markAndConfirm(request, coordinator, eventId, consented, [family.younger.personId])
    const withoutConsent = await pictureId(request, coordinator, eventId, { description: 'Dekoracja' })
    await markAndConfirm(request, coordinator, eventId, withoutConsent, [family.other.child.personId])
    const graphic = await pictureId(request, coordinator, eventId, { kind: 'graphic', description: 'Tablica wyników' })
    const graphicConfirmed = await pictureCommand(request, coordinator, eventId, graphic, 'people', {
      personIds: [],
      confirmed: true,
    })
    expect(graphicConfirmed.status, JSON.stringify(graphicConfirmed.body)).toBe(200)
    const unpublished = await pictureId(request, coordinator, eventId, { description: 'Szatnia' })
    await markAndConfirm(request, coordinator, eventId, unpublished, [family.younger.personId])
    for (const id of [consented, withoutConsent, graphic]) {
      const published = await pictureCommand(request, coordinator, eventId, id, 'publish')
      expect(published.status, JSON.stringify(published.body)).toBe(200)
    }
    await guardianImageConsent(request, family.guardian.token, family.younger.personId, true)

    // The JSON: the consented photo and the graphic, in their order, with their descriptions only.
    const pageJson = await publicGet(request, scene.publicPath)
    expect(pageJson.status, JSON.stringify(pageJson.body)).toBe(200)
    const pictures = (pageJson.body?.event as { pictures: PublicPicture[] }).pictures
    expect(pictures.map((picture) => picture.id)).toEqual([consented, graphic])
    expect(pictures.map((picture) => picture.description)).toEqual(['Finał Żaków', 'Tablica wyników'])
    expect(JSON.stringify(pageJson.body)).not.toContain(family.younger.lastName)
    expect(JSON.stringify(pageJson.body)).not.toContain(family.younger.personId)

    // The files: 200 `private, no-store` for the shown ones, 404 for the others.
    for (const picture of pictures) {
      const file = await publicGet(request, picture.url)
      expect(file.status, picture.url).toBe(200)
      expect(file.headers['cache-control']).toBe('private, no-store')
      expect(file.headers['x-content-type-options']).toBe('nosniff')
    }
    const fileUrl = (id: string) => `${scene.publicPath}/files/${id}`
    for (const id of [withoutConsent, unpublished]) expect((await publicGet(request, fileUrl(id))).status).toBe(404)
    // TEST-I09 (public part): club B's slug never streams club A's picture.
    expect((await publicGet(request, `${other.publicPath}/files/${consented}`)).status).toBe(404)
    expect(
      (await publicGet(request, `/api/club_core/public/${other.clubSlug}/events/${scene.eventSlug}/files/${consented}`))
        .status,
    ).toBe(404)

    // A coordinator who reads the event but does not manage it: no pictures, and the content route answers 404.
    const pool = family.poolCoordinator.token
    expect(await picturesOf(request, pool, eventId)).toBeUndefined()
    const content = await request.fetch(picturePath(eventId, consented, '/content'), {
      headers: { Authorization: `Bearer ${pool}` },
    })
    expect(content.status()).toBe(404)
    const options = await call(request, 'GET', `/api/activities/club-events/${eventId}/people-options`, pool)
    expect(options.status).toBe(404)

    // P-06 lists the event without any picture (REQ-I12).
    const events = await publicGet(request, `/api/club_core/public/${scene.clubSlug}/events`)
    expect(events.status, JSON.stringify(events.body)).toBe(200)
    expect(JSON.stringify(events.body)).not.toContain(consented)

    // The gallery on P-T1 at 375 px.
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    const gallery = page.getByTestId('club-event-gallery')
    for (const locale of ['pl', 'en'] as const) {
      await page
        .context()
        .addCookies([{ name: 'locale', value: locale, url: process.env.BASE_URL || 'http://localhost:3000' }])
      await page.goto(`/p/${scene.clubSlug}/events/${scene.eventSlug}`)
      await expect(gallery).toBeVisible()
      await expect(gallery.getByTestId('club-event-gallery-item')).toHaveCount(2)
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `P-T1 gallery (${locale})`, async () => {
          await expect(gallery).toBeVisible()
        }),
      )
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    const first = gallery.getByTestId('club-event-gallery-item').first()
    await first.focus()
    await page.keyboard.press('Enter')
    const viewer = page.getByTestId('club-event-gallery-viewer')
    await expect(viewer).toBeVisible()
    await expect(viewer.getByRole('img', { name: 'Finał Żaków' })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(viewer.getByRole('img', { name: 'Tablica wyników' })).toBeVisible()
    await expect(viewer.getByTestId('club-event-gallery-next')).toBeDisabled()
    await page.keyboard.press('ArrowLeft')
    await expect(viewer.getByRole('img', { name: 'Finał Żaków' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
    await expect(first).toBeFocused()
    await expect(first).toHaveAccessibleName(
      uiText('club_core.public.event.gallery.open', { params: { description: 'Finał Żaków' } }),
    )
    expect(violations).toEqual({})
  } finally {
    await other.club.cleanup()
    await club.cleanup()
  }
})
