import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { expectNoPageOverflow } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { awaitEmails, emailsTo } from '../_fixtures/communication'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { uniqueAddress } from '../_fixtures/messaging'
import { createGuardianship } from '../_fixtures/people'
import {
  acceptCash,
  cashCharges,
  cashPayers,
  cashToday,
  chargeOf,
  createFee,
  generate,
  getCharge,
  listCharges,
  periodFromNow,
} from '../_fixtures/payments'

// TEST-043 (payments spec phase 4 step 8, REQ-031; issue #114 E07-S07; M-15, B-21): a payer with open charges of
// PLN 150 (due on the 5th) and PLN 85 (due on the 20th) in two months. The payer select lists only payers with
// something to pay, with their wards and the total due. PLN 100 for the older month's two charges pays the older one
// first (PLN 50 left) and leaves the other open; PLN 235 for the newer month's two pays both. Each acceptance issues
// one sequential `KP/YYYY/MM/NNN` number, records the collector and e-mails the payer (not when turned off). An amount
// above the selection → 422, a future date → 422, a paid charge → 409, another payer's charge → 422; "Received by me
// today" sums what the caller accepted; a coach without `payments.cash.record` → 403. The B-21 dialog takes cash in the
// browser and shows the receipt in its toast; `/club/cash` fits 375 px.
test.describe.configure({ timeout: 300_000 })

const KP = /^KP\/\d{4}\/\d{2}\/\d{3}$/
const CASH_TOAST =
  /Received .+ in cash from Jan Dorosły — receipt KP\/|Przyjęto .+ gotówką od Jan Dorosły — dowód wpłaty KP\//

test('TEST-043 cash for several charges, oldest first, with a numbered receipt and an e-mail', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-043')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const older = periodFromNow(-2)
    const newer = periodFromNow(-1)
    const since = calendarDate(-120)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const keepers = await createGroup(request, admin, { sectionId: academy, name: 'Bramkarze', kind: 'team' })
    const annaEmail = uniqueAddress('anna-cash')
    const anna = await createPerson(request, admin, {
      firstName: 'Anna',
      lastName: 'Gotówka',
      birthDate: birthDateTurning(40),
      email: annaEmail,
    })
    const ola = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Gotówka',
      birthDate: birthDateTurning(10),
    })
    const jan = await createPerson(request, admin, {
      firstName: 'Jan',
      lastName: 'Dorosły',
      birthDate: birthDateTurning(30),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: anna,
      wardPersonId: ola,
      relation: 'parent',
      isPrimaryPayer: true,
      validFrom: since,
    })
    for (const groupId of [zaki, keepers]) {
      await addMembership(request, admin, { groupId, personId: ola, role: 'participant', validFrom: since })
    }
    await addMembership(request, admin, { groupId: zaki, personId: jan, role: 'participant', validFrom: since })
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 5,
      validFrom: since,
    })
    const keeperFee = await createFee(request, admin, {
      name: 'Bramkarze',
      groupId: keepers,
      period: 'monthly',
      amount: 8500,
      dueDay: 20,
      validFrom: since,
    })
    for (const period of [older, newer]) expect((await generate(request, admin, period)).status).toBe(200)
    const olderCharges = await listCharges(request, admin, `&period=${older}`)
    const newerCharges = await listCharges(request, admin, `&period=${newer}`)
    const olderFee = chargeOf(olderCharges, ola, fee)
    const olderKit = chargeOf(olderCharges, ola, keeperFee)
    const newerFee = chargeOf(newerCharges, ola, fee)
    const newerKit = chargeOf(newerCharges, ola, keeperFee)
    const janCharge = chargeOf(newerCharges, jan, fee)

    // The payer select: payers with something to pay, their wards and the total due; searchable by a ward's name.
    const payers = await cashPayers(request, admin)
    expect(payers.status, JSON.stringify(payers.body)).toBe(200)
    const annaRow = payers.body?.items.find((item) => item.payerPersonId === anna)
    expect(annaRow).toMatchObject({ totalDue: 47000, chargeCount: 4, wards: [{ personId: ola, firstName: 'Ola' }] })
    expect(payers.body?.items.some((item) => item.payerPersonId === jan)).toBe(true)
    await expect
      .poll(async () => (await cashPayers(request, admin, '?search=Gotówka')).body?.items.map((i) => i.payerPersonId), {
        timeout: 30_000,
      })
      .toEqual([anna])

    // Her charges, oldest first, with what remains.
    const listed = await cashCharges(request, admin, anna)
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect(listed.body?.items.map((item) => item.id)).toEqual([olderFee.id, olderKit.id, newerFee.id, newerKit.id])
    expect(listed.body?.total).toBe(47000)

    // Refusals: more than the selection, a future date, another payer's charge.
    const over = await acceptCash(request, admin, {
      payerPersonId: anna,
      chargeIds: [olderFee.id, olderKit.id],
      amount: 23600,
      paidOn: today,
    })
    expect(over.status, JSON.stringify(over.body)).toBe(422)
    expect(over.body).toMatchObject({ code: 'cash_exceeds_selected', selectedAmount: 23500 })
    const future = await acceptCash(request, admin, {
      payerPersonId: anna,
      chargeIds: [olderFee.id],
      amount: 1000,
      paidOn: calendarDate(1),
    })
    expect(future.status, JSON.stringify(future.body)).toBe(422)
    expect(future.body?.code).toBe('payment_date_in_future')
    const foreign = await acceptCash(request, admin, {
      payerPersonId: anna,
      chargeIds: [olderFee.id, janCharge.id],
      amount: 1000,
      paidOn: today,
    })
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(422)
    expect(foreign.body?.code).toBe('cash_charges_invalid')

    // PLN 100 for both older charges: the older one first (PLN 50 left), the other stays open.
    const partial = await acceptCash(request, admin, {
      payerPersonId: anna,
      chargeIds: [olderKit.id, olderFee.id],
      amount: 10000,
      paidOn: today,
    })
    expect(partial.status, JSON.stringify(partial.body)).toBe(201)
    const firstReceipt = String(partial.body?.receiptNumber)
    expect(firstReceipt).toMatch(KP)
    expect(partial.body?.notified).toBe(true)
    expect(partial.body?.payments).toEqual([
      expect.objectContaining({
        chargeId: olderFee.id,
        amount: 10000,
        chargeStatus: 'partially_paid',
        remaining: 5000,
      }),
    ])
    expect((await getCharge(request, admin, olderFee.id)).status).toBe('partially_paid')
    expect((await getCharge(request, admin, olderKit.id)).status).toBe('open')

    // PLN 235 for the newer month's PLN 150 and PLN 85: both paid, one receipt, the next number.
    const full = await acceptCash(request, admin, {
      payerPersonId: anna,
      chargeIds: [newerFee.id, newerKit.id],
      amount: 23500,
      paidOn: today,
    })
    expect(full.status, JSON.stringify(full.body)).toBe(201)
    const secondReceipt = String(full.body?.receiptNumber)
    expect(secondReceipt).toMatch(KP)
    expect(Number(secondReceipt.slice(-3))).toBe(Number(firstReceipt.slice(-3)) + 1)
    expect(full.body?.payments?.map((line) => [line.chargeId, line.amount, line.chargeStatus])).toEqual([
      [newerFee.id, 15000, 'paid'],
      [newerKit.id, 8500, 'paid'],
    ])
    const stored = await withClient((client) =>
      client.query<{ receipt_number: string; collected_by_person_id: string; method: string }>(
        'select receipt_number, collected_by_person_id, method from payments_payments where charge_id = any($1::uuid[])',
        [[newerFee.id, newerKit.id]],
      ),
    )
    expect(stored.rows).toHaveLength(2)
    for (const row of stored.rows) {
      expect(row).toEqual({ receipt_number: secondReceipt, collected_by_person_id: club.adminPersonId, method: 'cash' })
    }

    // A paid charge takes no more cash.
    const paid = await acceptCash(request, admin, {
      payerPersonId: anna,
      chargeIds: [newerFee.id],
      amount: 100,
      paidOn: today,
    })
    expect(paid.status, JSON.stringify(paid.body)).toBe(409)
    expect(paid.body?.code).toBe('charge_already_paid')

    // One e-mail per receipt, to the payer.
    for (const receipt of [firstReceipt, secondReceipt]) {
      const [mail] = await awaitEmails(annaEmail, receipt)
      expect(mail?.text).toContain(receipt)
    }

    // Without the confirmation: no e-mail.
    const quiet = await acceptCash(request, admin, {
      payerPersonId: anna,
      chargeIds: [olderKit.id],
      amount: 500,
      paidOn: calendarDate(-1),
      notify: false,
    })
    expect(quiet.status, JSON.stringify(quiet.body)).toBe(201)
    expect(quiet.body?.notified).toBe(false)

    // "Received by me today": today's receipts and their total (yesterday's acceptance is not today's).
    const received = await cashToday(request, admin)
    expect(received.status, JSON.stringify(received.body)).toBe(200)
    expect(received.body?.items.map((item) => [item.receiptNumber, item.amount, item.payerPersonId])).toEqual([
      [firstReceipt, 10000, anna],
      [secondReceipt, 23500, anna],
    ])
    expect(received.body?.total).toBe(33500)
    expect(emailsTo(annaEmail, String(quiet.body?.receiptNumber))).toHaveLength(0)

    // A coach without `payments.cash.record` may neither list payers nor accept cash.
    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trener', role: 'coach' })
    expect((await cashPayers(request, coach.token)).status).toBe(403)
    const denied = await acceptCash(request, coach.token, {
      payerPersonId: anna,
      chargeIds: [olderKit.id],
      amount: 100,
      paidOn: today,
    })
    expect(denied.status).toBe(403)

    // B-21 in the browser: "Accept cash", the payer, her charges preselected with the sum, the toast with the receipt.
    page.setDefaultTimeout(30_000)
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/backend/payments/charges')
    await page.getByTestId('accept-cash-open').click()
    await page.getByTestId('cash-payer-search').fill('Dorosły')
    await expect(page.getByTestId('cash-payer-option')).toHaveCount(1, { timeout: 30_000 })
    await page.getByTestId('cash-payer-option').click()
    await expect(page.getByTestId('cash-charge')).toHaveCount(2)
    await expect(page.getByTestId('cash-amount')).toHaveValue('300')
    await page.getByTestId('cash-confirm').click()
    await expect(page.getByText(CASH_TOAST)).toBeVisible()
    await expect.poll(async () => (await getCharge(request, club.adminToken, janCharge.id)).status).toBe('paid')
    await expect(page.getByTestId('cash-today-item')).toHaveCount(3)

    // M-15 on a phone: the form and today's list fit 375 px.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/club/cash')
    await expect(page.getByTestId('cash-payer-step')).toBeVisible()
    await expect(page.getByTestId('cash-today-item')).toHaveCount(3)
    await expectNoPageOverflow(page)
  } finally {
    await club.cleanup()
  }
})
