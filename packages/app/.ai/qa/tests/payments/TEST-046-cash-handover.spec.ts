import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { expectNoPageOverflow, scanInColorSchemes } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, call, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'
import { chargeOf, createFee, generate, listCharges, periodFromNow, type CodedBody } from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-046 (payments spec phase 4 step 10, the administrator half — REQ-033, J-010 steps 3–5; issue #118 E07-S11, B-33,
// flow F-14). The treasurer's assertions (the `vereino_treasurer` role, its finance-only menu and the access denied to
// `/backend/people/persons`) wait in #245. Coach Wojtek takes PLN 535 in cash in three payments (three KP receipts);
// B-33 lists him with the receipts, the oldest day and the total; the administrator accepts the handover in the
// browser ("I confirm receipt of the cash"): the toast names RG/YYYY/MM/001, his "Cash with you" drops to 0, the
// history lists the number and B-33 says "All accepted cash is with the treasurer". Accepting the same payments again
// → 409 `cash_already_settled`; payments of another collector → 422; cash the administrator accepts is settled at once
// (no collector); the coach without `payments.cash.settle` → 403. B-33 fits 375 px and passes axe in both schemes.
test.describe.configure({ timeout: 300_000 })

type Custody = CodedBody & {
  items?: {
    collectorPersonId: string
    collector: { firstName: string; lastName: string } | null
    oldestPaidOn: string
    total: number
    payments: { paymentId: string; receiptNumber: string; amount: number }[]
  }[]
  total?: number
}

type Handover = CodedBody & { number?: string; amount?: number; paymentIds?: string[] }

type Held = CodedBody & { cash?: { total: number; paymentCount: number } }

const RG = /^RG\/\d{4}\/\d{2}\/\d{3}$/

function custody(request: APIRequestContext, token: string) {
  return call<Custody>(request, 'GET', '/api/payments/cash-custody', token)
}

function accept(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<Handover>(request, 'POST', '/api/payments/cash-handovers', token, { data })
}

test('TEST-046 B-33: cash held by a coach, a numbered handover, 409 on a settled payment', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-046')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const since = calendarDate(-120)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const parent = await createPerson(request, admin, {
      firstName: 'Ewa',
      lastName: 'Gotówka',
      birthDate: birthDateTurning(40),
    })
    const children: string[] = []
    for (const firstName of ['Ola', 'Ela', 'Ula', 'Iza']) {
      const child = await createPerson(request, admin, {
        firstName,
        lastName: 'Gotówka',
        birthDate: birthDateTurning(9),
      })
      await createGuardianship(request, admin, {
        guardianPersonId: parent,
        wardPersonId: child,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: since,
      })
      await addMembership(request, admin, { groupId: zaki, personId: child, role: 'participant', validFrom: since })
      children.push(child)
    }
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 20000,
      dueDay: 28,
      validFrom: since,
    })
    const period = periodFromNow(0)
    expect((await generate(request, admin, period)).status).toBe(200)
    const charges = await listCharges(request, admin, `&period=${period}`)
    const [olaFee, elaFee, ulaFee, izaFee] = children.map((child) => chargeOf(charges, child, fee))

    const wojtek = await signedInStaff(request, club, { firstName: 'Wojtek', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, { groupId: zaki, personId: wojtek.personId, role: 'coach', validFrom: since })

    // Nothing to settle yet; the coach has no access to B-33.
    const empty = await custody(request, admin)
    expect(empty.status, JSON.stringify(empty.body)).toBe(200)
    expect(empty.body).toEqual({ items: [], total: 0 })
    expect((await custody(request, wojtek.token)).status).toBe(403)
    expect((await accept(request, wojtek.token, { collectorPersonId: wojtek.personId, paymentIds: [] })).status).toBe(
      403,
    )

    // Wojtek takes PLN 200 + 200 + 135 in three acceptances: three KP receipts, PLN 535 with him.
    const receipts: string[] = []
    for (const [charge, amount] of [
      [olaFee, 20000],
      [elaFee, 20000],
      [ulaFee, 13500],
    ] as const) {
      const taken = await call<CodedBody & { receiptNumber?: string }>(
        request,
        'POST',
        '/api/payments/group-charges/cash',
        wojtek.token,
        {
          data: { groupId: zaki, participantPersonId: charge.personId, chargeIds: [charge.id], amount, paidOn: today },
        },
      )
      expect(taken.status, JSON.stringify(taken.body)).toBe(201)
      receipts.push(String(taken.body?.receiptNumber))
    }
    const held = await call<Held>(request, 'GET', '/api/payments/group-charges', wojtek.token)
    expect(held.body?.cash).toMatchObject({ total: 53500, paymentCount: 3 })

    // Cash the administrator accepts goes straight to the club: no collector, nothing to settle.
    const direct = await call<CodedBody & { payments?: { paymentId: string }[] }>(
      request,
      'POST',
      '/api/payments/cash',
      admin,
      { data: { payerPersonId: parent, chargeIds: [izaFee.id], amount: 5000, paidOn: today, notify: false } },
    )
    expect(direct.status, JSON.stringify(direct.body)).toBe(201)
    const directRow = await withClient((client) =>
      client.query<{ collected_by_person_id: string | null; recorded_by_person_id: string | null }>(
        'select collected_by_person_id, recorded_by_person_id from payments_payments where id = $1',
        [direct.body?.payments?.[0]?.paymentId],
      ),
    )
    expect(directRow.rows).toEqual([{ collected_by_person_id: null, recorded_by_person_id: club.adminPersonId }])

    // B-33: Wojtek with his three receipts, the oldest day and the total.
    const listed = await custody(request, admin)
    expect(listed.body?.total).toBe(53500)
    expect(listed.body?.items).toHaveLength(1)
    const [row] = listed.body?.items ?? []
    expect(row).toMatchObject({
      collectorPersonId: wojtek.personId,
      collector: { firstName: 'Wojtek', lastName: 'Trener' },
      oldestPaidOn: today,
      total: 53500,
    })
    expect(row.payments.map((payment) => payment.receiptNumber).sort()).toEqual([...receipts].sort())
    const paymentIds = row.payments.map((payment) => payment.paymentId)

    // Another collector's payments → 422 (one handover is one collector).
    const foreign = await accept(request, admin, { collectorPersonId: club.adminPersonId, paymentIds })
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(422)
    expect(foreign.body?.code).toBe('cash_handover_payments_invalid')

    // The administrator accepts the handover in the browser.
    page.setDefaultTimeout(30_000)
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/backend/payments/cash-custody')
    await expect(page.getByTestId('custody-person')).toHaveText('Wojtek Trener')
    for (const receipt of receipts) await expect(page.getByTestId('custody-receipts')).toContainText(receipt)
    await page.getByTestId('custody-accept').click()
    await expect(page.getByTestId('handover-payment')).toHaveCount(3)
    await page.getByTestId('handover-confirm').click()
    // The number is read from the history row: the toast text matches the same pattern and
    // both are on screen together, so a page-wide getByText is ambiguous (strict mode).
    const handoverNumber = page.getByTestId('handover-number')
    await expect(handoverNumber).toHaveText([/RG\/\d{4}\/\d{2}\/001/])
    const number = String((await handoverNumber.textContent())?.match(/RG\/\d{4}\/\d{2}\/\d{3}/)?.[0])
    expect(number).toMatch(RG)
    expect(number.slice(3, 10)).toBe(`${today.slice(0, 4)}/${today.slice(5, 7)}`)
    await expect(page.getByText(uiText('payments.cashCustody.accept.done', { params: { number } }))).toBeVisible()
    await expect(page.getByTestId('custody-empty')).toHaveText(uiText('payments.cashCustody.empty', { exact: true }))
    await expect(page.getByTestId('handover-number')).toHaveText([number])

    // Stored: the handover with the amount and the payments; Wojtek's "Cash with you" drops to 0.
    const stored = await withClient((client) =>
      client.query<{ number: string; amount: number; collector_person_id: string; settled: string }>(
        `select h.number, h.amount, h.collector_person_id,
                (select count(*) from payments_payments p where p.cash_handover_id = h.id)::text as settled
           from payments_cash_handovers h where h.organization_id = $1`,
        [club.tenant.organizationId],
      ),
    )
    expect(stored.rows).toEqual([{ number, amount: 53500, collector_person_id: wojtek.personId, settled: '3' }])
    const afterHandover = await call<Held>(request, 'GET', '/api/payments/group-charges', wojtek.token)
    expect(afterHandover.body?.cash).toMatchObject({ total: 0, paymentCount: 0 })
    expect(await custody(request, club.adminToken)).toMatchObject({ status: 200, body: { items: [], total: 0 } })
    const history = await call<CodedBody & { items?: { number: string; amount: number; paymentCount: number }[] }>(
      request,
      'GET',
      '/api/payments/cash-handovers',
      club.adminToken,
    )
    expect(history.body?.items).toEqual([expect.objectContaining({ number, amount: 53500, paymentCount: 3 })])

    // A payment already settled → 409.
    const again = await accept(request, club.adminToken, { collectorPersonId: wojtek.personId, paymentIds })
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body?.code).toBe('cash_already_settled')

    // B-33 on a phone and in both colour schemes.
    await page.setViewportSize({ width: 375, height: 812 })
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'B-33',
      async () => {
        await expect(page.getByTestId('custody-empty')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
    await expectNoPageOverflow(page)
  } finally {
    await club.cleanup()
  }
})
