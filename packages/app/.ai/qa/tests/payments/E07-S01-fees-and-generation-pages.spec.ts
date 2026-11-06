import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson, createStaff } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'
import { createDiscountRule, listCharges, periodFromNow } from '../_fixtures/payments'

// E07-S01 pages (issue #108; UX concept README B-20, B-21, flow F-07): the "Fees", "Discounts" and "Coaches and
// payments" tabs of B-20 and B-21 Charges — no new critical or serious axe violation outside the platform baseline
// and no overflow at 320 px; a fee schedule created through the form; "Generate period" creates the month's charges
// and shows the summary "created X, skipped Y, without payer Z", and a second run reports everything as skipped; the
// younger sibling's charge shows the discount with the rule's name and the minor without a payer is flagged; 375 px
// in dark mode; a member without `payments.manage` gets the permission-denied state.
test.describe.configure({ timeout: 300_000 })

test('E07-S01 fees, discounts, coaches and payments, and Generate period with its summary', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e07-s01-pages')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const period = periodFromNow(1)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const anna = await createPerson(request, admin, {
      firstName: 'Anna',
      lastName: 'Nowak',
      birthDate: birthDateTurning(40),
    })
    const ola = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Nowak',
      birthDate: birthDateTurning(10),
    })
    const kuba = await createPerson(request, admin, {
      firstName: 'Kuba',
      lastName: 'Nowak',
      birthDate: birthDateTurning(7),
    })
    const tomek = await createPerson(request, admin, {
      firstName: 'Tomek',
      lastName: 'Bez',
      birthDate: birthDateTurning(9),
    })
    for (const ward of [ola, kuba]) {
      await createGuardianship(request, admin, {
        guardianPersonId: anna,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: today,
      })
    }
    for (const personId of [ola, kuba, tomek]) {
      await addMembership(request, admin, { groupId: zaki, personId, role: 'participant', validFrom: today })
    }
    await createDiscountRule(request, admin, { name: 'Rodzeństwo 30%', kind: 'sibling', percent: 30, validFrom: today })

    page.setDefaultTimeout(30_000)
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)

    await prepareForAccessibilityScan(page)
    const violationsByPage: Record<string, unknown> = {}
    for (const { path, shows } of [
      { path: '/backend/payments/fees', shows: /No fee schedules yet|Nie ma jeszcze cenników/ },
      { path: '/backend/payments/fees/create' },
      { path: '/backend/payments/discounts', shows: 'Rodzeństwo 30%' },
      { path: '/backend/payments/discounts/create' },
      { path: '/backend/payments/settings', shows: /Coaches and payments|Trenerzy i płatności/ },
      { path: '/backend/payments/charges', shows: /No charges|Brak należności/ },
    ]) {
      await page.setViewportSize({ width: 1280, height: 720 })
      await page.goto(path)
      if (shows) await expect(page.getByText(shows).first()).toBeVisible()
      await expect(page.getByText(/Access Denied|Brak dostępu/)).toHaveCount(0)
      const violations = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (violations.length > 0) violationsByPage[path] = violations
      await expectNoPageOverflow(page)
    }
    expect(violationsByPage).toEqual({})

    // A monthly fee of Żaki through the form (PLN 150, payment day 10).
    await page.goto('/backend/payments/fees/create')
    await page.locator('[data-crud-field-id="name"] input').fill('Żaki')
    // The group options load after the form mounts; reopen the select until they are there.
    const groupOption = page.getByRole('option', { name: /^Żaki/ })
    await expect(async () => {
      await page.keyboard.press('Escape')
      await page.locator('[data-crud-field-id="groupId"] [role="combobox"]').click()
      await expect(groupOption).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await groupOption.click()
    await page.locator('[data-crud-field-id="amount"] input').fill('150')
    await page
      .getByRole('button', { name: /^Create$|^Utwórz$/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/payments\/fees$/)
    await expect(page.getByRole('cell', { name: 'Żaki' }).first()).toBeVisible()

    // The tabs of B-20.
    for (const name of [/^Fees$|^Składki$/, /^Discounts$|^Zniżki$/, /Coaches and payments|Trenerzy i płatności/]) {
      await expect(page.getByRole('tab', { name })).toBeVisible()
    }

    // Generate period: the summary, then a repeat reports everything as skipped.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/backend/payments/charges')
    for (const [created, skipped] of [
      [3, 0],
      [0, 3],
    ]) {
      await page.getByTestId('generate-period-open').click()
      await page.getByTestId('generate-period-input').fill(period)
      await page.getByTestId('generate-period-confirm').click()
      await expect(page.getByTestId('generation-summary')).toContainText(
        new RegExp(`${period}: (created|utworzono) ${String(created)}, (skipped|pominięto) ${String(skipped)}`),
      )
    }
    await expect(page.getByTestId('generation-summary')).toContainText(/(without payer|bez płatnika) 0/)
    await expect(page.getByText('Rodzeństwo 30%').first()).toBeVisible()
    await expect(page.getByTestId('charge-payer-missing')).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    const charges = await listCharges(request, club.adminToken, `&period=${period}`)
    expect(charges).toHaveLength(3)
    expect(charges.filter((charge) => charge.discountAmount > 0).map((charge) => charge.personId)).toEqual([kuba])

    // A member without payments.manage gets the permission-denied state.
    const member = await createStaff(request, club, {
      firstName: 'Michal',
      lastName: 'Czlonek',
      birthDate: birthDateTurning(30),
    })
    await page.context().clearCookies()
    await signInBrowser(page, request, club, member.userId, member.email)
    for (const path of ['/backend/payments/fees', '/backend/payments/charges']) {
      await page.goto(path)
      await expect(page.getByText(/Access Denied|Brak dostępu/)).toBeVisible()
    }
  } finally {
    await club.cleanup()
  }
})
