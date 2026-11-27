import { expect, test } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { expectNoPageOverflow } from '../_fixtures/axe'
import {
  actionLogs,
  birthDateTurning,
  calendarDate,
  createClub,
  createPerson,
  createStaff,
  signInAs,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { setUserFeatures } from '../_fixtures/members'
import { getCampaign, postCampaign, seedOrder } from '../_fixtures/orders'
import {
  bankDecide,
  bankTransfers,
  checkout,
  createFee,
  gatewayWebhook,
  generate,
  getCharge,
  importStatement,
  listCharges,
  myCharges,
  paymentsDashboard,
  paymentsDashboardCounts,
  periodFromNow,
  recordPayment,
} from '../_fixtures/payments'
import { createGuardianship } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// TEST-C10 and the dashboard part of TEST-C04 (payments parity spec phase 7, REQ-C09, REQ-C02, AC-C09; issue #297
// E12-S07; mockup `screenDashboard`, `kitDashboardWidget`). Last month's fee of Żaki is overdue for Zuzia (Basia pays),
// Kuba (Ela pays) and Tomek (no guardian, so no payer); Ola's is paid in cash and then online, so its online share is
// an overpayment "to refund". Two unmatched transfers wait on the statement. Two campaigns collect orders (one with
// Zuzia's order), a third is a draft.
// - The read: "Overdue" 3 charges, 2 families, 1 without a payer; "Charges without a payer" lists Tomek's charge;
//   `toRefund.count` 1; `bank.toDecide` 2; the two running campaigns with orders, children, paid and value.
//   `?only=counts` returns exactly `bank.toDecide` and `campaignsRunning`, equal to the full read; another club's
//   transfer is not counted; an unknown `only` answers 400.
// - A club administrator without `payments.bank.import` and `payments.orders.manage` gets neither block, and the
//   dashboard shows neither "Bank statements and cash" nor "Order campaigns".
// - B-01: each widget with its lines and links; "Accept cash" opens the shared dialog and records Ela's cash with
//   `origin = dashboard`, and "Overdue" refreshes; once the transfers are skipped, "All imported transfers are settled".
test.describe.configure({ timeout: 360_000 })

const FEE = 15000

test('TEST-C10 the administrator dashboard: bank and cash, order campaigns, overdue and charges without a payer', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-c10')
  const other = await createClub(request, 'test-c10-other')
  try {
    let admin = club.adminToken
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const since = calendarDate(-62)
    const today = calendarDate()
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Wiśniewska',
      birthDate: birthDateTurning(36),
    })
    const person = (firstName: string, lastName: string, age: number) =>
      createPerson(request, admin, { firstName, lastName, birthDate: birthDateTurning(age) })
    const basia = await person('Basia', 'Lis', 41)
    const ela = await person('Ela', 'Kowalska', 39)
    const ola = await person('Ola', 'Wiśniewska', 11)
    const zuzia = await person('Zuzia', 'Lis', 10)
    const kuba = await person('Kuba', 'Kowalski', 9)
    const tomek = await person('Tomek', 'Sam', 10)
    for (const [guardian, ward] of [
      [kasia.personId, ola],
      [basia, zuzia],
      [ela, kuba],
    ] as const) {
      await createGuardianship(request, admin, {
        guardianPersonId: guardian,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: since,
      })
    }
    for (const child of [ola, zuzia, kuba, tomek]) {
      await addMembership(request, admin, { groupId: zaki, personId: child, role: 'participant', validFrom: since })
    }
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: FEE,
      dueDay: 10,
      validFrom: since,
    })
    const lastMonth = periodFromNow(-1)
    expect((await generate(request, admin, lastMonth)).body).toMatchObject({ created: 4, payerMissing: 1 })
    const charges = await listCharges(request, admin, `&period=${lastMonth}`)
    const chargeOf = (personId: string) => {
      const found = charges.find((charge) => charge.personId === personId && charge.sourceId === fee)
      expect(found, personId).toBeTruthy()
      return String(found?.id)
    }

    // Ola's charge: cash between the checkout and the capture, so the online share is an overpayment to refund.
    const kasiaToken = await signInAs(request, club, kasia.userId, kasia.email)
    const olaCharge = chargeOf(ola)
    expect(((await myCharges(request, kasiaToken)).body?.items ?? []).map((item) => item.id)).toEqual([olaCharge])
    const started = await checkout(request, kasiaToken, [olaCharge])
    const cash = await recordPayment(
      request,
      admin,
      olaCharge,
      (await getCharge(request, admin, olaCharge)).updatedAt,
      {
        amount: FEE,
        method: 'cash',
        paidOn: today,
      },
    )
    expect(cash.status, JSON.stringify(cash.body)).toBe(201)
    await gatewayWebhook(request, { sessionId: started.sessionId, status: 'captured', amountReceived: 150 })
    await expect
      .poll(async () => (await getCharge(request, admin, olaCharge)).payments.some((p) => p.method === 'online'), {
        timeout: 20_000,
      })
      .toBe(true)

    // Two transfers nobody's code or name matches; another club's unmatched transfer is not ours.
    const statement = (rows: string[]) => ['Data;Kwota;Nadawca;Tytuł', ...rows].join('\n')
    const imported = await importStatement(
      request,
      admin,
      statement([`${today};500,00;Firma XYZ;Darowizna na klub`, `${today};120,00;Jan Obcy;Zwrot za bilety`]),
    )
    expect(imported.status, JSON.stringify(imported.body)).toBe(201)
    expect(imported.body).toMatchObject({ unmatched: 2 })
    const elsewhere = await importStatement(
      request,
      other.adminToken,
      statement([`${today};300,00;Firma ABC;Darowizna`]),
    )
    expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(201)

    // Two campaigns collect orders (Zuzia's kit ordered and unpaid in the first); a draft does not count.
    const campaign = async (name: string, open: boolean) => {
      const created = await postCampaign(request, admin, {
        name,
        sectionId: academy,
        groupIds: [zaki],
        closesOn: calendarDate(14),
        paymentDueOn: calendarDate(21),
        open,
        products: [{ key: 'shirt', name: 'Koszulka', sizesChild: ['116', '128'], priceChild: 6000 }],
      })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      return String(created.body?.id)
    }
    const kits = await campaign('Stroje Akademii', true)
    const jackets = await campaign('Kurtki zimowe', true)
    await campaign('Dresy (szkic)', false)
    const [shirt] = (await getCampaign(request, admin, kits)).products
    await seedOrder(scope, {
      campaignId: kits,
      participantPersonId: zuzia,
      orderedByPersonId: basia,
      paymentDueOn: calendarDate(21),
      lines: [{ productId: shirt.id, size: '128', unitPrice: 6000 }],
    })

    // The read, timed against the S7.6 list budget (p95 ≤ 500 ms; recorded in the run log).
    let clock = Date.now()
    const read = await paymentsDashboard(request, admin)
    const fullMs = Date.now() - clock
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body).toMatchObject({
      overdue: { total: 3 * FEE, charges: 3, families: 2, withoutPayer: 1 },
      withoutPayer: {
        charges: 1,
        items: [{ id: chargeOf(tomek), period: lastMonth, person: { firstName: 'Tomek', lastName: 'Sam' } }],
        more: 0,
      },
      toRefund: { count: 1 },
      bank: { toDecide: 2 },
      campaignsRunning: 2,
    })
    expect(read.body?.withoutPayer?.items?.[0]?.description).toEqual(expect.any(String))
    expect(read.body?.campaigns).toEqual(
      expect.arrayContaining([
        { id: kits, name: 'Stroje Akademii', status: 'open', orders: 1, children: 4, paid: 0, value: 6000 },
        { id: jackets, name: 'Kurtki zimowe', status: 'open', orders: 0, children: 4, paid: 0, value: 0 },
      ]),
    )
    expect(read.body?.campaigns).toHaveLength(2)
    clock = Date.now()
    const counts = await paymentsDashboardCounts(request, admin)
    const countsMs = Date.now() - clock
    expect(counts.status, JSON.stringify(counts.body)).toBe(200)
    expect(counts.body).toEqual({ bank: { toDecide: 2 }, campaignsRunning: 2 })
    console.log(`[TEST-C10] GET /api/payments/dashboard ${String(fullMs)} ms; ?only=counts ${String(countsMs)} ms`)
    expect((await paymentsDashboardCounts(request, other.adminToken)).body).toEqual({
      bank: { toDecide: 1 },
      campaignsRunning: 0,
    })
    expect((await paymentsDashboardCounts(request, admin, 'everything')).status).toBe(400)

    // A club administrator without the bank and campaign features: neither block, in either read.
    const clerk = await signedInStaff(request, club, { firstName: 'Olga', lastName: 'Biurowa', role: 'club_admin' })
    await setUserFeatures(request, club, clerk.userId, ['dashboards.view', 'payments.view', 'payments.cash.record'])
    const clerkToken = await signInAs(request, club, clerk.userId, clerk.email)
    const clerkRead = await paymentsDashboard(request, clerkToken)
    expect(clerkRead.status, JSON.stringify(clerkRead.body)).toBe(200)
    expect(clerkRead.body).toMatchObject({ overdue: { charges: 3 }, toRefund: { count: 1 } })
    for (const key of ['bank', 'campaigns', 'campaignsRunning']) expect(clerkRead.body).not.toHaveProperty(key)
    expect((await paymentsDashboardCounts(request, clerkToken)).body).toEqual({})

    // B-01 as the administrator.
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    admin = await getAuthToken(
      request,
      club.tenant.email,
      await signInBrowser(page, request, club, club.adminUserId, club.tenant.email),
    )
    await page.goto('/backend')
    const overdueWidget = page.getByTestId('payments-widget-overdue')
    await expect(overdueWidget.getByTestId('payments-widget-overdue-total')).toHaveText('450 zł')
    await expect(overdueWidget.getByTestId('payments-widget-overdue-charges')).toHaveText(
      uiText('payments.dashboard.widgets.overdue.charges.other', { exact: true, params: { count: '3' } }),
    )
    await expect(overdueWidget.getByTestId('payments-widget-overdue-families')).toContainText('2')
    await expect(overdueWidget.getByTestId('payments-widget-overdue-withoutPayer')).toHaveText(
      uiText('payments.dashboard.widgets.overdue.withoutPayer', { exact: true, params: { count: '1' } }),
    )
    const withoutPayerWidget = page.getByTestId('payments-widget-withoutPayer')
    await expect(withoutPayerWidget.getByTestId('payments-widget-withoutPayer-item')).toHaveCount(1)
    await expect(withoutPayerWidget.getByTestId('payments-widget-withoutPayer-item')).toContainText('Tomek Sam')
    await expect(withoutPayerWidget.getByTestId('payments-widget-withoutPayer-item')).toContainText(lastMonth)
    await expect(withoutPayerWidget.getByTestId('payments-widget-withoutPayer-more')).toHaveCount(0)

    const bankWidget = page.getByTestId('payments-widget-bank')
    await expect(bankWidget.getByTestId('payments-widget-bank-toDecide')).toContainText('2')
    await expect(bankWidget.getByTestId('payments-widget-bank-toRefund')).toHaveText(
      uiText('payments.dashboard.widgets.bank.toRefund', { exact: true, params: { count: '1' } }),
    )
    await expect(bankWidget.getByTestId('payments-widget-bank-import')).toHaveAttribute(
      'href',
      '/backend/payments/bank',
    )

    const campaignsWidget = page.getByTestId('payments-widget-orderCampaigns')
    await expect(campaignsWidget.getByTestId('payments-widget-orderCampaigns-item')).toHaveCount(2)
    const kitsRow = campaignsWidget.locator(`[data-campaign-id="${kits}"]`)
    await expect(kitsRow.getByTestId('payments-widget-orderCampaigns-progress')).toHaveText(
      uiText('payments.dashboard.widgets.orderCampaigns.progress', {
        exact: true,
        params: { orders: '1', children: '4', paid: '0 zł', value: '60 zł' },
      }),
    )
    await expect(kitsRow.getByRole('link', { name: 'Stroje Akademii' })).toHaveAttribute(
      'href',
      `/backend/payments/orders/${kits}`,
    )
    await expect(
      campaignsWidget.getByRole('link', { name: uiText('payments.dashboard.widgets.openList', { exact: true }) }),
    ).toHaveAttribute('href', '/backend/payments/orders')
    await expectNoPageOverflow(page)

    // "Accept cash" opens the shared dialog; Ela's cash is recorded with `origin = dashboard` and "Overdue" refreshes.
    await bankWidget.getByTestId('payments-widget-bank-cash').click()
    await expect(page.getByTestId('accept-cash-dialog')).toBeVisible()
    await page.getByTestId('cash-payer-search').fill('Kowalska')
    await expect(page.getByTestId('cash-payer-option')).toHaveCount(1, { timeout: 30_000 })
    await page.getByTestId('cash-payer-option').click()
    await expect(page.getByTestId('cash-amount')).toHaveValue('150')
    await page.getByTestId('cash-confirm').click()
    await expect(page.getByTestId('cash-payer-step')).toBeVisible()
    await expect.poll(async () => (await getCharge(request, admin, chargeOf(kuba))).status).toBe('paid')
    const kubaPaid = await getCharge(request, admin, chargeOf(kuba))
    const logs = await actionLogs(request, admin, kubaPaid.payments[0].id)
    expect(logs.find((log) => log.commandId === 'payments.cash.record')?.context).toMatchObject({ origin: 'dashboard' })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('accept-cash-dialog')).toHaveCount(0)
    await expect(overdueWidget.getByTestId('payments-widget-overdue-total')).toHaveText('300 zł')

    // "Open list" lands on the matching perspective.
    await withoutPayerWidget
      .getByRole('link', { name: uiText('payments.dashboard.widgets.openList', { exact: true }) })
      .click()
    await expect(page).toHaveURL(/\/backend\/payments\/charges\?perspective=payer_missing$/)
    await expect(
      page.getByRole('tab', { name: uiText('payments.charges.perspectives.payer_missing', { exact: true }) }),
    ).toHaveAttribute('aria-selected', 'true')
    await page.goto('/backend')
    await bankWidget.getByTestId('payments-widget-bank-toRefund').click()
    await expect(page).toHaveURL(/\/backend\/payments\/charges\?perspective=to_refund$/)
    await expect(
      page.getByRole('tab', { name: uiText('payments.charges.perspectives.to_refund', { exact: true }) }),
    ).toHaveAttribute('aria-selected', 'true')

    // Once both transfers are skipped: "All imported transfers are settled".
    for (const transfer of (await bankTransfers(request, admin, '&status=unmatched')).body?.items ?? []) {
      const skipped = await bankDecide(request, admin, transfer.id, 'ignore', transfer.updatedAt, { reason: 'other' })
      expect(skipped.status, JSON.stringify(skipped.body)).toBe(200)
    }
    expect((await paymentsDashboardCounts(request, admin)).body).toEqual({ bank: { toDecide: 0 }, campaignsRunning: 2 })
    await page.goto('/backend')
    await expect(page.getByTestId('payments-widget-bank-toDecide')).toHaveText(
      uiText('payments.dashboard.widgets.bank.allSettled', { exact: true }),
    )

    // Without the features the two widgets are not offered.
    await switchBrowserUser(page, request, club, clerk.userId, clerk.email)
    await page.goto('/backend')
    await expect(page.getByTestId('payments-widget-overdue')).toBeVisible()
    await expect(page.getByTestId('payments-widget-bank')).toHaveCount(0)
    await expect(page.getByTestId('payments-widget-orderCampaigns')).toHaveCount(0)
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
