import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, createActivity } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, sessionsOf } from '../_fixtures/attendance'
import { call, calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { png } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// Training outlines spec TEST-O05 (REQ-O06, REQ-O08, AC-O06, M-O5, M-O6; E24-S03, #683): on a 375 px phone the coach
// of Żaki writes an outline with the three parts (warm-up, main, cool-down) and an image on the main exercise, copies
// it into Tuesday's training from the session page ("From my outlines") and reads it there while running the session,
// in Polish and in English. A save with a stale version answers 409; another coach (of the pool group) reaches neither
// the outline nor the session's copy.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type Created = { id?: string; updatedAt?: string }
type Listed = { items?: { id: string; updatedAt: string | null; sourceOutlineId: string | null }[] }

test('TEST-O05 a coach writes an outline on the phone, attaches it to a session and reads it there; a stale save is 409', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-o05')
  try {
    const family = await familyFor(request, club)
    const today = calendarDate()
    const activity = await createActivity(request, club.adminToken, {
      groupId: family.zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: family.pitch,
      coachPersonId: family.coach.personId,
      startsOn: addDays(today, 4),
      startTime: '17:00',
      endTime: '18:30',
    })
    const session = (await sessionsOf(request, club, activity.id)).at(0)
    if (!session) throw new Error('[test] the training has no session')

    // --- The coach writes the outline on the phone ---
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 375, height: 812 })
    const password = await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    const coachToken = await getAuthToken(request, family.coach.email, password)
    await page.goto('/club/training/outlines')
    await expect(page.getByTestId('training-outlines-empty')).toBeVisible()
    await page.getByTestId('training-outline-new').click()
    await expect(page).toHaveURL(/\/club\/training\/outlines\/new$/)
    await page.getByTestId('training-outline-topic').fill('Gra 1×1 w obronie')
    await page.getByTestId('training-outline-goal').fill('Odbiór piłki w pojedynku')
    await page.getByTestId('training-outline-age').fill('U11')
    await page.getByTestId('training-outline-duration').fill('75')
    await page.getByTestId('training-outline-players').fill('12')
    await page.getByTestId('training-outline-equipment').fill('Pachołki, 6 piłek')
    const parts: Array<[string, string, string]> = [
      ['warm_up', 'Rondo 4×1', '15'],
      ['main', 'Gra 1×1 na małe bramki', '40'],
      ['cool_down', 'Rozciąganie', '10'],
    ]
    for (const [part, name, minutes] of parts) {
      await page.getByTestId(`training-add-exercise-${part}`).click()
      const editor = page.getByTestId(`training-part-${part}`).getByTestId('training-exercise-editor').last()
      await editor.getByTestId('training-exercise-name').fill(name)
      await editor.getByTestId('training-exercise-minutes').fill(minutes)
    }
    await expect(page.getByTestId('training-outline-total')).toContainText('65')
    await page.getByTestId('training-outline-save').click()
    await expect(page).toHaveURL(/\/club\/training\/outlines\/[0-9a-f-]{36}$/)
    const outlineId = page.url().split('/').at(-1) as string
    await expect(page.getByTestId('training-outline-title')).toHaveText('Gra 1×1 w obronie')

    // An image on the main exercise (upload only, REQ-O06).
    const mainExercise = page.getByTestId('training-part-main').getByTestId('training-exercise-editor').first()
    const image = png([20, 120, 60], 16)
    await mainExercise.getByTestId('training-exercise-image-input').setInputFiles({
      name: 'cwiczenie.png',
      mimeType: image.mimeType,
      buffer: image.buffer,
    })
    await expect(page.getByTestId('training-part-main').getByTestId('training-exercise-image')).toBeVisible()
    const read = await call<{ parts: { main: { image: { attachmentId: string } | null }[] } }>(
      request,
      'GET',
      `/api/training/outlines/${outlineId}`,
      coachToken,
    )
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    const attachmentId = read.body?.parts.main[0]?.image?.attachmentId
    expect(attachmentId).toBeTruthy()
    const imageResponse = await request.get(`/api/training/outlines/${outlineId}/images/${String(attachmentId)}`, {
      headers: { authorization: `Bearer ${coachToken}` },
    })
    expect(imageResponse.status()).toBe(200)
    expect(imageResponse.headers()['content-type']).toBe('image/png')

    // --- The session page: no outline yet → "From my outlines" copies it into the session ---
    await page.goto(`/club/occurrences/${session.id}?as=coach`)
    const widget = page.getByTestId('training-session-outline')
    await expect(widget.getByTestId('training-widget-none')).toBeVisible()
    await widget.getByTestId('training-widget-from-own').click()
    await widget.getByTestId('training-widget-own-select').selectOption(outlineId)
    await widget.getByTestId('training-widget-attach').click()
    await expect(widget.getByTestId('training-widget-topic')).toHaveText('Gra 1×1 w obronie')
    await expect(widget.getByTestId('training-outline-exercise')).toHaveCount(3)
    await expect(widget.getByText('Gra 1×1 na małe bramki')).toBeVisible()
    await expect(widget.getByTestId('training-outline-image')).toBeVisible()
    await expect(widget.getByText(uiText('training.outline.parts.warm_up', { exact: true }))).toBeVisible()
    await expect(widget.getByTestId('training-widget-pdf')).toBeVisible()
    // The session holds its own copy; the coach's outline stays theirs, reusable.
    const copies = await call<Listed>(request, 'GET', `/api/training/outlines?occurrenceId=${session.id}`, coachToken)
    expect(copies.status).toBe(200)
    expect(copies.body?.items?.length).toBe(1)
    const copy = copies.body?.items?.[0]
    expect(copy?.sourceOutlineId).toBe(outlineId)
    expect(copy?.id).not.toBe(outlineId)
    const mine = await call<Listed>(request, 'GET', '/api/training/outlines?view=mine', coachToken)
    expect(mine.body?.items?.map((item) => item.id)).toEqual([outlineId])
    // A second outline for the same session answers 409 `outline_exists` (BR-O2).
    const second = await call(request, 'POST', `/api/training/outlines/${outlineId}/attach`, coachToken, {
      data: { occurrenceId: session.id },
    })
    expect(second.status, JSON.stringify(second.body)).toBe(409)
    expect(second.body?.code).toBe('outline_exists')

    // --- Both languages, light and dark (AC-O06, D-029): the session card (M-O6) and the outline editor (M-O5) pass
    // axe and do not overflow a 320 px phone ---
    await prepareForAccessibilityScan(page)
    const sessionReady = async () => {
      await expect(widget.getByTestId('training-widget-topic')).toHaveText('Gra 1×1 w obronie')
      await expect(widget.getByText(uiText('training.outline.parts.main', { exact: true }))).toBeVisible()
      await expect(widget.getByTestId('training-outline-image')).toBeVisible()
    }
    const editorReady = async () => {
      await expect(page.getByTestId('training-outline-topic')).toHaveValue('Gra 1×1 w obronie')
      await expect(page.getByTestId('training-part-main').getByTestId('training-exercise-image')).toBeVisible()
    }
    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: new URL(page.url()).origin }])
      await page.goto(`/club/occurrences/${session.id}?as=coach`)
      expect(
        await scanInColorSchemes(page, testInfo, `/club/occurrences/[id] outline (${locale})`, sessionReady),
      ).toEqual({})
      await page.emulateMedia({ colorScheme: 'light' })
      await expectNoPageOverflow(page)
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(`/club/training/outlines/${outlineId}`)
      expect(await scanInColorSchemes(page, testInfo, `/club/training/outlines/[id] (${locale})`, editorReady)).toEqual(
        {},
      )
      await page.emulateMedia({ colorScheme: 'light' })
      await expectNoPageOverflow(page)
      await page.setViewportSize({ width: 375, height: 812 })
    }

    // --- A stale save answers 409; the editor shows the conflict instead of overwriting ---
    const copyVersion = String(copy?.updatedAt)
    const fresh = await call<Created>(request, 'PUT', '/api/training/outlines', coachToken, {
      data: { id: copy?.id, topic: 'Gra 1×1 — wersja na wtorek' },
      headers: { 'x-om-ext-optimistic-lock-expected-updated-at': copyVersion },
    })
    expect(fresh.status, JSON.stringify(fresh.body)).toBe(200)
    const stale = await call(request, 'PUT', '/api/training/outlines', coachToken, {
      data: { id: copy?.id, topic: 'Nadpisanie' },
      headers: { 'x-om-ext-optimistic-lock-expected-updated-at': copyVersion },
    })
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    // The editor of the coach's own outline, open while someone else saves it, gets the conflict on save.
    await page.goto(`/club/training/outlines/${outlineId}`)
    await expect(page.getByTestId('training-outline-topic')).toHaveValue('Gra 1×1 w obronie')
    const current = await call<{ updatedAt: string }>(request, 'GET', `/api/training/outlines/${outlineId}`, coachToken)
    const meanwhile = await call(request, 'PUT', '/api/training/outlines', coachToken, {
      data: { id: outlineId, goal: 'Zmienione w innym oknie' },
      headers: { 'x-om-ext-optimistic-lock-expected-updated-at': String(current.body?.updatedAt) },
    })
    expect(meanwhile.status, JSON.stringify(meanwhile.body)).toBe(200)
    await page.getByTestId('training-outline-topic').fill('Gra 1×1 — moja zmiana')
    const [conflict] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes('/api/training/outlines') && response.request().method() === 'PUT',
      ),
      page.getByTestId('training-outline-save').click(),
    ])
    expect(conflict.status()).toBe(409)

    // --- Another coach (the pool group's) reaches neither the outline nor the session's copy ---
    const other = family.instructor.token
    expect((await call(request, 'GET', `/api/training/outlines/${outlineId}`, other)).status).toBe(403)
    expect((await call(request, 'GET', `/api/training/outlines/${String(copy?.id)}`, other)).status).toBe(403)
    const otherList = await call<Listed>(request, 'GET', '/api/training/outlines', other)
    expect(otherList.body?.items ?? []).toEqual([])
    const otherCopy = await call(request, 'POST', '/api/training/outlines/ensure-copy', other, {
      data: { occurrenceId: session.id },
    })
    expect(otherCopy.status).toBe(403)
  } finally {
    await club.cleanup()
  }
})
