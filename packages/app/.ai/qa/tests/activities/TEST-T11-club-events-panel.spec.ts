import { expect, test, type Locator, type Page } from '@playwright/test'
import { addDays, nextWeekday } from '../_fixtures/activities'
import { declare, memberAccount } from '../_fixtures/attendance'
import { prepareForAccessibilityScan, scanInColorSchemes, type BlockingViolation } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { clubEventId, readClubEvent, updateClubEvent } from '../_fixtures/club-events'
import { create as createStructure, switchBrowserUser } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'
import { signInBrowserContext } from '../_fixtures/auth'

// Club events spec TEST-T11 without the files steps (phase 3, REQ-T11, REQ-T04 UI, AC-T11 in part, AC-T03 in the
// panel; #378). The administrator opens B-T1 (empty, "New club event"), creates "PRZYKŁAD CUP 2026" with a new external
// hall from the Add place dialog, adds a part with a visiting team added in place (Add team), copies it to the next day
// with another group, and sees both under their day headings with the team and the coach. Move shows the place
// read-only and saves the new time; Remove of a part Kasia declared for answers 409 `club_event_part_in_use` and the
// page offers Cancel, after which the row stays, struck through, with its reason. A stale Details form answers 409; a
// coordinator of another section sees a whole-club event read-only. B-T1 and B-T3 have no blocking axe violation in
// English and Polish, light and dark, at desktop and 1024 px.
test.describe.configure({ timeout: 900_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const EVENT = 'PRZYKŁAD CUP 2026'
const OPEN_ACTIONS = uiText('ui.rowActions.openActions')

/** Picks an option of a select inside a `CrudForm` field (native, or a combobox), retrying until it is offered. */
async function pick(page: Page, fieldId: string, option: string | RegExp): Promise<void> {
  await expect(async () => {
    const native = page.locator(`[data-crud-field-id="${fieldId}"] select`)
    if ((await native.count()) > 0) {
      const labels = await native.locator('option').allTextContents()
      const label = labels.find((text) => (typeof option === 'string' ? text === option : option.test(text)))
      expect(label).toBeDefined()
      await native.selectOption({ label: String(label) }, { timeout: 2_000 })
      return
    }
    const combobox = page.locator(`[data-crud-field-id="${fieldId}"] [role="combobox"]`).first()
    if ((await combobox.getAttribute('aria-expanded')) !== 'true') await combobox.click()
    await page.getByRole('option', { name: option }).click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

async function fill(scope: Page | Locator, fieldId: string, value: string): Promise<void> {
  await scope
    .locator(`[data-crud-field-id="${fieldId}"] input, [data-crud-field-id="${fieldId}"] textarea`)
    .first()
    .fill(value)
}

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

/** Opens the row menu of the part titled `title` and chooses `action`. */
async function partAction(page: Page, title: string, action: string | RegExp): Promise<void> {
  const row = page.getByRole('row').filter({ hasText: title })
  await row.getByRole('button', { name: OPEN_ACTIONS }).click()
  await page.getByRole('menuitem', { name: action }).click()
}

test('TEST-T11 the administrator lists, creates and works a club event in the panel; Move keeps the place, Remove of a declared part offers Cancel', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-t11-club-events-panel')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const fitness = await createStructure(request, admin, 'sections', { name: 'Ogólnorozwojowe' })
    const orlik = await createGroup(request, admin, { sectionId: academy, name: 'Orlik młodszy', kind: 'team' })
    await createGroup(request, admin, { sectionId: academy, name: 'Żak młodszy', kind: 'team' })
    const since = addDays(calendarDate(), -30)
    const rafal = await signedInStaff(request, club, {
      firstName: 'Rafał',
      lastName: 'Malinowski',
      role: 'coach',
    })
    await addMembership(request, admin, { groupId: orlik, personId: rafal.personId, role: 'coach', validFrom: since })
    const jas = await createPerson(request, admin, {
      firstName: 'Jaś',
      lastName: 'Nowak',
      birthDate: birthDateTurning(9),
    })
    const kasiaPerson = await createPerson(request, admin, {
      firstName: 'Kasia',
      lastName: 'Nowak',
      birthDate: birthDateTurning(38),
    })
    await createGuardianship(request, admin, { guardianPersonId: kasiaPerson, wardPersonId: jas, validFrom: since })
    await addMembership(request, admin, { groupId: orlik, personId: jas, role: 'participant', validFrom: since })
    const kasia = await memberAccount(request, club, kasiaPerson, 'kasia-t11')
    const ola = await signedInStaff(request, club, {
      firstName: 'Ola',
      lastName: 'Fitness',
      role: 'coordinator',
      sectionId: fitness,
    })
    const sat = nextWeekday(addDays(calendarDate(), 7), 'SA')
    const sun = addDays(sat, 1)

    page.setDefaultTimeout(30_000)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)
    await signInBrowserContext(page.request, club.tenant.email, club.tenant.password)
    await setLocale(page, 'en')
    await page.setViewportSize({ width: 1280, height: 900 })

    // --- B-T1: empty, then "New club event" ---
    await page.goto('/backend/activities/club-events')
    await expect(page.getByTestId('club-events-empty')).toContainText(uiText('activities.clubEvents.empty.title'))
    await page
      .getByTestId('club-events-empty')
      .getByRole('link', { name: uiText('activities.clubEvents.actions.create') })
      .click()
    await expect(page).toHaveURL(/\/backend\/activities\/club-events\/create/)

    // --- B-T2: the form with a new external place from the Add place dialog ---
    await fill(page, 'name', EVENT)
    await pick(page, 'sectionId', 'Akademia piłkarska')
    await page.getByTestId('club-event-add-place').click()
    const placeDialog = page.getByTestId('add-external-place-dialog')
    await expect(placeDialog).toBeVisible()
    await placeDialog.getByTestId('add-external-place-name').fill('Hala sportowa w Zielonym Lesie')
    await placeDialog.getByTestId('add-external-place-address').fill('ul. Szkolna 50, Zielony Las')
    await placeDialog.getByTestId('add-external-place-submit').click()
    await expect(placeDialog).toBeHidden()
    await expect(page.getByTestId('club-event-place')).toContainText('Hala sportowa w Zielonym Lesie')
    await fill(page, 'gatheringMinutesBefore', '30')
    const created = page.waitForResponse(
      (response) => response.url().endsWith('/api/activities/club-events') && response.request().method() === 'POST',
    )
    await page
      .getByRole('button', { name: uiText('activities.common.create', { exact: true }) })
      .first()
      .click()
    expect((await created).status()).toBe(201)
    await expect(page).toHaveURL(/\/backend\/activities\/club-events\/[0-9a-f-]+\?tab=parts/)
    const eventId = /club-events\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? ''
    expect(eventId).not.toBe('')
    await expect(page.getByRole('heading', { level: 1, name: EVENT })).toBeVisible()
    await expect(page.getByTestId('club-event-parts-empty')).toContainText(
      uiText('activities.clubEvents.part.empty.title'),
    )

    // --- Add part with Add team ---
    await page.getByTestId('club-event-add-part').click()
    const partDialog = page.getByTestId('club-event-part-dialog')
    await expect(partDialog).toBeVisible()
    await fill(partDialog, 'title', 'Turniej Orlika Młodszego')
    await fill(partDialog, 'date', sat)
    await fill(partDialog, 'startTime', '09:00')
    await fill(partDialog, 'endTime', '14:00')
    await pick(page, 'groupId', 'Orlik młodszy (Akademia piłkarska)')
    await fill(partDialog, 'categoryLabel', 'Orlik młodszy')
    await pick(page, 'coachPersonId', 'Rafał Malinowski')
    await partDialog.getByTestId('club-event-part-add-team').click()
    const teamDialog = page.getByTestId('club-event-part-team-create')
    // The dialog's form mounts with the dialog; a value typed in its first frame may be reset, so fill until it holds.
    const teamName = teamDialog.locator('input[name="name"]')
    await expect(async () => {
      await teamName.fill('Wisła Brzezie')
      await expect(teamName).toHaveValue('Wisła Brzezie', { timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    await teamDialog.locator('input[name="clubName"]').fill('LKS Wisła Brzezie')
    await teamDialog.getByRole('button', { name: uiText('activities.clubEvents.part.teams.submit') }).click()
    await expect(teamDialog).toBeHidden()
    await expect(partDialog.getByTestId('club-event-part-team')).toContainText('Wisła Brzezie')
    await partDialog.getByRole('button', { name: uiText('activities.clubEvents.part.submitCreate') }).click()
    await expect(partDialog).toBeHidden()
    const orlikRow = page.getByRole('row').filter({ hasText: 'Turniej Orlika Młodszego' })
    await expect(orlikRow).toContainText('Wisła Brzezie')
    await expect(orlikRow).toContainText('Rafał Malinowski')

    // --- Copy: the day and the group chosen again ---
    await partAction(page, 'Turniej Orlika Młodszego', uiText('activities.clubEvents.part.actions.copy'))
    await expect(page).toHaveURL(/copyOf=/)
    await expect(partDialog).toBeVisible()
    await expect(partDialog.locator('[data-crud-field-id="title"] input')).toHaveValue('Turniej Orlika Młodszego')
    await expect(partDialog.getByTestId('club-event-part-team')).toContainText('Wisła Brzezie')
    await fill(partDialog, 'title', 'Turniej Żaka Młodszego')
    await fill(partDialog, 'date', sun)
    await pick(page, 'groupId', 'Żak młodszy (Akademia piłkarska)')
    await partDialog.getByRole('button', { name: uiText('activities.clubEvents.part.submitCreate') }).click()
    await expect(partDialog).toBeHidden()
    await expect(page.getByTestId('club-event-part-day')).toHaveCount(2)
    await expect(page.getByRole('row').filter({ hasText: 'Turniej Żaka Młodszego' })).toContainText('Wisła Brzezie')

    // --- Move: the place is read-only, the new time saves ---
    await partAction(page, 'Turniej Orlika Młodszego', uiText('activities.clubEvents.part.actions.move'))
    const moveDialog = page.getByTestId('occurrence-move-dialog')
    await expect(moveDialog.getByTestId('occurrence-move-place-locked')).toHaveText('Hala sportowa w Zielonym Lesie')
    await fill(moveDialog, 'startTime', '10:00')
    await fill(moveDialog, 'endTime', '15:00')
    const moved = page.waitForResponse(
      (response) =>
        /\/api\/activities\/occurrences\/[0-9a-f-]+$/.test(response.url()) && response.request().method() === 'PATCH',
    )
    await moveDialog.getByRole('button', { name: uiText('activities.occurrences.move.submit') }).click()
    const movedResponse = await moved
    expect(movedResponse.status()).toBe(200)
    expect(JSON.parse(movedResponse.request().postData() ?? '{}')).not.toHaveProperty('placeId')
    await expect(moveDialog).toBeHidden()
    await expect(page.getByRole('row').filter({ hasText: 'Turniej Orlika Młodszego' })).toContainText('10:00–15:00')

    // --- Remove of a declared part: 409 `club_event_part_in_use`, and the page offers Cancel ---
    const record = await readClubEvent(request, admin, eventId)
    const orlikPart = record.body?.parts.find((part) => part.title === 'Turniej Orlika Młodszego')
    expect(orlikPart?.occurrenceId).toBeTruthy()
    const declared = await declare(request, kasia.token, {
      occurrenceId: String(orlikPart?.occurrenceId),
      personId: jas,
      declared: 'yes',
    })
    expect(declared.status, JSON.stringify(declared.body)).toBe(201)
    await partAction(page, 'Turniej Orlika Młodszego', uiText('activities.clubEvents.part.actions.remove'))
    const removed = page.waitForResponse(
      (response) => /\/parts\/[0-9a-f-]+$/.test(response.url()) && response.request().method() === 'DELETE',
    )
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: uiText('activities.clubEvents.part.actions.remove') })
      .click()
    const removedResponse = await removed
    expect(removedResponse.status()).toBe(409)
    expect(JSON.stringify(await removedResponse.json())).toContain('club_event_part_in_use')
    const inUse = page.getByRole('alertdialog')
    await expect(inUse).toContainText(uiText('activities.clubEvents.part.inUse.title'))
    await inUse.getByRole('button', { name: uiText('activities.clubEvents.part.actions.cancel') }).click()
    await page.getByTestId('occurrence-cancel-reason').fill('Hala zamknięta')
    await page.getByTestId('occurrence-cancel-confirm').click()
    const cancelledTitle = page
      .getByRole('row')
      .filter({ hasText: 'Turniej Orlika Młodszego' })
      .getByTestId('club-event-part-title')
    await expect(cancelledTitle).toContainText('Hala zamknięta')
    await expect(cancelledTitle.locator('.line-through')).toHaveText('Turniej Orlika Młodszego')

    // --- A stale Details form answers 409 ---
    await page.getByRole('tab', { name: uiText('activities.clubEvents.record.details') }).click()
    await expect(page).toHaveURL(/tab=details/)
    await expect(page.locator('[data-crud-field-id="name"] input')).toHaveValue(EVENT)
    const before = await readClubEvent(request, admin, eventId)
    const changed = await updateClubEvent(
      request,
      admin,
      { id: eventId, description: 'Halowy turniej piłki nożnej' },
      before.body?.updatedAt,
    )
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    await fill(page, 'name', `${EVENT} (zmiana)`)
    const stale = page.waitForResponse(
      (response) => response.url().endsWith('/api/activities/club-events') && response.request().method() === 'PUT',
    )
    await page
      .getByRole('button', { name: uiText('activities.common.save', { exact: true }) })
      .first()
      .click()
    expect((await stale).status()).toBe(409)

    // --- B-T1 and B-T3: both locales, light and dark, desktop and 1024 px ---
    const violations: Record<string, BlockingViolation[]> = {}
    for (const locale of ['en', 'pl'] as const) {
      await setLocale(page, locale)
      for (const width of [1280, 1024]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/backend/activities/club-events')
        Object.assign(
          violations,
          await scanInColorSchemes(
            page,
            testInfo,
            `B-T1 ${locale} ${String(width)} px`,
            async () => {
              await expect(page.getByRole('link', { name: EVENT })).toBeVisible()
            },
            { platformBaseline: true },
          ),
        )
        await page.goto(`/backend/activities/club-events/${eventId}?tab=parts`)
        Object.assign(
          violations,
          await scanInColorSchemes(
            page,
            testInfo,
            `B-T3 ${locale} ${String(width)} px`,
            async () => {
              await expect(page.getByTestId('club-event-part-day').first()).toBeVisible()
            },
            { platformBaseline: true },
          ),
        )
      }
    }
    expect(violations).toEqual({})

    // --- A coordinator of another section sees a whole-club event read-only ---
    const wholeClub = await clubEventId(request, admin, {
      name: 'Dzień klubu',
      sectionId: null,
      placeId: String(before.body?.placeId),
    })
    await switchBrowserUser(page, request, club, ola.userId, ola.email)
    await setLocale(page, 'en')
    await page.goto(`/backend/activities/club-events/${wholeClub}?tab=details`)
    await expect(page.getByTestId('club-event-details-readonly')).toBeVisible()
    await expect(page.getByTestId('club-event-cancel')).toHaveCount(0)
    await page.goto(`/backend/activities/club-events/${wholeClub}?tab=parts`)
    await expect(page.getByTestId('club-event-parts-empty')).toBeVisible()
    await expect(page.getByTestId('club-event-add-part')).toHaveCount(0)

    expect(consoleErrors.filter((text) => !/Failed to load resource/.test(text))).toEqual([])
  } finally {
    await club.cleanup()
  }
})
