import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, call, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { awaitEmails } from '../_fixtures/communication'
import { addMembership, createGroup } from '../_fixtures/groups'
import { uniqueAddress } from '../_fixtures/messaging'
import {
  formOf,
  getCampaign,
  linePrices,
  postCampaign,
  putCampaign,
  seedOrder,
  transition,
  type CampaignBody,
} from '../_fixtures/orders'
import { createGuardianship } from '../_fixtures/people'

// E07-S08 (payments spec phase 4 step 9, REQ-032, the administrator's part of TEST-044; issue #115; B-30…B-32): the
// Academy kit form with a set (shirt + shorts), single products with children's and adult sizes and one without a
// size. The form refuses no group (400), a payment deadline before the orders deadline, a group of another section,
// two sets and a set of one product (422, with the field). The stages move one at a time (409 out of order). With
// orders placed, a price change keeps their prices and a used product cannot be removed (409); the KPIs, "No order"
// and "Remind everyone" count the child without an order; closing locks the form (409); the supplier summary counts
// set items under their products and its CSV carries the print columns only. In the browser: a copy of the campaign
// is refused without a group, then saved and opened with the Messenger text; "Close orders" counts the children
// without an order; the campaign page fits 375 px.
test.describe.configure({ timeout: 300_000 })

test('E07-S08 kit order form, stages, price edits and the supplier summary', async ({ page, request }) => {
  const club = await createClub(request, 'e07-s08')
  try {
    let admin = club.adminToken
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const since = calendarDate(-60)
    const closesOn = calendarDate(14)
    const paymentDueOn = calendarDate(21)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const tennis = await createStructure(request, admin, 'sections', { name: 'Tenis' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const orliki = await createGroup(request, admin, { sectionId: academy, name: 'Orliki', kind: 'team' })
    const tennisGroup = await createGroup(request, admin, { sectionId: tennis, name: 'Tenis 1', kind: 'class_group' })
    const kasia = await createPerson(request, admin, {
      firstName: 'Kasia',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(38),
      email: uniqueAddress('kasia-kit'),
    })
    const piotrEmail = uniqueAddress('piotr-kit')
    const piotr = await createPerson(request, admin, {
      firstName: 'Piotr',
      lastName: 'Opiekun',
      birthDate: birthDateTurning(40),
      email: piotrEmail,
    })
    const jas = await createPerson(request, admin, {
      firstName: 'Jaś',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(8),
    })
    const ada = await createPerson(request, admin, {
      firstName: 'Ada',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(11),
    })
    const ola = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Opiekun',
      birthDate: birthDateTurning(9),
    })
    for (const [ward, guardian] of [
      [jas, kasia],
      [ada, kasia],
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
    await addMembership(request, admin, { groupId: zaki, personId: jas, role: 'participant', validFrom: since })
    await addMembership(request, admin, { groupId: zaki, personId: ola, role: 'participant', validFrom: since })
    await addMembership(request, admin, { groupId: orliki, personId: ada, role: 'participant', validFrom: since })

    const products = [
      {
        key: 'shirt',
        name: 'Koszulka',
        sizesChild: ['128', '140'],
        sizesAdult: ['M'],
        priceChild: 6000,
        priceAdult: 7500,
        requiredAnswer: true,
      },
      { key: 'shorts', name: 'Spodenki', sizesChild: ['128'], priceChild: 4000, requiredAnswer: true },
      { key: 'scarf', name: 'Szalik', priceChild: 3000 },
      { key: 'kit', name: 'Komplet', kind: 'set', componentKeys: ['shirt', 'shorts'], priceChild: 9000 },
    ]
    const form = {
      name: 'Strój akademii 2026/27',
      description: 'Zamawiamy stroje meczowe.',
      sectionId: academy,
      groupIds: [zaki, orliki],
      closesOn,
      paymentDueOn,
      askPrintName: true,
      askPrintNumber: true,
      notesLabel: 'Uwagi',
      supplierName: 'Sport-Tex',
      products,
    }

    // The negative cases of the wizard.
    const noGroup = await postCampaign(request, admin, { ...form, groupIds: [] })
    expect(noGroup.status, JSON.stringify(noGroup.body)).toBe(400)
    expect(noGroup.body?.details?.some((issue) => issue.path?.[0] === 'groupIds')).toBe(true)
    const latePayment = await postCampaign(request, admin, { ...form, paymentDueOn: calendarDate(13) })
    expect(latePayment.status, JSON.stringify(latePayment.body)).toBe(422)
    expect(latePayment.body?.code).toBe('order_payment_due_before_close')
    expect(latePayment.body?.fieldErrors?.paymentDueOn).toBeTruthy()
    const pastDeadline = await postCampaign(request, admin, { ...form, closesOn: calendarDate(-1) })
    expect(pastDeadline.body?.code).toBe('order_closes_on_past')
    const foreignGroup = await postCampaign(request, admin, { ...form, groupIds: [zaki, tennisGroup] })
    expect(foreignGroup.status).toBe(422)
    expect(foreignGroup.body?.code).toBe('order_groups_invalid')
    const twoSets = await postCampaign(request, admin, {
      ...form,
      products: [
        ...products,
        { key: 'kit2', name: 'Drugi', kind: 'set', componentKeys: ['shirt', 'scarf'], priceChild: 1 },
      ],
    })
    expect(twoSets.body?.code).toBe('order_set_too_many')
    const smallSet = await postCampaign(request, admin, {
      ...form,
      products: [
        ...products.slice(0, 3),
        { key: 'kit', name: 'Komplet', kind: 'set', componentKeys: ['shirt'], priceChild: 1 },
      ],
    })
    expect(smallSet.status).toBe(422)
    expect(smallSet.body?.code).toBe('order_set_too_small')

    // A draft: one next action, an out-of-order transition is 409.
    const created = await postCampaign(request, admin, form)
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body?.status).toBe('draft')
    const campaignId = String(created.body?.id)
    let detail = await getCampaign(request, admin, campaignId)
    expect(detail.nextAction).toBe('open')
    expect(detail.products.map((product) => product.name)).toEqual(['Koszulka', 'Spodenki', 'Szalik', 'Komplet'])
    const [shirt, shorts, scarf, kit] = detail.products
    expect(kit.componentProductIds).toEqual([shirt.id, shorts.id])
    expect(detail.kpis).toMatchObject({ orders: 0, children: 3, missing: 3 })
    const early = await transition(request, admin, campaignId, 'close', detail.updatedAt)
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body?.code).toBe('order_campaign_transition_invalid')
    const opened = await transition(request, admin, campaignId, 'open', detail.updatedAt)
    expect(opened.status, JSON.stringify(opened.body)).toBe(200)
    expect(opened.body?.status).toBe('open')

    // Two children order (E07-S09 places orders; seeded here): Jaś the set and a scarf, Ada an adult shirt.
    const jasOrder = await seedOrder(scope, {
      campaignId,
      participantPersonId: jas,
      orderedByPersonId: kasia,
      paymentDueOn,
      printName: 'JAŚ',
      printNumber: 7,
      lines: [
        { productId: kit.id, componentSizes: { [shirt.id]: '140', [shorts.id]: '128' }, unitPrice: 9000 },
        { productId: scarf.id, unitPrice: 3000 },
      ],
    })
    const adaOrder = await seedOrder(scope, {
      campaignId,
      participantPersonId: ada,
      orderedByPersonId: kasia,
      paymentDueOn,
      printName: 'ADA',
      printNumber: 3,
      lines: [{ productId: shirt.id, size: 'M', unitPrice: 7500 }],
    })

    // A price edit keeps the placed orders' prices; a used product cannot be removed.
    detail = await getCampaign(request, admin, campaignId)
    expect(detail.products.find((product) => product.id === scarf.id)?.used).toBe(true)
    const repriced = formOf(detail) as { products: { id: string; priceAdult: number | null }[] }
    repriced.products = repriced.products.map((product) =>
      product.id === shirt.id ? { ...product, priceAdult: 8000 } : product,
    )
    const edit = await putCampaign(request, admin, detail.updatedAt, repriced)
    expect(edit.status, JSON.stringify(edit.body)).toBe(200)
    expect(await linePrices(adaOrder.orderId)).toEqual({ [shirt.id]: 7500 })
    detail = await getCampaign(request, admin, campaignId)
    expect(detail.products.find((product) => product.id === shirt.id)?.priceAdult).toBe(8000)
    const withoutScarf = formOf(detail) as { products: { id: string }[] }
    withoutScarf.products = withoutScarf.products.filter((product) => product.id !== scarf.id)
    const removal = await putCampaign(request, admin, detail.updatedAt, withoutScarf)
    expect(removal.status, JSON.stringify(removal.body)).toBe(409)
    expect(removal.body?.code).toBe('order_product_in_use')

    // KPIs, "No order" and the reminder count Ola, the child without an order.
    expect(detail.kpis).toEqual({ orders: 2, children: 3, missing: 1, value: 19500, paid: 0, handedOver: 0 })
    const missing = await call<{ items: { personId: string; groupName: string }[] }>(
      request,
      'GET',
      `/api/payments/order-campaigns/${campaignId}/missing`,
      admin,
    )
    expect(missing.body?.items).toEqual([expect.objectContaining({ personId: ola, groupName: 'Żaki' })])
    const remind = await call<{ children: number; recipients: number }>(
      request,
      'POST',
      `/api/payments/order-campaigns/${campaignId}/remind`,
      admin,
      { data: {} },
    )
    expect(remind.status, JSON.stringify(remind.body)).toBe(200)
    expect(remind.body).toMatchObject({ children: 1, recipients: 1 })
    await awaitEmails(piotrEmail, 'Strój akademii 2026/27')
    const orders = await call<{ items: { id: string; total: number; groupName: string }[]; total: number }>(
      request,
      'GET',
      `/api/payments/orders?campaignId=${campaignId}`,
      admin,
    )
    expect(orders.body?.total).toBe(2)
    expect(orders.body?.items.map((order) => [order.id, order.total, order.groupName])).toEqual([
      [jasOrder.orderId, 12000, 'Żaki'],
      [adaOrder.orderId, 7500, 'Orliki'],
    ])

    // Closing locks the form and the reminders.
    const closed = await transition(request, admin, campaignId, 'close', detail.updatedAt)
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    expect(closed.body?.status).toBe('closed')
    const locked = await putCampaign(request, admin, String(closed.body?.updatedAt), formOf(detail))
    expect(locked.status).toBe(409)
    expect(locked.body?.code).toBe('order_campaign_not_editable')
    const lateRemind = await call<CampaignBody>(
      request,
      'POST',
      `/api/payments/order-campaigns/${campaignId}/remind`,
      admin,
      { data: {} },
    )
    expect(lateRemind.body?.code).toBe('order_campaign_not_collecting')

    // The supplier summary: set items under their products, prints by group; the CSV has the print columns only.
    const summary = await call<{
      units: { productName: string; size: string | null; quantity: number }[]
      prints: { printName: string; printNumber: number; groupName: string }[]
    }>(request, 'GET', `/api/payments/order-campaigns/${campaignId}/summary`, admin)
    expect(summary.body?.units.map((unit) => [unit.productName, unit.size, unit.quantity])).toEqual([
      ['Koszulka', '140', 1],
      ['Koszulka', 'M', 1],
      ['Spodenki', '128', 1],
      ['Szalik', null, 1],
    ])
    expect(summary.body?.prints.map((print) => [print.printName, print.printNumber, print.groupName])).toEqual([
      ['ADA', 3, 'Orliki'],
      ['JAŚ', 7, 'Żaki'],
    ])
    const csv = await call(request, 'GET', `/api/payments/order-campaigns/${campaignId}/summary?format=csv`, admin)
    expect(csv.status).toBe(200)
    expect(csv.response.headers()['content-type']).toContain('text/csv')
    const csvText = await csv.response.text()
    expect(csvText).toContain('Koszulka,140,1')
    expect(csvText).toContain('JAŚ,7,Żaki,Koszulka: 140; Spodenki: 128')
    expect(csvText).not.toContain('Kasia')
    expect(csvText).not.toContain('Rodzic')

    // The remaining stages, one at a time.
    let lock = String(closed.body?.updatedAt)
    for (const action of ['mark-ordered', 'mark-delivered', 'complete']) {
      const moved = await transition(request, admin, campaignId, action, lock)
      expect(moved.status, `${action} ${JSON.stringify(moved.body)}`).toBe(200)
      lock = String(moved.body?.updatedAt)
    }
    const again = await transition(request, admin, campaignId, 'complete', lock)
    expect(again.status).toBe(409)
    expect((await getCampaign(request, admin, campaignId)).nextAction).toBeNull()

    // A second campaign, open with one order, for the "Close orders" dialog in the browser.
    const second = await postCampaign(request, admin, { ...form, name: 'Dresy zimowe', open: true })
    expect(second.status, JSON.stringify(second.body)).toBe(201)
    expect(second.body?.status).toBe('open')
    const secondId = String(second.body?.id)
    const secondDetail = await getCampaign(request, admin, secondId)
    await seedOrder(scope, {
      campaignId: secondId,
      participantPersonId: jas,
      orderedByPersonId: kasia,
      paymentDueOn,
      lines: [{ productId: secondDetail.products[2].id, unitPrice: 3000 }],
    })

    // The browser (signInBrowser ends the API token; the rest of the test needs none).
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    admin = await getAuthToken(request, club.tenant.email, password)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/backend/payments/orders')
    await expect(page.getByText('Strój akademii 2026/27')).toBeVisible()
    await expect(page.getByText('Dresy zimowe')).toBeVisible()

    // A copy of the first campaign: refused without a group, then saved and opened with the Messenger text.
    await page.goto('/backend/payments/orders/create')
    await page.getByTestId('order-campaign-start-copy').click()
    await page.getByRole('option', { name: 'Strój akademii 2026/27' }).click()
    await expect(page.getByTestId('order-product-3-name')).toHaveValue('Komplet')
    await page.locator('[data-crud-field-id="name"] input').fill('Kurtki 2026')
    // The copy keeps both groups; "Select all" clears them.
    await page.getByTestId('order-campaign-groups-all').click()
    await page
      .getByRole('button', { name: /^(Save draft|Zapisz szkic)$/ })
      .first()
      .click()
    await expect(page.getByText(/Select at least one group|Wybierz co najmniej jedną grupę/).first()).toBeVisible()
    await page.getByTestId('order-campaign-groups-all').click()
    await page.getByTestId('order-campaign-open').last().click()
    await expect(page.getByTestId('order-campaign-title')).toHaveText('Kurtki 2026')
    await expect(page.getByTestId('order-campaign-share-text')).toHaveValue(/Kurtki 2026[\s\S]*\/club\/orders\//)
    await page.keyboard.press('Escape')

    // "Close orders" counts the children without an order.
    await page.goto(`/backend/payments/orders/${secondId}`)
    await expect(page.getByTestId('order-campaign-kpi-orders')).toContainText(/1 (of|z) 3/)
    await page.getByTestId('order-campaign-next').click()
    await expect(page.getByText(/Children without an order: 2|Dzieci bez zamówienia: 2/)).toBeVisible()
    await page
      .getByRole('button', { name: /^(Close orders|Zamknij zamówienia)$/ })
      .last()
      .click()
    await expect(page.getByTestId('order-campaign-stage')).toContainText(/Closed|Zamknięte/)
    await page.getByRole('tab', { name: /Supplier summary|Zestawienie dla dostawcy/ }).click()
    await expect(page.getByTestId('order-campaign-summary-csv')).toBeVisible()

    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload()
    await expect(page.getByTestId('order-campaign-title')).toBeVisible()
    await expectNoPageOverflow(page)
    expect(admin).toBeTruthy()
  } finally {
    await club.cleanup()
  }
})
