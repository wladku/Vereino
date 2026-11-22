import { expect, test, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  getPerson,
  signInAs,
  uniqueSuffix,
  type Club,
} from '../_fixtures/club'
import { create } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { uniqueAddress } from '../_fixtures/messaging'
import { postCampaign } from '../_fixtures/orders'
import { acceptCash, cashToday, getCharge, recordPayment } from '../_fixtures/payments'
import { createGuardianship, endGuardianship, getGuardianship } from '../_fixtures/people'
import { uiTextIn } from '../_fixtures/ui-text'

// TEST-078 (club spec Amendment B, research TEST-C03; REQ-041, REQ-031; with #528): a guardian is the payer of their
// child's fee, paid by transfer, and of a kit order they placed in the app (contact e-mail and phone, print name,
// notes), paid together with a second fee in cash on one `KP` receipt; one of the paid charges carries a typed payer
// label. The family leaves and the guardian asks for erasure; the administrator anonymises them (`people.persons.anonymize`).
// The person is scrubbed; every `payments_payments` row stays exactly as it was (count, amounts, methods, receipt
// numbers); the charges and the receipt list read the payer as "Former member" with no name; the order's contact
// fields and notes are cleared (the child's print name stays), and so is the charge's payer label; the child's own
// data is untouched.
test.describe.configure({ timeout: 300_000 })

type PaymentRow = {
  id: string
  charge_id: string
  amount: number
  method: string
  paid_on: string
  receipt_number: string | null
  reverses_payment_id: string | null
}

const FORMER_MEMBER = [uiTextIn('en', 'people.person.formerMember'), uiTextIn('pl', 'people.person.formerMember')]

async function paymentRows(club: Club, chargeIds: string[]): Promise<PaymentRow[]> {
  return withClient(async (client) => {
    const rows = await client.query<PaymentRow>(
      `select id, charge_id, amount, method, paid_on::text, receipt_number, reverses_payment_id
         from payments_payments where tenant_id = $1 and charge_id = any($2::uuid[]) order by id`,
      [club.tenant.tenantId, chargeIds],
    )
    return rows.rows
  })
}

async function personRow(club: Club, personId: string) {
  return withClient(async (client) => {
    const rows = await client.query<Record<string, string | null>>(
      `select email, phone, notes, birth_date::text, preferred_locale, anonymized_at::text
         from people_persons where tenant_id = $1 and id = $2`,
      [club.tenant.tenantId, personId],
    )
    return rows.rows[0]
  })
}

async function orderRow(club: Club, orderId: string) {
  return withClient(async (client) => {
    const rows = await client.query(
      `select contact_email, contact_phone, print_name, print_number, notes, ordered_by_person_id, charge_id
         from payments_orders where tenant_id = $1 and id = $2`,
      [club.tenant.tenantId, orderId],
    )
    return rows.rows[0]
  })
}

async function payerLabels(club: Club, chargeIds: string[]): Promise<(string | null)[]> {
  return withClient(async (client) => {
    const rows = await client.query<{ payer_label: string | null }>(
      `select payer_label from payments_charges where tenant_id = $1 and id = any($2::uuid[]) order by id`,
      [club.tenant.tenantId, chargeIds],
    )
    return rows.rows.map((row) => row.payer_label)
  })
}

async function addCharge(request: APIRequestContext, token: string, personId: string, amount: number) {
  const created = await call<{ chargeId?: string; payerMissing?: boolean }>(
    request,
    'POST',
    '/api/payments/charges',
    token,
    { data: { personId, description: 'Składka', amount, dueDate: calendarDate(7) } },
  )
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  expect(created.body?.payerMissing).toBe(false)
  return String(created.body?.chargeId)
}

test('TEST-078 anonymising a guardian payer keeps the payments, reads Former member on charges and the KP receipt, clears order contacts and the payer label', async ({
  request,
}) => {
  const club = await createClub(request, 'test-078')
  try {
    const admin = club.adminToken
    const suffix = uniqueSuffix()
      .replace(/[^a-z]/gi, '')
      .slice(0, 6)
    const lastName = `Płatnik${suffix}`
    const since = calendarDate(-60)
    const academy = await create(request, admin, 'sections', { name: `Akademia ${suffix}` })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })

    // The guardian (an account, e-mail and phone) and the child in Żaki; the guardian is the primary payer.
    const guardianEmail = uniqueAddress('guardian-078')
    const guardian = await createPerson(request, admin, {
      firstName: 'Halina',
      lastName,
      birthDate: birthDateTurning(39),
      email: guardianEmail,
      phone: '+48600200300',
      notes: 'Pays in cash at the office',
    })
    const child = await createPerson(request, admin, {
      firstName: 'Antek',
      lastName: `Syn${suffix}`,
      birthDate: birthDateTurning(8),
    })
    const guardianship = await createGuardianship(request, admin, {
      guardianPersonId: guardian,
      wardPersonId: child,
      relation: 'parent',
      isPrimaryPayer: true,
      validFrom: since,
    })
    await addMembership(request, admin, { groupId: zaki, personId: child, role: 'participant', validFrom: since })
    const account = await createAccount(request, admin, guardian, guardianEmail)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    const guardianUserId = String(account.body?.userId)
    club.extraUserIds.push(guardianUserId)
    const guardianToken = await signInAs(request, club, guardianUserId, guardianEmail)

    // A kit order campaign; the guardian orders a shirt for the child with contacts, a print name and notes.
    const campaign = await postCampaign(request, admin, {
      name: `Stroje ${suffix}`,
      sectionId: academy,
      groupIds: [zaki],
      closesOn: calendarDate(14),
      paymentDueOn: calendarDate(21),
      askPrintName: true,
      askPrintNumber: true,
      notesLabel: 'Uwagi',
      open: true,
      products: [{ key: 'shirt', name: 'Koszulka', sizesChild: ['128'], priceChild: 6_000, requiredAnswer: true }],
    })
    expect(campaign.status, JSON.stringify(campaign.body)).toBe(201)
    const campaignId = String(campaign.body?.id)
    const form = await call<{ products: { id: string; name: string }[] }>(
      request,
      'GET',
      `/api/payments/order-campaigns/${campaignId}/form`,
      guardianToken,
    )
    expect(form.status, JSON.stringify(form.body)).toBe(200)
    const shirt = String(form.body?.products.find((product) => product.name === 'Koszulka')?.id)
    const order = await call<{ orderId?: string; chargeId?: string; total?: number }>(
      request,
      'POST',
      '/api/payments/orders',
      guardianToken,
      {
        data: {
          campaignId,
          participantPersonId: child,
          setSelected: false,
          choices: { [shirt]: '128' },
          printName: 'Antek',
          printNumber: 9,
          notes: 'Halina prosi o dłuższe rękawy',
          contactEmail: guardianEmail,
          contactPhone: '600 200 300',
        },
      },
    )
    expect(order.status, JSON.stringify(order.body)).toBe(201)
    const orderId = String(order.body?.orderId)
    const orderCharge = String(order.body?.chargeId)
    expect(order.body?.total).toBe(6_000)

    // Two fees of the child, payer = the guardian: one paid by transfer, the other with the order in cash (one KP).
    const transferCharge = await addCharge(request, admin, child, 12_000)
    const cashCharge = await addCharge(request, admin, child, 5_000)
    const charges = [transferCharge, cashCharge, orderCharge]
    for (const chargeId of charges) {
      expect((await getCharge(request, admin, chargeId)).payerPersonId).toBe(guardian)
    }
    const transfer = await recordPayment(
      request,
      admin,
      transferCharge,
      (await getCharge(request, admin, transferCharge)).updatedAt,
      { amount: 12_000, method: 'transfer', paidOn: calendarDate() },
    )
    expect(transfer.status, JSON.stringify(transfer.body)).toBe(201)
    const cash = await acceptCash(request, admin, {
      payerPersonId: guardian,
      chargeIds: [cashCharge, orderCharge],
      amount: 11_000,
      paidOn: calendarDate(),
      notify: false,
    })
    expect(cash.status, JSON.stringify(cash.body)).toBe(201)
    const receiptNumber = String(cash.body?.receiptNumber)
    expect(receiptNumber).toMatch(/^KP\/\d{4}\/\d{2}\/\d{3}$/)
    for (const chargeId of charges) {
      expect((await getCharge(request, admin, chargeId)).status).toBe('paid')
    }
    // A typed payer label on the transfer-paid charge, stored the way the rental flow stores one (#528, TEST-L07).
    await withClient((client) =>
      client.query(`update payments_charges set payer_label = $3 where tenant_id = $1 and id = $2`, [
        club.tenant.tenantId,
        transferCharge,
        `Halina ${lastName}`,
      ]),
    )

    // Before: the receipt list names the guardian; the payments are recorded.
    const receiptBefore = await call<{ items: { receiptNumber: string; payer: { lastName: string } | null }[] }>(
      request,
      'GET',
      '/api/payments/cash',
      admin,
    )
    expect(receiptBefore.body?.items.find((item) => item.receiptNumber === receiptNumber)?.payer?.lastName).toBe(
      lastName,
    )
    const paymentsBefore = await paymentRows(club, charges)
    expect(paymentsBefore).toHaveLength(3)
    expect(paymentsBefore.filter((row) => row.receipt_number === receiptNumber)).toHaveLength(2)
    const chargesBefore = await Promise.all(charges.map((id) => getCharge(request, admin, id)))

    // The family leaves (a ward is never left without a guardian) and the guardian asks for erasure.
    const preview = await call<{ previewToken?: string }>(request, 'POST', '/api/people/departures/preview', admin, {
      data: { personIds: [guardian, child], lastDay: calendarDate() },
    })
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const departed = await call(request, 'POST', '/api/people/departures', admin, {
      data: { personIds: [guardian, child], lastDay: calendarDate(), previewToken: preview.body?.previewToken },
    })
    expect(departed.status, JSON.stringify(departed.body)).toBe(200)
    // The anonymisation needs the guardianship ended and the login closed first (TEST-L07's blockers).
    const link = await getGuardianship(request, admin, guardianship)
    const ended = await endGuardianship(request, admin, guardianship, link.body?.updatedAt, calendarDate(-1))
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    const closed = await call(request, 'DELETE', `/api/people/persons/${guardian}/account`, admin)
    expect(closed.status, JSON.stringify(closed.body)).toBe(204)
    const erasureRequest = await call<{ id?: string }>(request, 'POST', '/api/people/departure-requests', admin, {
      data: { subjectPersonId: guardian, requesterKind: 'self', erasure: true, note: 'E-mail of 3 November' },
    })
    expect(erasureRequest.status, JSON.stringify(erasureRequest.body)).toBe(201)
    const version = String(((await getPerson(request, admin, guardian)).body as { updatedAt?: string }).updatedAt)
    const anonymised = await call<{ anonymizedAt?: string; erasureHoldUntil?: string | null }>(
      request,
      'POST',
      `/api/people/persons/${guardian}/anonymize`,
      admin,
      {
        data: { requestId: erasureRequest.body?.id, confirmLastName: lastName },
        headers: { [OPTIMISTIC_LOCK_HEADER]: version },
      },
    )
    expect(anonymised.status, JSON.stringify(anonymised.body)).toBe(200)

    // The person is scrubbed (the name stays under the payment hold, for the administrator only).
    const person = await personRow(club, guardian)
    expect(person).toMatchObject({ email: null, phone: null, notes: null, birth_date: null, preferred_locale: null })
    expect(person.anonymized_at).not.toBeNull()

    // Every payment row is unchanged: count, amounts, methods, days, receipt numbers.
    expect(await paymentRows(club, charges)).toEqual(paymentsBefore)
    for (const [index, chargeId] of charges.entries()) {
      const after = await getCharge(request, admin, chargeId)
      const before = chargesBefore[index]
      expect(after).toMatchObject({ amount: before.amount, paid: before.paid, status: 'paid', payerPersonId: guardian })
      expect(after.payments.map((payment) => [payment.id, payment.amount, payment.method])).toEqual(
        before.payments.map((payment) => [payment.id, payment.amount, payment.method]),
      )
      // The payer reads as "Former member", no name; the payer label is gone.
      const payer = (after as unknown as { payer?: { firstName: string; lastName: string } | null }).payer
      expect(FORMER_MEMBER).toContain(payer?.firstName)
      expect(payer?.lastName).toBe('')
      expect(after.payerLabel ?? null).toBeNull()
      expect(JSON.stringify(after)).not.toContain('Halina')
      expect(JSON.stringify(after)).not.toContain(lastName)
    }
    expect(await payerLabels(club, charges)).toEqual([null, null, null])

    // The KP receipt names no one.
    const receiptAfter = await call<{
      items: { receiptNumber: string; amount: number; payer: { firstName: string; lastName: string } | null }[]
    }>(request, 'GET', '/api/payments/cash', admin)
    expect(receiptAfter.status, JSON.stringify(receiptAfter.body)).toBe(200)
    const receipt = receiptAfter.body?.items.find((item) => item.receiptNumber === receiptNumber)
    expect(receipt?.amount).toBe(11_000)
    expect(FORMER_MEMBER).toContain(receipt?.payer?.firstName)
    expect(receipt?.payer?.lastName).toBe('')
    expect(JSON.stringify(receipt)).not.toContain('Halina')
    expect(JSON.stringify(receipt)).not.toContain(lastName)
    const today = await cashToday(request, admin)
    expect(today.body?.items.filter((item) => item.receiptNumber === receiptNumber)).toHaveLength(1)

    // The order loses what the guardian wrote (contact e-mail, phone, notes); it keeps its links and the child's
    // print name and number, which are the participant's data, not the guardian's (the child is not anonymised).
    expect(await orderRow(club, orderId)).toEqual({
      contact_email: null,
      contact_phone: null,
      print_name: 'ANTEK',
      print_number: 9,
      notes: null,
      ordered_by_person_id: guardian,
      charge_id: orderCharge,
    })

    // The child's own data is untouched.
    expect(((await getPerson(request, admin, child)).body as { firstName?: string }).firstName).toBe('Antek')
    expect((await personRow(club, child)).anonymized_at).toBeNull()
  } finally {
    await club.cleanup()
  }
})
