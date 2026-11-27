import { expect, test, type Page } from '@playwright/test'
import { addDays, getOccurrence, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import { cancelClubEvent, clubEventId, examplePlaces, partIds, readClubEvent } from '../_fixtures/club-events'
import { create as createStructure } from '../_fixtures/club-structure'
import { createGroup } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'
import { signInBrowserContext } from '../_fixtures/auth'

// Club events spec AC-T11, the parts TEST-T11 leaves out (REQ-T11; #607): B-T1 lists the club events by view, a part is
// edited in the panel and an undeclared part is removed. The administrator has an upcoming "PRZYKŁAD CUP 2026" (two
// group parts next weekend), a past "Turniej Jesienny" (an open part yesterday) and a cancelled "Dzień klubu". Upcoming
// lists only the first; Past and Cancelled each list only theirs, switched as tabs under `?view=` without a page reload.
// On the record, Edit renames the Orlik part and sets its category (PUT 200, the row and the record show both); Remove
// of the Żak part nobody declared for is confirmed, answers 200 and the row, the part and its session are gone.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const UPCOMING = 'PRZYKŁAD CUP 2026'
const PAST = 'Turniej Jesienny 2026'
const CANCELLED = 'Dzień klubu'
const OPEN_ACTIONS = uiText('ui.rowActions.openActions')

/** Opens the row menu of the part titled `title` and chooses `action`. */
async function partAction(page: Page, title: string, action: string | RegExp): Promise<void> {
  const row = page.getByRole('row').filter({ hasText: title })
  await row.getByRole('button', { name: OPEN_ACTIONS }).click()
  await page.getByRole('menuitem', { name: action }).click()
}

/** Switches the B-T1 view by its tab and asserts the listed club events. */
async function expectView(page: Page, view: 'upcoming' | 'past' | 'cancelled', shown: string, hidden: string[]) {
  await page.getByRole('tab', { name: uiText(`activities.clubEvents.views.${view}`, { exact: true }) }).click()
  await expect(page).toHaveURL(new RegExp(`[?&]view=${view}`))
  await expect(page.getByRole('tab', { selected: true })).toHaveText(
    uiText(`activities.clubEvents.views.${view}`, { exact: true }),
  )
  await expect(page.getByRole('link', { name: shown })).toBeVisible()
  for (const name of hidden) await expect(page.getByRole('link', { name })).toHaveCount(0)
}

test('ISSUE-607 the administrator switches the club event views, edits a part and removes an undeclared part', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'issue-607')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const orlik = await createGroup(request, admin, { sectionId: academy, name: 'Orlik młodszy', kind: 'team' })
    const zak = await createGroup(request, admin, { sectionId: academy, name: 'Żak młodszy', kind: 'team' })
    const { hall, salka } = await examplePlaces(request, club)
    const sat = nextWeekday(addDays(calendarDate(), 7), 'SA')
    const sun = addDays(sat, 1)
    const yesterday = addDays(calendarDate(), -1)

    const upcomingId = await clubEventId(request, admin, { name: UPCOMING, sectionId: academy, placeId: hall })
    await partIds(request, admin, upcomingId, {
      title: 'Turniej Orlika',
      groupId: orlik,
      startsAt: zoneInstant(sat, '09:00'),
      endsAt: zoneInstant(sat, '14:00'),
    })
    const zakPart = await partIds(request, admin, upcomingId, {
      title: 'Turniej Żaka Młodszego',
      groupId: zak,
      startsAt: zoneInstant(sun, '09:00'),
      endsAt: zoneInstant(sun, '14:00'),
    })
    expect(zakPart.occurrenceId).toBeTruthy()
    const pastId = await clubEventId(request, admin, { name: PAST, sectionId: academy, placeId: hall })
    await partIds(request, admin, pastId, {
      title: 'Turniej Drużyn – Seniorzy (16+)',
      groupId: null,
      startsAt: zoneInstant(yesterday, '09:00'),
      endsAt: zoneInstant(yesterday, '14:00'),
    })
    const cancelledId = await clubEventId(request, admin, { name: CANCELLED, sectionId: null, placeId: salka })
    const toCancel = await readClubEvent(request, admin, cancelledId)
    const cancelled = await cancelClubEvent(request, admin, cancelledId, 'Brak sali', toCancel.body?.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)

    page.setDefaultTimeout(30_000)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await signInBrowserContext(page.request, club.tenant.email, club.tenant.password)
    expect((await page.request.post('/api/auth/locale', { data: { locale: 'en' } })).ok()).toBe(true)
    await page.setViewportSize({ width: 1280, height: 900 })

    // --- B-T1: Upcoming by default, then Past and Cancelled as tabs under `?view=`, without a reload ---
    await page.goto('/backend/activities/club-events')
    await expect(page.getByRole('tab', { selected: true })).toHaveText(
      uiText('activities.clubEvents.views.upcoming', { exact: true }),
    )
    await expect(page.getByRole('link', { name: UPCOMING })).toBeVisible()
    await expect(page.getByRole('link', { name: PAST })).toHaveCount(0)
    await expect(page.getByRole('link', { name: CANCELLED })).toHaveCount(0)
    await page.evaluate(() => {
      ;(window as unknown as { __issue607?: boolean }).__issue607 = true
    })
    await expectView(page, 'past', PAST, [UPCOMING, CANCELLED])
    await expectView(page, 'cancelled', CANCELLED, [UPCOMING, PAST])
    await expect(page.getByRole('row').filter({ hasText: CANCELLED })).toContainText(
      uiText('activities.clubEvents.status.cancelled'),
    )
    await expectView(page, 'upcoming', UPCOMING, [PAST, CANCELLED])
    expect(await page.evaluate(() => (window as unknown as { __issue607?: boolean }).__issue607)).toBe(true)
    // A view in the address opens that view.
    await page.goto('/backend/activities/club-events?view=past')
    await expect(page.getByRole('tab', { selected: true })).toHaveText(
      uiText('activities.clubEvents.views.past', { exact: true }),
    )
    await expect(page.getByRole('link', { name: PAST })).toBeVisible()
    await expect(page.getByRole('link', { name: UPCOMING })).toHaveCount(0)

    // --- B-T3: Edit renames the Orlik part and sets its category ---
    await page.goto('/backend/activities/club-events?view=upcoming')
    await page.getByRole('link', { name: UPCOMING }).click()
    await expect(page).toHaveURL(new RegExp(`/backend/activities/club-events/${upcomingId}`))
    await expect(page.getByTestId('club-event-part-day')).toHaveCount(2)
    await partAction(page, 'Turniej Orlika', uiText('activities.clubEvents.part.actions.edit', { exact: true }))
    const partDialog = page.getByTestId('club-event-part-dialog')
    await expect(partDialog).toBeVisible()
    await expect(partDialog).toContainText(uiText('activities.clubEvents.part.editTitle'))
    const title = partDialog.locator('[data-crud-field-id="title"] input')
    await expect(title).toHaveValue('Turniej Orlika')
    await title.fill('Turniej Orlika Młodszego')
    await partDialog.locator('[data-crud-field-id="categoryLabel"] input').fill('Orlik młodszy U9')
    const saved = page.waitForResponse(
      (response) =>
        new RegExp(`/api/activities/club-events/${upcomingId}/parts/[0-9a-f-]+$`).test(response.url()) &&
        response.request().method() === 'PUT',
    )
    await partDialog.getByRole('button', { name: uiText('activities.common.save', { exact: true }) }).click()
    const savedResponse = await saved
    expect(savedResponse.status(), await savedResponse.text()).toBe(200)
    await expect(partDialog).toBeHidden()
    const editedRow = page.getByRole('row').filter({ hasText: 'Turniej Orlika Młodszego' })
    await expect(editedRow).toContainText('Orlik młodszy U9')
    await expect(editedRow).toContainText('09:00–14:00')
    const afterEdit = await readClubEvent(request, admin, upcomingId)
    expect(afterEdit.body?.parts.map((part) => part.title).sort()).toEqual([
      'Turniej Orlika Młodszego',
      'Turniej Żaka Młodszego',
    ])

    // --- B-T3: Remove of the Żak part nobody declared for removes the part and its session ---
    await partAction(
      page,
      'Turniej Żaka Młodszego',
      uiText('activities.clubEvents.part.actions.remove', { exact: true }),
    )
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toContainText(
      uiText('activities.clubEvents.part.remove.title', { params: { title: 'Turniej Żaka Młodszego' } }),
    )
    const removed = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/activities/club-events/${upcomingId}/parts/${zakPart.id}`) &&
        response.request().method() === 'DELETE',
    )
    await confirm
      .getByRole('button', { name: uiText('activities.clubEvents.part.actions.remove', { exact: true }) })
      .click()
    const removedResponse = await removed
    expect(removedResponse.status(), await removedResponse.text()).toBe(200)
    await expect(page.getByText(uiText('activities.clubEvents.part.flash.removed'))).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Turniej Żaka Młodszego' })).toHaveCount(0)
    await expect(page.getByTestId('club-event-part-day')).toHaveCount(1)
    await expect(page.getByRole('row').filter({ hasText: 'Turniej Orlika Młodszego' })).toBeVisible()
    const afterRemove = await readClubEvent(request, admin, upcomingId)
    expect(afterRemove.body?.parts.map((part) => part.title)).toEqual(['Turniej Orlika Młodszego'])
    expect(afterRemove.body?.partsCount).toBe(1)
    const session = await getOccurrence(request, admin, String(zakPart.occurrenceId))
    expect(session.status, JSON.stringify(session.body)).toBe(404)

    expect(consoleErrors.filter((text) => !/Failed to load resource/.test(text))).toEqual([])
  } finally {
    await club.cleanup()
  }
})
