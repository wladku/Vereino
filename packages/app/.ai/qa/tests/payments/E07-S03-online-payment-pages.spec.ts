import { expect, test, type Page } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson, createStaff } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'
import { createFee, gatewayWebhook, generate, getCharge, periodFromNow } from '../_fixtures/payments'

// E07-S03 pages (issue #110; UX concept README M-08, M-09, flow F-07) on a phone (375 px) with the gateway test
// adapter: the "Payments" tile leads to M-08; the guardian's four charges are selectable, the two charges of a ward
// without a payer are disabled with "No payer — contact the club". Three selected charges show the total, "Pay" opens
// the gateway's embedded form, confirming it goes to M-09, which shows "Payment in progress" until the webhook lands
// and then "Payment received" by itself; the charges are paid. A payment cancelled at the provider shows "Payment
// interrupted — the charges are still open". No new critical or serious axe violation outside the platform baseline
// on M-08 and M-09 in light and dark mode, and no overflow.
test.describe.configure({ timeout: 300_000 })

const IN_PROGRESS = /Payment in progress|Płatność w toku/
const RECEIVED = /Payment received|Płatność przyjęta/
const INTERRUPTED = /Payment interrupted — the charges are still open|Płatność przerwana — należności są nadal otwarte/
const NO_PAYER = /No payer — contact the club|Brak płatnika — skontaktuj się z klubem/

/** Pays the selected charges through the test form; returns the gateway session id of the checkout. */
async function payThroughTestForm(page: Page): Promise<string> {
  const started = page.waitForResponse(
    (response) => response.url().endsWith('/api/payments/checkout') && response.request().method() === 'POST',
  )
  await page.getByTestId('club-payments-pay').click()
  const body = (await (await started).json()) as { clientSession?: { payload?: { sessionId?: string } } }
  await expect(page.getByTestId('test-gateway-form')).toBeVisible()
  await page.getByTestId('test-gateway-form').getByRole('button').click()
  await expect(page).toHaveURL(/\/club\/payments\/return\?checkout=/)
  return String(body.clientSession?.payload?.sessionId)
}

test('E07-S03 M-08 selection and payment, M-09 in progress, received and interrupted', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e07-s03-pages')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Zielińska',
      birthDate: birthDateTurning(37),
    })
    for (const [firstName, primary] of [
      ['Ola', true],
      ['Jaś', true],
      ['Tomek', false],
    ] as const) {
      const ward = await createPerson(request, admin, {
        firstName,
        lastName: 'Zielińska',
        birthDate: birthDateTurning(9),
      })
      await createGuardianship(request, admin, {
        guardianPersonId: kasia.personId,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: primary,
        validFrom: calendarDate(-62),
      })
      await addMembership(request, admin, {
        groupId: zaki,
        personId: ward,
        role: 'participant',
        validFrom: calendarDate(-62),
      })
    }
    await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: calendarDate(-62),
    })
    for (const period of [periodFromNow(-1), periodFromNow(0)]) {
      expect((await generate(request, admin, period)).body).toMatchObject({ created: 3, payerMissing: 1 })
    }

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    const scan = async (label: string, ready: () => Promise<void>) => {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.reload()
        await ready()
        const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
        if (found.length > 0) violations[`${label} (${colorScheme})`] = found
      }
      await expectNoPageOverflow(page)
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    }

    await signInBrowser(page, request, club, kasia.userId, kasia.email)
    await page.goto('/club')
    await page.getByTestId('club-tile-payments').click()
    await expect(page).toHaveURL(/\/club\/payments$/)

    // M-08: four payable charges, two without a payer disabled with the hint.
    const rows = page.getByTestId('club-charge')
    await expect(rows).toHaveCount(6)
    const payable = page.locator('[data-testid="club-charge"][data-payable="true"]')
    const blocked = page.locator('[data-testid="club-charge"][data-payable="false"]')
    await expect(payable).toHaveCount(4)
    await expect(blocked).toHaveCount(2)
    for (const index of [0, 1]) {
      await expect(blocked.nth(index).getByRole('checkbox')).toBeDisabled()
      await expect(blocked.nth(index).getByTestId('club-charge-hint')).toHaveText(NO_PAYER)
    }
    await scan('/club/payments', async () => {
      await expect(page.getByTestId('club-charge').first()).toBeVisible()
    })

    // Three charges selected: the total, then the embedded form, then M-09.
    const chargeIds: string[] = []
    for (const index of [0, 1, 2]) {
      const row = payable.nth(index)
      chargeIds.push(String(await row.getAttribute('data-charge-id')))
      await row.getByRole('checkbox').check()
    }
    await expect(page.getByTestId('club-payments-quote-total')).toHaveText('450 zł')
    await expect(page.getByTestId('club-payments-quote-fee')).toHaveCount(0)
    const sessionId = await payThroughTestForm(page)

    // The webhook is delayed: "in progress"; when it lands the page switches to "received" by itself.
    const result = page.getByTestId('club-payment-return')
    await expect(result).toHaveAttribute('data-state', 'in_progress')
    await expect(result).toContainText(IN_PROGRESS)
    await gatewayWebhook(request, { sessionId, status: 'captured', amountReceived: 450 })
    await expect(result).toHaveAttribute('data-state', 'received', { timeout: 25_000 })
    await expect(result).toContainText(RECEIVED)
    for (const chargeId of chargeIds) expect((await getCharge(request, admin, chargeId)).status).toBe('paid')
    await scan('/club/payments/return (received)', async () => {
      await expect(page.getByTestId('club-payment-return')).toHaveAttribute('data-state', 'received')
    })

    // The last payable charge, cancelled at the provider: "interrupted", and it stays open and selectable.
    await page.goto('/club/payments')
    await expect(page.getByTestId('club-charge-paid')).toHaveCount(3)
    await expect(payable).toHaveCount(1)
    const lastId = String(await payable.first().getAttribute('data-charge-id'))
    await payable.first().getByRole('checkbox').check()
    await expect(page.getByTestId('club-payments-quote-total')).toHaveText('150 zł')
    const cancelledSession = await payThroughTestForm(page)
    await gatewayWebhook(request, { sessionId: cancelledSession, status: 'cancelled' })
    await expect(result).toHaveAttribute('data-state', 'interrupted', { timeout: 25_000 })
    await expect(result).toContainText(INTERRUPTED)
    expect((await getCharge(request, admin, lastId)).status).toBe('open')
    await scan('/club/payments/return (interrupted)', async () => {
      await expect(page.getByTestId('club-payment-return')).toHaveAttribute('data-state', 'interrupted')
    })

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
