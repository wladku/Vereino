import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'
import {
  bankDecide,
  bankImports,
  bankPayers,
  bankTransfers,
  chargeOf,
  createFee,
  generate,
  getCharge,
  importStatement,
  listCharges,
  periodFromNow,
  type BankTransferItem,
} from '../_fixtures/payments'

// TEST-042 (payments spec phase 4 step 7, REQ-030; issue #113 E07-S06; B-29): four families with two open charges
// of PLN 150 each. A CSV statement holds a transfer with the payer code covering both charges, one with a code and an
// overpayment, one without a code but with the ward's surname and the amount of one charge, a donation, "składka za
// listopad" from a stranger (the surname "Lis" must not match "listopad") and a debit. With auto-recording on: the
// first is recorded (both charges paid), the overpayment and the surname wait in To confirm, the donation and the
// stranger are unmatched, the debit is skipped; the same file again stores nothing. A CSV without the amount column
// answers 422 naming the required columns. Confirm, Assign, Skip, Restore and Undo work on the queue; Undo reopens the
// charges and returns the transfer to To confirm; a stale lock token answers 409; with auto-recording off a confident
// match waits too. The sender and title are encrypted at rest; a coach is refused; B-29 imports in the browser.
test.describe.configure({ timeout: 300_000 })

function byTitle(items: readonly BankTransferItem[], fragment: string): BankTransferItem {
  const found = items.find((item) => item.title.includes(fragment))
  if (!found) throw new Error(`no transfer titled "${fragment}" in ${JSON.stringify(items.map((item) => item.title))}`)
  return found
}

test('TEST-042 bank statement import, matching and the confirmation queue', async ({ page, request }) => {
  const club = await createClub(request, 'test-042')
  try {
    const admin = club.adminToken
    const since = calendarDate(-120)
    const today = calendarDate()
    const day = `${today.slice(8, 10)}.${today.slice(5, 7)}.${today.slice(0, 4)}`
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 5,
      validFrom: since,
    })
    const families: Record<string, { payer: string; ward: string }> = {}
    for (const [key, payerName, surname, wardName] of [
      ['lis', 'Anna', 'Lis', 'Ola'],
      ['nowak', 'Basia', 'Nowak', 'Kuba'],
      ['zajac', 'Celina', 'Zając', 'Tomek'],
      ['kot', 'Dorota', 'Kot', 'Ewa'],
    ] as const) {
      const payer = await createPerson(request, admin, {
        firstName: payerName,
        lastName: surname,
        birthDate: birthDateTurning(40),
      })
      const ward = await createPerson(request, admin, {
        firstName: wardName,
        lastName: surname,
        birthDate: birthDateTurning(10),
      })
      await createGuardianship(request, admin, {
        guardianPersonId: payer,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: since,
      })
      await addMembership(request, admin, { groupId: zaki, personId: ward, role: 'participant', validFrom: since })
      families[key] = { payer, ward }
    }
    const older = periodFromNow(-2)
    const newer = periodFromNow(-1)
    for (const period of [older, newer]) expect((await generate(request, admin, period)).status).toBe(200)
    const olderCharges = await listCharges(request, admin, `&period=${older}`)
    const newerCharges = await listCharges(request, admin, `&period=${newer}`)
    const chargesOf = (key: string) => [
      chargeOf(olderCharges, families[key].ward, fee),
      chargeOf(newerCharges, families[key].ward, fee),
    ]

    // The payer select of Assign lists every family with its code and open balance (codes assigned on this read).
    const payers = await bankPayers(request, admin)
    expect(payers.status, JSON.stringify(payers.body)).toBe(200)
    const codeOf = (key: string) => {
      const row = payers.body?.items.find((item) => item.payerPersonId === families[key].payer)
      expect(row?.totalDue).toBe(30000)
      return String(row?.payerCode)
    }
    const codes = { lis: codeOf('lis'), nowak: codeOf('nowak'), kot: codeOf('kot') }
    expect(codes.lis).toMatch(/^GW-[2-9A-HJ-NP-Z]{4}$/)

    // A CSV without the amount column: 422 naming the required columns; nothing is stored.
    const noAmount = await importStatement(request, admin, `Data;Nadawca;Tytuł\n${day};Anna Lis;${codes.lis}\n`)
    expect(noAmount.status, JSON.stringify(noAmount.body)).toBe(422)
    expect(noAmount.body).toMatchObject({ code: 'bank_statement_columns_missing', required: 'date, amount, title' })
    expect(noAmount.body?.missing).toBe('amount')
    expect(noAmount.body?.error).toContain('date, amount, title')

    const statement = [
      'Rachunek 61 1090 1014 0000 0712 1981 2874;;;;',
      'Data;Kwota;Nadawca;Tytuł;Rachunek',
      `${day};150,00;Jan Kowalski;Składka za listopad;PL11222233334444555566667777`,
      `${day};300,00;Anna Lis;${codes.lis} składka;PL21222233334444555566667777`,
      `${day};350,00;Basia Nowak;${codes.nowak} składka i więcej;PL31222233334444555566667777`,
      `${day};150,00;Celina Zając;Składka Tomek;PL41222233334444555566667777`,
      `${day};500,00;Firma XYZ;Darowizna na klub;PL51222233334444555566667777`,
      `${day};-20,00;Sklep sportowy;Piłki;PL61222233334444555566667777`,
    ].join('\r\n')
    const imported = await importStatement(request, admin, statement)
    expect(imported.status, JSON.stringify(imported.body)).toBe(201)
    expect(imported.body).toMatchObject({
      format: 'csv',
      total: 6,
      booked: 1,
      suggested: 2,
      unmatched: 2,
      skipped: 1,
      debits: 1,
      duplicates: 0,
    })

    let list = await bankTransfers(request, admin)
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    expect(list.body?.counts).toEqual({ suggested: 2, unmatched: 2, booked: 1, ignored: 0, all: 5 })
    const items = list.body?.items ?? []
    const lis = byTitle(items, codes.lis)
    expect(lis).toMatchObject({
      status: 'booked',
      payerPersonId: families.lis.payer,
      payerCode: codes.lis,
      matchReason: 'code_exact',
      autoBooked: true,
    })
    expect(lis.allocation.map((line) => [line.chargeId, line.amount])).toEqual(
      chargesOf('lis').map((charge) => [charge.id, 15000]),
    )
    for (const charge of chargesOf('lis')) expect((await getCharge(request, admin, charge.id)).status).toBe('paid')
    const nowak = byTitle(items, codes.nowak)
    expect(nowak).toMatchObject({ status: 'suggested', matchReason: 'code_overpayment', unallocated: 5000 })
    const zajac = byTitle(items, 'Składka Tomek')
    expect(zajac).toMatchObject({
      status: 'suggested',
      payerPersonId: families.zajac.payer,
      matchReason: 'surname_amount',
    })
    const stranger = byTitle(items, 'listopad')
    expect(stranger).toMatchObject({ status: 'unmatched', payerPersonId: null, matchReason: 'no_match' })
    const donation = byTitle(items, 'Darowizna')
    expect(donation).toMatchObject({ status: 'unmatched', matchReason: 'no_match' })
    expect(items.some((item) => item.title === 'Piłki')).toBe(false)

    // The same statement again stores nothing.
    const again = await importStatement(request, admin, statement)
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    expect(again.body).toMatchObject({ total: 6, booked: 0, suggested: 0, unmatched: 0, skipped: 6, duplicates: 5 })
    expect((await bankTransfers(request, admin)).body?.counts.all).toBe(5)

    // A stale lock token: the transfer was changed by someone else meanwhile (Assign) → 409.
    const assigned = await bankDecide(request, admin, zajac.id, 'assign', zajac.updatedAt, {
      payerPersonId: families.zajac.payer,
    })
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200)
    expect(assigned.body?.status).toBe('booked')
    const stale = await bankDecide(request, admin, zajac.id, 'confirm', zajac.updatedAt)
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    expect((await getCharge(request, admin, chargesOf('zajac')[0].id)).status).toBe('paid')
    expect((await getCharge(request, admin, chargesOf('zajac')[1].id)).status).toBe('open')

    // Confirm the overpayment: both charges paid, the rest stays unallocated.
    const confirmed = await bankDecide(request, admin, nowak.id, 'confirm', nowak.updatedAt)
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
    expect(confirmed.body?.payments?.map((line) => line.amount)).toEqual([15000, 15000])
    for (const charge of chargesOf('nowak')) expect((await getCharge(request, admin, charge.id)).status).toBe('paid')

    // Confirm only from To confirm; Assign only to a payer with something to pay.
    const notSuggested = await bankDecide(request, admin, stranger.id, 'confirm', stranger.updatedAt)
    expect(notSuggested.status, JSON.stringify(notSuggested.body)).toBe(409)
    expect(notSuggested.body?.code).toBe('bank_transaction_status_changed')
    const nothingDue = await bankDecide(request, admin, stranger.id, 'assign', stranger.updatedAt, {
      payerPersonId: families.nowak.payer,
    })
    expect(nothingDue.status, JSON.stringify(nothingDue.body)).toBe(422)
    expect(nothingDue.body?.code).toBe('bank_payer_no_open_charges')

    // Skip the donation, then Restore it to Unmatched.
    const skipped = await bankDecide(request, admin, donation.id, 'ignore', donation.updatedAt, { reason: 'donation' })
    expect(skipped.status, JSON.stringify(skipped.body)).toBe(200)
    expect(skipped.body?.status).toBe('ignored')
    const restored = await bankDecide(request, admin, donation.id, 'restore', skipped.body?.updatedAt)
    expect(restored.status, JSON.stringify(restored.body)).toBe(200)
    expect(restored.body?.status).toBe('unmatched')

    // Undo the recorded transfer: the payments are reversed, the charges reopen, it is back in To confirm.
    const undone = await bankDecide(request, admin, lis.id, 'undo', lis.updatedAt)
    expect(undone.status, JSON.stringify(undone.body)).toBe(200)
    expect(undone.body?.status).toBe('suggested')
    expect(undone.body?.payments?.map((line) => line.amount)).toEqual([-15000, -15000])
    for (const charge of chargesOf('lis')) expect((await getCharge(request, admin, charge.id)).status).toBe('open')
    list = await bankTransfers(request, admin, '&status=suggested')
    expect(list.body?.items.map((item) => item.id)).toEqual([lis.id])
    expect(list.body?.counts).toEqual({ suggested: 1, unmatched: 2, booked: 2, ignored: 0, all: 5 })
    const reconfirmed = await bankDecide(request, admin, lis.id, 'confirm', undone.body?.updatedAt)
    expect(reconfirmed.status, JSON.stringify(reconfirmed.body)).toBe(200)
    for (const charge of chargesOf('lis')) expect((await getCharge(request, admin, charge.id)).status).toBe('paid')

    // With auto-recording off, a confident match waits in To confirm.
    const settings = await call<{ updatedAt?: string | null }>(request, 'GET', '/api/payments/settings', admin)
    const lock = settings.body?.updatedAt
    const off = await call(request, 'PUT', '/api/payments/settings', admin, {
      data: { autoBookBankMatches: false },
      headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {},
    })
    expect(off.status, JSON.stringify(off.body)).toBe(200)
    const manual = await importStatement(
      request,
      admin,
      `Data;Kwota;Nadawca;Tytuł\n${today};300,00;Dorota Kot;${codes.kot.toLowerCase()} składka\n`,
    )
    expect(manual.status, JSON.stringify(manual.body)).toBe(201)
    expect(manual.body).toMatchObject({ total: 1, booked: 0, suggested: 1 })
    const kot = byTitle((await bankTransfers(request, admin, '&status=suggested')).body?.items ?? [], 'składka')
    expect(kot).toMatchObject({ payerPersonId: families.kot.payer, matchReason: 'code_exact', autoBooked: false })
    for (const charge of chargesOf('kot')) expect((await getCharge(request, admin, charge.id)).status).toBe('open')

    // The history lists the three imports; the sender and the title are encrypted at rest.
    const history = await bankImports(request, admin)
    expect(history.body?.total).toBe(3)
    const stored = await withClient((client) =>
      client.query<{ counterparty_name: string; counterparty_account: string; title: string }>(
        'select counterparty_name, counterparty_account, title from payments_bank_transactions where id = $1',
        [lis.id],
      ),
    )
    expect(stored.rows[0].counterparty_name).not.toContain('Anna Lis')
    expect(stored.rows[0].counterparty_account).not.toContain('21222233334444555566667777')
    expect(stored.rows[0].title).not.toContain(codes.lis)

    // A coach has no `payments.bank.import`.
    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trener', role: 'coach' })
    expect((await bankTransfers(request, coach.token)).status).toBe(403)
    expect((await importStatement(request, coach.token, statement)).status).toBe(403)

    // B-29 in the browser: the queue with its counts, then an import with its summary.
    page.setDefaultTimeout(30_000)
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/backend/payments/bank')
    await expect(page.getByRole('tab', { name: /To confirm\s*\(1\)|Do potwierdzenia\s*\(1\)/ })).toBeVisible()
    await expect(page.getByTestId('bank-transfer-payer')).toContainText(codes.kot)
    await page.getByTestId('bank-import-file').setInputFiles({
      name: 'wyciag.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`Data;Kwota;Nadawca;Tytuł\n${today};75,00;Ktoś;Wpłata bez kodu\n`, 'utf-8'),
    })
    await page.getByTestId('bank-import-submit').click()
    await expect(page.getByTestId('bank-import-summary')).toContainText(/1 transfers|Przelewy: 1/)
    await expect(page.getByTestId('bank-history').locator('li')).toHaveCount(4)
  } finally {
    await club.cleanup()
  }
})
