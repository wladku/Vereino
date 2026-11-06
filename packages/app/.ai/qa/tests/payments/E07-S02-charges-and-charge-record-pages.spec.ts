import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'
import { chargeOf, createFee, generate, getCharge, listCharges, periodFromNow } from '../_fixtures/payments'

// E07-S02 pages (issue #109; UX concept README B-21, B-22): the B-21 perspectives (Membership fees by default, Overdue
// lists only charges still to pay past their due date), the B-22 record of a PLN 150 charge — PLN 100 in cash shows
// "Recorded — charge partially paid" and PLN 50 remaining, PLN 50 by transfer shows "Charge paid" — the cash payment
// reversed with a reason, and another charge cancelled with a required reason. No new critical or serious axe
// violation outside the platform baseline and no overflow on either page; 375 px in dark mode.
test.describe.configure({ timeout: 300_000 })

const PARTIAL_TOAST = /Recorded — charge partially paid|Zaksięgowano — należność częściowo opłacona/
const PAID_TOAST = /Charge paid|Należność opłacona/

test('E07-S02 charges by perspective, record payment, reverse and cancel with a reason', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e07-s02-pages')
  try {
    const admin = club.adminToken
    const past = periodFromNow(-1)
    const next = periodFromNow(1)
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
    await createGuardianship(request, admin, {
      guardianPersonId: anna,
      wardPersonId: ola,
      relation: 'parent',
      isPrimaryPayer: true,
      validFrom: calendarDate(-62),
    })
    await addMembership(request, admin, {
      groupId: zaki,
      personId: ola,
      role: 'participant',
      validFrom: calendarDate(-62),
    })
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: calendarDate(-62),
    })
    expect((await generate(request, admin, past)).status).toBe(200)
    expect((await generate(request, admin, next)).status).toBe(200)
    const pastCharge = chargeOf(await listCharges(request, admin, `&period=${past}`), ola, fee)
    const nextCharge = chargeOf(await listCharges(request, admin, `&period=${next}`), ola, fee)

    page.setDefaultTimeout(30_000)
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)

    // B-21: Membership fees by default; Overdue lists only the past charge, with its marker.
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/backend/payments/charges')
    await expect(page.getByRole('tab', { name: /^Membership fees$|^Składki$/ })).toHaveAttribute('data-state', 'active')
    await expect(page.getByTestId('charge-open')).toHaveCount(2)
    await page.getByRole('tab', { name: /^Overdue$|^Zaległe$/ }).click()
    await expect(page.getByTestId('charge-open')).toHaveCount(1)
    await expect(page.getByTestId('charge-overdue')).toHaveCount(1)
    const listViolations = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
    expect(listViolations).toEqual([])
    await expectNoPageOverflow(page)

    // B-22: PLN 100 in cash, then PLN 50 by transfer.
    await page.getByTestId('charge-open').click()
    await expect(page).toHaveURL(new RegExp(`/backend/payments/charges/${pastCharge.id}$`))
    await expect(page.getByTestId('charge-title')).toHaveText('Żaki')
    await expect(page.getByTestId('charge-payments-empty')).toBeVisible()
    const recordViolations = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
    expect(recordViolations).toEqual([])
    await expectNoPageOverflow(page)

    await page.getByTestId('record-payment-open').click()
    await page.getByTestId('record-payment-amount').fill('100')
    await page.getByTestId('record-payment-reference').fill('KP 7')
    await page.getByTestId('record-payment-confirm').click()
    await expect(page.getByText(PARTIAL_TOAST).first()).toBeVisible()
    await expect(page.getByTestId('charge-remaining')).toContainText('50')
    await expect(page.getByTestId('charge-payment-row')).toHaveCount(1)

    // More than remains → the 422 message stays in the dialog.
    await page.getByTestId('record-payment-open').click()
    await page.getByTestId('record-payment-amount').fill('60')
    await page.getByTestId('record-payment-confirm').click()
    await expect(page.getByTestId('record-payment-problem')).toContainText(/50 zł/)
    await page.getByTestId('record-payment-amount').fill('50')
    await page.getByTestId('record-payment-method-transfer').click()
    await page.getByTestId('record-payment-confirm').click()
    await expect(page.getByText(PAID_TOAST).first()).toBeVisible()
    await expect(page.getByTestId('charge-payment-row')).toHaveCount(2)
    await expect(page.getByTestId('record-payment-open')).toHaveCount(0)

    // Reverse the cash payment with a reason (375 px, dark mode).
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.getByTestId('reverse-payment-open').first().click()
    await page.getByTestId('reverse-payment-confirm').click()
    await expect(page.getByTestId('reverse-payment-problem')).toBeVisible()
    await page.getByTestId('reverse-payment-reason').fill('Pomyłka w kwocie')
    await page.getByTestId('reverse-payment-confirm').click()
    await expect(page.getByTestId('charge-payment-row')).toHaveCount(3)
    await expect(page.getByTestId('record-payment-open')).toBeVisible()
    await expectNoPageOverflow(page)
    expect(await getCharge(request, club.adminToken, pastCharge.id)).toMatchObject({
      status: 'partially_paid',
      remaining: 10000,
    })

    // Cancel the next month's open charge with a required reason.
    await page.goto(`/backend/payments/charges/${nextCharge.id}`)
    await page.getByTestId('cancel-charge-open').click()
    await page.getByTestId('cancel-charge-confirm').click()
    await expect(page.getByTestId('cancel-charge-problem')).toBeVisible()
    await page.getByTestId('cancel-charge-reason').fill('Rezygnacja')
    await page.getByTestId('cancel-charge-confirm').click()
    await expect(page.getByTestId('charge-cancel-reason')).toContainText('Rezygnacja')
    await expect(page.getByTestId('cancel-charge-open')).toHaveCount(0)
    await expectNoPageOverflow(page)
  } finally {
    await club.cleanup()
  }
})
