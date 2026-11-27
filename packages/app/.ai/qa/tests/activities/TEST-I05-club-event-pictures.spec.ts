import { expect, test } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { call } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { getMe, putMe } from '../_fixtures/members'
import {
  guardianImageConsent,
  markAndConfirm,
  phoneJpeg,
  pictureCommand,
  pictureId,
  pictureOf,
  picturePath,
  picturesOf,
  pictureScene,
  uploadPicture,
} from '../_fixtures/pictures'
import { png } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// Event photos spec phase 2 (#872; REQ-I01–REQ-I04, J-I02, AC-I03, AC-I04): TEST-I05 — the coordinator of the
// academy adds pictures to the public club event "PRZYKŁAD CUP 2026". A phone JPEG keeps its orientation but loses its
// GPS and comment, and its stored name is not the uploaded one; an 11 MB file, an SVG renamed `.png` and a one-letter
// description answer their 422 codes. A photo cannot be confirmed without marks, a graphic takes no marks, an
// unconfirmed picture cannot be published, and a stale lock token answers 409. Publish all publishes the confirmed
// drafts and skips the rest; the states read Public for the graphic, Waiting for consent (2) for the photo of the two
// wards until their guardian gives the image consent, then Public. The 31st picture answers 422. On the phone at 375 px
// (Polish and English, light and dark, axe) the Pictures block lists the pictures with their states; the coordinator
// marks the other family's child on a photo through "Who is in the photo?", confirms, publishes it, and sees the names
// behind "Waiting for consent (1)".
test.describe.configure({ timeout: 600_000 })

test('TEST-I05 a coordinator adds, marks, confirms and publishes pictures of a club event, with its limits', async ({
  page,
  request,
}, testInfo) => {
  const scene = await pictureScene(request, 'test-i05')
  const { club, family, eventId } = scene
  try {
    let coordinator = scene.coordinator

    // A phone photo: metadata removed, orientation kept, the uploaded name dropped; a draft.
    const uploaded = await uploadPicture(request, coordinator, eventId, {
      description: 'Finał Żaków',
      file: phoneJpeg(),
    })
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201)
    expect(uploaded.body?.state).toBe('draft')
    expect(JSON.stringify(uploaded.body)).not.toContain('attachment')
    const photo = String(uploaded.body?.id)
    const content = await request.fetch(picturePath(eventId, photo, '/content'), {
      headers: { Authorization: `Bearer ${coordinator}` },
    })
    expect(content.status()).toBe(200)
    expect(content.headers()['cache-control']).toBe('private, no-store')
    expect(content.headers()['x-content-type-options']).toBe('nosniff')
    const bytes = (await content.body()).toString('binary')
    expect(bytes).not.toContain('SECRET-PITCH')
    expect(bytes).not.toContain('SECRET-COMMENT')
    expect(bytes).not.toContain('GPS')
    expect(bytes).toContain('Exif')
    expect(bytes.endsWith('\xff\xd9')).toBe(true)
    expect((await pictureOf(request, coordinator, eventId, photo)).url).toBe(picturePath(eventId, photo, '/content'))
    const stored = (await picturesOf(request, coordinator, eventId))?.find((entry) => entry.id === photo) as
      | { fileName?: string }
      | undefined
    expect(stored?.fileName).not.toContain('Jas')

    // The upload refusals.
    const large = await uploadPicture(request, coordinator, eventId, {
      file: { name: 'big.png', mimeType: 'image/png', buffer: Buffer.concat([png([1, 2, 3]).buffer, Buffer.alloc(11 * 1024 * 1024)]) },
    })
    expect(large.status, JSON.stringify(large.body)).toBe(422)
    expect(large.body?.code).toBe('club_event_file_too_large')
    const svg = await uploadPicture(request, coordinator, eventId, {
      file: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
    })
    expect(svg.status, JSON.stringify(svg.body)).toBe(422)
    expect(svg.body?.code).toBe('club_event_file_format_unsupported')
    const short = await uploadPicture(request, coordinator, eventId, { description: 'x' })
    expect(short.status, JSON.stringify(short.body)).toBe(422)
    expect(short.body?.code).toBe('club_event_picture_description_invalid')

    // Marks and confirmations.
    const graphic = await pictureId(request, coordinator, eventId, { kind: 'graphic', description: 'Tablica wyników' })
    const third = await pictureId(request, coordinator, eventId, { description: 'Rozgrzewka' })
    const unmarked = await pictureCommand(request, coordinator, eventId, photo, 'people', { personIds: [], confirmed: true })
    expect(unmarked.status, JSON.stringify(unmarked.body)).toBe(422)
    expect(unmarked.body?.code).toBe('club_event_photo_unmarked')
    const graphicPeople = await pictureCommand(request, coordinator, eventId, graphic, 'people', {
      personIds: [family.younger.personId],
      confirmed: true,
    })
    expect(graphicPeople.status, JSON.stringify(graphicPeople.body)).toBe(422)
    expect(graphicPeople.body?.code).toBe('club_event_graphic_has_no_people')
    const unconfirmed = await pictureCommand(request, coordinator, eventId, third, 'publish')
    expect(unconfirmed.status, JSON.stringify(unconfirmed.body)).toBe(422)
    expect(unconfirmed.body?.code).toBe('club_event_people_unconfirmed')
    const stale = (await pictureOf(request, coordinator, eventId, photo)).updatedAt
    const marked = await markAndConfirm(request, coordinator, eventId, photo, [
      family.younger.personId,
      family.elder.personId,
    ])
    expect(marked.marks.map((mark) => mark.id).sort()).toEqual([family.younger.personId, family.elder.personId].sort())
    const conflict = await pictureCommand(
      request,
      coordinator,
      eventId,
      photo,
      'update',
      { description: 'Stara wersja' },
      stale,
    )
    expect(conflict.status, JSON.stringify(conflict.body)).toBe(409)
    const graphicConfirmed = await pictureCommand(request, coordinator, eventId, graphic, 'people', {
      personIds: [],
      confirmed: true,
    })
    expect(graphicConfirmed.status, JSON.stringify(graphicConfirmed.body)).toBe(200)

    // Publish all: the photo and the graphic; the unconfirmed third picture is skipped.
    const all = await call<{ publishedIds?: string[]; skippedIds?: string[] }>(
      request,
      'POST',
      picturePath(eventId, undefined, '/publish-all'),
      coordinator,
      { data: {} },
    )
    expect(all.status, JSON.stringify(all.body)).toBe(200)
    expect([...(all.body?.publishedIds ?? [])].sort()).toEqual([photo, graphic].sort())
    expect(all.body?.skippedIds).toEqual([third])
    const states = async () =>
      Object.fromEntries(((await picturesOf(request, coordinator, eventId)) ?? []).map((entry) => [entry.id, entry]))
    let now = await states()
    expect(now[graphic]?.state).toBe('public')
    expect(now[photo]?.state).toBe('waiting_for_consent')
    expect(now[photo]?.missingConsentCount).toBe(2)
    expect(now[third]?.state).toBe('draft')

    // The guardian gives the image consent for both wards: the photo becomes public without republishing.
    await guardianImageConsent(request, family.guardian.token, family.younger.personId, true)
    await guardianImageConsent(request, family.guardian.token, family.elder.personId, true)
    now = await states()
    expect(now[photo]?.state).toBe('public')

    // Changing the marks clears the confirmation; the published photo waits for it again.
    const unconfirm = await pictureCommand(request, coordinator, eventId, photo, 'people', {
      personIds: [family.younger.personId],
      confirmed: false,
    })
    expect(unconfirm.status, JSON.stringify(unconfirm.body)).toBe(200)
    expect(unconfirm.body?.picture?.state).toBe('unconfirmed')
    await markAndConfirm(request, coordinator, eventId, photo, [family.younger.personId, family.elder.personId])

    // The limit: 30 live pictures per event.
    const count = (await picturesOf(request, coordinator, eventId))?.length ?? 0
    for (let index = count; index < 30; index += 1) await pictureId(request, coordinator, eventId)
    const over = await uploadPicture(request, coordinator, eventId)
    expect(over.status, JSON.stringify(over.body)).toBe(422)
    expect(over.body?.code).toBe('club_event_pictures_limit')
    for (const extra of ((await picturesOf(request, coordinator, eventId)) ?? []).filter(
      (entry) => ![photo, graphic, third].includes(entry.id),
    )) {
      const removed = await call(request, 'DELETE', picturePath(eventId, extra.id), coordinator, {
        headers: { 'x-om-ext-optimistic-lock-expected-updated-at': extra.updatedAt },
      })
      expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    }

    // The phone: the Pictures block at 375 px in both locales and both colour schemes.
    const password = await signInBrowser(
      page,
      request,
      club,
      family.academyCoordinator.userId,
      family.academyCoordinator.email,
    )
    coordinator = await getAuthToken(request, family.academyCoordinator.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    const block = page.getByTestId('club-event-member-pictures')
    for (const locale of ['pl', 'en'] as const) {
      const me = await getMe(request, coordinator)
      const saved = await putMe(request, coordinator, { preferredLocale: locale }, me.body?.person.updatedAt)
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      await page.goto(`/club/club-events/${eventId}`)
      await expect(block).toBeVisible()
      await expect(block.getByTestId('club-event-member-picture')).toHaveCount(3)
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `/club/club-events pictures (${locale})`, async () => {
          await expect(block).toBeVisible()
        }),
      )
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    const rowOf = (id: string) => block.locator(`[data-picture-id="${id}"]`)
    await expect(rowOf(graphic).getByTestId('club-event-picture-state')).toContainText(
      uiText('activities.clubEvents.pictures.state.public'),
    )

    // "Who is in the photo?" on the third picture: the other family's child, found by name, confirmed and published.
    await rowOf(third).getByRole('button', { name: uiText('ui.rowActions.openActions') }).click()
    await page
      .getByRole('menuitem', { name: uiText('activities.clubEvents.pictures.actions.people', { exact: true }) })
      .click()
    const dialog = page.getByTestId('club-event-picture-people-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('club-event-picture-people-search').fill(family.other.child.lastName.slice(0, 5))
    const option = dialog.getByTestId('club-event-picture-people-options').locator('label', {
      hasText: family.other.child.firstName,
    })
    await option.getByRole('checkbox').check()
    await dialog.getByTestId('club-event-picture-people-confirm').check()
    await dialog.getByTestId('club-event-picture-people-save').click()
    await expect(dialog).toBeHidden()
    await rowOf(third).getByRole('button', { name: uiText('ui.rowActions.openActions') }).click()
    await page
      .getByRole('menuitem', { name: uiText('activities.clubEvents.pictures.actions.publish', { exact: true }) })
      .click()
    const waiting = rowOf(third).getByTestId('club-event-picture-missing')
    await expect(waiting).toContainText(
      uiText('activities.clubEvents.pictures.state.waiting_for_consent', { params: { count: '1' } }),
    )
    await waiting.click()
    const missing = page.getByTestId('club-event-picture-missing-dialog')
    await expect(missing.getByTestId('club-event-picture-missing-list')).toContainText(family.other.child.firstName)
    await page.keyboard.press('Escape')
    await expect(missing).toBeHidden()
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
