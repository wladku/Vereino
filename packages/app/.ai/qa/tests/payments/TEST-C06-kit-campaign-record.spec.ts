import { expect, test } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { expectNoPageOverflow, scanInColorSchemes } from '../_fixtures/axe'
import {
  actionLogs,
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  signInAs,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { uniqueAddress } from '../_fixtures/messaging'
import { getCampaign, postCampaign, seedOrder, transition } from '../_fixtures/orders'
import { getCharge } from '../_fixtures/payments'
import { createGuardianship } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// TEST-C06 and the B-32 part of TEST-C04 (payments parity spec phase 3, REQ-C05, REQ-C02, DD-C04, J-C04; issue #293):
// a campaign with a supplier and a set; Kasia orders Jaś's kit in the app with a phone and a note, Ada's kit comes from
// an e-mail link and is overdue; Ola's guardian has no e-mail and Tomek has no guardian, so neither has an order.
// - The reads: the order rows carry the orderer, phone, channel, notes, due date, overdue marker, payments and handover;
//   the campaign carries the supplier and `notHandedOver`; the summary counts the set's units "in sets" and names the
//   child of each print while its CSV does not; "No order" lists the guardians with a missing e-mail flag.
// - Hand over before the delivery answers 409, and the row offers no "Hand over".
// - B-31 on the open campaign says how many orders it has; on the completed one it shows the locked warning with the
//   way back.
// - B-32: tiles with their hints and the supplier, tab counts, "Ordered by", the collecting warning, the prints with
//   the child, the guardians; "Cash" in Jaś's row opens the shared dialog with Kasia and only that charge, and the row
//   then reads "paid — cash — {admin}" (audit `origin = order_campaign`); once delivered, "Hand over" in Ada's unpaid
//   row warns with the amount and the row reads "handed over — {admin}"; "Complete" names the kit not handed over.
// - axe is clean on B-32 in both locales and both colour schemes; the page fits 375 px.
test.describe.configure({ timeout: 360_000 })

type OrderRow = {
  id: string
  orderedByPersonId: string
  contactPhone: string | null
  submittedVia: string
  notes: string | null
  dueDate: string | null
  overdue: boolean
  payments: { method: string; collectedBy: { firstName: string; lastName: string } | null }[]
  handedOver: boolean
  handedOverAt: string | null
  handedOverBy: { firstName: string; lastName: string } | null
}

test('TEST-C06 the kit campaign record: who ordered, payments, cash and handover in the row', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-c06')
  try {
    let admin = club.adminToken
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const since = calendarDate(-60)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const kasiaEmail = uniqueAddress('c06-kasia')
    const person = (firstName: string, lastName: string, age: number, email?: string) =>
      createPerson(request, admin, {
        firstName,
        lastName,
        birthDate: birthDateTurning(age),
        ...(email ? { email } : {}),
      })
    const kasia = await person('Kasia', 'Rodzic', 38, kasiaEmail)
    const ewa = await person('Ewa', 'Linkowa', 36, uniqueAddress('c06-ewa'))
    const piotr = await person('Piotr', 'Bezmaila', 41)
    const jas = await person('Jaś', 'Rodzic', 8)
    const ada = await person('Ada', 'Linkowa', 9)
    const ola = await person('Ola', 'Bezmaila', 9)
    const tomek = await person('Tomek', 'Sam', 10)
    for (const [ward, guardian] of [
      [jas, kasia],
      [ada, ewa],
      [ola, piotr],
    ] as const) {
      await createGuardianship(request, admin, {
        guardianPersonId: guardian,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: since,
      })
    }
    for (const child of [jas, ada, ola, tomek]) {
      await addMembership(request, admin, { groupId: zaki, personId: child, role: 'participant', validFrom: since })
    }
    const account = await createAccount(request, admin, kasia, kasiaEmail)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    const kasiaUserId = String(account.body?.userId)
    club.extraUserIds.push(kasiaUserId)
    const adminPerson = await call<{ firstName: string; lastName: string }>(
      request,
      'GET',
      `/api/people/persons/${club.adminPersonId}`,
      admin,
    )
    const adminName = `${String(adminPerson.body?.firstName)} ${String(adminPerson.body?.lastName)}`

    const created = await postCampaign(request, admin, {
      name: 'Stroje Akademii 2026/27',
      description: 'Zamawiamy stroje meczowe.',
      sectionId: academy,
      groupIds: [zaki],
      closesOn: calendarDate(14),
      paymentDueOn: calendarDate(21),
      askPrintName: true,
      askPrintNumber: true,
      notesLabel: 'Uwagi',
      supplierName: 'Sport-Tex',
      open: true,
      products: [
        { key: 'shirt', name: 'Koszulka', sizesChild: ['116', '128'], priceChild: 6000, requiredAnswer: true },
        { key: 'shorts', name: 'Spodenki', sizesChild: ['116', '128'], priceChild: 4000, requiredAnswer: true },
        { key: 'kit', name: 'Komplet', kind: 'set', componentKeys: ['shirt', 'shorts'], priceChild: 9000 },
      ],
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const campaignId = String(created.body?.id)
    let detail = await getCampaign(request, admin, campaignId)
    const [shirt, shorts] = detail.products

    // Kasia orders Jaś's set in the app with her phone and a note.
    const kasiaToken = await signInAs(request, club, kasiaUserId, kasiaEmail)
    const placed = await call<{ orderId: string; chargeId: string; total: number }>(
      request,
      'POST',
      '/api/payments/orders',
      kasiaToken,
      {
        data: {
          campaignId,
          participantPersonId: jas,
          setSelected: true,
          choices: { [shirt.id]: '128', [shorts.id]: '128' },
          printName: 'JAŚ',
          printNumber: 7,
          notes: 'Dłuższe rękawy',
          contactEmail: kasiaEmail,
          contactPhone: '600 100 200',
        },
      },
    )
    expect(placed.status, JSON.stringify(placed.body)).toBe(201)
    const jasOrder = { orderId: String(placed.body?.orderId), chargeId: String(placed.body?.chargeId) }
    // Ada's kit came from an e-mail link and its charge is overdue.
    const adaOrder = await seedOrder(scope, {
      campaignId,
      participantPersonId: ada,
      orderedByPersonId: ewa,
      paymentDueOn: calendarDate(21),
      lines: [{ productId: shirt.id, size: '116', unitPrice: 6000 }],
    })
    await withClient(async (client) => {
      await client.query(`update payments_orders set submitted_via = 'email_link' where id = $1`, [adaOrder.orderId])
      await client.query(`update payments_charges set due_date = $2 where id = $1`, [
        adaOrder.chargeId,
        calendarDate(-3),
      ])
    })

    // The reads.
    const listOrders = async (token: string) => {
      const result = await call<{ items: OrderRow[] }>(
        request,
        'GET',
        `/api/payments/orders?campaignId=${campaignId}`,
        token,
      )
      expect(result.status, JSON.stringify(result.body)).toBe(200)
      return result.body?.items ?? []
    }
    const rows = await listOrders(admin)
    expect(rows.find((row) => row.id === jasOrder.orderId)).toMatchObject({
      orderedByPersonId: kasia,
      contactPhone: '600 100 200',
      submittedVia: 'app',
      notes: 'Dłuższe rękawy',
      dueDate: calendarDate(21),
      overdue: false,
      payments: [],
      handedOver: false,
      handedOverAt: null,
      handedOverBy: null,
    })
    expect(rows.find((row) => row.id === adaOrder.orderId)).toMatchObject({
      orderedByPersonId: ewa,
      submittedVia: 'email_link',
      overdue: true,
    })
    detail = await getCampaign(request, admin, campaignId)
    expect(detail).toMatchObject({ supplierName: 'Sport-Tex' })
    expect(detail.kpis).toMatchObject({ orders: 2, children: 4, missing: 2, handedOver: 0, notHandedOver: 2 })
    const summary = await call<{
      units: { productName: string; size: string | null; quantity: number; inSets: number }[]
      prints: { participant: { firstName: string; lastName: string } | null; printName: string | null }[]
    }>(request, 'GET', `/api/payments/order-campaigns/${campaignId}/summary`, admin)
    expect(summary.body?.units.map((unit) => [unit.productName, unit.size, unit.quantity, unit.inSets])).toEqual([
      ['Koszulka', '116', 1, 0],
      ['Koszulka', '128', 1, 1],
      ['Spodenki', '128', 1, 1],
    ])
    expect(summary.body?.prints).toEqual([
      expect.objectContaining({ participant: { firstName: 'Jaś', lastName: 'Rodzic' }, printName: 'JAŚ' }),
    ])
    const csv = await call(request, 'GET', `/api/payments/order-campaigns/${campaignId}/summary?format=csv`, admin)
    const csvText = await csv.response.text()
    expect(csvText).toContain('JAŚ,7,Żaki')
    expect(csvText).not.toContain('Rodzic')
    expect(csvText).not.toContain('600 100 200')
    const missing = await call<{
      items: { personId: string; guardians: { firstName: string; lastName: string; hasEmail: boolean }[] }[]
    }>(request, 'GET', `/api/payments/order-campaigns/${campaignId}/missing`, admin)
    expect(missing.body?.items).toEqual([
      expect.objectContaining({
        personId: ola,
        guardians: [{ firstName: 'Piotr', lastName: 'Bezmaila', hasEmail: false }],
      }),
      expect.objectContaining({ personId: tomek, guardians: [] }),
    ])

    // Hand over before the delivery: 409.
    const early = await call<{ code?: string }>(
      request,
      'POST',
      `/api/payments/orders/${jasOrder.orderId}/hand-over`,
      admin,
      { data: { groupId: zaki, confirmUnpaid: true } },
    )
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body?.code).toBe('order_not_delivered')

    // The browser (signInBrowser ends the API token).
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    admin = await getAuthToken(request, club.tenant.email, password)
    await page.setViewportSize({ width: 1280, height: 900 })

    // B-31 on the open campaign: the orders alert.
    await page.goto(`/backend/payments/orders/${campaignId}/edit`)
    await expect(page.getByTestId('order-campaign-collecting')).toContainText(
      uiText('payments.orders.edit.collectingTitle.other', { params: { count: '2' } }),
    )

    // B-32 while collecting.
    await page.goto(`/backend/payments/orders/${campaignId}`)
    await expect(page.getByTestId('order-campaign-kpi-orders')).toContainText('2 / 4')
    await expect(page.getByTestId('order-campaign-kpi-orders-hint')).toHaveText(
      uiText('payments.orders.kpi.ordersHint', { exact: true }),
    )
    await expect(page.getByTestId('order-campaign-kpi-paid-hint')).toContainText(uiText('payments.orders.kpi.paidHint'))
    await expect(page.getByTestId('order-campaign-kpi-handed-over')).toContainText('0 / 2')
    await expect(page.getByTestId('order-campaign-kpi-handed-over-hint')).toHaveText('Sport-Tex')
    await expect(
      page.getByRole('tab', { name: uiText('payments.orders.tabs.ordersCount', { params: { count: '2' } }) }),
    ).toBeVisible()
    await expect(
      page.getByRole('tab', { name: uiText('payments.orders.tabs.missingCount', { params: { count: '2' } }) }),
    ).toBeVisible()
    const jasRow = page.getByRole('row').filter({ hasText: 'Jaś Rodzic' })
    const adaRow = page.getByRole('row').filter({ hasText: 'Ada Linkowa' })
    await expect(jasRow.getByTestId('order-row-ordered-by')).toContainText('Kasia Rodzic')
    await expect(jasRow.getByTestId('order-row-ordered-by')).toContainText('600 100 200')
    await expect(jasRow.getByTestId('order-row-ordered-by')).toContainText(uiText('payments.orders.orders.via.app'))
    await expect(adaRow.getByTestId('order-row-ordered-by')).toContainText(
      uiText('payments.orders.orders.via.email_link'),
    )
    await expect(jasRow.getByTestId('order-row-notes')).toContainText('Dłuższe rękawy')
    await expect(adaRow.getByTestId('order-row-payment')).toContainText(uiText('payments.charges.overdue'))
    await expect(page.getByTestId('order-row-hand-over')).toHaveCount(0)
    await page.getByRole('tab', { name: uiText('payments.orders.tabs.summary') }).click()
    await expect(page.getByTestId('order-campaign-summary-collecting')).toBeVisible()
    await expect(page.getByTestId('order-campaign-summary-print')).toContainText('Jaś Rodzic')
    await page.getByRole('tab', { name: uiText('payments.orders.tabs.missingCount') }).click()
    const guardians = page.getByTestId('order-campaign-missing-guardians')
    await expect(guardians.first()).toContainText('Piotr Bezmaila')
    await expect(guardians.first()).toContainText(uiText('payments.orders.missing.noEmail'))
    await expect(guardians.last()).toHaveText(uiText('payments.orders.missing.noGuardian', { exact: true }))

    // "Cash" in Jaś's row: Kasia chosen, only that charge, one receipt; the row reads "paid — cash — {admin}".
    await page.getByRole('tab', { name: uiText('payments.orders.tabs.ordersCount') }).click()
    await expect(jasRow.getByTestId('order-row-cash')).toHaveAccessibleName(
      uiText('payments.orders.orders.cashFor', { params: { child: 'Jaś Rodzic' } }),
    )
    await jasRow.getByTestId('order-row-cash').click()
    await expect(page.getByTestId('cash-payer-selected')).toHaveText('Kasia Rodzic')
    await expect(page.getByTestId('cash-amount')).toHaveValue('90')
    await page.keyboard.press('Control+Enter')
    await expect(page.getByTestId('accept-cash-dialog')).toHaveCount(0)
    await expect(jasRow.getByTestId('order-row-payment')).toContainText(
      uiText('payments.charges.status.paid', { exact: false }),
    )
    await expect(jasRow.getByTestId('order-row-payments')).toHaveText(
      new RegExp(`${uiText('payments.ledger.method.cash').source} — ${adminName}`),
    )
    await expect(jasRow.getByTestId('order-row-cash')).toHaveCount(0)
    const jasCharge = await getCharge(request, admin, jasOrder.chargeId)
    expect(jasCharge.status).toBe('paid')
    const logs = await actionLogs(request, admin, jasCharge.payments[0].id)
    expect(logs.find((log) => log.commandId === 'payments.cash.record')?.context).toMatchObject({
      origin: 'order_campaign',
    })

    // Delivered: "Hand over" in Ada's unpaid row warns with the amount; the row reads "handed over — {admin}".
    detail = await getCampaign(request, admin, campaignId)
    let lock = detail.updatedAt
    for (const action of ['close', 'mark-ordered', 'mark-delivered']) {
      const moved = await transition(request, admin, campaignId, action, lock)
      expect(moved.status, `${action} ${JSON.stringify(moved.body)}`).toBe(200)
      lock = String(moved.body?.updatedAt)
    }
    await page.reload()
    await expect(adaRow.getByTestId('order-row-hand-over')).toHaveAccessibleName(
      uiText('payments.orders.orders.handOverFor', { params: { child: 'Ada Linkowa' } }),
    )
    await adaRow.getByTestId('order-row-hand-over').click()
    await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toContainText(
      uiText('payments.orders.handOver.unpaidDue'),
    )
    await page.getByRole('button', { name: uiText('payments.orders.handOver.unpaidSubmit', { exact: true }) }).click()
    await expect(adaRow.getByTestId('order-row-handover')).toContainText(uiText('payments.orders.orders.handedOver'))
    await expect(adaRow.getByTestId('order-row-handover')).toContainText(adminName)
    await expect(adaRow.getByTestId('order-row-hand-over')).toHaveCount(0)
    const handed = (await listOrders(admin)).find((row) => row.id === adaOrder.orderId)
    expect(handed).toMatchObject({
      handedOver: true,
      handedOverBy: { firstName: adminPerson.body?.firstName, lastName: adminPerson.body?.lastName },
    })
    expect(handed?.handedOverAt).toBeTruthy()

    // axe on B-32 in both locales and both colour schemes; the page fits 375 px.
    const ready = async () => {
      await expect(page.getByTestId('order-campaign-title')).toBeVisible()
      await expect(page.getByTestId('order-row-child').first()).toBeVisible()
    }
    for (const locale of ['en', 'pl']) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: new URL(page.url()).origin }])
      expect(await scanInColorSchemes(page, testInfo, `B-32 ${locale}`, ready, { platformBaseline: true })).toEqual({})
    }
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload()
    await ready()
    await expect(page.getByTestId('order-row-ordered-by')).toHaveCount(0)
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.reload()

    // "Complete" with Jaś's kit not handed over: the danger dialog names the number.
    await page.getByTestId('order-campaign-next').click()
    await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toContainText(
      uiText('payments.orders.next.complete.notHanded.one', { params: { count: '1' } }),
    )
    await page.getByRole('button', { name: uiText('payments.orders.next.complete.anyway', { exact: true }) }).click()
    await expect(page.getByTestId('order-campaign-stage')).toContainText(uiText('payments.orders.stage.completed'))

    // B-31 on the completed campaign: the locked warning and the way back.
    await page.goto(`/backend/payments/orders/${campaignId}/edit`)
    await expect(page.getByTestId('order-campaign-locked')).toContainText(uiText('payments.orders.edit.lockedTitle'))
    await page.getByTestId('order-campaign-locked-back').click()
    await expect(page).toHaveURL(new RegExp(`/backend/payments/orders/${campaignId}$`))
  } finally {
    await club.cleanup()
  }
})
