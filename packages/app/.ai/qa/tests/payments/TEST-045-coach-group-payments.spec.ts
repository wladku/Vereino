import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { expectNoPageOverflow } from '../_fixtures/axe'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { awaitEmails } from '../_fixtures/communication'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { uniqueAddress } from '../_fixtures/messaging'
import { getCampaign, postCampaign, seedOrder, transition } from '../_fixtures/orders'
import { createGuardianship } from '../_fixtures/people'
import {
  chargeOf,
  createFee,
  generate,
  getCharge,
  listCharges,
  periodFromNow,
  type CodedBody,
} from '../_fixtures/payments'

// TEST-045 (payments spec phase 4 step 10, the coach part shipped with the phase — REQ-033, DD-31, DD-32; issue #117
// E07-S10; M-18). The treasurer's settlement and the RG handover numbers moved to TEST-046 (E07-S11, owner's Q1
// decision of 2026-11-09). Coach Marek leads Żaki (academy); Bartek has last month's Żaki fee overdue, this month's
// open, a kit order and a tennis fee of another section; Adam has an overdue fee and an unpaid kit; Kuba has no payer.
// The coach sees only Żaki's charges without the discount; accepts PLN 235 for Bartek's overdue fee and kit at once —
// one KP, an e-mail to his mother, "Cash with you" grows by 235; an amount above the selection → 422; another section's
// fee, a child outside the group → 403, another group → 403; a charge without a payer → 422. "Send reminder" e-mails
// Adam's father; "Remind guardians" works for the coach's group. Kit before the delivery → 409; after it a paid kit is
// handed over, an unpaid one only after the warning. With `view` the fees have no "Accept cash" (403 on attempt), with
// `none` only orders show. A coordinator sees the section's groups, another section's coach does not see Żaki, a
// member without the feature → 403. M-18 fits 375 px.
test.describe.configure({ timeout: 360_000 })

type GroupCharge = {
  id: string
  kind: string
  remaining: number
  collectible: boolean
  overdue: boolean
  order: { id: string; canHandOver: boolean; handedOverAt: string | null } | null
} & Record<string, unknown>

type GroupView = CodedBody & {
  coachFeeAccess?: string
  groups?: { id: string; name: string; peopleToPay: number }[]
  groupId?: string | null
  group?: { totalDue: number; peopleToPay: number; peopleOverdue: number } | null
  children?: { personId: string; due: number; payerMissing: boolean; charges: GroupCharge[] }[]
  campaigns?: { id: string; missing: number; shareText: string; link: string }[]
  cash?: { items: { receiptNumber: string; amount: number }[]; total: number; paymentCount: number }
}

type CashBody = CodedBody & { receiptNumber?: string; amount?: number; notified?: number; selectedAmount?: number }

const KP = /^KP\/\d{4}\/\d{2}\/\d{3}$/

function view(request: APIRequestContext, token: string, query = '') {
  return call<GroupView>(request, 'GET', `/api/payments/group-charges${query}`, token)
}

function collect(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CashBody>(request, 'POST', '/api/payments/group-charges/cash', token, { data })
}

function handOver(request: APIRequestContext, token: string, orderId: string, data: Record<string, unknown>) {
  return call<CodedBody & { unpaid?: boolean }>(request, 'POST', `/api/payments/orders/${orderId}/hand-over`, token, {
    data,
  })
}

async function setCoachFeeAccess(request: APIRequestContext, token: string, value: string) {
  const current = await call<{ updatedAt?: string | null }>(request, 'GET', '/api/payments/settings', token)
  const lock = current.body?.updatedAt
  const saved = await call(request, 'PUT', '/api/payments/settings', token, {
    data: { coachFeeAccess: value },
    headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {},
  })
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
}

function childOf(body: GroupView | null, personId: string) {
  const child = body?.children?.find((row) => row.personId === personId)
  if (!child) throw new Error(`no child ${personId} in ${JSON.stringify(body)}`)
  return child
}

test('TEST-045 coach group payments: fees and kit of my group, cash with one receipt, reminders and kit', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-045')
  try {
    const admin = club.adminToken
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const today = calendarDate()
    const since = calendarDate(-120)
    const older = periodFromNow(-1)
    const current = periodFromNow(0)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const tennis = await createStructure(request, admin, 'sections', { name: 'Tenis' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const orliki = await createGroup(request, admin, { sectionId: academy, name: 'Orliki', kind: 'team' })
    const tennisGroup = await createGroup(request, admin, { sectionId: tennis, name: 'Tenis 1', kind: 'class_group' })

    const annaEmail = uniqueAddress('anna-coach')
    const piotrEmail = uniqueAddress('piotr-coach')
    const anna = await createPerson(request, admin, {
      firstName: 'Anna',
      lastName: 'Nowak',
      birthDate: birthDateTurning(38),
      email: annaEmail,
    })
    const piotr = await createPerson(request, admin, {
      firstName: 'Piotr',
      lastName: 'Kowal',
      birthDate: birthDateTurning(41),
      email: piotrEmail,
    })
    const bartek = await createPerson(request, admin, {
      firstName: 'Bartek',
      lastName: 'Nowak',
      birthDate: birthDateTurning(9),
    })
    const adam = await createPerson(request, admin, {
      firstName: 'Adam',
      lastName: 'Kowal',
      birthDate: birthDateTurning(9),
    })
    const kuba = await createPerson(request, admin, {
      firstName: 'Kuba',
      lastName: 'Sam',
      birthDate: birthDateTurning(9),
    })
    const ada = await createPerson(request, admin, {
      firstName: 'Ada',
      lastName: 'Nowak',
      birthDate: birthDateTurning(11),
    })
    for (const [ward, guardian] of [
      [bartek, anna],
      [ada, anna],
      [adam, piotr],
    ] as const) {
      await createGuardianship(request, admin, {
        guardianPersonId: guardian,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: since,
      })
    }
    for (const personId of [bartek, adam, kuba]) {
      await addMembership(request, admin, { groupId: zaki, personId, role: 'participant', validFrom: since })
    }
    await addMembership(request, admin, { groupId: orliki, personId: ada, role: 'participant', validFrom: since })
    await addMembership(request, admin, {
      groupId: tennisGroup,
      personId: bartek,
      role: 'participant',
      validFrom: since,
    })

    const zakiFee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 28,
      validFrom: since,
    })
    const tennisFee = await createFee(request, admin, {
      name: 'Tenis',
      groupId: tennisGroup,
      period: 'monthly',
      amount: 10000,
      dueDay: 28,
      validFrom: since,
    })
    for (const period of [older, current]) expect((await generate(request, admin, period)).status).toBe(200)
    const olderCharges = await listCharges(request, admin, `&period=${older}`)
    const currentCharges = await listCharges(request, admin, `&period=${current}`)
    const bartekOlder = chargeOf(olderCharges, bartek, zakiFee)
    const bartekCurrent = chargeOf(currentCharges, bartek, zakiFee)
    const bartekTennis = chargeOf(currentCharges, bartek, tennisFee)
    const adamOlder = chargeOf(olderCharges, adam, zakiFee)
    const kubaCurrent = chargeOf(currentCharges, kuba, zakiFee)

    // A kit campaign for Żaki and Orliki, collecting orders; Bartek's and Adam's kits.
    const created = await postCampaign(request, admin, {
      name: 'Strój akademii',
      sectionId: academy,
      groupIds: [zaki, orliki],
      closesOn: calendarDate(14),
      paymentDueOn: calendarDate(21),
      products: [{ key: 'kit', name: 'Komplet', sizesChild: ['128', '140'], priceChild: 8500, requiredAnswer: true }],
      open: true,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const campaignId = String(created.body?.id)
    const [kitProduct] = (await getCampaign(request, admin, campaignId)).products
    const bartekKit = await seedOrder(scope, {
      campaignId,
      participantPersonId: bartek,
      orderedByPersonId: anna,
      paymentDueOn: calendarDate(21),
      lines: [{ productId: kitProduct.id, size: '140', unitPrice: 8500 }],
    })
    const adamKit = await seedOrder(scope, {
      campaignId,
      participantPersonId: adam,
      orderedByPersonId: piotr,
      paymentDueOn: calendarDate(21),
      lines: [{ productId: kitProduct.id, size: '128', unitPrice: 8500 }],
    })

    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, { groupId: zaki, personId: coach.personId, role: 'coach', validFrom: since })
    const tennisCoach = await signedInStaff(request, club, { firstName: 'Tomasz', lastName: 'Rakieta', role: 'coach' })
    await addMembership(request, admin, {
      groupId: tennisGroup,
      personId: tennisCoach.personId,
      role: 'coach',
      validFrom: since,
    })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Krystyna',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: academy,
    })

    // M-18 for the coach: Żaki only, its fees and kit, no tennis fee, no discount; Kuba without a payer.
    const seen = await view(request, coach.token)
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body?.groups?.map((group) => group.name)).toEqual(['Żaki'])
    expect(seen.body?.coachFeeAccess).toBe('collect')
    const bartekRow = childOf(seen.body, bartek)
    expect(bartekRow.charges.map((charge) => charge.id).sort()).toEqual(
      [bartekOlder.id, bartekCurrent.id, bartekKit.chargeId].sort(),
    )
    for (const charge of bartekRow.charges) {
      expect(charge).not.toHaveProperty('discountAmount')
      expect(charge).not.toHaveProperty('discountRuleId')
    }
    expect(bartekRow.charges.find((charge) => charge.id === bartekOlder.id)).toMatchObject({
      overdue: true,
      collectible: true,
    })
    const kubaRow = childOf(seen.body, kuba)
    expect(kubaRow.payerMissing).toBe(true)
    expect(kubaRow.charges.every((charge) => !charge.collectible)).toBe(true)
    expect(seen.body?.children?.some((row) => row.personId === ada)).toBe(false)
    expect(seen.body?.campaigns?.[0]).toMatchObject({ id: campaignId, missing: 1 })
    expect(seen.body?.campaigns?.[0]?.shareText).toContain(`/club/orders/${campaignId}`)
    expect(seen.body?.cash).toMatchObject({ total: 0, paymentCount: 0 })

    // Refusals: more than the selection, another section's fee, a child outside the group, another group, no payer.
    const over = await collect(request, coach.token, {
      groupId: zaki,
      participantPersonId: bartek,
      chargeIds: [bartekOlder.id, bartekKit.chargeId],
      amount: 23501,
      paidOn: today,
    })
    expect(over.status, JSON.stringify(over.body)).toBe(422)
    expect(over.body).toMatchObject({ code: 'cash_exceeds_selected', selectedAmount: 23500 })
    const foreignFee = await collect(request, coach.token, {
      groupId: zaki,
      participantPersonId: bartek,
      chargeIds: [bartekTennis.id],
      amount: 1000,
      paidOn: today,
    })
    expect(foreignFee.status, JSON.stringify(foreignFee.body)).toBe(403)
    expect(foreignFee.body?.code).toBe('charge_out_of_scope')
    const outsider = await collect(request, coach.token, {
      groupId: zaki,
      participantPersonId: ada,
      chargeIds: [bartekOlder.id],
      amount: 1000,
      paidOn: today,
    })
    expect(outsider.status, JSON.stringify(outsider.body)).toBe(403)
    expect(outsider.body?.code).toBe('charge_out_of_scope')
    const otherGroup = await collect(request, coach.token, {
      groupId: orliki,
      participantPersonId: ada,
      chargeIds: [bartekOlder.id],
      amount: 1000,
      paidOn: today,
    })
    expect(otherGroup.status, JSON.stringify(otherGroup.body)).toBe(403)
    const noPayer = await collect(request, coach.token, {
      groupId: zaki,
      participantPersonId: kuba,
      chargeIds: [kubaCurrent.id],
      amount: 1000,
      paidOn: today,
    })
    expect(noPayer.status, JSON.stringify(noPayer.body)).toBe(422)
    expect(noPayer.body?.code).toBe('charge_payer_missing')

    // PLN 235 for Bartek's overdue fee and kit: one KP, his mother's e-mail, "Cash with you" grows by 235.
    const accepted = await collect(request, coach.token, {
      groupId: zaki,
      participantPersonId: bartek,
      chargeIds: [bartekKit.chargeId, bartekOlder.id],
      amount: 23500,
      paidOn: today,
    })
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201)
    const receipt = String(accepted.body?.receiptNumber)
    expect(receipt).toMatch(KP)
    expect(accepted.body?.notified).toBe(1)
    const stored = await withClient((client) =>
      client.query<{ receipt_number: string; collected_by_person_id: string }>(
        'select receipt_number, collected_by_person_id from payments_payments where charge_id = any($1::uuid[])',
        [[bartekOlder.id, bartekKit.chargeId]],
      ),
    )
    expect(stored.rows).toEqual([
      { receipt_number: receipt, collected_by_person_id: coach.personId },
      { receipt_number: receipt, collected_by_person_id: coach.personId },
    ])
    expect((await getCharge(request, admin, bartekOlder.id)).status).toBe('paid')
    const [mail] = await awaitEmails(annaEmail, receipt)
    expect(mail?.text).toContain(receipt)
    const afterCash = await view(request, coach.token)
    expect(afterCash.body?.cash).toMatchObject({ total: 23500, paymentCount: 2 })
    expect(afterCash.body?.cash?.items.map((item) => item.receiptNumber)).toEqual([receipt])
    const paidAgain = await collect(request, coach.token, {
      groupId: zaki,
      participantPersonId: bartek,
      chargeIds: [bartekKit.chargeId],
      amount: 100,
      paidOn: today,
    })
    expect(paidAgain.status, JSON.stringify(paidAgain.body)).toBe(409)
    expect(paidAgain.body?.code).toBe('charge_already_paid')
    // A paid fee of an earlier period leaves M-18, so it is out of the coach's scope.
    const paidOlder = await collect(request, coach.token, {
      groupId: zaki,
      participantPersonId: bartek,
      chargeIds: [bartekOlder.id],
      amount: 100,
      paidOn: today,
    })
    expect(paidOlder.status).toBe(403)
    expect(paidOlder.body?.code).toBe('charge_out_of_scope')

    // "Send reminder": Adam's overdue fee to his father; "Remind guardians" for the coach's group.
    const reminded = await call<CodedBody & { charges?: number; recipients?: number }>(
      request,
      'POST',
      '/api/payments/group-charges/remind',
      coach.token,
      { data: { groupId: zaki, participantPersonId: adam } },
    )
    expect(reminded.status, JSON.stringify(reminded.body)).toBe(200)
    expect(reminded.body?.recipients).toBe(1)
    expect(reminded.body?.charges).toBeGreaterThanOrEqual(1)
    const [reminder] = await awaitEmails(piotrEmail, 'Adam')
    expect(reminder?.text).toContain(adamOlder.description ?? 'Żaki')
    const campaignReminded = await call<CodedBody & { children?: number }>(
      request,
      'POST',
      `/api/payments/group-charges/campaigns/${campaignId}/remind`,
      coach.token,
      { data: { groupId: zaki } },
    )
    expect(campaignReminded.status, JSON.stringify(campaignReminded.body)).toBe(200)
    expect(campaignReminded.body?.children).toBe(1)
    const foreignRemind = await call(
      request,
      'POST',
      `/api/payments/group-charges/campaigns/${campaignId}/remind`,
      coach.token,
      {
        data: { groupId: orliki },
      },
    )
    expect(foreignRemind.status).toBe(403)

    // Kit: 409 before the delivery; after it the paid kit is handed over, the unpaid one only after the warning.
    const early = await handOver(request, coach.token, bartekKit.orderId, { groupId: zaki })
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body?.code).toBe('order_not_delivered')
    let lock = (await getCampaign(request, admin, campaignId)).updatedAt
    for (const action of ['close', 'mark-ordered', 'mark-delivered']) {
      const moved = await transition(request, admin, campaignId, action, lock)
      expect(moved.status, JSON.stringify(moved.body)).toBe(200)
      lock = String(moved.body?.updatedAt)
    }
    const paidKit = await handOver(request, coach.token, bartekKit.orderId, { groupId: zaki })
    expect(paidKit.status, JSON.stringify(paidKit.body)).toBe(200)
    expect(paidKit.body?.unpaid).toBe(false)
    expect((await handOver(request, coach.token, bartekKit.orderId, { groupId: zaki })).body?.code).toBe(
      'order_already_handed_over',
    )
    const unpaid = await handOver(request, coach.token, adamKit.orderId, { groupId: zaki })
    expect(unpaid.status).toBe(409)
    expect(unpaid.body?.code).toBe('order_unpaid_confirm_required')
    const confirmed = await handOver(request, coach.token, adamKit.orderId, { groupId: zaki, confirmUnpaid: true })
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
    expect(confirmed.body?.unpaid).toBe(true)
    expect((await getCharge(request, admin, adamKit.chargeId)).status).toBe('open')

    // "Coaches and payments" = view: fees shown without cash (403 on attempt); = none: only orders.
    await setCoachFeeAccess(request, admin, 'view')
    const viewOnly = await view(request, coach.token)
    expect(viewOnly.body?.coachFeeAccess).toBe('view')
    const bartekView = childOf(viewOnly.body, bartek)
    expect(bartekView.charges.find((charge) => charge.id === bartekCurrent.id)?.collectible).toBe(false)
    const viewDenied = await collect(request, coach.token, {
      groupId: zaki,
      participantPersonId: bartek,
      chargeIds: [bartekCurrent.id],
      amount: 1000,
      paidOn: today,
    })
    expect(viewDenied.status, JSON.stringify(viewDenied.body)).toBe(403)
    expect(viewDenied.body?.code).toBe('coach_fee_cash_disabled')
    await setCoachFeeAccess(request, admin, 'none')
    const ordersOnly = await view(request, coach.token)
    for (const child of ordersOnly.body?.children ?? []) {
      expect(child.charges.every((charge) => charge.kind === 'order')).toBe(true)
    }
    expect(childOf(ordersOnly.body, adam).charges.map((charge) => charge.id)).toEqual([adamKit.chargeId])
    await setCoachFeeAccess(request, admin, 'collect')

    // Scope of the other roles: the coordinator sees the section's groups, the tennis coach not Żaki.
    const coordinated = await view(request, coordinator.token)
    expect(coordinated.body?.groups?.map((group) => group.name).sort()).toEqual(['Orliki', 'Żaki'])
    const tennisSeen = await view(request, tennisCoach.token)
    expect(tennisSeen.body?.groups?.map((group) => group.name)).toEqual(['Tenis 1'])
    expect((await view(request, tennisCoach.token, `?groupId=${zaki}`)).body?.children).toEqual([])
    const tennisCash = await collect(request, tennisCoach.token, {
      groupId: zaki,
      participantPersonId: bartek,
      chargeIds: [bartekCurrent.id],
      amount: 1000,
      paidOn: today,
    })
    expect(tennisCash.status).toBe(403)

    // M-18 in the browser on a phone: the coach's children, the cash with them, 375 px.
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, coach.userId, coach.email)
    coach.token = await getAuthToken(request, coach.email, password)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/club/coach/payments')
    await expect(page.getByTestId('coach-cash')).toBeVisible()
    await expect(page.getByTestId('coach-child')).toHaveCount(3)
    await page.getByTestId('coach-filter-due').click()
    await expect(page.getByTestId('coach-child')).toHaveCount(3)
    await expectNoPageOverflow(page)
  } finally {
    await club.cleanup()
  }
})
