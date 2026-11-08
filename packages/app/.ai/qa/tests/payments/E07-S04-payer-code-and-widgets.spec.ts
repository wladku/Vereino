import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  birthDateTurning,
  calendarDate,
  createAccount,
  createClub,
  createPerson,
  createStaff,
  signInAs,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { setUserFeatures, updateClubSettings } from '../_fixtures/members'
import { createGuardianship } from '../_fixtures/people'
import {
  createFee,
  generate,
  getCharge,
  listCharges,
  myCharges,
  myPaymentsSummary,
  paymentsDashboard,
  periodFromNow,
  recordPayment,
  type ChargeItem,
} from '../_fixtures/payments'

// E07-S04 (issue #111; payments spec phase 4 step 5, REQ-012, REQ-030, TEST-021; README M-02, M-08, B-01):
// - the club's bank account is a club setting (an NRB; anything else answers 422 `bank_account_invalid`);
// - two families owe last month's fee: the administrator's "Overdue" widget shows the remaining total and 2 families,
//   "Charges without a payer" the ward whose guardian is not the primary payer, and both open B-21 in that perspective;
// - Kasia owes 349 zł: the Today tile shows the amount and the nearest due date, M-08 lists the charge with its period
//   and the transfer instructions — the club's account and her permanent payer code `GW-XXXX` (another family has
//   another code); once everything is paid, the tile and M-08 say "Everything is paid" and M-08 lists the history;
// - a 14-year-old with an account (the club allows accounts from 13) sees no tile and no tab, and the payer routes
//   answer 403 `payments_minor`.
test.describe.configure({ timeout: 300_000 })

const EVERYTHING_PAID = /Everything is paid|Wszystko opłacone/
const PAYMENTS_TAB = /^(Payments|Płatności)$/
const ACCOUNT = '61109010140000071219812874'
const ACCOUNT_PRINTED = '61 1090 1014 0000 0712 1981 2874'
const FEE = 34900

test('E07-S04 Today tile, M-08 payer code and transfer instructions, B-01 overdue widgets, a minor sees none', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e07-s04')
  try {
    let admin = club.adminToken
    const invalid = await updateClubSettings(request, admin, { bankAccount: '12 3456' })
    expect(invalid.status, JSON.stringify(invalid.body)).toBe(422)
    expect(invalid.body?.code).toBe('bank_account_invalid')
    const saved = await updateClubSettings(request, admin, { ownAccountMinAge: 13, bankAccount: `PL${ACCOUNT}` })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body).toMatchObject({ bankAccount: ACCOUNT })

    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Nowak',
      birthDate: birthDateTurning(38),
    })
    const basia = await createStaff(request, club, {
      firstName: 'Basia',
      lastName: 'Lis',
      birthDate: birthDateTurning(41),
    })
    const ward = async (firstName: string, lastName: string, age: number) => {
      const id = await createPerson(request, admin, { firstName, lastName, birthDate: birthDateTurning(age) })
      await addMembership(request, admin, {
        groupId: zaki,
        personId: id,
        role: 'participant',
        validFrom: calendarDate(-62),
      })
      return id
    }
    const ola = await ward('Ola', 'Nowak', 10)
    await ward('Tomek', 'Nowak', 9)
    const zuzia = await ward('Zuzia', 'Lis', 14)
    const guardian = (guardianPersonId: string, wardPersonId: string, isPrimaryPayer: boolean) =>
      createGuardianship(request, admin, {
        guardianPersonId,
        wardPersonId,
        relation: 'parent',
        isPrimaryPayer,
        validFrom: calendarDate(-62),
      })
    await guardian(kasia.personId, ola, true)
    await guardian(basia.personId, zuzia, true)
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: FEE,
      dueDay: 10,
      validFrom: calendarDate(-62),
    })

    // Last month: Ola's and Zuzia's charges are overdue (two families); Tomek, who has no guardian yet, has no payer.
    const lastMonth = periodFromNow(-1)
    expect((await generate(request, admin, lastMonth)).body).toMatchObject({ created: 3, payerMissing: 1 })
    const dashboard = await paymentsDashboard(request, admin)
    expect(dashboard.status, JSON.stringify(dashboard.body)).toBe(200)
    expect(dashboard.body).toEqual({
      overdue: { total: 3 * FEE, charges: 3, families: 2 },
      withoutPayer: { charges: 1 },
    })
    let kasiaToken = await signInAs(request, club, kasia.userId, kasia.email)
    const forbidden = await paymentsDashboard(request, kasiaToken)
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403)

    await page.setViewportSize({ width: 375, height: 812 })
    // Signing in through the browser ends the user's API tokens: take a fresh one (lesson
    // `sign-in-browser-ends-the-api-token`).
    admin = await getAuthToken(
      request,
      club.tenant.email,
      await signInBrowser(page, request, club, club.adminUserId, club.tenant.email),
    )
    await page.goto('/backend')
    const overdueWidget = page.getByTestId('payments-widget-overdue')
    await expect(overdueWidget.getByTestId('payments-widget-overdue-total')).toHaveText('1 047 zł')
    await expect(overdueWidget.getByTestId('payments-widget-overdue-families')).toContainText('2')
    const withoutPayerWidget = page.getByTestId('payments-widget-withoutPayer')
    await expect(withoutPayerWidget.getByTestId('payments-widget-withoutPayer-count')).toHaveText('1')
    await overdueWidget.getByRole('link', { name: /^(Open list|Otwórz listę)$/ }).click()
    await expect(page).toHaveURL(/\/backend\/payments\/charges\?perspective=overdue$/)
    await expect(page.getByRole('tab', { selected: true })).toHaveText(/Overdue|Zaległe|Po terminie/)

    // The administrator records last month's fee for Ola; this month's charges are issued.
    const chargeOf = (charges: readonly ChargeItem[], personId: string) => {
      const found = charges.find((charge) => charge.personId === personId && charge.sourceId === fee)
      expect(found, personId).toBeTruthy()
      return found as ChargeItem
    }
    const olaLast = chargeOf(await listCharges(request, admin, `&period=${lastMonth}`), ola)
    const payLast = await recordPayment(
      request,
      admin,
      olaLast.id,
      (await getCharge(request, admin, olaLast.id)).updatedAt,
      {
        amount: FEE,
        method: 'transfer',
        paidOn: calendarDate(),
      },
    )
    expect(payLast.status, JSON.stringify(payLast.body)).toBe(201)
    const thisMonth = periodFromNow(0)
    expect((await generate(request, admin, thisMonth)).body).toMatchObject({ created: 3 })
    const olaNow = chargeOf(await listCharges(request, admin, `&period=${thisMonth}`), ola)

    // Kasia owes 349 zł, due on this month's due date.
    const summary = await myPaymentsSummary(request, kasiaToken)
    expect(summary.status, JSON.stringify(summary.body)).toBe(200)
    expect(summary.body).toMatchObject({ state: 'due', openTotal: FEE, openCount: 1, nearestDueDate: olaNow.dueDate })
    const mine = await myCharges(request, kasiaToken)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    const code = String(mine.body?.transfer?.payerCode)
    expect(code).toMatch(/^GW-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/)
    expect(mine.body?.transfer).toMatchObject({ bankAccount: ACCOUNT })
    expect(mine.body?.history?.map((item) => item.id)).toEqual([olaLast.id])
    // The code is permanent, and another family has another one.
    expect((await myCharges(request, kasiaToken)).body?.transfer?.payerCode).toBe(code)
    const basiaToken = await signInAs(request, club, basia.userId, basia.email)
    const basiaCode = (await myCharges(request, basiaToken)).body?.transfer?.payerCode
    expect(basiaCode).toMatch(/^GW-/)
    expect(basiaCode).not.toBe(code)

    kasiaToken = await getAuthToken(
      request,
      kasia.email,
      await signInBrowser(page, request, club, kasia.userId, kasia.email),
    )
    await page.goto('/club')
    const tile = page.getByTestId('club-tile-payments')
    await expect(tile.getByTestId('club-tile-payments-amount')).toHaveText('349 zł')
    const [, month, day] = String(olaNow.dueDate).split('-')
    await expect(tile.getByTestId('club-tile-payments-due')).toContainText(String(Number(day)))
    await expect(tile.getByTestId('club-tile-payments-due')).toContainText(String(Number(month)))
    await tile.click()
    await expect(page).toHaveURL(/\/club\/payments$/)
    const transfer = page.getByTestId('club-payments-transfer')
    await expect(transfer.getByTestId('club-payments-transfer-account')).toHaveText(ACCOUNT_PRINTED)
    await expect(transfer.getByTestId('club-payments-transfer-code')).toHaveText(code)
    await expect(page.getByTestId('club-charge')).toHaveCount(1)
    await expect(page.locator(`[data-charge-id="${olaNow.id}"]`)).toContainText(thisMonth)
    await expect(page.getByTestId('club-charge-paid')).toHaveCount(1)

    // Everything paid: the tile and M-08 say so, and M-08 lists the history.
    const payNow = await recordPayment(
      request,
      admin,
      olaNow.id,
      (await getCharge(request, admin, olaNow.id)).updatedAt,
      {
        amount: FEE,
        method: 'cash',
        paidOn: calendarDate(),
      },
    )
    expect(payNow.status, JSON.stringify(payNow.body)).toBe(201)
    expect((await myPaymentsSummary(request, kasiaToken)).body).toEqual({ state: 'paid' })
    await page.goto('/club/payments')
    await expect(page.getByTestId('club-payments-empty')).toHaveText(EVERYTHING_PAID)
    await expect(page.getByTestId('club-charge-paid')).toHaveCount(2)
    await expect(page.getByTestId('club-payments-transfer-code')).toHaveText(code)
    await page.goto('/club')
    await expect(page.getByTestId('club-tile-payments-state')).toHaveText(EVERYTHING_PAID)

    // A 14-year-old with an account: no tile, no tab, and 403 `payments_minor`, even with the features granted.
    const zuziaEmail = `zuzia-${Date.now().toString(36)}@example.org`
    const account = await createAccount(request, admin, zuzia, zuziaEmail)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    const zuziaUserId = String(account.body?.userId)
    club.extraUserIds.push(zuziaUserId)
    await setUserFeatures(request, club, zuziaUserId, ['people.self', 'payments.view_own'])
    const zuziaToken = await signInAs(request, club, zuziaUserId, zuziaEmail)
    for (const result of [await myPaymentsSummary(request, zuziaToken), await myCharges(request, zuziaToken)]) {
      expect(result.status, JSON.stringify(result.body)).toBe(403)
      expect(result.body?.code).toBe('payments_minor')
    }
    await signInBrowser(page, request, club, zuziaUserId, zuziaEmail)
    await page.goto('/club')
    await expect(page.getByTestId('club-tile-profile')).toBeVisible()
    await expect(page.getByTestId('club-tile-payments')).toHaveCount(0)
    await expect(page.getByTestId('club-bottom-bar').getByRole('link', { name: PAYMENTS_TAB })).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
