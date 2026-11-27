import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { addDays } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup, roster } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// TEST-A04 (groups and activities parity spec REQ-A03, J-A01 steps 1–3 and 5; issue #267; README B-12): as the club
// administrator, the roster tab of a team lists coaches first with the views Active / Upcoming / History and their
// totals in the URL; "Add to roster" searches by first name, shows "First Last (age N)" and leaves out a current
// member; a wrongly added, never used membership is removed after a confirmation that says issued charges stay; an
// upcoming row offers Edit and Remove but not End; Edit and End save their dates; `?personId=…&role=coach` opens the
// dialog with the person and role chosen; the person search is a labelled group and a dialog error is tied to its
// fields (#359) — at 375 px and on desktop, in both locales, light and dark, axe clean.
test.describe.configure({ timeout: 300_000 })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const OPEN_ACTIONS = uiText('ui.rowActions.openActions')

function row(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name })
}

/** A roster view tab (the platform `TabsTrigger` drops `data-testid`; lesson `tabs-primitives-drop-data-testid`). */
function viewTab(page: Page, view: 'active' | 'upcoming' | 'ended') {
  return page
    .getByRole('tablist', { name: uiText('groups.memberships.views.label', { exact: true }) })
    .getByRole('tab', { name: uiText(`groups.memberships.views.${view}`) })
}

async function openRowMenu(page: Page, name: string): Promise<void> {
  await row(page, name).getByRole('button', { name: OPEN_ACTIONS }).click()
}

test('TEST-A04 roster tab: views with totals in the URL, add by first name without current members, remove a mistake, upcoming offers no End, edit and end with dates, the deep link; 375 px and desktop, en and pl, light and dark', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-a04-roster-ui')
  try {
    const token = club.adminToken
    const today = calendarDate()
    const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
    const team = await createGroup(request, token, { sectionId: academy, name: 'Orliki', kind: 'team' })
    const person = (firstName: string, lastName: string, age: number) =>
      createPerson(request, token, { firstName, lastName, birthDate: birthDateTurning(age) })
    const coach = await person('Rafał', 'Trener', 40)
    const kowalski = await person('Jan', 'Kowalski', 9)
    const nowak = await person('Jan', 'Nowak', 41)
    const ola = await person('Ola', 'Lis', 8)
    await addMembership(request, token, {
      groupId: team,
      personId: coach,
      role: 'coach',
      validFrom: addDays(today, -60),
    })
    await addMembership(request, token, {
      groupId: team,
      personId: nowak,
      role: 'participant',
      validFrom: addDays(today, -60),
    })
    const upcoming = await addMembership(request, token, {
      groupId: team,
      personId: ola,
      role: 'participant',
      validFrom: addDays(today, 10),
    })

    page.setDefaultTimeout(30_000)
    // `signInBrowser` sets a new password and ends the API token (lesson `sign-in-browser-ends-the-api-token`).
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    await prepareForAccessibilityScan(page)
    const href = `/backend/groups/groups/${team}?tab=roster&status=active`

    // J-A01 step 1: the active view with its total; "Add to roster" searches "Jan" and leaves out Jan Nowak.
    await page.goto(href)
    await expect(viewTab(page, 'active')).toHaveAttribute('aria-selected', 'true')
    await expect(viewTab(page, 'active')).toContainText('(2)')
    await expect(viewTab(page, 'upcoming')).toContainText('(1)')
    await expect(viewTab(page, 'ended')).toContainText('(0)')
    await page.getByTestId('roster-add').click()
    const dialog = page.getByTestId('groups-membership-dialog')
    // The person search is a group named by its label; saving without a person ties the alert to it (#359).
    const personGroup = dialog.getByRole('group', { name: uiText('groups.memberships.fields.person', { exact: true }) })
    await expect(personGroup).toBeVisible()
    await dialog.getByTestId('groups-membership-save').click()
    const personProblem = dialog.getByRole('alert')
    await expect(personProblem).toContainText(uiText('groups.memberships.errors.personRequired'))
    await expect(personGroup).toHaveAttribute('aria-describedby', String(await personProblem.getAttribute('id')))
    await dialog.getByPlaceholder(uiText('groups.memberships.fields.person.search')).fill('Jan')
    const option = dialog.getByRole('option', {
      name: uiText('groups.memberships.personOption', { params: { name: 'Jan Kowalski', age: 9 } }),
    })
    await expect(option).toBeVisible()
    await expect(dialog.getByRole('option', { name: /Jan Nowak/ })).toHaveCount(0)
    await option.click()
    await dialog.getByTestId('groups-membership-save').click()
    await expect(dialog).toBeHidden()
    await expect(row(page, 'Jan Kowalski')).toBeVisible()
    // The coach is listed first; the new participant after the coaches.
    const names = await page.getByRole('row').allInnerTexts()
    const coachAt = names.findIndex((text) => text.includes('Rafał Trener'))
    expect(coachAt).toBeGreaterThan(-1)
    expect(names.findIndex((text) => text.includes('Jan Kowalski'))).toBeGreaterThan(coachAt)
    await expect(viewTab(page, 'active')).toContainText('(3)')

    // Step 2: the wrong Jan is removed; the confirmation says that issued charges stay.
    await openRowMenu(page, 'Jan Kowalski')
    await page.getByRole('menuitem', { name: uiText('groups.memberships.actions.remove', { exact: true }) }).click()
    const confirmation = page.getByRole('alertdialog')
    await expect(confirmation).toContainText(uiText('groups.memberships.confirm.remove.text'))
    await confirmation
      .getByRole('button', { name: uiText('groups.memberships.actions.remove', { exact: true }) })
      .click()
    await expect(row(page, 'Jan Kowalski')).toHaveCount(0)
    await expect(viewTab(page, 'active')).toContainText('(2)')
    const afterRemove = await roster(request, club.adminToken, team)
    expect(afterRemove.status).toBe(200)
    expect(afterRemove.items.some((item) => item.personId === kowalski)).toBe(false)
    expect(afterRemove.items.some((item) => item.personId === nowak)).toBe(true)

    // Step 3: an upcoming row offers Edit and Remove, not End; Edit saves a last day.
    await viewTab(page, 'upcoming').click()
    await expect(page).toHaveURL(/status=upcoming/)
    await openRowMenu(page, 'Ola Lis')
    await expect(
      page.getByRole('menuitem', { name: uiText('groups.memberships.actions.edit', { exact: true }) }),
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: uiText('groups.memberships.actions.remove', { exact: true }) }),
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: uiText('groups.memberships.actions.end', { exact: true }) }),
    ).toHaveCount(0)
    await page.getByRole('menuitem', { name: uiText('groups.memberships.actions.edit', { exact: true }) }).click()
    const editDialog = page.getByTestId('groups-membership-dialog')
    // An empty From is refused in the dialog: the date fields are marked invalid and point at the alert (#359).
    const from = editDialog.getByTestId('groups-membership-from')
    const firstDay = await from.inputValue()
    await from.fill('')
    await editDialog.getByTestId('groups-membership-save').click()
    const datesProblem = editDialog.getByRole('alert')
    await expect(datesProblem).toContainText(uiText('groups.memberships.errors.dates'))
    const datesProblemId = String(await datesProblem.getAttribute('id'))
    for (const field of [from, editDialog.getByTestId('groups-membership-to')]) {
      await expect(field).toHaveAttribute('aria-invalid', 'true')
      await expect(field).toHaveAttribute('aria-describedby', datesProblemId)
    }
    await from.fill(firstDay)
    await editDialog.getByTestId('groups-membership-to').fill(addDays(today, 40))
    await editDialog.getByTestId('groups-membership-save').click()
    await expect(editDialog).toBeHidden()
    await expect
      .poll(
        async () => (await roster(request, club.adminToken, team)).items.find((item) => item.id === upcoming)?.validTo,
      )
      .toBe(addDays(today, 40))

    // End on a chosen day: Jan Nowak's last day is saved.
    await viewTab(page, 'active').click()
    await openRowMenu(page, 'Jan Nowak')
    await page.getByRole('menuitem', { name: uiText('groups.memberships.actions.end', { exact: true }) }).click()
    const endDialog = page.getByTestId('groups-membership-end-dialog')
    await endDialog.getByTestId('groups-membership-last-day').fill(addDays(today, 13))
    await endDialog.getByTestId('groups-membership-end-save').click()
    await expect(endDialog).toBeHidden()
    await expect
      .poll(
        async () =>
          (await roster(request, club.adminToken, team)).items.find((item) => item.personId === nowak)?.validTo,
      )
      .toBe(addDays(today, 13))

    // The deep link of spec L J-L07 opens the dialog with the person and the role chosen.
    await page.goto(`/backend/groups/groups/${team}?tab=roster&personId=${kowalski}&role=coach`)
    const linked = page.getByTestId('groups-membership-dialog')
    await expect(linked).toBeVisible()
    await expect(linked).toContainText('Jan Kowalski')
    await expect(linked.getByTestId('groups-membership-role')).toContainText(
      uiText('groups.memberships.role.coach', { exact: true }),
    )
    await page.keyboard.press('Escape')
    await expect(linked).toBeHidden()

    // Desktop and 375 px, both locales, light and dark: axe clean and no sideways scroll.
    const violations: Record<string, unknown> = {}
    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      for (const width of [1280, 375]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(href)
        Object.assign(
          violations,
          await scanInColorSchemes(
            page,
            testInfo,
            `roster ${locale} ${String(width)}`,
            async () => {
              await expect(viewTab(page, 'active')).toContainText(uiText('groups.memberships.views.active'))
              await expect(page.getByText('Rafał Trener')).toBeVisible()
            },
            { platformBaseline: true },
          ),
        )
      }
      await expectNoPageOverflow(page)
    }
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
