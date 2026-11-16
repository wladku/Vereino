import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow } from '../_fixtures/axe'
import { actionLogs, birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { uniqueAddress } from '../_fixtures/messaging'
import { createGuardianship } from '../_fixtures/people'
import {
  acceptCash,
  bankPayers,
  cashPayers,
  cashToday,
  chargeOf,
  createFee,
  generate,
  getCharge,
  importStatement,
  listCharges,
  periodFromNow,
} from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-C04 and the B-21 part of TEST-C03 (payments parity spec phase 2, REQ-C02, REQ-C03; issue #292): two families,
// each a guardian paying for a child with a PLN 150 fee in two months.
// - `GET /api/payments/charges` without a sort lists the newest period first (Contract 3); a client's sort still wins.
// - `GET /api/payments/cash/payers?personId=` answers that payer for the preselection, or nothing for a non-payer.
// - `POST /api/payments/cash` refuses an unknown `origin` (400); two saves of the same charge at once: one receipt,
//   the other 409 or 422 from the row lock.
// - B-21 restores the perspective and the period filter from its URL after a reload and keeps them on a tab change,
//   lists the perspectives in the mockup's order, links to B-29 and reads "—" in Remaining of a paid charge.
// - A transfer booked from an imported statement reads "bank statement" as its receiver on B-22.
// - B-22: "Accept cash" opens with the payer chosen and the focus on the amount, Ctrl+Enter saves one KP receipt,
//   the record refreshes and the audit context carries `origin = charge`; under 640 px the dialog fills the screen.
// - B-29: "Accept cash" in the head issues one receipt with `origin = bank`.
test.describe.configure({ timeout: 300_000 })

const KP = /^KP\/\d{4}\/\d{2}\/\d{3}$/
const PERSPECTIVES = ['fees', 'overdue', 'orders', 'payer_missing', 'rentals', 'cash', 'all'] as const

test('TEST-C04 accept cash from B-21, B-22 and B-29; B-21 keeps its URL state and sorts by period', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-c04')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const older = periodFromNow(-2)
    const newer = periodFromNow(-1)
    const since = calendarDate(-120)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const family = async (lastName: string, guardianName: string, wardName: string) => {
      const guardian = await createPerson(request, admin, {
        firstName: guardianName,
        lastName,
        birthDate: birthDateTurning(40),
        email: uniqueAddress(`c04-${guardianName.toLowerCase()}`),
      })
      const ward = await createPerson(request, admin, {
        firstName: wardName,
        lastName,
        birthDate: birthDateTurning(10),
      })
      await createGuardianship(request, admin, {
        guardianPersonId: guardian,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: since,
      })
      await addMembership(request, admin, { groupId: zaki, personId: ward, role: 'participant', validFrom: since })
      return { guardian, ward }
    }
    const cash = await family('Kasowa', 'Anna', 'Ola')
    const bank = await family('Przelewska', 'Ewa', 'Tomek')
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 5,
      validFrom: since,
    })
    for (const period of [older, newer]) expect((await generate(request, admin, period)).status).toBe(200)
    const olderCharges = await listCharges(request, admin, `&period=${older}`)
    const newerCharges = await listCharges(request, admin, `&period=${newer}`)
    const annaOlder = chargeOf(olderCharges, cash.ward, fee)
    const annaNewer = chargeOf(newerCharges, cash.ward, fee)
    const ewaOlder = chargeOf(olderCharges, bank.ward, fee)
    const ewaNewer = chargeOf(newerCharges, bank.ward, fee)

    // Contract 3: without a sort the newest period comes first; a client may still sort by the due date.
    const byDefault = await listCharges(request, admin, '&sourceType=fee')
    expect(byDefault.map((charge) => charge.periodLabel)).toEqual([newer, newer, older, older])
    const byDueDate = await listCharges(request, admin, '&sourceType=fee&sortField=dueDate&sortDir=asc')
    expect(byDueDate.map((charge) => charge.periodLabel)).toEqual([older, older, newer, newer])

    // The preselection read: the payer with what they owe; a ward pays nothing, so nobody is answered.
    const preset = await cashPayers(request, admin, `?personId=${cash.guardian}`)
    expect(preset.status, JSON.stringify(preset.body)).toBe(200)
    expect(preset.body?.items).toEqual([
      expect.objectContaining({ payerPersonId: cash.guardian, totalDue: 30000, chargeCount: 2 }),
    ])
    expect((await cashPayers(request, admin, `?personId=${cash.ward}`)).body?.items).toEqual([])

    // An unknown origin is refused before anything is written.
    const badOrigin = await acceptCash(request, admin, {
      payerPersonId: cash.guardian,
      chargeIds: [annaOlder.id],
      amount: 15000,
      paidOn: today,
      origin: 'somewhere',
    })
    expect(badOrigin.status, JSON.stringify(badOrigin.body)).toBe(400)

    // B-21 before any payment: the URL restores the perspective and the period after a reload; a tab change keeps
    // the period and replaces the URL; the perspectives come in the mockup's order; "Import statement" opens B-29.
    page.setDefaultTimeout(30_000)
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    const token = club.adminToken
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`/backend/payments/charges?perspective=overdue&period=${older}`)
    await page.reload()
    const overdueTab = page.getByRole('tab', { name: uiText('payments.charges.perspectives.overdue', { exact: true }) })
    await expect(overdueTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('charge-open')).toHaveCount(2)
    const tabs = await page.getByRole('tab').allTextContents()
    const expected = PERSPECTIVES.filter(
      (key) => key !== 'rentals' || tabs.some((text) => uiText('payments.charges.perspectives.rentals').test(text)),
    )
    expect(tabs).toHaveLength(expected.length)
    expected.forEach((key, index) => {
      expect(tabs[index]).toMatch(uiText(`payments.charges.perspectives.${key}`, { exact: true }))
    })
    await page.getByRole('tab', { name: uiText('payments.charges.perspectives.all', { exact: true }) }).click()
    await expect(page).toHaveURL(/perspective=all/)
    expect(new URL(page.url()).searchParams.get('period')).toBe(older)
    await page.getByTestId('charges-import-statement').click()
    await expect(page).toHaveURL(/\/backend\/payments\/bank$/)

    // Two saves of the same charge at once: the row lock lets one through; the other answers 409 or 422.
    const twice = await Promise.all(
      [0, 1].map(() =>
        acceptCash(request, token, {
          payerPersonId: cash.guardian,
          chargeIds: [annaOlder.id],
          amount: 15000,
          paidOn: today,
          notify: false,
          origin: 'charges',
        }),
      ),
    )
    expect(twice.map((result) => result.status).sort()).toEqual([201, expect.any(Number)])
    const refused = twice.find((result) => result.status !== 201)
    expect([409, 422], JSON.stringify(refused?.body)).toContain(refused?.status)
    expect((await getCharge(request, token, annaOlder.id)).status).toBe('paid')

    // A transfer with Ewa's payer code books her older charge from the statement.
    const codes = await bankPayers(request, token)
    const ewaCode = String(codes.body?.items.find((item) => item.payerPersonId === bank.guardian)?.payerCode)
    const imported = await importStatement(
      request,
      token,
      ['Data;Kwota;Nadawca;Tytuł', `${today};150,00;Ewa Przelewska;${ewaCode} składka`].join('\r\n'),
    )
    expect(imported.status, JSON.stringify(imported.body)).toBe(201)
    expect(imported.body?.booked).toBe(1)
    const booked = await getCharge(request, token, ewaOlder.id)
    expect(booked.status).toBe('paid')
    expect(booked.payments.map((payment) => payment.source)).toEqual(['bank_statement'])

    // B-21: a paid charge reads "—" in Remaining.
    await page.goto(`/backend/payments/charges?perspective=all&period=${older}`)
    await expect(page.getByTestId('charge-open')).toHaveCount(2)
    for (const row of await page
      .getByRole('row')
      .filter({ has: page.getByTestId('charge-open') })
      .all()) {
      await expect(row).toContainText('—')
    }

    // B-22 of the booked transfer: the receiver is the bank statement.
    await page.goto(`/backend/payments/charges/${ewaOlder.id}`)
    await expect(page.getByTestId('charge-payment-received-by')).toHaveText(
      uiText('payments.ledger.payments.bankStatement', { exact: true }),
    )
    await expect(page.getByTestId('accept-cash-open')).toHaveCount(0)

    // B-22 of Anna's open charge: the payer is chosen, the focus is on the amount, Ctrl+Enter saves one receipt and
    // the record refreshes; on a phone the dialog fills the screen.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/backend/payments/charges/${annaNewer.id}`)
    await page.getByTestId('accept-cash-open').click()
    await expect(page.getByTestId('cash-payer-selected')).toHaveText('Anna Kasowa')
    await expect(page.getByTestId('cash-amount')).toBeFocused()
    await expect(page.getByTestId('cash-amount')).toHaveValue('150')
    await expect
      .poll(async () => await page.getByTestId('accept-cash-dialog').boundingBox())
      .toMatchObject({ x: 0, y: 0, width: 375, height: 812 })
    await page.keyboard.press('Control+Enter')
    await expect(page.getByTestId('accept-cash-dialog')).toHaveCount(0)
    await expect(page.getByTestId('charge-status')).toHaveText(uiText('payments.charges.status.paid', { exact: true }))
    await expect(page.getByTestId('accept-cash-open')).toHaveCount(0)
    const annaPaid = await getCharge(request, token, annaNewer.id)
    expect(annaPaid.payments.map((payment) => payment.source)).toEqual(['cash'])
    const chargeLogs = await actionLogs(request, token, annaPaid.payments[0].id)
    expect(chargeLogs.find((log) => log.commandId === 'payments.cash.record')?.context).toMatchObject({
      origin: 'charge',
    })
    await expectNoPageOverflow(page)

    // B-29: "Accept cash" in the head; one receipt with `origin = bank`.
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/backend/payments/bank')
    await page.getByTestId('accept-cash-open').click()
    await expect(page.getByTestId('cash-payer-search')).toBeFocused()
    await page.getByTestId('cash-payer-search').fill('Przelewska')
    await expect(page.getByTestId('cash-payer-option')).toHaveCount(1, { timeout: 30_000 })
    await page.getByTestId('cash-payer-option').click()
    await expect(page.getByTestId('cash-amount')).toHaveValue('150')
    await page.getByTestId('cash-confirm').click()
    await expect(page.getByTestId('cash-payer-step')).toBeVisible()
    await expect.poll(async () => (await getCharge(request, token, ewaNewer.id)).status).toBe('paid')
    const ewaPaid = await getCharge(request, token, ewaNewer.id)
    expect(ewaPaid.payments.map((payment) => payment.source)).toEqual(['cash'])
    const bankLogs = await actionLogs(request, token, ewaPaid.payments[0].id)
    expect(bankLogs.find((log) => log.commandId === 'payments.cash.record')?.context).toMatchObject({ origin: 'bank' })

    // One numbered receipt per acceptance: the concurrent save, B-22 and B-29.
    const received = await cashToday(request, token)
    expect(received.body?.items.map((item) => item.receiptNumber)).toEqual([
      expect.stringMatching(KP),
      expect.stringMatching(KP),
      expect.stringMatching(KP),
    ])
  } finally {
    await club.cleanup()
  }
})
