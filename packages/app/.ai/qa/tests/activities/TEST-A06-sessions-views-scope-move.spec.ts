import { expect, test, type APIRequestContext } from '@playwright/test'
import { addDays, createEvent, getOccurrence, listOccurrences, scheduleFor, zoneInstant } from '../_fixtures/activities'
import { calendarDate, createClub, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { postClosure } from '../_fixtures/facilities'
import { signedInStaff } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// TEST-A06 (#268; groups and activities parity spec REQ-A05, AC-A05, DD-A11; README B-15): the sessions list reads
// `?view=` and keeps `?perspective=` as its alias; "Needs a new time" lists the flagged sessions; `?activity=` scopes
// the list under "Sessions of {activity}"; a move from the row into a collision shows the 409 list in the dialog and a
// move into a free slot clears the flag; the cancel dialog names the session and the toast the number of people told.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

async function session(
  request: APIRequestContext,
  club: Club,
  input: { groupId: string; placeId: string; name: string; date: string; start: string; end: string },
): Promise<{ id: string; activityId: string }> {
  const created = await createEvent(request, club.adminToken, {
    groupId: input.groupId,
    type: 'other',
    name: input.name,
    placeId: input.placeId,
    startsAt: zoneInstant(input.date, input.start),
    endsAt: zoneInstant(input.date, input.end),
  })
  expect(created.status, `POST /api/activities/events ${JSON.stringify(created.body)}`).toBe(201)
  return { id: String(created.body?.occurrenceId), activityId: String(created.body?.id) }
}

test('TEST-A06 the sessions list views under ?view= with the ?perspective= alias, the activity scope, a move from the row and a named cancellation', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-a06-sessions')
  try {
    const { academy, pitch, zaki, orliki } = await scheduleFor(request, club)
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Ewa',
      lastName: 'Nowak',
      role: 'coordinator',
      sectionId: academy,
    })
    const today = calendarDate()
    const closed = addDays(today, 3)
    const busy = addDays(today, 4)
    const flagged = await session(request, club, {
      groupId: zaki,
      placeId: pitch,
      name: 'Trening do przełożenia',
      date: closed,
      start: '17:00',
      end: '18:00',
    })
    await session(request, club, {
      groupId: orliki,
      placeId: pitch,
      name: 'Trening Orlików',
      date: busy,
      start: '17:00',
      end: '18:00',
    })
    const other = await session(request, club, {
      groupId: zaki,
      placeId: pitch,
      name: 'Trening drugi',
      date: busy,
      start: '19:00',
      end: '20:00',
    })
    const toCancel = await session(request, club, {
      groupId: orliki,
      placeId: pitch,
      name: 'Trening do odwołania',
      date: addDays(today, 5),
      start: '17:00',
      end: '18:00',
    })
    // The pitch closes for the evening: the Żaki session needs a new time (facilities parity spec).
    const closure = await postClosure(request, club.adminToken, {
      placeId: pitch,
      startsAt: zoneInstant(closed, '16:00'),
      endsAt: zoneInstant(closed, '20:00'),
      reason: 'municipal_event',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    const flaggedList = await listOccurrences(request, club.adminToken, '&status=planned&needsReschedule=true')
    expect(flaggedList.items.map((item) => item.id)).toEqual([flagged.id])

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    await page.setViewportSize({ width: 1280, height: 900 })

    // ?view= and the alias ?perspective= open the same view.
    for (const query of ['view=unassigned', 'perspective=unassigned']) {
      await page.goto(`/backend/activities/occurrences?${query}`)
      await expect(
        page.getByRole('tab', { name: uiText('activities.occurrences.perspectives.unassigned', { exact: true }) }),
      ).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('row').filter({ hasText: 'Trening Orlików' })).toBeVisible()
    }

    // "Needs a new time" lists the flagged session only.
    await page.goto('/backend/activities/occurrences?view=reschedule')
    await expect(
      page.getByRole('tab', { name: uiText('activities.occurrences.perspectives.reschedule', { exact: true }) }),
    ).toHaveAttribute('aria-selected', 'true')
    const flaggedRow = page.getByRole('row').filter({ hasText: 'Trening do przełożenia' })
    await expect(flaggedRow).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Trening Orlików' })).toHaveCount(0)

    // Move from the row: into Orliki's slot is refused with the list in the dialog; into a free slot clears the flag.
    await flaggedRow.getByTestId('occurrence-inline-move').click()
    const dialog = page.getByTestId('occurrence-move-dialog')
    await expect(dialog).toContainText('Trening do przełożenia')
    await dialog.locator('[data-crud-field-id="date"] input').fill(busy)
    await dialog.locator('[data-crud-field-id="startTime"] input').fill('17:00')
    await dialog.locator('[data-crud-field-id="endTime"] input').fill('18:00')
    await dialog.getByRole('button', { name: uiText('activities.occurrences.move.submit', { exact: true }) }).click()
    await expect(dialog.getByTestId('activities-conflicts')).toContainText('Trening Orlików')
    expect((await getOccurrence(request, club.adminToken, flagged.id)).body?.needsReschedule).toBe(true)
    await dialog.locator('[data-crud-field-id="startTime"] input').fill('20:30')
    await dialog.locator('[data-crud-field-id="endTime"] input').fill('21:30')
    await dialog.getByRole('button', { name: uiText('activities.occurrences.move.submit', { exact: true }) }).click()
    await expect(dialog).toHaveCount(0)
    const moved = (await getOccurrence(request, club.adminToken, flagged.id)).body
    expect(moved).toMatchObject({ needsReschedule: false, isDetached: true, startAt: zoneInstant(busy, '20:30') })
    await expect(page.getByTestId('occurrences-empty-reschedule')).toBeVisible()

    // ?activity= scopes the list to one activity under "Sessions of {activity}"; "All sessions" drops the scope.
    await page.goto(`/backend/activities/occurrences?activity=${other.activityId}`)
    await expect(page.getByTestId('occurrences-scope').getByRole('heading', { level: 1 })).toContainText(
      'Trening drugi',
    )
    await expect(page.getByRole('row').filter({ hasText: '19:00–20:00' })).toHaveCount(1)
    await expect(page.getByRole('row').filter({ hasText: '17:00–18:00' })).toHaveCount(0)
    await page.getByTestId('occurrences-scope-all').click()
    await expect(page).toHaveURL(/\/backend\/activities\/occurrences$/)

    // Cancel from the row: the dialog names the session, the toast counts the people told.
    const cancelRow = page.getByRole('row').filter({ hasText: 'Trening do odwołania' })
    await cancelRow.getByTestId('occurrence-inline-cancel').click()
    await expect(page.getByTestId('occurrence-cancel-session')).toContainText('Trening do odwołania')
    await page.getByTestId('occurrence-cancel-reason').fill('Boisko zamknięte')
    await page.getByTestId('occurrence-cancel-confirm').click()
    await expect(page.getByText(uiText('activities.occurrences.flash.cancelledNotified'))).toBeVisible()
    expect((await getOccurrence(request, club.adminToken, toCancel.id)).body?.status).toBe('cancelled')
  } finally {
    await club.cleanup()
  }
})
