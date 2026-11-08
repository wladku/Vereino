import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { expectNoPageOverflow } from '../_fixtures/axe'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  signInAs,
  uniqueSuffix,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser, signOutBrowser } from '../_fixtures/club-structure'
import { awaitEmails, emailsTo } from '../_fixtures/communication'
import { publicCall } from '../_fixtures/declaration-links'
import { addMembership, createGroup } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { uniqueAddress } from '../_fixtures/messaging'
import { postCampaign } from '../_fixtures/orders'
import { getCharge, myCharges, recordPayment } from '../_fixtures/payments'
import { createGuardianship } from '../_fixtures/people'
import { publish } from '../_fixtures/publication'

// E07-S09 (payments spec phase 4 step 9, REQ-032, REQ-002, the guardian's part of TEST-044; issue #116; M-16, M-17,
// M-19): Kasia guards Jaś (Żaki), Ada (Orliki) and Zosia (tennis, outside the campaign); Piotr, without an account,
// guards Ola (Żaki). Kasia orders the set with sizes and "JAŚ 8" — an `order` charge appears on M-08 and a copy goes
// by e-mail; Zosia answers 403; a missing answer and a set without a size answer 422. A link request for an unknown
// address answers the same 202 and sends nothing; Piotr's link orders for Ola, where number 8 is "already taken by Jaś
// in group Żaki" (422), and cannot order for Jaś (403). Once Jaś's order is paid, a change below the paid amount and
// a cancellation answer 409; Ada's unpaid order cancels with its charge. After the deadline the form says "Orders are
// closed" and every write answers 409; an expired link answers 410. In the browser: M-16 lists the children's states,
// M-17 places Ada's order and shows the summary at 375 px, and without a session the share link shows the campaign
// card with "Sign in" and the link request.
test.describe.configure({ timeout: 300_000 })

type OrderBody = {
  ok?: boolean
  orderId?: string
  chargeId?: string
  total?: number
  updatedAt?: string
  code?: string
  error?: string
  fieldErrors?: Record<string, string>
}

type FormBody = {
  campaign: { ordersOpen: boolean }
  children: { personId: string; firstName: string; groupName: string | null; takenNumbers: number[] }[]
  orders: {
    id: string
    participantPersonId: string
    printName: string | null
    printNumber: number | null
    total: number
    state: string
    updatedAt: string
  }[]
}

type MyOrdersBody = {
  items: { id: string; children: { firstName: string; state: string; groupName: string | null }[] }[]
}

async function setClosesOn(campaignId: string, closesOn: string): Promise<void> {
  await withClient((client) =>
    client.query('update payments_order_campaigns set closes_on = $1 where id = $2', [closesOn, campaignId]),
  )
}

async function expireOrderLinks(guardianPersonId: string): Promise<void> {
  await withClient((client) =>
    client.query(
      `update payments_order_links set expires_at = now() - interval '1 minute' where guardian_person_id = $1`,
      [guardianPersonId],
    ),
  )
}

test('E07-S09 a guardian orders kit in the app and from a personal link', async ({ page, request }) => {
  const club = await createClub(request, 'e07-s09')
  try {
    const admin = club.adminToken
    expect((await updateClubSettings(request, admin, { defaultLocale: 'en' })).status).toBe(200)
    const slug = `e07s09-${uniqueSuffix()}`.toLowerCase()
    await publish(request, admin, slug, [])
    const since = calendarDate(-60)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const tennis = await createStructure(request, admin, 'sections', { name: 'Tenis' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const orliki = await createGroup(request, admin, { sectionId: academy, name: 'Orliki', kind: 'team' })
    const tennisGroup = await createGroup(request, admin, { sectionId: tennis, name: 'Tenis 1', kind: 'class_group' })

    const kasiaEmail = uniqueAddress('kasia-order')
    const kasia = await createPerson(request, admin, {
      firstName: 'Kasia',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(38),
      email: kasiaEmail,
    })
    const piotrEmail = uniqueAddress('piotr-order')
    const piotr = await createPerson(request, admin, {
      firstName: 'Piotr',
      lastName: 'Opiekun',
      birthDate: birthDateTurning(40),
      email: piotrEmail,
    })
    const child = (firstName: string, lastName: string, age: number) =>
      createPerson(request, admin, { firstName, lastName, birthDate: birthDateTurning(age) })
    const jas = await child('Jaś', 'Rodzic', 8)
    const ada = await child('Ada', 'Rodzic', 11)
    const zosia = await child('Zosia', 'Rodzic', 9)
    const ola = await child('Ola', 'Opiekun', 9)
    for (const [ward, guardian, groupId] of [
      [jas, kasia, zaki],
      [ada, kasia, orliki],
      [zosia, kasia, tennisGroup],
      [ola, piotr, zaki],
    ] as const) {
      await createGuardianship(request, admin, {
        guardianPersonId: guardian,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: since,
      })
      await addMembership(request, admin, { groupId, personId: ward, role: 'participant', validFrom: since })
    }
    const account = await createAccount(request, admin, kasia, kasiaEmail)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    const kasiaUserId = String(account.body?.userId)
    club.extraUserIds.push(kasiaUserId)

    const created = await postCampaign(request, admin, {
      name: 'Strój akademii 2026/27',
      description: 'Zamawiamy stroje meczowe.',
      sectionId: academy,
      groupIds: [zaki, orliki],
      closesOn: calendarDate(14),
      paymentDueOn: calendarDate(21),
      askPrintName: true,
      askPrintNumber: true,
      notesLabel: 'Uwagi',
      open: true,
      products: [
        {
          key: 'shirt',
          name: 'Koszulka',
          sizesChild: ['116', '128'],
          sizesAdult: ['S', 'M'],
          priceChild: 6000,
          priceAdult: 7000,
          requiredAnswer: true,
        },
        { key: 'shorts', name: 'Spodenki', sizesChild: ['116', '128'], priceChild: 4000, requiredAnswer: true },
        { key: 'socks', name: 'Getry', priceChild: 1500 },
        { key: 'kit', name: 'Komplet', kind: 'set', componentKeys: ['shirt', 'shorts'], priceChild: 9000 },
      ],
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const campaignId = String(created.body?.id)
    let kasiaToken = await signInAs(request, club, kasiaUserId, kasiaEmail)

    const form = async (token: string) => {
      const result = await call<FormBody>(request, 'GET', `/api/payments/order-campaigns/${campaignId}/form`, token)
      expect(result.status, JSON.stringify(result.body)).toBe(200)
      return result.body as FormBody
    }
    const place = (token: string, data: Record<string, unknown>) =>
      call<OrderBody>(request, 'POST', '/api/payments/orders', token, { data: { campaignId, ...data } })
    const contact = { contactEmail: kasiaEmail, contactPhone: '600 100 200' }

    // M-16: the campaign covers Jaś and Ada, not Zosia.
    const mine = await call<MyOrdersBody>(request, 'GET', '/api/payments/my-orders', kasiaToken)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    expect(mine.body?.items).toHaveLength(1)
    expect(mine.body?.items[0].children.map((entry) => [entry.firstName, entry.state, entry.groupName])).toEqual([
      ['Jaś', 'not_ordered', 'Żaki'],
      ['Ada', 'not_ordered', 'Orliki'],
    ])
    const first = await form(kasiaToken)
    expect(first.campaign.ordersOpen).toBe(true)
    expect(first.children.map((entry) => entry.firstName)).toEqual(['Jaś', 'Ada'])
    const products = (
      await call<{ products: { id: string; name: string }[] }>(
        request,
        'GET',
        `/api/payments/order-campaigns/${campaignId}/form`,
        kasiaToken,
      )
    ).body?.products as { id: string; name: string }[]
    const id = (name: string) => products.find((product) => product.name === name)?.id as string

    // A child outside the campaign's groups (403), a missing answer and a set without a size (422).
    const outside = await place(kasiaToken, { participantPersonId: zosia, setSelected: true, ...contact })
    expect(outside.status, JSON.stringify(outside.body)).toBe(403)
    expect(outside.body?.code).toBe('order_child_not_in_campaign')
    const missing = await place(kasiaToken, {
      participantPersonId: jas,
      setSelected: false,
      choices: { [id('Spodenki')]: '128' },
      ...contact,
    })
    expect(missing.status, JSON.stringify(missing.body)).toBe(422)
    expect(missing.body?.code).toBe('order_answer_missing')
    expect(missing.body?.fieldErrors?.choices).toContain('Koszulka')
    const noSize = await place(kasiaToken, {
      participantPersonId: jas,
      setSelected: true,
      choices: { [id('Koszulka')]: '128' },
      ...contact,
    })
    expect(noSize.body?.code).toBe('order_set_size_missing')

    // Kasia orders the set with sizes, the socks and "JAŚ 8": the charge is on M-08 and a copy is e-mailed.
    const jasOrder = await place(kasiaToken, {
      participantPersonId: jas,
      setSelected: true,
      choices: { [id('Koszulka')]: '128', [id('Spodenki')]: '128', [id('Getry')]: 'yes' },
      printName: 'Jaś',
      printNumber: 8,
      notes: 'Proszę o dłuższe rękawy',
      ...contact,
    })
    expect(jasOrder.status, JSON.stringify(jasOrder.body)).toBe(201)
    expect(jasOrder.body?.total).toBe(10_500)
    const charges = await myCharges(request, kasiaToken)
    const jasCharge = charges.body?.items?.find((item) => item.id === jasOrder.body?.chargeId)
    expect(jasCharge, JSON.stringify(charges.body)).toMatchObject({ amountDue: 10_500, payable: true, status: 'open' })
    const copy = await awaitEmails(kasiaEmail, 'Your order: Strój akademii 2026/27')
    expect(copy[0].text).toContain('JAŚ 8')
    const again = await place(kasiaToken, {
      participantPersonId: jas,
      setSelected: false,
      choices: { [id('Koszulka')]: '116', [id('Spodenki')]: 'none' },
      ...contact,
    })
    expect(again.status).toBe(409)
    expect(again.body?.code).toBe('order_exists')

    // The link request: an unknown address and Piotr's both answer 202; only Piotr gets a link.
    const unknownEmail = uniqueAddress('nobody-order')
    const linkRequest = (email: string) =>
      publicCall('POST', `/api/payments/public/order-campaigns/${campaignId}/link-request`, { email, clubSlug: slug })
    const unknown = await linkRequest(unknownEmail)
    const known = await linkRequest(piotrEmail.toUpperCase())
    expect([unknown.status, known.status]).toEqual([202, 202])
    expect(unknown.text).toBe(known.text)
    const [linkMail] = await awaitEmails(piotrEmail, 'Your order link')
    expect(emailsTo(unknownEmail, '')).toHaveLength(0)
    const href = linkMail.links.find((link) => link.includes('/club/o/')) as string
    const token = decodeURIComponent(new URL(href).pathname.split('/').pop() ?? '')
    const linkApi = `/api/payments/order-links/${encodeURIComponent(token)}`
    const card = await publicCall('GET', `/api/payments/public/order-campaigns/${campaignId}?club=${slug}`)
    expect(card.status, card.text).toBe(200)
    expect(card.body).toMatchObject({ campaign: { name: 'Strój akademii 2026/27', ordersOpen: true } })

    // M-19: Piotr's link shows Ola with Jaś's number taken; number 8 is refused, 9 is placed; Jaś is not his.
    const linkPage = await publicCall('GET', linkApi)
    expect(linkPage.status, linkPage.text).toBe(200)
    const linkForm = linkPage.body as unknown as FormBody
    expect(linkForm.children.map((entry) => [entry.firstName, entry.takenNumbers])).toEqual([['Ola', [8]]])
    const olaAnswers = {
      participantPersonId: ola,
      setSelected: false,
      choices: { [id('Koszulka')]: 'S', [id('Spodenki')]: 'none' },
      printName: 'Ola',
      contactEmail: piotrEmail,
      contactPhone: '600 300 400',
    }
    const taken = await publicCall('POST', `${linkApi}/orders`, { ...olaAnswers, printNumber: 8 })
    expect(taken.status, taken.text).toBe(422)
    expect(taken.body?.code).toBe('order_print_number_taken')
    expect(String(taken.body?.error)).toBe('Number 8 is already taken by Jaś in group Żaki.')
    const olaOrder = await publicCall('POST', `${linkApi}/orders`, { ...olaAnswers, printNumber: 9 })
    expect(olaOrder.status, olaOrder.text).toBe(201)
    expect(olaOrder.body?.total).toBe(7000)
    const notHis = await publicCall('POST', `${linkApi}/orders`, { ...olaAnswers, participantPersonId: jas })
    expect(notHis.status, notHis.text).toBe(403)
    await awaitEmails(piotrEmail, 'Your order: Strój akademii 2026/27')

    // A paid order: a change below the paid amount and a cancellation answer 409.
    const paidCharge = await getCharge(request, admin, String(jasOrder.body?.chargeId))
    const paid = await recordPayment(request, admin, paidCharge.id, paidCharge.updatedAt, {
      amount: 10_500,
      method: 'cash',
      paidOn: calendarDate(),
    })
    expect(paid.status, JSON.stringify(paid.body)).toBe(201)
    const jasStored = (await form(kasiaToken)).orders.find((order) => order.participantPersonId === jas)
    expect(jasStored).toMatchObject({ printName: 'JAŚ', printNumber: 8, total: 10_500, state: 'paid' })
    const lock = { [OPTIMISTIC_LOCK_HEADER]: String(jasStored?.updatedAt) }
    const cheaper = await call<OrderBody>(
      request,
      'PUT',
      `/api/payments/orders/${String(jasOrder.body?.orderId)}`,
      kasiaToken,
      {
        data: { setSelected: false, choices: { [id('Koszulka')]: '128', [id('Spodenki')]: 'none' }, ...contact },
        headers: lock,
      },
    )
    expect(cheaper.status, JSON.stringify(cheaper.body)).toBe(409)
    expect(cheaper.body?.code).toBe('order_below_paid')
    const cancelPaid = await call<OrderBody>(
      request,
      'POST',
      `/api/payments/orders/${String(jasOrder.body?.orderId)}/cancel`,
      kasiaToken,
      { data: {}, headers: lock },
    )
    expect(cancelPaid.status, JSON.stringify(cancelPaid.body)).toBe(409)
    expect(cancelPaid.body?.code).toBe('order_cancel_paid')

    // Ada's unpaid order: a stale lock token answers 409; the cancellation takes its charge along.
    const adaOrder = await place(kasiaToken, {
      participantPersonId: ada,
      setSelected: false,
      choices: { [id('Koszulka')]: 'M', [id('Spodenki')]: 'none' },
      printNumber: 8,
      ...contact,
    })
    expect(adaOrder.status, JSON.stringify(adaOrder.body)).toBe(201)
    const stale = await call<OrderBody>(
      request,
      'POST',
      `/api/payments/orders/${String(adaOrder.body?.orderId)}/cancel`,
      kasiaToken,
      {
        data: {},
        headers: { [OPTIMISTIC_LOCK_HEADER]: new Date(Date.now() - 3_600_000).toISOString() },
      },
    )
    expect(stale.status).toBe(409)
    const cancelled = await call<OrderBody>(
      request,
      'POST',
      `/api/payments/orders/${String(adaOrder.body?.orderId)}/cancel`,
      kasiaToken,
      { data: {}, headers: { [OPTIMISTIC_LOCK_HEADER]: String(adaOrder.body?.updatedAt) } },
    )
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    expect((await getCharge(request, admin, String(adaOrder.body?.chargeId))).status).toBe('cancelled')

    // After the deadline: "Orders are closed" and every write answers 409; an expired link answers 410.
    await setClosesOn(campaignId, calendarDate(-1))
    expect((await form(kasiaToken)).campaign.ordersOpen).toBe(false)
    const late = await place(kasiaToken, {
      participantPersonId: ada,
      setSelected: false,
      choices: { [id('Koszulka')]: 'M', [id('Spodenki')]: 'none' },
      ...contact,
    })
    expect(late.status, JSON.stringify(late.body)).toBe(409)
    expect(late.body?.code).toBe('campaign_closed')
    const lateLink = await publicCall(
      'POST',
      `${linkApi}/orders`,
      { ...olaAnswers, participantPersonId: undefined, id: olaOrder.body?.orderId, printNumber: 10 },
      { [OPTIMISTIC_LOCK_HEADER]: String(olaOrder.body?.updatedAt) },
    )
    expect(lateLink.status, lateLink.text).toBe(409)
    expect(lateLink.body?.code).toBe('campaign_closed')
    await expireOrderLinks(piotr)
    const expired = await publicCall('GET', linkApi)
    expect(expired.status, expired.text).toBe(410)
    expect(expired.body?.code).toBe('token_link_expired')
    await setClosesOn(campaignId, calendarDate(14))

    // The browser: M-16 and M-17 for Kasia (signInBrowser ends her API token), then the share link without a session.
    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, kasiaUserId, kasiaEmail)
    kasiaToken = ''
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/club/orders')
    const jasRow = page.locator('[data-testid="club-order-child"][data-child="Jaś"]')
    await expect(jasRow).toContainText(/Paid|Opłacone/)
    const adaRow = page.locator('[data-testid="club-order-child"][data-child="Ada"]')
    await expect(adaRow).toContainText(/Not ordered|Nie zamówiono/)
    await adaRow.getByRole('link').click()
    await expect(page.getByTestId('order-form')).toBeVisible()
    await expect(page.getByTestId('order-email')).toHaveValue(kasiaEmail)
    await page.getByTestId(`order-product-${id('Koszulka')}`).click()
    await page.getByRole('option', { name: '128', exact: true }).click()
    await page.getByTestId(`order-product-${id('Spodenki')}`).click()
    await page.getByRole('option', { name: '116', exact: true }).click()
    await page.getByTestId(`order-product-${id('Getry')}`).click()
    await page.getByRole('option', { name: /Not ordering|Nie zamawiam/ }).click()
    await page.getByTestId('order-print-number').fill('11')
    await expect(page.getByTestId('order-total')).toContainText('90')
    await expectNoPageOverflow(page)
    await page.getByTestId('order-submit').click()
    await expect(page.getByTestId('order-summary')).toBeVisible()
    await expect(page.getByTestId('order-summary-total')).toContainText('90')
    await expect(page.getByTestId('order-pay-online')).toBeVisible()
    await expectNoPageOverflow(page)

    await signOutBrowser(page)
    await page.goto(`/club/orders/${campaignId}?club=${slug}`)
    await expect(page.getByTestId('order-card')).toContainText('Strój akademii 2026/27')
    await expect(page.getByTestId('order-sign-in')).toBeVisible()
    await page.getByTestId('order-link-email').fill(unknownEmail)
    await page.getByTestId('order-link-request').click()
    await expect(page.getByTestId('order-link-sent')).toBeVisible()
    await expectNoPageOverflow(page)
    expect(kasiaToken).toBe('')
  } finally {
    await club.cleanup()
  }
})
