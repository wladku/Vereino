import { expect, test, type Locator, type Page } from '@playwright/test'
import { addDays } from '../_fixtures/activities'
import {
  expectNoPageOverflow,
  prepareForAccessibilityScan,
  scanBlockingViolations,
  type BlockingViolation,
} from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup, roster, signedInStaff } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// TEST-L22 (people life-cycle spec REQ-L15, J-L09 steps 1–2, 5–6, AC-L15; #383): the coordinator of the academy opens
// the roster of Kids on the panel, selects one child and chooses "Move to another group"; in the dialog she picks
// Skrzaty (ages 6–7), the chip "Fits Skrzaty (6–7 years)" ticks exactly the children who are 6 or 7 on the move day,
// she unticks one, ticks an older child who is ready, sees the preview and moves two; the success notice offers Undo,
// which puts both groups back. On the phone roster (375 px) the same move runs in a full-screen sheet with nothing
// ticked at first (the button disabled with a hint). The dialog and the sheet are axe clean in en and pl, light and
// dark, without sideways scroll at 375 px.
test.describe.configure({ timeout: 600_000 })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

function row(page: Page, name: string): Locator {
  return page.getByRole('row').filter({ hasText: name })
}

function child(dialog: Locator, name: string): Locator {
  return dialog.locator('li').filter({ hasText: name }).getByRole('checkbox')
}

async function chooseTarget(dialog: Locator, page: Page): Promise<void> {
  await dialog.getByPlaceholder(uiText('groups.memberships.move.group.search')).fill('Skrz')
  await page.getByRole('option', { name: /Skrzaty/ }).click()
}

const FITS = uiText('groups.memberships.moveMany.fits.range', { params: { group: 'Skrzaty', from: 6, to: 7 } })

test('TEST-L22 several children move to another group from the roster and the phone, preselected by age, undone from the notice', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-l22')
  try {
    const admin = club.adminToken
    const since = calendarDate(-30)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const kids = await createGroup(request, admin, { sectionId: academy, name: 'Kids', kind: 'team' })
    const skrzaty = await createGroup(request, admin, {
      sectionId: academy,
      name: 'Skrzaty',
      kind: 'team',
      ageFrom: 6,
      ageTo: 7,
    })
    // Ages on the move day (the 1st of the next month): Ala 6, Bartek 7, Celina 5, Dawid 9.
    const children = {
      Ala: await createPerson(request, admin, {
        firstName: 'Ala',
        lastName: 'Mała',
        birthDate: birthDateTurning(6, -1),
      }),
      Bartek: await createPerson(request, admin, {
        firstName: 'Bartek',
        lastName: 'Mały',
        birthDate: birthDateTurning(7, -1),
      }),
      Celina: await createPerson(request, admin, {
        firstName: 'Celina',
        lastName: 'Mała',
        birthDate: birthDateTurning(5, -1),
      }),
      Dawid: await createPerson(request, admin, {
        firstName: 'Dawid',
        lastName: 'Duży',
        birthDate: birthDateTurning(9, -1),
      }),
    }
    for (const personId of Object.values(children)) {
      await addMembership(request, admin, { groupId: kids, personId, role: 'participant', validFrom: since })
    }
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Ewa',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: academy,
    })
    const movedOn = async () =>
      (await roster(request, admin, skrzaty)).items
        .filter((item) => item.validTo === null)
        .map((item) => item.personId)
        .sort()

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    const violations: Record<string, BlockingViolation[]> = {}
    const href = `/backend/groups/groups/${kids}?tab=roster&status=active`

    /** Selects Ala on the roster, opens the bulk move, picks Skrzaty and applies the age chip. */
    const openPanelDialog = async (): Promise<Locator> => {
      await page.goto(href)
      await expect(page.getByTestId('roster-move-many-hint')).toBeVisible()
      await row(page, 'Ala Mała').getByRole('checkbox').check()
      await page.getByRole('button', { name: uiText('groups.memberships.moveMany.action', { exact: true }) }).click()
      const dialog = page.getByTestId('groups-move-many-dialog')
      await expect(dialog).toBeVisible()
      await expect(child(dialog, 'Ala Mała')).toBeChecked()
      await expect(child(dialog, 'Bartek Mały')).not.toBeChecked()
      await chooseTarget(dialog, page)
      await dialog.getByRole('button', { name: FITS }).click()
      await expect(child(dialog, 'Bartek Mały')).toBeChecked()
      return dialog
    }

    // --- The panel, desktop: both locales, light and dark ------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 900 })
    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        const dialog = await openPanelDialog()
        await expect(dialog.getByTestId('groups-move-many-summary')).toBeVisible()
        // The AppShell sidebar headings are a platform baseline (`_fixtures/axe.ts`), not this dialog's markup.
        const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
        if (found.length > 0) violations[`panel dialog (${locale}, ${colorScheme})`] = found
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
      }
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.context().addCookies([{ name: 'locale', value: 'en', url: BASE_URL }])

    // J-L09 step 2: the chip ticked Ala and Bartek (6 and 7 on the day), not Celina (5) or Dawid (9); Bartek stays a
    // year longer, Dawid is ready — two moves.
    const dialog = await openPanelDialog()
    await expect(child(dialog, 'Ala Mała')).toBeChecked()
    await expect(child(dialog, 'Celina Mała')).not.toBeChecked()
    await expect(child(dialog, 'Dawid Duży')).not.toBeChecked()
    await child(dialog, 'Bartek Mały').uncheck()
    await child(dialog, 'Dawid Duży').check()
    await expect(dialog.getByRole('button', { name: FITS })).toHaveAttribute('aria-pressed', 'false')
    const submit = dialog.getByTestId('groups-move-many-save')
    await expect(submit).toHaveText(uiText('groups.memberships.moveMany.submit', { params: { count: 2 } }))
    await submit.click()
    await expect(dialog).toBeHidden()
    const notice = page.getByTestId('groups-move-many-notice')
    await expect(notice).toContainText(
      uiText('groups.memberships.moveMany.moved', { params: { moved: 2, skipped: 0 } }),
    )
    await expect.poll(movedOn).toEqual([children.Ala, children.Dawid].sort())

    // J-L09 step 5: Undo on the notice puts both groups back.
    await notice.getByTestId('groups-move-many-undo').click()
    await expect(notice).toBeHidden()
    await expect.poll(movedOn).toEqual([])
    const kidsRows = (await roster(request, admin, kids)).items
    for (const personId of Object.values(children)) {
      expect(kidsRows.find((item) => item.personId === personId)?.validTo ?? null).toBeNull()
    }

    // --- The phone roster, 375 px: the same move in a full-screen sheet --------------------------------------------
    await page.setViewportSize({ width: 375, height: 812 })
    const openSheet = async (): Promise<Locator> => {
      await page.goto(`/club/groups/${kids}`)
      await page.getByTestId('club-roster-move-many').click()
      const sheet = page.getByTestId('groups-move-many-dialog')
      await expect(sheet).toBeVisible()
      // Nothing ticked yet: the button is disabled and the hint says why.
      await expect(sheet.getByTestId('groups-move-many-hint')).toHaveText(
        uiText('groups.memberships.moveMany.nothingSelected', { exact: true }),
      )
      await expect(sheet.getByTestId('groups-move-many-save')).toBeDisabled()
      await chooseTarget(sheet, page)
      await sheet.getByRole('button', { name: FITS }).click()
      await expect(child(sheet, 'Ala Mała')).toBeChecked()
      await expect(child(sheet, 'Bartek Mały')).toBeChecked()
      return sheet
    }
    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        const sheet = await openSheet()
        await expect(sheet.getByTestId('groups-move-many-summary')).toBeVisible()
        await expectNoPageOverflow(page)
        const found = await scanBlockingViolations(page, testInfo)
        if (found.length > 0) violations[`phone sheet (${locale}, ${colorScheme})`] = found
        await page.keyboard.press('Escape')
        await expect(sheet).toBeHidden()
      }
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.context().addCookies([{ name: 'locale', value: 'pl', url: BASE_URL }])
    const sheet = await openSheet()
    await child(sheet, 'Bartek Mały').uncheck()
    const save = sheet.getByTestId('groups-move-many-save')
    await expect(save).toHaveText(uiText('groups.memberships.moveMany.submit', { params: { count: 1 } }))
    await expect(save).toBeInViewport()
    await save.click()
    await expect(sheet).toBeHidden()
    const phoneNotice = page.getByTestId('groups-move-many-notice')
    await expect(phoneNotice).toBeVisible()
    await expect.poll(movedOn).toEqual([children.Ala])
    const moveDay = (await roster(request, admin, skrzaty)).items.find((item) => item.personId === children.Ala)
    expect(moveDay?.validFrom ?? '').toMatch(/^\d{4}-\d{2}-01$/)
    expect((moveDay?.validFrom ?? '') > calendarDate()).toBe(true)
    expect(addDays(String(moveDay?.validFrom), -1) >= since).toBe(true)
    await phoneNotice.getByTestId('groups-move-many-undo').click()
    await expect(phoneNotice).toBeHidden()
    await expect.poll(movedOn).toEqual([])

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
