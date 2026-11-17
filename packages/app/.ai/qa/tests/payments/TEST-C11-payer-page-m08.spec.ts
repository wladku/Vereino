import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  type Club,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { uniqueAddress } from '../_fixtures/messaging'
import { postCampaign } from '../_fixtures/orders'
import { createGuardianship } from '../_fixtures/people'
import {
  checkout,
  createDiscountRule,
  createFee,
  gatewayWebhook,
  generate,
  getCharge,
  listCharges,
  myCharges,
  myPaymentsSummary,
  periodFromNow,
  quote,
  recordPayment,
  startCheckout,
  type ChargeItem,
} from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-C11 (payments parity spec phase 8, REQ-C10, DD-C06, DD-C07, AC-C10; issue #298 E12-S08), at 375 px in both
// colour schemes. Kasia is the primary payer of Ola and Jaś (Żaki, a sibling discount); Basia is Jaś's second guardian
// and not his payer. Last month Ola's fee is partly paid in cash and Jaś's is paid.
// - M-08 for Kasia: every payable charge is ticked on entry, the partially paid one too, and the button shows the total
//   of what remains; the discount names its rule; the fee line reads "0 zł — paid by the club", then the fee amount in
//   `payer_pays`; the open kit campaign is announced ("order for your child"); unticking updates the summary;
//   `?pay={id}` ticks one charge only.
// - A paid charge in a checkout answers 409 `charge_not_open`.
// - Paying the partially paid charge from M-08 against the test adapter, with a cash payment recorded between the
//   checkout and the capture: the remainder is paid and the share above it becomes an overpayment "to refund".
// - A checkout of a partially paid charge and an open one charges the sum of the remainders; the capture books the
//   partially paid charge for its remainder only, with no overpayment.
// - Basia: M-08 and the Today tile read "Jaś: paid by Kasia"; the API response holds no charge and no amount of Jaś.
test.describe.configure({ timeout: 420_000 })

const RULE = 'Rodzeństwo 30%'
const FEE_CLUB = uiText('payments.club.quote.feeClub', { exact: true, params: { amount: '0 zł' } })
const ORDER_FOR_CHILD = uiText('payments.club.campaign.orderForChild')
const JAS_PAID_BY_KASIA = uiText('payments.club.otherPayer', { exact: true, params: { child: 'Jaś', name: 'Kasia' } })
const TILE_PAID_BY_KASIA = uiText('payments.club.tile.otherPays', {
  exact: true,
  params: { child: 'Jaś', name: 'Kasia' },
})

function zloty(grosz: number): string {
  const whole = String(Math.floor(grosz / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${whole}${grosz % 100 === 0 ? '' : ',' + String(grosz % 100).padStart(2, '0')} zł`
}

async function account(request: Parameters<typeof createAccount>[0], club: Club, personId: string, email: string) {
  const created = await createAccount(request, club.adminToken, personId, email)
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  const userId = String(created.body?.userId)
  club.extraUserIds.push(userId)
  return userId
}

async function setFeeMode(request: Parameters<typeof call>[0], admin: string, data: Record<string, unknown>) {
  const settings = await call<{ updatedAt?: string }>(request, 'GET', '/api/club_core/settings', admin)
  const saved = await call(request, 'PUT', '/api/club_core/settings', admin, {
    data,
    headers: settings.body?.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: settings.body.updatedAt } : {},
  })
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
}

function checkbox(page: Page, chargeId: string) {
  return page.locator(`[data-testid="club-charge"][data-charge-id="${chargeId}"]`).getByRole('checkbox')
}

test('TEST-C11 M-08 ticks everything, pays what remains, names the rule and who pays a ward', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-c11')
  try {
    const admin = club.adminToken
    const since = calendarDate(-62)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const kasiaEmail = uniqueAddress('kasia-c11')
    const kasia = await createPerson(request, admin, {
      firstName: 'Kasia',
      lastName: 'Nowak',
      birthDate: birthDateTurning(38),
      email: kasiaEmail,
    })
    const basiaEmail = uniqueAddress('basia-c11')
    const basia = await createPerson(request, admin, {
      firstName: 'Basia',
      lastName: 'Nowak',
      birthDate: birthDateTurning(40),
      email: basiaEmail,
    })
    const ola = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Nowak',
      birthDate: birthDateTurning(10),
    })
    const jas = await createPerson(request, admin, {
      firstName: 'Jaś',
      lastName: 'Nowak',
      birthDate: birthDateTurning(8),
    })
    for (const [guardian, ward, isPrimaryPayer] of [
      [kasia, ola, true],
      [kasia, jas, true],
      [basia, jas, false],
    ] as const) {
      await createGuardianship(request, admin, {
        guardianPersonId: guardian,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer,
        validFrom: since,
      })
    }
    for (const ward of [ola, jas]) {
      await addMembership(request, admin, { groupId: zaki, personId: ward, role: 'participant', validFrom: since })
    }
    const kasiaUserId = await account(request, club, kasia, kasiaEmail)
    const basiaUserId = await account(request, club, basia, basiaEmail)
    await createDiscountRule(request, admin, { name: RULE, kind: 'sibling', percent: 30, validFrom: since })
    await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: since,
    })
    for (const period of [periodFromNow(-1), periodFromNow(0)]) {
      expect((await generate(request, admin, period)).body).toMatchObject({ created: 2, payerMissing: 0 })
    }
    const campaign = await postCampaign(request, admin, {
      name: 'Strój akademii 2026/27',
      sectionId: academy,
      groupIds: [zaki],
      closesOn: calendarDate(14),
      paymentDueOn: calendarDate(21),
      open: true,
      products: [{ key: 'socks', name: 'Getry', priceChild: 1500 }],
    })
    expect(campaign.status, JSON.stringify(campaign.body)).toBe(201)

    const charges = await listCharges(request, admin, '')
    const of = (personId: string, period: string) =>
      charges.find((charge) => charge.personId === personId && charge.periodLabel === period) as ChargeItem
    const [olaLast, jasLast] = [of(ola, periodFromNow(-1)), of(jas, periodFromNow(-1))]
    const [olaNow, jasNow] = [of(ola, periodFromNow(0)), of(jas, periodFromNow(0))]
    const discounted = [olaNow, jasNow].find((charge) => charge.discountAmount > 0) as ChargeItem
    expect(discounted, JSON.stringify(charges)).toBeTruthy()
    const cash = async (chargeId: string, amount: number) => {
      const paid = await recordPayment(
        request,
        admin,
        chargeId,
        (await getCharge(request, admin, chargeId)).updatedAt,
        {
          amount,
          method: 'cash',
          paidOn: calendarDate(),
        },
      )
      expect(paid.status, JSON.stringify(paid.body)).toBe(201)
    }
    // Ola's last month: 100 zł in cash, 50 zł remain (partially paid); Jaś's last month: paid.
    await cash(olaLast.id, 10000)
    await cash(jasLast.id, jasLast.amountDue)
    const toPay = [olaLast, olaNow, jasNow]
    const remainingTotal = 5000 + olaNow.amountDue + jasNow.amountDue

    // --- Kasia on M-08 at 375 px ---
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const kasiaPassword = await signInBrowser(page, request, club, kasiaUserId, kasiaEmail)
    const kasiaToken = await getAuthToken(request, kasiaEmail, kasiaPassword)

    // The reads: the partially paid charge is payable, the discount names its rule, nobody else pays.
    const mine = await myCharges(request, kasiaToken)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    const listed = new Map((mine.body?.items ?? []).map((item) => [item.id, item]))
    expect(listed.get(olaLast.id)).toMatchObject({ status: 'partially_paid', payable: true, remaining: 5000 })
    expect(listed.get(discounted.id)).toMatchObject({ payable: true, discountName: RULE })
    expect(mine.body?.otherPayers).toEqual([])
    expect(
      (
        await quote(
          request,
          kasiaToken,
          toPay.map((charge) => charge.id),
        )
      ).body,
    ).toMatchObject({
      amount: remainingTotal,
      feeAmount: 0,
      total: remainingTotal,
    })

    // A paid charge in a checkout: 409 `charge_not_open` (negative case).
    const paidCharge = await startCheckout(request, kasiaToken, [jasLast.id, olaNow.id])
    expect(paidCharge.status, JSON.stringify(paidCharge.body)).toBe(409)
    expect(paidCharge.body?.code).toBe('charge_not_open')

    const violations: Record<string, unknown> = {}
    const pageReady = async () => {
      for (const charge of toPay) await expect(checkbox(page, charge.id)).toBeChecked()
      await expect(page.getByTestId('club-payments-quote-total')).toHaveText(zloty(remainingTotal))
    }
    await page.goto('/club/payments')
    await pageReady()
    await expect(page.getByTestId('club-payments-pay')).toHaveText(
      uiText('payments.club.pay', { exact: true, params: { total: zloty(remainingTotal) } }),
    )
    await expect(page.getByTestId('club-payments-quote-fee')).toHaveText(FEE_CLUB)
    await expect(page.getByTestId('club-payments-summary')).toHaveAttribute('aria-live', 'polite')
    await expect(page.locator(`[data-charge-id="${discounted.id}"]`).getByTestId('club-charge-discount')).toContainText(
      RULE,
    )
    await expect(page.getByTestId('club-payments-campaign')).toContainText(ORDER_FOR_CHILD)
    await expect(page.getByTestId('club-other-payer')).toHaveCount(0)
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.reload()
      await pageReady()
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (found.length > 0) violations[`/club/payments (${colorScheme})`] = found
    }
    await expectNoPageOverflow(page)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // Unticking updates the summary and the button.
    await checkbox(page, jasNow.id).uncheck()
    await expect(page.getByTestId('club-payments-quote-total')).toHaveText(zloty(remainingTotal - jasNow.amountDue))
    await expect(page.getByTestId('club-payments-pay')).toContainText(zloty(remainingTotal - jasNow.amountDue))

    // `?pay={id}` ticks that charge only.
    await page.goto(`/club/payments?pay=${olaNow.id}`)
    await expect(checkbox(page, olaNow.id)).toBeChecked()
    await expect(checkbox(page, olaLast.id)).not.toBeChecked()
    await expect(checkbox(page, jasNow.id)).not.toBeChecked()
    await expect(page.getByTestId('club-payments-quote-total')).toHaveText(zloty(olaNow.amountDue))

    // `payer_pays`: the fee line shows the amount.
    await setFeeMode(request, admin, { onlineFeeMode: 'payer_pays', onlineFeePercent: 1.5, onlineFeeFixed: 100 })
    await page.goto(`/club/payments?pay=${olaLast.id}`)
    const fee = page.getByTestId('club-payments-quote-fee')
    await expect(fee).toHaveAttribute('data-fee-mode', 'payer_pays')
    // 1.5 % of 50 zł plus 1 zł.
    await expect(fee).toHaveText(zloty(175))
    await expect(page.getByTestId('club-payments-quote-total')).toHaveText(zloty(5175))

    // Pay the partially paid charge from M-08 against the test adapter; 20 zł in cash lands before the capture.
    const started = page.waitForResponse(
      (response) => response.url().endsWith('/api/payments/checkout') && response.request().method() === 'POST',
    )
    await page.getByTestId('club-payments-pay').click()
    const body = (await (await started).json()) as {
      amount?: number
      total?: number
      clientSession?: { payload?: { sessionId?: string } }
    }
    expect(body).toMatchObject({ amount: 5000, total: 5175 })
    await expect(page.getByTestId('test-gateway-form')).toBeVisible()
    await page.getByTestId('test-gateway-form').getByRole('button').click()
    await expect(page).toHaveURL(/\/club\/payments\/return\?checkout=/)
    await cash(olaLast.id, 2000)
    await gatewayWebhook(request, {
      sessionId: String(body.clientSession?.payload?.sessionId),
      status: 'captured',
      amountReceived: 51.75,
    })
    await expect
      .poll(async () => (await getCharge(request, admin, olaLast.id)).payments.filter((p) => p.method === 'online'), {
        timeout: 25_000,
      })
      .toHaveLength(2)
    const settled = await getCharge(request, admin, olaLast.id)
    expect(settled).toMatchObject({ status: 'paid', remaining: 0 })
    const online = settled.payments.filter((payment) => payment.method === 'online')
    expect(online.map((payment) => [payment.amount, payment.overpayment]).sort()).toEqual([
      [2000, true],
      [3000, false],
    ])

    // --- Basia, Jaś's second guardian, who does not pay (Jaś still has an open charge) ---
    const basiaPassword = await signInBrowser(page, request, club, basiaUserId, basiaEmail)
    const basiaToken = await getAuthToken(request, basiaEmail, basiaPassword)
    const hers = await myCharges(request, basiaToken)
    expect(hers.status, JSON.stringify(hers.body)).toBe(200)
    expect(hers.body?.otherPayers).toEqual([{ wardFirstName: 'Jaś', payerFirstName: 'Kasia' }])
    expect(hers.body?.items).toEqual([])
    expect(hers.body?.history).toEqual([])
    // No amount of Jaś's charges anywhere in the response (negative case).
    for (const amount of [jasNow.amountDue, jasLast.amountDue]) {
      expect(JSON.stringify(hers.body)).not.toContain(String(amount))
    }
    expect((await myPaymentsSummary(request, basiaToken)).body).toEqual({
      state: 'other_pays',
      payerFirstName: 'Kasia',
      otherPayers: [{ wardFirstName: 'Jaś', payerFirstName: 'Kasia' }],
    })
    await page.goto('/club/payments')
    await expect(page.getByTestId('club-other-payer')).toHaveText(JAS_PAID_BY_KASIA)
    await expect(page.getByTestId('club-charge')).toHaveCount(0)
    await expect(page.getByTestId('club-payments-empty')).toHaveCount(0)
    await expect(page.getByTestId('club-payments-pay')).toHaveCount(0)
    await page.goto('/club')
    await expect(page.getByTestId('club-tile-payments-state')).toHaveAttribute('data-state', 'other_pays')
    await expect(page.getByTestId('club-tile-payments-state')).toHaveText(TILE_PAID_BY_KASIA)

    // A checkout of a partially paid charge and an open one: the sum of the remainders, no overpayment at capture.
    await setFeeMode(request, admin, { onlineFeeMode: 'club_pays' })
    await cash(olaNow.id, 5000)
    const remainder = olaNow.amountDue - 5000
    const paying = await checkout(request, kasiaToken, [olaNow.id, jasNow.id])
    expect(paying.body).toMatchObject({ amount: remainder + jasNow.amountDue, total: remainder + jasNow.amountDue })
    await gatewayWebhook(request, {
      sessionId: paying.sessionId,
      status: 'captured',
      amountReceived: (remainder + jasNow.amountDue) / 100,
    })
    await expect.poll(async () => (await getCharge(request, admin, olaNow.id)).status, { timeout: 25_000 }).toBe('paid')
    const olaPaid = await getCharge(request, admin, olaNow.id)
    expect(olaPaid.payments.filter((payment) => payment.method === 'online')).toEqual([
      expect.objectContaining({ amount: remainder, overpayment: false }),
    ])
    expect((await getCharge(request, admin, jasNow.id)).status).toBe('paid')

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
