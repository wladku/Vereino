import { expect, test, type Page } from '@playwright/test'
import { addDays } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { getGroup, listGroups, roster } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// TEST-A17 (groups and activities parity spec REQ-A11, AC-A13, J-A01 step 4; E10-S09 #274) on the TEST-008 family:
// the coordinator of the academy opens `/club/groups` on a phone (375 px) and sees the academy's group Żaki, never the
// pool's group; the roster of Żaki lists cards without contact data; they add a participant from the register through
// the bottom sheet, edit the new membership's last day, remove it (never used) and end Hania's membership on a chosen
// last day — en and pl, light and dark, axe clean, no sideways scroll. The coach of Żaki sees only Żaki and its roster
// without one action. A guardian gets 403 from the group and roster reads and the platform's access-denied page, and
// no roster response carries an e-mail, a phone or a PESEL (security negative case).
test.describe.configure({ timeout: 480_000 })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/** Every key anywhere in a JSON value, so a contact field nested in a row is found too. */
function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) keysOf(item, found)
  else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      found.add(key)
      keysOf(nested, found)
    }
  }
  return found
}

function card(page: Page, name: string) {
  return page.getByTestId('club-roster-member').filter({ hasText: name })
}

test('TEST-A17 coordinator roster on the phone: the section groups, add, edit, end and remove in sheets; a coach reads own rosters without actions; a guardian gets 403 and no response carries contact data', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-a17')
  try {
    const family = await familyFor(request, club)
    const today = calendarDate()
    const ola = await createPerson(request, club.adminToken, {
      firstName: 'Ola',
      lastName: 'Rejestrowa',
      birthDate: birthDateTurning(10),
    })
    const hania = `${family.younger.firstName} ${family.younger.lastName}`
    const coordinatorToken = family.academyCoordinator.token

    // --- The reads the pages rely on (before the browser sign-ins end the API tokens) -----------------------------
    const ownGroups = await listGroups(request, coordinatorToken, '&isActive=true')
    expect(ownGroups.status).toBe(200)
    expect(ownGroups.items.map((group) => group.id)).toEqual([family.zaki])
    const coachGroups = await listGroups(request, family.coach.token, '&isActive=true')
    expect(coachGroups.items.map((group) => group.id)).toEqual([family.zaki])
    // Another section's roster is not the coordinator's.
    expect((await getGroup(request, coordinatorToken, family.poolGroup)).status).toBe(403)
    expect((await roster(request, coordinatorToken, family.poolGroup)).items).toEqual([])
    // The guardian: 403 on the group and on its roster.
    expect((await getGroup(request, family.guardian.token, family.zaki)).status).toBe(403)
    expect((await roster(request, family.guardian.token, family.zaki)).status).toBe(403)
    // No roster response carries contact data: the plain list and the roster order the page reads.
    for (const query of ['', '&status=active&sortField=roster']) {
      const read = await roster(request, coordinatorToken, family.zaki, query)
      expect(read.status).toBe(200)
      expect(read.items.length).toBeGreaterThan(0)
      const keys = keysOf(read.items)
      for (const forbidden of ['email', 'phone', 'pesel', 'primaryEmail', 'phoneNumber']) {
        expect(keys.has(forbidden), `${forbidden} in ${query || 'list'}`).toBe(false)
      }
      for (const item of read.items) {
        expect(Object.keys(item.person ?? {}).sort()).toEqual(['age', 'firstName', 'lastName'])
      }
      expect(JSON.stringify(read.items)).not.toContain(family.guardian.email)
    }

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // --- The coordinator --------------------------------------------------------------------------------------------
    await signInBrowser(page, request, club, family.academyCoordinator.userId, family.academyCoordinator.email)
    await page.context().addCookies([{ name: 'locale', value: 'en', url: BASE_URL }])
    await page.goto('/club/groups')
    await expect(page.getByTestId('club-group')).toHaveCount(1)
    await expect(page.getByTestId('club-group')).toContainText('Żaki')
    await expect(page.getByTestId('club-groups-scope')).toHaveText(uiText('groups.club.list.sections', { exact: true }))
    await page.getByTestId('club-group').click()
    await expect(page).toHaveURL(new RegExp(`/club/groups/${family.zaki}$`))
    await expect(page.getByTestId('club-group-name')).toHaveText('Żaki')
    await expect(card(page, hania)).toBeVisible()
    await expect(page.getByTestId('club-roster-read-only')).toHaveCount(0)

    // Add a participant from the register in the bottom sheet.
    await page.getByTestId('club-roster-add').click()
    const sheet = page.getByTestId('groups-membership-dialog')
    await sheet.getByPlaceholder(uiText('groups.memberships.fields.person.search')).fill('Ola')
    const option = sheet.getByRole('option', {
      name: uiText('groups.memberships.personOption', { params: { name: 'Ola Rejestrowa', age: 10 } }),
    })
    await option.click()
    await sheet.getByTestId('groups-membership-save').click()
    await expect(sheet).toBeHidden()
    await expect(card(page, 'Ola Rejestrowa')).toBeVisible()
    await expect
      .poll(async () =>
        (await roster(request, club.adminToken, family.zaki)).items.some((item) => item.personId === ola),
      )
      .toBe(true)

    // Edit: the new membership gets a last day.
    await card(page, 'Ola Rejestrowa').getByTestId('club-roster-edit').click()
    const edit = page.getByTestId('groups-membership-dialog')
    await edit.getByTestId('groups-membership-to').fill(addDays(today, 30))
    await edit.getByTestId('groups-membership-save').click()
    await expect(edit).toBeHidden()
    await expect
      .poll(
        async () =>
          (await roster(request, club.adminToken, family.zaki)).items.find((item) => item.personId === ola)?.validTo,
      )
      .toBe(addDays(today, 30))

    // Remove: never used, so it goes after the confirmation.
    await card(page, 'Ola Rejestrowa').getByTestId('club-roster-remove').click()
    const confirmation = page.getByRole('alertdialog')
    await expect(confirmation).toContainText(uiText('groups.memberships.confirm.remove.text'))
    await confirmation
      .getByRole('button', { name: uiText('groups.memberships.actions.remove', { exact: true }) })
      .click()
    await expect(card(page, 'Ola Rejestrowa')).toHaveCount(0)
    await expect
      .poll(async () =>
        (await roster(request, club.adminToken, family.zaki)).items.some((item) => item.personId === ola),
      )
      .toBe(false)

    // J-A01 step 4: Hania's membership ends on a chosen last day.
    await card(page, hania).getByTestId('club-roster-end').click()
    const end = page.getByTestId('groups-membership-end-dialog')
    await end.getByTestId('groups-membership-last-day').fill(addDays(today, 7))
    await end.getByTestId('groups-membership-end-save').click()
    await expect(end).toBeHidden()
    await expect
      .poll(
        async () =>
          (await roster(request, club.adminToken, family.zaki)).items.find(
            (item) => item.personId === family.younger.personId,
          )?.validTo,
      )
      .toBe(addDays(today, 7))

    // 375 px, en and pl, light and dark: the list and the roster are axe clean and do not scroll sideways.
    const violations: Record<string, unknown> = {}
    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      await page.goto('/club/groups')
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `/club/groups (${locale})`, async () => {
          await expect(page.getByTestId('club-group')).toHaveCount(1)
        }),
      )
      await expectNoPageOverflow(page)
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      await page.goto(`/club/groups/${family.zaki}`)
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `/club/groups/[id] (${locale})`, async () => {
          await expect(card(page, hania)).toBeVisible()
        }),
      )
      await expectNoPageOverflow(page)
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    }
    // The add sheet itself at 375 px.
    await page.context().addCookies([{ name: 'locale', value: 'en', url: BASE_URL }])
    await page.goto(`/club/groups/${family.zaki}`)
    await page.getByTestId('club-roster-add').click()
    await expect(page.getByTestId('groups-membership-dialog')).toBeVisible()
    await expectNoPageOverflow(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('groups-membership-dialog')).toBeHidden()

    // --- The coach: own groups, the roster read-only --------------------------------------------------------------
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto('/club/groups')
    await expect(page.getByTestId('club-group')).toHaveCount(1)
    await expect(page.getByTestId('club-group')).toContainText('Żaki')
    await expect(page.getByTestId('club-groups-scope')).toHaveText(uiText('groups.club.list.coached', { exact: true }))
    await page.goto(`/club/groups/${family.zaki}`)
    await expect(card(page, hania)).toBeVisible()
    await expect(page.getByTestId('club-roster-read-only')).toBeVisible()
    await expect(page.getByTestId('club-roster-actions')).toHaveCount(0)
    await expect(page.getByTestId('club-roster-add')).toHaveCount(0)
    // The pool's group is not the coach's.
    await page.goto(`/club/groups/${family.poolGroup}`)
    await expect(page.getByTestId('club-group-denied')).toHaveText(uiText('groups.club.forbidden', { exact: true }))

    // --- The guardian: no `groups.view`, the platform's access-denied page ----------------------------------------
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    await page.goto(`/club/groups/${family.zaki}`)
    await expect(page.getByText(uiText('auth.accessDenied.title'))).toBeVisible()
    await expect(page.getByTestId('club-roster-member')).toHaveCount(0)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
