import { expect, test, type Page } from '@playwright/test'
import { addDays, weekdayOf } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, oneOff } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { createGuardianship } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// TEST-F11 (foundation spec AC-F13, REQ-F13; issue #586): the `MemberShell` header switchers on `/club` work from the
// keyboard alone and appear only when they have something to switch. A coach who is also the guardian of two wards
// (two grant kinds, two wards) Tabs to the role-context switcher, opens it with Enter, moves with the arrow keys and
// picks "as coach": the ward switcher and the member tiles go, only "My sessions" stays; back "as member / guardian",
// the ward switcher returns and is operated the same way, narrowing Today to one ward; Escape closes a list without
// changing the choice and focus stays on the trigger. A member without wards (one grant kind) and a coach without
// wards (one grant kind) see neither switcher. The mouse-driven switcher behaviour is `E06-S19-member-shell`.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type SwitcherId = 'context' | 'ward'

/** Presses Tab (or Shift+Tab) until the switcher's trigger has focus; fails after 20 presses. */
async function tabTo(page: Page, switcher: SwitcherId, backwards = false): Promise<void> {
  const id = `club-switcher-${switcher}`
  for (let press = 0; press < 20; press += 1) {
    if (await page.evaluate((target) => document.activeElement?.id === target, id)) return
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab')
  }
  await expect(page.locator(`#${id}`)).toBeFocused()
}

/**
 * Opens the focused switcher with Enter, moves to the option with ArrowUp/ArrowDown one key at a time and picks it with
 * Enter. Radix moves focus a tick after the key press (in a timeout), so every press waits for the next option's focus.
 */
async function chooseByKeyboard(page: Page, switcher: SwitcherId, option: string | RegExp): Promise<void> {
  const trigger = page.locator(`#club-switcher-${switcher}`)
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter')
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible()
  const options = listbox.getByRole('option')
  // Radix focuses the selected option once the list is positioned.
  await expect(listbox.locator('[role="option"][aria-selected="true"]')).toBeFocused()
  let index = await options.evaluateAll((elements) =>
    elements.findIndex((element) => element === document.activeElement),
  )
  const target = await listbox.getByRole('option', { name: option }).evaluate((element) => {
    const all = element.closest('[role="listbox"]')?.querySelectorAll('[role="option"]') ?? []
    return Array.from(all).indexOf(element)
  })
  expect(target, 'the option is in the list').toBeGreaterThanOrEqual(0)
  while (index !== target) {
    await page.keyboard.press(index < target ? 'ArrowDown' : 'ArrowUp')
    index += index < target ? 1 : -1
    await expect(options.nth(index)).toBeFocused()
  }
  await page.keyboard.press('Enter')
  await expect(listbox).toHaveCount(0)
}

test('TEST-F11 member shell switchers by keyboard, hidden without wards and with one grant kind', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-f11')
  try {
    const family = await familyFor(request, club)
    const tomorrow = addDays(calendarDate(), 1)
    // Tomorrow: a Żaki training (the coach's group; both of his wards train there) and a pool class (one ward only).
    await oneOff(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening F11',
      type: 'training',
      weekday: weekdayOf(tomorrow),
      fromDaysAhead: 1,
      start: '17:00',
      end: '18:00',
    })
    await oneOff(request, club, family.poolCoordinator.token, {
      groupId: family.poolGroup,
      placeId: family.poolPlace,
      name: 'Basen F11',
      type: 'training',
      weekday: weekdayOf(tomorrow),
      fromDaysAhead: 1,
      start: '19:00',
      end: '20:00',
    })
    // The coach of Żaki becomes a guardian of two wards: the other family's child (Żaki) and the 14-year-old (Żaki and
    // the pool group).
    for (const wardPersonId of [family.other.child.personId, family.younger.personId]) {
      await createGuardianship(request, club.adminToken, {
        guardianPersonId: family.coach.personId,
        wardPersonId,
        isPrimaryPayer: false,
        consents: { regulations: true },
        validFrom: addDays(calendarDate(), -30),
      })
    }

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // --- Two grant kinds, two wards: both switchers, each named by its label ---
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto('/club')
    await expect(page.getByTestId('club-bottom-bar')).toBeVisible()
    const context = page.getByRole('combobox', { name: uiText('people.club.nav.context', { exact: true }) })
    const ward = page.getByRole('combobox', { name: uiText('people.club.nav.ward', { exact: true }) })
    await expect(context).toContainText(uiText('people.club.nav.contextMember', { exact: true }))
    await expect(ward).toContainText(uiText('people.club.nav.allWards', { exact: true }))
    const calendarTile = page.getByTestId('club-tile-calendar')
    const sessions = calendarTile.getByTestId('club-today-session')
    await expect(sessions.filter({ hasText: 'Trening F11' })).toBeVisible()
    await expect(sessions.filter({ hasText: 'Basen F11' })).toBeVisible()
    await expect(page.getByTestId('club-tile-coach')).toBeVisible()
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club with both switchers',
      async () => {
        await expect(page.getByTestId('club-switcher-context')).toBeVisible()
        await expect(page.getByTestId('club-switcher-ward')).toBeVisible()
      },
      { platformBaseline: true },
    )
    await expectNoPageOverflow(page)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()
    await expect(context).toBeVisible()

    // Escape closes the list without a change and leaves focus on the trigger.
    await tabTo(page, 'context')
    await page.keyboard.press('Space')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(context).toBeFocused()
    await expect(context).toContainText(uiText('people.club.nav.contextMember', { exact: true }))

    // "as coach" by keyboard: the ward switcher and the member tiles go, "My sessions" stays; focus is back on the trigger.
    await chooseByKeyboard(page, 'context', uiText('people.club.nav.contextCoach', { exact: true }))
    await expect(context).toBeFocused()
    await expect(context).toContainText(uiText('people.club.nav.contextCoach', { exact: true }))
    await expect(page.getByTestId('club-switcher-ward')).toHaveCount(0)
    await expect(calendarTile).toHaveCount(0)
    await expect(page.getByTestId('club-tile-coach')).toBeVisible()

    // Back to "as member / guardian": the ward switcher returns, next in the Tab order after the context switcher.
    await chooseByKeyboard(page, 'context', uiText('people.club.nav.contextMember', { exact: true }))
    await expect(page.getByTestId('club-switcher-ward')).toBeVisible()
    await expect(sessions.filter({ hasText: 'Basen F11' })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(ward).toBeFocused()

    // One ward by keyboard: the pool class (only the 14-year-old's) leaves Today, the Żaki training names that ward.
    const child = family.other.child
    await chooseByKeyboard(page, 'ward', `${child.firstName} ${child.lastName}`)
    await expect(ward).toBeFocused()
    await expect(ward).toContainText(child.firstName)
    await expect(sessions.filter({ hasText: 'Basen F11' })).toHaveCount(0)
    await expect(sessions.filter({ hasText: 'Trening F11' })).toHaveText(new RegExp(child.firstName))

    // And back to everyone, reaching the ward switcher again from the context switcher with Shift+Tab and Tab.
    await tabTo(page, 'context', true)
    await page.keyboard.press('Tab')
    await chooseByKeyboard(page, 'ward', uiText('people.club.nav.allWards', { exact: true }))
    await expect(sessions.filter({ hasText: 'Basen F11' })).toBeVisible()

    // --- One grant kind (member), no wards: the 16-year-old with an account sees neither switcher ---
    await signInBrowser(page, request, club, family.elder.userId, family.elder.email)
    await page.goto('/club')
    await expect(page.getByTestId('club-bottom-bar')).toBeVisible()
    await expect(page.getByTestId('club-tile-calendar')).toBeVisible()
    await expect(page.getByTestId('club-switchers')).toHaveCount(0)
    await expect(page.getByTestId('club-switcher-ward')).toHaveCount(0)
    await expect(page.getByTestId('club-switcher-context')).toHaveCount(0)

    // --- One grant kind (staff), no wards: the pool instructor sees neither switcher, only "My sessions" ---
    await signInBrowser(page, request, club, family.instructor.userId, family.instructor.email)
    await page.goto('/club')
    await expect(page.getByTestId('club-bottom-bar')).toBeVisible()
    await expect(page.getByTestId('club-tile-coach')).toBeVisible()
    await expect(page.getByTestId('club-switchers')).toHaveCount(0)
    await expect(page.getByTestId('club-switcher-ward')).toHaveCount(0)
    await expect(page.getByTestId('club-switcher-context')).toHaveCount(0)
    await expect(page.getByTestId('club-tile-calendar')).toHaveCount(0)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
