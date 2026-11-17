import { expect, test } from '@playwright/test'
import { addDays, createEvent, nextWeekday, scheduleFor, zoneInstant } from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { createGroup, signedInStaff } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// TEST-A05 (#268; groups and activities parity spec REQ-A04, AC-A04, J-A05; README B-14): the wizard opened from a group
// preselects it and labels it "Name (Section)"; the place select offers the club's own bookable places only; "Create"
// stays disabled until the last preview of the current values found no collision, and saving opens the sessions list
// scoped to the new activity. A club without a bookable place gets an explanation and a link to Places instead of an
// empty select (negative case).
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('TEST-A05 the wizard preselects the group, offers own places only, enables Create after a clean preview and opens the scoped sessions list', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-a05-wizard')
  const empty = await createClub(request, 'test-a05-no-place')
  try {
    const { academy, pitch, zaki, orliki } = await scheduleFor(request, club)
    await createStructure(request, club.adminToken, 'places', {
      name: 'Stadion Wisły',
      kind: 'pitch',
      capacityGroups: 1,
      isExternal: true,
    })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Ewa',
      lastName: 'Planistka',
      role: 'coordinator',
      sectionId: academy,
    })
    const today = calendarDate()
    const tuesday = nextWeekday(addDays(today, 1), 'TU')
    // Orliki already play on the pitch on that Tuesday at 17:00: the Żaki series at 17:00 collides once.
    const clash = await createEvent(request, club.adminToken, {
      groupId: orliki,
      type: 'other',
      name: 'Sparing Orlików',
      placeId: pitch,
      startsAt: zoneInstant(tuesday, '17:00'),
      endsAt: zoneInstant(tuesday, '18:30'),
    })
    expect(clash.status, JSON.stringify(clash.body)).toBe(201)

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/backend/activities/activities/create?groupId=${zaki}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-crud-field-id="groupId"]')).toContainText('Żaki (Akademia piłkarska)')

    const create = page.getByTestId('activities-create-submit')
    const hint = page.getByTestId('activities-create-hint')
    await expect(create).toBeDisabled()
    await expect(hint).toHaveText(uiText('activities.activities.create.previewFirst', { exact: true }))

    await page.locator('[data-crud-field-id="name"] input').fill('Trening Żaków')
    await page.getByTestId('activities-place-select').click()
    await expect(page.getByRole('option', { name: /Boisko A/ })).toBeVisible()
    await expect(page.getByRole('option', { name: /Stadion Wisły/ })).toHaveCount(0)
    await page.getByRole('option', { name: /Boisko A/ }).click()
    await page.locator('[data-crud-field-id="startsOn"] input').fill(addDays(today, 1))
    await page.locator('[data-crud-field-id="startTime"] input').fill('17:00')
    await page.locator('[data-crud-field-id="endTime"] input').fill('18:30')
    await page.getByTestId('activities-repeat-weekly').click()
    await page.getByTestId('activities-weekday-TU').click()
    await page.getByTestId('activities-recurrence-end-until').click()
    await page.getByTestId('activities-recurrence-until').fill(addDays(today, 8 * 7))
    // The series end is entered once: no separate "last day" field in the dates group.
    await expect(page.locator('[data-crud-field-id="endsOn"]')).toHaveCount(0)

    // A preview with a collision keeps "Create" disabled with the hint.
    await page.getByTestId('activities-preview-button').click()
    await expect(page.getByTestId('activities-preview-summary')).toBeFocused()
    await expect(
      page
        .getByTestId('activities-preview-table')
        .getByText(uiText('activities.preview.status.conflict', { exact: true })),
    ).toHaveCount(1)
    await expect(create).toBeDisabled()
    await expect(hint).toHaveText(uiText('activities.activities.create.resolveConflicts', { exact: true }))

    // Changed values make the preview stale; a fresh preview without collisions enables "Create".
    await page.locator('[data-crud-field-id="startTime"] input').fill('19:00')
    await page.locator('[data-crud-field-id="endTime"] input').fill('20:00')
    await expect(create).toBeDisabled()
    await page.getByTestId('activities-preview-button').click()
    await expect(page.getByTestId('activities-preview-clear')).toBeVisible()
    await expect(create).toBeEnabled()
    await create.click()

    await expect(page).toHaveURL(/\/backend\/activities\/occurrences\?activity=[0-9a-f-]{36}$/)
    await expect(page.getByTestId('occurrences-scope').getByRole('heading', { level: 1 })).toContainText(
      'Trening Żaków',
    )
    await expect(page.getByRole('row').filter({ hasText: '19:00–20:00' }).first()).toBeVisible()

    // A club with no bookable place: an explanation and a link to Places replace the empty select.
    const emptySection = await createStructure(request, empty.adminToken, 'sections', { name: 'Sekcja pływacka' })
    const emptyGroup = await createGroup(request, empty.adminToken, {
      sectionId: emptySection,
      name: 'Delfiny',
      kind: 'class_group',
    })
    const emptyCoordinator = await signedInStaff(request, empty, {
      firstName: 'Olga',
      lastName: 'Bezmiejsca',
      role: 'coordinator',
      sectionId: emptySection,
    })
    await signInBrowser(page, request, empty, emptyCoordinator.userId, emptyCoordinator.email)
    await page.goto(`/backend/activities/activities/create?groupId=${emptyGroup}`)
    const noPlace = page.getByTestId('activities-place-empty')
    await expect(noPlace).toContainText(uiText('activities.fields.place.none'))
    await expect(
      noPlace.getByRole('link', { name: uiText('activities.fields.place.openPlaces', { exact: true }) }),
    ).toHaveAttribute('href', '/backend/club/places')
    await expect(page.getByTestId('activities-place-select')).toHaveCount(0)
  } finally {
    await club.cleanup()
    await empty.cleanup()
  }
})
